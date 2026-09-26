import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't read Next's env files, and .env.local is where the
// README puts DATABASE_URL. A variable already set in the shell wins (CI
// passes it that way); a missing file just means there is nothing to load.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {}
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
