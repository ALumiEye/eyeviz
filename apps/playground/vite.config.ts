import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defaultClientConditions, defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Resolve workspace packages to their TypeScript sources: `pnpm dev` needs no prior build.
  resolve: {
    conditions: ["source", ...defaultClientConditions],
    // Monaco's ESM sources, for the lean editor build (src/editor/monaco-lean.js).
    alias: {
      "monaco-esm": fileURLToPath(new URL("./node_modules/monaco-editor/esm/vs", import.meta.url)),
    },
  },
  // Static hosting: works from any sub-path (e.g. GitHub Pages project sites).
  base: "./",
});
