/**
 * `DbAdapter` over Node's built-in `node:sqlite`, for Jest only (nothing in the
 * app imports this file, so Metro never bundles it). No native package to install.
 */
import { DatabaseSync } from 'node:sqlite';

import type { DbAdapter, SqlParams } from '../adapter';

export interface NodeDb extends DbAdapter {
  close(): void;
  readonly path: string;
}

/** Opens (or creates) a database file; `':memory:'` for an in-memory one. */
export function openNodeDb(path: string): NodeDb {
  // Foreign keys start OFF, as in SQLite itself and expo-sqlite; callers set the pragma.
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: false });
  // Rows come back with a null prototype; copy them so Jest compares plain objects.
  const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;
  return {
    path,
    close: () => db.close(),
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params: SqlParams = []) {
      const result = db.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    get<T>(sql: string, params: SqlParams = []) {
      const row = db.prepare(sql).get(...params);
      return row === undefined ? null : plain<T>(row);
    },
    all<T>(sql: string, params: SqlParams = []) {
      return db.prepare(sql).all(...params).map((row) => plain<T>(row));
    },
  };
}
