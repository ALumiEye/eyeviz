/**
 * Drag solving: find parameter values that bring a point closest to a target position.
 * Constraints come from the point's formula (e.g. a circle via an angle), so no general
 * constraint solver is needed. Deterministic: same inputs, same result.
 * See docs/adr/0018-direct-manipulation.md.
 */
import type { NumberVec3 } from "@alumieye/eyeviz-spec";

export interface DragBounds {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

/** Evaluates the point position for candidate parameter values (may return non-finite numbers). */
export type PositionFunction = (values: readonly number[]) => NumberVec3;

const SCAN_SAMPLES = 96;
const REFINE_ITERATIONS = 40;
const LM_ITERATIONS = 40;

/** Returns the parameter values that minimize the distance between the point and `target`. */
export function solveDrag(
  position: PositionFunction,
  start: readonly number[],
  bounds: readonly DragBounds[],
  target: NumberVec3,
): number[] {
  const cost = (values: readonly number[]) => {
    const p = position(values);
    const d = (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2 + (p[2] - target[2]) ** 2;
    return Number.isFinite(d) ? d : Infinity;
  };
  const clampAll = (values: readonly number[]) => values.map((v, i) => clamp(v, bounds[i] ?? {}));

  const [only] = bounds;
  const solved =
    start.length === 1 && only && only.min !== undefined && only.max !== undefined
      ? scanAndRefine(cost, start[0] as number, only.min, only.max)
      : levenbergMarquardt(position, cost, clampAll(start), bounds, target);

  // Snap to each parameter's step, then keep whichever of snapped/unsnapped is in bounds.
  return clampAll(solved.map((v, i) => snap(v, bounds[i] ?? {})));
}

/** One bounded parameter: global scan (handles periodic angles), then golden-section refinement. */
function scanAndRefine(
  cost: (v: readonly number[]) => number,
  start: number,
  min: number,
  max: number,
): number[] {
  let best = start;
  let bestCost = cost([start]);
  for (let i = 0; i <= SCAN_SAMPLES; i++) {
    const v = min + ((max - min) * i) / SCAN_SAMPLES;
    const c = cost([v]);
    if (c < bestCost) {
      best = v;
      bestCost = c;
    }
  }
  const h = (max - min) / SCAN_SAMPLES;
  let a = Math.max(min, best - h);
  let b = Math.min(max, best + h);
  const ratio = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < REFINE_ITERATIONS; i++) {
    const x1 = b - ratio * (b - a);
    const x2 = a + ratio * (b - a);
    if (cost([x1]) < cost([x2])) b = x2;
    else a = x1;
  }
  const refined = (a + b) / 2;
  return [cost([refined]) <= bestCost ? refined : best];
}

/** Several (or unbounded) parameters: damped Gauss–Newton with numeric derivatives, clamped. */
function levenbergMarquardt(
  position: PositionFunction,
  cost: (v: readonly number[]) => number,
  start: number[],
  bounds: readonly DragBounds[],
  target: NumberVec3,
): number[] {
  const n = start.length;
  let values = start;
  let current = cost(values);
  let lambda = 1e-3;

  for (let iteration = 0; iteration < LM_ITERATIONS && current > 1e-18; iteration++) {
    const p = position(values);
    const residual = [p[0] - target[0], p[1] - target[1], p[2] - target[2]];
    if (!residual.every(Number.isFinite)) break;

    // Jacobian (3 × n) by central differences.
    const jacobian: number[][] = [[], [], []];
    for (let j = 0; j < n; j++) {
      const h = 1e-6 * Math.max(1, Math.abs(values[j] as number));
      const plus = position(values.map((v, k) => (k === j ? v + h : v)));
      const minus = position(values.map((v, k) => (k === j ? v - h : v)));
      for (let r = 0; r < 3; r++)
        jacobian[r]![j] = ((plus[r] as number) - (minus[r] as number)) / (2 * h);
    }

    // Normal equations (JᵀJ + λ·diag(JᵀJ)) δ = −Jᵀr.
    const a: number[][] = [];
    const g: number[] = [];
    for (let i = 0; i < n; i++) {
      a.push([]);
      let gi = 0;
      for (let r = 0; r < 3; r++) gi += jacobian[r]![i]! * residual[r]!;
      g.push(-gi);
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let r = 0; r < 3; r++) s += jacobian[r]![i]! * jacobian[r]![j]!;
        a[i]!.push(s);
      }
    }
    let improved = false;
    for (let attempt = 0; attempt < 8 && !improved; attempt++) {
      const damped = a.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-12 : v)));
      const delta = solveLinear(damped, g);
      if (!delta) {
        lambda *= 10;
        continue;
      }
      const candidate = values.map((v, i) => clamp(v + (delta[i] as number), bounds[i] ?? {}));
      const candidateCost = cost(candidate);
      if (candidateCost < current) {
        const step = Math.max(...candidate.map((v, i) => Math.abs(v - (values[i] as number))));
        values = candidate;
        current = candidateCost;
        lambda = Math.max(lambda / 3, 1e-9);
        improved = true;
        if (step < 1e-12) return values;
      } else {
        lambda *= 4;
      }
    }
    if (!improved) break;
  }
  return values;
}

/** Gaussian elimination with partial pivoting for tiny systems (n ≤ 3). */
function solveLinear(matrix: number[][], rhs: number[]): number[] | undefined {
  const n = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i] as number]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-300) return undefined;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c++) m[r]![c]! -= factor * m[col]![c]!;
    }
  }
  const x = m.map((row, i) => row[n]! / row[i]!);
  return x.every(Number.isFinite) ? x : undefined;
}

function clamp(value: number, { min, max }: DragBounds): number {
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
}

/** Rounds to the parameter's step grid (anchored at `min`, else 0), without float noise. */
function snap(value: number, { min, step }: DragBounds): number {
  if (step === undefined || !(step > 0)) return value;
  const base = min ?? 0;
  const snapped = base + Math.round((value - base) / step) * step;
  const decimals = Math.min(12, Math.max(0, -Math.floor(Math.log10(step)) + 2));
  return Number(snapped.toFixed(decimals));
}
