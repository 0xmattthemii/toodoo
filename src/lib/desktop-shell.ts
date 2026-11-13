"use client";

import { useSyncExternalStore } from "react";

/**
 * Set by the desktop app (desktop/src-tauri/src/lib.rs) on every page it
 * loads, before any script runs. Absent in a normal browser.
 */
export type DesktopShell = {
  version: string;
  /**
   * Rust's `std::env::consts::OS`: "macos", "windows", "linux". The shell
   * also stamps it on `<html data-desktop>` before the page loads, so CSS can
   * adapt the layout — on macOS the window's title bar is a transparent
   * overlay and the traffic lights float over the app's header
   * (`desktop-macos:` Tailwind variant in src/app/globals.css). Absent in
   * shells released before desktop 0.1.1, which still run against this app.
   */
  platform?: string;
  /**
   * Whether this shell can run Google sign-in in the user's own browser and
   * hand the session back. Absent in shells that predate the flow; they sign
   * in inside the window instead, which still works — the app allows
   * Google's sign-in origins — so the web app keeps that path for them.
   * Deliberately not a version check: the desktop release pipeline picks the
   * version number, this flag is what the web app can actually rely on.
   */
  externalSignIn?: boolean;
  /**
   * Whether this shell can float the tasks widget (`/widget`) in a small
   * window of its own, and takes the `toodoo://widget` links that drive it.
   * Absent in shells that predate it; the web app then doesn't offer the
   * widget there, since a webview can't open a second window by itself.
   */
  widget?: boolean;
};

declare global {
  interface Window {
    __TOODOO_DESKTOP__?: DesktopShell;
  }
}

/** The desktop app's `toodoo://connect` link: opens its server picker. */
export const DESKTOP_CONNECT_URL = "toodoo://connect";

/**
 * Asks the desktop app to start a sign-in in the user's browser. Navigating
 * to it from inside the window is intercepted by the shell, which opens the
 * browser and leaves the page where it is.
 */
export const DESKTOP_SIGN_IN_URL = "toodoo://sign-in";

const subscribe = () => () => {};

/**
 * Whether the page is running inside the desktop app. `null` on the server
 * and during hydration, so server and client markup always match; the
 * desktop-specific UI appears right after hydration.
 */
export function useDesktopShell(): DesktopShell | null {
  return useSyncExternalStore(
    subscribe,
    () => window.__TOODOO_DESKTOP__ ?? null,
    () => null,
  );
}

/**
 * `toodoo://sign-in/callback?id=<handoff>` — how the browser tells the app a
 * sign-in is ready to collect. The id alone redeems nothing: the app also
 * needs the verifier it has kept since it started the flow (src/lib/desktop-auth.ts).
 */
export function desktopSignInCallbackUrl(handoff: string) {
  return `${DESKTOP_SIGN_IN_URL}/callback?id=${encodeURIComponent(handoff)}`;
}

/** `toodoo://connect?server=<origin>` — prefills this deployment in the app. */
export function desktopConnectUrl(origin: string) {
  return `${DESKTOP_CONNECT_URL}?server=${encodeURIComponent(origin)}`;
}

/** Opens the tasks widget in its own small window, or brings it forward. */
export const DESKTOP_WIDGET_URL = "toodoo://widget";

/**
 * What the widget's page asks of the window it floats in: stay above other
 * windows or not, roll up to its header or back down, bring the app's main
 * window forward. Only honoured from inside the app's own windows.
 */
export type DesktopWidgetCommand =
  | "pin"
  | "unpin"
  | "collapse"
  | "expand"
  | "app";

export function desktopWidgetUrl(command: DesktopWidgetCommand) {
  return `${DESKTOP_WIDGET_URL}/${command}`;
}

/**
 * Hands the shell one of its `toodoo://` links. Navigating to it is how a
 * page talks to the shell, which intercepts the navigation and leaves the
 * page where it is. A beat later rather than right away: assigning
 * `location.href` in the same frame as a render makes the webview drop the
 * pending paint, and the click that got here usually changed something.
 */
export function sendToDesktop(url: string) {
  window.setTimeout(() => {
    window.location.href = url;
  }, 50);
}

/** The widget's window in a browser: a popup, named so a second click reuses it. */
const WIDGET_POPUP = "toodoo-widget";

/**
 * Opens the tasks widget: a floating window in the desktop app, a popup
 * window in a browser.
 */
export function openTasksWidget(shell: DesktopShell | null) {
  if (shell) {
    sendToDesktop(DESKTOP_WIDGET_URL);
    return;
  }
  window
    .open("/widget", WIDGET_POPUP, "popup,width=340,height=520")
    ?.focus();
}
