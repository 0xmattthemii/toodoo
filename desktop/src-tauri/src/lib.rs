use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

/// Optional compile-time pin. When TOODOO_APP_URL is set at build time the
/// shell wraps that one deployment only: no server picker, and
/// `toodoo://connect` links are ignored. Unset — the default, and what the
/// upstream release builds ship — means the user picks the server on first
/// launch. An empty value counts as unset so CI can pass the variable through
/// unconditionally.
const PINNED_APP_URL: Option<&str> = option_env!("TOODOO_APP_URL");

fn pinned_app_url() -> Option<&'static str> {
    PINNED_APP_URL.map(str::trim).filter(|url| !url.is_empty())
}

/// The bundled connect page (desktop/ui), shown until a server is chosen.
const CONNECT_PAGE: &str = "index.html";
/// Served by every toodoo deployment; used to check an address really is one.
const MANIFEST_PATH: &str = "/api/desktop/manifest";
/// Where the chosen server is remembered, inside the app's config directory.
const SERVER_FILE: &str = "server.json";
/// The `toodoo://connect` deep-link host is reserved for the server picker.
const CONNECT_HOST: &str = "connect";
/// Fallback sign-in providers the web app may redirect to *inside* the
/// window. Current web app versions send Google sign-in to the user's own
/// browser instead (see `start_external_sign_in`) — Google refuses OAuth in
/// embedded webviews, and the browser carries the user's Google session,
/// passkeys and any federated IdP. This stays for deployments running a web
/// app older than that flow, and for the account-linking path it can't carry;
/// those must render here so the callback lands in this webview's cookie jar.
/// Kept to Google's own account pages; anything else stays out of the shell.
const SIGN_IN_ORIGINS: &[&str] = &["https://accounts.google.com", "https://accounts.youtube.com"];
/// The `toodoo://sign-in` deep-link host is reserved for the browser sign-in.
const SIGN_IN_HOST: &str = "sign-in";
/// Where the browser flow starts, claims and lands (src/lib/desktop-auth.ts).
const SIGN_IN_START_PATH: &str = "/api/desktop/auth/start";
const SIGN_IN_CLAIM_PATH: &str = "/api/desktop/auth/claim";
const SIGN_IN_FINISH_PATH: &str = "/api/desktop/auth/finish";
/// Error the web app's login page explains when a handoff doesn't arrive
/// (OAUTH_ERROR_MESSAGES in src/app/(auth)/social-auth.tsx).
const SIGN_IN_ERROR: &str = "desktop_handoff_failed";
/// How long a started sign-in stays claimable: long enough to hunt for a
/// password, short enough that an abandoned verifier doesn't sit there.
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(10 * 60);
/// Where the Safari that ships the system's WebKit — the engine this window
/// runs — records its version.
#[cfg(target_os = "macos")]
const SAFARI_INFO_PLIST: &str = "/Applications/Safari.app/Contents/Info.plist";
/// Only used when that file can't be read; it will age, the read won't.
#[cfg(target_os = "macos")]
const FALLBACK_SAFARI_VERSION: &str = "26.0";
#[cfg(target_os = "macos")]
const SWITCH_SERVER_MENU_ID: &str = "switch-server";
/// macOS draws the title bar as a transparent overlay: the page runs up to
/// the top edge of the window (so the sidebar keeps its colour and border
/// all the way up) and the traffic lights float over the app's own header
/// row. That row is 56px tall (h-14 in the web app). The position is the
/// top-left of the close button's 16pt-tall frame, so y = 20 centres the
/// lights in the row; x = 16 matches the sidebar's horizontal padding. The
/// web app leaves the left 80px of the row free for them and marks its
/// header rows as drag regions (`data-tauri-drag-region`), since the
/// transparent strip isn't draggable by itself — see capabilities/remote.json.
#[cfg(target_os = "macos")]
const TRAFFIC_LIGHT_POSITION: tauri::LogicalPosition<f64> =
    tauri::LogicalPosition { x: 16.0, y: 20.0 };

/// Which deployment the main window wraps.
struct ServerState {
    /// Origin (path `/`) of the connected deployment, if any.
    current: RwLock<Option<Url>>,
    /// Address to prefill on the connect page, from a `toodoo://connect` link.
    suggested: RwLock<Option<String>>,
}

#[derive(Serialize, Deserialize)]
struct SavedServer {
    url: String,
}

