"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { LoadingButton } from "@/components/loading-button";
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
import { formatEmailDomains } from "@/lib/utils";

import {
  AuthLink,
  AuthSeparator,
  GoogleButton,
  oauthContinuationURL,
  useOAuthErrorToast,
} from "../social-auth";

export function SignupForm({
  googleEnabled,
  allowedDomains,
}: {
  googleEnabled: boolean;
  allowedDomains: string[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  useOAuthErrorToast();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Could not create account");
      return;
    }
    // Continue an OAuth authorization (MCP client connecting) if the page
    // was opened with a signed authorize query; otherwise go to the app.
    const continuation = oauthContinuationURL(window.location.search);
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
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>
          {allowedDomains.length
            ? `Sign-ups are limited to ${formatEmailDomains(allowedDomains)} emails`
            : "Start organizing your work"}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {googleEnabled ? (
          <>
            <GoogleButton />
            <AuthSeparator />
          </>
        ) : null}
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="Ada Lovelace"
              autoComplete="name"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder={
                allowedDomains.length
                  ? `you@${allowedDomains[0]}`
                  : "you@example.com"
              }
              autoComplete="email"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <LoadingButton type="submit" className="w-full" loading={loading}>
            Sign up
          </LoadingButton>
        </form>
      </CardContent>
      <CardFooter className="justify-center border-t !py-4">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <AuthLink
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </AuthLink>
        </p>
      </CardFooter>
    </Card>
  );
}
