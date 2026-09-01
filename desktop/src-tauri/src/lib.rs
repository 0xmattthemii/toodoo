use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

/// The deployed web app this shell wraps.
const APP_URL: &str = "https://toodoo-snowy-phi.vercel.app";

/// Map a `toodoo://host/path?query` deep link onto the web app,
/// e.g. `toodoo://auth/callback?code=x` -> `<APP_URL>/auth/callback?code=x`.
fn deep_link_to_web_url(url: &Url) -> Option<Url> {
    let mut target = format!(
        "{}/{}{}",
        APP_URL.trim_end_matches('/'),
        url.host_str().unwrap_or_default(),
        url.path().trim_end_matches('/')
    );
    if let Some(query) = url.query() {
        target.push('?');
        target.push_str(query);
    }
    Url::parse(&target).ok()
}

/// Check GitHub releases for a newer version, install it in the background,
/// and offer a restart. No-op in dev builds and silent on any failure
/// (offline, no release published yet, ...).
fn check_for_updates(app: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let Ok(updater) = app.updater() else { return };
        let Ok(Some(update)) = updater.check().await else {
            return;
        };
        if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
            let version = update.version.clone();
            let handle = app.clone();
            app.dialog()
                .message(format!(
                    "Toodoo {version} has been downloaded. Restart to apply the update."
                ))
                .title("Update ready")
                .buttons(MessageDialogButtons::OkCancelCustom(
                    "Restart".into(),
                    "Later".into(),
                ))
                .show(move |restart| {
                    if restart {
                        handle.restart();
                    }
                });
        }
    });
}

fn open_in_main_window(app: &AppHandle, url: Url) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.navigate(url);
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // A second launch (e.g. clicking the dock/taskbar icon or a deep
            // link) focuses the existing window; deep links in argv are
            // forwarded to on_open_url by the plugin's `deep-link` feature.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            check_for_updates(app.handle().clone());
            // On macOS the toodoo:// scheme is registered via the bundle's
            // Info.plist; dev builds and Windows/Linux register it at runtime.
            #[cfg(any(windows, target_os = "linux"))]
            app.deep_link().register_all()?;

            let app_url = Url::parse(APP_URL).expect("valid APP_URL");
            let host = app_url
                .host_str()
                .expect("APP_URL must have a host")
                .to_string();
            let handle = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(app_url))
            .title("Toodoo")
            .inner_size(1200.0, 800.0)
            .min_inner_size(720.0, 480.0)
            .on_navigation(move |url| {
                // Keep the app's own origin in the window; hand everything
                // else (docs links, OAuth pages, ...) to the system browser.
                let internal = matches!(url.scheme(), "about" | "tauri" | "data")
                    || url.host_str() == Some(host.as_str());
                if !internal {
                    let _ = handle.opener().open_url(url.as_str(), None::<String>);
                }
                internal
            })
            .build()?;

            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    if let Some(web_url) = deep_link_to_web_url(&url) {
                        open_in_main_window(&handle, web_url);
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Toodoo");
}
