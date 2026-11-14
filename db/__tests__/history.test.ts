/**
 * History: list, detail, editing and deleting past workouts, and the PR timeline.
 * Edits must keep bests/PRs correct and never touch a workout in progress.
 */
import {
  deleteCompletedSession,
  getSessionDetail,
  listSessions,
  prTimeline,
  saveSessionEdit,
  SessionEditError,
  type SessionEdit,
  sessionDurationSeconds,
} from '../history';
import type { NodeDb } from '../testing/nodeSqliteAdapter';
import { createFreshV2Database, exerciseIdByName, logCompletedWorkout } from '../testing/v2Fixture';
import { getExerciseBests, getInProgressWorkout, logSet, startWorkout } from '../workouts';
import { createActiveWorkoutStore } from '../../features/workout/activeWorkoutStore';

let db: NodeDb;
let cleanup: () => void;
let bench: number;
let squat: number;

beforeEach(() => {
  ({ db, cleanup } = createFreshV2Database());
  bench = exerciseIdByName(db, 'Bench Press');
  squat = exerciseIdByName(db, 'Squat');
});
afterEach(() => cleanup());

const day1 = () =>
  logCompletedWorkout(db, {
    name: 'Push',
    startIso: '2026-11-02T17:00:00Z',
    endIso: '2026-11-02T18:05:00Z',
    sets: [
      { exerciseId: bench, weight: 40, reps: 10, setType: 'warmup' },
      { exerciseId: bench, weight: 100, reps: 5 },
      { exerciseId: squat, weight: 120, reps: 5 },
    ],
  });
const day2 = () =>
  logCompletedWorkout(db, {
    name: 'Push',
    startIso: '2026-11-05T17:00:00Z',
    endIso: '2026-11-05T17:50:00Z',
    sets: [
      { exerciseId: bench, weight: 105, reps: 5 },
      { exerciseId: bench, weight: 100, reps: 8 },
    ],
  });

/** The session as an edit, unchanged. */
function asEdit(sessionId: number): SessionEdit {
  const d = getSessionDetail(db, sessionId)!;
  return {
    name: d.name,
    notes: d.notes ?? '',
    localDate: d.localDate!,
    exercises: d.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      notes: e.notes ?? '',
      sets: e.sets.map((s) => ({ id: s.id, weight: s.weight, reps: s.reps, setType: s.setType, rpe: s.rpe })),
    })),
  };
}

describe('list and detail', () => {
  it('lists completed sessions newest first with volume, sets, names and duration', () => {
    const a = day1();
    const b = day2();
    const list = listSessions(db);
    expect(list.map((s) => s.id)).toEqual([b, a]);
    expect(list[1]).toMatchObject({ setCount: 3, volumeKg: 40 * 10 + 500 + 600, exerciseNames: 'Bench Press, Squat', localDate: '2026-11-02' });
    expect(sessionDurationSeconds(list[1].startedAt, list[1].endedAt)).toBe(65 * 60);
  });

  it('has no duration for V1 sessions (start = end)', () => {
    expect(sessionDurationSeconds('2026-01-01T10:00:00Z', '2026-01-01T10:00:00Z')).toBeNull();
    expect(sessionDurationSeconds(null, '2026-01-01T10:00:00Z')).toBeNull();
  });

  it('filters by routine and by exercise', () => {
    const a = day1();
    const b = day2();
    expect(listSessions(db, { exerciseId: squat }).map((s) => s.id)).toEqual([a]);
    expect(listSessions(db, { exerciseId: bench }).map((s) => s.id)).toEqual([b, a]);
    const routine = db.get<{ id: number }>("SELECT id FROM routines WHERE name = 'Push'")!.id;
    db.run('UPDATE workout_sessions SET routine_id = ? WHERE id = ?', [routine, b]);
    expect(listSessions(db, { routineId: routine }).map((s) => s.id)).toEqual([b]);
  });

  it('never shows a workout in progress', () => {
    day1();
    const open = startWorkout(db, { name: 'Open', routineId: null, draftJson: '{}' }, { now: new Date('2026-11-06T10:00:00Z'), tzOffsetMinutes: 0 });
    logSet(db, open, { exerciseId: bench, setNumber: 1, weight: 200, reps: 1, setType: 'working', rpe: null, completedAt: '2026-11-06T10:01:00Z' }, 0);
    expect(listSessions(db).map((s) => s.id)).not.toContain(open);
    expect(getSessionDetail(db, open)).toBeNull();
    expect(prTimeline(db).some((p) => p.sessionId === open)).toBe(false);
  });

  it('groups sets by exercise in session order', () => {
    const a = day1();
    const d = getSessionDetail(db, a)!;
    expect(d.exercises.map((e) => [e.name, e.sets.length])).toEqual([
      ['Bench Press', 2],
      ['Squat', 1],
    ]);
    expect(d.exercises[0].sets[0]).toMatchObject({ setType: 'warmup', weight: 40, setNumber: 1 });
  });
});

