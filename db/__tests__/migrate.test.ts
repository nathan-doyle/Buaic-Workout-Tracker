/**
 * Migration 0 → 1 on node:sqlite, through the same `DbAdapter` the app uses.
 * Fixtures and assertions: brief §5 plus the extras in V2_PROGRESS.md.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { formatWeight } from '../../lib/units';
import { getUserVersion } from '../adapter';
import { MigrationError, type MigrationEnv, migrateDatabase } from '../migrate';
import { DATABASE_NAME, SCHEMA_VERSION, V1_BACKUP_NAME } from '../schema';
import { seedDatabase } from '../seed';
import { type NodeDb, openNodeDb } from '../testing/nodeSqliteAdapter';
import {
  buildRealisticV1,
  createV1Database,
  dumpTables,
  makeTempDir,
  schemaSql,
  v1AddExercise,
  v1ExerciseId,
  v1SaveSession,
  v1Seed,
  zoneOffsetFn,
} from '../testing/v1Fixture';

const london = zoneOffsetFn('Europe/London');
const NOW = new Date('2026-11-14T12:00:00.000Z');

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

function dbPath(name = DATABASE_NAME): string {
  return join(temp.dir, name);
}

function env(overrides: Partial<MigrationEnv> = {}): MigrationEnv {
  return {
    databasePath: dbPath(),
    fileExists: existsSync,
    tzOffsetMinutes: london,
    now: () => NOW,
    ...overrides,
  };
}

function realisticV1(): NodeDb {
  const db = createV1Database(dbPath());
  open.push(db);
  buildRealisticV1(db);
  return db;
}

/** What the brief says must survive, read the V1 way and the V2 way. */
function v1Facts(db: NodeDb) {
  return {
    sessions: db.get<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions')!.n,
    sets: db.get<{ n: number }>('SELECT COUNT(*) AS n FROM set_logs')!.n,
    volumes: db.all<{ id: number; n: number; v: number | null }>(
      `SELECT s.id, COUNT(l.id) AS n, SUM(l.weight * l.reps) AS v
       FROM workout_sessions s LEFT JOIN set_logs l ON l.session_id = s.id GROUP BY s.id ORDER BY s.id`
    ),
    // V1's Workout tab: names per split in V1's display order (V1 schema only).
    splits: !db.all<{ name: string }>('PRAGMA table_info(exercises)').some((c) => c.name === 'split_category')
      ? {}
      : Object.fromEntries(
      db
        .all<{ split_category: string }>('SELECT DISTINCT split_category FROM exercises')
        .map(({ split_category: split }) => [
          split,
          db
            .all<{ name: string; variation: string | null }>(
              'SELECT name, variation FROM exercises WHERE split_category = ? ORDER BY target_muscle ASC, name ASC, id ASC',
              [split]
            )
            .map((e) => `${e.name.toLowerCase()}|${(e.variation ?? '').toLowerCase()}`)
            .filter((key, i, all) => all.indexOf(key) === i),
        ])
    ),
  };
}

