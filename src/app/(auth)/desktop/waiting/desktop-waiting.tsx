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

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="w-full max-w-sm border-border/60 shadow-xl shadow-black/[0.04]">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription className="text-balance">{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">{children}</CardContent>
    </Card>
  );
}

export function DesktopWaiting() {
  const shell = useDesktopShell();
  // Only our own auth pages, so the query can't bounce the user elsewhere.
  const cancelHref =
    useSearchParams().get("from") === "/signup" ? "/signup" : "/login";

  const hydrated = useHydrated();
  // The window coming back to the front means the user is done in the
  // browser. The session still has a round trip to go (the shell collects it
  // over the network), and saying so is the difference between a considered
  // pause and a page that looks stuck.
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
      <Panel
        title="Open this from the app"
        description="This page is part of the Toodoo desktop app's sign-in. Sign in here instead."
      >
        <Link
          href={cancelHref}
          className={buttonVariants({ variant: "outline", className: "w-full" })}
        >
          Continue to sign in
        </Link>
      </Panel>
    );
  }

  return (
    <Panel
      title={returned ? "Signing you in" : "Finish signing in in your browser"}
      description={
        returned
          ? "Picking up the session from your browser. This takes a moment."
          : "We opened Google in your browser. Toodoo picks the session up as soon as you're done — leave this window where it is."
      }
    >
      <div className="flex items-center justify-center gap-2 py-1 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {returned ? "Almost there…" : "Waiting for your browser…"}
      </div>
      <Button type="button" variant="outline" onClick={openBrowser}>
        Open the browser again
      </Button>
      <Link
        href={cancelHref}
        className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Sign in another way
      </Link>
    </Panel>
  );
}
