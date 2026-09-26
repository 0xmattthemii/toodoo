import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": at("./src"),
      // Next swaps it for a no-op on the server; anywhere else it throws.
      "server-only": at("./tests/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    env: {
      // src/db reads DATABASE_URL when first imported; point it at the
      // disposable test database (global-setup.ts refuses anything else).
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      // Never send real email from a test run.
      RESEND_API_KEY: "",
    },
    // One database shared by every file, wiped before each test.
    fileParallelism: false,
  },
});
