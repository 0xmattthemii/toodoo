import { sql } from "drizzle-orm";
import { beforeEach, vi } from "vitest";

import { db } from "@/db";

// Server actions run as plain functions here. What ties them to Next — the
// request's session, cache revalidation — is replaced, and so is the one
// Better Auth call they make; everything below that (permissions, SQL,
// transactions) is the real code on a real Postgres.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", async () => {
  const { currentSession } = await import("./harness");
  return {
    getSession: vi.fn(currentSession),
    requireSession: vi.fn(currentSession),
  };
});
vi.mock("@/lib/auth", () => ({
  auth: { api: { sendVerificationEmail: vi.fn() } },
}));

beforeEach(async () => {
  // Every table the migrations created, so a new one is covered as it lands.
  const tables = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = tables.rows.map((row) => sql.identifier(row.tablename));
  await db.execute(sql`truncate table ${sql.join(names, sql`, `)} cascade`);
});
