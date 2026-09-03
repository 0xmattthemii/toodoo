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
import { cn } from "@/lib/utils";


const CHANGE_PASSWORD_HEADING = {
  title: "Change password",
  description: "You'll stay signed in here; other devices are signed out.",
};

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

  const loading = providers === null;
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

          {/* The rows themselves are always real — only the state on the right
              is loaded — so nothing moves when the providers arrive. */}
          <div className="grid gap-2">
            {googleEnabled ? (
              <MethodRow icon={<GoogleLogo />} label="Google">
                {loading ? (
                  <StateSkeleton className="w-24" />
                ) : hasGoogle ? (
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
              </MethodRow>
            ) : null}
            <MethodRow label="Password">
              {loading ? (
                <StateSkeleton className="w-14" />
              ) : hasPassword ? (
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
            </MethodRow>
          </div>
        </div>

        {/* Whether this section exists depends on the providers, so while they
            load it is mirrored by a skeleton of the same height — the common
            case is an account that has a password. */}
        {loading ? (
          <>
            <Separator className="my-2" />
            <div className="grid gap-4" aria-hidden>
              <SectionHeading {...CHANGE_PASSWORD_HEADING} loading />
              <div className="grid grid-cols-2 gap-3">
                {[0, 1].map((column) => (
                  <div key={column} className="grid gap-2">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-8 rounded-lg" />
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <Skeleton className="h-8 w-32 rounded-lg" />
              </div>
            </div>
          </>
        ) : hasPassword ? (
          <>
            <Separator className="my-2" />
            <form
              key={passwordFormKey}
              onSubmit={onChangePassword}
              className="grid gap-4"
            >
              <SectionHeading {...CHANGE_PASSWORD_HEADING} />
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

/** One sign-in method: fixed-height row whose right side holds its state. */
function MethodRow({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-lg border px-3 text-sm">
      {icon}
      <span className="flex-1">{label}</span>
      {children}
    </div>
  );
}

/** Placeholder shaped like the badge a loaded method row shows. */
function StateSkeleton({ className }: { className: string }) {
  return <Skeleton className={cn("h-5 rounded-4xl", className)} aria-hidden />;
}

/**
 * Title and one-line explainer for a section. `loading` swaps the text for
 * skeletons of the same lines, so the block keeps its height at any width.
 */
function SectionHeading({
  title,
  description,
  loading = false,
}: {
  title: string;
  description: string;
  loading?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <p className="text-sm font-medium">
        {loading ? <TextSkeleton>{title}</TextSkeleton> : title}
      </p>
      <p className="text-xs text-muted-foreground">
        {loading ? <TextSkeleton>{description}</TextSkeleton> : description}
      </p>
    </div>
  );
}

/**
 * Inline placeholder for a run of text: the real string, made transparent, so
 * it wraps into exactly the lines it will occupy once loaded.
 */
function TextSkeleton({ children }: { children: string }) {
  return (
    <span className="animate-pulse rounded-md bg-muted text-transparent select-none">
      {children}
    </span>
  );
}
