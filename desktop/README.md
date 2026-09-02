# Toodoo Desktop

Tauri 2 shell for Windows and macOS that wraps the deployed web app
(`https://toodoo-snowy-phi.vercel.app` — change `APP_URL` in
[`src-tauri/src/lib.rs`](src-tauri/src/lib.rs) to point elsewhere).

## What it does

- Loads the production web app in a native window (WKWebView / WebView2);
  cookie-based Better Auth sessions work as in the browser.
- Same-origin navigation stays in the window; external links open in the
  system browser.
- Registers the `toodoo://` deep-link scheme. `toodoo://host/path?query` is
  forwarded to `<APP_URL>/host/path?query` in the main window — intended for a
  future system-browser OAuth callback flow.
- Single-instance: relaunching focuses the existing window.
- Window size/position persist across launches.

## Develop

Requires Rust (`rustup`) and pnpm. From this directory:

```sh
pnpm tauri dev
```

## Build installers

```sh
pnpm tauri build            # .app + .dmg on macOS, .msi/.exe (NSIS) on Windows
```

## Releasing

Versions are tagged `desktop-vX.Y.Z`, independent of the web app. One command
bumps `package.json`, `tauri.conf.json`, `Cargo.toml`, and `Cargo.lock`, then
commits and tags:

```sh
pnpm --dir desktop release patch   # or minor / major / an explicit x.y.z
git push --follow-tags
```

The tag triggers `.github/workflows/desktop.yml`, which builds a macOS
universal `.dmg` and a Windows NSIS installer, signs the updater artifacts,
and creates a **draft** GitHub release including `latest.json`. Review and
publish the release — publishing triggers
`.github/workflows/desktop-updater-manifest.yml`, which copies `latest.json`
onto the floating `updater` release that running apps poll
(`releases/download/updater/latest.json`). The floating tag exists so that
publishing unrelated (e.g. web) releases in this repo can never break
auto-update.

### Auto-update

The app checks for updates on launch (release builds only), installs in the
background, and offers a restart. Updates are verified against the minisign
public key in `tauri.conf.json`; CI signs artifacts using the
`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repo
secrets. The private key lives in `~/.tauri/toodoo.key` (password in
`~/.tauri/toodoo.key.password`) — **back it up; losing it means existing
installs can never auto-update again** (you'd have to rotate the pubkey and
have users reinstall manually).

## Not yet done

- **OS code signing/notarization** — macOS builds are ad-hoc signed, and
  Gatekeeper reports downloaded ad-hoc apps as "damaged" on Apple Silicon;
  until Developer ID signing + notarization is set up, testers must run
  `xattr -d com.apple.quarantine /Applications/Toodoo.app` after installing.
  Windows builds will trigger SmartScreen until signed. The workflow has the
  secret names stubbed in comments.
- **Native extras** — tray / menu-bar quick add, global shortcut,
  notifications, dock badge count.
- **Offline screen** — the shell shows a webview error page without a
  connection.
