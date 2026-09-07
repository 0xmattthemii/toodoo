import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";

import * as schema from "./schema";

declare global {
  var __toodooPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

/** Whether the URL points at this machine — the only case plain TCP is fine. */
function isLocalDatabase(url: string) {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    // Not a URL the parser accepts; fall back to a substring check.
    return /localhost|127\.0\.0\.1/.test(url);
  }
}

/**
 * Pauses before each further attempt to open a connection. A scale-to-zero
 * Postgres resets the TLS handshake of a request that wakes its suspended
 * compute, then accepts the next one a moment later. The very first
 * connection a fresh instance opens is for Better Auth's plugin init, and
 * Better Auth keeps a rejected init for the life of the process — so that
 * one in particular has to outlast the wake.
 */
const RETRY_DELAYS_MS = [250, 1000];

/**
 * pg-pool raises this when a request waited `connectionTimeoutMillis` for a
 * *busy* client to be released, i.e. the pool is saturated. Retrying only adds
 * waiters to the queue that is the problem; let it surface as backpressure.
 */
const POOL_SATURATED = "timeout exceeded when trying to connect";

/** A five-character SQLSTATE means Postgres answered — it is up. */
const SQLSTATE = /^[0-9A-Z]{5}$/;

function isRetryableConnectError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const { code } = error as NodeJS.ErrnoException;
  if (code && SQLSTATE.test(code)) return false;
  return error.message !== POOL_SATURATED;
}

function describe(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const { code } = error as NodeJS.ErrnoException;
  return code ? `${code}: ${error.message}` : error.message;
}

/**
 * Retry opening a connection when the attempt itself fails. Everything the
 * pool hands out passes through `connect` — `pool.query` calls it with a
 * callback, Drizzle's `transaction` awaits it — and a failure there is
 * pre-statement by construction: nothing was sent, so nothing can run twice.
 * Errors from a statement on an established connection are never retried.
 */
function withConnectRetry(pool: Pool) {
  const connect = pool.connect.bind(pool) as () => Promise<PoolClient>;

  async function connectWithRetry(): Promise<PoolClient> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await connect();
      } catch (error) {
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay === undefined || !isRetryableConnectError(error)) throw error;
        console.warn(
          `[db] connecting failed (${describe(error)}); retrying in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // Same contract as pg-pool's own: a promise of the client, or, given a
  // callback, `(err, client, release)`.
  pool.connect = function retryingConnect(
    callback?: (
      err: Error | undefined,
      client: PoolClient | undefined,
      release: PoolClient["release"],
    ) => void,
  ) {
    const result = connectWithRetry();
    if (!callback) return result;
    result.then(
      (client) => callback(undefined, client, client.release),
      (error: Error) => callback(error, undefined, () => {}),
    );
  } as typeof pool.connect;

  return pool;
}

function createPool(connectionString: string) {
  const pool = new Pool({
    connectionString,
    // Hosted Postgres providers require TLS but usually sign with their own
    // CA, so certificate verification is disabled outside localhost.
    ssl: isLocalDatabase(connectionString) ? undefined : { rejectUnauthorized: false },
    // Without this a wedged handshake sits until the OS gives up on the TCP
    // connect, minutes later. Long enough for a compute waking from suspend,
    // and a retry follows anyway.
    connectionTimeoutMillis: 3_000,
  });

  // A pooled connection dropped while idle arrives as an 'error' event on the
  // pool. With no listener Node treats it as fatal and tears down the whole
  // instance, along with every other request it was serving.
  pool.on("error", (error) => {
    console.error(`[db] idle connection error (${describe(error)})`);
  });

  return withConnectRetry(pool);
}

const pool = globalThis.__toodooPool ?? createPool(connectionString);

if (process.env.NODE_ENV !== "production") {
  globalThis.__toodooPool = pool;
}

export const db = drizzle(pool, { schema });
