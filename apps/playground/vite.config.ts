import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Resolve workspace packages to their TypeScript sources: `pnpm dev` needs no prior build.
  resolve: { conditions: ["source", ...defaultClientConditions] },
  // Static hosting: works from any sub-path (e.g. GitHub Pages project sites).
  base: "./",
});
