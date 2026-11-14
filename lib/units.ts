/**
 * Weight units: exact conversion and display rounding.
 *
 * Weights are stored in kg at full precision. They are only rounded for display:
 * kg to the nearest 0.25, lb to the nearest 0.5 (see V2_PROGRESS.md → Decisions).
 */

export type WeightUnit = 'kg' | 'lb';

/** Exact international avoirdupois pound, in kg. */
export const KG_PER_LB = 0.45359237;

/** Display rounding step per unit. */
export const DISPLAY_STEP: Readonly<Record<WeightUnit, number>> = { kg: 0.25, lb: 0.5 };

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

/** Converts a value entered in `unit` to kg (full precision). */
export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? lbToKg(value) : value;
}

/** Converts a stored kg value to `unit` (full precision). */
export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'lb' ? kgToLb(kg) : kg;
}

/**
 * Rounds `value` to the nearest multiple of `step` (halves round up).
 * Exact for the binary-fraction steps used here (0.25, 0.5, 1).
 */
export function roundToStep(value: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) {
    throw new RangeError(`step must be a positive finite number, got ${step}`);
  }
  const rounded = Math.round(value / step) * step;
  return rounded === 0 ? 0 : rounded; // normalise -0
}

/** A stored kg weight as a number in `unit`, rounded for display. */
export function displayWeight(kg: number, unit: WeightUnit): number {
  return roundToStep(fromKg(kg, unit), DISPLAY_STEP[unit]);
}

/**
 * A stored kg weight as display text in `unit` without trailing zeros
 * ("60", "61.25", "134.5"). Non-finite input gives "—".
 */
export function formatWeight(kg: number, unit: WeightUnit): string {
  if (!Number.isFinite(kg)) return '—';
  return String(displayWeight(kg, unit));
}
