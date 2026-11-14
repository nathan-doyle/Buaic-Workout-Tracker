/**
 * V1's split and muscle constants. Pure data (no expo imports) so Jest can use them.
 */

/** V1's splits in its menu order (also the order migrated routines get). */
export const V1_SPLITS = [
  'Push',
  'Pull',
  'Legs',
  'Anterior',
  'Posterior',
  'Upper',
  'Lower',
  'Full Body',
] as const;

/**
 * Maps each muscle group to the splits an exercise for it is added to (V1 behaviour,
 * kept until Phase 3 replaces splits with routines; see V2_PROGRESS.md → Q3).
 */
export const MUSCLE_SPLIT_MAP: Record<string, string[]> = {
  'Upper Chest': ['Push', 'Anterior', 'Upper', 'Full Body'],
  'Lower Chest': ['Push', 'Anterior', 'Upper', 'Full Body'],
  'Front Delts': ['Push', 'Anterior', 'Upper', 'Full Body'],
  'Side Delts': ['Push', 'Anterior', 'Upper', 'Full Body'],
  'Rear Delts': ['Pull', 'Posterior', 'Upper', 'Full Body'],
  'Upper Back': ['Pull', 'Posterior', 'Upper', 'Full Body'],
  'Lats': ['Pull', 'Posterior', 'Upper', 'Full Body'],
  'Traps': ['Pull', 'Posterior', 'Upper', 'Full Body'],
  'Lower Back': ['Pull', 'Posterior', 'Lower', 'Full Body'],
  'Biceps': ['Pull', 'Anterior', 'Upper', 'Full Body'],
  'Triceps': ['Push', 'Posterior', 'Upper', 'Full Body'],
  'Forearms': ['Pull', 'Anterior', 'Upper', 'Full Body'],
  'Abs': ['Push', 'Anterior', 'Upper', 'Full Body'],
  'Obliques': ['Push', 'Anterior', 'Upper', 'Full Body'],
  'Quads': ['Legs', 'Anterior', 'Lower', 'Full Body'],
  'Hamstrings': ['Legs', 'Posterior', 'Lower', 'Full Body'],
  'Glutes': ['Legs', 'Posterior', 'Lower', 'Full Body'],
  'Adductors': ['Legs', 'Anterior', 'Lower', 'Full Body'],
  'Calves': ['Legs', 'Posterior', 'Lower', 'Full Body'],
};

/** V1's fallback when a muscle has no mapping. */
export const FALLBACK_SPLITS = ['Push', 'Upper', 'Full Body'];

/** The 16 muscle groups V1's Coverage tab shows. */
export const ALL_MUSCLE_GROUPS: string[] = [
  'Upper Chest',
  'Lower Chest',
  'Front Delts',
  'Side Delts',
  'Rear Delts',
  'Upper Back',
  'Lats',
  'Traps',
  'Lower Back',
  'Biceps',
  'Triceps',
  'Forearms',
  'Abs',
  'Obliques',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Adductors',
  'Calves',
];

/** The six exercises V1 seeded on first launch (in V1's insertion order). */
export const V1_DEFAULT_EXERCISES: readonly { name: string; variation: string; muscle: string }[] = [
  { name: 'Bench Press', variation: 'Barbell', muscle: 'Upper Chest' },
  { name: 'Overhead Press', variation: 'Barbell', muscle: 'Front Delts' },
  { name: 'Incline Dumbbell Press', variation: 'Dumbbell', muscle: 'Upper Chest' },
  { name: 'Barbell Row', variation: 'Barbell', muscle: 'Lats' },
  { name: 'Deadlift', variation: 'Conventional', muscle: 'Lower Back' },
  { name: 'Squat', variation: 'Barbell', muscle: 'Quads' },
];

/** True if `name`/`variation` is one of V1's seeded exercises (ASCII case-insensitive, like SQL LOWER). */
export function isV1DefaultExercise(name: string, variation: string | null): boolean {
  const n = name.toLowerCase();
  const v = (variation ?? '').toLowerCase();
  return V1_DEFAULT_EXERCISES.some((e) => e.name.toLowerCase() === n && e.variation.toLowerCase() === v);
}
