"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const newPassword = String(
      new FormData(event.currentTarget).get("password"),
    );
    setLoading(true);
    const { error } = await authClient.resetPassword({ newPassword, token });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "This reset link is invalid or expired");
      return;
    }
    toast.success("Password updated — sign in with your new password");
    router.push("/login");
  }

  if (!token) {
    return (
      <Card className="w-full max-w-sm border-border/60 shadow-xl shadow-black/[0.04]">
        <CardHeader>
          <CardTitle>Invalid reset link</CardTitle>
          <CardDescription>
            This link is missing its token. Request a new one below.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            <Link href="/forgot-password" className="text-foreground underline">
              Request a new reset link
            </Link>
          </p>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm border-border/60 shadow-xl shadow-black/[0.04]">
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>
          Set a new password for your toodoo account.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              autoFocus
            />
          </div>
        </CardContent>
        <CardFooter className="mt-6 flex-col gap-3">
          <LoadingButton type="submit" className="w-full" loading={loading}>
            Update password
          </LoadingButton>
        </CardFooter>
      </form>
    </Card>
  );
}
