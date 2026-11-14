/**
 * The V1 screens' queries on the migrated V2 schema.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { migrateDatabase } from '../migrate';
import * as Q from '../queries';
import { DATABASE_NAME } from '../schema';
import { seedDatabase } from '../seed';
import { ALL_MUSCLE_GROUPS } from '../v1Constants';
import type { NodeDb } from '../testing/nodeSqliteAdapter';
import { buildRealisticV1, createV1Database, makeTempDir, zoneOffsetFn } from '../testing/v1Fixture';

const london = zoneOffsetFn('Europe/London');
let temp: ReturnType<typeof makeTempDir>;
let db: NodeDb;

beforeEach(() => {
  temp = makeTempDir();
  const path = join(temp.dir, DATABASE_NAME);
  db = createV1Database(path);
  buildRealisticV1(db);
  migrateDatabase(db, {
    databasePath: path,
    fileExists: existsSync,
    tzOffsetMinutes: london,
    now: () => new Date('2026-11-14T12:00:00Z'),
  });
  seedDatabase(db);
});
afterEach(() => {
  db.close();
  temp.cleanup();
});

const names = (rows: { name: string }[]) => rows.map((r) => r.name);
const clock = (iso: string) => ({ now: new Date(iso), tzOffsetMinutes: london(new Date(iso)) });

describe('splits and exercises', () => {
  it('lists a split in V1 order with canonical ids shared across splits', () => {
    const push = Q.getExercisesBySplit(db, 'Push');
    expect(names(push)).toEqual([
      'Overhead Press',
      'Lateral Raise',
      'Shrug',
      'Bench Press',
      'Incline Dumbbell Press',
    ]);
    const upper = Q.getExercisesBySplit(db, 'Upper');
    const benchPush = push.find((e) => e.name === 'Bench Press')!;
    expect(upper.find((e) => e.name === 'Bench Press')!.id).toBe(benchPush.id);
    expect(benchPush).toMatchObject({ variation: 'Barbell', target_muscle: 'Upper Chest', split_category: 'Push' });
    expect(Q.getExercisesBySplit(db, 'No Such Split')).toEqual([]);
  });

  it('adds a new exercise to every mapped split where V1 would show it, once', () => {
    const now = new Date('2026-11-14T13:00:00Z');
    Q.addUniversalExercise(db, 'Cable Crunch', 'Cable', 'Abs', now);
    Q.addUniversalExercise(db, 'cable crunch', 'CABLE', 'Abs', now); // same identity: no duplicate
    for (const split of ['Push', 'Anterior', 'Upper', 'Full Body']) {
      const list = Q.getExercisesBySplit(db, split);
      expect(list.filter((e) => e.name === 'Cable Crunch')).toHaveLength(1);
      // V1 order: by muscle, then name. "Abs" sorts first.
      expect(list[0].name).toBe('Cable Crunch');
    }
    expect(Q.getExercisesBySplit(db, 'Legs').some((e) => e.name === 'Cable Crunch')).toBe(false);
  });

  it('creates a missing split routine when an exercise maps to it', () => {
    db.run("DELETE FROM routine_exercises WHERE routine_id = (SELECT id FROM routines WHERE name = 'Legs')");
    db.run("DELETE FROM routines WHERE name = 'Legs'");
    Q.addUniversalExercise(db, 'Calf Raise', 'Machine', 'Calves', new Date());
    expect(names(Q.getExercisesBySplit(db, 'Legs'))).toEqual(['Calf Raise']);
    expect(db.get("SELECT source, position FROM routines WHERE name = 'Legs'")).toEqual({ source: 'user', position: 2 });
  });

  it('removing an exercise takes it out of every split but keeps its history', () => {
    const bench = Q.getExercisesBySplit(db, 'Push').find((e) => e.name === 'Bench Press')!;
    const setsBefore = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM set_logs WHERE exercise_id = ?', [bench.id])!.n;
    Q.removeExercise(db, bench.id, new Date('2026-11-14T13:00:00Z'));

    for (const split of ['Push', 'Upper', 'Full Body', 'Anterior']) {
      expect(Q.getExercisesBySplit(db, split).some((e) => e.id === bench.id)).toBe(false);
    }
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM set_logs WHERE exercise_id = ?', [bench.id])!.n).toBe(setsBefore);
    expect(Q.getWorkoutHistory(db).some((s) => s.sets.some((x) => x.exercise_name === 'Bench Press'))).toBe(true);

    // Adding it again brings back the same exercise (and its history).
    const id = Q.addUniversalExercise(db, 'Bench Press', 'Barbell', 'Upper Chest', new Date());
    expect(id).toBe(bench.id);
    expect(Q.getExercisesBySplit(db, 'Push').some((e) => e.id === bench.id)).toBe(true);
  });
});

describe('sessions', () => {
  it('saves a workout in one transaction with local date, routine, order and exact kg', () => {
    const push = Q.getExercisesBySplit(db, 'Push');
    const ohp = push[0];
    const bench = push.find((e) => e.name === 'Bench Press')!;
    const id = Q.saveWorkoutSession(
      db,
      'Push',
      'Session Logged',
      [
        { exerciseId: ohp.id, setNumber: 1, weight: 135 * 0.45359237, reps: 5 },
        { exerciseId: bench.id, setNumber: 1, weight: 100, reps: 5 },
        { exerciseId: ohp.id, setNumber: 2, weight: 60, reps: 5 },
      ],
      clock('2026-07-20T23:30:00.000Z')
    );
    const session = db.get<Record<string, unknown>>('SELECT * FROM workout_sessions WHERE id = ?', [id])!;
    expect(session).toMatchObject({
      split_name: 'Push',
      status: 'completed',
      local_date: '2026-07-21',
      tz_offset_minutes: 60,
      date_completed: '2026-07-20T23:30:00.000Z',
      notes: 'Session Logged',
    });
    expect(session.routine_id).toBe(db.get<{ id: number }>("SELECT id FROM routines WHERE name = 'Push'")!.id);
    expect(db.all('SELECT exercise_id, position FROM session_exercises WHERE session_id = ? ORDER BY position', [id])).toEqual([
      { exercise_id: ohp.id, position: 0 },
      { exercise_id: bench.id, position: 1 },
    ]);
    expect(db.get<{ weight: number }>('SELECT weight FROM set_logs WHERE session_id = ? ORDER BY id LIMIT 1', [id])!.weight).toBe(
      61.23496995
    );
  });

  it('writes nothing if any set fails', () => {
    const count = () => db.get<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions')!.n;
    const before = count();
    expect(() =>
      Q.saveWorkoutSession(db, 'Push', '', [{ exerciseId: 999_999, setNumber: 1, weight: 1, reps: 1 }], clock('2026-07-20T10:00:00Z'))
    ).toThrow(/FOREIGN KEY/);
    expect(count()).toBe(before);
  });

  it('finds last time across splits now that exercises are shared', () => {
    const bench = Q.getExercisesBySplit(db, 'Push').find((e) => e.name === 'Bench Press')!;
    // Most recent bench session is the Full Body one (100 × 5), logged from another split.
    expect(Q.getLastExercisePerformance(db, bench.id)).toEqual({ set_number: 1, weight: 100, reps: 5 });
    const hammer = Q.getExercisesBySplit(db, 'Upper').find((e) => e.name === 'Hammer Curl')!;
    expect(Q.getLastExercisePerformance(db, hammer.id)).toBeNull();
  });

  it('deleting a session removes its sets and exercise rows, not the exercises', () => {
    const history = Q.getWorkoutHistory(db);
    const id = history[0].session_id;
    Q.deleteWorkoutSession(db, id);
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM set_logs WHERE session_id = ?', [id])!.n).toBe(0);
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM session_exercises WHERE session_id = ?', [id])!.n).toBe(0);
    expect(Q.getWorkoutHistory(db)).toHaveLength(history.length - 1);
  });
});

describe('read screens', () => {
  it('History: newest first, local dates, V1 totals, sets in session order', () => {
    const history = Q.getWorkoutHistory(db);
    expect(history.map((s) => s.local_date)).toEqual([
      '2026-11-14',
      '2026-07-15',
      '2026-07-15',
      '2026-05-01',
      '2026-04-02',
      '2026-03-29',
      '2026-03-28',
    ]);
    const push = history[history.length - 1];
    expect(push).toMatchObject({ split_name: 'Push', total_sets: 6 });
    expect(push.total_volume).toBeCloseTo(61 * 10 + 102 * 5 + 102 * 4 + 42.5 * 8 + 10 * 15 + 100 * 12, 9);
    expect(push.sets.map((s) => s.exercise_name)).toEqual([
      'Overhead Press',
      'Lateral Raise',
      'Shrug',
      'Bench Press',
      'Bench Press',
      'Bench Press',
    ]);
    const emptied = history.find((s) => s.split_name === 'Anterior')!;
    expect(emptied).toMatchObject({ total_sets: 0, total_volume: null, sets: [] });
  });

  it('Top Sets: heaviest set per exercise with the split and local date it was logged on', () => {
    const top = Q.getTopSets(db);
    expect(top.find((t) => t.name === 'Bench Press')).toMatchObject({
      weight: 102,
      reps: 5,
      split_category: 'Push',
      date: '2026-03-28',
    });
    expect(top.some((t) => t.name === 'Pull Up')).toBe(false); // bodyweight (0 kg), as V1
    expect(top[0].name).toBe('Leg Press'); // 210 kg, merged from the NULL/'' duplicates
  });

  it('Coverage: last 7 local days including today', () => {
    // Legs on 2026-07-15 (local) is inside the window of 2026-07-21 and outside 2026-07-22.
    expect(Q.getMuscleCoverage(db, ALL_MUSCLE_GROUPS, '2026-07-21').Hamstrings).toEqual({
      status: 'gold',
      hasExercise: true,
      setsThisWeek: 1,
    });
    expect(Q.getMuscleCoverage(db, ALL_MUSCLE_GROUPS, '2026-07-22').Hamstrings.status).toBe('grey');
    // Merged Shrug counts for its primary muscle.
    expect(Q.getMuscleCoverage(db, ALL_MUSCLE_GROUPS, '2026-03-29')['Upper Back'].setsThisWeek).toBe(2);
    // No active exercise for Calves.
    expect(Q.getMuscleCoverage(db, ALL_MUSCLE_GROUPS, '2026-03-29').Calves.status).toBe('red');
  });

  it('Calendar: keyed by local date; Big 3 marks per exercise', () => {
    const calendar = Q.getCalendarActivity(db);
    expect(Object.keys(calendar).sort()).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-04-02',
      '2026-05-01',
      '2026-07-15',
      '2026-11-14',
    ]);
    // 2026-07-15 local holds the heaviest squat (125) and bench (102 is on 03-28; 100 isn't max) and deadlift 160.
    expect(calendar['2026-07-15']).toEqual({ hasWorkout: true, hasPR: true });
    expect(calendar['2026-03-28']).toEqual({ hasWorkout: true, hasPR: true }); // bench 102
    expect(calendar['2026-04-02']).toEqual({ hasWorkout: true, hasPR: false });
  });
});
