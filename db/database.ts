/**
 * Developer: Nathan Doyle
 * Application: Buaic Workout Tracker
 * File: db/database.ts
 * Purpose: The app's database: opens `iron_and_stone.db`, runs the migration and
 *          seeding at startup, and exposes the queries the screens use.
 *
 * V2 Phase 2: the SQL lives in `queries.ts` / `migrate.ts` (tested in Jest on node:sqlite);
 * this file binds it to the expo-sqlite connection. The exported function names are
 * V1's, so V1's screens keep working; like V1, they log errors and return an empty
 * result instead of throwing.
 */
import * as SQLite from 'expo-sqlite';
import { File } from 'expo-file-system';

import { todayLocalDate, tzOffsetMinutesOf } from '../lib/dates';
import type { DbAdapter } from './adapter';
import { expoAdapter } from './expoAdapter';
import { MigrationError, type MigrationResult, migrateDatabase } from './migrate';
import * as Q from './queries';
import { DATABASE_NAME, V1_BACKUP_NAME } from './schema';
import { seedDatabase } from './seed';
import { ALL_MUSCLE_GROUPS } from './v1Constants';

export { ALL_MUSCLE_GROUPS, MUSCLE_SPLIT_MAP } from './v1Constants';
export type {
  CalendarDay,
  CoverageStatus,
  ExerciseRow,
  HistorySession,
  HistorySet,
  MuscleCoverage,
  PastSet,
  SetLogInput,
  TopSetRow,
} from './queries';

// ==========================================
// 1. CONNECTION & STARTUP
// ==========================================

let sqlite: SQLite.SQLiteDatabase | null = null;
let adapter: DbAdapter | null = null;

/** The open database. Only valid after `startDatabase()` succeeded. */
export function getDb(): DbAdapter {
  if (!adapter) throw new Error('The database is not open yet.');
  return adapter;
}

/** Absolute filesystem path of the database file. */
export function databaseFilePath(): string | null {
  if (!sqlite) return null;
  return sqlite.databasePath.replace(/^file:\/\//, '');
}

/** Path of a sibling file in the database's directory. */
export function siblingPath(fileName: string): string | null {
  const path = databaseFilePath();
  if (!path) return null;
  return `${path.slice(0, path.lastIndexOf('/'))}/${fileName}`;
}

export function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

export function fileExists(path: string): boolean {
  try {
    return new File(toFileUri(path)).exists;
  } catch {
    return false;
  }
}

export type StartupResult =
  | { ok: true; migration: MigrationResult }
  | { ok: false; error: Error; backupPath: string | null };

/**
 * Opens the database, migrates it (backup first) and seeds it. Never throws: a
 * failure leaves the file as it was (the migration rolled back) and is returned.
 */
export function startDatabase(): StartupResult {
  try {
    if (!sqlite) {
      sqlite = SQLite.openDatabaseSync(DATABASE_NAME);
      adapter = expoAdapter(sqlite);
    }
    const db = getDb();
    db.exec('PRAGMA foreign_keys = ON;');

    const migration = migrateDatabase(db, { databasePath: databaseFilePath(), fileExists });
    if (migration.status === 'migrated') {
      console.log(
        `Database migrated to schema ${migration.version}: ${JSON.stringify(migration.report)}; backup ${migration.backupPath}`
      );
    }

    try {
      seedDatabase(db);
    } catch (error) {
      // Starter content is optional; user data is already safe and migrated.
      console.error('Seeding failed:', error);
    }
    return { ok: true, migration };
  } catch (error) {
    console.error('Database startup failed:', error);
    const fromMigration = error instanceof MigrationError ? error.backupPath : null;
    const existing = siblingPath(V1_BACKUP_NAME);
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
      backupPath: fromMigration ?? (existing && fileExists(existing) ? existing : null),
    };
  }
}

// ==========================================
// 2. V1 SCREEN QUERIES (V1 names, V2 schema)
// ==========================================

function safely<T>(what: string, fallback: T, fn: (db: DbAdapter) => T): T {
  try {
    return fn(getDb());
  } catch (error) {
    console.error(`Error ${what}:`, error);
    return fallback;
  }
}

/** Adds an exercise to the library and to every split its muscle maps to (V1 behaviour). */
export const addUniversalExercise = (name: string, variation: string | null | undefined, targetMuscle: string): boolean =>
  safely('adding exercise', false, (db) => {
    Q.addUniversalExercise(db, name, variation, targetMuscle, new Date());
    return true;
  });

export const getExercisesBySplit = (split: string): Q.ExerciseRow[] =>
  safely('fetching exercises by split', [], (db) => Q.getExercisesBySplit(db, split));

/** Removes an exercise from every split. Its history is kept (it is archived, not deleted). */
export const deleteExercise = (exerciseId: number): boolean =>
  safely('removing exercise', false, (db) => {
    Q.removeExercise(db, exerciseId, new Date());
    return true;
  });

/** Saves a finished workout and its sets (weights in kg) in one transaction. */
export const saveWorkoutSession = (
  splitName: string,
  notes: string | null | undefined,
  setLogs: Q.SetLogInput[]
): boolean =>
  safely('saving workout session', false, (db) => {
    const now = new Date();
    Q.saveWorkoutSession(db, splitName, notes, setLogs, { now, tzOffsetMinutes: tzOffsetMinutesOf(now) });
    return true;
  });

export const getLastExercisePerformance = (exerciseId: number): Q.PastSet | null =>
  safely('fetching past performance', null, (db) => Q.getLastExercisePerformance(db, exerciseId));

/** Heaviest set per exercise (the Top Sets tab). */
export const getBig3PRs = (): Q.TopSetRow[] => safely('fetching top sets', [], (db) => Q.getTopSets(db));

export const getMuscleCoverageStatus = (): Record<string, Q.MuscleCoverage> =>
  safely('computing muscle coverage', {}, (db) => Q.getMuscleCoverage(db, ALL_MUSCLE_GROUPS, todayLocalDate()));

export const getWorkoutHistory = (): Q.HistorySession[] =>
  safely('fetching workout history', [], (db) => Q.getWorkoutHistory(db));

export const getCalendarActivity = (): Record<string, Q.CalendarDay> =>
  safely('fetching calendar activity', {}, (db) => Q.getCalendarActivity(db));

export const deleteWorkoutSession = (sessionId: number): boolean =>
  safely('deleting session', false, (db) => {
    Q.deleteWorkoutSession(db, sessionId);
    return true;
  });
