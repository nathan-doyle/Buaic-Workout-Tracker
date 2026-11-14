/**
 * Progress queries on a real (node:sqlite) database.
 */
import { muscleSetCounts } from '../../lib/stats';
import {
  getCalendarDays,
  getCoverageSets,
  getExerciseSetRows,
  getExercisesForMuscle,
  getNextRoutineInputs,
  getRecentPrs,
  getRoutineMuscles,
  getSessionTotals,
} from '../progress';
import { seedLibrary } from '../library';
import type { NodeDb } from '../testing/nodeSqliteAdapter';
import { createFreshV2Database, exerciseIdByName, logCompletedWorkout } from '../testing/v2Fixture';
import { startWorkout, logSet } from '../workouts';

let db: NodeDb;
let cleanup: () => void;
let bench: number;
let squat: number;
let ohp: number;

beforeEach(() => {
  ({ db, cleanup } = createFreshV2Database());
  bench = exerciseIdByName(db, 'Bench Press');
  squat = exerciseIdByName(db, 'Squat');
  ohp = exerciseIdByName(db, 'Overhead Press');
  db.run(`UPDATE exercises SET secondary_muscles = '["Triceps","Front Delts"]' WHERE id = ?`, [bench]);
  logCompletedWorkout(db, {
    name: 'Push',
    startIso: '2026-11-02T17:00:00Z',
    endIso: '2026-11-02T18:00:00Z',
    sets: [
      { exerciseId: bench, weight: 40, reps: 10, setType: 'warmup' },
      { exerciseId: bench, weight: 100, reps: 5 },
      { exerciseId: ohp, weight: 60, reps: 5 },
    ],
  });
  logCompletedWorkout(db, {
    name: 'Legs',
    startIso: '2026-11-10T17:00:00Z',
    endIso: '2026-11-10T18:00:00Z',
    sets: [
      { exerciseId: squat, weight: 120, reps: 5 },
      { exerciseId: squat, weight: 125, reps: 5 },
    ],
  });
  logCompletedWorkout(db, {
    name: 'Push',
    startIso: '2026-11-12T17:00:00Z',
    endIso: '2026-11-12T18:00:00Z',
    sets: [
      { exerciseId: bench, weight: 102.5, reps: 5 },
      { exerciseId: ohp, weight: 62.5, reps: 5 },
    ],
  });
});
afterEach(() => cleanup());

it('session totals by local date', () => {
  expect(getSessionTotals(db).map((s) => [s.localDate, s.setCount, s.volumeKg])).toEqual([
    ['2026-11-02', 3, 400 + 500 + 300],
    ['2026-11-10', 2, 1225],
    ['2026-11-12', 2, 512.5 + 312.5],
  ]);
});

it("an exercise's sets oldest first", () => {
  expect(getExerciseSetRows(db, bench).map((r) => [r.localDate, r.weight, r.setType])).toEqual([
    ['2026-11-02', 40, 'warmup'],
    ['2026-11-02', 100, 'working'],
    ['2026-11-12', 102.5, 'working'],
  ]);
});

it('recent PRs: newest first, one per exercise per session, with a label', () => {
  // Legs: 125 × 5 beats 120 × 5 in the same workout. Push 2: bench and OHP both heavier.
  const prs = getRecentPrs(db, 10);
  expect(prs.map((p) => [p.name, p.weight, p.label])).toEqual([
    ['Overhead Press', 62.5, 'Heaviest'],
    ['Bench Press', 102.5, 'Heaviest'],
    ['Squat', 125, 'Heaviest'],
  ]);
  expect(getRecentPrs(db, 1)).toHaveLength(1);
});

it('coverage sets exclude warm-ups and other days; secondary muscles come along', () => {
  const rows = getCoverageSets(db, '2026-11-08', '2026-11-14');
  expect(rows).toHaveLength(4);
  expect(muscleSetCounts(rows)).toEqual({ Quads: 2, 'Upper Chest': 1, Triceps: 0.5, 'Front Delts': 1.5 });
  expect(getCoverageSets(db, '2026-11-02', '2026-11-02')).toHaveLength(2);
});

it('routine muscles and exercises for a muscle', () => {
  expect(getRoutineMuscles(db).has('Upper Chest')).toBe(true);
  seedLibrary(db, new Date('2026-01-01T00:00:00Z'));
  const triceps = getExercisesForMuscle(db, 'Triceps');
  expect(triceps.length).toBeGreaterThan(3);
  const firstSecondary = triceps.findIndex((e) => !e.primary);
  expect(triceps.slice(0, firstSecondary).every((e) => e.primary)).toBe(true);
  expect(triceps.find((e) => e.id === bench)).toMatchObject({ primary: false });
});

it('calendar days: sessions and PR marks, Big 3 flagged', () => {
  const days = getCalendarDays(db);
  expect(Object.keys(days).sort()).toEqual(['2026-11-02', '2026-11-10', '2026-11-12']);
  expect(days['2026-11-02']).toMatchObject({ hasPr: false, hasBig3Pr: false });
  expect(days['2026-11-10']).toMatchObject({ hasPr: true, hasBig3Pr: true }); // squat
  expect(days['2026-11-12'].sessions[0]).toMatchObject({ name: 'Push', setCount: 2 });
});

it('calendar ignores a workout in progress', () => {
  const open = startWorkout(db, { name: 'Open', routineId: null, draftJson: '{}' }, { now: new Date('2026-11-13T10:00:00Z'), tzOffsetMinutes: 0 });
  logSet(db, open, { exerciseId: bench, setNumber: 1, weight: 200, reps: 1, setType: 'working', rpe: null, completedAt: '2026-11-13T10:01:00Z' }, 0);
  expect(getCalendarDays(db)['2026-11-13']).toBeUndefined();
});

it('next routine inputs: active routines in order and the last trained routine', () => {
  const push = db.get<{ id: number }>("SELECT id FROM routines WHERE name = 'Push'")!.id;
  expect(getNextRoutineInputs(db).lastRoutineId).toBeNull();
  db.run("UPDATE workout_sessions SET routine_id = ? WHERE split_name = 'Push'", [push]);
  const inputs = getNextRoutineInputs(db);
  expect(inputs.lastRoutineId).toBe(push);
  expect(inputs.routineIds[0]).toBe(push);
});

it('top sets: on equal weight the set with more reps wins', () => {
  const { getTopSets } = jest.requireActual('../queries') as typeof import('../queries');
  logCompletedWorkout(db, {
    name: 'Push',
    startIso: '2026-11-13T17:00:00Z',
    endIso: '2026-11-13T18:00:00Z',
    sets: [
      { exerciseId: ohp, weight: 62.5, reps: 8 },
      { exerciseId: ohp, weight: 62.5, reps: 6 },
    ],
  });
  expect(getTopSets(db).find((t) => t.exercise_id === ohp)).toMatchObject({ weight: 62.5, reps: 8, date: '2026-11-13' });
});
