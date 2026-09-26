"use client";

import { Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  inviteToProject,
  removeMember,
  revokeInvitation,
  updateMemberRole,
} from "@/actions/members";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingButton } from "@/components/loading-button";
import { UserAvatar } from "@/components/user-avatar";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { Role } from "@/lib/types";
import {
  addInvitation,
  addMember,
  removeInvitation,
  removeMember as removeMembership,
  setMemberRole,
} from "@/lib/workspace";

/** The removal a confirmation is currently asking about. */
type Pending =
  | { kind: "member"; id: string; name: string; self: boolean }
  | { kind: "invitation"; id: string; email: string };

const ROLE_ITEMS = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

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
  const { mutate, membersOf, invitationsOf } = useWorkspace();
  const members = membersOf(projectId);
  const invitations = invitationsOf(projectId);
  const [inviteRole, setInviteRole] = useState<Role>("member");
  // What the confirmation is about, kept after it closes so its copy doesn't
  // change mid-animation; `confirming` is what opens and closes it.
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Only inviting waits for the server: whether the address belongs to an
  // existing account (added right away) or not (invited) is its answer.
  const [inviting, startInviting] = useTransition();

  function onInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email"));
    startInviting(async () => {
      const result = await mutate({
        action: () => inviteToProject(projectId, email, inviteRole),
        failure: "Could not send the invitation",
        commit: (result) =>
          "added" in result && result.member
            ? addMember(projectId, result.member)
            : "invited" in result && result.invitation
              ? addInvitation(result.invitation)
              : null,
      });
      if (!result) return;
      form.reset();
      toast.success(
        "added" in result
          ? "Added to the project"
          : "Invited — they'll join once they confirm their email",
      );
    });
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Project members</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Invite people by email and manage their roles."
              : "People with access to this project."}
          </DialogDescription>
        </DialogHeader>

        {isAdmin ? (
          <form onSubmit={onInvite} className="flex gap-2">
            <Input
              name="email"
              type="email"
              placeholder="teammate@example.com"
              required
              className="flex-1"
            />
            <Select
              value={inviteRole}
              onValueChange={(value) => setInviteRole(value as Role)}
              items={ROLE_ITEMS}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <LoadingButton type="submit" loading={inviting}>
              Invite
            </LoadingButton>
          </form>
        ) : null}

        <div className="flex flex-col gap-1">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-lg px-1 py-1.5"
            >
              <UserAvatar person={member} className="size-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.name}
                  {member.id === currentUserId ? (
                    <span className="text-muted-foreground"> (you)</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {member.email}
                </p>
              </div>
              {isAdmin ? (
                <Select
                  value={member.role}
                  onValueChange={(value) =>
                    onRoleChange(member.id, value as Role)
                  }
                  items={ROLE_ITEMS}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="secondary" className="capitalize">
                  {member.role}
                </Badge>
              )}
              {isAdmin || member.id === currentUserId ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    member.id === currentUserId
                      ? "Leave this project"
                      : `Remove ${member.name}`
                  }
                  onClick={() =>
                    ask({
                      kind: "member",
                      id: member.id,
                      name: member.name,
                      self: member.id === currentUserId,
                    })
                  }
                >
                  <X />
                </Button>
              ) : null}
            </div>
          ))}
        </div>

        {invitations.length > 0 && isAdmin ? (
          <>
            <Separator />
            <div className="flex flex-col gap-1">
              <p className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Pending invitations
              </p>
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center gap-3 rounded-lg px-1 py-1.5"
                >
                  <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {invitation.email}
                  </p>
                  <Badge variant="outline" className="capitalize">
                    {invitation.role}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Revoke invitation for ${invitation.email}`}
                    onClick={() =>
                      ask({
                        kind: "invitation",
                        id: invitation.id,
                        email: invitation.email,
                      })
                    }
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </DialogContent>

      {/* Inside the Root, so base-ui stacks it on this dialog: one backdrop,
          and Escape or a press outside takes only the confirmation away.
          `pending` outlives the dialog, so its copy holds still on the way
          out. */}
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
