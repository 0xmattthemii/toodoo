import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { inviteToProject, revokeInvitation } from "@/actions/members";
import { db } from "@/db";
import { projectInvitations, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { acceptPendingInvitations } from "@/lib/data";

import { as, createProject, createUser, roleIn, verifyEmail } from "./harness";

async function projectWithAdmin() {
  const admin = await createUser("Admin");
  return { admin, projectId: await createProject([[admin, "admin"]]) };
}

// An invitation is addressed to a mailbox. Only an account that has proven it
// reads that mailbox may redeem it: otherwise anyone who registers an invited
// address first walks into the project.
describe("invitations", () => {
  it("wait for a sign-up to verify its address before admitting it", async () => {
    const { admin, projectId } = await projectWithAdmin();
    const email = "newcomer@test.dev";
    expect(
      await as(admin, () => inviteToProject(projectId, email, "admin")),
    ).toMatchObject({
      invited: true,
    });

    // Someone registers the address without access to its inbox.
    const claimant = await createUser("Claimant", { verified: false });
    await db.update(user).set({ email }).where(eq(user.id, claimant.id));
    await acceptPendingInvitations(claimant.id);
    expect(await roleIn(projectId, claimant)).toBeNull();

    await verifyEmail(claimant);
    await acceptPendingInvitations(claimant.id);
    expect(await roleIn(projectId, claimant)).toBe("admin");
  });

  it("invite an existing unverified account rather than adding it", async () => {
    const { admin, projectId } = await projectWithAdmin();
    const unverified = await createUser("Unverified", { verified: false });

    const result = await as(admin, () =>
      inviteToProject(projectId, unverified.email, "admin"),
    );
    expect(result).toMatchObject({ invited: true, emailSent: true });
    await acceptPendingInvitations(unverified.id);
    expect(await roleIn(projectId, unverified)).toBeNull();

    await verifyEmail(unverified);
    await acceptPendingInvitations(unverified.id);
    expect(await roleIn(projectId, unverified)).toBe("admin");
  });

  it("re-send verification to an existing unverified account", async () => {
    const { admin, projectId } = await projectWithAdmin();
    const unverified = await createUser("Unverified", { verified: false });
    await as(admin, () =>
      inviteToProject(projectId, unverified.email, "member"),
    );
    expect(auth.api.sendVerificationEmail).toHaveBeenCalledWith({
      body: { email: unverified.email, callbackURL: `/projects/${projectId}` },
    });
  });

  it("report an email that couldn't be sent, keeping the invitation", async () => {
    const { admin, projectId } = await projectWithAdmin();
    const unverified = await createUser("Unverified", { verified: false });
    vi.mocked(auth.api.sendVerificationEmail).mockRejectedValueOnce(
      new Error("mailer down"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await as(admin, () =>
      inviteToProject(projectId, unverified.email, "member"),
    );
    expect(result).toMatchObject({ invited: true, emailSent: false });
    expect(await db.select().from(projectInvitations)).toHaveLength(1);
  });

  it("add a verified account straight away", async () => {
    const { admin, projectId } = await projectWithAdmin();
    const verified = await createUser("Verified");

    const result = await as(admin, () =>
      inviteToProject(projectId, verified.email, "member"),
    );
    expect(result).toMatchObject({
      added: true,
      member: { id: verified.id, role: "member" },
    });
    expect(await roleIn(projectId, verified)).toBe("member");
    expect(auth.api.sendVerificationEmail).not.toHaveBeenCalled();

    expect(
      await as(admin, () =>
        inviteToProject(projectId, verified.email, "member"),
      ),
    ).toEqual({
      error: "That person is already a member",
    });
  });

  it("are accepted once, however often the workspace loads", async () => {
    const { admin, projectId } = await projectWithAdmin();
    const invitee = await createUser("Invitee", { verified: false });
    await as(admin, () => inviteToProject(projectId, invitee.email, "member"));
    await verifyEmail(invitee);

    await Promise.all([
      acceptPendingInvitations(invitee.id),
      acceptPendingInvitations(invitee.id),
    ]);
    expect(await roleIn(projectId, invitee)).toBe("member");
    const [invitation] = await db.select().from(projectInvitations);
    expect(invitation.status).toBe("accepted");
  });

  it("can be revoked before they are accepted", async () => {
    const { admin, projectId } = await projectWithAdmin();
    const invitee = await createUser("Invitee", { verified: false });
    const result = await as(admin, () =>
      inviteToProject(projectId, invitee.email, "member"),
    );
    if (!result.invitation) throw new Error("not invited");

    await as(admin, () => revokeInvitation(projectId, result.invitation.id));
    await verifyEmail(invitee);
    await acceptPendingInvitations(invitee.id);
    expect(await roleIn(projectId, invitee)).toBeNull();
  });

  it("can only be revoked through their own project", async () => {
    const { admin, projectId } = await projectWithAdmin();
    const { admin: otherAdmin, projectId: otherProject } =
      await projectWithAdmin();
    const result = await as(admin, () =>
      inviteToProject(projectId, "someone@test.dev", "member"),
    );
    if (!result.invitation) throw new Error("not invited");

    await as(otherAdmin, () =>
      revokeInvitation(otherProject, result.invitation.id),
    );
    expect(await db.select().from(projectInvitations)).toHaveLength(1);
  });

  it("can only be sent by admins", async () => {
    const admin = await createUser("Admin");
    const member = await createUser("Member");
    const projectId = await createProject([
      [admin, "admin"],
      [member, "member"],
    ]);
    await expect(
      as(member, () => inviteToProject(projectId, "someone@test.dev", "admin")),
    ).rejects.toThrow("Only project admins can do this");
  });
});
