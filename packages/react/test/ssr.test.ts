import { EyeVizEngine } from "@alumieye/eyeviz-core";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EyeVizScene, useEyeViz, useEyeVizState } from "../src/index";

const spec = {
  version: "0.1",
  metadata: { title: "Unit circle", description: "A point moving on a circle.", lang: "en" },
  parameters: [{ id: "theta", value: 30, unit: "deg" }],
  objects: [{ id: "P", type: "point", position: ["cos(theta)", "sin(theta)", 0] }],
};

describe("server rendering (import-safe, no Three.js on the server)", () => {
  it("renders an accessible container with crawlable text", () => {
    const html = renderToString(createElement(EyeVizScene, { spec }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Unit circle. A point moving on a circle."');
    expect(html).toContain('lang="en"');
    expect(html).toContain("A point moving on a circle.");
    expect(html).toContain("aspect-ratio:16 / 9");
    expect(html).not.toContain("<canvas");
  });

  it("renders a neutral container for an invalid spec", () => {
    const html = renderToString(createElement(EyeVizScene, { spec: { version: "9" } }));
    expect(html).toContain('aria-label="EyeViz scene"');
  });

  it("accepts an external engine", () => {
    const engine = new EyeVizEngine(spec);
    const html = renderToString(createElement(EyeVizScene, { engine }));
    expect(html).toContain("Unit circle");
  });
});

describe("hooks", () => {
  function Probe(props: { spec: unknown }) {
    const { engine, issues } = useEyeViz(props.spec);
    const parameters = useEyeVizState(engine, (state) => state.parameters);
    return createElement(
      "output",
      null,
      engine
        ? `theta=${String(parameters?.theta)}`
        : `issues=${issues.map((i) => i.code).join(",")}`,
    );
  }

  it("compiles a spec and exposes state slices", () => {
    expect(renderToString(createElement(Probe, { spec }))).toContain("theta=30");
  });

  it("returns issues instead of throwing for invalid specs", () => {
    const invalid = { ...spec, objects: [{ id: "P", type: "point", position: ["oops", 0, 0] }] };
    expect(renderToString(createElement(Probe, { spec: invalid }))).toContain(
      "issues=UNKNOWN_SYMBOL",
    );
  });
});