/// A sign-in the user is finishing in their browser.
struct PendingSignIn {
    /// Random secret; only its SHA-256 went to the browser, so only this
    /// process can claim the session the browser ends up with.
    verifier: String,
    /// The server the flow was started against.
    origin: Url,
    started: Instant,
}

/// The one sign-in in flight, if any. A second one replaces it.
#[derive(Default)]
struct SignInState {
    pending: RwLock<Option<PendingSignIn>>,
}

/// Where a `toodoo://` link came from. Starting a browser sign-in is only
/// honoured from inside the window: the scheme is OS-wide and shared by every
/// build, so any app or web page can fire one, and none of them should be
/// able to pop a browser window open.
#[derive(Clone, Copy, PartialEq)]
enum LinkSource {
    /// Navigated to by a page in the app's own window.
    Window,
    /// Handed over by the OS: another app, the browser, a second launch.
    System,
}

fn server_file(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(SERVER_FILE))
}

fn load_saved_server(app: &AppHandle) -> Option<Url> {
    let raw = fs::read_to_string(server_file(app)?).ok()?;
    let saved: SavedServer = serde_json::from_str(&raw).ok()?;
    normalize_server_url(&saved.url).ok()
}

fn save_server(app: &AppHandle, url: &Url) -> Result<(), String> {
    let path = server_file(app).ok_or("Could not find the app's configuration folder.")?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    }
    let saved = SavedServer {
        url: url.to_string(),
    };
    fs::write(&path, serde_json::to_string_pretty(&saved).expect("serializable"))
        .map_err(|e| format!("Could not save the server address to {}: {e}", path.display()))
}

/// Turn what the user typed into a server origin: adds `https://` when the
/// scheme is missing, drops any path/query (people paste page URLs), and
/// requires https — plain http only for localhost, for development.
fn normalize_server_url(input: &str) -> Result<Url, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Enter the address of your toodoo.".into());
    }
    let invalid = || format!("“{trimmed}” is not a valid address.");
    let with_scheme = if trimmed.contains("://") {
        trimmed.to_owned()
    } else {
        format!("https://{trimmed}")
    };
    let url = Url::parse(&with_scheme).map_err(|_| invalid())?;
    let host = url.host_str().filter(|h| !h.is_empty()).ok_or_else(invalid)?;
    let is_local = matches!(host, "localhost" | "127.0.0.1" | "[::1]");
    match url.scheme() {
        "https" => {}
        "http" if is_local => {}
        "http" => return Err("Only https:// addresses are supported.".into()),
        scheme => return Err(format!("Unsupported address scheme “{scheme}://”.")),
    }
    Url::parse(&url.origin().ascii_serialization()).map_err(|_| invalid())
}

#[derive(Deserialize)]
struct Manifest {
    app: String,
}

/// Client for the requests the shell itself makes to a server. Redirects are
/// never followed: a redirect means the request didn't reach toodoo
/// (http→https, www, a deployment-protection login, …), and following one
/// would hand the request — and anything in it — to wherever it leads.
fn http_client() -> Result<reqwest::Client, String> {
    // reqwest is built without a bundled crypto provider (like the updater,
    // so both share one rustls); make sure a provider is installed.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Could not set up the connection: {e}"))
}

/// Fetch `<origin>/api/desktop/manifest` and make sure it answers as toodoo,
/// so a typo or an unrelated site never becomes the trusted origin.
async fn verify_toodoo_server(origin: &Url) -> Result<(), String> {
    let host = origin.host_str().unwrap_or_default();
    let manifest_url = origin.join(MANIFEST_PATH).expect("origin joins a path");
    let response = http_client()?
        .get(manifest_url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|e| format!("Could not reach {host}: {}", e.without_url()))?;
    let status = response.status();
    if status.is_redirection() {
        return Err(format!(
            "{host} redirected the request (HTTP {}). Enter the address toodoo is actually served from.",
            status.as_u16()
        ));
    }
    if !status.is_success() {
        return Err(format!(
            "{host} doesn't look like a toodoo server (HTTP {} from {MANIFEST_PATH}).",
            status.as_u16()
        ));
    }
    let manifest: Manifest = response.json().await.map_err(|_| {
        format!("{host} doesn't look like a toodoo server (unexpected reply from {MANIFEST_PATH}).")
    })?;
    if manifest.app != "toodoo" {
        return Err(format!("{host} doesn't look like a toodoo server."));
    }
    Ok(())
}

