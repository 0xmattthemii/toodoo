"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DESKTOP_SIGN_IN_URL, useDesktopShell } from "@/lib/desktop-shell";

const neverChanges = () => () => {};

/**
 * False on the server and through hydration, true once the client has taken
 * over — which is the only way to tell "the shell hasn't been read yet" from
 * "there is no shell", since useDesktopShell answers null to both.
 */
function useHydrated() {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}

export function DesktopWaiting() {
  const shell = useDesktopShell();
  // Only our own auth pages, so the query can't bounce the user elsewhere.
  const fromSignup = useSearchParams().get("from") === "/signup";
  const back = fromSignup
    ? { href: "/signup", label: "Back to sign up", cta: "Continue to sign up" }
    : { href: "/login", label: "Back to sign in", cta: "Continue to sign in" };

  const hydrated = useHydrated();
  // The window coming back to the front usually means the user is done in
  // the browser, and the session still has a round trip to go while the
  // shell collects it — saying so is the difference between a considered
  // pause and a screen that looks stuck. "Usually": switching back to the
  // app by hand looks the same, so this only ever changes wording, never
  // what the user can do from here.
  const [returned, setReturned] = useState(false);

  const inShell = shell?.externalSignIn === true;

  const openBrowser = useCallback(() => {
    // Handled by the shell's navigation handler: it opens the browser and
    // leaves this page where it is.
    window.location.href = DESKTOP_SIGN_IN_URL;
  }, []);

  useEffect(() => {
    if (!inShell) return;
    // Wait until this page is actually on screen before asking the shell to
    // open the browser. Assigning location.href in the same frame as a render
    // makes the webview throw the pending paint away — that is what used to
    // leave the login page looking as though nothing had happened. Two
    // frames: the first is scheduled before the paint, the second after it.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(openBrowser);
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [inShell, openBrowser]);

  useEffect(() => {
    if (!inShell) return;
    const onBack = () => {
      if (!document.hidden) setReturned(true);
    };
    // Whichever the webview delivers. A shell that fires neither just keeps
    // the original wording — nothing depends on this but the copy, and a
    // sign-in that actually fails is navigated away by the shell.
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => {
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
    };
  }, [inShell]);

  // Opened outside the desktop app, or in a shell too old for the browser
  // flow: there's nothing to hand a session back to, so don't sit on a
  // spinner that can never resolve.
  if (hydrated && !inShell) {
    return (
      <Card className="w-full max-w-sm border-border/60 shadow-xl shadow-black/[0.04]">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Open this from the app</CardTitle>
          <CardDescription className="text-balance">
            This page is part of the Toodoo desktop app&apos;s sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={back.href}
            className={buttonVariants({ className: "w-full" })}
          >
            {back.cta}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm border-border/60 shadow-xl shadow-black/[0.04]">
      {/* One live region: the spinner is decorative, the words carry the
          state, and they change under the user when the window comes back. */}
      <CardHeader className="gap-2 text-center" role="status">
        {/* CardHeader is a grid, so this needs placing in its own cell. */}
        <Loader2
          aria-hidden
          className="size-5 animate-spin justify-self-center text-muted-foreground"
        />
        <CardTitle className="text-xl">
          {returned ? "Signing you in" : "Continue in your browser"}
        </CardTitle>
        <CardDescription className="text-balance">
          {returned
            ? "Picking up the session from your browser."
            : "We opened Google in your browser. Toodoo signs you in as soon as you're done."}
        </CardDescription>
      </CardHeader>
      {/* Always offered, in both states: any refocus flips the wording
          above, including a plain switch back to the app, so this must not
          be the thing that disappears when it does. */}
      <CardContent className="text-center text-sm text-muted-foreground">
        Nothing happening?{" "}
        <button
          type="button"
          onClick={openBrowser}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Open the browser again
        </button>
      </CardContent>
      <CardFooter className="justify-center border-t !py-4">
        <Link
          href={back.href}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {back.label}
        </Link>
      </CardFooter>
    </Card>
  );
}
