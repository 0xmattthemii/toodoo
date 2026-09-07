import {
  unstable_isUnrecognizedActionError,
  unstable_rethrow,
} from "next/navigation";

/**
 * Await a server action, turning a failed round trip — the action threw, the
 * function died, the network dropped — into the same error result the action
 * returns for a request it rejects itself.
 *
 * Without this the rejection escapes the `startTransition` the caller runs in
 * and reaches the nearest error boundary, which replaces the page: a dialog
 * loses everything the user typed on the way to a generic error screen. With
 * it, the caller shows its own message and the form stays exactly as it was.
 *
 * Two rejections are not failures of the action: a `redirect()` from it
 * (every one starts with `requireSession`) arrives this way and is Next's to
 * handle, so it is rethrown; and a page left open across a deploy holds
 * action ids the server no longer knows — retrying can never work, so the
 * page reloads onto the current build instead.
 */
export async function tryAction<T>(action: Promise<T>, fallback: T): Promise<T> {
  try {
    return await action;
  } catch (error) {
    unstable_rethrow(error);
    if (unstable_isUnrecognizedActionError(error)) {
      window.location.reload();
    } else {
      console.error(error);
    }
    return fallback;
  }
}