/// Map a `toodoo://host/path?query#fragment` deep link onto a page of the
/// web app, e.g. `toodoo://projects/<id>` -> `<server>/projects/<id>`.
///
/// Only the app's own pages are reachable this way: the board, a project, a
/// saved view. Any website or email can hand the OS a `toodoo://` link, and
/// the window then loads its target as a top-level navigation the server
/// can't tell from the shell's own. Mapping arbitrary paths would let a link
/// reach routes such as `/api/desktop/auth/finish?token=…`, which signs the
/// window into whichever account minted the token (login CSRF). `None` for
/// anything but a page.
fn deep_link_to_web_url(base: &Url, url: &Url) -> Option<Url> {
    let path = match url.host_str() {
        Some(host) if !host.is_empty() => format!("/{}{}", host, url.path()),
        _ => url.path().to_string(),
    };
    let path = path.trim_end_matches('/');
    let segments: Vec<&str> = path.split('/').skip(1).collect();
    let is_page = match segments.as_slice() {
        [] => true,
        ["projects" | "views", id] => is_uuid(id),
        _ => false,
    };
    if !is_page {
        return None;
    }
    let mut target = base.clone();
    target.set_path(path);
    target.set_query(url.query());
    target.set_fragment(url.fragment());
    Some(target)
}

/// URL the bundled UI is served from — what `WebviewUrl::App` resolves to:
/// the custom `tauri://localhost` scheme, except on Windows where wry needs a
/// real http origin (`http://tauri.localhost`, `useHttpsScheme` being off).
fn local_page_url(page: &str) -> Url {
    #[cfg(windows)]
    let base = "http://tauri.localhost/";
    #[cfg(not(windows))]
    let base = "tauri://localhost/";
    Url::parse(base)
        .and_then(|base| base.join(page))
        .expect("valid local page URL")
}

/// WKWebView's default user agent lacks the `Version/… Safari/…` tokens, which
/// makes Google refuse OAuth ("disallowed_useragent"). Present as Safari, as
/// desktop wrappers commonly do. WebView2 on Windows already looks like Edge.
///
/// The version is the installed Safari's, never a fixed one: a user agent
/// that names an older browser than the engine behind it is the kind of
/// mismatch bot defences such as Vercel's firewall flag, and they then stop
/// the app's background requests at their security checkpoint.
#[cfg(target_os = "macos")]
fn macos_user_agent() -> String {
    let version = fs::read_to_string(SAFARI_INFO_PLIST)
        .ok()
        .and_then(|plist| safari_version(&plist))
        .unwrap_or_else(|| FALLBACK_SAFARI_VERSION.to_string());
    format!(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/{version} Safari/605.1.15"
    )
}

/// Safari's `CFBundleShortVersionString` from its XML Info.plist, cut to
/// `major.minor` the way Safari's own user agent spells it (26.5.1 → 26.5).
#[cfg(target_os = "macos")]
fn safari_version(plist: &str) -> Option<String> {
    let value = plist
        .split("<key>CFBundleShortVersionString</key>")
        .nth(1)?
        .trim_start()
        .strip_prefix("<string>")?
        .split("</string>")
        .next()?;
    let is_number = |part: &&str| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit());
    let mut parts = value.trim().split('.');
    let major = parts.next().filter(is_number)?;
    let minor = parts.next().filter(is_number).unwrap_or("0");
    Some(format!("{major}.{minor}"))
}

fn is_local_ui(url: &Url) -> bool {
    matches!(url.scheme(), "about" | "tauri") || url.host_str() == Some("tauri.localhost")
}

fn is_sign_in_origin(url: &Url) -> bool {
    let origin = url.origin().ascii_serialization();
    SIGN_IN_ORIGINS.contains(&origin.as_str())
}

fn current_server(app: &AppHandle) -> Option<Url> {
    app.state::<ServerState>().current.read().unwrap().clone()
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn open_in_main_window(app: &AppHandle, url: Url) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.navigate(url);
    }
    focus_main_window(app);
}

fn show_connect_page(app: &AppHandle, suggested: Option<String>) {
    *app.state::<ServerState>().suggested.write().unwrap() = suggested;
    open_in_main_window(app, local_page_url(CONNECT_PAGE));
}

fn to_hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut hex = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(hex, "{byte:02x}");
    }
    hex
}

/// 32 random bytes as lowercase hex, from the OS. `ring` is already linked in
/// for TLS, so this costs nothing extra.
fn random_verifier() -> Result<String, String> {
    use ring::rand::SecureRandom;
    let mut buffer = [0u8; 32];
    ring::rand::SystemRandom::new()
        .fill(&mut buffer)
        .map_err(|_| "Could not generate a secure random value.".to_string())?;
    Ok(to_hex(&buffer))
}

