"use client";

import { RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  deactivateWorkspaceMember,
  getWorkspaceAdminData,
  inviteToWorkspace,
  restoreWorkspaceMember,
  revokeWorkspaceInvitation,
  updateWorkspaceRole,
  updateWorkspaceSettings,
  type WorkspaceAdminData,
  type WorkspacePerson,
} from "@/actions/workspace";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingButton } from "@/components/loading-button";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tryAction } from "@/lib/action";
import type { AssignableWorkspaceRole } from "@/lib/types";
import { formatEmailDomains } from "@/lib/utils";

const ROLE_ITEMS: { value: AssignableWorkspaceRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "guest", label: "Guest" },
];

const INVITE_ROLE_ITEMS = ROLE_ITEMS.filter((item) => item.value !== "guest");

const ROLE_HELP =
  "Admins manage people and settings. Members create projects and join any they're invited to. Guests see only the projects they're invited to.";

type Result = { error?: string };

/**
 * The workspace's people, invitations and settings, for its owner and
 * admins. Loaded when opened and again after each change: it is admin-only
 * data, so it isn't part of the snapshot every member's app shell carries.
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
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, startInviting] = useTransition();
  const [removing, setRemoving] = useState<WorkspacePerson | null>(null);
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
  async function run<R extends Result>(
    action: Promise<R>,
    failure: string,
  ): Promise<R | null> {
    const result = await tryAction<R | Result>(action, { error: failure });
    if (result.error) {
      toast.error(result.error);
      return null;
    }
    await load();
    return result as R;
  }

  function onInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email"));
    startInviting(async () => {
      const result = await run(
        inviteToWorkspace(email, inviteRole),
        "Could not send the invitation",
      );
      if (!result) return;
      form.reset();
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

  async function onRoleChange(person: WorkspacePerson, role: AssignableWorkspaceRole) {
    const result = await run(
      updateWorkspaceRole(person.id, role),
      "Could not change the role",
    );
    if (result && "handedOver" in result && result.handedOver) {
      toast.info(
        `${person.name} was the only admin of ${result.handedOver} ${result.handedOver === 1 ? "project" : "projects"}; you're its admin now.`,
      );
    }
  }

  async function onRemove() {
    const person = removing;
    setConfirming(false);
    if (!person) return;
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

  const active = data?.people.filter((person) => !person.deactivated) ?? [];
  const removed = data?.people.filter((person) => person.deactivated) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Workspace</DialogTitle>
          <DialogDescription>{ROLE_HELP}</DialogDescription>
        </DialogHeader>

        {!data ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <Tabs defaultValue="people">
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="people">People</TabsTrigger>
              <TabsTrigger value="invitations">
                Invitations
                {data.invitations.length > 0 ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {data.invitations.length}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="people" className="flex flex-col gap-1 pt-2">
              <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
                {active.map((person) => (
                  <PersonRow
                    key={person.id}
                    person={person}
                    self={person.id === currentUserId}
                    onRoleChange={(role) => void onRoleChange(person, role)}
                    onRemove={() => {
                      setRemoving(person);
                      setConfirming(true);
                    }}
                  />
                ))}
                {removed.length > 0 ? (
                  <>
                    <p className="px-1 pt-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Removed
                    </p>
                    {removed.map((person) => (
                      <PersonRow
                        key={person.id}
                        person={person}
                        self={false}
                        onRestore={() =>
                          void run(
                            restoreWorkspaceMember(person.id),
                            "Could not restore them",
                          )
                        }
                      />
                    ))}
                  </>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="invitations" className="flex flex-col gap-3 pt-2">
              <form onSubmit={onInvite} className="flex gap-2">
                <Input
                  name="email"
                  type="email"
                  placeholder={
                    data.allowedDomains[0]
                      ? `teammate@${data.allowedDomains[0]}`
                      : "teammate@example.com"
                  }
                  required
                  className="flex-1"
                />
                <Select
                  value={inviteRole}
                  onValueChange={(value) =>
                    setInviteRole(value as "admin" | "member")
                  }
                  items={INVITE_ROLE_ITEMS}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVITE_ROLE_ITEMS.map((item) => (
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
              <p className="text-xs text-muted-foreground">
                To bring in someone from outside for a single project, invite
                them from that project&apos;s Manage Access instead: they join
                as a guest.
              </p>
              {data.invitations.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-3 text-center text-sm text-muted-foreground">
                  No pending invitations
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {data.invitations.map((invitation) => (
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
                          void run(
                            revokeWorkspaceInvitation(invitation.id),
                            "Could not revoke the invitation",
                          )
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="settings" className="flex flex-col gap-4 pt-2">
              <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div className="grid gap-1">
                  <Label htmlFor="signups-enabled">Allow sign-ups</Label>
                  <p className="text-xs text-muted-foreground">
                    {data.settings.signupsEnabled
                      ? "Anyone can create an account and joins as a member."
                      : "Only people with an invitation — to the workspace or to a project — can create an account."}
                  </p>
                </div>
                <Switch
                  id="signups-enabled"
                  checked={data.settings.signupsEnabled}
                  onCheckedChange={(checked) =>
                    void run(
                      updateWorkspaceSettings({ signupsEnabled: checked }),
                      "Could not save the setting",
                    )
                  }
                />
              </div>
              {data.allowedDomains.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  This deployment also limits accounts to{" "}
                  {formatEmailDomains(data.allowedDomains)} addresses
                  (AUTH_ALLOWED_EMAIL_DOMAINS), invitations included.
                </p>
              ) : null}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>

      {removing ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Remove ${removing.name}?`}
          description={
            <>
              <span className="font-medium text-foreground">
                {removing.name}
              </span>{" "}
              loses access right away and leaves every project. Their tasks
              stay where they are; projects only they administer pass to you.
              You can restore them later.
            </>
          }
          confirmLabel="Remove"
          destructive
          onConfirm={() => void onRemove()}
        />
      ) : null}
    </Dialog>
  );
}

function PersonRow({
  person,
  self,
  onRoleChange,
  onRemove,
  onRestore,
}: {
  person: WorkspacePerson;
  self: boolean;
  onRoleChange?: (role: AssignableWorkspaceRole) => void;
  onRemove?: () => void;
  onRestore?: () => void;
}) {
  // Nobody changes the owner or themselves.
  const editable = !self && person.role !== "owner" && !person.deactivated;
  return (
    <div className="flex items-center gap-3 rounded-lg px-1 py-1.5">
      <UserAvatar person={person} className="size-8" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {person.name}
          {self ? <span className="text-muted-foreground"> (you)</span> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {person.email}
          {!person.verified ? " · email not confirmed" : null}
        </p>
      </div>
      {editable && onRoleChange ? (
        <Select
          value={person.role}
          onValueChange={(value) =>
            onRoleChange(value as AssignableWorkspaceRole)
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
          {person.role}
        </Badge>
      )}
      {editable && onRemove ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${person.name} from the workspace`}
          onClick={onRemove}
        >
          <X />
        </Button>
      ) : onRestore ? (
        <Button variant="outline" size="sm" onClick={onRestore}>
          <RotateCcw />
          Restore
        </Button>
      ) : (
        <span aria-hidden className="w-7" />
      )}
    </div>
  );
}
