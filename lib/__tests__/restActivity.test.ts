/**
 * iOS rest Live Activity logic (Phase 7): the next set, the content per rest state
 * (running, paused, over), and when to start / update / end the activity.
 */
import { nextSet, restActivityContent, type RestActivityContent, restActivityStep } from '../restActivity';
import { adjustRest, IDLE, pauseRest, resumeRest, type RestTimerState, startRest, tick } from '../restTimer';
import { blankSet, type DraftExercise, type WorkoutDraft } from '../workoutDraft';

function exercise(name: string, sets: [weight: string, reps: string, done: boolean][]): DraftExercise {
  return {
    exerciseId: name.length,
    name,
    variation: '',
    muscle: 'Chest',
    notes: '',
    restSeconds: null,
    repMin: null,
    repMax: null,
    sets: sets.map(([w, r, done]) => ({ ...blankSet({ text: w }, r), done })),
  };
}

function draft(...exercises: DraftExercise[]): WorkoutDraft {
  return { version: 1, unit: 'kg', exercises };
}

const workout = draft(
  exercise('Bench Press', [
    ['100', '5', true],
    ['100', '5', true],
    ['100', '5', false],
    ['100', '', false],
  ]),
  exercise('Pull-Up', [
    ['', '12', false],
    ['10', '8', false],
  ]),
  exercise('Squat', [['140', '5', true]])
);

describe('nextSet', () => {
  it('is the first unticked set of the exercise just rested for', () => {
    expect(nextSet(workout, 'Bench Press')).toEqual({ exercise: 'Bench Press', setNumber: 3, setCount: 4, detail: '100 kg × 5' });
  });

  it('moves on to the next exercise, wrapping round', () => {
    const benchDone = draft(
      exercise('Bench Press', [['100', '5', true]]),
      exercise('Pull-Up', [['', '12', false]]),
      exercise('Squat', [['140', '5', true]])
    );
    expect(nextSet(benchDone, 'Bench Press')).toEqual({ exercise: 'Pull-Up', setNumber: 1, setCount: 1, detail: 'BW × 12' });
    expect(nextSet(benchDone, 'Squat')?.exercise).toBe('Pull-Up');
  });

  it('starts at the top for an unknown label and describes partly filled sets', () => {
    expect(nextSet(workout, '')?.exercise).toBe('Bench Press');
    const partial = draft(exercise('Row', [['80', '', false]]), exercise('Curl', [['', '', false]]));
    expect(nextSet(partial, 'Row')?.detail).toBe('80 kg');
    expect(nextSet(draft(exercise('Curl', [['', '', false]])), 'Curl')?.detail).toBe('');
  });

  it('uses the unit the weights are typed in', () => {
    expect(nextSet({ ...workout, unit: 'lb' }, 'Bench Press')?.detail).toBe('100 lb × 5');
  });

  it('is null when every set is ticked or there is no workout', () => {
    expect(nextSet(draft(exercise('Squat', [['140', '5', true]])), 'Squat')).toBeNull();
    expect(nextSet(draft(), 'Squat')).toBeNull();
    expect(nextSet(null, 'Squat')).toBeNull();
  });
});

const T0 = 1_800_000_000_000;
const NEXT = { exercise: 'Bench Press', setNumber: 3, setCount: 4, detail: '100 kg × 5' };

describe('restActivityContent', () => {
  it('counts down from the rest start to its end while running', () => {
    const running = startRest(90, T0, 'Bench Press');
    const c = restActivityContent(running, T0 + 10_000, true, NEXT, null)!;
    expect(c).toEqual({
      stateKey: `running:${T0 + 90_000}`,
      restStart: T0,
      restEnd: T0 + 90_000,
      pausedAt: null,
      next: 'Next: Bench Press · set 3 of 4',
      nextDetail: '100 kg × 5',
    });
    // Re-reading the same state later gives the same content (no update needed).
    expect(restActivityContent(running, T0 + 50_000, true, NEXT, c)).toEqual(c);
  });

  it('follows ±15 s', () => {
    const running = startRest(90, T0);
    const plus = adjustRest(running, 15, T0 + 1000);
    expect(restActivityContent(plus, T0 + 1000, true, NEXT, null)).toMatchObject({ restEnd: T0 + 105_000 });
    const c = restActivityContent(plus, T0 + 1000, true, NEXT, null)!;
    expect(c.restStart).toBeLessThanOrEqual(T0 + 1000);
  });

  it('freezes the remaining time while paused and keeps it on re-reads', () => {
    const paused = pauseRest(startRest(90, T0), T0 + 30_000);
    const c = restActivityContent(paused, T0 + 30_000, true, NEXT, null)!;
    expect(c).toMatchObject({ stateKey: 'paused:60000', restStart: T0 + 30_000, restEnd: T0 + 90_000, pausedAt: T0 + 30_000 });
    expect(restActivityContent(paused, T0 + 45_000, true, NEXT, c)).toEqual(c);
    // Resumed: counts down again to a new end.
    const resumed = resumeRest(paused, T0 + 45_000);
    expect(restActivityContent(resumed, T0 + 45_000, true, NEXT, c)).toMatchObject({ restEnd: T0 + 105_000, pausedAt: null });
  });

  it('has none when the rest is over, skipped or no workout is open', () => {
    const done = tick(startRest(30, T0), T0 + 31_000);
    expect(done.status).toBe('done');
    expect(restActivityContent(done, T0 + 31_000, true, NEXT, null)).toBeNull();
    expect(restActivityContent(IDLE, T0, true, NEXT, null)).toBeNull();
    expect(restActivityContent(startRest(90, T0), T0, false, NEXT, null)).toBeNull();
  });

  it('says so when every set is done', () => {
    expect(restActivityContent(startRest(90, T0), T0, true, null, null)).toMatchObject({ next: 'All sets done', nextDetail: '' });
  });
});

describe('restActivityStep', () => {
  const content = (timer: RestTimerState, previous: RestActivityContent | null = null, next = NEXT) =>
    restActivityContent(timer, T0, true, next, previous);
  const running = content(startRest(90, T0));

  it('starts, updates and ends at the right moments', () => {
    expect(restActivityStep(null, running)).toBe('start');
    expect(restActivityStep(running, running)).toBe('none');
    expect(restActivityStep(running, content(startRest(120, T0)))).toBe('update'); // restarted or changed
    expect(restActivityStep(running, content(pauseRest(startRest(90, T0), T0 + 1000)))).toBe('update');
    expect(restActivityStep(running, content(startRest(90, T0), null, { ...NEXT, setNumber: 4 }))).toBe('update'); // next set changed
    expect(restActivityStep(running, null)).toBe('end'); // over, skipped, finished, discarded
    expect(restActivityStep(null, null)).toBe('none');
  });
});
