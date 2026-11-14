/**
 * The bundled exercise library and routine templates.
 *
 * Seeding inserts what is missing by identity (case-insensitive name + variation)
 * and never duplicates or changes a user's exercise; it only fills in equipment and
 * secondary muscles where those are still empty. It runs once per library version.
 */
import { type DbAdapter, transaction } from './adapter';
import library from './exerciseLibrary.json';
import { ensureExercise } from './queries';
import { cleanSecondaryMuscles, createRoutine, writeRoutineExercises } from './routines';
import { MUSCLE_SPLIT_MAP, V1_DEFAULT_EXERCISES, V1_SPLITS } from './v1Constants';

export const LIBRARY_VERSION_KEY = 'library_seeded_version';

export interface LibraryEntry {
  name: string;
  variation: string;
  muscle: string;
  secondary: string[];
  equipment: string;
}

export const LIBRARY: { version: number; exercises: LibraryEntry[] } = library;

/** Adds missing library exercises. Returns how many were inserted. Idempotent. */
export function seedLibrary(db: DbAdapter, now: Date = new Date()): number {
  return transaction(db, () => {
    const stored = db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [LIBRARY_VERSION_KEY]);
    if (stored && Number(JSON.parse(stored.value)) >= LIBRARY.version) return 0;
    const nowIso = now.toISOString();
    let inserted = 0;
    for (const e of LIBRARY.exercises) {
      const existing = db.get<{ id: number; primary: string }>(
        'SELECT id, primary_muscle AS "primary" FROM exercises WHERE LOWER(name) = LOWER(?) AND LOWER(variation) = LOWER(?)',
        [e.name, e.variation]
      );
      if (existing) {
        // Never list the row's own main muscle (a user may have picked a different one) as secondary.
        const secondary = cleanSecondaryMuscles(e.secondary.filter((m) => m !== e.muscle), existing.primary);
        db.run(
          `UPDATE exercises SET equipment = COALESCE(equipment, ?),
             secondary_muscles = CASE WHEN secondary_muscles = '[]' THEN ? ELSE secondary_muscles END
           WHERE id = ?`,
          [e.equipment, JSON.stringify(secondary), existing.id]
        );
        continue;
      }
      db.run(
        `INSERT INTO exercises (name, variation, primary_muscle, secondary_muscles, equipment, is_custom, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [e.name, e.variation, e.muscle, JSON.stringify(e.secondary), e.equipment, nowIso]
      );
      inserted += 1;
    }
    db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [LIBRARY_VERSION_KEY, JSON.stringify(LIBRARY.version)]
    );
    return inserted;
  });
}

// ==========================================
// TEMPLATES
// ==========================================

interface TemplateExercise {
  name: string;
  variation: string;
  sets: number;
  repMin: number;
  repMax: number;
  rest: number;
}
export interface RoutineTemplate {
  id: string;
  name: string;
  description: string;
  routines: { name: string; exercises: TemplateExercise[] }[];
}

const ex = (name: string, variation: string, sets: number, repMin: number, repMax: number, rest: number): TemplateExercise => ({
  name,
  variation,
  sets,
  repMin,
  repMax,
  rest,
});

/** V1's starter splits: its six exercises, in V1's order (muscle, then name), 3 sets. */
function v1SplitTemplates(): RoutineTemplate[] {
  return V1_SPLITS.map((split) => ({
    id: `v1-${split.toLowerCase().replace(/\s+/g, '-')}`,
    name: `${split} (V1 split)`,
    description: 'The starter split from Buaic 1.0.',
    routines: [
      {
        name: split,
        exercises: V1_DEFAULT_EXERCISES.filter((e) => (MUSCLE_SPLIT_MAP[e.muscle] ?? []).includes(split))
          .sort((a, b) => (a.muscle === b.muscle ? a.name.localeCompare(b.name) : a.muscle.localeCompare(b.muscle)))
          .map((e) => ex(e.name, e.variation, 3, 6, 10, 120)),
      },
    ],
  })).filter((t) => t.routines[0].exercises.length > 0);
}

export const TEMPLATES: RoutineTemplate[] = [
  {
    id: 'ppl',
    name: 'Push / Pull / Legs',
    description: 'Three days: pressing, pulling, legs. Run it once or twice a week.',
    routines: [
      {
        name: 'Push',
        exercises: [
          ex('Bench Press', 'Barbell', 4, 5, 8, 180),
          ex('Overhead Press', 'Dumbbell', 3, 8, 10, 120),
          ex('Incline Dumbbell Press', 'Dumbbell', 3, 8, 12, 120),
          ex('Lateral Raise', 'Dumbbell', 3, 12, 15, 60),
          ex('Triceps Pushdown', 'Rope', 3, 10, 15, 60),
        ],
      },
      {
        name: 'Pull',
        exercises: [
          ex('Deadlift', 'Conventional', 3, 3, 5, 180),
          ex('Lat Pulldown', 'Wide Grip', 3, 8, 12, 120),
          ex('Seated Cable Row', 'Cable', 3, 8, 12, 120),
          ex('Face Pull', 'Cable', 3, 12, 15, 60),
          ex('Bicep Curl', 'EZ Bar', 3, 8, 12, 60),
        ],
      },
      {
        name: 'Legs',
        exercises: [
          ex('Squat', 'Barbell', 4, 5, 8, 180),
          ex('Romanian Deadlift', 'Barbell', 3, 8, 10, 120),
          ex('Leg Press', 'Machine', 3, 10, 12, 120),
          ex('Lying Leg Curl', 'Machine', 3, 10, 12, 60),
          ex('Standing Calf Raise', 'Machine', 4, 10, 15, 60),
        ],
      },
    ],
  },
  {
    id: 'upper-lower',
    name: 'Upper / Lower',
    description: 'Two days, alternating. Good for four sessions a week.',
    routines: [
      {
        name: 'Upper',
        exercises: [
          ex('Bench Press', 'Barbell', 4, 5, 8, 180),
          ex('Barbell Row', 'Barbell', 4, 6, 10, 150),
          ex('Overhead Press', 'Barbell', 3, 6, 10, 120),
          ex('Lat Pulldown', 'Close Grip', 3, 8, 12, 90),
          ex('Bicep Curl', 'Dumbbell', 2, 10, 12, 60),
          ex('Overhead Triceps Extension', 'Cable', 2, 10, 12, 60),
        ],
      },
      {
        name: 'Lower',
        exercises: [
          ex('Squat', 'Barbell', 4, 5, 8, 180),
          ex('Romanian Deadlift', 'Barbell', 3, 8, 10, 150),
          ex('Bulgarian Split Squat', 'Dumbbell', 3, 8, 12, 90),
          ex('Seated Leg Curl', 'Machine', 3, 10, 12, 60),
          ex('Standing Calf Raise', 'Machine', 3, 10, 15, 60),
          ex('Hanging Leg Raise', '', 3, 10, 15, 60),
        ],
      },
    ],
  },
  {
    id: 'full-body-3x',
    name: 'Full Body 3×',
    description: 'Three full-body days (A, B, C) for three sessions a week.',
    routines: [
      {
        name: 'Full Body A',
        exercises: [
          ex('Squat', 'Barbell', 3, 5, 8, 180),
          ex('Bench Press', 'Barbell', 3, 5, 8, 150),
          ex('Barbell Row', 'Barbell', 3, 6, 10, 120),
          ex('Plank', '', 3, 30, 60, 60),
        ],
      },
      {
        name: 'Full Body B',
        exercises: [
          ex('Deadlift', 'Conventional', 3, 3, 5, 180),
          ex('Overhead Press', 'Barbell', 3, 6, 10, 120),
          ex('Pull-Up', '', 3, 6, 10, 120),
          ex('Lunge', 'Walking', 3, 10, 12, 90),
        ],
      },
      {
        name: 'Full Body C',
        exercises: [
          ex('Front Squat', 'Barbell', 3, 6, 8, 150),
          ex('Incline Dumbbell Press', 'Dumbbell', 3, 8, 12, 120),
          ex('Dumbbell Row', 'One Arm', 3, 8, 12, 90),
          ex('Hip Thrust', 'Barbell', 3, 8, 12, 90),
        ],
      },
    ],
  },
  ...v1SplitTemplates(),
];

/** Creates the template's routines at the end of the list, in one transaction. Returns their ids. */
export function addTemplate(db: DbAdapter, templateId: string, now: Date = new Date()): number[] {
  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error(`No template ${templateId}`);
  const nowIso = now.toISOString();
  return transaction(db, () =>
    template.routines.map((r) => {
      const id = createRoutine(db, r.name, nowIso, 'template');
      const items = r.exercises.map((e) => {
        const entry = LIBRARY.exercises.find(
          (l) => l.name.toLowerCase() === e.name.toLowerCase() && l.variation.toLowerCase() === e.variation.toLowerCase()
        );
        const exerciseId = ensureExercise(
          db,
          { name: e.name, variation: e.variation, muscle: entry?.muscle ?? 'Abs', isCustom: false },
          nowIso
        );
        return { exerciseId, targetSets: e.sets, repMin: e.repMin, repMax: e.repMax, restSeconds: e.rest };
      });
      writeRoutineExercises(db, id, items);
      return id;
    })
  );
}
