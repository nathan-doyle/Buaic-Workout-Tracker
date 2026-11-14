/**
 * Schema migration runner: V1 (user_version 0) → V2 schema 1.
 *
 * Order (V2_PROGRESS.md → Plan → Migration 0 → 1):
 *  1. Skip if already at version 1. Refuse a database from a newer app version.
 *  2. Back up with `VACUUM INTO` and verify the copy's row counts. No backup, no migration.
 *     An existing backup is never overwritten.
 *  3. Foreign keys off, one `BEGIN IMMEDIATE` transaction: canonical exercises, V1 splits →
 *     routines, extended sessions with local dates, rebuilt set_logs, session_exercises.
 *  4. Verify inside the transaction (counts, per-session volume, foreign_key_check);
 *     any mismatch rolls everything back.
 *  5. `user_version = 1`, commit, foreign keys back on.
 *
 * All SQL goes through `DbAdapter`, so Jest runs exactly this code on node:sqlite.
 */
import { localDateString, isLocalDateString, tzOffsetMinutesOf } from '../lib/dates';
import { type DbAdapter, getUserVersion, sqlString, transaction } from './adapter';
import {
  EXERCISES_V2_SQL,
  INDEXES_SQL,
  ROUTINES_SQL,
  SCHEMA_VERSION,
  SESSION_EXERCISES_SQL,
  SET_LOGS_V2_SQL,
  SETTINGS_SQL,
  V1_BACKUP_NAME,
  V1_DATA_TABLES,
  V1_TABLES_SQL,
  WORKOUT_SESSIONS_V2_SQL,
} from './schema';
import { isV1DefaultExercise, V1_SPLITS } from './v1Constants';

/** Offset from UTC in minutes (ISO sign) at an instant; injectable so tests can pin a zone. */
export type TzOffsetFn = (instant: Date) => number;

export interface MigrationEnv {
  /** Absolute path of the database file. Required when there is V1 data to back up. */
  databasePath: string | null;
  fileExists(path: string): boolean;
  tzOffsetMinutes?: TzOffsetFn;
  now?: () => Date;
  /** Test hook: runs inside the transaction just before the commit. */
  beforeCommit?: (db: DbAdapter) => void;
}

export type MigrationStage = 'backup' | 'migrate' | 'verify';

export class MigrationError extends Error {
  readonly stage: MigrationStage;
  /** The verified backup, if one exists. */
  readonly backupPath: string | null;

