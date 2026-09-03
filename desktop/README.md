# Toodoo Desktop

Tauri 2 shell for Windows and macOS that wraps a toodoo web deployment in a
native window. One build works with any deployment: on first launch the app
shows a connect screen asking for the server address, verifies it, remembers
it, and loads it. Self-hosters don't build anything — their users install the
upstream release and point it at their server (see the
[install steps](../README.md#installing-the-desktop-app-for-your-users) in the
main README).

## What it does

- **Server picker** (`ui/index.html`, local to the app). The address is
  normalized to an origin (`https://` added if missing, paths dropped), must
  be `https://` (plain `http://` only for `localhost`), and is checked against
  `<server>/api/desktop/manifest`, which every toodoo deployment serves. It's
  stored in the app's config directory (`server.json`), never in the binary.
- Loads the server in a native window (WKWebView / WebView2); cookie-based
  Better Auth sessions work as in the browser. Only the connected origin
  renders in the window — plus Google's sign-in pages, so "Continue with
  Google" completes inside the app (on macOS the webview presents a Safari
  user agent, which Google requires). Other web links open in the system
  browser.
- Injects `window.__TOODOO_DESKTOP__ = { version }` into every page so the web
  app knows it's inside the shell (it then shows **Switch server…** in the
  profile menu instead of **Download desktop app**).
- Registers the `toodoo://` deep-link scheme:
  - `toodoo://connect?server=https://todo.acme.com` opens the connect screen
    with that address filled in — this is what the web app's install dialog
    and **Switch server…** use. It never switches silently: the user still
    clicks Connect, so a rogue link can't repoint the app.
  - `toodoo://host/path?query` is forwarded to `<server>/host/path?query` in
    the main window — intended for a future system-browser OAuth callback.
- macOS menu bar: **Toodoo → Switch Server…**.
- Single-instance: relaunching focuses the existing window. Window
  size/position persist across launches.

## Develop

Requires Rust (`rustup`) and pnpm. From this directory:

```sh
pnpm tauri dev
```

The app starts on the connect screen; enter `http://localhost:3000` (with
`pnpm dev` running at the repo root) or any deployment. `cargo test` in
`src-tauri/` covers the address normalization and deep-link mapping.

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
auto-update. The web app's install dialog picks up the new release within a
few minutes (it looks for the latest published `desktop-v*` release and links
its `.dmg` and `-setup.exe` assets).

### Auto-update

The app checks for updates on launch (release builds only), installs in the
background, and offers a restart. Updates are verified against the minisign
public key in `tauri.conf.json`; CI signs artifacts using the
`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repo
secrets. The private key lives in `~/.tauri/toodoo.key` (password in
`~/.tauri/toodoo.key.password`) — **back it up; losing it means existing
installs can never auto-update again** (you'd have to rotate the pubkey and
have users reinstall manually).

## Shipping your own build

Forks are welcome to publish their own desktop app — to own the update
channel, pin a server, or rebrand. Installed apps identify themselves and poll
for updates using values from `src-tauri/tauri.conf.json`, so a fork must not
reuse the upstream identity: same-identifier apps share settings and can't be
installed side by side, and an app carrying the upstream update key would try
to verify your releases against it. Nothing needs to be edited in source —
`.github/workflows/desktop.yml` runs `scripts/apply-fork-config.mjs` before
building, which takes everything from your repository's settings and refuses
to build a fork that hasn't set them:

1. **Bundle identifier** — repository variable `DESKTOP_BUNDLE_ID`, a
   reverse-DNS name you control (e.g. `com.acme.toodoo`; letters, digits, dots
   and hyphens, not ending in `.app`). Upstream builds use
   `io.github.0xmattthemii.toodoo`.
2. **Update signing** — generate your own keypair:

   ```sh
   pnpm tauri signer generate -w ~/.tauri/toodoo.key
   ```

   Store the private key and its password as the `TAURI_SIGNING_PRIVATE_KEY`
   and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets, and the printed public key
   as the `DESKTOP_UPDATER_PUBKEY` variable. The updater endpoint is derived
   automatically from the repository the workflow runs in
   (`https://github.com/<you>/<repo>/releases/download/updater/latest.json`).
3. **Point your deployment at your releases** — set
   `DESKTOP_RELEASES_REPO=<you>/<repo>` on the web app so its install dialog
   offers your installers.
4. **Optional: pin the server** — set the `TOODOO_APP_URL` repository secret
   to your deployment's `https://` origin. The shell then skips the connect
   screen, ignores `toodoo://connect` links, and hides **Switch Server…**.
   Leave it unset for the generic behaviour.
5. **Optional: rebrand** — `productName` and the icons (`pnpm tauri icon
   your-icon.png`) are the only things that do need a commit in your fork. If
   you rename the product, update the `/Applications/Toodoo.app` path shown
   in the install dialog and in the README.

Then release as above: `pnpm --dir desktop release patch` and push the tag.

For local builds the same overrides go through Tauri's `--config` flag, which
merges a JSON fragment over `tauri.conf.json` (the CLI passes the merged
config to the Rust build too):

```sh
pnpm tauri build --config '{"identifier":"com.acme.toodoo"}'
```

or run the script yourself with `GITHUB_REPOSITORY`, `DESKTOP_BUNDLE_ID` and
`DESKTOP_UPDATER_PUBKEY` in the environment; it edits `tauri.conf.json` in
place, which you may simply commit in your fork.

Known limitation: the `toodoo://` deep-link scheme is shared by every build.
If a machine has both the upstream app and a fork installed, the OS decides
which one handles `toodoo://connect` links; the address typed on the app's
own connect screen still works in either.

## Not yet done

- **OS code signing/notarization** — builds are deliberately unsigned for now.
  macOS builds are ad-hoc signed and Gatekeeper reports downloaded ad-hoc apps
  as "damaged" on Apple Silicon until users run
  `xattr -d com.apple.quarantine /Applications/Toodoo.app`; Windows builds
  trigger SmartScreen. The install dialog tells users what to do. The
  workflow has the secret names for Developer ID / Trusted Signing stubbed in
  comments for when this is set up.
- **Native extras** — tray / menu-bar quick add, global shortcut,
  notifications, dock badge count.
- **Offline screen** — the shell shows a webview error page without a
  connection.
- **Other identity providers** — only Google's sign-in origin is allowed
  inside the window. A Google Workspace account that federates to a
  third-party IdP (Okta, Entra, …) is sent to the system browser and the
  sign-in won't complete in the app; the plan is a system-browser flow that
  hands the session back through `toodoo://`.
