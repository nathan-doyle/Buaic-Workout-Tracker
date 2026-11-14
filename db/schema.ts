/**
 * Database schema.
 *
 * Version 0 is V1's schema (no `user_version`). Version 1 is the V2 schema, reached
 * only through the 0 → 1 migration in `migrate.ts`; a fresh install creates V1's
 * empty tables and runs the same migration, so every install ends up with the
 * same schema. See V2_PROGRESS.md → Plan → Data model.
 */

export const DATABASE_NAME = 'iron_and_stone.db';
export const V1_BACKUP_NAME = 'iron_and_stone.v1-backup.db';
export const SCHEMA_VERSION = 1;

/** V1's tables exactly as V1's `initDatabase` created them. */
export const V1_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    variation TEXT DEFAULT '',
    target_muscle TEXT NOT NULL,
    split_category TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workout_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    split_name TEXT NOT NULL,
    date_completed TEXT NOT NULL,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS set_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    exercise_id INTEGER,
    set_number INTEGER NOT NULL,
    weight REAL NOT NULL,
    reps INTEGER NOT NULL,
    FOREIGN KEY(session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS pr_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lift_name TEXT UNIQUE NOT NULL,
    weight REAL NOT NULL,
    reps INTEGER NOT NULL,
    estimated_1rm REAL NOT NULL,
    date_achieved TEXT NOT NULL
  );
`;

/** V1 tables the migration reads. `pr_records` is left untouched. */
export const V1_DATA_TABLES = ['exercises', 'workout_sessions', 'set_logs'] as const;

/** New exercises table, created under a temporary name and renamed after the copy. */
export const EXERCISES_V2_SQL = `
  CREATE TABLE exercises_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    variation TEXT NOT NULL DEFAULT '',
    primary_muscle TEXT NOT NULL,
    secondary_muscles TEXT NOT NULL DEFAULT '[]',
    equipment TEXT,
    is_custom INTEGER NOT NULL DEFAULT 1,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    notes TEXT
  );
`;

export const ROUTINES_SQL = `
  CREATE TABLE routines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('v1_split', 'template', 'user')),
    archived_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE routine_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL,
    target_sets INTEGER NOT NULL DEFAULT 3,
    rep_min INTEGER,
    rep_max INTEGER,
    rest_seconds INTEGER,
    superset_group INTEGER,
    notes TEXT
  );
`;

/** `workout_sessions` is only extended (V1 columns and ids stay as they are). */
export const WORKOUT_SESSIONS_V2_SQL = `
  ALTER TABLE workout_sessions ADD COLUMN routine_id INTEGER REFERENCES routines(id) ON DELETE SET NULL;
  ALTER TABLE workout_sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('in_progress', 'completed'));
  ALTER TABLE workout_sessions ADD COLUMN started_at TEXT;
  ALTER TABLE workout_sessions ADD COLUMN ended_at TEXT;
  ALTER TABLE workout_sessions ADD COLUMN local_date TEXT;
  ALTER TABLE workout_sessions ADD COLUMN tz_offset_minutes INTEGER;
  ALTER TABLE workout_sessions ADD COLUMN draft_json TEXT;
`;

export const SESSION_EXERCISES_SQL = `
  CREATE TABLE session_exercises (
    session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL,
    notes TEXT,
    superset_group INTEGER,
    PRIMARY KEY (session_id, exercise_id)
  );
`;

/** New set_logs table (`exercise_id` is RESTRICT: no code path can cascade history away). */
export const SET_LOGS_V2_SQL = `
  CREATE TABLE set_logs_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    set_number INTEGER NOT NULL,
    weight REAL NOT NULL,
    reps INTEGER NOT NULL,
    set_type TEXT NOT NULL DEFAULT 'working' CHECK (set_type IN ('warmup', 'working', 'drop', 'failure')),
    rpe REAL,
    completed_at TEXT
  );
`;

export const SETTINGS_SQL = `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
`;

/** Indexes, created after the renamed tables are in place. */
export const INDEXES_SQL = `
  CREATE UNIQUE INDEX idx_exercises_identity ON exercises(LOWER(name), LOWER(variation));
  CREATE INDEX idx_set_logs_exercise ON set_logs(exercise_id);
  CREATE INDEX idx_set_logs_session ON set_logs(session_id);
  CREATE INDEX idx_workout_sessions_local_date ON workout_sessions(local_date);
  CREATE INDEX idx_workout_sessions_status ON workout_sessions(status);
  CREATE INDEX idx_routine_exercises_routine ON routine_exercises(routine_id, position);
  CREATE INDEX idx_routine_exercises_exercise ON routine_exercises(exercise_id);
  CREATE INDEX idx_session_exercises_exercise ON session_exercises(exercise_id);
`;

/** Every V2 table, in an order that satisfies foreign keys when inserting. */
export const V2_TABLES = [
  'exercises',
  'routines',
  'routine_exercises',
  'workout_sessions',
  'session_exercises',
  'set_logs',
  'settings',
  'pr_records',
] as const;

export type V2Table = (typeof V2_TABLES)[number];
