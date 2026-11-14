/**
 * A small synchronous database interface.
 *
 * The migration, queries, settings and backup code are written against this
 * interface only, so the same SQL runs in the app (`expo-sqlite`, see
 * `expoAdapter.ts`) and in Jest under Node (built-in `node:sqlite`, see
 * `testing/nodeSqliteAdapter.ts`).
 */

export type SqlValue = string | number | null;
export type SqlParams = readonly SqlValue[];

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface DbAdapter {
  /** Runs one or more statements without parameters or results. */
  exec(sql: string): void;
  /** Runs one statement with parameters. */
  run(sql: string, params?: SqlParams): RunResult;
  /** First row of a query, or null. */
  get<T>(sql: string, params?: SqlParams): T | null;
  /** All rows of a query. */
  all<T>(sql: string, params?: SqlParams): T[];
}

/**
 * Runs `fn` inside `BEGIN IMMEDIATE … COMMIT`, rolling back if it throws.
 * Not reentrant: callers never nest transactions.
 */
export function transaction<T>(db: DbAdapter, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // SQLite may already have rolled back (e.g. after SQLITE_FULL); the original error matters.
    }
    throw error;
  }
}

/** `PRAGMA user_version` of the main database. */
export function getUserVersion(db: DbAdapter): number {
  return db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
}

/** Quotes a string as an SQL literal (for statements that take no parameters, like ATTACH paths). */
export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
