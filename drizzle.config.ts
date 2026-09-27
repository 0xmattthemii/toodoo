import { defineConfig } from "drizzle-kit";

import { postgresConnection } from "./src/db/connection";

// drizzle-kit doesn't read Next's env files, and .env.local is where the
// README puts DATABASE_URL. A variable already set in the shell wins (CI
// passes it that way); a file that doesn't exist is simply skipped.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set (looked in the environment, .env.local and .env)",
  );
}

// The same TLS as the app (src/db/connection.ts). drizzle-kit only takes TLS
// options next to discrete credentials, not next to a URL.
function credentials(connection: ReturnType<typeof postgresConnection>) {
  if (!connection.ssl) return { url: connection.connectionString };
  const url = new URL(connection.connectionString);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: connection.ssl,
  };
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: credentials(postgresConnection(databaseUrl)),
});
