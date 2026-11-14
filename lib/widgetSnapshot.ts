/**
 * The home-screen widget's content (Phase 7): this week's workouts, the weekly
 * streak and the next routine, as flat text the widget layout only has to place.
 * Pure. The app builds the input from the database (`db/widget.ts`) and pushes the
 * result whenever data changes (`features/widgets`); the widget never reads the
 * database itself.
 *
 * Every date is a local `YYYY-MM-DD` string and the week follows Settings' week
 * start, exactly as Progress → Overview counts it.
 */
import { addDays, startOfWeek, type WeekStart } from './dates';
import { nextRoutineId, type SessionTotal, totalsBetween, weeklyStreak } from './stats';
import { formatVolume, type WeightUnit } from './units';

export interface WidgetRoutine {
  id: number;
  name: string;
  exerciseCount: number;
}

export interface WidgetInput {
  /** Local date the snapshot is for. */
  today: string;
  weekStart: WeekStart;
  unit: WeightUnit;
  /** Completed workouts (any order). */
  sessions: readonly SessionTotal[];
  /** Active routines in their order. */
  routines: readonly WidgetRoutine[];
  /** Routine of the last completed workout that had one. */
  lastRoutineId: number | null;
  /** The workout in progress, if any. */
  openWorkout: { name: string } | null;
}

export type WidgetAction = 'start' | 'resume' | 'routines';

/** What a tap on the widget asks the app to do (`buaic://widget?…`). */
export interface WidgetLink {
  action: WidgetAction;
  routineId: number | null;
}

