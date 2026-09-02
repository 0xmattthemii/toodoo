"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { GoogleLogo } from "@/components/google-logo";
import { LoadingButton } from "@/components/loading-button";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";

/**
 * Query flag the login page uses to finish a Google sign-in that landed on an
 * unverified password account: after the password sign-in succeeds, Google is
 * attached to the account via linkSocial. Set by {@link useOAuthErrorToast}.
 */
export const LINK_PARAM = "link";

/**
 * The page's query without our own flow flags, so they never leak into the
 * authorize endpoint, other auth pages, or an OAuth error callback.
 */
export function withoutFlowParams(search: string): URLSearchParams {
  const params = new URLSearchParams(search);
  params.delete(LINK_PARAM);
  return params;
}

/**
 * When the page was opened with a signed authorize query (an MCP client
 * connecting via OAuth), the flow must resume at the authorize endpoint after
 * authentication. Returns that destination, or null for a plain sign-in.
 * Single source of truth for the sentinel param and the endpoint path.
 */
export function oauthContinuationURL(search: string): string | null {
  const params = withoutFlowParams(search);
  if (!params.has("client_id")) return null;
  // The user authenticates on this page, so an OIDC re-authentication request
  // (prompt=login / prompt=create / max_age) is satisfied by the time the
  // query is replayed. Leaving those in makes the authorize endpoint bounce
  // straight back to /login forever. Mirrors the oauth-provider plugin's own
  // resume hook, which strips both after a fresh sign-in.
  const prompts = (params.get("prompt") ?? "")
    .split(" ")
    .filter((p) => p && p !== "login" && p !== "create");
  if (prompts.length) params.set("prompt", prompts.join(" "));
  else params.delete("prompt");
  params.delete("max_age");
  return `/api/auth/oauth2/authorize?${params.toString()}`;
}


/**
 * "Continue with Google" button. Preserves an in-flight MCP OAuth
 * authorization via {@link oauthContinuationURL}; errors return to the page
 * the button was clicked on, where useOAuthErrorToast surfaces them.
 */
export function GoogleButton() {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    const search = window.location.search;
    const query = withoutFlowParams(search).toString();
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: oauthContinuationURL(search) ?? "/",
      errorCallbackURL: `${window.location.pathname}${query ? `?${query}` : ""}`,
    });
    // On success the browser navigates away; only errors reach this point.
    if (error) {
      toast.error(error.message ?? "Could not sign in with Google");
      setLoading(false);
    }
  }

  return (
    <LoadingButton
      type="button"
      variant="outline"
      className="w-full"
      loading={loading}
      onClick={onClick}
    >
      <GoogleLogo />
      Continue with Google
    </LoadingButton>
  );
}

/** Divider between the social buttons and the email/password form. */
export function AuthSeparator() {
  return (
    <div className="flex items-center gap-3">
      <Separator className="flex-1" />
      <span className="text-xs text-muted-foreground">or</span>
      <Separator className="flex-1" />
    </div>
  );
}

/**
 * Link between auth pages that carries the current query string along, so an
 * in-flight MCP OAuth authorization survives switching between login/signup.
 * The query is baked into the href, so new-tab and copy-link work too. Our
 * own flow flags are dropped: they only mean something on the page that set
 * them.
 */
export function AuthLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const params = useSearchParams();
  const query = withoutFlowParams(params.toString()).toString();
  return (
    <Link href={query ? `${href}?${query}` : href} className={className}>
      {children}
    </Link>
  );
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  email_not_verified: "Verify your email address before signing in.",
  access_denied: "Google sign-in was cancelled.",
  unable_to_get_user_info:
    "Google sign-in was rejected. If this instance is limited to a Google Workspace domain, pick your work account.",
  // linkSocial callback errors (connecting Google to a signed-in account).
  email_does_not_match:
    "That Google account uses a different email than your toodoo account. Pick the Google account with the same address.",
  account_already_linked_to_different_user:
    "This Google account is already connected to another toodoo account.",
  unable_to_link_account: "Could not connect Google to your account.",
};

/**
 * Surfaces OAuth callback failures: Better Auth redirects back to the
 * originating page with ?error=<code>[&error_description=...]. Shows a
 * friendly toast and strips the error params (keeping any MCP authorize
 * query intact).
 *
 * `account_not_linked` is not an error to show: it means the Google email
 * matches a password account that hasn't verified its email, which Better
 * Auth refuses to link implicitly. Hand off to the login page with
 * ?link=google, where a password sign-in completes the merge.
 */
export function useOAuthErrorToast() {
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (!error) return;
    const description = params.get("error_description");
    params.delete("error");
    params.delete("error_description");

    if (error === "account_not_linked") {
      params.set(LINK_PARAM, "google");
      router.replace(`/login?${params.toString()}`);
      return;
    }

    // Own-property lookup: `error` comes from the URL, so a crafted value
    // like __proto__ must not resolve through the prototype chain.
    toast.error(
      (Object.hasOwn(OAUTH_ERROR_MESSAGES, error)
        ? OAUTH_ERROR_MESSAGES[error]
        : undefined) ??
        description ??
        `Sign-in failed (${error.replaceAll("_", " ")})`,
    );
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }, [router]);
}
