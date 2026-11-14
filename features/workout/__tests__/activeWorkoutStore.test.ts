/**
 * The active workout store on a real (node:sqlite) database: crash safety, PRs,
 * finish and discard.
 */
import { createFreshV2Database, exerciseIdByName, manualClock } from '../../../db/testing/v2Fixture';
import type { NodeDb } from '../../../db/testing/nodeSqliteAdapter';
import { getWorkoutHistory } from '../../../db/queries';
import type { WeightUnit } from '../../../lib/units';
import { createActiveWorkoutStore, type ExerciseTemplate } from '../activeWorkoutStore';

let db: NodeDb;
let cleanup: () => void;
let unit: WeightUnit;
let time: ReturnType<typeof manualClock>;
let timers: (() => void)[];

const makeStore = () =>
  createActiveWorkoutStore({
    getDb: () => db,
    clock: () => time.clock(),
    unit: () => unit,
    setTimer: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimer: () => {},
    onError: (what, error) => {
      throw new Error(`${what}: ${String(error)}`);
    },
  });

const template = (name: string, extra: Partial<ExerciseTemplate> = {}): ExerciseTemplate => ({
  exerciseId: exerciseIdByName(db, name),
  name,
  variation: '',
  muscle: 'Upper Chest',
  targetSets: 2,
  repMin: 6,
  repMax: 8,
  restSeconds: 120,
  ...extra,
});

const count = (sql: string) => db.get<{ n: number }>(sql)!.n;

beforeEach(() => {
  ({ db, cleanup } = createFreshV2Database());
  unit = 'kg';
  time = manualClock('2026-11-14T22:30:00Z');
  timers = [];
});
afterEach(() => cleanup());

/** Logs a finished bench workout with the given sets (weight kg, reps). */
function logBench(sets: [number, number][]) {
  const store = makeStore();
  store.start('Push', null, [template('Bench Press', { targetSets: sets.length })]);
  const ex = store.getSnapshot().draft!.exercises[0];
  sets.forEach(([w, r], i) => {
    store.updateSet(ex.exerciseId, ex.sets[i].key, { weightText: String(w), reps: String(r) });
    expect(store.toggleDone(ex.exerciseId, ex.sets[i].key).ok).toBe(true);
  });
  expect(store.finish().ok).toBe(true);
  time.advance(86400);
}

