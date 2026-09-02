import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // UI code: no ternaries (docs/UI-ARCHITECTURE.md rule 2). Use early returns,
  // guard clauses, `&&`, named consts or lookup maps instead.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.tsx"],
    rules: {
      "no-ternary": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
