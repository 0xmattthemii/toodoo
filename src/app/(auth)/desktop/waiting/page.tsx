import { Suspense } from "react";

import { DesktopWaiting } from "./desktop-waiting";

/**
 * What the desktop app shows while the user finishes signing in in their
 * browser. A page rather than a state on the login form: the form's state
 * didn't survive the `toodoo://` navigation that opens the browser (the
 * webview drops the pending paint), and this has to stay on screen for the
 * whole trip — including the moment after the user comes back, while the
 * shell is still collecting the session.
 */
export default function DesktopWaitingPage() {
  return (
    <Suspense>
      <DesktopWaiting />
    </Suspense>
  );
}
