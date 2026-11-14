/**
 * JSON backup: export every table as one file, validate a file before import,
 * and replace all data with it in one transaction.
 *
 * Validation is driven by the live schema (`PRAGMA table_info`), so it stays in
 * step with `schema.ts`. Import never merges: it replaces everything, and only
 * after the user confirmed a preview (see features/backup).
 */
import { type DbAdapter, type SqlValue, getUserVersion, transaction } from './adapter';
import { SCHEMA_VERSION, V2_TABLES, type V2Table } from './schema';

export const BACKUP_FORMAT = 'buaic-backup';
export const BACKUP_FORMAT_VERSION = 1;

export type BackupRow = Record<string, SqlValue>;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  appVersion: string | null;
  exportedAt: string;
  tables: Record<V2Table, BackupRow[]>;
}

export interface BackupSummary {
  workouts: number;
  sets: number;
  exercises: number;
  routines: number;
  /** Local dates of the first and last completed workout. */
  firstDate: string | null;
  lastDate: string | null;
  exportedAt: string;
  appVersion: string | null;
}

export type BackupValidation =
  | { ok: true; backup: BackupFile; summary: BackupSummary }
  | { ok: false; error: string };

export function exportDatabase(db: DbAdapter, meta: { appVersion: string | null; now: Date }): BackupFile {
  const tables = {} as Record<V2Table, BackupRow[]>;
  for (const table of V2_TABLES) {
    tables[table] = db.all<BackupRow>(`SELECT * FROM ${table} ORDER BY rowid`);
  }
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: getUserVersion(db),
    appVersion: meta.appVersion,
    exportedAt: meta.now.toISOString(),
    tables,
  };
}

export function summarizeBackup(backup: BackupFile): BackupSummary {
  const sessions = backup.tables.workout_sessions;
  const completed = sessions.filter((s) => s.status === 'completed');
  const completedIds = new Set(completed.map((s) => s.id));
  const dates = completed
    .map((s) => s.local_date)
    .filter((d): d is string => typeof d === 'string')
    .sort();
  return {
    workouts: completed.length,
    sets: backup.tables.set_logs.filter((l) => completedIds.has(l.session_id)).length,
    exercises: backup.tables.exercises.filter((e) => e.archived_at === null || e.archived_at === undefined).length,
    routines: backup.tables.routines.filter((r) => r.archived_at === null || r.archived_at === undefined).length,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    exportedAt: backup.exportedAt,
    appVersion: backup.appVersion,
  };
}

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

/** Checks a parsed JSON value against the format and the live schema. */
export function validateBackup(db: DbAdapter, input: unknown): BackupValidation {
  const invalid = (error: string): BackupValidation => ({ ok: false, error });
  if (!isPlainObject(input) || input.format !== BACKUP_FORMAT) {
    return invalid('This is not a Buaic backup file.');
  }
  if (input.formatVersion !== BACKUP_FORMAT_VERSION || typeof input.schemaVersion !== 'number') {
    return invalid('This backup file has an unknown format.');
  }
  if (input.schemaVersion > SCHEMA_VERSION) {
    return invalid('This backup was made by a newer version of Buaic. Update the app, then import it.');
  }
  if (input.schemaVersion !== SCHEMA_VERSION) {
    return invalid('This backup file has an unsupported schema version.');
  }
  if (typeof input.exportedAt !== 'string' || !Number.isFinite(Date.parse(input.exportedAt))) {
    return invalid('This backup file has no valid export date.');
  }
  if (input.appVersion !== null && typeof input.appVersion !== 'string') {
    return invalid('This backup file has an invalid app version.');
  }
  const tables = input.tables;
  if (!isPlainObject(tables)) return invalid('This backup file has no data.');
  for (const name of Object.keys(tables)) {
    if (!(V2_TABLES as readonly string[]).includes(name)) return invalid(`Unknown table "${name}" in the backup.`);
  }

  for (const table of V2_TABLES) {
    const rows = tables[table];
    if (!Array.isArray(rows)) return invalid(`The backup is missing the ${table} table.`);
    const columns = db.all<ColumnInfo>(`PRAGMA table_info(${table})`);
    const byName = new Map(columns.map((c) => [c.name, c]));
    for (let i = 0; i < rows.length; i++) {
      const error = checkRow(rows[i], columns, byName);
      if (error) return invalid(`The backup is damaged (${table}, row ${i + 1}: ${error}).`);
    }
  }

  const backup = input as unknown as BackupFile;
  return { ok: true, backup, summary: summarizeBackup(backup) };
}

function checkRow(row: unknown, columns: ColumnInfo[], byName: Map<string, ColumnInfo>): string | null {
  if (!isPlainObject(row)) return 'not an object';
  for (const key of Object.keys(row)) {
    if (!byName.has(key)) return `unknown column "${key}"`;
  }
  for (const column of columns) {
    const value = row[column.name];
    const required = column.pk > 0 || (column.notnull === 1 && column.dflt_value === null);
    if (value === undefined || value === null) {
      if (required || (value === null && column.notnull === 1)) return `"${column.name}" is missing`;
      continue;
    }
    const type = column.type.toUpperCase();
    if (type === 'INTEGER') {
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) return `"${column.name}" must be a whole number`;
    } else if (type === 'REAL') {
      if (typeof value !== 'number' || !Number.isFinite(value)) return `"${column.name}" must be a number`;
    } else if (type === 'TEXT') {
      if (typeof value !== 'string') return `"${column.name}" must be text`;
    } else if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) {
      return `"${column.name}" has an invalid value`;
    }
  }
  return null;
}

/**
 * Replaces all data with the backup's, in one transaction. Throws (and changes
 * nothing) if any row is rejected or a reference is broken.
 */
export function importBackup(db: DbAdapter, backup: BackupFile): void {
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    transaction(db, () => {
      for (const table of [...V2_TABLES].reverse()) db.run(`DELETE FROM ${table}`);
      for (const table of V2_TABLES) {
        for (const row of backup.tables[table]) {
          const columns = Object.keys(row);
          db.run(
            `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
            columns.map((c) => row[c])
          );
        }
      }
      const broken = db.all('PRAGMA foreign_key_check');
      if (broken.length > 0) throw new Error(`The backup is damaged (${broken.length} broken references).`);
      for (const table of V2_TABLES) {
        const n = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n;
        if (n !== backup.tables[table].length) throw new Error(`Import check failed for ${table}.`);
      }
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
