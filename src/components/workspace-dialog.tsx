"use client";

import { Crown, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import {
  AccessDialogContent,
  AccessListSkeleton,
  AccessRow,
  AccessRowMenu,
  AccessSectionLabel,
  InvitationAvatar,
  InviteButton,
  InviteDialog,
  PersonName,
  RoleSelect,
} from "@/components/access";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { UserAvatar } from "@/components/user-avatar";
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
const INVITABLE = ["admin", "member"] as const;

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
 * The workspace's people (members, pending invitations, removed accounts)
 * and its sign-up setting, for its owner and admins. Laid out like a
 * project's access dialog (components/access.tsx).
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

  async function onInvite(email: string, role: (typeof INVITABLE)[number]) {
    const result = await run(
      inviteToWorkspace(email, role),
      "Could not send the invitation",
    );
    if (!result) return false;
    if ("emailSent" in result && !result.emailSent) {
      toast.warning(
        "Saved, but the email couldn't be sent. Ask them to sign up with this address.",
      );
    } else {
      toast.success(
        "added" in result
          ? "Added to the workspace"
          : "Invited. They'll join once they confirm their email.",
      );
    }
    return true;
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
      <AccessDialogContent
        title="Workspace"
        description="The people in this workspace, its invitations, and whether anyone can sign up."
        count={data ? active.length : undefined}
        actions={
          <>
            {/* Off: only invited addresses can create an account. */}
            <label
              className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
              title={
                data?.allowedDomains.length
                  ? `Limited to ${formatEmailDomains(data.allowedDomains)} addresses`
                  : undefined
              }
            >
              <Switch
                size="sm"
                disabled={!data}
                checked={data?.settings.signupsEnabled ?? false}
                onCheckedChange={(checked) =>
                  void run(
                    updateWorkspaceSettings({ signupsEnabled: checked }),
                    "Could not save the setting",
                  )
                }
              />
              Allow sign-ups
            </label>
            <InviteButton disabled={!data} onClick={() => setInviteOpen(true)} />
          </>
        }
      >
        {!data ? (
          <AccessListSkeleton />
        ) : (
          <>
            {active.map((person) => {
              const self = person.id === currentUserId;
              const manageable = !self && person.role !== "owner";
              const canTransfer = isOwner && !self && person.role !== "guest";
              return (
                <AccessRow
                  key={person.id}
                  avatar={<UserAvatar person={person} className="size-8" />}
                  title={<PersonName name={person.name} self={self} />}
                  subtitle={
                    person.verified
                      ? person.email
                      : `${person.email} · email not confirmed`
                  }
                  role={
                    <RoleSelect
                      value={person.role}
                      labels={ROLE_LABELS}
                      options={ASSIGNABLE}
                      // The owner's role only changes by a transfer, and
                      // nobody changes their own.
                      disabled={!manageable}
                      onChange={(role) => void onRoleChange(person, role)}
                    />
                  }
                  menu={
                    manageable || canTransfer ? (
                      <AccessRowMenu label={`Actions for ${person.name}`}>
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
                            Remove
                          </DropdownMenuItem>
                        ) : null}
                      </AccessRowMenu>
                    ) : null
                  }
                />
              );
            })}

            {data.invitations.length > 0 ? (
              <AccessSectionLabel>Invited</AccessSectionLabel>
            ) : null}
            {data.invitations.map((invitation) => (
              <AccessRow
                key={invitation.id}
                avatar={<InvitationAvatar />}
                title={invitation.email}
                subtitle="Invitation sent"
                role={
                  <RoleSelect
                    value={invitation.role}
                    labels={ROLE_LABELS}
                    options={INVITABLE}
                    disabled
                  />
                }
                menu={
                  <AccessRowMenu label={`Actions for ${invitation.email}`}>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => ask({ kind: "revoke", invitation })}
                    >
                      <Trash2 />
                      Revoke invitation
                    </DropdownMenuItem>
                  </AccessRowMenu>
                }
              />
            ))}

            {removed.length > 0 ? (
              <AccessSectionLabel>Removed</AccessSectionLabel>
            ) : null}
            {removed.map((person) => (
              <AccessRow
                key={person.id}
                muted
                avatar={<UserAvatar person={person} className="size-8" />}
                title={person.name}
                subtitle={person.email}
                role={
                  <RoleSelect
                    value={person.role}
                    labels={ROLE_LABELS}
                    options={ASSIGNABLE}
                    disabled
                  />
                }
                menu={
                  <AccessRowMenu label={`Actions for ${person.name}`}>
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
                  </AccessRowMenu>
                }
              />
            ))}
          </>
        )}
      </AccessDialogContent>

      {/* Inside this dialog's Root, so base-ui stacks them on it. */}
      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Invite to the workspace"
        description="They'll get an email to join."
        roles={INVITABLE}
        labels={ROLE_LABELS}
        defaultRole="member"
        placeholder={
          data?.allowedDomains[0]
            ? `teammate@${data.allowedDomains[0]}`
            : undefined
        }
        onInvite={onInvite}
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
