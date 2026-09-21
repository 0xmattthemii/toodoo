"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { GoogleLogo } from "@/components/google-logo";
import { LoadingButton } from "@/components/loading-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { desktopSignInCallbackUrl } from "@/lib/desktop-shell";

/** Where Google returns to; mints the handoff the app then claims. */
const COMPLETE_URL = "/api/desktop/auth/complete";
/** Errors come back here, where they are shown rather than toasted away. */
const ERROR_URL = "/desktop/sign-in";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_request:
    "That sign-in link was malformed. Start again from the Toodoo app.",
  sign_in_expired:
    "This sign-in took too long. Start again from the Toodoo app.",
  no_session: "The sign-in didn't complete. Start again from the Toodoo app.",
  handoff_failed:
    "Signed in, but the session couldn't be handed to the app. Please try again.",
  access_denied: "Google sign-in was cancelled.",
  // The Google address matches a password account that hasn't verified its
  // email, so Better Auth won't merge them on its own. That merge needs the
  // password, which belongs in the app rather than in this browser tab.
  account_not_linked:
    "This email already signs in with a password. Sign in with your password in the Toodoo app — you can connect Google from there.",
  email_not_verified: "Verify your email address before signing in.",
  unable_to_get_user_info:
    "Google sign-in was rejected. If this instance is limited to a Google Workspace domain, pick your work account.",
  signup_domain_restricted:
    "That Google account isn't allowed to sign in to this toodoo.",
};

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="w-full max-w-sm border-border/60 shadow-xl shadow-black/[0.04]">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {children ? (
        <CardContent className="grid gap-3">{children}</CardContent>
      ) : null}
    </Card>
  );
}

export function DesktopSignIn({
  handoff,
  error,
  started,
  googleEnabled,
}: {
  handoff: string | null;
  error: string | null;
  started: boolean;
  googleEnabled: boolean;
}) {
  if (handoff) return <HandoffReady handoff={handoff} />;
  if (error) {
    return (
      <Panel
        title="Sign-in didn't finish"
        description={
          ERROR_MESSAGES[error] ??
          `Sign-in failed (${error.replaceAll("_", " ")}).`
        }
      />
    );
  }
  if (!googleEnabled) {
    return (
      <Panel
        title="Google sign-in is off"
        description="This toodoo doesn't have Google sign-in configured. Use your email and password in the app."
      />
    );
  }
  if (!started) {
    return (
      <Panel
        title="Nothing to sign in to"
        description="Open this page from the Toodoo app's sign-in screen — it's the app that starts the handoff."
      />
    );
  }
  return <RedirectToGoogle />;
}

/** Signed in: hand the session back to the app over `toodoo://`. */
function HandoffReady({ handoff }: { handoff: string }) {
  const url = desktopSignInCallbackUrl(handoff);
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    window.location.href = url;
  }, [url]);

  return (
    <Panel
      title="You're signed in"
      description="Toodoo is picking the session up — you can close this tab."
    >
      <a href={url} className={buttonVariants({ variant: "outline", className: "w-full" })}>
        Open Toodoo
      </a>
    </Panel>
  );
}

/** Hand straight over to Google, the way the app's button would in a browser. */
function RedirectToGoogle() {
  const [failed, setFailed] = useState<string | null>(null);
  const started = useRef(false);

  const start = useCallback(async () => {
    setFailed(null);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: COMPLETE_URL,
      errorCallbackURL: ERROR_URL,
    });
    // On success the browser navigates to Google; only errors get here.
    if (error) setFailed(error.message ?? "Could not reach Google.");
  }, []);

  useEffect(() => {
    // This page exists to bounce the browser to Google; do it once.
    if (started.current) return;
    started.current = true;
    void start();
  }, [start]);

  return (
    <Panel
      title="Signing in to Toodoo"
      description={failed ?? "Taking you to Google…"}
    >
      <LoadingButton
        type="button"
        variant="outline"
        className="w-full"
        loading={!failed}
        onClick={() => void start()}
      >
        <GoogleLogo />
        Continue with Google
      </LoadingButton>
    </Panel>
  );
}
