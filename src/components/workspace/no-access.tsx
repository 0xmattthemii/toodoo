"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

/** Why a signed-in account sees no workspace. */
export type NoAccessReason = "unverified" | "removed" | "not-invited";

const COPY: Record<NoAccessReason, { title: string; body: string }> = {
  unverified: {
    title: "Confirm your email",
    body: "You'll join the workspace as soon as you confirm this address with the link we emailed you. Then come back here.",
  },
  removed: {
    title: "You no longer have access",
    body: "An admin removed this account from the workspace. Ask them to restore it if that's a mistake.",
  },
  "not-invited": {
    title: "You're not in this workspace yet",
    body: "This account isn't a member of the workspace. Ask an admin to invite this email address.",
  },
};

/**
 * Shown, instead of the app, to an account that is signed in but has no place
 * in the workspace (see lib/workspace-access.ts).
 */
export function NoWorkspaceAccess({
  email,
  reason,
}: {
  email: string;
  reason: NoAccessReason;
}) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const { title, body } = COPY[reason];

  async function resend() {
    setSending(true);
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/",
    });
    setSending(false);
    if (error) toast.error(error.message ?? "Could not send the email");
    else toast.success("Sent — check your inbox");
  }

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted/40 p-4">
      <div className="text-3xl font-bold tracking-tight">toodoo</div>
      <Card className="w-full max-w-sm border-border/60 shadow-xl shadow-black/[0.04]">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{body}</CardDescription>
          <CardDescription className="pt-2 font-medium text-foreground">
            {email}
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex-col gap-2 border-t !py-4">
          {reason === "unverified" ? (
            <>
              <Button className="w-full" onClick={() => router.refresh()}>
                I&apos;ve confirmed it
              </Button>
              <LoadingButton
                variant="outline"
                className="w-full"
                loading={sending}
                onClick={resend}
              >
                Send the link again
              </LoadingButton>
            </>
          ) : null}
          <Button variant="ghost" className="w-full" onClick={signOut}>
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
