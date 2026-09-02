"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { GoogleLogo } from "@/components/google-logo";
import { LoadingButton } from "@/components/loading-button";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";


export function ProfileDialog({
  user,
  googleEnabled,
  open,
  onOpenChange,
}: {
  user: { name: string; email: string; image?: string | null };
  googleEnabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [savingName, startNameTransition] = useTransition();
  const [savingPassword, startPasswordTransition] = useTransition();
  const [passwordFormKey, setPasswordFormKey] = useState(0);

  // Sign-in methods attached to this account. Loaded on open so the dialog
  // reflects a Google link or password set since the page was rendered.
  const [providers, setProviders] = useState<string[] | null>(null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [sendingSetPassword, startSetPasswordTransition] = useTransition();
  const [setPasswordSent, setSetPasswordSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    authClient.listAccounts().then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        toast.error("Could not load your sign-in methods");
        setProviders([]);
        return;
      }
      setProviders(data.map((account) => account.providerId));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const hasPassword = providers?.includes("credential") ?? false;
  const hasGoogle = providers?.includes("google") ?? false;

  function onSaveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    startNameTransition(async () => {
      const { error } = await authClient.updateUser({ name });
      if (error) {
        toast.error(error.message ?? "Could not update your name");
        return;
      }
      toast.success("Name updated");
      router.refresh();
    });
  }

  async function onConnectGoogle() {
    setLinkingGoogle(true);
    // Better Auth links the Google identity to the signed-in user and only
    // accepts a Google account with this same email; errors land back on the
    // login page's toast handler.
    const { error } = await authClient.linkSocial({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/login",
    });
    if (error) {
      toast.error(error.message ?? "Could not connect Google");
      setLinkingGoogle(false);
    }
  }

  function onSetPassword() {
    // Accounts created with Google have no password. Setting one goes through
    // the reset-link flow, which creates the password credential on the
    // account — no current password needed.
    startSetPasswordTransition(async () => {
      const { error } = await authClient.requestPasswordReset({
        email: user.email,
        redirectTo: "/reset-password",
      });
      if (error) {
        toast.error(error.message ?? "Could not send the email");
        return;
      }
      setSetPasswordSent(true);
    });
  }

  function onChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword"));
    const newPassword = String(form.get("newPassword"));
    startPasswordTransition(async () => {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (error) {
        toast.error(error.message ?? "Could not change your password");
        return;
      }
      toast.success("Password changed");
      setPasswordFormKey((key) => key + 1);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="sr-only">Profile</DialogTitle>

        <div className="flex items-center gap-4">
          <UserAvatar
            person={{ name: user.name, image: user.image ?? null }}
            className="size-14"
            textClassName="text-lg font-medium"
          />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>

        <form onSubmit={onSaveName} className="mt-2 grid gap-2">
          <Label htmlFor="profile-name">Name</Label>
          <div className="flex gap-2">
            <Input
              id="profile-name"
              name="name"
              defaultValue={user.name}
              autoComplete="name"
              required
              className="flex-1"
            />
            <LoadingButton
              type="submit"
              variant="outline"
              loading={savingName}
            >
              Save
            </LoadingButton>
          </div>
        </form>

        <Separator className="my-2" />

        <div className="grid gap-3">
          <div className="grid gap-1">
            <p className="text-sm font-medium">Sign-in methods</p>
            <p className="text-xs text-muted-foreground">
              Connect both and use whichever is handy.
            </p>
          </div>

          {providers === null ? (
            <div className="grid gap-2" aria-hidden>
              {googleEnabled ? <Skeleton className="h-9 rounded-lg" /> : null}
              <Skeleton className="h-9 rounded-lg" />
            </div>
          ) : (
            <div className="grid gap-2">
              {googleEnabled ? (
                <div className="flex h-9 items-center gap-2 rounded-lg border px-3 text-sm">
                  <GoogleLogo />
                  <span className="flex-1">Google</span>
                  {hasGoogle ? (
                    <Badge variant="secondary">
                      <Check />
                      Connected
                    </Badge>
                  ) : (
                    <LoadingButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-mr-2 h-7"
                      loading={linkingGoogle}
                      onClick={onConnectGoogle}
                    >
                      Connect
                    </LoadingButton>
                  )}
                </div>
              ) : null}
              <div className="flex h-9 items-center gap-2 rounded-lg border px-3 text-sm">
                <span className="flex-1">Password</span>
                {hasPassword ? (
                  <Badge variant="secondary">
                    <Check />
                    Set
                  </Badge>
                ) : setPasswordSent ? (
                  <span className="text-xs text-muted-foreground">
                    Check your email for a link
                  </span>
                ) : (
                  <LoadingButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-mr-2 h-7"
                    loading={sendingSetPassword}
                    onClick={onSetPassword}
                  >
                    Set a password
                  </LoadingButton>
                )}
              </div>
            </div>
          )}
        </div>

        {hasPassword ? (
          <>
            <Separator className="my-2" />
            <form
              key={passwordFormKey}
              onSubmit={onChangePassword}
              className="grid gap-4"
            >
              <div className="grid gap-1">
                <p className="text-sm font-medium">Change password</p>
                <p className="text-xs text-muted-foreground">
                  You&apos;ll stay signed in here; other devices are signed
                  out.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="profile-current-password">Current</Label>
                  <Input
                    id="profile-current-password"
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="profile-new-password">New</Label>
                  <Input
                    id="profile-new-password"
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <LoadingButton
                  type="submit"
                  variant="outline"
                  loading={savingPassword}
                >
                  Update password
                </LoadingButton>
              </div>
            </form>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
