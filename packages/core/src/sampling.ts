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

/** Writes the surface point for parameters `(u, v)` into `out[0..2]`. */
export type SurfaceFunction = (u: number, v: number, out: number[]) => void;

export interface SurfaceGrid {
  /** Samples along `v`. */
  readonly rows: number;
  /** Samples along `u`. */
  readonly columns: number;
  /**
   * Row-major `x, y, z` per vertex: vertex `(i, j)` (row `i`, column `j`) starts at
   * `(i * columns + j) * 3`. Vertices where the surface is undefined are `NaN, NaN, NaN`.
   */
  readonly positions: Float64Array;
  readonly finiteCount: number;
}

/**
 * Samples a parametric surface on a uniform `samples × samples` grid. Renderers skip every
 * grid cell that touches an undefined (`NaN`) vertex. Deterministic.
 */
export function sampleSurface(
  fn: SurfaceFunction,
  [uStart, uEnd]: readonly [number, number],
  [vStart, vEnd]: readonly [number, number],
  samples: number,
): SurfaceGrid {
  const n = Math.max(2, Math.floor(samples));
  const positions = new Float64Array(n * n * 3);
  const scratch = [0, 0, 0];
  let finiteCount = 0;
  for (let i = 0; i < n; i++) {
    const v = i === n - 1 ? vEnd : vStart + ((vEnd - vStart) * i) / (n - 1);
    for (let j = 0; j < n; j++) {
      const u = j === n - 1 ? uEnd : uStart + ((uEnd - uStart) * j) / (n - 1);
      fn(u, v, scratch);
      const [x, y, z] = scratch as [number, number, number];
      const offset = (i * n + j) * 3;
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        positions[offset] = x;
        positions[offset + 1] = y;
        positions[offset + 2] = z;
        finiteCount++;
      } else {
        positions[offset] = positions[offset + 1] = positions[offset + 2] = NaN;
      }
    }
  }
  return { rows: n, columns: n, positions, finiteCount };
}

/** Returns `F(x, y)`; the implicit curve is where `F = 0`. */
export type ImplicitFunction = (x: number, y: number) => number;

/**
 * A crossing is kept only if `F` at the interpolated point is at most this fraction of the
 * larger endpoint value. Across a pole (`y = 1/x` changes sign at x = 0 without a root) the
 * value there is huge, so no false segment is drawn.
 */
const ROOT_TOLERANCE = 0.5;

/**
 * Traces the curve `F(x, y) = 0` with marching squares on a uniform `samples × samples` grid
 * and returns it as polylines in the plane z = 0 (interleaved `x, y, z`), joined across cells.
 * Saddle cells are resolved with the value at the cell centre. Deterministic.
 *
 * Only sign changes are found: a curve that touches zero without crossing it (`x^2 + y^2 = 0`,
 * `(x - y)^2 = 0`) is not drawn. Cells touching an undefined value are skipped.
 */
