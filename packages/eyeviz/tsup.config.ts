import { defineConfig } from "tsup";
import { libraryConfig } from "../../tsup.base";

// Renderer-neutral root entry ships ESM + CJS; browser subpaths ship ESM only.
export default defineConfig([
  { ...libraryConfig(["esm", "cjs"]), entry: ["src/index.ts", "src/authoring.ts"] },
  { ...libraryConfig(["esm"]), entry: ["src/three.ts", "src/react.ts"], clean: false },
]);
