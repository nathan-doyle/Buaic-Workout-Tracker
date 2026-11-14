/**
 * The home-screen widget's data (Phase 7): the same queries as Progress →
 * Overview (completed sessions, active routines in order, the last routine
 * trained) plus the workout in progress. The content itself is built by
 * `lib/widgetSnapshot.ts`.
 */
import type { WeekStart } from '../lib/dates';
import type { WeightUnit } from '../lib/units';
import { buildWidgetTimeline, type WidgetContent, type WidgetInput, type WidgetLinkState } from '../lib/widgetSnapshot';
import type { DbAdapter } from './adapter';
import { getNextRoutineInputs, getSessionTotals } from './progress';
import { listRoutines } from './routines';
import { getInProgressWorkout } from './workouts';

export interface WidgetOptions {
  today: string;
  weekStart: WeekStart;
  unit: WeightUnit;
}

export function getWidgetInput(db: DbAdapter, options: WidgetOptions): WidgetInput {
  const open = getInProgressWorkout(db);
  return {
    ...options,
    sessions: getSessionTotals(db),
    routines: listRoutines(db).map((r) => ({ id: r.id, name: r.name, exerciseCount: r.exerciseCount })),
    lastRoutineId: getNextRoutineInputs(db).lastRoutineId,
    openWorkout: open ? { name: open.name } : null,
  };
}

/** Today's widget content plus the next two week starts (see `buildWidgetTimeline`). */
export function buildWidgetTimelineFromDb(db: DbAdapter, options: WidgetOptions): { localDate: string; content: WidgetContent }[] {
  return buildWidgetTimeline(getWidgetInput(db, options));
}

/** What a widget tap is decided against (`planWidgetLink`). */
export function getWidgetLinkState(db: DbAdapter): WidgetLinkState {
  const { routineIds, lastRoutineId } = getNextRoutineInputs(db);
  return { hasOpenWorkout: getInProgressWorkout(db) !== null, routineIds, lastRoutineId };
}
