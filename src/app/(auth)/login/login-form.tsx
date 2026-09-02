"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { GoogleLogo } from "@/components/google-logo";
import { LoadingButton } from "@/components/loading-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

import {
  AuthLink,
  AuthSeparator,
  GoogleButton,
  LINK_PARAM,
  oauthContinuationURL,
  useOAuthErrorToast,
  withoutFlowParams,
} from "../social-auth";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  useOAuthErrorToast();

  // A Google sign-in matched this email's password account, but the account
  // hasn't verified its email so Better Auth won't merge them on its own.
  // The password sign-in below proves ownership; then Google gets attached.
  const linkGoogle = googleEnabled && params.get(LINK_PARAM) === "google";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) {
      setLoading(false);
      toast.error(error.message ?? "Could not sign in");
      return;
    }
    // Continue an OAuth authorization (MCP client connecting) if the page
    // was opened with a signed authorize query; otherwise go to the app.
    const search = window.location.search;
    const continuation = oauthContinuationURL(search);

    if (linkGoogle) {
      // Signed in — now connect Google to this account. The browser goes to
      // Google and comes back to callbackURL with the accounts merged; from
      // then on either method signs in directly.
      const query = withoutFlowParams(search).toString();
      const { error: linkError } = await authClient.linkSocial({
        provider: "google",
        callbackURL: continuation ?? "/",
        errorCallbackURL: `/login${query ? `?${query}` : ""}`,
      });
      if (!linkError) return; // navigating to Google
      // Still signed in with the password; just not linked.
      toast.error(
        linkError.message ??
          "Could not connect Google. You're signed in with your password.",
      );
    }

    if (continuation) {
      window.location.href = continuation;
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm border-border/60 shadow-xl shadow-black/[0.04]">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to continue to toodoo</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {linkGoogle ? (
          <Alert>
            <GoogleLogo />
            <AlertTitle>Connect Google to your account</AlertTitle>
            <AlertDescription>
              This email already signs in with a password. Enter it once below
              and we&apos;ll connect Google, so next time either works.{" "}
              <AuthLink href="/login">Sign in without connecting</AuthLink>
            </AlertDescription>
          </Alert>
        ) : googleEnabled ? (
          <>
            <GoogleButton />
            <AuthSeparator />
          </>
        ) : null}
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <AuthLink
                href="/forgot-password"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Forgot password?
              </AuthLink>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <LoadingButton type="submit" className="w-full" loading={loading}>
            {linkGoogle ? "Sign in and connect Google" : "Sign in"}
          </LoadingButton>
        </form>
      </CardContent>
      <CardFooter className="justify-center border-t !py-4">
        <p className="text-sm text-muted-foreground">
          No account?{" "}
          <AuthLink
            href="/signup"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign up
          </AuthLink>
        </p>
      </CardFooter>
    </Card>
  );
}
