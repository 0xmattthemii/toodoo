import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

declare global {
  var __toodooPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Hosted Postgres providers (Supabase included) require TLS but usually sign
// with their own CA, so certificate verification is disabled outside localhost.
const pool =
  globalThis.__toodooPool ??
  new Pool({
    connectionString,
    ssl: /localhost|127\.0\.0\.1/.test(connectionString)
      ? undefined
      : { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__toodooPool = pool;
}

export const db = drizzle(pool, { schema });
