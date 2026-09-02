use std::sync::LazyLock;

use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

/// The deployed web app this shell wraps. Override at compile time with
/// TOODOO_APP_URL (e.g. `TOODOO_APP_URL=http://localhost:3100 pnpm dev`).
const APP_URL: &str = match option_env!("TOODOO_APP_URL") {
    Some(url) => url,
    None => "https://toodoo-snowy-phi.vercel.app",
};

static BASE_URL: LazyLock<Url> = LazyLock::new(|| Url::parse(APP_URL).expect("valid APP_URL"));

/// Map a `toodoo://host/path?query#fragment` deep link onto the web app,
/// e.g. `toodoo://auth/callback?code=x` -> `<APP_URL>/auth/callback?code=x`.
/// Query and fragment are preserved (hash-based OAuth callbacks carry the
/// token in the fragment).
fn deep_link_to_web_url(url: &Url) -> Url {
    let path = match url.host_str() {
        Some(host) if !host.is_empty() => format!("/{}{}", host, url.path()),
        _ => url.path().to_string(),
    };
    let mut target = BASE_URL.clone();
    target.set_path(path.trim_end_matches('/'));
    target.set_query(url.query());
    target.set_fragment(url.fragment());
    target
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn open_in_main_window(app: &AppHandle, url: Url) {
    if let Some(mut window) = app.get_webview_window("main") {
        let _ = window.navigate(url);
    }
    focus_main_window(app);
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
        .setup(|app| {
            // On macOS the toodoo:// scheme is registered via the bundle's
            // Info.plist; dev builds and Windows/Linux register it at runtime.
            #[cfg(any(windows, target_os = "linux"))]
            app.deep_link().register_all()?;

            let handle = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(BASE_URL.clone()))
                .title("Toodoo")
                .inner_size(1200.0, 800.0)
                .min_inner_size(720.0, 480.0)
                .on_navigation(move |url| {
                    // Only the app's own origin stays in the window (origin,
                    // not host: an http:// downgrade must not render inside
                    // the trusted shell). Web links open in the system
                    // browser; anything else (file:, custom OS schemes, ...)
                    // is dropped — page content must not reach ShellExecute.
                    if matches!(url.scheme(), "about" | "tauri")
                        || url.origin() == BASE_URL.origin()
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
                    open_in_main_window(&handle, deep_link_to_web_url(&url));
                }
            });

            // A deep link that cold-started the app is consumed before
            // on_open_url is registered — replay it (Windows/Linux).
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    open_in_main_window(app.handle(), deep_link_to_web_url(&url));
                }
            }

            check_for_updates(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Toodoo");
}