describe('PR timeline', () => {
  it('replays history in order; the first time is never a PR; warm-ups never count', () => {
    day1();
    const b = day2();
    const events = prTimeline(db);
    expect(events.map((e) => [e.sessionId, e.weight, e.reps])).toEqual([
      [b, 105, 5],
      [b, 100, 8],
    ]);
    expect(events[0].prs.map((p) => p.kind)).toEqual(expect.arrayContaining(['weight', 'e1rm']));
    // 100 × 8 after 105 × 5: e1RM 126.7 > 122.5, and the first 8-rep set ever (no 8-rep max yet).
    expect(events[1].prs).toEqual(expect.arrayContaining([{ kind: 'e1rm' }]));
    expect(prTimeline(db, squat)).toEqual([]);
  });
});

describe('editing a past session', () => {
  it('updates weights and reps; bests and PRs follow', () => {
    day1();
    const b = day2();
    expect(getExerciseBests(db, bench).maxWeight).toBe(105);
    const edit = asEdit(b);
    edit.exercises[0].sets[0].weight = 95; // 105 was a typo
    saveSessionEdit(db, b, edit);
    expect(getExerciseBests(db, bench).maxWeight).toBe(100);
    // 95 × 5 isn't a PR any more; 100 × 8 still is (e1RM).
    expect(prTimeline(db).map((e) => [e.weight, e.reps])).toEqual([[100, 8]]);
  });

  it('adds and deletes sets, renumbers, keeps ids of kept sets', () => {
    const a = day1();
    const before = getSessionDetail(db, a)!;
    const edit = asEdit(a);
    edit.exercises[0].sets.splice(0, 1); // delete the warm-up
    edit.exercises[0].sets.push({ weight: 102.5, reps: 3, setType: 'working', rpe: 9 });
    saveSessionEdit(db, a, edit);
    const after = getSessionDetail(db, a)!;
    expect(after.exercises[0].sets.map((s) => [s.setNumber, s.weight, s.reps, s.rpe])).toEqual([
      [1, 100, 5, null],
      [2, 102.5, 3, 9],
    ]);
    expect(after.exercises[0].sets[0].id).toBe(before.exercises[0].sets[1].id);
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM set_logs WHERE session_id = ?', [a])!.n).toBe(3);
  });

  it('removing all sets of an exercise removes it from the session', () => {
    const a = day1();
    const edit = asEdit(a);
    edit.exercises[1].sets = [];
    saveSessionEdit(db, a, edit);
    expect(getSessionDetail(db, a)!.exercises.map((e) => e.name)).toEqual(['Bench Press']);
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM session_exercises WHERE session_id = ?', [a])!.n).toBe(1);
    expect(getExerciseBests(db, squat).maxWeight).toBeNull();
  });

  it('moves the date: local date and times shift by whole days, order follows', () => {
    const a = day1();
    const b = day2();
    const edit = asEdit(b);
    edit.localDate = '2026-10-30';
    saveSessionEdit(db, b, edit);
    const moved = getSessionDetail(db, b)!;
    expect(moved.localDate).toBe('2026-10-30');
    expect(moved.startedAt).toBe('2026-10-30T17:00:00.000Z');
    expect(moved.endedAt).toBe('2026-10-30T17:50:00.000Z');
    expect(moved.dateCompleted).toBe('2026-10-30T17:50:00.000Z');
    expect(listSessions(db).map((s) => s.id)).toEqual([a, b]);
    // b is now first in time: 105 × 5 sets the baseline (no PR), 100 × 8 beats it on e1RM
    // within the same workout, and day 1's 100 × 5 is no longer a PR.
    expect(prTimeline(db).map((e) => [e.sessionId, e.weight, e.reps])).toEqual([[b, 100, 8]]);
  });

  it('saves name and notes', () => {
    const a = day1();
    const edit = asEdit(a);
    edit.name = '  Chest day ';
    edit.notes = 'Felt strong';
    edit.exercises[0].notes = 'Elbows in';
    saveSessionEdit(db, a, edit);
    const d = getSessionDetail(db, a)!;
    expect([d.name, d.notes, d.exercises[0].notes]).toEqual(['Chest day', 'Felt strong', 'Elbows in']);
  });

  it('rejects invalid edits and changes nothing', () => {
    const a = day1();
    const snapshot = JSON.stringify(getSessionDetail(db, a));
    const bad = (mutate: (e: SessionEdit) => void) => {
      const edit = asEdit(a);
      mutate(edit);
      expect(() => saveSessionEdit(db, a, edit)).toThrow(SessionEditError);
      expect(JSON.stringify(getSessionDetail(db, a))).toBe(snapshot);
    };
    bad((e) => (e.exercises[0].sets[0].reps = 0));
    bad((e) => (e.exercises[0].sets[0].weight = -5));
    bad((e) => (e.exercises[0].sets[0].rpe = 11));
    bad((e) => (e.localDate = '2026-02-30'));
    bad((e) => (e.name = ' '));
    bad((e) => e.exercises.forEach((x) => (x.sets = [])));
    bad((e) => (e.exercises[0].sets[0].id = 999_999));
  });

  it('refuses to edit or delete a workout in progress, or to borrow its sets', () => {
    const a = day1();
    const open = startWorkout(db, { name: 'Open', routineId: null, draftJson: '{"x":1}' }, { now: new Date('2026-11-06T10:00:00Z'), tzOffsetMinutes: 0 });
    const openSet = logSet(db, open, { exerciseId: bench, setNumber: 1, weight: 60, reps: 5, setType: 'working', rpe: null, completedAt: '2026-11-06T10:01:00Z' }, 0);
    expect(() => saveSessionEdit(db, open, { ...asEdit(a), exercises: [{ exerciseId: bench, notes: '', sets: [{ weight: 1, reps: 1, setType: 'working', rpe: null }] }] })).toThrow(SessionEditError);
    const steal = asEdit(a);
    steal.exercises[0].sets.push({ id: openSet, weight: 60, reps: 5, setType: 'working', rpe: null });
    expect(() => saveSessionEdit(db, a, steal)).toThrow(SessionEditError);
    expect(deleteCompletedSession(db, open)).toBe(false);
    const still = getInProgressWorkout(db)!;
    expect(still).toMatchObject({ id: open, draftJson: '{"x":1}' });
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM set_logs WHERE session_id = ?', [open])!.n).toBe(1);
  });
});