fn sha256_hex(value: &str) -> String {
    to_hex(ring::digest::digest(&ring::digest::SHA256, value.as_bytes()).as_ref())
}

/// A uuid: what `createHandoff` returns (src/lib/desktop-auth.ts), and what
/// projects and saved views are keyed by.
fn is_uuid(id: &str) -> bool {
    id.len() == 36
        && id.char_indices().all(|(index, c)| match index {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

/// What a link on the reserved `toodoo://sign-in` host is asking for.
enum SignInLink {
    /// `toodoo://sign-in` — the web app asking for a sign-in in the browser.
    Start,
    /// `toodoo://sign-in/callback?id=…` — the browser handing one back.
    Callback(String),
}

fn parse_sign_in_link(url: &Url) -> Option<SignInLink> {
    if url.host_str() != Some(SIGN_IN_HOST) {
        return None;
    }
    match url.path().trim_end_matches('/') {
        "" => Some(SignInLink::Start),
        "/callback" => url
            .query_pairs()
            .find(|(key, _)| key == "id")
            .map(|(_, value)| value.into_owned())
            .filter(|id| is_uuid(id))
            .map(SignInLink::Callback),
        _ => None,
    }
}

/// Whether the window is still on the server a sign-in was started against.
/// A `Switch Server…` in between makes the handoff meaningless — and worse,
/// navigating to the old origin would push the URL, token and all, out to
/// the system browser, since only the connected origin renders in the window
/// (see the navigation handler in `run`).
fn still_connected_to(app: &AppHandle, origin: &Url) -> bool {
    current_server(app).is_some_and(|base| base.origin() == origin.origin())
}

/// Send the window back to the login page, where the web app explains what
/// went wrong and offers another go.
fn sign_in_failed(app: &AppHandle, origin: &Url) {
    let mut url = origin.join("/login").expect("origin joins a path");
    url.query_pairs_mut().append_pair("error", SIGN_IN_ERROR);
    open_in_main_window(app, url);
}

/// Open the user's browser on the server's sign-in page. Only the SHA-256 of
/// the verifier goes with it, so the session the browser ends up with can
/// only be collected by this process — the `toodoo://` callback is an
/// OS-wide scheme any app may register, and on its own it carries nothing
/// redeemable. Same reasoning as PKCE (RFC 8252) for native apps.
fn start_external_sign_in(app: &AppHandle) {
    let Some(origin) = current_server(app) else {
        // No server yet — there is nothing to sign in to.
        show_connect_page(app, None);
        return;
    };
    let verifier = match random_verifier() {
        Ok(verifier) => verifier,
        Err(error) => {
            eprintln!("[toodoo] could not start a sign-in: {error}");
            sign_in_failed(app, &origin);
            return;
        }
    };
    let mut url = origin.join(SIGN_IN_START_PATH).expect("origin joins a path");
    url.query_pairs_mut()
        .append_pair("challenge", &sha256_hex(&verifier));
    *app.state::<SignInState>().pending.write().unwrap() = Some(PendingSignIn {
        verifier,
        origin: origin.clone(),
        started: Instant::now(),
    });
    if app.opener().open_url(url.as_str(), None::<String>).is_err() {
        *app.state::<SignInState>().pending.write().unwrap() = None;
        sign_in_failed(app, &origin);
    }
}

#[derive(Serialize)]
struct ClaimRequest<'a> {
    id: &'a str,
    verifier: &'a str,
}

#[derive(Deserialize)]
struct ClaimResponse {
    token: String,
}

/// Trade the handoff id and the verifier for the one-time token that stands
/// in for the browser's session.
async fn claim_sign_in_token(origin: &Url, id: &str, verifier: &str) -> Result<String, String> {
    let url = origin.join(SIGN_IN_CLAIM_PATH).expect("origin joins a path");
    let response = http_client()?
        .post(url)
        .json(&ClaimRequest { id, verifier })
        .send()
        .await
        .map_err(|e| format!("could not reach the server: {}", e.without_url()))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("the server refused it (HTTP {})", status.as_u16()));
    }
    let claim: ClaimResponse = response
        .json()
        .await
        .map_err(|_| "unexpected reply from the server".to_string())?;
    if claim.token.is_empty() {
        return Err("the server returned an empty token".into());
    }
    Ok(claim.token)
}

