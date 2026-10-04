import { formatJson } from "./format";

/** Example specs from the repository's `examples/` folder, bundled at build time. */
const modules = import.meta.glob<unknown>("../../../examples/*.json", {
  eager: true,
  import: "default",
});

export interface Example {
  readonly id: string;
  readonly title: string;
  readonly text: string;
}

export const EXAMPLES: readonly Example[] = Object.entries(modules)
  .map(([path, spec]) => {
    const id =
      path
        .split("/")
        .pop()
        ?.replace(/\.json$/, "") ?? path;
    const title = (spec as { metadata?: { title?: string } }).metadata?.title ?? id;
    return { id, title, text: `${formatJson(spec)}\n` };
  })
  .sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));

/** Simplest first; examples not listed here follow alphabetically. */
function rank(id: string): number {
  const order = [
    "points-segments",
    "unit-circle",
    "sine-curve",
    "vectors",
    "projectile",
    "harmonic-oscillator",
    "pyramid",
    "paraboloid",
    "helix",
  ];
  const index = order.indexOf(id);
  return index === -1 ? order.length : index;
}
