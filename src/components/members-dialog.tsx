"use client";

import { LogOut, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { toast } from "sonner";

import {
  inviteToProject,
  removeMember,
  revokeInvitation,
  updateMemberRole,
} from "@/actions/members";
import {
  AccessDialogContent,
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
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { Role } from "@/lib/types";
import {
  addInvitation,
  addMember,
  removeInvitation,
  removeMember as removeMembership,
  setMemberRole,
} from "@/lib/workspace";

const ROLE_LABELS: Record<Role, string> = { admin: "Admin", member: "Member" };
const ROLES: Role[] = ["admin", "member"];

/** The removal a confirmation is currently asking about. */
type Pending =
  | { kind: "member"; id: string; name: string; self: boolean }
  | { kind: "invitation"; id: string; email: string };

/**
 * Who is in a project and who is invited to it, laid out like the
 * workspace's dialog (components/access.tsx). Project admins invite people,
 * change roles and remove them; everyone else sees the list and can leave.
 */
export function MembersDialog({
  projectId,
  currentUserId,
  isAdmin,
}: {
  projectId: string;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const { mutate, membersOf, invitationsOf, projectsById } = useWorkspace();
  const project = projectsById.get(projectId);
  // Admins first, then members, each by name.
  const members = [...membersOf(projectId)].sort(
    (a, b) =>
      Number(b.role === "admin") - Number(a.role === "admin") ||
      a.name.localeCompare(b.name),
  );
  const adminCount = members.filter((member) => member.role === "admin").length;
  const invitations = isAdmin ? invitationsOf(projectId) : [];
  const [inviteOpen, setInviteOpen] = useState(false);
  // What the confirmation is about, kept after it closes so its copy doesn't
  // change mid-animation; `confirming` is what opens and closes it.
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Only inviting waits for the server: whether the address belongs to an
  // existing account (added right away) or not (invited) is its answer.
  async function onInvite(email: string, role: Role) {
    const result = await mutate({
      action: () => inviteToProject(projectId, email, role),
      failure: "Could not send the invitation",
      commit: (result) =>
        "added" in result && result.member
          ? addMember(projectId, result.member)
          : "invited" in result && result.invitation
            ? addInvitation(result.invitation)
            : null,
    });
    if (!result) return false;
    if (!result.emailSent) {
      toast.warning(
        "added" in result
          ? "Added to the project, but the email to them couldn't be sent"
          : "Invitation saved, but the email couldn't be sent. Ask them to sign up with this address",
      );
    } else {
      toast.success(
        "added" in result
          ? "Added to the project"
          : "Invited. They'll join once they confirm their email.",
      );
    }
    return true;
  }

  function onRoleChange(userId: string, role: Role) {
    void mutate({
      optimistic: setMemberRole(projectId, userId, role),
      action: () => updateMemberRole(projectId, userId, role),
      failure: "Could not change the role",
    });
  }

  function onRemove(userId: string) {
    const leave = () =>
      void mutate({
        optimistic: removeMembership(projectId, userId),
        action: () => removeMember(projectId, userId),
        failure: "Could not remove the member",
      });
    if (userId !== currentUserId) {
      leave();
      return;
    }
    // Leaving takes the project with it: navigate home in the same
    // transition, so its page never shows "not found".
    startTransition(() => {
      router.push("/");
      leave();
    });
  }

  function onRevoke(invitationId: string) {
    void mutate({
      optimistic: removeInvitation(invitationId),
      action: () => revokeInvitation(projectId, invitationId),
      failure: "Could not revoke the invitation",
    });
  }

  function ask(next: Pending) {
    setPending(next);
    setConfirming(true);
  }

  function onConfirm() {
    setConfirming(false);
    if (!pending) return;
    if (pending.kind === "member") {
      onRemove(pending.id);
    } else {
      onRevoke(pending.id);
    }
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" />}>
        <Users />
        Manage Access
      </DialogTrigger>
      <AccessDialogContent
        title={project?.name ?? "Project"}
        description="The people in this project and its invitations."
        count={members.length}
        actions={
          isAdmin ? <InviteButton onClick={() => setInviteOpen(true)} /> : null
        }
      >
        {members.map((member) => {
          const self = member.id === currentUserId;
          // The rules the server holds to, shown before anyone tries: a
          // project keeps at least one admin and at least one person.
          const soleAdmin = member.role === "admin" && adminCount <= 1;
          const cannotLeave =
            members.length <= 1
              ? "You're the only one here. Delete the project instead."
              : soleAdmin
                ? "Make someone else an admin first."
                : null;
          return (
            <AccessRow
              key={member.id}
              avatar={<UserAvatar person={member} className="size-8" />}
              title={<PersonName name={member.name} self={self} />}
              subtitle={member.guest ? `${member.email} · Guest` : member.email}
              role={
                <RoleSelect
                  value={member.role}
                  labels={ROLE_LABELS}
                  options={ROLES}
                  disabled={!isAdmin || soleAdmin}
                  // Guests never administer a project.
                  unavailable={member.guest ? ["admin"] : []}
                  onChange={(role) => onRoleChange(member.id, role)}
                />
              }
              menu={
                self || isAdmin ? (
                  <AccessRowMenu label={`Actions for ${member.name}`}>
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={cannotLeave !== null}
                      onClick={() =>
                        ask({
                          kind: "member",
                          id: member.id,
                          name: member.name,
                          self,
                        })
                      }
                    >
                      {self ? <LogOut /> : <Trash2 />}
                      {self ? "Leave project" : "Remove"}
                    </DropdownMenuItem>
                    {cannotLeave ? (
                      <p className="max-w-56 px-1.5 pt-0.5 pb-1 text-xs text-muted-foreground">
                        {cannotLeave}
                      </p>
                    ) : null}
                  </AccessRowMenu>
                ) : null
              }
            />
          );
        })}

        {invitations.length > 0 ? (
          <AccessSectionLabel>Invited</AccessSectionLabel>
        ) : null}
        {invitations.map((invitation) => (
          <AccessRow
            key={invitation.id}
            avatar={<InvitationAvatar />}
            title={invitation.email}
            subtitle="Invitation sent"
            role={
              <RoleSelect
                value={invitation.role}
                labels={ROLE_LABELS}
                options={ROLES}
                disabled
              />
            }
            menu={
              <AccessRowMenu label={`Actions for ${invitation.email}`}>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() =>
                    ask({
                      kind: "invitation",
                      id: invitation.id,
                      email: invitation.email,
                    })
                  }
                >
                  <Trash2 />
                  Revoke invitation
                </DropdownMenuItem>
              </AccessRowMenu>
            }
          />
        ))}
      </AccessDialogContent>

      {/* Inside the Root, so base-ui stacks them on this dialog: one
          backdrop, and Escape or a press outside takes only the top one
          away. `pending` outlives the confirmation, so its copy holds still
          on the way out. */}
      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title={`Invite to ${project?.name ?? "this project"}`}
        description="They'll get an email to join. Someone from outside the workspace joins as a guest and sees only this project."
        roles={ROLES}
        labels={ROLE_LABELS}
        defaultRole="member"
        onInvite={onInvite}
      />
      {pending ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={
            pending.kind === "invitation"
              ? "Revoke invitation?"
              : pending.self
                ? "Leave this project?"
                : `Remove ${pending.name}?`
          }
          description={
            pending.kind === "invitation" ? (
              <>
                <span className="font-medium text-foreground">
                  {pending.email}
                </span>{" "}
                will no longer be able to join the project with this
                invitation.
              </>
            ) : pending.self ? (
              "You will lose access to this project and its tasks. An admin has to invite you back."
            ) : (
              <>
                <span className="font-medium text-foreground">
                  {pending.name}
                </span>{" "}
                will lose access to this project. Their tasks stay where they
                are.
              </>
            )
          }
          confirmLabel={
            pending.kind === "invitation"
              ? "Revoke invitation"
              : pending.self
                ? "Leave project"
                : "Remove"
          }
          destructive
          onConfirm={onConfirm}
        />
      ) : null}
    </Dialog>
  );
}
