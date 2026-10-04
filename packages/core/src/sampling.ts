/**
 * Renderer-neutral curve sampling. Produces polylines split wherever the curve is undefined
 * (NaN/±Infinity) or discontinuous (e.g. `tan(x)` at π/2, `1/x` at 0).
 */

/** Writes the curve point for parameter `u` into `out[0..2]`. */
export type CurveFunction = (u: number, out: number[]) => void;

/** Segments longer than this multiple of the median segment are tested for continuity. */
const SUSPICIOUS_FACTOR = 4;
/** At most this many suspicious segments are refined per curve (bounds the work). */
const MAX_REFINED_SEGMENTS = 64;
/** Bisection steps when testing a segment for continuity. */
const BISECTION_STEPS = 12;

/**
 * Samples `fn` uniformly at `samples` points on `[start, end]` and returns the resulting
 * polylines as interleaved `x, y, z` coordinates. Pieces with fewer than two points are dropped.
 * Deterministic: identical inputs give identical output.
 */
export function sampleCurve(
  fn: CurveFunction,
  start: number,
  end: number,
  samples: number,
): Float64Array[] {
  const n = Math.max(2, Math.floor(samples));
  const points = new Float64Array(n * 3);
  const finite = new Uint8Array(n);
  const scratch = [0, 0, 0];

  for (let i = 0; i < n; i++) {
    const u = i === n - 1 ? end : start + ((end - start) * i) / (n - 1);
    fn(u, scratch);
    const [x, y, z] = scratch as [number, number, number];
    points[i * 3] = x;
    points[i * 3 + 1] = y;
    points[i * 3 + 2] = z;
    finite[i] = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? 1 : 0;
  }

  const breaks = findDiscontinuities(fn, points, finite, start, end, n);

  const polylines: Float64Array[] = [];
  let pieceStart = -1;
  const flush = (endExclusive: number) => {
    if (pieceStart >= 0 && endExclusive - pieceStart >= 2) {
      polylines.push(points.slice(pieceStart * 3, endExclusive * 3));
    }
    pieceStart = -1;
  };
  for (let i = 0; i < n; i++) {
    if (!finite[i]) {
      flush(i);
      continue;
    }
    if (pieceStart >= 0 && breaks.has(i)) flush(i);
    if (pieceStart < 0) pieceStart = i;
  }
  flush(n);
  return polylines;
}

/** Returns indices `i` such that the curve must not be connected between sample `i-1` and `i`. */
function findDiscontinuities(
  fn: CurveFunction,
  points: Float64Array,
  finite: Uint8Array,
  start: number,
  end: number,
  n: number,
): Set<number> {
  const breaks = new Set<number>();
  const lengths: number[] = [];
  const segmentLength = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    if (!finite[i] || !finite[i - 1]) continue;
    const length = distance(points, (i - 1) * 3, points, i * 3);
    segmentLength[i] = length;
    lengths.push(length);
  }
  if (lengths.length === 0) return breaks;

  lengths.sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)] as number;
  const threshold = SUSPICIOUS_FACTOR * median;

  let refined = 0;
  for (let i = 1; i < n && refined < MAX_REFINED_SEGMENTS; i++) {
    const length = segmentLength[i] as number;
    if (length <= threshold || length === 0) continue;
    refined++;
    const u0 = start + ((end - start) * (i - 1)) / (n - 1);
    const u1 = start + ((end - start) * i) / (n - 1);
    if (
      isDiscontinuous(
        fn,
        u0,
        u1,
        points.subarray((i - 1) * 3, i * 3),
        points.subarray(i * 3, i * 3 + 3),
      )
    ) {
      breaks.add(i);
    }
  }
  return breaks;
}

/**
 * Bisection test: on a continuous curve the largest sub-segment shrinks roughly by half per
 * step; across a jump or asymptote it does not. Non-finite midpoints mean "undefined here".
 */
function isDiscontinuous(
  fn: CurveFunction,
  u0: number,
  u1: number,
  p0: ArrayLike<number>,
  p1: ArrayLike<number>,
): boolean {
  let a = u0;
  let b = u1;
  let pa = [p0[0] as number, p0[1] as number, p0[2] as number];
  let pb = [p1[0] as number, p1[1] as number, p1[2] as number];
  const jump = distance3(pa, pb);
  const pm = [0, 0, 0];

  for (let step = 0; step < BISECTION_STEPS; step++) {
    const m = (a + b) / 2;
    fn(m, pm);
    if (!pm.every(Number.isFinite)) return true;
    const left = distance3(pa, pm);
    const right = distance3(pm, pb);
    if (left >= right) {
      b = m;
      pb = [...pm];
      if (left < jump / 4) return false;
    } else {
      a = m;
      pa = [...pm];
      if (right < jump / 4) return false;
    }
  }
  return true;
}

function distance(a: ArrayLike<number>, ai: number, b: ArrayLike<number>, bi: number): number {
  const dx = (a[ai] as number) - (b[bi] as number);
  const dy = (a[ai + 1] as number) - (b[bi + 1] as number);
  const dz = (a[ai + 2] as number) - (b[bi + 2] as number);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function distance3(a: readonly number[], b: readonly number[]): number {
  return distance(a, 0, b, 0);
}
