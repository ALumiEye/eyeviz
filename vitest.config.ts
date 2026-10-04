import { defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolve workspace packages to their TypeScript sources, so tests never need a prior build.
  resolve: { conditions: ["source"] },
  ssr: { resolve: { conditions: ["source", ...defaultServerConditions] } },
  test: {
    include: ["packages/*/test/**/*.test.{ts,tsx}", "apps/*/test/**/*.test.{ts,tsx}"],
    environment: "node",
    // Determinism matters: no test may depend on network access or wall-clock time.
    restoreMocks: true,
  },
});
