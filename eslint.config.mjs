import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Never use native browser modals; use <ConfirmDialog> / <Dialog> instead.
    rules: {
      "no-restricted-globals": [
        "error",
        ...["alert", "confirm", "prompt"].map((name) => ({
          name,
          message: `Use the in-app dialog components instead of ${name}().`,
        })),
      ],
      "no-restricted-properties": [
        "error",
        ...["alert", "confirm", "prompt"].flatMap((property) =>
          ["window", "globalThis"].map((object) => ({
            object,
            property,
            message: `Use the in-app dialog components instead of ${object}.${property}().`,
          })),
        ),
      ],
    },
  },
]);

export default eslintConfig;
