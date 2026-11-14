/**
 * Library search: every word of the query must appear in the name, variation,
 * muscle or equipment (case- and accent-insensitive). Name-prefix matches first.
 */

export interface SearchableExercise {
  name: string;
  variation: string;
  muscle: string;
  equipment: string | null;
  secondaryMuscles?: string;
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function filterExercises<T extends SearchableExercise>(
  exercises: readonly T[],
  filter: { query: string; muscle: string | null; equipment: string | null }
): T[] {
  const words = normalize(filter.query).split(' ').filter(Boolean);
  const q = words.join(' ');
  const matches = exercises.filter((e) => {
    if (filter.muscle && e.muscle !== filter.muscle) return false;
    if (filter.equipment && e.equipment !== filter.equipment) return false;
    if (words.length === 0) return true;
    const hay = normalize(`${e.name} ${e.variation} ${e.muscle} ${e.equipment ?? ''} ${e.secondaryMuscles ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
  if (!q) return matches;
  const rank = (e: T) => (normalize(e.name).startsWith(q) ? 0 : normalize(e.name).includes(q) ? 1 : 2);
  return matches
    .map((e, i) => ({ e, i, r: rank(e) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.e);
}
