"use client";

import {
  Crown,
  Mail,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  deactivateWorkspaceMember,
  getWorkspaceAdminData,
  inviteToWorkspace,
  restoreWorkspaceMember,
  revokeWorkspaceInvitation,
  transferWorkspaceOwnership,
  updateWorkspaceRole,
  updateWorkspaceSettings,
  type WorkspaceAdminData,
  type WorkspaceInvite,
  type WorkspacePerson,
} from "@/actions/workspace";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingButton } from "@/components/loading-button";
import { UserAvatar } from "@/components/user-avatar";
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
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Switch } from "@/components/ui/switch";
import { tryAction } from "@/lib/action";
import type { AssignableWorkspaceRole, WorkspaceRole } from "@/lib/types";
import { formatEmailDomains } from "@/lib/utils";

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  guest: "Guest",
};

const ASSIGNABLE: AssignableWorkspaceRole[] = ["admin", "member", "guest"];
const INVITABLE: ("admin" | "member")[] = ["admin", "member"];

const ROLE_ITEMS = (Object.keys(ROLE_LABELS) as WorkspaceRole[]).map(
  (value) => ({ value, label: ROLE_LABELS[value] }),
);

/** Owner first, then admins, members and guests, each by name. */
const ORDER: Record<WorkspaceRole, number> = {
  owner: 0,
  admin: 1,
  member: 2,
  guest: 3,
};

/** What a confirmation is currently asking about. */
type Pending =
  | { kind: "remove"; person: WorkspacePerson }
  | { kind: "transfer"; person: WorkspacePerson }
  | { kind: "revoke"; invitation: WorkspaceInvite };

type Result = { error?: string };

/**
 * The workspace's people — members, pending invitations, removed accounts —
 * and its sign-up setting, on one page, for its owner and admins. Inviting
 * and every confirmation open on top of it; dismissing one of those brings
 * this back as it was. The dialog keeps one size whatever it lists: the list
 * scrolls inside it.
 *
 * The data is admin-only, so it isn't part of the snapshot every app shell
 * carries; it is loaded on open and again after each change.
 */
