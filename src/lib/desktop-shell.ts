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
   * shells released before desktop 0.2, which still run against this app.
   */
  platform?: string;
};

declare global {
  interface Window {
    __TOODOO_DESKTOP__?: DesktopShell;
  }
}

/** The desktop app's `toodoo://connect` link: opens its server picker. */
export const DESKTOP_CONNECT_URL = "toodoo://connect";

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

/** `toodoo://connect?server=<origin>` — prefills this deployment in the app. */
export function desktopConnectUrl(origin: string) {
  return `${DESKTOP_CONNECT_URL}?server=${encodeURIComponent(origin)}`;
}
