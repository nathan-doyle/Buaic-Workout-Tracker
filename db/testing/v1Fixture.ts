/**
 * Builds V1 databases for the migration tests, using V1's own SQL (from V1's
 * `database.js`) so the fixtures look exactly like what V1 wrote.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { V1_TABLES_SQL } from '../schema';
import { FALLBACK_SPLITS, MUSCLE_SPLIT_MAP, V1_DEFAULT_EXERCISES } from '../v1Constants';
import { type NodeDb, openNodeDb } from './nodeSqliteAdapter';

export function makeTempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'buaic-test-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** A V1 database file as V1's `initDatabase` left it (tables, FKs on), without seeding. */
export function createV1Database(path: string): NodeDb {
  const db = openNodeDb(path);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(V1_TABLES_SQL);
  return db;
}

/** V1's `addUniversalExercise`. */
export function v1AddExercise(db: NodeDb, name: string, variation: string, muscle: string): void {
  for (const split of MUSCLE_SPLIT_MAP[muscle] ?? FALLBACK_SPLITS) {
    const existing = db.get(
      'SELECT id FROM exercises WHERE LOWER(name) = LOWER(?) AND LOWER(variation) = LOWER(?) AND split_category = ?;',
      [name, variation || '', split]
    );
    if (!existing) {
      db.run('INSERT INTO exercises (name, variation, target_muscle, split_category) VALUES (?, ?, ?, ?);', [
        name,
        variation || '',
        muscle,
        split,
      ]);
    }
  }
}

/** V1's first-launch seeding. */
export function v1Seed(db: NodeDb): void {
  for (const e of V1_DEFAULT_EXERCISES) v1AddExercise(db, e.name, e.variation, e.muscle);
}

/** The id of V1's per-split exercise row. */
export function v1ExerciseId(db: NodeDb, name: string, split: string): number {
  const row = db.get<{ id: number }>('SELECT id FROM exercises WHERE name = ? AND split_category = ? ORDER BY id', [
    name,
    split,
  ]);
  if (!row) throw new Error(`No V1 exercise ${name} in ${split}`);
  return row.id;
}

/** V1's lb → kg on save: `roundToHalf(lb / 2.20462)`. */
export function v1LbToKg(lb: number): number {
  return Math.round((lb / 2.20462) * 2) / 2;
}

/** V1's `saveWorkoutSession` with a fixed timestamp. Weights are already kg. */
export function v1SaveSession(
  db: NodeDb,
  split: string,
  isoDate: string,
  sets: { exerciseId: number; weight: number; reps: number }[]
): number {
  const sessionId = db.run('INSERT INTO workout_sessions (split_name, date_completed, notes) VALUES (?, ?, ?);', [
    split,
    isoDate,
    'Session Logged',
  ]).lastInsertRowId;
  const perExercise = new Map<number, number>();
  for (const set of sets) {
    const setNumber = (perExercise.get(set.exerciseId) ?? 0) + 1;
    perExercise.set(set.exerciseId, setNumber);
    db.run('INSERT INTO set_logs (session_id, exercise_id, set_number, weight, reps) VALUES (?, ?, ?, ?, ?);', [
      sessionId,
      set.exerciseId,
      setNumber,
      set.weight,
      set.reps,
    ]);
  }
  return sessionId;
}

/** V1's `deleteExercise` (deletes the exercise from every split; FKs cascade its sets away). */
export function v1DeleteExercise(db: NodeDb, exerciseId: number): void {
  const target = db.get<{ name: string; variation: string | null }>('SELECT name, variation FROM exercises WHERE id = ?;', [
    exerciseId,
  ]);
  if (target) {
    db.run('DELETE FROM exercises WHERE LOWER(name) = LOWER(?) AND LOWER(variation) = LOWER(?);', [
      target.name,
      target.variation || '',
    ]);
  }
}

/**
 * A realistic V1 database: the seeds plus custom exercises, the same exercise in
 * four splits, lb-entered weights, sessions around midnight UTC and a DST change,
 * an exercise that was never logged, an exercise with the same name but different
 * muscles in different splits, a legacy NULL variation, and a session whose sets
 * were wiped by V1's exercise delete.
 */
