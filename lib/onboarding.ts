/**
 * First-run onboarding (Phase 5): at most three skippable steps — units, bar weight,
 * and a starter plan. Pure state; the screen applies the result through the
 * settings store and `db/onboarding.ts`.
 */
import type { WeightUnit } from './units';

export const ONBOARDING_STEPS = ['units', 'bar', 'plan'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** `keep` = Buaic's starter splits (what a fresh install already has); `blank` = no routines. */
export type StarterPlan = 'keep' | 'ppl' | 'upper-lower' | 'full-body-3x' | 'blank';

export const STARTER_PLANS: { id: StarterPlan; title: string; detail: string }[] = [
  { id: 'ppl', title: 'Push / Pull / Legs', detail: 'Three routines, rep ranges and rest set' },
  { id: 'upper-lower', title: 'Upper / Lower', detail: 'Two routines, four days a week' },
  { id: 'full-body-3x', title: 'Full Body 3×', detail: 'Three full-body routines' },
  { id: 'keep', title: 'Buaic starter splits', detail: 'The six classic splits from Buaic 1.0' },
  { id: 'blank', title: 'Start blank', detail: 'No routines; build your own' },
];

/** Bar weights the onboarding offers (more in Settings). */
export const ONBOARDING_BARS: Record<WeightUnit, readonly number[]> = { kg: [20, 15, 10], lb: [45, 35, 25] };

export interface OnboardingState {
  step: number;
  unit: WeightUnit;
  barKg: number;
  barLb: number;
  plan: StarterPlan;
}

export function initialOnboarding(current: { unit: WeightUnit; barKg: number; barLb: number }): OnboardingState {
  return { step: 0, unit: current.unit, barKg: current.barKg, barLb: current.barLb, plan: 'keep' };
}

export const currentStep = (s: OnboardingState): OnboardingStep => ONBOARDING_STEPS[s.step];
export const isLastStep = (s: OnboardingState): boolean => s.step === ONBOARDING_STEPS.length - 1;

export function nextStep(s: OnboardingState): OnboardingState {
  return isLastStep(s) ? s : { ...s, step: s.step + 1 };
}

export function previousStep(s: OnboardingState): OnboardingState {
  return s.step === 0 ? s : { ...s, step: s.step - 1 };
}

/** The bar weight for the chosen unit. */
export const barFor = (s: OnboardingState): number => (s.unit === 'kg' ? s.barKg : s.barLb);

export function setBar(s: OnboardingState, weight: number): OnboardingState {
  return s.unit === 'kg' ? { ...s, barKg: weight } : { ...s, barLb: weight };
}

export type OnboardingWrite =
  | ['unit', WeightUnit]
  | ['barKg', number]
  | ['barLb', number]
  | ['onboardingStatus', 'done'];

/**
 * Settings to write when the user finishes (or skips at) a step. Skipping keeps the
 * defaults for the steps not reached, but what was already chosen is kept, and
 * onboarding is always marked done so it never shows again.
 */
export function onboardingWrites(s: OnboardingState, completed: boolean): OnboardingWrite[] {
  const writes: OnboardingWrite[] = [];
  if (completed || s.step > 0) writes.push(['unit', s.unit]);
  if (completed || s.step > 1) writes.push(s.unit === 'kg' ? ['barKg', s.barKg] : ['barLb', s.barLb]);
  writes.push(['onboardingStatus', 'done']);
  return writes;
}

/** The starter plan to apply: only when the last step was completed (skipping keeps the starter splits). */
export function planToApply(s: OnboardingState, completed: boolean): StarterPlan {
  return completed ? s.plan : 'keep';
}
