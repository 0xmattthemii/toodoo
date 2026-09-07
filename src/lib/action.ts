/**
 * Await a server action, turning a failed round trip — the action threw, the
 * function died, the network dropped — into the same error result the action
 * returns for a request it rejects itself.
 *
 * Without this the rejection escapes the `startTransition` the caller runs in
 * and reaches the nearest error boundary, which replaces the page: a dialog
 * loses everything the user typed on the way to a generic error screen. With
 * it, the caller shows its own message and the form stays exactly as it was.
 */
export async function tryAction<T>(action: Promise<T>, onFailure: T): Promise<T> {
  try {
    return await action;
  } catch (error) {
    console.error(error);
    return onFailure;
  }
}
