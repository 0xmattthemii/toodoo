/**
 * Per-viewer view preferences — which layout the boards show, the calendar's
 * span — kept across boards and, where asked, across reloads.
 *
 * Switching boards is a client-side re-render (see `Workspace`), so an
 * in-memory copy is enough to carry a choice from one board to the next with
 * nothing flashing. Only the browser ever writes it: on the server this module
 * is shared by every request, so it must stay empty there. `localStorage`
 * backs it for the next visit, and is only read after mount, since the
 * server's render cannot know it.
 */

import { useSyncExternalStore } from "react";

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

/** What this tab already chose; safe to read while rendering. */
export function cachedPref(key: string) {
  return memory.get(key) ?? null;
}

/** The choice from an earlier visit too. Read it in an effect, not in render. */
export function storedPref(key: string) {
  const cached = memory.get(key);
  if (cached !== undefined) return cached;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) memory.set(key, stored);
    return stored;
  } catch {
    return null;
  }
}

/** Remembers a choice; `persist: false` keeps it to this tab's session. */
export function savePref(key: string, value: string, persist = true) {
  memory.set(key, value);
  for (const listener of listeners) listener();
  if (!persist) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembered next time, which is fine.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A preference that follows `savePref`. `null` on the server and during
 * hydration — the server's render cannot know it — and when nothing was ever
 * chosen; the stored choice shows up right after hydration.
 */
export function usePref(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => storedPref(key),
    () => null,
  );
}