export function sampleImplicit(
  fn: ImplicitFunction,
  [xStart, xEnd]: readonly [number, number],
  [yStart, yEnd]: readonly [number, number],
  samples: number,
): { polylines: Float64Array[]; finiteCount: number } {
  const n = Math.max(2, Math.floor(samples));
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    xs[k] = k === n - 1 ? xEnd : xStart + ((xEnd - xStart) * k) / (n - 1);
    ys[k] = k === n - 1 ? yEnd : yStart + ((yEnd - yStart) * k) / (n - 1);
  }
  // values[i * n + j] = F(xs[j], ys[i]).
  const values = new Float64Array(n * n);
  let finiteCount = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const value = fn(xs[j] as number, ys[i] as number);
      values[i * n + j] = value;
      if (Number.isFinite(value)) finiteCount++;
    }
  }

  // Crossing points, one per grid edge at most, shared by the two cells beside the edge.
  // Horizontal edge (i, j)–(i, j+1) has key i*(n-1)+j; vertical edge (i, j)–(i+1, j) has key
  // H + i*n + j.
  const H = n * (n - 1);
  // -2 = not computed yet, -1 = no crossing, otherwise the point's index.
  const pointOf = new Int32Array(H * 2 + n).fill(-2);
  const coords: number[] = [];
  const crossing = (
    key: number,
    a: number,
    b: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ) => {
    const cached = pointOf[key] as number;
    if (cached !== -2) return cached;
    let index = -1;
    if (Number.isFinite(a) && Number.isFinite(b) && a >= 0 !== b >= 0) {
      const s = a / (a - b);
      const x = x0 + (x1 - x0) * s;
      const y = y0 + (y1 - y0) * s;
      const there = fn(x, y);
      if (
        Number.isFinite(there) &&
        Math.abs(there) <= ROOT_TOLERANCE * Math.max(Math.abs(a), Math.abs(b))
      ) {
        index = coords.length / 2;
        coords.push(x, y);
      }
    }
    pointOf[key] = index;
    return index;
  };

  // Each crossing point joins at most two segments (one per adjacent cell).
  const links: number[][] = [];
  const link = (p: number, q: number) => {
    if (p < 0 || q < 0 || p === q) return;
    (links[p] ??= []).push(q);
    (links[q] ??= []).push(p);
  };

  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const v00 = values[i * n + j] as number;
      const v10 = values[i * n + j + 1] as number;
      const v01 = values[(i + 1) * n + j] as number;
      const v11 = values[(i + 1) * n + j + 1] as number;
      // Most cells lie entirely on one side of the curve.
      const sign = v00 >= 0;
      if (v10 >= 0 === sign && v01 >= 0 === sign && v11 >= 0 === sign) continue;
      const [x0, x1, y0, y1] = [
        xs[j] as number,
        xs[j + 1] as number,
        ys[i] as number,
        ys[i + 1] as number,
      ];
      const bottom = crossing(i * (n - 1) + j, v00, v10, x0, y0, x1, y0);
      const top = crossing((i + 1) * (n - 1) + j, v01, v11, x0, y1, x1, y1);
      const left = crossing(H + i * n + j, v00, v01, x0, y0, x0, y1);
      const right = crossing(H + i * n + j + 1, v10, v11, x1, y0, x1, y1);
      const found = [bottom, right, top, left].filter((p) => p >= 0);
      if (found.length === 2) {
        link(found[0] as number, found[1] as number);
      } else if (found.length === 4) {
        // Saddle: corners 00 and 11 share a sign. If the centre has that sign too, the two
        // branches cut off corners 10 and 01; otherwise they cut off 00 and 11.
        const centre = fn((x0 + x1) / 2, (y0 + y1) / 2);
        if (centre >= 0 === v00 >= 0) {
          link(bottom, right);
          link(top, left);
        } else {
          link(bottom, left);
          link(top, right);
        }
      }
    }
  }

  // Walk the links into polylines: open chains from their ends first, then closed loops.
  const visited = new Uint8Array(coords.length / 2);
  const polylines: Float64Array[] = [];
  const walk = (start: number) => {
    const chain = [start];
    visited[start] = 1;
    let previous = -1;
    let current = start;
    for (;;) {
      const next = (links[current] ?? []).find((q) => q !== previous && !visited[q]);
      if (next === undefined) {
        // Close a loop back to its start.
        if ((links[current] ?? []).includes(start) && chain.length > 2) chain.push(start);
        break;
      }
      visited[next] = 1;
      chain.push(next);
      previous = current;
      current = next;
    }
    if (chain.length < 2) return;
    const line = new Float64Array(chain.length * 3);
    chain.forEach((p, k) => {
      line[k * 3] = coords[p * 2] as number;
      line[k * 3 + 1] = coords[p * 2 + 1] as number;
    });
    polylines.push(line);
  };
  for (let p = 0; p < visited.length; p++) {
    if (!visited[p] && (links[p]?.length ?? 0) === 1) walk(p);
  }
  for (let p = 0; p < visited.length; p++) {
    if (!visited[p] && (links[p]?.length ?? 0) > 0) walk(p);
  }
  return { polylines, finiteCount };
}
