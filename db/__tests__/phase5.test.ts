/**
 * Phase 5 data: new settings, plate editing, onboarding on fresh installs only,
 * the starter plan, completed-workout count, bodyweight lookup.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { restorePointName } from '../../lib/restorePoints';
import { exportDatabase, importBackup, validateBackup } from '../backupJson';
import { seedLibrary } from '../library';
import { createVerifiedCopy } from '../migrate';
import { openNodeDb } from '../testing/nodeSqliteAdapter';
import { migrateDatabase } from '../migrate';
import { applyStarterPlan } from '../onboarding';
import { listRoutines } from '../routines';
import { DATABASE_NAME } from '../schema';
import { seedDatabase } from '../seed';
import { DEFAULT_SETTINGS, isValidSetting, PLATE_OPTIONS, readSettings, togglePlate, writeSetting } from '../settings';
import { createV1Database, buildRealisticV1, makeTempDir, zoneOffsetFn } from '../testing/v1Fixture';
import { createFreshV2Database, exerciseIdByName, logCompletedWorkout } from '../testing/v2Fixture';
import { bodyweightExerciseIds, countCompletedWorkouts, startWorkout } from '../workouts';

describe('Phase 5 settings', () => {
  it('defaults: keep awake on, onboarding done, never prompted, story card with weights', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      keepAwake: true,
      onboardingStatus: 'done',
      reviewPromptedVersion: null,
      shareHideWeights: false,
      shareFormat: 'story',
    });
  });

  it('persists and validates the new keys', () => {
    const { db, cleanup } = createFreshV2Database();
    try {
      writeSetting(db, 'keepAwake', false);
      writeSetting(db, 'reviewPromptedVersion', '2.0.0');
      writeSetting(db, 'shareHideWeights', true);
      writeSetting(db, 'shareFormat', 'square');
      writeSetting(db, 'onboardingStatus', 'done');
      expect(readSettings(db)).toMatchObject({
        keepAwake: false,
        reviewPromptedVersion: '2.0.0',
        shareHideWeights: true,
        shareFormat: 'square',
        onboardingStatus: 'done',
      });
      expect(() => writeSetting(db, 'shareFormat', 'landscape' as never)).toThrow(RangeError);
      expect(() => writeSetting(db, 'reviewPromptedVersion', '' as never)).toThrow(RangeError);
      expect(() => writeSetting(db, 'platesKg', [])).toThrow(RangeError); // at least one plate
      // A damaged stored value falls back to the default.
      db.run("UPDATE settings SET value = '\"sometimes\"' WHERE key = 'onboarding_status'");
      expect(readSettings(db).onboardingStatus).toBe('done');
    } finally {
      cleanup();
    }
  });

  it('plate list editing: on/off, heaviest first, never empty', () => {
    expect(togglePlate([20, 10], 25)).toEqual([25, 20, 10]);
    expect(togglePlate([25, 20, 10], 20)).toEqual([25, 10]);
    expect(togglePlate([10], 10)).toEqual([10]);
    expect(togglePlate([1.25, 2.5], 0.5)).toEqual([2.5, 1.25, 0.5]);
    for (const p of [...PLATE_OPTIONS.kg, ...PLATE_OPTIONS.lb]) expect(isValidSetting('platesKg', [p])).toBe(true);
    expect(DEFAULT_SETTINGS.platesKg.every((p) => (PLATE_OPTIONS.kg as readonly number[]).includes(p))).toBe(true);
    expect(DEFAULT_SETTINGS.platesLb.every((p) => (PLATE_OPTIONS.lb as readonly number[]).includes(p))).toBe(true);
  });
});

describe('onboarding status', () => {
  it('a fresh install is pending; seeding again keeps it', () => {
    const { db, cleanup } = createFreshV2Database();
    try {
      expect(readSettings(db).onboardingStatus).toBe('pending');
      writeSetting(db, 'onboardingStatus', 'done');
      seedDatabase(db);
      expect(readSettings(db).onboardingStatus).toBe('done');
    } finally {
      cleanup();
    }
  });

  it('an upgrade from V1 never sees onboarding', () => {
    const temp = makeTempDir();
    const path = join(temp.dir, DATABASE_NAME);
    const db = createV1Database(path);
    try {
      buildRealisticV1(db);
      migrateDatabase(db, { databasePath: path, fileExists: existsSync, tzOffsetMinutes: zoneOffsetFn('Europe/London') });
      seedDatabase(db);
      expect(readSettings(db).onboardingStatus).toBe('done');
    } finally {
      db.close();
      temp.cleanup();
    }
  });

  it('a device that already ran V2 (starter content seeded earlier) never sees onboarding', () => {
    const { db, cleanup } = createFreshV2Database();
    try {
      // As on a Phase 2–4 install: seeded before Phase 5, so no onboarding key was written.
      db.run("DELETE FROM settings WHERE key = 'onboarding_status'");
      seedDatabase(db);
      expect(readSettings(db).onboardingStatus).toBe('done');
    } finally {
      cleanup();
    }
  });
});

describe('starter plan', () => {
  const names = (db: Parameters<typeof listRoutines>[0]) => listRoutines(db).map((r) => r.name);

  it('keep leaves the starter splits', () => {
    const { db, cleanup } = createFreshV2Database();
    try {
      const before = names(db);
      expect(before.length).toBeGreaterThan(0);
      expect(applyStarterPlan(db, 'keep')).toBe('kept');
      expect(names(db)).toEqual(before);
    } finally {
      cleanup();
    }
  });

  it('a template replaces the starter splits; blank removes them; the library stays', () => {
    const { db, cleanup } = createFreshV2Database();
    try {
      seedLibrary(db); // as at startup
      const exercises = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM exercises')!.n;
      expect(applyStarterPlan(db, 'ppl')).toBe('replaced');
      expect(names(db)).toEqual(['Push', 'Pull', 'Legs']);
      expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM exercises')!.n).toBe(exercises);
    } finally {
      cleanup();
    }
    const blank = createFreshV2Database();
    try {
      expect(applyStarterPlan(blank.db, 'blank')).toBe('replaced');
      expect(names(blank.db)).toEqual([]);
    } finally {
      blank.cleanup();
    }
  });

  it('keeps a routine the user made, and refuses once any workout exists', () => {
    const { db, cleanup } = createFreshV2Database();
    try {
      db.run("INSERT INTO routines (name, position, source, created_at) VALUES ('Mine', 99, 'user', '2026-01-01T00:00:00Z')");
      expect(applyStarterPlan(db, 'upper-lower')).toBe('replaced');
      expect(names(db)).toContain('Mine');

      startWorkout(db, { name: 'Test', routineId: null, draftJson: '{}' }, { now: new Date('2026-02-01T10:00:00Z'), tzOffsetMinutes: 0 });
      const before = names(db);
      expect(applyStarterPlan(db, 'blank')).toBe('refused');
      expect(names(db)).toEqual(before);
    } finally {
      cleanup();
    }
  });
});

describe('queries', () => {
  it('counts completed workouts only', () => {
    const { db, cleanup } = createFreshV2Database();
    try {
      const bench = exerciseIdByName(db, 'Bench Press');
      expect(countCompletedWorkouts(db)).toBe(0);
      logCompletedWorkout(db, { name: 'A', startIso: '2026-02-01T10:00:00Z', endIso: '2026-02-01T11:00:00Z', sets: [{ exerciseId: bench, weight: 60, reps: 5 }] });
      logCompletedWorkout(db, { name: 'B', startIso: '2026-02-02T10:00:00Z', endIso: '2026-02-02T11:00:00Z', sets: [{ exerciseId: bench, weight: 60, reps: 5 }] });
      startWorkout(db, { name: 'Open', routineId: null, draftJson: '{}' }, { now: new Date('2026-02-03T10:00:00Z'), tzOffsetMinutes: 0 });
      expect(countCompletedWorkouts(db)).toBe(2);
    } finally {
      cleanup();
    }
  });

  it('finds bodyweight exercises among the given ids', () => {
    const { db, cleanup } = createFreshV2Database();
    try {
      seedLibrary(db);
      const bench = exerciseIdByName(db, 'Bench Press');
      const bw = db.get<{ id: number }>("SELECT id FROM exercises WHERE LOWER(equipment) = 'bodyweight' LIMIT 1")!.id;
      expect([...bodyweightExerciseIds(db, [bench, bw])]).toEqual([bw]);
      expect(bodyweightExerciseIds(db, []).size).toBe(0);
    } finally {
      cleanup();
    }
  });
});

describe('restore points', () => {
  it('a pre-import copy reads back as a valid backup and restores the data it held', () => {
    const { db, cleanup } = createFreshV2Database();
    const temp = makeTempDir();
    try {
      const bench = exerciseIdByName(db, 'Bench Press');
      logCompletedWorkout(db, { name: 'Before', startIso: '2026-02-01T10:00:00Z', endIso: '2026-02-01T11:00:00Z', sets: [{ exerciseId: bench, weight: 60, reps: 5 }] });
      const copyPath = join(temp.dir, restorePointName(new Date('2026-02-01T12:00:00Z')));
      createVerifiedCopy(db, copyPath);
      logCompletedWorkout(db, { name: 'After', startIso: '2026-02-02T10:00:00Z', endIso: '2026-02-02T11:00:00Z', sets: [{ exerciseId: bench, weight: 70, reps: 5 }] });
      expect(countCompletedWorkouts(db)).toBe(2);

      const snapshot = openNodeDb(copyPath);
      const file = exportDatabase(snapshot, { appVersion: null, now: new Date('2026-02-01T12:00:00Z') });
      snapshot.close();
      const validation = validateBackup(db, file);
      if (!validation.ok) throw new Error(validation.error);
      expect(validation.summary.workouts).toBe(1);
      importBackup(db, validation.backup);
      expect(countCompletedWorkouts(db)).toBe(1);
      expect(db.get<{ name: string }>("SELECT split_name AS name FROM workout_sessions WHERE status = 'completed'")?.name).toBe('Before');
    } finally {
      cleanup();
      temp.cleanup();
    }
  });
});
