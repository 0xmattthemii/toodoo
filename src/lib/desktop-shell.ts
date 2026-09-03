"use client";

import { useSyncExternalStore } from "react";

/**
 * Set by the desktop app (desktop/src-tauri/src/lib.rs) on every page it
 * loads, before any script runs. Absent in a normal browser.
 */
export type DesktopShell = { version: string };

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