describe('deleting a past session', () => {
  it('deletes it with its sets; bests follow', () => {
    day1();
    const b = day2();
    expect(deleteCompletedSession(db, b)).toBe(true);
    expect(listSessions(db).length).toBe(1);
    expect(getExerciseBests(db, bench).maxWeight).toBe(100);
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM set_logs WHERE session_id = ?', [b])!.n).toBe(0);
    expect(prTimeline(db)).toEqual([]);
  });
});

describe('a workout in progress after history changes', () => {
  it('reloadHistory refreshes previous and bests without touching the draft', () => {
    day1();
    const b = day2();
    const store = createActiveWorkoutStore({
      getDb: () => db,
      clock: () => ({ now: new Date('2026-11-07T10:00:00Z'), tzOffsetMinutes: 0 }),
      unit: () => 'kg',
      setTimer: () => 1,
      clearTimer: () => {},
      onError: (what, error) => {
        throw new Error(`${what}: ${String(error)}`);
      },
    });
    store.start('Push', null, [{ exerciseId: bench, name: 'Bench Press', variation: 'Barbell', muscle: 'Upper Chest', targetSets: 1, repMin: null, repMax: null, restSeconds: null }]);
    expect(store.getSnapshot().bests[bench].maxWeight).toBe(105);
    const draftBefore = store.getSnapshot().draft;
    deleteCompletedSession(db, b);
    store.reloadHistory();
    expect(store.getSnapshot().bests[bench].maxWeight).toBe(100);
    expect(store.getSnapshot().previous[bench].map((p) => p.weight)).toEqual([40, 100]);
    expect(store.getSnapshot().draft).toBe(draftBefore);
  });
});
