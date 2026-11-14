/**
 * A fresh-install V2 database for tests (V1's empty tables + the 0 → 1 migration +
 * starter seeding), exactly what a new install gets.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { migrateDatabase } from '../migrate';
import type { Clock } from '../queries';
import { DATABASE_NAME } from '../schema';
import { seedDatabase } from '../seed';
import { finishWorkout, startWorkout } from '../workouts';
import type { SetType } from '../../lib/workoutDraft';
import type { NodeDb } from './nodeSqliteAdapter';
import { createV1Database, makeTempDir } from './v1Fixture';

export function createFreshV2Database(): { db: NodeDb; cleanup: () => void } {
  const temp = makeTempDir();
  const path = join(temp.dir, DATABASE_NAME);
  const db = createV1Database(path);
  migrateDatabase(db, { databasePath: path, fileExists: existsSync, tzOffsetMinutes: () => 0 });
  seedDatabase(db, new Date('2026-01-01T00:00:00Z'));
  return {
    db,
    cleanup: () => {
      db.close();
      temp.cleanup();
    },
  };
}

export function exerciseIdByName(db: NodeDb, name: string): number {
  const row = db.get<{ id: number }>('SELECT id FROM exercises WHERE name = ?', [name]);
  if (!row) throw new Error(`No exercise ${name}`);
  return row.id;
}

export interface FixtureSet {
  exerciseId: number;
  weight: number;
  reps: number;
  setType?: SetType;
  rpe?: number | null;
}

/**
 * A completed workout written the way the app writes one (start → finish), from
 * `startIso` to `endIso` in a zone `tzOffsetMinutes` from UTC (default UTC+1).
 */
export function logCompletedWorkout(
  db: NodeDb,
  w: { name: string; routineId?: number | null; startIso: string; endIso: string; tzOffsetMinutes?: number; sets: FixtureSet[] }
): number {
  const tz = w.tzOffsetMinutes ?? 60;
  const id = startWorkout(db, { name: w.name, routineId: w.routineId ?? null, draftJson: '{}' }, { now: new Date(w.startIso), tzOffsetMinutes: tz });
  const order: number[] = [];
  for (const s of w.sets) if (!order.includes(s.exerciseId)) order.push(s.exerciseId);
  const counters = new Map<number, number>();
  finishWorkout(
    db,
    id,
    {
      name: w.name,
      exercises: order.map((exerciseId) => ({ exerciseId, notes: '' })),
      sets: w.sets.map((s) => {
        const n = (counters.get(s.exerciseId) ?? 0) + 1;
        counters.set(s.exerciseId, n);
        return { exerciseId: s.exerciseId, setNumber: n, weight: s.weight, reps: s.reps, setType: s.setType ?? 'working', rpe: s.rpe ?? null, completedAt: w.endIso };
      }),
    },
    { now: new Date(w.endIso), tzOffsetMinutes: tz }
  );
  return id;
}

/** A clock that only moves when told to. UTC+1 by default. */
export function manualClock(startIso: string, tzOffsetMinutes = 60) {
  let now = new Date(startIso);
  return {
    clock: (): Clock => ({ now, tzOffsetMinutes }),
    advance(seconds: number) {
      now = new Date(now.getTime() + seconds * 1000);
    },
  };
}
