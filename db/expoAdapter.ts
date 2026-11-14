/**
 * `DbAdapter` over an `expo-sqlite` database (synchronous API).
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import type { DbAdapter, SqlParams } from './adapter';

export function expoAdapter(db: SQLiteDatabase): DbAdapter {
  return {
    exec(sql) {
      db.execSync(sql);
    },
    run(sql, params: SqlParams = []) {
      const result = db.runSync(sql, params as (string | number | null)[]);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    },
    get<T>(sql: string, params: SqlParams = []) {
      return db.getFirstSync<T>(sql, params as (string | number | null)[]) ?? null;
    },
    all<T>(sql: string, params: SqlParams = []) {
      return db.getAllSync<T>(sql, params as (string | number | null)[]);
    },
  };
}
