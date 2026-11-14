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

/** A stored kg volume (weight × reps) in `unit`, rounded to a whole number. Missing → "0". */
export function formatVolume(kg: number | null | undefined, unit: WeightUnit): string {
  if (kg === null || kg === undefined || !Number.isFinite(kg)) return '0';
  const rounded = Math.round(fromKg(kg, unit));
  return String(rounded === 0 ? 0 : rounded);
}

/**
 * A weight in an input field: the text as shown, plus the exact kg it was made from
 * when the app filled it in (from history, or by converting on a unit toggle).
 * While the text is unchanged the exact value is used, so toggling units back and
 * forth never drifts (315 lb → 143 kg → 315 lb) and an untouched value saves exactly.
 */
export interface WeightEntry {
  text: string;
  exactKg?: number;
  /** The text `exactKg` was rendered as; once the user edits the text, it no longer applies. */
  exactText?: string;
}

/** An entry showing a stored kg weight in `unit`. */
export function entryFromKg(kg: number, unit: WeightUnit): WeightEntry {
  const text = formatWeight(kg, unit);
  return { text, exactKg: kg, exactText: text };
}

/** The entry's weight in kg (full precision); text that isn't a number counts as 0 (V1 behaviour). */
export function entryToKg(entry: WeightEntry, unit: WeightUnit): number {
  if (entry.exactKg !== undefined && entry.exactText === entry.text) return entry.exactKg;
  const value = parseFloat(entry.text);
  return Number.isFinite(value) ? toKg(value, unit) : 0;
}

/** The entry re-expressed in `to` (on a unit toggle). Text that isn't a number is kept. */
export function convertEntry(entry: WeightEntry, from: WeightUnit, to: WeightUnit): WeightEntry {
  if (from === to) return entry;
  const exact = entry.exactKg !== undefined && entry.exactText === entry.text;
  if (!exact && !Number.isFinite(parseFloat(entry.text))) return entry;
  return entryFromKg(entryToKg(entry, from), to);
}
