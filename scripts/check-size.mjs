#!/usr/bin/env node
/**
 * Bundle-size budget. Bundles each public entry point of `@alumieye/eyeviz` the way an app
 * would (minified, peer dependencies external) and fails if its gzip size exceeds the budget.
 * Run after `pnpm build`. Keeps "lightweight enough for lesson pages" a checked property.
 *
 *   node scripts/check-size.mjs            check against the budgets below
 *   node scripts/check-size.mjs --report   print sizes only
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "vite";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "packages/eyeviz/dist");

/**
 * Budgets in gzip bytes, about 10% above the size when they were set (2026-10-05: 44.6, 52.1,
 * 45.1 + 8.8 lazy, 38.4 kB): growth needs a deliberate change here.
 * `initial` is what loads up front; `lazy` is loaded on demand (Three.js renderer for React).
 */
const BUDGETS = [
  { entry: "index.js", name: "@alumieye/eyeviz", initial: 49_000 },
  { entry: "three.js", name: "@alumieye/eyeviz/three", initial: 57_000 },
  { entry: "react.js", name: "@alumieye/eyeviz/react", initial: 50_000, lazy: 10_000 },
  { entry: "authoring.js", name: "@alumieye/eyeviz/authoring", initial: 42_000 },
];

/** Provided by the host app; never counted. */
const EXTERNAL = [/^three(\/|$)/, /^react(\/|$)/, /^react-dom(\/|$)/];

const report = process.argv.includes("--report");
const outDir = mkdtempSync(join(tmpdir(), "eyeviz-size-"));
let failed = false;

try {
  for (const budget of BUDGETS) {
    const output = await build({
      configFile: false,
      logLevel: "silent",
      root,
      build: {
        write: false,
        outDir,
        minify: true,
        lib: { entry: join(dist, budget.entry), formats: ["es"], fileName: "entry" },
        rolldownOptions: { external: EXTERNAL },
      },
    });
    const chunks = (Array.isArray(output) ? output : [output])
      .flatMap((result) => result.output)
      .filter((file) => file.type === "chunk");
    const gzip = (chunk) => gzipSync(chunk.code, { level: 9 }).length;
    const initial = chunks.filter((c) => c.isEntry).reduce((sum, c) => sum + gzip(c), 0);
    const lazy = chunks.filter((c) => !c.isEntry).reduce((sum, c) => sum + gzip(c), 0);

    const over = initial > budget.initial || (budget.lazy !== undefined && lazy > budget.lazy);
    failed ||= over && !report;
    const line = [
      `${over && !report ? "✗" : "✓"} ${budget.name.padEnd(28)}`,
      `initial ${kb(initial)}${report ? "" : ` / ${kb(budget.initial)}`}`,
      lazy
        ? `lazy ${kb(lazy)}${report || budget.lazy === undefined ? "" : ` / ${kb(budget.lazy)}`}`
        : "",
    ];
    console.log(line.filter(Boolean).join("   "));
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failed) {
  console.error(
    "\nBundle-size budget exceeded. Reduce the size, or raise the budget in scripts/check-size.mjs" +
      " with a reason in the commit message.",
  );
  process.exit(1);
}

function kb(bytes) {
  return `${(bytes / 1000).toFixed(1)} kB`;
}