/// The browser says a sign-in is ready. Claim it and load the page that
/// redeems it, which is what puts the session cookie in this webview.
fn finish_external_sign_in(app: &AppHandle, id: String) {
    // Taken, not read: a replayed or forged callback finds nothing pending.
    let pending = app.state::<SignInState>().pending.write().unwrap().take();
    let Some(pending) = pending else {
        focus_main_window(app);
        return;
    };
    focus_main_window(app);
    // The window moved on while the browser was busy; drop the handoff
    // rather than send a token to a server the app no longer trusts.
    if !still_connected_to(app, &pending.origin) {
        return;
    }
    if pending.started.elapsed() > SIGN_IN_TIMEOUT {
        sign_in_failed(app, &pending.origin);
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let claimed = claim_sign_in_token(&pending.origin, &id, &pending.verifier).await;
        // Checked again: the claim is a network round trip, and the user can
        // switch servers during it.
        if !still_connected_to(&app, &pending.origin) {
            return;
        }
        match claimed {
            Ok(token) => {
                let mut url = pending
                    .origin
                    .join(SIGN_IN_FINISH_PATH)
                    .expect("origin joins a path");
                url.query_pairs_mut().append_pair("token", &token);
                open_in_main_window(&app, url);
            }
            Err(error) => {
                eprintln!("[toodoo] could not collect the sign-in: {error}");
                sign_in_failed(&app, &pending.origin);
            }
        }
    });
}

fn handle_deep_link(app: &AppHandle, url: &Url, source: LinkSource) {
    if url.host_str() == Some(SIGN_IN_HOST) {
        match parse_sign_in_link(url) {
            // Only the app's own page may send the user to the browser.
            Some(SignInLink::Start) if source == LinkSource::Window => {
                start_external_sign_in(app)
            }
            Some(SignInLink::Callback(id)) => finish_external_sign_in(app, id),
            // Malformed, or a start asked for by something outside the app.
            _ => focus_main_window(app),
        }
        return;
    }
    if url.host_str() == Some(CONNECT_HOST) {
        // `toodoo://connect?server=https://todo.acme.com`, from the web app's
        // install dialog or its "Switch server" entry. It only prefills the
        // connect page — the user still confirms — so a rogue link can never
        // silently repoint the app at another server.
        if pinned_app_url().is_some() {
            focus_main_window(app);
            return;
        }
        let server = url
            .query_pairs()
            .find(|(key, _)| key == "server")
            .map(|(_, value)| value.into_owned());
        show_connect_page(app, server);
        return;
    }
    match current_server(app) {
        Some(base) => match deep_link_to_web_url(&base, url) {
            Some(target) => open_in_main_window(app, target),
            None => focus_main_window(app),
        },
        None => show_connect_page(app, None),
    }
}

#[derive(Serialize)]
struct ConnectInfo {
    /// Server currently in use (lets the page offer "Cancel").
    current: Option<String>,
    /// Address a deep link asked to connect to; consumed on read.
    suggested: Option<String>,
}

/// Called by the connect page when it loads.
#[tauri::command]
fn connect_info(state: State<'_, ServerState>) -> ConnectInfo {
    ConnectInfo {
        current: state
            .current
            .read()
            .unwrap()
            .as_ref()
            .map(|url| url.as_str().trim_end_matches('/').to_owned()),
        suggested: state.suggested.write().unwrap().take(),
    }
}

/// Validate and verify the address, remember it, and load it.
#[tauri::command]
async fn connect(app: AppHandle, url: String) -> Result<(), String> {
    let origin = normalize_server_url(&url)?;
    verify_toodoo_server(&origin).await?;
    save_server(&app, &origin)?;
    *app.state::<ServerState>().current.write().unwrap() = Some(origin.clone());
    open_in_main_window(&app, origin);
    Ok(())
}

/// "Cancel" on the connect page: back to the server already in use.
#[tauri::command]
fn cancel_connect(app: AppHandle) {
    if let Some(base) = current_server(&app) {
        open_in_main_window(&app, base);
    }
}

/// macOS: the standard application menu plus "Switch Server…" (unless the
/// build is pinned). Other platforms reach the picker through the web app's
/// profile menu, which links to `toodoo://connect`.
#[cfg(target_os = "macos")]
fn install_menu(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};

    let menu = Menu::default(app.handle())?;
    if pinned_app_url().is_none() {
        // The first submenu is the application menu: About, Services, … Quit.
        let app_menu = menu
            .items()?
            .into_iter()
            .next()
            .and_then(|item| item.as_submenu().cloned());
        if let Some(app_menu) = app_menu {
            let switch = MenuItem::with_id(
                app,
                SWITCH_SERVER_MENU_ID,
                "Switch Server…",
                true,
                None::<&str>,
            )?;
            app_menu.insert(&PredefinedMenuItem::separator(app)?, 1)?;
            app_menu.insert(&switch, 2)?;
        }
    }
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id().as_ref() == SWITCH_SERVER_MENU_ID {
            show_connect_page(app, None);
        }
    });
    Ok(())
}