export function WorkspaceDialog({
  open,
  onOpenChange,
  currentUserId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
}) {
  const [data, setData] = useState<WorkspaceAdminData | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  // Kept after the confirmation closes so its copy holds still on the way out.
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    const result = await tryAction(getWorkspaceAdminData(), {
      error: "Could not load the workspace",
    });
    if ("error" in result) toast.error(result.error);
    else setData(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on open
    if (open) void load();
  }, [open, load]);

  /** Runs a change, reports a refusal, and reloads what the dialog shows. */
  const run = useCallback(
    async <R extends Result>(action: Promise<R>, failure: string) => {
      const result = await tryAction<R | Result>(action, { error: failure });
      if (result.error) {
        toast.error(result.error);
        return null;
      }
      await load();
      return result as R;
    },
    [load],
  );

  const me = data?.people.find((person) => person.id === currentUserId);
  const isOwner = me?.role === "owner";

  const active = (data?.people ?? [])
    .filter((person) => !person.deactivated)
    .sort(
      (a, b) => ORDER[a.role] - ORDER[b.role] || a.name.localeCompare(b.name),
    );
  const removed = (data?.people ?? []).filter((person) => person.deactivated);

  function ask(next: Pending) {
    setPending(next);
    setConfirming(true);
  }

  async function onRoleChange(
    person: WorkspacePerson,
    role: AssignableWorkspaceRole,
  ) {
    if (role === person.role) return;
    const result = await run(
      updateWorkspaceRole(person.id, role),
      "Could not change the role",
    );
    if (result && "handedOver" in result && result.handedOver) {
      toast.info(
        `${person.name} was the only admin of ${result.handedOver} ${result.handedOver === 1 ? "project" : "projects"}; you administer ${result.handedOver === 1 ? "it" : "them"} now.`,
      );
    }
  }

  async function onConfirm() {
    setConfirming(false);
    if (!pending) return;
    if (pending.kind === "revoke") {
      await run(
        revokeWorkspaceInvitation(pending.invitation.id),
        "Could not revoke the invitation",
      );
      return;
    }
    const { person } = pending;
    if (pending.kind === "transfer") {
      const result = await run(
        transferWorkspaceOwnership(person.id),
        "Could not transfer the workspace",
      );
      if (result) toast.success(`${person.name} now owns the workspace`);
      return;
    }
    const result = await run(
      deactivateWorkspaceMember(person.id),
      "Could not remove them",
    );
    if (!result) return;
    toast.success(
      "handedOver" in result && result.handedOver
        ? `${person.name} was removed. You now administer ${result.handedOver} of their projects.`
        : `${person.name} was removed`,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(44rem,calc(100dvh-4rem))] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="gap-1.5 px-6 pt-6 pb-5">
          <DialogTitle>Workspace</DialogTitle>
          <DialogDescription>
            Everyone on this toodoo, and who can join it.
          </DialogDescription>
        </DialogHeader>

        <div className="mx-6 flex items-center justify-between gap-6 rounded-lg border px-4 py-3.5">
          <div className="grid gap-1">
            <Label htmlFor="signups-enabled">Allow sign-ups</Label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {!data
                ? " "
                : data.settings.signupsEnabled
                  ? "Anyone can create an account and joins as a member."
                  : "Only people with an invitation — to the workspace or to a project — can create an account."}
              {data && data.allowedDomains.length > 0
                ? ` Limited to ${formatEmailDomains(data.allowedDomains)} addresses.`
                : null}
            </p>
          </div>
          <Switch
            id="signups-enabled"
            disabled={!data}
            checked={data?.settings.signupsEnabled ?? false}
            onCheckedChange={(checked) =>
              void run(
                updateWorkspaceSettings({ signupsEnabled: checked }),
                "Could not save the setting",
              )
            }
          />
        </div>

        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          <h3 className="text-sm font-medium">
            People
            {data ? (
              <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                {active.length}
              </span>
            ) : null}
          </h3>
          <Button size="sm" disabled={!data} onClick={() => setInviteOpen(true)}>
            <UserPlus />
            Invite
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t px-4 py-2">
          {!data ? (
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
          ) : (
            <>
              {active.map((person) => {
                const self = person.id === currentUserId;
                const manageable = !self && person.role !== "owner";
                const canTransfer =
                  isOwner && !self && person.role !== "guest";
                return (
                  <Row
                    key={person.id}
                    avatar={<UserAvatar person={person} className="size-8" />}
                    title={
                      <>
                        {person.name}
                        {self ? (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            (you)
                          </span>
                        ) : null}
                      </>
                    }
                    subtitle={
                      person.verified
                        ? person.email
                        : `${person.email} · email not confirmed`
                    }
                    role={
                      <RoleSelect
                        value={person.role}
                        // The owner's role only changes by a transfer, and
                        // nobody changes their own.
                        disabled={!manageable}
                        options={ASSIGNABLE}
                        onChange={(role) => void onRoleChange(person, role)}
                      />
                    }
                    menu={
                      manageable || canTransfer ? (
                        <RowMenu label={`Actions for ${person.name}`}>
                          {canTransfer ? (
                            <DropdownMenuItem
                              onClick={() => ask({ kind: "transfer", person })}
                            >
                              <Crown />
                              Transfer ownership
                            </DropdownMenuItem>
                          ) : null}
                          {canTransfer && manageable ? (
                            <DropdownMenuSeparator />
                          ) : null}
                          {manageable ? (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => ask({ kind: "remove", person })}
                            >
                              <Trash2 />
                              Remove from workspace
                            </DropdownMenuItem>
                          ) : null}
                        </RowMenu>
                      ) : null
                    }
                  />
                );
              })}

              {data.invitations.length > 0 ? (
                <SectionLabel>Invited</SectionLabel>
              ) : null}
              {data.invitations.map((invitation) => (
                <Row
                  key={invitation.id}
                  avatar={
                    <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Mail className="size-4" />
                    </span>
                  }
                  title={invitation.email}
                  subtitle="Waiting for them to sign up and confirm their email"
                  role={
                    <RoleSelect value={invitation.role} disabled options={INVITABLE} />
                  }
                  menu={
                    <RowMenu label={`Actions for ${invitation.email}`}>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => ask({ kind: "revoke", invitation })}
                      >
                        <Trash2 />
                        Revoke invitation
                      </DropdownMenuItem>
                    </RowMenu>
                  }
                />
              ))}

              {removed.length > 0 ? <SectionLabel>Removed</SectionLabel> : null}
              {removed.map((person) => (
                <Row
                  key={person.id}
                  muted
                  avatar={<UserAvatar person={person} className="size-8" />}
                  title={person.name}
                  subtitle={person.email}
                  role={
                    <RoleSelect value={person.role} disabled options={ASSIGNABLE} />
                  }
                  menu={
                    <RowMenu label={`Actions for ${person.name}`}>
                      <DropdownMenuItem
                        onClick={() =>
                          void run(
                            restoreWorkspaceMember(person.id),
                            "Could not restore them",
                          )
                        }
                      >
                        <RotateCcw />
                        Restore access
                      </DropdownMenuItem>
                    </RowMenu>
                  }
                />
              ))}
            </>
          )}
        </div>

        <p className="border-t px-6 py-3.5 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Admins</span> manage
          people and settings.{" "}
          <span className="font-medium text-foreground">Members</span> create
          projects and join any they&apos;re invited to.{" "}
          <span className="font-medium text-foreground">Guests</span> see only
          the projects they&apos;re invited to.
        </p>
      </DialogContent>

      {/* Rendered inside this dialog's Root, so base-ui stacks them on it:
          Escape or a press outside closes only the one on top. */}
      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        allowedDomains={data?.allowedDomains ?? []}
        onInvited={load}
      />
      {pending ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          {...confirmCopy(pending)}
          onConfirm={() => void onConfirm()}
        />
      ) : null}
    </Dialog>
  );
}

