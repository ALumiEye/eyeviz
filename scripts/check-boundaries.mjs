#!/usr/bin/env node
/**
 * Fails if any package declares a dependency outside the allowed graph, or if a
 * renderer-neutral package can see DOM types. Run with `pnpm check:boundaries`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ALLOWED_DEPENDENCIES, DOM_FREE_PACKAGES } from "./boundaries.mjs";

const root = new URL("..", import.meta.url).pathname;
const packagesDir = join(root, "packages");
const problems = [];

const dirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const dir of dirs) {
  const allowed = ALLOWED_DEPENDENCIES[dir];
  if (!allowed) {
    problems.push(`packages/${dir}: not registered in scripts/boundaries.mjs`);
    continue;
  }

  const pkg = JSON.parse(readFileSync(join(packagesDir, dir, "package.json"), "utf8"));
  // devDependencies are build/test tooling and do not ship; runtime and peer deps do.
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (!allowed.includes(name)) {
        problems.push(`packages/${dir}: "${name}" in ${field} is outside the allowed graph`);
      }
    }
  }

  if (DOM_FREE_PACKAGES.includes(dir)) {
    const tsconfig = JSON.parse(readFileSync(join(packagesDir, dir, "tsconfig.json"), "utf8"));
    const lib = tsconfig.compilerOptions?.lib ?? [];
    if (lib.some((l) => l.toLowerCase().startsWith("dom"))) {
      problems.push(`packages/${dir}: tsconfig lib must not include DOM (found ${lib.join(", ")})`);
    }
  }
}

for (const dir of Object.keys(ALLOWED_DEPENDENCIES)) {
  if (!dirs.includes(dir)) problems.push(`scripts/boundaries.mjs: unknown package "${dir}"`);
}

if (problems.length > 0) {
  console.error("Package boundary violations:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log(`Package boundaries OK (${dirs.length} packages).`);
