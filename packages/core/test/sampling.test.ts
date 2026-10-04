import { describe, expect, it } from "vitest";
import { EyeVizEngine, ENGINE_LIMITS, sampleCurve, type CurveState } from "../src/index";
import { scene } from "./helpers";

const graph = (f: (x: number) => number) => (u: number, out: number[]) => {
  out[0] = u;
  out[1] = f(u);
  out[2] = 0;
};

const pieces = (polylines: Float64Array[]) => polylines.map((p) => p.length / 3);

describe("sampleCurve", () => {
  it("samples a continuous function into one polyline including both endpoints", () => {
    const [line] = sampleCurve(graph(Math.sin), -Math.PI, Math.PI, 101);
    expect(line?.length).toBe(101 * 3);
    expect(line?.[0]).toBe(-Math.PI);
    expect(line?.[line.length - 3]).toBe(Math.PI);
  });

  it("splits at asymptotes (tan)", () => {
    const polylines = sampleCurve(graph(Math.tan), -4, 4, 256);
    // tan has asymptotes at ±π/2 inside [-4, 4] → three pieces
    expect(polylines).toHaveLength(3);
  });

  it("splits at a pole (1/x) even when samples straddle it", () => {
    expect(
      sampleCurve(
        graph((x) => 1 / x),
        -1,
        1,
        100,
      ),
    ).toHaveLength(2);
  });

  it("drops undefined regions (sqrt of negatives)", () => {
    const polylines = sampleCurve(graph(Math.sqrt), -1, 1, 201);
    expect(polylines).toHaveLength(1);
    expect(polylines[0]?.[0]).toBeGreaterThanOrEqual(0);
  });

  it("does not split steep but continuous functions (exp)", () => {
    expect(sampleCurve(graph(Math.exp), -10, 10, 256)).toHaveLength(1);
  });

  it("splits at jump discontinuities (floor)", () => {
    expect(sampleCurve(graph(Math.floor), 0, 3, 300)).toHaveLength(3);
  });

  it("returns nothing for a function undefined everywhere", () => {
    expect(
      sampleCurve(
        graph(() => NaN),
        0,
        1,
        50,
      ),
    ).toEqual([]);
  });

  it("is deterministic", () => {
    const f = graph((x) => Math.tan(x) * Math.sin(3 * x));
    expect(sampleCurve(f, -5, 5, 512)).toEqual(sampleCurve(f, -5, 5, 512));
  });

  it("handles 3D curves", () => {
    const helix = (s: number, out: number[]) => {
      out[0] = Math.cos(s);
      out[1] = Math.sin(s);
      out[2] = s / 5;
    };
    expect(pieces(sampleCurve(helix, 0, 20, 400))).toEqual([400]);
  });
});

describe("curves in the engine", () => {
  const wave = scene(
    [
      {
        id: "wave",
        type: "curve",
        variable: "x",
        domain: ["-L", "L"],
        position: ["x", "a*sin(x)", 0],
        visible: "show",
      },
    ],
    [
      { id: "a", value: 1 },
      { id: "L", value: 3 },
      { id: "show", value: true },
    ],
  );
  const curve = (engine: EyeVizEngine) => engine.getState().objects.wave as CurveState;

  it("samples with the configured density", () => {
    const engine = new EyeVizEngine(wave, { curveSamples: 64 });
    expect(pieces([...curve(engine).polylines])).toEqual([64]);
  });

  it("re-samples when a parameter changes", () => {
    const engine = new EyeVizEngine(wave, { curveSamples: 3 });
    engine.setParameter("a", 2);
    const [line] = curve(engine).polylines;
    expect(line?.[1]).toBeCloseTo(2 * Math.sin(-3), 12);
  });

  it("caps samples per curve", () => {
    const engine = new EyeVizEngine(wave, { curveSamples: 1e9 });
    expect(curve(engine).polylines[0]?.length).toBe(ENGINE_LIMITS.maxCurveSamples * 3);
  });

  it("caps total samples across curves", () => {
    const many = scene(
      Array.from({ length: 1000 }, (_, i) => ({
        id: `c${i}`,
        type: "curve",
        variable: "x",
        domain: [0, 1],
        position: ["x", 0, 0],
      })),
    );
    const state = new EyeVizEngine(many).getState();
    const total = Object.values(state.objects).reduce(
      (sum, o) => sum + (o as CurveState).polylines.reduce((s, p) => s + p.length / 3, 0),
      0,
    );
    expect(total).toBeLessThanOrEqual(ENGINE_LIMITS.maxTotalCurveSamples);
  });

  it("skips sampling while hidden and samples when shown", () => {
    const engine = new EyeVizEngine(wave);
    engine.setParameter("show", false);
    expect(curve(engine).polylines).toEqual([]);
    engine.setParameter("show", true);
    expect(curve(engine).polylines.length).toBe(1);
  });

  it.each([
    [{ L: -1 }, "EXPRESSION_EVALUATION"],
    [{ L: 2e6 }, "LIMIT_EXCEEDED"],
  ])("reports invalid domains %j", (values, code) => {
    const engine = new EyeVizEngine(wave);
    engine.setParameters(values);
    expect(curve(engine).valid).toBe(false);
    expect(engine.getState().issues[0]).toMatchObject({ code, path: "objects[0].domain" });
  });
});
