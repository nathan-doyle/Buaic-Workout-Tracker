/**
 * Settings persistence, the settings store, and JSON export/import.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { createSettingsStore } from '../../features/settings/settingsStore';
import { exportDatabase, importBackup, validateBackup, type BackupFile } from '../backupJson';
import { migrateDatabase } from '../migrate';
import { DATABASE_NAME } from '../schema';
import { seedDatabase } from '../seed';
import { DEFAULT_SETTINGS, readSettings, writeSetting } from '../settings';
import { type NodeDb, openNodeDb } from '../testing/nodeSqliteAdapter';
import { buildRealisticV1, createV1Database, dumpTables, makeTempDir, zoneOffsetFn } from '../testing/v1Fixture';

let temp: ReturnType<typeof makeTempDir>;
let open: NodeDb[];
beforeEach(() => {
  temp = makeTempDir();
  open = [];
});
afterEach(() => {
  open.forEach((db) => db.close());
  temp.cleanup();
});

function migratedV1(name = DATABASE_NAME): NodeDb {
  const path = join(temp.dir, name);
  const db = createV1Database(path);
  open.push(db);
  buildRealisticV1(db);
  migrateDatabase(db, { databasePath: path, fileExists: existsSync, tzOffsetMinutes: zoneOffsetFn('Europe/London') });
  seedDatabase(db);
  return db;
}

function freshV2(name: string): NodeDb {
  const db = openNodeDb(join(temp.dir, name));
  open.push(db);
  db.exec('PRAGMA foreign_keys = ON');
  migrateDatabase(db, { databasePath: join(temp.dir, name), fileExists: existsSync });
  seedDatabase(db);
  return db;
}

describe('settings', () => {
  it('defaults: kg, Monday, 90 s', () => {
    expect(readSettings(migratedV1())).toMatchObject({ unit: 'kg', weekStart: 'monday', defaultRestSeconds: 90 });
    expect(DEFAULT_SETTINGS).toMatchObject({ unit: 'kg', weekStart: 'monday', defaultRestSeconds: 90 });
  });

  it('persists values as JSON and reads them back', () => {
    const db = migratedV1();
    writeSetting(db, 'unit', 'lb');
    writeSetting(db, 'weekStart', 'sunday');
    writeSetting(db, 'defaultRestSeconds', 120);
    writeSetting(db, 'unit', 'lb'); // upsert
    expect(readSettings(db)).toMatchObject({ unit: 'lb', weekStart: 'sunday', defaultRestSeconds: 120 });
    writeSetting(db, 'platesKg', [20, 10, 1.25]);
    writeSetting(db, 'autoStartRest', false);
    expect(readSettings(db)).toMatchObject({ platesKg: [20, 10, 1.25], autoStartRest: false, restSound: true });
    expect(() => writeSetting(db, 'incrementKg', 0)).toThrow(RangeError);
    expect(db.get("SELECT value FROM settings WHERE key = 'unit'")).toEqual({ value: '"lb"' });
  });

  it('rejects invalid values and ignores unreadable stored ones', () => {
    const db = migratedV1();
    expect(() => writeSetting(db, 'unit', 'stone' as 'kg')).toThrow(RangeError);
    expect(() => writeSetting(db, 'defaultRestSeconds', 1.5)).toThrow(RangeError);
    db.run("INSERT INTO settings (key, value) VALUES ('unit', 'not json'), ('week_start', '\"friday\"')");
    expect(readSettings(db)).toEqual(DEFAULT_SETTINGS);
  });

  it('store: loads, notifies subscribers, persists, and survives a reload', () => {
    const db = migratedV1();
    const store = createSettingsStore();
    const seen: string[] = [];
    const unsubscribe = store.subscribe(() => seen.push(store.getSnapshot().unit));
    store.attach(db);
    const before = store.getSnapshot();
    store.set('unit', 'lb');
    store.set('unit', 'lb'); // unchanged: no write, no notification
    expect(store.getSnapshot()).not.toBe(before);
    expect(seen).toEqual(['kg', 'lb']);
    unsubscribe();
    store.set('defaultRestSeconds', 60);
    expect(seen).toEqual(['kg', 'lb']);

    const reloaded = createSettingsStore();
    reloaded.attach(db);
    expect(reloaded.getSnapshot()).toMatchObject({ unit: 'lb', weekStart: 'monday', defaultRestSeconds: 60 });
  });
});

describe('JSON backup', () => {
  const meta = { appVersion: '2.0.0', now: new Date('2026-11-14T12:00:00Z') };

  it('exports every table with schema version, app version and date', () => {
    const db = migratedV1();
    const backup = exportDatabase(db, meta);
    expect(backup).toMatchObject({ format: 'buaic-backup', formatVersion: 1, schemaVersion: 1, appVersion: '2.0.0' });
    expect(backup.exportedAt).toBe('2026-11-14T12:00:00.000Z');
    expect(Object.keys(backup.tables).sort()).toEqual(
      ['exercises', 'pr_records', 'routine_exercises', 'routines', 'session_exercises', 'set_logs', 'settings', 'workout_sessions'].sort()
    );
    expect(backup.tables.set_logs).toHaveLength(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM set_logs')!.n);
  });

  it('round-trips through JSON into another database exactly, with a preview', () => {
    const source = migratedV1();
    writeSetting(source, 'unit', 'lb');
    const json = JSON.stringify(exportDatabase(source, meta));

    const target = freshV2('target.db');
    const validation = validateBackup(target, JSON.parse(json));
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.summary).toEqual({
      workouts: 7,
      sets: 24,
      exercises: 12,
      routines: 8,
      firstDate: '2026-03-28',
      lastDate: '2026-11-14',
      exportedAt: '2026-11-14T12:00:00.000Z',
      appVersion: '2.0.0',
    });

    importBackup(target, validation.backup);
    expect(dumpTables(target)).toEqual(dumpTables(source));
    expect(readSettings(target).unit).toBe('lb');
    expect(target.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(target.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
  });

  it('rejects files that are not valid backups', () => {
    const db = migratedV1();
    const good = exportDatabase(db, meta);
    const variant = (change: (b: Record<string, any>) => void) => {
      const copy = JSON.parse(JSON.stringify(good));
      change(copy);
      return validateBackup(db, copy);
    };
    expect(validateBackup(db, null)).toEqual({ ok: false, error: 'This is not a Buaic backup file.' });
    expect(validateBackup(db, [1, 2])).toMatchObject({ ok: false });
    expect(variant((b) => (b.format = 'strong'))).toMatchObject({ ok: false });
    expect(variant((b) => (b.schemaVersion = 2))).toEqual({
      ok: false,
      error: 'This backup was made by a newer version of Buaic. Update the app, then import it.',
    });
    expect(variant((b) => delete b.tables.set_logs)).toMatchObject({ ok: false, error: expect.stringContaining('set_logs') });
    expect(variant((b) => (b.tables.extra = []))).toMatchObject({ ok: false });
    expect(variant((b) => (b.tables.set_logs[0].weight = '100'))).toMatchObject({
      ok: false,
      error: expect.stringContaining('"weight" must be a number'),
    });
    expect(variant((b) => (b.tables.set_logs[0].reps = 2.5))).toMatchObject({ ok: false });
    expect(variant((b) => (b.tables.exercises[0].hack = 1))).toMatchObject({ ok: false });
    expect(variant((b) => delete b.tables.exercises[0].name)).toMatchObject({ ok: false });
    expect(variant((b) => delete b.tables.set_logs[0].id)).toMatchObject({ ok: false });
    expect(variant((b) => (b.exportedAt = 'yesterday'))).toMatchObject({ ok: false });
  });

  it('a backup with a broken reference is rejected on import and changes nothing', () => {
    const target = migratedV1();
    const before = dumpTables(target);
    const backup = exportDatabase(target, meta) as BackupFile;
    backup.tables.set_logs[0].exercise_id = 424242;
    const validation = validateBackup(target, backup);
    expect(validation.ok).toBe(true); // types are fine; the reference check happens in the transaction
    expect(() => importBackup(target, backup)).toThrow(/broken references/);
    expect(dumpTables(target)).toEqual(before);
  });

  it('import replaces data (no merge)', () => {
    const empty = freshV2('empty.db');
    const emptyBackup = exportDatabase(empty, meta);
    const target = migratedV1();
    importBackup(target, emptyBackup);
    expect(target.get<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions')!.n).toBe(0);
    expect(dumpTables(target)).toEqual(dumpTables(empty));
  });
});
