import type { ConnectionOptions } from "node:tls";

/**
 * How toodoo reaches Postgres, shared by the app's pool (src/db/index.ts)
 * and drizzle-kit (drizzle.config.ts), so migrations are as protected as the
 * app.
 *
 * A database on this machine is reached over plain TCP. Anything else gets
 * TLS with the server's certificate verified: encryption to a server nobody
 * authenticated is no protection from whoever can intercept or redirect the
 * connection. Neon and most hosts use publicly trusted certificates; a
 * provider that signs with its own CA (Supabase's pooler, a self-hosted
 * server) needs that CA's PEM in DATABASE_CA_CERT.
 *
 * node-postgres lets TLS parameters in the URL replace the options it is
 * given, and hosted URLs usually carry one (Neon's `sslmode=require`), which
 * would silently drop the CA. So those parameters are taken out and TLS is
 * configured here — any other `sslmode` becomes verified TLS — unless the
 * URL asks for something this can't express: `sslmode=disable` or
 * `no-verify` (a deliberate opt-out), or certificate files of its own
 * (`sslrootcert`, `sslcert`, `sslkey`). Those are honoured as written.
 */

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** URL parameters through which node-postgres would configure TLS itself. */
const TLS_PARAMS = ["ssl", "sslmode", "uselibpqcompat"];
const CERTIFICATE_FILE_PARAMS = ["sslrootcert", "sslcert", "sslkey"];

export type PostgresConnection = {
  connectionString: string;
  /** Undefined when the URL alone decides (local, or an explicit choice in it). */
  ssl?: ConnectionOptions;
};

export function postgresConnection(
  connectionString: string,
): PostgresConnection {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    // Not a URL (e.g. a keyword/value string): node-postgres reads it as is.
    return { connectionString };
  }
  if (LOCAL_HOSTS.includes(url.hostname)) return { connectionString };

  const params = url.searchParams;
  const sslmode = params.get("sslmode");
  if (
    sslmode === "disable" ||
    sslmode === "no-verify" ||
    CERTIFICATE_FILE_PARAMS.some((param) => params.has(param))
  ) {
    return { connectionString };
  }

  for (const param of TLS_PARAMS) params.delete(param);
  // Single-line env editors often store the PEM with its newlines escaped.
  const ca = process.env.DATABASE_CA_CERT?.trim().replaceAll("\\n", "\n");
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
  };
}