function confirmCopy(pending: Pending) {
  switch (pending.kind) {
    case "remove":
      return {
        title: `Remove ${pending.person.name}?`,
        description: (
          <>
            <span className="font-medium text-foreground">
              {pending.person.name}
            </span>{" "}
            loses access right away and leaves every project. Their tasks stay
            where they are; projects only they administer pass to you. You can
            restore them later.
          </>
        ),
        confirmLabel: "Remove",
        destructive: true,
      };
    case "transfer":
      return {
        title: `Transfer the workspace to ${pending.person.name}?`,
        description: (
          <>
            <span className="font-medium text-foreground">
              {pending.person.name}
            </span>{" "}
            becomes the owner and you become an admin. Only they can transfer
            it back.
          </>
        ),
        confirmLabel: "Transfer ownership",
        destructive: false,
      };
    case "revoke":
      return {
        title: "Revoke invitation?",
        description: (
          <>
            <span className="font-medium text-foreground">
              {pending.invitation.email}
            </span>{" "}
            will no longer be able to join with this invitation.
          </>
        ),
        confirmLabel: "Revoke invitation",
        destructive: true,
      };
  }
}

function Row({
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
  menu: React.ReactNode;
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
      {/* Keeps the role column aligned on rows without actions. */}
      <span className="flex w-8 justify-end">{menu}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pt-4 pb-1 text-xs font-medium text-muted-foreground">
      {children}
    </p>
  );
}

function RoleSelect<R extends WorkspaceRole>({
  value,
  options,
  disabled,
  onChange,
}: {
  value: WorkspaceRole;
  options: R[];
  disabled?: boolean;
  onChange?: (role: R) => void;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange?.(next as R)}
      items={ROLE_ITEMS}
    >
      <SelectTrigger className="w-28" aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((role) => (
          <SelectItem key={role} value={role}>
            {ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RowMenu({
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
 * Inviting someone to the workspace, on top of the workspace dialog. Stays
 * open on a refusal, so the address can be corrected.
 */
function InviteDialog({
  open,
  onOpenChange,
  allowedDomains,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowedDomains: string[];
  onInvited: () => Promise<void>;
}) {
  const [role, setRole] = useState<"admin" | "member">("member");
  const [sending, startSending] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email"));
    startSending(async () => {
      const result = await tryAction(inviteToWorkspace(email, role), {
        error: "Could not send the invitation",
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      onOpenChange(false);
      setRole("member");
      await onInvited();
      if ("emailSent" in result && !result.emailSent) {
        toast.warning(
          "Saved, but the email couldn't be sent. Ask them to sign up with this address.",
        );
      } else {
        toast.success(
          "added" in result
            ? "Added to the workspace"
            : "Invited — they'll join once they confirm their email",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogHeader className="gap-1.5">
          <DialogTitle>Invite to the workspace</DialogTitle>
          <DialogDescription>
            They get an email to sign up with this address. To bring in someone
            for a single project, invite them from that project instead: they
            join as a guest.
          </DialogDescription>
        </DialogHeader>
        <form id="workspace-invite" onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              autoFocus
              placeholder={
                allowedDomains[0]
                  ? `teammate@${allowedDomains[0]}`
                  : "teammate@example.com"
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(next) => setRole(next as "admin" | "member")}
              items={ROLE_ITEMS}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVITABLE.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ROLE_LABELS[value]}
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
          <LoadingButton type="submit" form="workspace-invite" loading={sending}>
            Send invitation
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
