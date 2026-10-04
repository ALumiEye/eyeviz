#!/usr/bin/env node
/**
 * Fails if any production dependency (transitively) uses a license outside the
 * permissive allowlist. Keeps EyeViz safe to embed in proprietary/enterprise products.
 */
import { execFileSync } from "node:child_process";

const ALLOWED = new Set([
  "MIT",
  "MIT-0",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "CC0-1.0",
  "BlueOak-1.0.0",
  "Unlicense",
]);

const out = execFileSync(
  "pnpm",
  ["licenses", "list", "--prod", "--json", "--filter", "./packages/*"],
  { encoding: "utf8" },
);
const byLicense = JSON.parse(out || "{}");

/** Accepts SPDX expressions such as "(MIT OR Apache-2.0)" when any alternative is allowed. */
function isAllowed(expression) {
  return expression
    .replace(/[()]/g, "")
    .split(/\s+OR\s+/i)
    .some((alt) => alt.split(/\s+AND\s+/i).every((id) => ALLOWED.has(id.trim())));
}

const problems = [];
let count = 0;
for (const [license, pkgs] of Object.entries(byLicense)) {
  for (const pkg of pkgs) {
    count++;
    if (!isAllowed(license)) problems.push(`${pkg.name}@${pkg.versions.join(",")}: ${license}`);
  }
}

if (problems.length > 0) {
  console.error("Disallowed licenses:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log(`Licenses OK (${count} production dependencies).`);
