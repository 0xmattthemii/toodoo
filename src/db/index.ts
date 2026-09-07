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

const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);

/**
 * Connection-time failures: the statement never reached Postgres, so running
 * it again cannot repeat any work. The one seen in production is a TLS
 * handshake reset from the hosted endpoint ("Client network socket
 * disconnected…"), which a scale-to-zero Postgres does when a request wakes a
 * suspended compute. It failed one session lookup and took the whole server
 * action down with it.
 *
 * Errors that can also strike *mid*-statement ("Connection terminated
 * unexpectedly", a bare ECONNRESET) are deliberately absent: a retried INSERT
 * could then run twice.
 */
function isConnectFailure(error: unknown) {
  if (!(error instanceof Error)) return false;
  const { code } = error as NodeJS.ErrnoException;
  // Refused or unresolvable: nothing was ever sent. ETIMEDOUT is not here —
  // a TCP keepalive probe can raise it on an established connection, i.e.
  // possibly mid-statement; pg's own connect timeouts below cover the
  // connect phase instead.
  if (code && ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(code)) {
    return true;
  }
  return (
    error.message.includes("socket disconnected before secure TLS connection") ||
    error.message.includes("timeout exceeded when trying to connect") ||
    error.message.includes("Connection terminated due to connection timeout")
  );
}

/**
 * Pauses before each retry of a query whose connection never came up. A
 * suspended compute takes a moment to wake, and the first query a fresh
 * instance runs is Better Auth's plugin init — if that one fails, Better Auth
 * keeps the rejected context for the life of the process and every later
 * request fails with it. Connect-phase retries are free of side effects, so
 * erring on the side of patience is cheap.
 */
const RETRY_DELAYS_MS = [250, 750, 1500];

/**
 * Retry a query when the connection it needed never came up. Both Drizzle and
 * Better Auth run every statement through `pool.query` (only transactions
 * take a client of their own, and this app opens none), so the whole app is
 * covered from here. The promise form only — nothing passes a callback.
 */
function withConnectRetry(pool: Pool) {
  const query = pool.query.bind(pool) as (...args: never[]) => Promise<unknown>;
  pool.query = async function retryingQuery(...args: never[]) {
    for (const delay of RETRY_DELAYS_MS) {
      try {
        return await query(...args);
      } catch (error) {
        if (!isConnectFailure(error)) throw error;
        console.warn(`Postgres connection failed, retrying in ${delay}ms:`, error);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return await query(...args);
  } as typeof pool.query;
  return pool;
}

function createPool() {
  const pool = new Pool({
    connectionString,
    // Hosted Postgres providers (Supabase included) require TLS but usually
    // sign with their own CA, so certificate verification is disabled outside
    // localhost.
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    // One serverless instance only ever serves a handful of concurrent
    // requests, and every connection it holds is one more the hosted pooler
    // has to keep for it.
    max: 5,
    keepAlive: true,
    // Fail a wedged connection attempt while the request can still report it,
    // rather than sitting there until the platform's own timeout. Generous
    // enough for a compute waking from suspend, and a retry follows anyway.
    connectionTimeoutMillis: 5_000,
  });

  // A pooled connection dropped while idle arrives as an 'error' event on the
  // pool. With no listener Node treats it as fatal and tears down the whole
  // instance, along with every other request it was serving.
  pool.on("error", (error) => {
    console.error("Postgres pool error:", error);
  });

  return withConnectRetry(pool);
}

const pool = globalThis.__toodooPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalThis.__toodooPool = pool;
}

export const db = drizzle(pool, { schema });
