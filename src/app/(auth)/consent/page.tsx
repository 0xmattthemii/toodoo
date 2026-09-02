"use client";

import { useSearchParams } from "next/navigation";
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
import { Badge } from "@/components/ui/badge";

const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirm your identity",
  profile: "Read your name",
  email: "Read your email address",
  offline_access: "Keep access without asking again",
};

export default function ConsentPage() {
  return (
    <Suspense fallback={null}>
      <ConsentForm />
    </Suspense>
  );
}

function ConsentForm() {
  const searchParams = useSearchParams();
  const clientName =
    searchParams.get("client_name") || searchParams.get("client_id");
  const scopes = (searchParams.get("scope") ?? "").split(" ").filter(Boolean);
  const [pending, setPending] = useState<"accept" | "deny" | null>(null);

  async function decide(accept: boolean) {
    setPending(accept ? "accept" : "deny");
    try {
      const response = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          accept,
          oauth_query: window.location.search.replace(/^\?/, ""),
        }),
      });
      const data = await response.json();
      const redirectTo = data.url ?? data.redirect_uri;
      if (!response.ok || !redirectTo) {
        toast.error(data.error_description ?? "Could not process consent");
        setPending(null);
        return;
      }
      window.location.href = redirectTo;
    } catch {
      toast.error("Could not process consent");
      setPending(null);
    }
  }

  return (
    <Card className="w-full max-w-sm border-border/60 shadow-xl shadow-black/[0.04]">
      <CardHeader>
        <CardTitle>Authorize access</CardTitle>
        <CardDescription>
          <span className="font-medium text-foreground">{clientName}</span>{" "}
          wants to access your toodoo account.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">This will allow it to:</p>
        <ul className="grid gap-1.5">
          <li className="flex items-center gap-2 text-sm">
            <Badge variant="secondary">toodoo</Badge>
            Read and manage your projects and tasks
          </li>
          {scopes.map((scope) => (
            <li key={scope} className="flex items-center gap-2 text-sm">
              <Badge variant="outline">{scope}</Badge>
              {SCOPE_LABELS[scope] ?? ""}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="mt-4 gap-2">
        <LoadingButton
          variant="outline"
          className="flex-1"
          loading={pending === "deny"}
          disabled={pending === "accept"}
          onClick={() => decide(false)}
        >
          Deny
        </LoadingButton>
        <LoadingButton
          className="flex-1"
          loading={pending === "accept"}
          disabled={pending === "deny"}
          onClick={() => decide(true)}
        >
          Allow
        </LoadingButton>
      </CardFooter>
    </Card>
  );
}
