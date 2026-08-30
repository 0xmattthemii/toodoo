"use client";

import { UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  inviteToProject,
  removeMember,
  revokeInvitation,
  updateMemberRole,
} from "@/actions/members";
import { UserAvatar } from "@/components/user-avatar";
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
import type { MemberWithUser, PendingInvitation, Role } from "@/lib/types";

const ROLE_ITEMS = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

export function MembersDialog({
  projectId,
  members,
  invitations,
  currentUserId,
  isAdmin,
}: {
  projectId: string;
  members: MemberWithUser[];
  invitations: PendingInvitation[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [pending, startTransition] = useTransition();

  function onInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email"));
    startTransition(async () => {
      const result = await inviteToProject(projectId, email, inviteRole);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      form.reset();
      toast.success(
        "added" in result
          ? "Added to the project"
          : "Invited — they'll join when they sign up",
      );
    });
  }

  function onRoleChange(userId: string, role: Role) {
    startTransition(async () => {
      const result = await updateMemberRole(projectId, userId, role);
      if (result.error) toast.error(result.error);
    });
  }

  function onRemove(userId: string) {
    startTransition(async () => {
      const result = await removeMember(projectId, userId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.removedSelf) router.push("/");
    });
  }

  function onRevoke(invitationId: string) {
    startTransition(async () => {
      const result = await revokeInvitation(projectId, invitationId);
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <UserPlus />
        Members
        <Badge variant="secondary">{members.length}</Badge>
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
            <Button type="submit" disabled={pending}>
              Invite
            </Button>
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
                  <SelectTrigger size="sm" className="w-24">
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
                  disabled={pending}
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
                    disabled={pending}
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