/** Flat strings and numbers only: the widget runtime gets them as JSON. */
export interface WidgetContent {
  /** "THIS WEEK · 10–16 NOV" */
  weekLabel: string;
  /** Completed workouts this week (start of week to today). */
  workouts: number;
  /** "workout" / "workouts", next to the big number. */
  workoutsUnit: string;
  /** "4 sets · 1960 kg" (volume as History shows it), or "No workouts yet" for an empty week. */
  weekDetail: string;
  /** One letter per day of the week in week order, e.g. "MTWTFSS". */
  dayLetters: string;
  /** "1" for a day with a completed workout, "0" otherwise, same order. */
  trainedDays: string;
  streak: number;
  /** "3-week streak", "No streak yet". */
  streakLabel: string;
  action: WidgetAction;
  /** "NEXT", "IN PROGRESS", "NO ROUTINES" */
  nextLabel: string;
  /** Routine or workout name, or "Create a routine". */
  nextName: string;
  /** "5 exercises", "Tap to resume", "Tap to set one up" */
  nextDetail: string;
  /** "START", "RESUME", "OPEN" */
  actionLabel: string;
  /** Deep link opened by a tap. */
  url: string;
  /** One sentence for screen readers. */
  accessibilityLabel: string;
  /** The local date this content was built for. */
  asOf: string;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function dayMonth(localDate: string): { day: number; month: string } {
  const [, m, d] = localDate.split('-').map(Number);
  return { day: d, month: MONTHS[m - 1] };
}

/** "10–16 NOV", or "27 OCT – 2 NOV" when the week spans two months. */
export function weekRangeLabel(weekFirstDay: string): string {
  const a = dayMonth(weekFirstDay);
  const b = dayMonth(addDays(weekFirstDay, 6));
  return a.month === b.month ? `${a.day}–${b.day} ${b.month}` : `${a.day} ${a.month} – ${b.day} ${b.month}`;
}

export function dayLetters(weekStart: WeekStart): string {
  return weekStart === 'sunday' ? 'SMTWTFS' : 'MTWTFSS';
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** `buaic://widget?action=start&routine=12` (the app's own scheme; route `app/widget.tsx`). */
export function widgetUrl(link: WidgetLink): string {
  const routine = link.action === 'start' && link.routineId !== null ? `&routine=${link.routineId}` : '';
  return `buaic://widget?action=${link.action}${routine}`;
}

export function buildWidgetContent(input: WidgetInput): WidgetContent {
  const { today, weekStart, unit } = input;
  const first = startOfWeek(today, weekStart);
  const week = totalsBetween(input.sessions, first, today);

  const trained = new Set(input.sessions.filter((s) => s.localDate >= first && s.localDate <= today).map((s) => s.localDate));
  let trainedDays = '';
  for (let i = 0; i < 7; i += 1) trainedDays += trained.has(addDays(first, i)) ? '1' : '0';

  const streak = weeklyStreak(
    input.sessions.map((s) => s.localDate),
    today,
    weekStart
  );
  const streakLabel = streak === 0 ? 'No streak yet' : `${streak}-week streak`;

  const weekDetail =
    week.workouts === 0
      ? 'No workouts yet'
      : `${week.sets} ${plural(week.sets, 'set', 'sets')} · ${formatVolume(week.volumeKg, unit)} ${unit}`;

  let link: WidgetLink;
  let nextLabel: string;
  let nextName: string;
  let nextDetail: string;
  let actionLabel: string;
  if (input.openWorkout) {
    link = { action: 'resume', routineId: null };
    nextLabel = 'IN PROGRESS';
    nextName = input.openWorkout.name;
    nextDetail = 'Tap to resume';
    actionLabel = 'RESUME';
  } else {
    const id = nextRoutineId(
      input.routines.map((r) => r.id),
      input.lastRoutineId
    );
    const routine = id === null ? undefined : input.routines.find((r) => r.id === id);
    if (routine) {
      link = { action: 'start', routineId: routine.id };
      nextLabel = 'NEXT';
      nextName = routine.name;
      nextDetail = `${routine.exerciseCount} ${plural(routine.exerciseCount, 'exercise', 'exercises')}`;
      actionLabel = 'START';
    } else {
      link = { action: 'routines', routineId: null };
      nextLabel = 'NO ROUTINES';
      nextName = 'Create a routine';
      nextDetail = 'Tap to set one up';
      actionLabel = 'OPEN';
    }
  }

  const weekSentence =
    week.workouts === 0
      ? 'No workouts yet this week'
      : `${week.workouts} ${plural(week.workouts, 'workout', 'workouts')} this week, ${weekDetail}`;
  const actionSentence =
    link.action === 'resume'
      ? `Workout in progress: ${nextName}. Double-tap to resume.`
      : link.action === 'start'
        ? `Next workout: ${nextName}. Double-tap to start it.`
        : 'No routines yet. Double-tap to create one.';

  return {
    weekLabel: `THIS WEEK · ${weekRangeLabel(first)}`,
    workouts: week.workouts,
    workoutsUnit: plural(week.workouts, 'workout', 'workouts'),
    weekDetail,
    dayLetters: dayLetters(weekStart),
    trainedDays,
    streak,
    streakLabel,
    action: link.action,
    nextLabel,
    nextName,
    nextDetail,
    actionLabel,
    url: widgetUrl(link),
    accessibilityLabel: `Buaic. ${weekSentence}. ${streakLabel}. ${actionSentence}`,
    asOf: today,
  };
}

/**
 * Content for today plus the starts of the next two weeks (iOS widget timelines can
 * switch at those dates on their own: the week resets to zero, the streak is
 * re-counted). Android shows only the first entry until the app pushes again.
 */
export function buildWidgetTimeline(input: WidgetInput): { localDate: string; content: WidgetContent }[] {
  const nextWeek = addDays(startOfWeek(input.today, input.weekStart), 7);
  return [input.today, nextWeek, addDays(nextWeek, 7)].map((localDate) => ({
    localDate,
    content: buildWidgetContent({ ...input, today: localDate }),
  }));
}

export interface WidgetLinkState {
  hasOpenWorkout: boolean;
  /** Active routine ids in order. */
  routineIds: readonly number[];
  lastRoutineId: number | null;
}

export type WidgetLinkPlan = { kind: 'resume' } | { kind: 'start'; routineId: number } | { kind: 'routines' } | { kind: 'home' };

/** Reads `action` / `routine` from the link's query parameters (anything unknown → null). */
export function parseWidgetLink(params: { action?: unknown; routine?: unknown }): WidgetLink | null {
  const action = typeof params.action === 'string' ? params.action : null;
  if (action !== 'start' && action !== 'resume' && action !== 'routines') return null;
  const raw = typeof params.routine === 'string' ? params.routine : '';
  const routineId = /^\d+$/.test(raw) ? Number(raw) : null;
  return { action, routineId };
}

/**
 * What the app does when the widget is tapped, decided against the data as it is
 * now (the widget may be a little behind): an open workout is always resumed
 * (as Progress → "Next workout" does); "start" starts the routine the widget showed
 * if it is still active, else the routine that is next now; with no routines the
 * Routines screen opens.
 */
export function planWidgetLink(link: WidgetLink | null, state: WidgetLinkState): WidgetLinkPlan {
  if (state.hasOpenWorkout) return { kind: 'resume' };
  if (!link) return { kind: 'home' };
  if (link.action === 'routines') return { kind: 'routines' };
  if (link.action === 'resume') return { kind: 'home' };
  if (link.routineId !== null && state.routineIds.includes(link.routineId)) return { kind: 'start', routineId: link.routineId };
  const next = nextRoutineId(state.routineIds, state.lastRoutineId);
  return next === null ? { kind: 'routines' } : { kind: 'start', routineId: next };
}
