"use client";

import { Mail, MoreHorizontal, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";

import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

// The pieces of an access dialog — who is in a workspace or a project, who is
// invited, and what each of them can do — shared by both, so they look and
// behave the same. Invitations and confirmations open on top of the dialog
// (rendered inside its Root): Escape or a press outside closes only them.

/**
 * The dialog itself: a title, a "People" row with the count and whatever
 * actions the caller puts there, and the list, which scrolls inside a dialog
 * that grows with it up to a maximum height.
 */
export function AccessDialogContent({
  title,
  description,
  count,
  actions,
  children,
}: {
  title: React.ReactNode;
  /** For assistive technology; the dialog shows no description. */
  description: string;
  /** People in the list; omitted while loading. */
  count?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DialogContent className="flex max-h-[min(44rem,calc(100dvh-4rem))] flex-col gap-0 p-0 sm:max-w-2xl">
      <DialogHeader className="px-6 pt-6 pb-4">
        <DialogTitle className="truncate pr-6">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
      </DialogHeader>
      <div className="flex min-h-8 items-center gap-4 px-6 pb-3">
        <h3 className="text-sm font-medium">
          People
          {count !== undefined ? (
            <span className="ml-2 font-normal text-muted-foreground tabular-nums">
              {count}
            </span>
          ) : null}
        </h3>
        <div className="ml-auto flex items-center gap-4">{actions}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t px-4 py-2">
        {children}
      </div>
    </DialogContent>
  );
}

export function InviteButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button size="sm" disabled={disabled} onClick={onClick}>
      {/* Marked so the button trims its padding on the icon's side, which is
          what centres icon and label together. */}
      <UserPlus data-icon="inline-start" />
      Invite
    </Button>
  );
}

/** Placeholder rows while the list loads. */
export function AccessListSkeleton() {
  return (
    <div className="flex flex-col gap-1 py-1">
      {[0, 1, 2].map((key) => (
        <div key={key} className="flex items-center gap-3 px-2 py-2.5">
          <Skeleton className="size-8 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
      ))}
    </div>
  );
}

/**
 * One person or invitation: who, their role, and a "..." menu of what can be
 * done to them. Rows without a menu keep its room, so the roles line up.
 */
export function AccessRow({
  avatar,
  title,
  subtitle,
  role,
  menu,
  muted,
}: {
  avatar: React.ReactNode;
  title: React.ReactNode;
  subtitle: React.ReactNode;
  role: React.ReactNode;
  menu?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2.5">
      <span className={muted ? "opacity-50" : undefined}>{avatar}</span>
      <div className={muted ? "min-w-0 flex-1 opacity-60" : "min-w-0 flex-1"}>
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {role}
      <span className="flex w-8 justify-end">{menu}</span>
    </div>
  );
}

/** A name, marked when it is the signed-in user's. */
export function PersonName({ name, self }: { name: string; self: boolean }) {
  return (
    <>
      {name}
      {self ? (
        <span className="font-normal text-muted-foreground"> (you)</span>
      ) : null}
    </>
  );
}

export function InvitationAvatar() {
  return (
    <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Mail className="size-4" />
    </span>
  );
}

export function AccessSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pt-4 pb-1 text-xs font-medium text-muted-foreground">
      {children}
    </p>
  );
}

export function AccessRowMenu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={label} />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A role, as a select on every row — disabled where it can't be changed, so
 * every row reads the same. `labels` names every role the value can be;
 * `options` are the ones offered.
 */
export function RoleSelect<R extends string>({
  value,
  labels,
  options,
  disabled,
  unavailable = [],
  onChange,
}: {
  value: string;
  labels: Record<string, string>;
  options: readonly R[];
  disabled?: boolean;
  /** Offered but not selectable for this row. */
  unavailable?: readonly R[];
  onChange?: (role: R) => void;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange?.(next as R)}
      items={Object.entries(labels).map(([role, label]) => ({
        value: role,
        label,
      }))}
    >
      <SelectTrigger className="w-28" aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((role) => (
          <SelectItem
            key={role}
            value={role}
            disabled={unavailable.includes(role)}
          >
            {labels[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Inviting someone by email, on top of an access dialog. `onInvite` reports
 * whether the invitation went through; on a refusal the dialog stays open,
 * so the address can be corrected.
 */
export function InviteDialog<R extends string>({
  open,
  onOpenChange,
  title,
  description,
  roles,
  labels,
  defaultRole,
  placeholder = "teammate@example.com",
  onInvite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  roles: readonly R[];
  labels: Record<string, string>;
  defaultRole: R;
  placeholder?: string;
  onInvite: (email: string, role: R) => Promise<boolean>;
}) {
  const [role, setRole] = useState<R>(defaultRole);
  const [sending, startSending] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email"));
    startSending(async () => {
      if (!(await onInvite(email, role))) return;
      onOpenChange(false);
      setRole(defaultRole);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogHeader className="gap-1.5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form id="access-invite" onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              autoFocus
              placeholder={placeholder}
            />
          </div>
          <div className="grid gap-2">
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(next) => setRole(next as R)}
              items={roles.map((value) => ({ value, label: labels[value] }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((value) => (
                  <SelectItem key={value} value={value}>
                    {labels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </form>
        {/* The footer bleeds to the edges by the dialog's padding (p-6 here). */}
        <DialogFooter className="-mx-6 -mb-6 px-6">
          <DialogClose render={<Button variant="outline" disabled={sending} />}>
            Cancel
          </DialogClose>
          <LoadingButton type="submit" form="access-invite" loading={sending}>
            Send invitation
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
