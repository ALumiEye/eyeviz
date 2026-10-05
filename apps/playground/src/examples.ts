import type { SceneSpec } from "@alumieye/eyeviz";
import { EXAMPLE_TEXT_VI } from "./examples-vi";
import { formatJson } from "./format";
import type { Language } from "./i18n";

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

/** An example's text in `language`: Vietnamese titles, descriptions, labels, names and steps. */
export function localizeExample(spec: SceneSpec, language: Language): SceneSpec {
  if (language === "en") return spec;
  const vi = <T extends string | undefined>(text: T): T =>
    (text === undefined ? text : (EXAMPLE_TEXT_VI[text] ?? text)) as T;
  const metadata = spec.metadata;
  return {
    ...spec,
    ...(metadata
      ? {
          metadata: {
            ...metadata,
            ...(metadata.title !== undefined ? { title: vi(metadata.title) } : {}),
            ...(metadata.description !== undefined
              ? { description: vi(metadata.description) }
              : {}),
            lang: "vi",
          },
        }
      : {}),
    ...(spec.parameters
      ? {
          parameters: spec.parameters.map((p) =>
            p.label === undefined ? p : { ...p, label: vi(p.label) },
          ),
        }
      : {}),
    objects: spec.objects.map((o) => (o.name === undefined ? o : { ...o, name: vi(o.name) })),
    ...(spec.steps
      ? {
          steps: spec.steps.map((step) => ({
            ...step,
            ...(step.title !== undefined ? { title: vi(step.title) } : {}),
            ...(step.description !== undefined ? { description: vi(step.description) } : {}),
          })),
        }
      : {}),
  };
}

/** An example's title in `language`. */
export function exampleTitle(example: Example, language: Language): string {
  return language === "vi" ? (EXAMPLE_TEXT_VI[example.title] ?? example.title) : example.title;
}
