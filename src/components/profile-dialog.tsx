"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { LoadingButton } from "@/components/loading-button";
import { UserAvatar } from "@/components/user-avatar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";

export function ProfileDialog({
  user,
  open,
  onOpenChange,
}: {
  user: { name: string; email: string; image?: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [savingName, startNameTransition] = useTransition();
  const [savingPassword, startPasswordTransition] = useTransition();
  const [passwordFormKey, setPasswordFormKey] = useState(0);

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

        <form
          key={passwordFormKey}
          onSubmit={onChangePassword}
          className="grid gap-4"
        >
          <div className="grid gap-1">
            <p className="text-sm font-medium">Change password</p>
            <p className="text-xs text-muted-foreground">
              You&apos;ll stay signed in here; other devices are signed out.
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
      </DialogContent>
    </Dialog>
  );
}
