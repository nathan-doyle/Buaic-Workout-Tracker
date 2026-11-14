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
