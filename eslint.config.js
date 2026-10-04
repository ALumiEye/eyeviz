import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { FORBIDDEN_IMPORTS } from "./scripts/boundaries.mjs";

/** One config block per package that forbids imports breaking the dependency direction. */
const boundaryRules = Object.entries(FORBIDDEN_IMPORTS).map(([dir, patterns]) => ({
  files: [`packages/${dir}/src/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: patterns.map((group) => ({
          group: [group, `${group}/*`],
          message: `packages/${dir} must not depend on "${group}". See docs/architecture.md.`,
        })),
      },
    ],
  },
}));

export default tseslint.config(
  { ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Scene Specs are untrusted input: no dynamic code execution anywhere in the repo.
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ["packages/react/**/*.{ts,tsx}", "apps/playground/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["apps/playground/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["scripts/**/*.mjs", "*.config.{js,ts}", "tsup.base.ts"],
    languageOptions: { globals: globals.node },
  },
  ...boundaryRules,
);