/// Check GitHub releases for a newer version, ask before installing, and
/// offer a restart once installed. No-op in dev builds and silent on any
/// failure (offline, no release published yet, ...).
fn check_for_updates(app: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let Ok(updater) = app.updater() else { return };
        let Ok(Some(update)) = updater.check().await else {
            return;
        };
        let handle = app.clone();
        app.dialog()
            .message(format!(
                "Toodoo {} is available (you have {}). Install it now?\n\n\
                 On Windows the app closes while the update installs.",
                update.version, update.current_version
            ))
            .title("Update available")
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Install".into(),
                "Later".into(),
            ))
            .show(move |install| {
                if !install {
                    return;
                }
                tauri::async_runtime::spawn(async move {
                    // On Windows this launches the installer and exits the
                    // process, so nothing below runs there.
                    if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                        let restart_handle = handle.clone();
                        handle
                            .dialog()
                            .message("The update is installed. Restart to apply it.")
                            .title("Update ready")
                            .buttons(MessageDialogButtons::OkCancelCustom(
                                "Restart".into(),
                                "Later".into(),
                            ))
                            .show(move |restart| {
                                if restart {
                                    restart_handle.restart();
                                }
                            });
                    }
                });
            });
    });
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // A second launch (e.g. clicking the dock/taskbar icon or a deep
            // link) focuses the existing window; deep links in argv are
            // forwarded to on_open_url by the plugin's `deep-link` feature.
            focus_main_window(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        // These commands are reachable from the bundled connect page only.
        // Tauri enforces its ACL on every remote origin, so the connected
        // server's pages can't call them even though `withGlobalTauri`
        // exposes `window.__TAURI__` (see capabilities/default.json).
        .invoke_handler(tauri::generate_handler![connect_info, connect, cancel_connect])
        .setup(|app| {
            // On macOS the toodoo:// scheme is registered via the bundle's
            // Info.plist; dev builds and Windows/Linux register it at runtime.
            #[cfg(any(windows, target_os = "linux"))]
            app.deep_link().register_all()?;

            let current = match pinned_app_url() {
                Some(pinned) => Some(
                    normalize_server_url(pinned)
                        .unwrap_or_else(|err| panic!("TOODOO_APP_URL: {err}")),
                ),
                None => load_saved_server(app.handle()),
            };
            let start_url = match &current {
                Some(base) => WebviewUrl::External(base.clone()),
                None => WebviewUrl::App(CONNECT_PAGE.into()),
            };
            app.manage(ServerState {
                current: RwLock::new(current),
                suggested: RwLock::new(None),
            });
            app.manage(SignInState::default());

            #[cfg(target_os = "macos")]
            install_menu(app)?;

            // Lets the web app tell it runs inside the shell (it then offers
            // "Switch server" instead of "Download desktop app", and sends
            // Google sign-in to the browser via `toodoo://sign-in` rather
            // than rendering it in the window) and on which OS. The platform is also stamped on <html data-desktop> so the
            // app's CSS can lay the header out around the traffic lights
            // (macOS) before its own scripts run — no jump on load. This runs
            // at document start; WKWebView already has the document element
            // then, WebView2 may not (the attribute is only used on macOS).
            let shell_marker = format!(
                "window.__TOODOO_DESKTOP__ = Object.freeze({{ version: {version}, platform: {platform}, externalSignIn: true }});\n\
                 if (document.documentElement) document.documentElement.dataset.desktop = {platform};",
                version = serde_json::to_string(&app.package_info().version.to_string())
                    .expect("string serializes"),
                platform = serde_json::to_string(std::env::consts::OS).expect("string serializes"),
            );

            let handle = app.handle().clone();
            let builder = WebviewWindowBuilder::new(app, "main", start_url)
                .title("Toodoo")
                .inner_size(1200.0, 800.0)
                .min_inner_size(720.0, 480.0)
                .initialization_script(shell_marker);
            #[cfg(target_os = "macos")]
            let builder = builder
                .user_agent(&macos_user_agent())
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                .traffic_light_position(TRAFFIC_LIGHT_POSITION);
            builder
                .on_navigation(move |url| {
                    // The bundled connect page always renders in the window.
                    if is_local_ui(url) {
                        return true;
                    }
                    // Links to our own scheme from inside the window (the
                    // web app's "Switch server") are handled directly
                    // instead of bouncing through the OS.
                    if url.scheme() == "toodoo" {
                        handle_deep_link(&handle, url, LinkSource::Window);
                        return false;
                    }
                    // Only the connected server's origin — and the sign-in
                    // providers it may bounce through — stay in the window
                    // (origin, not host: an http:// downgrade must not render
                    // inside the trusted shell). Web links open in the system
                    // browser; anything else (file:, custom OS schemes, ...)
                    // is dropped — page content must not reach ShellExecute.
                    if current_server(&handle).is_some_and(|base| base.origin() == url.origin())
                        || is_sign_in_origin(url)
                    {
                        return true;
                    }
                    if matches!(url.scheme(), "http" | "https" | "mailto" | "tel") {
                        let _ = handle.opener().open_url(url.as_str(), None::<String>);
                    }
                    false
                })
                .build()?;

            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    handle_deep_link(&handle, &url, LinkSource::System);
                }
            });

            // A deep link that cold-started the app is consumed before
            // on_open_url is registered — replay it (Windows/Linux).
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    handle_deep_link(app.handle(), &url, LinkSource::System);
                }
            }

            check_for_updates(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Toodoo");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "macos")]
    #[test]
    fn reads_safari_version_as_major_minor() {
        let plist = |version: &str| {
            format!(
                "<dict>\n\t<key>CFBundleName</key>\n\t<string>Safari</string>\n\t<key>CFBundleShortVersionString</key>\n\t<string>{version}</string>\n</dict>"
            )
        };
        assert_eq!(safari_version(&plist("26.5.1")).as_deref(), Some("26.5"));
        assert_eq!(safari_version(&plist("26.5")).as_deref(), Some("26.5"));
        assert_eq!(safari_version(&plist("27")).as_deref(), Some("27.0"));
        assert_eq!(safari_version(&plist("")), None);
        assert_eq!(safari_version(&plist("beta")), None);
        assert_eq!(safari_version("<dict></dict>"), None);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn presents_as_the_installed_safari() {
        let agent = macos_user_agent();
        assert!(agent.ends_with(" Safari/605.1.15"), "{agent}");
        assert!(!agent.contains("Version/17.6"), "{agent}");
    }

    #[test]
    fn normalizes_typed_addresses_to_an_https_origin() {
        for input in [
            "todo.acme.com",
            "https://todo.acme.com",
            "https://todo.acme.com/",
            "  https://todo.acme.com/projects/1?x=y#z  ",
            "https://user:pw@todo.acme.com/login",
        ] {
            assert_eq!(
                normalize_server_url(input).unwrap().as_str(),
                "https://todo.acme.com/",
                "{input}"
            );
        }
        assert_eq!(
            normalize_server_url("https://todo.acme.com:8443").unwrap().as_str(),
            "https://todo.acme.com:8443/"
        );
    }

    #[test]
    fn allows_plain_http_only_for_localhost() {
        assert_eq!(
            normalize_server_url("http://localhost:3000").unwrap().as_str(),
            "http://localhost:3000/"
        );
        assert!(normalize_server_url("http://todo.acme.com").is_err());
    }

    #[test]
    fn rejects_garbage() {
        for input in ["", "   ", "https://", "ftp://todo.acme.com", "not a url"] {
            assert!(normalize_server_url(input).is_err(), "{input}");
        }
    }

    #[test]
    fn only_exact_sign_in_origins_are_allowed() {
        assert!(is_sign_in_origin(&Url::parse("https://accounts.google.com/o/oauth2/v2/auth?x=1").unwrap()));
        assert!(!is_sign_in_origin(&Url::parse("http://accounts.google.com/").unwrap()));
        assert!(!is_sign_in_origin(&Url::parse("https://accounts.google.com.evil.example/").unwrap()));
        assert!(!is_sign_in_origin(&Url::parse("https://evil.example/accounts.google.com").unwrap()));
    }

    /// Every origin normalize_server_url can produce must be covered by the
    /// remote capability, or the header stops being draggable on that server
    /// (a URLPattern without a port only matches the default port). The IPv6
    /// loopback is the one exception: URLPattern has no syntax for it.
    #[test]
    fn remote_capability_covers_every_accepted_server_origin() {
        use tauri::utils::acl::RemoteUrlPattern;

        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/remote.json")).unwrap();
        let patterns: Vec<RemoteUrlPattern> = capability["remote"]["urls"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p.as_str().unwrap().parse().unwrap())
            .collect();
        let covered = |url: &str| {
            let url = Url::parse(url).unwrap();
            patterns.iter().any(|p| p.test(&url))
        };
        for input in [
            "todo.acme.com",
            "https://todo.acme.com:8443",
            "http://localhost:3000",
            "http://127.0.0.1:3100",
        ] {
            let origin = normalize_server_url(input).unwrap();
            let page = origin.join("/projects/1?x=y#z").unwrap();
            assert!(covered(page.as_str()), "{input} -> {page}");
        }
        assert!(!covered("http://todo.acme.com/"));
    }

    #[test]
    fn hashes_the_verifier_the_way_the_server_does() {
        // echo -n abc | shasum -a 256
        assert_eq!(
            sha256_hex("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        let verifier = random_verifier().unwrap();
        assert_eq!(verifier.len(), 64);
        assert!(verifier.chars().all(|c| c.is_ascii_hexdigit() && !c.is_uppercase()));
        assert_ne!(verifier, random_verifier().unwrap());
        assert_eq!(sha256_hex(&verifier).len(), 64);
    }

    #[test]
    fn reads_sign_in_links_and_rejects_malformed_ones() {
        let parse = |url: &str| parse_sign_in_link(&Url::parse(url).unwrap());
        assert!(matches!(parse("toodoo://sign-in"), Some(SignInLink::Start)));
        assert!(matches!(parse("toodoo://sign-in/"), Some(SignInLink::Start)));
        let id = "0e6b2a10-7f3c-4f0a-9c1d-2b8f5a6e4d31";
        assert!(
            matches!(parse(&format!("toodoo://sign-in/callback?id={id}")), Some(SignInLink::Callback(got)) if got == id)
        );
        for url in [
            // Not the reserved host at all.
            "toodoo://auth/callback?id=0e6b2a10-7f3c-4f0a-9c1d-2b8f5a6e4d31",
            // Reserved host, nothing we serve.
            "toodoo://sign-in/anything",
            // Callbacks that carry no usable id.
            "toodoo://sign-in/callback",
            "toodoo://sign-in/callback?id=",
            "toodoo://sign-in/callback?id=../../etc/passwd",
            "toodoo://sign-in/callback?id=0e6b2a10-7f3c-4f0a-9c1d-2b8f5a6e4d3",
            "toodoo://sign-in/callback?id=0e6b2a10_7f3c_4f0a_9c1d_2b8f5a6e4d31",
        ] {
            assert!(parse(url).is_none(), "{url}");
        }
    }

    #[test]
    fn maps_deep_links_onto_app_pages() {
        let base = Url::parse("https://todo.acme.com/").unwrap();
        let map = |link: &str| {
            deep_link_to_web_url(&base, &Url::parse(link).unwrap()).map(|url| url.to_string())
        };
        let id = "0e6b2a10-7f3c-4f0a-9c1d-2b8f5a6e4d31";
        assert_eq!(map("toodoo:///").as_deref(), Some("https://todo.acme.com/"));
        assert_eq!(map("toodoo://").as_deref(), Some("https://todo.acme.com/"));
        assert_eq!(
            map(&format!("toodoo://projects/{id}#frag")),
            Some(format!("https://todo.acme.com/projects/{id}#frag"))
        );
        assert_eq!(
            map(&format!("toodoo://views/{id}/")),
            Some(format!("https://todo.acme.com/views/{id}"))
        );
    }

    #[test]
    fn keeps_deep_links_away_from_everything_but_pages() {
        let base = Url::parse("https://todo.acme.com/").unwrap();
        let id = "0e6b2a10-7f3c-4f0a-9c1d-2b8f5a6e4d31";
        for link in [
            "toodoo://api/desktop/auth/finish?token=attacker".to_string(),
            "toodoo:///api/desktop/auth/finish?token=attacker".to_string(),
            "toodoo://api/auth/sign-out".to_string(),
            "toodoo://auth/callback?code=x".to_string(),
            "toodoo://projects/not-an-id".to_string(),
            "toodoo://projects".to_string(),
            format!("toodoo://projects/{id}/../../api/desktop/auth/finish"),
            format!("toodoo://projects/{id}/extra"),
        ] {
            let url = Url::parse(&link).unwrap();
            assert!(deep_link_to_web_url(&base, &url).is_none(), "{link}");
        }
    }
}
