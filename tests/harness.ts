import { AsyncLocalStorage } from "node:async_hooks";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  projectMembers,
  projects,
  taskAssignees,
  tasks,
  user,
} from "@/db/schema";
import type { requireSession } from "@/lib/session";
import type { Role } from "@/lib/types";

export type TestUser = { id: string; name: string; email: string };

const signedIn = new AsyncLocalStorage<TestUser>();

/**
 * What the mocked `requireSession` returns (see setup.ts): the user the
 * surrounding `as()` call runs as. Each call carries its own, so actions
 * started side by side run as different users, and one made outside `as()`
 * fails instead of quietly running as whoever went before.
 */
export async function currentSession() {
  const who = signedIn.getStore();
  if (!who) throw new Error("Call server actions inside as(user, ...)");
  const now = new Date();
  return {
    user: {
      ...who,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: `session-${who.id}`,
      userId: who.id,
      token: "test",
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
    },
  } as Awaited<ReturnType<typeof requireSession>>;
}

/** Runs `action` as `who`, the way a request with their session would. */
export function as<T>(who: TestUser, action: () => Promise<T>) {
  return signedIn.run(who, action);
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
      .values(
        assignees.map((person) => ({ taskId: task.id, userId: person.id })),
      );
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

/**
 * Resolves once a membership write is being held by withSlowMembershipWrites
 * — i.e. its request holds the project lock — so a second request can be
 * started knowing it will queue behind the first.
 */
export async function untilMembershipWriteHeld() {
  for (let waited = 0; waited < 5_000; waited += 20) {
    const { rows } = await db.execute(sql`
      select 1 from pg_stat_activity
      where state = 'active' and query ilike '%"project_members"%'
        and pid <> pg_backend_pid()`);
    if (rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("No membership write started");
}
