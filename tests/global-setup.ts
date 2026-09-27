import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Rebuilds the test database from the migrations, once per run. The suite
 * wipes that database, so it only runs against one that is plainly
 * disposable: on this machine, and named `test` or `…_test` / `test_…`.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "Set TEST_DATABASE_URL to a disposable local database, e.g. postgresql://postgres:postgres@localhost:54329/toodoo_test. The tests erase it.",
    );
  }
  const { hostname, pathname } = new URL(url);
  const database = decodeURIComponent(pathname.slice(1));
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(hostname) ||
    !/(^|_)test(_|$)/.test(database)
  ) {
    throw new Error(
      `Refusing to run against "${database}" on ${hostname}: the tests erase their database, so it must be local and named like toodoo_test.`,
    );
  }

  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(
      "drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;",
    );
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
}
