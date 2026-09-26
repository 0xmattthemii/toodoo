import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { inviteToProject } from "@/actions/members";
import { db } from "@/db";
import { projectInvitations, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { acceptPendingInvitations } from "@/lib/data";

import {
  as,
  createProject,
  createUser,
  roleIn,
  verifyEmail,
} from "./harness";

// An invitation is addressed to a mailbox. Only an account that has proven
// it reads that mailbox may redeem it — otherwise anyone who registers an
// invited address first walks into the project.
describe("invitations", () => {
  it("keeps an invitation pending for an unverified sign-up, then honours it once verified", async () => {
    const admin = await createUser("Admin");
    const projectId = await createProject([[admin, "admin"]]);
    const email = "newcomer@test.dev";

    const result = await as(admin, () => inviteToProject(projectId, email, "admin"));
    expect(result).toMatchObject({ invited: true });

    // Someone registers the address without access to its inbox.
    const claimant = await createUser("Claimant", { verified: false });
    await db.update(user).set({ email }).where(eq(user.id, claimant.id));
    await acceptPendingInvitations(claimant.id);
    expect(await roleIn(projectId, claimant)).toBeNull();

    await verifyEmail(claimant);
    await acceptPendingInvitations(claimant.id);
    expect(await roleIn(projectId, claimant)).toBe("admin");
  });

  it("invites an existing unverified account instead of adding it, and re-sends verification", async () => {
    const admin = await createUser("Admin");
    const projectId = await createProject([[admin, "admin"]]);
    const unverified = await createUser("Unverified", { verified: false });

    for (const role of ["member", "admin"] as const) {
      const other = role === "admin" ? await createUser("Other", { verified: false }) : unverified;
      const result = await as(admin, () => inviteToProject(projectId, other.email, role));
      expect(result).toMatchObject({ invited: true });
      expect(await roleIn(projectId, other)).toBeNull();
      await acceptPendingInvitations(other.id);
      expect(await roleIn(projectId, other)).toBeNull();
    }
    expect(vi.mocked(auth.api.sendVerificationEmail)).toHaveBeenCalledWith({
      body: { email: unverified.email, callbackURL: `/projects/${projectId}` },
    });

    await verifyEmail(unverified);
    await acceptPendingInvitations(unverified.id);
    expect(await roleIn(projectId, unverified)).toBe("member");
  });

  it("adds a verified account straight away", async () => {
    const admin = await createUser("Admin");
    const projectId = await createProject([[admin, "admin"]]);
    const verified = await createUser("Verified");

    const result = await as(admin, () => inviteToProject(projectId, verified.email, "member"));
    expect(result).toMatchObject({ added: true, member: { id: verified.id, role: "member" } });
    expect(await roleIn(projectId, verified)).toBe("member");

    const again = await as(admin, () => inviteToProject(projectId, verified.email, "member"));
    expect(again).toEqual({ error: "That person is already a member" });
  });

  it("accepts an invitation once, however often the workspace loads", async () => {
    const admin = await createUser("Admin");
    const projectId = await createProject([[admin, "admin"]]);
    const invitee = await createUser("Invitee", { verified: false });
    await as(admin, () => inviteToProject(projectId, invitee.email, "member"));
    await verifyEmail(invitee);

    await Promise.all([
      acceptPendingInvitations(invitee.id),
      acceptPendingInvitations(invitee.id),
    ]);
    expect(await roleIn(projectId, invitee)).toBe("member");
    const [invitation] = await db
      .select()
      .from(projectInvitations)
      .where(eq(projectInvitations.projectId, projectId));
    expect(invitation.status).toBe("accepted");
  });

  it("only lets admins invite", async () => {
    const admin = await createUser("Admin");
    const member = await createUser("Member");
    const projectId = await createProject([[admin, "admin"], [member, "member"]]);
    await expect(
      as(member, () => inviteToProject(projectId, "someone@test.dev", "admin")),
    ).rejects.toThrow("Only project admins can do this");
  });
});
