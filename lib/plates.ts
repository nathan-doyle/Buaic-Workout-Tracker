/**
 * Plate calculator: plates per side for a target weight on a bar, in the unit the
 * plates are in (kg plates for kg, lb plates for lb). Greedy from the heaviest plate,
 * any number of each; works in thousandths so 1.25 / 2.5 never hit float noise.
 */

export interface PlateResult {
  /** Plates for one side, heaviest first. */
  perSide: number[];
  /** Weight the bar + plates actually make. */
  achieved: number;
  /** Target minus achieved (> 0 when the plates can't make it exactly). */
  remainder: number;
  /** Target below the empty bar. */
  belowBar: boolean;
}

const scale = (n: number) => Math.round(n * 1000);

export function platesPerSide(target: number, bar: number, plates: readonly number[]): PlateResult {
  const sizes = [...new Set(plates.filter((p) => p > 0).map(scale))].sort((a, b) => b - a);
  if (!Number.isFinite(target) || target < bar) {
    return { perSide: [], achieved: bar, remainder: Math.max(0, target - bar), belowBar: target < bar };
  }
  let side = Math.floor((scale(target) - scale(bar)) / 2);
  const perSide: number[] = [];
  for (const size of sizes) {
    while (side >= size) {
      perSide.push(size / 1000);
      side -= size;
    }
  }
  const achieved = (scale(bar) + 2 * perSide.reduce((sum, p) => sum + scale(p), 0)) / 1000;
  return { perSide, achieved, remainder: Math.round((target - achieved) * 1000) / 1000, belowBar: false };
}

/** "20 × 2, 10, 2.5" style summary of one side. */
export function describePlates(perSide: readonly number[]): string {
  const groups: [number, number][] = [];
  for (const p of perSide) {
    const last = groups[groups.length - 1];
    if (last && last[0] === p) last[1] += 1;
    else groups.push([p, 1]);
  }
  return groups.map(([p, n]) => (n > 1 ? `${p} × ${n}` : String(p))).join(', ');
}
