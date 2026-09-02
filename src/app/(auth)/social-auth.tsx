"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LoadingButton } from "@/components/loading-button";
import { authClient } from "@/lib/auth-client";

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.26-2.09 3.58-5.17 3.58-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28a7.21 7.21 0 0 1 0-4.56V6.61H1.27a12 12 0 0 0 0 10.78l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.98 11.98 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

/**
 * "Continue with Google" button. Preserves an in-flight MCP OAuth
 * authorization: when the page was opened with a signed authorize query
 * (client_id & co), the flow resumes at the authorize endpoint after Google
 * redirects back.
 */
export function GoogleButton() {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    const search = window.location.search;
    const callbackURL = new URLSearchParams(search).has("client_id")
      ? `/api/auth/oauth2/authorize${search}`
      : "/";
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL,
      errorCallbackURL: `/login${search}`,
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
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">or</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Link between auth pages that carries the current query string along, so an
 * in-flight MCP OAuth authorization survives switching between login/signup.
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
  const router = useRouter();
  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => {
        const search = window.location.search;
        if (!search) return;
        event.preventDefault();
        router.push(`${href}${search}`);
      }}
    >
      {children}
    </Link>
  );
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  account_not_linked:
    "This email already has a password account. Sign in with your password — once your email is verified you can also use Google.",
  email_not_verified: "Verify your email address before signing in.",
  access_denied: "Google sign-in was cancelled.",
};

/**
 * Surfaces OAuth callback failures: Better Auth redirects back to the login
 * page with ?error=<code>[&error_description=...]. Shows a friendly toast and
 * strips the error params (keeping any MCP authorize query intact).
 */
export function useOAuthErrorToast() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (!error) return;
    const description = params.get("error_description");
    toast.error(
      OAUTH_ERROR_MESSAGES[error] ??
        description ??
        `Sign-in failed (${error.replaceAll("_", " ")})`,
    );
    params.delete("error");
    params.delete("error_description");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }, []);
}
