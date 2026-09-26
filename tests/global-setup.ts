import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Rebuilds the test database from the migrations, once per run. The suite
 * wipes that database, so it only runs against one that is plainly
 * disposable: on this machine, with "test" in its name.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "Set TEST_DATABASE_URL to a disposable local database, e.g. postgresql://postgres:postgres@localhost:54329/toodoo_test. The tests erase it.",
    );
  }
  const { hostname, pathname } = new URL(url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname) || !pathname.includes("test")) {
    throw new Error(
      `Refusing to run against ${hostname}${pathname}: the tests erase their database, so it must be local and have "test" in its name.`,
    );
  }

  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(
      "drop schema if exists drizzle cascade; drop schema public cascade; create schema public;",
    );
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
}