export function buildRealisticV1(db: NodeDb): void {
  v1Seed(db);
  v1AddExercise(db, 'Lateral Raise', 'Dumbbell', 'Side Delts');
  v1AddExercise(db, 'Pull Up', '', 'Lats');
  v1AddExercise(db, 'Hammer Curl', 'Dumbbell', 'Biceps'); // never logged
  v1AddExercise(db, 'Shrug', 'Barbell', 'Upper Back'); // Pull, Posterior, Upper, Full Body
  v1AddExercise(db, 'Shrug', 'Barbell', 'Side Delts'); // adds Push and Anterior rows with another muscle
  v1AddExercise(db, 'Leg Curl', 'Machine', 'Hamstrings');
  // Legacy rows from before V1 had the variation column (NULL), next to a '' duplicate.
  db.run("INSERT INTO exercises (name, variation, target_muscle, split_category) VALUES ('Leg Press', NULL, 'Quads', 'Legs')");
  db.run("INSERT INTO exercises (name, variation, target_muscle, split_category) VALUES ('leg press', '', 'Quads', 'Lower')");

  const id = (name: string, split: string) => v1ExerciseId(db, name, split);

  // Push in lb (V1 rounded to 0.5 kg on save): 135 lb → 61 kg, 225 lb → 102 kg.
  v1SaveSession(db, 'Push', '2026-03-28T23:30:00.000Z', [
    { exerciseId: id('Bench Press', 'Push'), weight: v1LbToKg(135), reps: 10 },
    { exerciseId: id('Bench Press', 'Push'), weight: v1LbToKg(225), reps: 5 },
    { exerciseId: id('Bench Press', 'Push'), weight: v1LbToKg(225), reps: 4 },
    { exerciseId: id('Overhead Press', 'Push'), weight: 42.5, reps: 8 },
    { exerciseId: id('Lateral Raise', 'Push'), weight: 10, reps: 15 },
    { exerciseId: id('Shrug', 'Push'), weight: 100, reps: 12 },
  ]);
  // Just after midnight UTC, on the day UK clocks go forward (01:00 UTC).
  v1SaveSession(db, 'Pull', '2026-03-29T00:30:00.000Z', [
    { exerciseId: id('Barbell Row', 'Pull'), weight: 70, reps: 8 },
    { exerciseId: id('Barbell Row', 'Pull'), weight: 70, reps: 8 },
    { exerciseId: id('Pull Up', 'Pull'), weight: 0, reps: 10 },
    { exerciseId: id('Deadlift', 'Pull'), weight: 140, reps: 5 },
    { exerciseId: id('Shrug', 'Pull'), weight: 110, reps: 10 },
  ]);
  // The same exercise in other splits.
  v1SaveSession(db, 'Upper', '2026-04-02T17:05:12.345Z', [
    { exerciseId: id('Bench Press', 'Upper'), weight: 95, reps: 6 },
    { exerciseId: id('Bench Press', 'Upper'), weight: 97.5, reps: 3 },
    { exerciseId: id('Barbell Row', 'Upper'), weight: 72.5, reps: 8 },
  ]);
  v1SaveSession(db, 'Full Body', '2026-07-14T23:30:00.000Z', [
    { exerciseId: id('Squat', 'Full Body'), weight: 120, reps: 5 },
    { exerciseId: id('Bench Press', 'Full Body'), weight: 100, reps: 5 },
    { exerciseId: id('Deadlift', 'Full Body'), weight: 160, reps: 3 },
  ]);
  v1SaveSession(db, 'Legs', '2026-07-15T06:45:00.000Z', [
    { exerciseId: id('Squat', 'Legs'), weight: 125, reps: 5 },
    { exerciseId: id('Squat', 'Legs'), weight: 125, reps: 5 },
    { exerciseId: id('Squat', 'Legs'), weight: 125, reps: 4 },
    { exerciseId: id('Leg Press', 'Legs'), weight: 200, reps: 12 },
    { exerciseId: id('Leg Curl', 'Legs'), weight: 45, reps: 12 },
  ]);
  v1SaveSession(db, 'Lower', '2026-11-14T03:00:00.000Z', [
    { exerciseId: id('leg press', 'Lower'), weight: 210, reps: 10 },
    { exerciseId: id('Deadlift', 'Lower'), weight: 150, reps: 5 },
  ]);
  // A session whose only exercise V1 later deleted: V1's cascade left it empty.
  v1AddExercise(db, 'Cable Fly', 'Cable', 'Lower Chest');
  v1SaveSession(db, 'Anterior', '2026-05-01T12:00:00.000Z', [
    { exerciseId: id('Cable Fly', 'Anterior'), weight: 20, reps: 12 },
  ]);
  v1DeleteExercise(db, id('Cable Fly', 'Push'));
}

/** Every table's rows, for before/after comparisons. */
export function dumpTables(db: NodeDb): Record<string, unknown[]> {
  const tables = db
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .map((r) => r.name);
  const dump: Record<string, unknown[]> = {};
  for (const table of tables) dump[table] = db.all(`SELECT * FROM "${table}" ORDER BY rowid`);
  return dump;
}

export function schemaSql(db: NodeDb): string[] {
  return db
    .all<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name"
    )
    .map((r) => r.sql.replace(/\s+/g, ' ').trim());
}

/** A time-zone function for a named IANA zone (Node's ICU), to pin tests to a zone. */
export function zoneOffsetFn(timeZone: string): (instant: Date) => number {
  const format = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' });
  return (instant) => {
    const name = format.formatToParts(instant).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
    if (!match) return 0;
    const minutes = Number(match[2]) * 60 + Number(match[3]);
    return match[1] === '-' ? -minutes : minutes;
  };
}
