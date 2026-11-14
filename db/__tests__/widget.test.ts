/**
 * Widget data on node:sqlite (Phase 7): the week by each workout's own local date,
 * the routine order and archive, the workout in progress (shown as "resume", never
 * counted), and the state a widget tap is decided against.
 */
import { buildWidgetContent } from '../../lib/widgetSnapshot';
import type { NodeDb } from '../testing/nodeSqliteAdapter';
import { createFreshV2Database, exerciseIdByName, logCompletedWorkout } from '../testing/v2Fixture';
import { listRoutines, setRoutineArchived } from '../routines';
import { buildWidgetTimelineFromDb, getWidgetInput, getWidgetLinkState } from '../widget';
import { logSet, startWorkout } from '../workouts';

let db: NodeDb;
let cleanup: () => void;
let bench: number;
let routineIds: number[];

const OPTIONS = { today: '2026-11-14', weekStart: 'monday' as const, unit: 'kg' as const };

beforeEach(() => {
  ({ db, cleanup } = createFreshV2Database());
  bench = exerciseIdByName(db, 'Bench Press');
  routineIds = listRoutines(db).map((r) => r.id);
});

afterEach(() => cleanup());

function routineName(id: number): string {
  return listRoutines(db, true).find((r) => r.id === id)!.name;
}

it('starts empty: no workouts, no streak, the first routine next', () => {
  const content = buildWidgetContent(getWidgetInput(db, OPTIONS));
  expect(routineIds.length).toBeGreaterThan(2);
  expect(content).toMatchObject({ workouts: 0, streak: 0, action: 'start', nextName: routineName(routineIds[0]) });
  expect(content.url).toBe(`buaic://widget?action=start&routine=${routineIds[0]}`);
});

it("counts this week's completed workouts by their local date", () => {
  // Started Sunday 23:15 UTC = Monday 00:15 in UTC+1 (a workout's day is its start day):
  // belongs to the week of 9 Nov.
  logCompletedWorkout(db, {
    name: 'Late',
    routineId: routineIds[0],
    startIso: '2026-11-08T23:15:00Z',
    endIso: '2026-11-08T23:30:00Z',
    tzOffsetMinutes: 60,
    sets: [{ exerciseId: bench, weight: 100, reps: 5 }],
  });
  // Same instant in UTC−5 is still Sunday 8 Nov: last week.
  logCompletedWorkout(db, {
    name: 'Abroad',
    routineId: routineIds[1],
    startIso: '2026-11-08T22:00:00Z',
    endIso: '2026-11-08T23:30:00Z',
    tzOffsetMinutes: -300,
    sets: [
      { exerciseId: bench, weight: 60, reps: 10 },
      { exerciseId: bench, weight: 60, reps: 10 },
    ],
  });
  const content = buildWidgetContent(getWidgetInput(db, OPTIONS));
  expect(content.workouts).toBe(1);
  expect(content.weekDetail).toBe('1 set · 500 kg');
  expect(content.trainedDays).toBe('1000000');
  expect(content.streak).toBe(2);
  // Next after the most recently finished workout (both ended at 23:30 UTC; the later id wins).
  expect(content.nextName).toBe(routineName(routineIds[2]));
});

it('shows the workout in progress as "resume" and never counts it', () => {
  const id = startWorkout(db, { name: 'Push Day 5', routineId: routineIds[0], draftJson: '{}' }, { now: new Date('2026-11-14T09:00:00Z'), tzOffsetMinutes: 60 });
  logSet(db, id, { exerciseId: bench, setNumber: 1, weight: 100, reps: 5, setType: 'working', rpe: null, completedAt: '2026-11-14T09:05:00Z' }, 0);
  const content = buildWidgetContent(getWidgetInput(db, OPTIONS));
  expect(content).toMatchObject({ workouts: 0, action: 'resume', nextName: 'Push Day 5', url: 'buaic://widget?action=resume' });
  expect(getWidgetLinkState(db).hasOpenWorkout).toBe(true);
});

it('skips archived routines and sends to Routines when none are left', () => {
  setRoutineArchived(db, routineIds[0], true, '2026-11-14T10:00:00Z');
  expect(buildWidgetContent(getWidgetInput(db, OPTIONS)).nextName).toBe(routineName(routineIds[1]));
  for (const id of routineIds) setRoutineArchived(db, id, true, '2026-11-14T10:00:00Z');
  expect(buildWidgetContent(getWidgetInput(db, OPTIONS))).toMatchObject({ action: 'routines', url: 'buaic://widget?action=routines' });
  expect(getWidgetLinkState(db)).toEqual({ hasOpenWorkout: false, routineIds: [], lastRoutineId: null });
});

it('gives the tap state: active routine order and the last routine trained', () => {
  logCompletedWorkout(db, {
    name: 'Pull',
    routineId: routineIds[1],
    startIso: '2026-11-13T17:00:00Z',
    endIso: '2026-11-13T18:00:00Z',
    sets: [{ exerciseId: bench, weight: 50, reps: 8 }],
  });
  expect(getWidgetLinkState(db)).toEqual({ hasOpenWorkout: false, routineIds, lastRoutineId: routineIds[1] });
});

it('builds the timeline from the database in the chosen unit', () => {
  logCompletedWorkout(db, {
    name: 'Today',
    startIso: '2026-11-14T08:00:00Z',
    endIso: '2026-11-14T09:00:00Z',
    sets: [{ exerciseId: bench, weight: 100, reps: 5 }],
  });
  const entries = buildWidgetTimelineFromDb(db, { ...OPTIONS, unit: 'lb' });
  expect(entries.map((e) => e.localDate)).toEqual(['2026-11-14', '2026-11-16', '2026-11-23']);
  expect(entries[0].content.weekDetail).toBe('1 set · 1102 lb');
  expect(entries[1].content).toMatchObject({ workouts: 0, streak: 1 });
});
