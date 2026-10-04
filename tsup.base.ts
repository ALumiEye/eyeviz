import type { Options } from "tsup";

/**
 * Shared tsup settings for every published package.
 *
 * `format` differs per package: renderer-neutral packages ship ESM + CJS so that
 * older enterprise toolchains can consume them; browser/renderer packages ship ESM only.
 * See docs/adr/0009-packaging-and-distribution.md.
 */
export function libraryConfig(format: Options["format"]): Options {
  return {
    entry: ["src/index.ts"],
    format,
    target: "es2022",
    platform: "neutral",
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    // Build against compiled dependencies, never against sibling `src/` folders.
    tsconfig: "tsconfig.build.json",
  };
}
