use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;
use std::time::Duration;

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
/// Sign-in providers the web app may redirect to. They must render inside the
/// window (not the system browser) so the OAuth callback lands back in this
/// webview's cookie jar and the session sticks. Kept to Google's own account
/// pages; anything else stays out of the trusted shell.
const SIGN_IN_ORIGINS: &[&str] = &["https://accounts.google.com", "https://accounts.youtube.com"];
/// WKWebView's default user agent lacks the `Version/… Safari/…` tokens, which
/// makes Google refuse OAuth ("disallowed_useragent"). Present as Safari, as
/// desktop wrappers commonly do. WebView2 on Windows already looks like Edge.
#[cfg(target_os = "macos")]
const MACOS_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";
#[cfg(target_os = "macos")]
const SWITCH_SERVER_MENU_ID: &str = "switch-server";

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

/// Fetch `<origin>/api/desktop/manifest` and make sure it answers as toodoo,
/// so a typo or an unrelated site never becomes the trusted origin.
async fn verify_toodoo_server(origin: &Url) -> Result<(), String> {
    // reqwest is built without a bundled crypto provider (like the updater,
    // so both share one rustls); make sure a provider is installed.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let host = origin.host_str().unwrap_or_default();
    let manifest_url = origin.join(MANIFEST_PATH).expect("origin joins a path");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        // A redirect means the address isn't where toodoo is served from
        // (http→https, www, a deployment-protection login, …). Say so
        // rather than silently trusting wherever it leads.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Could not set up the connection: {e}"))?;
    let response = client
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

/// Map a `toodoo://host/path?query#fragment` deep link onto the web app,
/// e.g. `toodoo://auth/callback?code=x` -> `<server>/auth/callback?code=x`.
/// Query and fragment are preserved (hash-based OAuth callbacks carry the
/// token in the fragment).
fn deep_link_to_web_url(base: &Url, url: &Url) -> Url {
    let path = match url.host_str() {
        Some(host) if !host.is_empty() => format!("/{}{}", host, url.path()),
        _ => url.path().to_string(),
    };
    let mut target = base.clone();
    target.set_path(path.trim_end_matches('/'));
    target.set_query(url.query());
    target.set_fragment(url.fragment());
    target
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

fn handle_deep_link(app: &AppHandle, url: &Url) {
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
        Some(base) => open_in_main_window(app, deep_link_to_web_url(&base, url)),
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

            #[cfg(target_os = "macos")]
            install_menu(app)?;

            // Lets the web app tell it runs inside the shell (it then offers
            // "Switch server" instead of "Download desktop app").
            let shell_marker = format!(
                "window.__TOODOO_DESKTOP__ = Object.freeze({{ version: {} }});",
                serde_json::to_string(&app.package_info().version.to_string())
                    .expect("string serializes")
            );

            let handle = app.handle().clone();
            let builder = WebviewWindowBuilder::new(app, "main", start_url)
                .title("Toodoo")
                .inner_size(1200.0, 800.0)
                .min_inner_size(720.0, 480.0)
                .initialization_script(shell_marker);
            #[cfg(target_os = "macos")]
            let builder = builder.user_agent(MACOS_USER_AGENT);
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
                        handle_deep_link(&handle, url);
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
                    handle_deep_link(&handle, &url);
                }
            });

            // A deep link that cold-started the app is consumed before
            // on_open_url is registered — replay it (Windows/Linux).
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    handle_deep_link(app.handle(), &url);
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

    #[test]
    fn maps_deep_links_onto_the_server() {
        let base = Url::parse("https://todo.acme.com/").unwrap();
        let link = Url::parse("toodoo://auth/callback?code=x#frag").unwrap();
        assert_eq!(
            deep_link_to_web_url(&base, &link).as_str(),
            "https://todo.acme.com/auth/callback?code=x#frag"
        );
        let root = Url::parse("toodoo:///").unwrap();
        assert_eq!(deep_link_to_web_url(&base, &root).as_str(), "https://todo.acme.com/");
    }
}
