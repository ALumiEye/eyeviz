/**
 * Returns the candidate closest to `name`, to power "Did you mean…?" hints: edit distance ≤ 2,
 * or ≤ 1 for names of up to three characters (or a case-insensitive match).
 */
export function suggest(name: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  // Short names need a closer match: "kk" is not a typo of "r".
  let bestDistance = name.length <= 3 ? 2 : 3;
  const lower = name.toLowerCase();
  for (const candidate of candidates) {
    const distance = candidate.toLowerCase() === lower ? 0 : editDistance(name, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] as number;
}
