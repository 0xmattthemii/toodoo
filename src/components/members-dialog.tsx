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
          : "Invited — they'll join when they sign up",
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
                  aria-label={`Remove ${member.name}`}
                  onClick={() => onRemove(member.id)}
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
                    onClick={() => onRevoke(invitation.id)}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