describe('active workout', () => {
  it('starts as an in-progress session that statistics ignore', () => {
    const store = makeStore();
    expect(store.start('Push', null, [template('Bench Press')])).toBe(true);
    const row = db.get<{ status: string; local_date: string; draft_json: string }>(
      'SELECT status, local_date, draft_json FROM workout_sessions'
    )!;
    expect(row.status).toBe('in_progress');
    expect(row.local_date).toBe('2026-11-14'); // 23:30 at UTC+1
    expect(JSON.parse(row.draft_json).exercises).toHaveLength(1);
    expect(getWorkoutHistory(db)).toHaveLength(0);
    // Only one workout at a time.
    expect(store.start('Pull', null, [])).toBe(false);
  });

  it('writes a ticked set at once and survives a crash with typed input', () => {
    const store = makeStore();
    store.start('Push', null, [template('Bench Press'), template('Overhead Press')]);
    const [bench, ohp] = store.getSnapshot().draft!.exercises;

    store.updateSet(bench.exerciseId, bench.sets[0].key, { weightText: '100', reps: '5' });
    const tick = store.toggleDone(bench.exerciseId, bench.sets[0].key);
    expect(tick).toEqual({ ok: true, done: true, prLabel: null, restSeconds: 120 });
    expect(count('SELECT COUNT(*) AS n FROM set_logs')).toBe(1);

    // Typed but not ticked: saved by the debounced save (or flush on backgrounding).
    store.updateSet(ohp.exerciseId, ohp.sets[1].key, { weightText: '52.5', reps: '7' });
    timers.forEach((fn) => fn());

    // "Crash": a new store over the same database.
    const revived = makeStore();
    expect(revived.resume()).toBe(true);
    const draft = revived.getSnapshot().draft!;
    expect(draft.exercises.map((e) => e.name)).toEqual(['Bench Press', 'Overhead Press']);
    expect(draft.exercises[0].sets[0]).toMatchObject({ done: true, reps: '5' });
    expect(draft.exercises[1].sets[1].weight.text).toBe('52.5');
    expect(draft.exercises[1].sets[1].reps).toBe('7');

    // Finish keeps only ticked sets; the session becomes a normal completed workout.
    time.advance(3600);
    const result = revived.finish();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toMatchObject({ totalSets: 1, totalVolume: 500, durationSeconds: 3600, newPRCount: 0 });
    }
    const history = getWorkoutHistory(db);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ split_name: 'Push', total_sets: 1, local_date: '2026-11-14' });
    expect(db.get('SELECT draft_json FROM workout_sessions')).toEqual({ draft_json: null });
    expect(revived.getSnapshot().session).toBeNull();
  });

  it('blocks finishing with no completed sets, and validates input before ticking', () => {
    const store = makeStore();
    store.start('Push', null, [template('Bench Press', { repMin: null })]);
    const ex = store.getSnapshot().draft!.exercises[0];
    expect(store.toggleDone(ex.exerciseId, ex.sets[0].key)).toMatchObject({ ok: false });
    store.updateSet(ex.exerciseId, ex.sets[0].key, { weightText: 'abc', reps: '5' });
    expect(store.toggleDone(ex.exerciseId, ex.sets[0].key)).toMatchObject({ ok: false });
    expect(store.finish()).toMatchObject({ ok: false });
    expect(count(`SELECT COUNT(*) AS n FROM workout_sessions WHERE status = 'in_progress'`)).toBe(1);
  });

  it('logs a blank weight as bodyweight (0)', () => {
    const store = makeStore();
    store.start('Quick', null, [template('Bench Press', { repMin: 12 })]);
    const ex = store.getSnapshot().draft!.exercises[0];
    expect(store.toggleDone(ex.exerciseId, ex.sets[0].key).ok).toBe(true);
    expect(db.get('SELECT weight, reps FROM set_logs')).toEqual({ weight: 0, reps: 12 });
  });

  it('unticks, deletes with undo, and edits a ticked set in the database', () => {
    const store = makeStore();
    store.start('Push', null, [template('Bench Press', { targetSets: 3 })]);
    const ex = store.getSnapshot().draft!.exercises[0];
    for (const s of ex.sets) {
      store.updateSet(ex.exerciseId, s.key, { weightText: '80', reps: '8' });
      store.toggleDone(ex.exerciseId, s.key);
    }
    expect(count('SELECT COUNT(*) AS n FROM set_logs')).toBe(3);
    store.toggleDone(ex.exerciseId, ex.sets[0].key);
    expect(count('SELECT COUNT(*) AS n FROM set_logs')).toBe(2);
    store.removeSet(ex.exerciseId, ex.sets[1].key);
    expect(count('SELECT COUNT(*) AS n FROM set_logs')).toBe(1);
    expect(store.getSnapshot().draft!.exercises[0].sets).toHaveLength(2);
    expect(store.undoRemoveSet()).toBe(true);
    expect(store.getSnapshot().draft!.exercises[0].sets.map((s) => s.key)).toEqual(ex.sets.map((s) => s.key));

    store.updateSet(ex.exerciseId, ex.sets[2].key, { weightText: '82.5' });
    expect(db.get('SELECT weight FROM set_logs')).toEqual({ weight: 82.5 });
  });

  it('discards the workout and its sets', () => {
    const store = makeStore();
    store.start('Push', null, [template('Bench Press')]);
    const ex = store.getSnapshot().draft!.exercises[0];
    store.updateSet(ex.exerciseId, ex.sets[0].key, { weightText: '60', reps: '5' });
    store.toggleDone(ex.exerciseId, ex.sets[0].key);
    expect(store.discard()).toBe(true);
    expect(count('SELECT COUNT(*) AS n FROM workout_sessions')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM set_logs')).toBe(0);
    expect(makeStore().resume()).toBe(false);
  });

  it('prefills from last time and flags real PRs only', () => {
    logBench([
      [100, 5],
      [90, 8],
    ]);
    const store = makeStore();
    store.start('Push', null, [template('Bench Press', { targetSets: 3 })]);
    const ex = store.getSnapshot().draft!.exercises[0];
    expect(ex.sets.map((s) => `${s.weight.text}×${s.reps}`)).toEqual(['100×5', '90×8', '90×8']);
    expect(store.getSnapshot().previous[ex.exerciseId].map((p) => p.reps)).toEqual([5, 8]);

    // Same as last time: no PR.
    expect(store.toggleDone(ex.exerciseId, ex.sets[0].key)).toMatchObject({ prLabel: null });
    // 92.5 × 8 beats the 8-rep max and e1RM.
    store.updateSet(ex.exerciseId, ex.sets[1].key, { weightText: '92.5' });
    expect(store.toggleDone(ex.exerciseId, ex.sets[1].key)).toMatchObject({ prLabel: 'Best e1RM' });
    // Same again in the same workout: not a second PR.
    store.updateSet(ex.exerciseId, ex.sets[2].key, { weightText: '92.5' });
    expect(store.toggleDone(ex.exerciseId, ex.sets[2].key)).toMatchObject({ prLabel: null });

    const result = store.finish();
    expect(result.ok && result.summary.prs).toEqual([
      { name: 'Bench Press', variation: '', weight: 92.5, reps: 8, label: 'Best e1RM' },
    ]);
    expect(result.ok && result.summary.newPRCount).toBe(1);
  });

  it('keeps typed lb values exact across a unit change and resume', () => {
    unit = 'lb';
    const store = makeStore();
    store.start('Push', null, [template('Bench Press')]);
    const ex = store.getSnapshot().draft!.exercises[0];
    store.updateSet(ex.exerciseId, ex.sets[0].key, { weightText: '135', reps: '5' });
    store.toggleDone(ex.exerciseId, ex.sets[0].key);
    expect(db.get<{ weight: number }>('SELECT weight FROM set_logs')!.weight).toBeCloseTo(61.23497, 5);

    unit = 'kg';
    store.setUnit('kg');
    const revived = makeStore();
    revived.resume();
    expect(revived.getSnapshot().draft!.unit).toBe('kg');
    expect(revived.getSnapshot().draft!.exercises[0].sets[0].weight.text).toBe('61.25');
    revived.finish();
    expect(db.get<{ weight: number }>('SELECT weight FROM set_logs')!.weight).toBeCloseTo(61.23497, 5);
  });

  it('adds, swaps, reorders and removes exercises mid-workout', () => {
    const store = makeStore();
    store.start('Quick', null, [template('Bench Press')]);
    store.addExercises([template('Squat'), template('Bench Press')]);
    let names = store.getSnapshot().draft!.exercises.map((e) => e.name);
    expect(names).toEqual(['Bench Press', 'Squat']);
    store.moveExercise(1, 0);
    store.swapExercise(exerciseIdByName(db, 'Bench Press'), template('Deadlift'));
    names = store.getSnapshot().draft!.exercises.map((e) => e.name);
    expect(names).toEqual(['Squat', 'Deadlift']);
    store.removeExercise(exerciseIdByName(db, 'Squat'));
    expect(store.getSnapshot().draft!.exercises.map((e) => e.name)).toEqual(['Deadlift']);
    const saved = JSON.parse(db.get<{ d: string }>('SELECT draft_json AS d FROM workout_sessions')!.d);
    expect(saved.exercises.map((e: { name: string }) => e.name)).toEqual(['Deadlift']);
  });

  it('saves exercise order and notes on finish', () => {
    const store = makeStore();
    store.start('Push', null, [template('Bench Press'), template('Overhead Press')]);
    const [bench, ohp] = store.getSnapshot().draft!.exercises;
    for (const ex of [bench, ohp]) {
      store.updateSet(ex.exerciseId, ex.sets[0].key, { weightText: '50', reps: '5' });
      store.toggleDone(ex.exerciseId, ex.sets[0].key);
    }
    store.moveExercise(1, 0);
    store.setNotes(bench.exerciseId, ' Pause reps ');
    store.finish();
    expect(db.all('SELECT exercise_id, position, notes FROM session_exercises ORDER BY position')).toEqual([
      { exercise_id: ohp.exerciseId, position: 0, notes: null },
      { exercise_id: bench.exerciseId, position: 1, notes: 'Pause reps' },
    ]);
  });
});
