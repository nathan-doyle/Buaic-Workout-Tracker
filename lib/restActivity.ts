/**
 * The iOS rest-timer Live Activity (Phase 7), as pure functions: which set comes
 * next, what the activity should show for the rest timer's state, and whether the
 * app has to start, update or end it. `features/rest/restLiveActivity.ios.ts`
 * binds this to ActivityKit through expo-widgets.
 *
 * The countdown itself is SwiftUI's timer text (`Text(timerInterval:countsDown:)`),
 * so the activity counts down on its own; the app only talks to it when the rest
 * starts, is paused / resumed / changed by ±15 s, the next set changes, or the rest
 * ends (over, skipped, workout finished or discarded).
 */
import type { RestTimerState } from './restTimer';
import type { WorkoutDraft } from './workoutDraft';

export interface NextSet {
  exercise: string;
  /** 1-based position in the exercise's set list. */
  setNumber: number;
  setCount: number;
  /** "100 kg × 5", "BW × 12", "100 kg", or "" when nothing is filled in. */
  detail: string;
}

/**
 * The first set not ticked yet, starting with the exercise the rest is for (the
 * rest timer's label is that exercise's name), then the exercises after it, then
 * the ones before it.
 */
export function nextSet(draft: WorkoutDraft | null, restLabel: string): NextSet | null {
  if (!draft || draft.exercises.length === 0) return null;
  const count = draft.exercises.length;
  const from = Math.max(
    0,
    draft.exercises.findIndex((e) => e.name === restLabel && e.sets.some((s) => !s.done))
  );
  for (let k = 0; k < count; k += 1) {
    const exercise = draft.exercises[(from + k) % count];
    const index = exercise.sets.findIndex((s) => !s.done);
    if (index === -1) continue;
    const set = exercise.sets[index];
    const weightText = set.weight.text.trim();
    const reps = set.reps.trim();
    const weight = weightText === '' ? (reps === '' ? '' : 'BW') : `${weightText} ${draft.unit}`;
    return {
      exercise: exercise.name,
      setNumber: index + 1,
      setCount: exercise.sets.length,
      detail: reps === '' ? weight : `${weight} × ${reps}`,
    };
  }
  return null;
}

/** What the Live Activity shows. Times are epoch milliseconds. */
export interface RestActivityContent {
  /** Identifies the timer state the times were taken from (see `restActivityContent`). */
  stateKey: string;
  /** Start and end of the countdown. */
  restStart: number;
  restEnd: number;
  /** Set while paused: the countdown shows `restEnd − pausedAt`, frozen. */
  pausedAt: number | null;
  /** "Next: Bench Press · set 3 of 4", or "All sets done". */
  next: string;
  nextDetail: string;
}

/**
 * The content for the rest timer's state, or null when there should be no activity
 * (no workout open, no rest, or the rest is over). `previous` is what was last sent:
 * a paused rest keeps its frozen times, so re-reading the same state never causes
 * an update.
 */
export function restActivityContent(
  timer: RestTimerState,
  now: number,
  hasOpenWorkout: boolean,
  next: NextSet | null,
  previous: RestActivityContent | null
): RestActivityContent | null {
  if (!hasOpenWorkout) return null;
  const nextLine = next ? `Next: ${next.exercise} · set ${next.setNumber} of ${next.setCount}` : 'All sets done';
  const nextDetail = next?.detail ?? '';
  if (timer.status === 'running') {
    return {
      stateKey: `running:${timer.endsAt}`,
      restStart: Math.min(now, timer.endsAt - timer.durationSeconds * 1000),
      restEnd: timer.endsAt,
      pausedAt: null,
      next: nextLine,
      nextDetail,
    };
  }
  if (timer.status === 'paused') {
    const stateKey = `paused:${timer.remainingMs}`;
    if (previous && previous.stateKey === stateKey) return { ...previous, next: nextLine, nextDetail };
    return { stateKey, restStart: now, restEnd: now + timer.remainingMs, pausedAt: now, next: nextLine, nextDetail };
  }
  return null;
}

export type RestActivityStep = 'start' | 'update' | 'end' | 'none';

/** Start, update, end or leave the activity, given what was last sent and what should show now. */
export function restActivityStep(previous: RestActivityContent | null, desired: RestActivityContent | null): RestActivityStep {
  if (!previous) return desired ? 'start' : 'none';
  if (!desired) return 'end';
  return previous.stateKey === desired.stateKey &&
    previous.restStart === desired.restStart &&
    previous.restEnd === desired.restEnd &&
    previous.pausedAt === desired.pausedAt &&
    previous.next === desired.next &&
    previous.nextDetail === desired.nextDetail
    ? 'none'
    : 'update';
}
