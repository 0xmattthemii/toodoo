import { sql } from "drizzle-orm";
import { beforeEach, vi } from "vitest";

import { db } from "@/db";

// Server actions run as plain functions here. What ties them to Next — the
// request's session, cache revalidation — is replaced; everything below
// that (permissions, SQL, transactions) is the real code on a real Postgres.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { sendVerificationEmail: vi.fn() } },
}));

beforeEach(async () => {
  // Every app table hangs off users, so this empties them all.
  await db.execute(sql`truncate table "user", desktop_sign_in cascade`);
});