describe('migration 0 → 1 on a realistic V1 database', () => {
  it('keeps every session, set and per-session volume, and builds the V2 schema', () => {
    const db = realisticV1();
    const before = v1Facts(db);
    expect(before.sessions).toBe(7);

    const result = migrateDatabase(db, env());

    expect(result.status).toBe('migrated');
    expect(getUserVersion(db)).toBe(SCHEMA_VERSION);
    const after = v1Facts(db);
    expect(after.sessions).toBe(before.sessions);
    expect(after.sets).toBe(before.sets);
    expect(after.volumes).toEqual(before.volumes);
    if (result.status === 'migrated') {
      expect(result.report).toMatchObject({
        sessions: 7,
        sets: before.sets,
        droppedOrphanSets: 0,
        unknownExerciseSets: 0,
        sessionsWithoutLocalDate: 0,
      });
    }
  });

  it('leaves no orphan rows', () => {
    const db = realisticV1();
    migrateDatabase(db, env());

    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.get<{ ok: string }>('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
    // Every set's session/exercise pair has a session_exercises row, and vice versa.
    expect(
      db.all(
        `SELECT DISTINCT l.session_id, l.exercise_id FROM set_logs l
         LEFT JOIN session_exercises se ON se.session_id = l.session_id AND se.exercise_id = l.exercise_id
         WHERE se.session_id IS NULL`
      )
    ).toEqual([]);
    expect(
      db.all(
        `SELECT se.* FROM session_exercises se
         WHERE NOT EXISTS (SELECT 1 FROM set_logs l WHERE l.session_id = se.session_id AND l.exercise_id = se.exercise_id)`
      )
    ).toEqual([]);
  });

  it('merges per-split duplicates into one exercise per name + variation (lowest id kept)', () => {
    const db = realisticV1();
    const benchIds = db
      .all<{ id: number }>("SELECT id FROM exercises WHERE name = 'Bench Press' ORDER BY id")
      .map((r) => r.id);
    expect(benchIds).toHaveLength(4);

    migrateDatabase(db, env());

    const bench = db.all<{ id: number; primary_muscle: string; is_custom: number }>(
      "SELECT id, primary_muscle, is_custom FROM exercises WHERE LOWER(name) = 'bench press'"
    );
    expect(bench).toEqual([{ id: benchIds[0], primary_muscle: 'Upper Chest', is_custom: 0 }]);
    // Sets logged under the Upper and Full Body copies now point at the canonical row.
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM set_logs WHERE exercise_id = ?', [benchIds[0]])!.n).toBe(6);
    // Identity is unique, case-insensitively.
    const identities = db.all<{ k: string }>("SELECT LOWER(name) || '|' || LOWER(variation) AS k FROM exercises");
    expect(new Set(identities.map((r) => r.k)).size).toBe(identities.length);
    // Custom exercises are marked custom; nothing is archived.
    expect(db.get("SELECT is_custom FROM exercises WHERE name = 'Lateral Raise'")).toEqual({ is_custom: 1 });
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM exercises WHERE archived_at IS NOT NULL')!.n).toBe(0);
  });

  it('keeps an exercise with different muscles in different splits once, with the other muscles as secondary', () => {
    const db = realisticV1();
    migrateDatabase(db, env());

    expect(db.all("SELECT primary_muscle, secondary_muscles FROM exercises WHERE name = 'Shrug'")).toEqual([
      { primary_muscle: 'Upper Back', secondary_muscles: '["Side Delts"]' },
    ]);
    // It is still in Push (where V1 listed it under Side Delts) and in Pull.
    const routinesWithShrug = db
      .all<{ name: string }>(
        `SELECT r.name FROM routine_exercises re JOIN routines r ON r.id = re.routine_id
         JOIN exercises e ON e.id = re.exercise_id WHERE e.name = 'Shrug' ORDER BY r.position`
      )
      .map((r) => r.name);
    expect(routinesWithShrug).toEqual(['Push', 'Pull', 'Anterior', 'Posterior', 'Upper', 'Full Body']);
  });

  it('merges a legacy NULL variation with an empty one', () => {
    const db = realisticV1();
    migrateDatabase(db, env());

    expect(db.all("SELECT name, variation FROM exercises WHERE LOWER(name) = 'leg press'")).toEqual([
      { name: 'Leg Press', variation: '' },
    ]);
    expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM exercises WHERE variation IS NULL")!.n).toBe(0);
  });

  it('rebuilds every V1 split with exercises as a routine, in V1 menu and display order', () => {
    const db = realisticV1();
    const before = v1Facts(db);

    migrateDatabase(db, env());

    const routines = db.all<{ id: number; name: string; position: number; source: string }>(
      'SELECT id, name, position, source FROM routines ORDER BY position'
    );
    expect(routines.map((r) => r.name)).toEqual([
      'Push',
      'Pull',
      'Legs',
      'Anterior',
      'Posterior',
      'Upper',
      'Lower',
      'Full Body',
    ]);
    expect(routines.every((r) => r.source === 'v1_split')).toBe(true);
    for (const routine of routines) {
      const items = db
        .all<{ k: string }>(
          `SELECT LOWER(e.name) || '|' || LOWER(e.variation) AS k FROM routine_exercises re
           JOIN exercises e ON e.id = re.exercise_id WHERE re.routine_id = ? ORDER BY re.position`,
          [routine.id]
        )
        .map((r) => r.k);
      expect(items).toEqual(before.splits[routine.name]);
    }
  });

  it('sets target sets from the last session of that split (fallback 3)', () => {
    const db = realisticV1();
    migrateDatabase(db, env());
    const targets = (routine: string) =>
      Object.fromEntries(
        db
          .all<{ name: string; target_sets: number }>(
            `SELECT e.name, re.target_sets FROM routine_exercises re
             JOIN routines r ON r.id = re.routine_id JOIN exercises e ON e.id = re.exercise_id WHERE r.name = ?`,
            [routine]
          )
          .map((r) => [r.name, r.target_sets])
      );
    expect(targets('Push')).toMatchObject({ 'Bench Press': 3, 'Overhead Press': 1, 'Lateral Raise': 1, Shrug: 1 });
    expect(targets('Legs')).toMatchObject({ Squat: 3, 'Leg Press': 1, 'Leg Curl': 1 });
    expect(targets('Upper')).toMatchObject({ 'Bench Press': 2, 'Hammer Curl': 3, 'Pull Up': 3 });
  });

  it('keeps an exercise that was never logged, and the session V1 emptied', () => {
    const db = realisticV1();
    migrateDatabase(db, env());

    expect(db.get("SELECT name FROM exercises WHERE name = 'Hammer Curl'")).toEqual({ name: 'Hammer Curl' });
    const empty = db.get<{ split_name: string; n: number }>(
      `SELECT s.split_name, COUNT(l.id) AS n FROM workout_sessions s LEFT JOIN set_logs l ON l.session_id = s.id
       WHERE s.split_name = 'Anterior' GROUP BY s.id`
    );
    expect(empty).toEqual({ split_name: 'Anterior', n: 0 });
  });

  it('backfills status, times, routine and local dates in the pinned zone (DST aware)', () => {
    const db = realisticV1();
    migrateDatabase(db, env());

    const rows = db.all<Record<string, unknown>>(
      `SELECT s.date_completed, s.local_date, s.tz_offset_minutes, s.status, s.started_at, s.ended_at,
              r.name AS routine
       FROM workout_sessions s LEFT JOIN routines r ON r.id = s.routine_id ORDER BY s.id`
    );
    expect(rows.map((r) => [r.date_completed, r.local_date, r.tz_offset_minutes])).toEqual([
      ['2026-03-28T23:30:00.000Z', '2026-03-28', 0], // before midnight UTC, GMT
      ['2026-03-29T00:30:00.000Z', '2026-03-29', 0], // after midnight UTC, still GMT (BST from 01:00 UTC)
      ['2026-04-02T17:05:12.345Z', '2026-04-02', 60],
      ['2026-07-14T23:30:00.000Z', '2026-07-15', 60], // UTC date differs from the local date
      ['2026-07-15T06:45:00.000Z', '2026-07-15', 60],
      ['2026-11-14T03:00:00.000Z', '2026-11-14', 0],
      ['2026-05-01T12:00:00.000Z', '2026-05-01', 60],
    ]);
    for (const row of rows) {
      expect(row.status).toBe('completed');
      expect(row.started_at).toBe(row.date_completed);
      expect(row.ended_at).toBe(row.date_completed);
    }
    expect(rows[0].routine).toBe('Push');
    expect(rows[6].routine).toBe('Anterior');
  });

  it('uses the injected time zone (New York)', () => {
    const db = realisticV1();
    migrateDatabase(db, env({ tzOffsetMinutes: zoneOffsetFn('America/New_York') }));
    expect(db.get("SELECT local_date, tz_offset_minutes FROM workout_sessions WHERE date_completed LIKE '2026-11-14%'")).toEqual({
      local_date: '2026-11-13',
      tz_offset_minutes: -300,
    });
  });

  it('keeps lb-entered weights exactly as stored (shown to the nearest 0.5 lb)', () => {
    const db = realisticV1();
    const weightsBefore = db.all('SELECT id, weight, reps, set_number FROM set_logs ORDER BY id');
    migrateDatabase(db, env());
    expect(db.all('SELECT id, weight, reps, set_number FROM set_logs ORDER BY id')).toEqual(weightsBefore);
    expect(db.all("SELECT DISTINCT set_type, rpe FROM set_logs")).toEqual([{ set_type: 'working', rpe: null }]);
    // V1 saved "135 lb" as 61 kg; V2 shows it as 134.5 lb and never changes the stored value.
    const first = db.get<{ weight: number }>('SELECT weight FROM set_logs ORDER BY id LIMIT 1')!;
    expect(first.weight).toBe(61);
    expect(formatWeight(first.weight, 'lb')).toBe('134.5');
  });

  it('leaves pr_records untouched', () => {
    const db = realisticV1();
    db.run(
      "INSERT INTO pr_records (lift_name, weight, reps, estimated_1rm, date_achieved) VALUES ('Bench', 100, 5, 116.7, '2026-01-01')"
    );
    const before = db.all('SELECT * FROM pr_records');
    migrateDatabase(db, env());
    expect(db.all('SELECT * FROM pr_records')).toEqual(before);
  });

  it('turns enforcement back on and protects history: an exercise with sets cannot be deleted', () => {
    const db = realisticV1();
    migrateDatabase(db, env());
    expect(db.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    const bench = db.get<{ id: number }>("SELECT id FROM exercises WHERE name = 'Bench Press'")!;
    expect(() => db.run('DELETE FROM exercises WHERE id = ?', [bench.id])).toThrow(/FOREIGN KEY/);
  });
});

describe('backup before migrating', () => {
  it('writes iron_and_stone.v1-backup.db with the V1 data before changing anything', () => {
    const db = realisticV1();
    const v1Dump = dumpTables(db);
    const result = migrateDatabase(db, env());

    const backupPath = dbPath(V1_BACKUP_NAME);
    expect(result).toMatchObject({ status: 'migrated', backupPath });
    const backup = openNodeDb(backupPath);
    open.push(backup);
    expect(getUserVersion(backup)).toBe(0);
    expect(dumpTables(backup)).toEqual(v1Dump);
  });

  it('never overwrites an existing backup; a stale one gets a new, timestamped sibling', () => {
    writeFileSync(dbPath(V1_BACKUP_NAME), 'not a database');
    const db = realisticV1();
    const result = migrateDatabase(db, env());

    expect(readFileSync(dbPath(V1_BACKUP_NAME), 'utf8')).toBe('not a database');
    expect(result).toMatchObject({ backupPath: dbPath('iron_and_stone.v1-backup-20261114T120000.db') });
  });
});

describe('rollback', () => {
  it('rolls everything back on failure, keeps the backup, and a retry then succeeds', () => {
    const db = realisticV1();
    const v1Dump = dumpTables(db);
    const v1Schema = schemaSql(db);

    let error: unknown;
    try {
      migrateDatabase(db, {
        ...env(),
        beforeCommit: () => {
          throw new Error('simulated failure');
        },
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(MigrationError);
    expect((error as MigrationError).backupPath).toBe(dbPath(V1_BACKUP_NAME));
    expect(getUserVersion(db)).toBe(0);
    expect(schemaSql(db)).toEqual(v1Schema);
    expect(dumpTables(db)).toEqual(v1Dump);
    expect(db.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });

    // Retry: the matching backup is reused, not overwritten or duplicated.
    const retry = migrateDatabase(db, env());
    expect(retry).toMatchObject({ status: 'migrated', backupPath: dbPath(V1_BACKUP_NAME) });
    expect(readdirSync(temp.dir).filter((f) => f.includes('backup'))).toEqual([V1_BACKUP_NAME]);
  });

  it('refuses a database from a newer app version without touching it', () => {
    const db = realisticV1();
    db.exec('PRAGMA user_version = 2');
    const dump = dumpTables(db);
    expect(() => migrateDatabase(db, env())).toThrow(MigrationError);
    expect(dumpTables(db)).toEqual(dump);
    expect(existsSync(dbPath(V1_BACKUP_NAME))).toBe(false);
  });

  it('refuses to migrate V1 data when no backup can be made', () => {
    const db = realisticV1();
    const dump = dumpTables(db);
    expect(() => migrateDatabase(db, env({ databasePath: join(temp.dir, 'missing-dir', DATABASE_NAME) }))).toThrow(
      expect.objectContaining({ stage: 'backup' })
    );
    expect(getUserVersion(db)).toBe(0);
    expect(dumpTables(db)).toEqual(dump);
  });
});

describe('idempotency', () => {
  it('running the migration twice changes nothing', () => {
    const db = realisticV1();
    migrateDatabase(db, env());
    const once = dumpTables(db);
    const schemaOnce = schemaSql(db);

    expect(migrateDatabase(db, env({ now: () => new Date('2027-01-01T00:00:00Z') }))).toEqual({
      status: 'up_to_date',
      version: SCHEMA_VERSION,
    });
    expect(dumpTables(db)).toEqual(once);
    expect(schemaSql(db)).toEqual(schemaOnce);
    expect(readdirSync(temp.dir).filter((f) => f.includes('backup'))).toEqual([V1_BACKUP_NAME]);
  });

  it('seeding is separate and idempotent, and adds nothing for a V1 user with splits', () => {
    const db = realisticV1();
    migrateDatabase(db, env());
    const migrated = dumpTables(db);
    expect(seedDatabase(db, NOW)).toBe(false);
    expect(seedDatabase(db, NOW)).toBe(false);
    const { settings, ...rest } = dumpTables(db);
    const { settings: _before, ...restBefore } = migrated;
    expect(rest).toEqual(restBefore);
    expect(settings).toEqual([{ key: 'starter_content_seeded', value: 'true' }]);
  });
});

describe('empty and fresh databases', () => {
  it('migrates an empty V1 database (tables, no rows)', () => {
    const db = createV1Database(dbPath());
    open.push(db);
    const result = migrateDatabase(db, env());
    expect(result).toMatchObject({ status: 'migrated', report: { sessions: 0, sets: 0, exercises: 0, routines: 0 } });
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM routines')!.n).toBe(0);
    // Seeding then gives the user V1's starter content, as V1 itself re-seeded an empty library.
    expect(seedDatabase(db, NOW)).toBe(true);
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM exercises')!.n).toBe(6);
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM routines')!.n).toBe(8);
  });

  it('creates the V2 schema on a fresh install without a backup, with the same schema as a migrated V1', () => {
    const fresh = openNodeDb(dbPath());
    open.push(fresh);
    expect(migrateDatabase(fresh, env())).toEqual({ status: 'created', version: SCHEMA_VERSION });
    expect(existsSync(dbPath(V1_BACKUP_NAME))).toBe(false);

    const otherDir = join(temp.dir, 'v1');
    require('node:fs').mkdirSync(otherDir);
    const migrated = createV1Database(join(otherDir, DATABASE_NAME));
    open.push(migrated);
    v1Seed(migrated);
    migrateDatabase(migrated, env({ databasePath: join(otherDir, DATABASE_NAME) }));
    expect(schemaSql(fresh)).toEqual(schemaSql(migrated));
  });

  it('seeds a fresh install like V1: six exercises in all eight splits, in V1 order', () => {
    const fresh = openNodeDb(dbPath());
    open.push(fresh);
    migrateDatabase(fresh, env());
    seedDatabase(fresh, NOW);

    const otherDir = join(temp.dir, 'v1');
    require('node:fs').mkdirSync(otherDir);
    const v1 = createV1Database(join(otherDir, DATABASE_NAME));
    open.push(v1);
    v1Seed(v1);
    const v1Splits = v1Facts(v1).splits;
    for (const [split, items] of Object.entries(v1Splits)) {
      const v2Items = fresh
        .all<{ k: string }>(
          `SELECT LOWER(e.name) || '|' || LOWER(e.variation) AS k FROM routine_exercises re
           JOIN routines r ON r.id = re.routine_id JOIN exercises e ON e.id = re.exercise_id
           WHERE r.name = ? ORDER BY re.position`,
          [split]
        )
        .map((r) => r.k);
      expect(v2Items).toEqual(items);
    }
    expect(fresh.get('SELECT DISTINCT is_custom FROM exercises')).toEqual({ is_custom: 0 });
  });
});

describe('damaged V1 data', () => {
  it('keeps sets of a deleted exercise under an archived "Unknown exercise" and drops sets without a session', () => {
    const db = createV1Database(dbPath());
    open.push(db);
    v1Seed(db);
    v1AddExercise(db, 'Dip', '', 'Triceps');
    const session = v1SaveSession(db, 'Push', '2026-06-01T10:00:00.000Z', [
      { exerciseId: v1ExerciseId(db, 'Bench Press', 'Push'), weight: 80, reps: 5 },
      { exerciseId: v1ExerciseId(db, 'Dip', 'Push'), weight: 10, reps: 8 },
    ]);
    db.exec('PRAGMA foreign_keys = OFF');
    db.run("DELETE FROM exercises WHERE name = 'Dip'"); // without the cascade
    db.run('INSERT INTO set_logs (session_id, exercise_id, set_number, weight, reps) VALUES (999, 1, 1, 50, 5)');
    db.exec('PRAGMA foreign_keys = ON');

    const result = migrateDatabase(db, env());

    expect(result).toMatchObject({ status: 'migrated', report: { droppedOrphanSets: 1, unknownExerciseSets: 1, sets: 2 } });
    expect(db.get(`SELECT COUNT(*) AS n, SUM(weight * reps) AS v FROM set_logs WHERE session_id = ?`, [session])).toEqual({
      n: 2,
      v: 480,
    });
    const unknown = db.get<{ archived_at: string | null; primary_muscle: string }>(
      "SELECT archived_at, primary_muscle FROM exercises WHERE name = 'Unknown exercise'"
    )!;
    expect(unknown.archived_at).not.toBeNull();
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    // The dropped set is still in the backup.
    const backup = openNodeDb(dbPath(V1_BACKUP_NAME));
    open.push(backup);
    expect(backup.get<{ n: number }>('SELECT COUNT(*) AS n FROM set_logs')!.n).toBe(3);
  });
});

// Local only: BUAIC_REAL_DB=<path to a copy of a phone database> npx jest migrate
const realDb = process.env.BUAIC_REAL_DB;
(realDb ? describe : describe.skip)('real phone database (local only, BUAIC_REAL_DB)', () => {
  it('migrates a copy and keeps everything', () => {
    const copy = dbPath();
    writeFileSync(copy, readFileSync(realDb as string));
    const db = openNodeDb(copy);
    open.push(db);
    db.exec('PRAGMA foreign_keys = ON');
    const before = v1Facts(db);
    const result = migrateDatabase(db, env({ tzOffsetMinutes: undefined }));
    const after = v1Facts(db);
    expect(after.sessions).toBe(before.sessions);
    expect(after.sets).toBe(before.sets);
    expect(after.volumes).toEqual(before.volumes);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    seedDatabase(db);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ result, routines: db.all('SELECT name, position, source FROM routines ORDER BY position') }));
  });
});
