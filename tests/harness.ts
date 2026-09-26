import { and, eq, sql } from "drizzle-orm";
import { vi } from "vitest";

import { db } from "@/db";
import {
  projectMembers,
  projects,
  taskAssignees,
  tasks,
  user,
} from "@/db/schema";
import { requireSession } from "@/lib/session";
import type { Role } from "@/lib/types";

export type TestUser = { id: string; name: string; email: string };

let signedIn: TestUser | null = null;

vi.mocked(requireSession).mockImplementation(async () => {
  if (!signedIn) throw new Error("No test user signed in");
  const now = new Date();
  return {
    user: { ...signedIn, emailVerified: true, image: null, createdAt: now, updatedAt: now },
    session: {
      id: "test-session",
      userId: signedIn.id,
      token: "test",
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
    },
  } as Awaited<ReturnType<typeof requireSession>>;
});

/**
 * Makes the next server action calls run as `who`. The session is read when
 * an action starts, so two calls started back to back can run as different
 * users (see the concurrency tests).
 */
export function signInAs(who: TestUser) {
  signedIn = who;
}

/** Runs `action` as `who`: signs in, then starts it before anyone else can. */
export function as<T>(who: TestUser, action: () => Promise<T>) {
  signInAs(who);
  return action();
}

let counter = 0;

export async function createUser(
  name: string,
  { verified = true }: { verified?: boolean } = {},
): Promise<TestUser> {
  counter += 1;
  const person = {
    id: `user-${counter}`,
    name,
    email: `${name.toLowerCase().replaceAll(" ", "-")}-${counter}@test.dev`,
  };
  await db.insert(user).values({ ...person, emailVerified: verified });
  return person;
}

export async function verifyEmail(who: TestUser) {
  await db.update(user).set({ emailVerified: true }).where(eq(user.id, who.id));
}

/** A project with the given members; the first is its creator. */
export async function createProject(members: [TestUser, Role][]) {
  const [project] = await db
    .insert(projects)
    .values({ name: "Project", createdBy: members[0][0].id })
    .returning();
  await db.insert(projectMembers).values(
    members.map(([member, role]) => ({
      projectId: project.id,
      userId: member.id,
      role,
    })),
  );
  return project.id;
}

export async function createTaskRow(
  createdBy: TestUser,
  {
    projectId = null,
    assignees = [],
  }: { projectId?: string | null; assignees?: TestUser[] } = {},
) {
  const [task] = await db
    .insert(tasks)
    .values({ title: "Task", createdBy: createdBy.id, projectId })
    .returning();
  if (assignees.length > 0) {
    await db
      .insert(taskAssignees)
      .values(assignees.map((person) => ({ taskId: task.id, userId: person.id })));
  }
  return task.id;
}

export async function roleIn(projectId: string, who: TestUser) {
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, who.id),
      ),
    );
  return row?.role ?? null;
}

export async function adminCount(projectId: string) {
  const rows = await db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.role, "admin"),
      ),
    );
  return rows.length;
}

/**
 * Holds every membership write for a moment after the application has made
 * its checks, so two requests overlap exactly where a race would bite. The
 * interleaving is a legitimate one; this only makes it reliable.
 */
export async function withSlowMembershipWrites<T>(fn: () => Promise<T>) {
  await db.execute(sql`
    create or replace function test_slow_write() returns trigger as $$
    begin perform pg_sleep(0.5); return coalesce(new, old); end
    $$ language plpgsql`);
  await db.execute(sql`
    create trigger test_slow_write before update or delete on project_members
    for each row execute function test_slow_write()`);
  try {
    return await fn();
  } finally {
    await db.execute(sql`drop trigger test_slow_write on project_members`);
    await db.execute(sql`drop function test_slow_write()`);
  }
}