  constructor(stage: MigrationStage, message: string, backupPath: string | null, cause?: unknown) {
    super(message);
    this.name = 'MigrationError';
    this.stage = stage;
    this.backupPath = backupPath;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export interface MigrationReport {
  sessions: number;
  sets: number;
  v1ExerciseRows: number;
  exercises: number;
  routines: number;
  /** Sets whose session no longer existed (invisible in V1; kept in the backup only). */
  droppedOrphanSets: number;
  /** Sets whose exercise no longer existed; moved to an archived "Unknown exercise". */
  unknownExerciseSets: number;
  /** Sessions whose `date_completed` could not be read as a date. */
  sessionsWithoutLocalDate: number;
}

export type MigrationResult =
  | { status: 'up_to_date'; version: number }
  | { status: 'created'; version: number }
  | { status: 'migrated'; version: number; backupPath: string; report: MigrationReport };

export function migrateDatabase(db: DbAdapter, env: MigrationEnv): MigrationResult {
  const version = getUserVersion(db);
  if (version > SCHEMA_VERSION) {
    throw new MigrationError(
      'migrate',
      `This database was written by a newer version of Buaic (schema ${version}).`,
      null
    );
  }
  if (version === SCHEMA_VERSION) return { status: 'up_to_date', version };

  const hasV1Data = listTables(db).some((t) => (V1_DATA_TABLES as readonly string[]).includes(t));
  if (!hasV1Data) {
    migrateV0ToV1(db, env, null);
    return { status: 'created', version: SCHEMA_VERSION };
  }

  const backupPath = ensureV1Backup(db, env);
  const report = migrateV0ToV1(db, env, backupPath);
  return { status: 'migrated', version: SCHEMA_VERSION, backupPath, report };
}

// ==========================================
// BACKUP
// ==========================================

/** Creates (or reuses a matching) backup of the whole file and returns its path. */
export function ensureV1Backup(db: DbAdapter, env: MigrationEnv): string {
  if (!env.databasePath) {
    throw new MigrationError('backup', 'The database file location is unknown, so no backup could be made.', null);
  }
  const { dir, sep } = splitDir(env.databasePath);
  let path = `${dir}${sep}${V1_BACKUP_NAME}`;

  if (env.fileExists(path)) {
    // A backup from an earlier attempt. Reuse it only if it still matches the data;
    // never overwrite it (the data may have changed in V1 since, so make a new one).
    if (backupMatches(db, path)) return path;
    const stamp = (env.now?.() ?? new Date()).toISOString().replace(/[-:]/g, '').slice(0, 15);
    path = `${dir}${sep}iron_and_stone.v1-backup-${stamp}.db`;
    for (let n = 2; env.fileExists(path); n++) {
      path = `${dir}${sep}iron_and_stone.v1-backup-${stamp}-${n}.db`;
    }
  }

  try {
    createVerifiedCopy(db, path);
  } catch (error) {
    throw new MigrationError('backup', messageOf(error), null, error);
  }
  return path;
}

/**
 * Writes a consistent copy of the whole database to `path` (which must not exist)
 * and checks it. `VACUUM INTO` works in any journal mode and outside a transaction.
 */
export function createVerifiedCopy(db: DbAdapter, path: string): void {
  try {
    db.exec(`VACUUM INTO ${sqlString(path)}`);
  } catch (error) {
    throw new Error(`The backup copy could not be written: ${messageOf(error)}`);
  }
  if (!backupMatches(db, path)) throw new Error('The backup copy does not match your data.');
}

/** True if the file at `path` is a healthy copy with the same tables and row counts. */
export function backupMatches(db: DbAdapter, path: string): boolean {
  try {
    db.exec(`ATTACH DATABASE ${sqlString(path)} AS v1_backup`);
  } catch {
    return false;
  }
  try {
    const check = db.get<Record<string, unknown>>('PRAGMA v1_backup.quick_check');
    if (!check || Object.values(check)[0] !== 'ok') return false;
    for (const table of listTables(db)) {
      const present = db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM v1_backup.sqlite_master WHERE type = 'table' AND name = ?",
        [table]
      );
      if (!present?.n) return false;
      const q = quoteIdent(table);
      const main = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM main.${q}`)?.n;
      const copy = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM v1_backup.${q}`)?.n;
      if (main !== copy) return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    try {
      db.exec('DETACH DATABASE v1_backup');
    } catch {
      // Not attached.
    }
  }
}

// ==========================================
// MIGRATION 0 → 1
// ==========================================

interface V1Snapshot {
  sessions: number;
  sets: number;
  perSession: Map<number, { n: number; volume: number }>;
  droppedOrphanSets: number;
}

function migrateV0ToV1(db: DbAdapter, env: MigrationEnv, backupPath: string | null): MigrationReport {
  // Must be off for the table rebuilds: with it on, DROP TABLE exercises would cascade
  // V1's ON DELETE CASCADE into set_logs. The pragma is a no-op inside a transaction.
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    if (db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys !== 0) {
      throw new MigrationError('migrate', 'Foreign keys could not be turned off.', backupPath);
    }
    return transaction(db, () => {
      const report = runMigrationSteps(db, env, backupPath);
      env.beforeCommit?.(db);
      return report;
    });
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError('migrate', `The update failed: ${messageOf(error)}`, backupPath, error);
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

function runMigrationSteps(db: DbAdapter, env: MigrationEnv, backupPath: string | null): MigrationReport {
  const now = env.now?.() ?? new Date();
  const nowIso = now.toISOString();
  const tzOf = env.tzOffsetMinutes ?? tzOffsetMinutesOf;

  // 0. V1 tables (missing on a fresh install; V1 itself added `variation` later).
  db.exec(V1_TABLES_SQL);
  const exerciseColumns = db.all<{ name: string }>('PRAGMA table_info(exercises)');
  if (!exerciseColumns.some((c) => c.name === 'variation')) {
    db.exec("ALTER TABLE exercises ADD COLUMN variation TEXT DEFAULT ''");
  }

  // 1. Snapshot of what must survive (sets that belong to an existing session).
  const before = snapshotV1(db);

  // 2. Canonical exercises: one per LOWER(name) + LOWER(variation), lowest id kept.
  const v1Rows = db.all<{
    id: number;
    name: string;
    variation: string | null;
    target_muscle: string;
    split_category: string;
    k_name: string;
    k_variation: string;
  }>(
    `SELECT id, name, variation, target_muscle, split_category,
            LOWER(name) AS k_name, LOWER(COALESCE(variation, '')) AS k_variation
     FROM exercises ORDER BY id`
  );
  const groups = new Map<string, typeof v1Rows>();
  for (const row of v1Rows) {
    const key = `${row.k_name}\u0000${row.k_variation}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  db.exec(EXERCISES_V2_SQL);
  db.exec('CREATE TEMP TABLE _v1_exercise_map (old_id INTEGER PRIMARY KEY, new_id INTEGER NOT NULL)');
  for (const group of groups.values()) {
    const canonical = group[0];
    const secondary: string[] = [];
    for (const row of group) {
      if (row.target_muscle !== canonical.target_muscle && !secondary.includes(row.target_muscle)) {
        secondary.push(row.target_muscle);
      }
    }
    db.run(
      `INSERT INTO exercises_v2 (id, name, variation, primary_muscle, secondary_muscles, is_custom, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        canonical.id,
        canonical.name,
        canonical.variation ?? '',
        canonical.target_muscle,
        JSON.stringify(secondary),
        isV1DefaultExercise(canonical.name, canonical.variation) ? 0 : 1,
        nowIso,
      ]
    );
    for (const row of group) {
      db.run('INSERT INTO _v1_exercise_map (old_id, new_id) VALUES (?, ?)', [row.id, canonical.id]);
    }
  }

  // Sets pointing at an exercise that no longer exists (should not happen with V1's
  // foreign keys on, but they would break the new constraints): keep them, under an
  // archived placeholder, so counts and volumes stay exact.
  const unknownExerciseSets =
    db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM set_logs l
       WHERE EXISTS (SELECT 1 FROM workout_sessions s WHERE s.id = l.session_id)
         AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.id = l.exercise_id)`
    )?.n ?? 0;
  let placeholderId: number | null = null;
  if (unknownExerciseSets > 0) {
    const existing = groups.get('unknown exercise\u0000v1');
    placeholderId = existing
      ? existing[0].id
      : db.run(
          `INSERT INTO exercises_v2 (name, variation, primary_muscle, is_custom, archived_at, created_at)
           VALUES ('Unknown exercise', 'V1', 'Other', 1, ?, ?)`,
          [nowIso, nowIso]
        ).lastInsertRowId;
  }

  // 3. Routines: one per V1 split that had exercises, V1 menu order, V1 display order.
  db.exec(ROUTINES_SQL);
  const splitNames = [...new Set(v1Rows.map((r) => r.split_category))];
  const knownOrder: readonly string[] = V1_SPLITS;
  const orderedSplits = [
    ...knownOrder.filter((s) => splitNames.includes(s)),
    ...splitNames.filter((s) => !knownOrder.includes(s)).sort(),
  ];
  // Sets in each V1 row's most recent session (V1's "last time" picks the highest set id).
  const lastSessionSetCounts = new Map(
    db
      .all<{ old_id: number; n: number }>(
        `SELECT l.exercise_id AS old_id, COUNT(*) AS n
         FROM set_logs l
         JOIN (SELECT exercise_id, MAX(id) AS last_id FROM set_logs
               WHERE session_id IN (SELECT id FROM workout_sessions)
               GROUP BY exercise_id) AS latest ON latest.exercise_id = l.exercise_id
         JOIN set_logs l2 ON l2.id = latest.last_id
         WHERE l.session_id = l2.session_id
         GROUP BY l.exercise_id`
      )
      .map((r) => [r.old_id, r.n] as const)
  );
  const routineIdBySplit = new Map<string, number>();
  const expectedRoutineSizes = new Map<number, number>();
  orderedSplits.forEach((split, position) => {
    const routineId = db.run(
      "INSERT INTO routines (name, position, source, created_at) VALUES (?, ?, 'v1_split', ?)",
      [split, position, nowIso]
    ).lastInsertRowId;
    routineIdBySplit.set(split, routineId);

    // Exactly V1's query and order (BINARY collation), id as the tie-break.
    const rows = db.all<{ id: number; new_id: number }>(
      `SELECT e.id, m.new_id FROM exercises e JOIN _v1_exercise_map m ON m.old_id = e.id
       WHERE e.split_category = ? ORDER BY e.target_muscle ASC, e.name ASC, e.id ASC`,
      [split]
    );
    const seen = new Set<number>();
    for (const row of rows) {
      if (seen.has(row.new_id)) continue; // same exercise twice in one split (NULL-variation duplicates)
      db.run(
        'INSERT INTO routine_exercises (routine_id, exercise_id, position, target_sets) VALUES (?, ?, ?, ?)',
        [routineId, row.new_id, seen.size, lastSessionSetCounts.get(row.id) ?? 3]
      );
      seen.add(row.new_id);
    }
    expectedRoutineSizes.set(routineId, seen.size);
  });

  // 4. Sessions: extend, backfill status, times and local dates (per row, so DST is right).
  db.exec(WORKOUT_SESSIONS_V2_SQL);
  const sessions = db.all<{ id: number; split_name: string; date_completed: unknown }>(
    'SELECT id, split_name, date_completed FROM workout_sessions'
  );
  let sessionsWithoutLocalDate = 0;
  for (const session of sessions) {
    const raw = String(session.date_completed);
    const instant = new Date(raw);
    let localDate: string | null = null;
    let tzOffset: number | null = null;
    if (Number.isFinite(instant.getTime())) {
      tzOffset = tzOf(instant);
      localDate = localDateString(instant, tzOffset);
    } else if (isLocalDateString(raw.slice(0, 10))) {
      localDate = raw.slice(0, 10);
    } else {
      sessionsWithoutLocalDate += 1;
    }
    db.run(
      `UPDATE workout_sessions
       SET status = 'completed', started_at = date_completed, ended_at = date_completed,
           local_date = ?, tz_offset_minutes = ?, routine_id = ?
       WHERE id = ?`,
      [localDate, tzOffset, routineIdBySplit.get(session.split_name) ?? null, session.id]
    );
  }

  // 5. set_logs rebuilt: ids kept, exercise ids repointed, working sets, completed at the session time.
  db.exec(SET_LOGS_V2_SQL);
  db.run(
    `INSERT INTO set_logs_v2 (id, session_id, exercise_id, set_number, weight, reps, set_type, rpe, completed_at)
     SELECT l.id, l.session_id, COALESCE(m.new_id, ?), l.set_number, l.weight, l.reps, 'working', NULL, s.date_completed
     FROM set_logs l
     JOIN workout_sessions s ON s.id = l.session_id
     LEFT JOIN _v1_exercise_map m ON m.old_id = l.exercise_id
     ORDER BY l.id`,
    [placeholderId]
  );

  // 6. session_exercises: one row per session/exercise, in V1's History order.
  db.exec(SESSION_EXERCISES_SQL);
  db.exec(
    `INSERT INTO session_exercises (session_id, exercise_id, position)
     SELECT session_id, exercise_id,
            ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY muscle, name, first_set_id) - 1
     FROM (
       SELECT n.session_id, n.exercise_id,
              MIN(COALESCE(e.target_muscle, '')) AS muscle,
              MIN(COALESCE(e.name, '')) AS name,
              MIN(n.id) AS first_set_id
       FROM set_logs_v2 n
       JOIN set_logs l ON l.id = n.id
       LEFT JOIN exercises e ON e.id = l.exercise_id
       GROUP BY n.session_id, n.exercise_id
     )`
  );

  // 7. Swap in the rebuilt tables (SQLite's documented create-copy-drop-rename order).
  db.exec(`
    DROP TABLE set_logs;
    ALTER TABLE set_logs_v2 RENAME TO set_logs;
    DROP TABLE exercises;
    ALTER TABLE exercises_v2 RENAME TO exercises;
  `);
  db.exec(SETTINGS_SQL);
  db.exec(INDEXES_SQL);

  // 8. Verify before committing.
  const exercisesAfter = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM exercises')?.n ?? 0;
  verifyMigration(db, before, {
    expectedExercises: groups.size + (placeholderId !== null && !groups.has('unknown exercise\u0000v1') ? 1 : 0),
    expectedRoutineSizes,
    sessionsWithoutLocalDate,
    backupPath,
  });
  db.exec('DROP TABLE _v1_exercise_map');
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  return {
    sessions: before.sessions,
    sets: before.sets,
    v1ExerciseRows: v1Rows.length,
    exercises: exercisesAfter,
    routines: orderedSplits.length,
    droppedOrphanSets: before.droppedOrphanSets,
    unknownExerciseSets,
    sessionsWithoutLocalDate,
  };
}

function snapshotV1(db: DbAdapter): V1Snapshot {
  const sessions = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions')?.n ?? 0;
  const perSessionRows = db.all<{ session_id: number; n: number; volume: number }>(
    `SELECT l.session_id, COUNT(*) AS n, TOTAL(l.weight * l.reps) AS volume
     FROM set_logs l JOIN workout_sessions s ON s.id = l.session_id
     GROUP BY l.session_id`
  );
  const perSession = new Map(perSessionRows.map((r) => [r.session_id, { n: r.n, volume: r.volume }]));
  const sets = perSessionRows.reduce((sum, r) => sum + r.n, 0);
  const allSets = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM set_logs')?.n ?? 0;
  return { sessions, sets, perSession, droppedOrphanSets: allSets - sets };
}

function verifyMigration(
  db: DbAdapter,
  before: V1Snapshot,
  expected: {
    expectedExercises: number;
    expectedRoutineSizes: Map<number, number>;
    sessionsWithoutLocalDate: number;
    backupPath: string | null;
  }
): void {
  const fail = (what: string): never => {
    throw new MigrationError('verify', `Check failed after the update: ${what}. Nothing was changed.`, expected.backupPath);
  };

  const sessions = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions')?.n;
  if (sessions !== before.sessions) fail(`workout count ${sessions} ≠ ${before.sessions}`);

  const sets = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM set_logs')?.n;
  if (sets !== before.sets) fail(`set count ${sets} ≠ ${before.sets}`);

  const perSession = db.all<{ session_id: number; n: number; volume: number }>(
    'SELECT session_id, COUNT(*) AS n, TOTAL(weight * reps) AS volume FROM set_logs GROUP BY session_id'
  );
  if (perSession.length !== before.perSession.size) fail('sessions with sets differ');
  for (const row of perSession) {
    const old = before.perSession.get(row.session_id);
    if (!old || old.n !== row.n || !sameVolume(old.volume, row.volume)) {
      fail(`volume of workout ${row.session_id}`);
    }
  }

  const orphans = db.all('PRAGMA foreign_key_check');
  if (orphans.length > 0) fail(`${orphans.length} broken references`);

  const unmapped = db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM _v1_exercise_map m
     WHERE NOT EXISTS (SELECT 1 FROM exercises e WHERE e.id = m.new_id)`
  )?.n;
  if (unmapped !== 0) fail('exercise mapping');

  const exercises = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM exercises')?.n;
  if (exercises !== expected.expectedExercises) fail(`exercise count ${exercises} ≠ ${expected.expectedExercises}`);

  for (const [routineId, size] of expected.expectedRoutineSizes) {
    const n = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM routine_exercises WHERE routine_id = ?', [routineId])?.n;
    if (n !== size) fail(`routine ${routineId} has ${n} exercises, expected ${size}`);
  }

  const missingDates = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions WHERE local_date IS NULL')?.n;
  if (missingDates !== expected.sessionsWithoutLocalDate) fail('local dates');

  const check = db.get<Record<string, unknown>>('PRAGMA quick_check');
  if (!check || Object.values(check)[0] !== 'ok') fail('database integrity');
}

// ==========================================
// HELPERS
// ==========================================

function sameVolume(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

export function listTables(db: DbAdapter): string[] {
  return db
    .all<{ name: string }>(
      "SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .map((r) => r.name);
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function splitDir(path: string): { dir: string; sep: string } {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (index < 0) return { dir: '.', sep: '/' };
  return { dir: path.slice(0, index), sep: path[index] };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
