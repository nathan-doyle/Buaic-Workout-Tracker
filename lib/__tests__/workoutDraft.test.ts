import {
  blankSet,
  emptyDraft,
  loggedSets,
  parseDraft,
  parseWeightKg,
  setInputError,
  shouldOfferRoutineUpdate,
  type WorkoutDraft,
} from '../workoutDraft';

const ex = (exerciseId: number) => ({
  exerciseId,
  name: `E${exerciseId}`,
  variation: '',
  muscle: 'Quads',
  notes: '',
  restSeconds: null,
  repMin: null,
  repMax: null,
  sets: [],
});
const draft = (ids: number[], initial?: number[]): WorkoutDraft => ({
  ...emptyDraft('kg'),
  exercises: ids.map(ex),
  initialExerciseIds: initial,
});

describe('workout draft', () => {
  it('offers a routine update only when the list was changed during the workout', () => {
    // Started from the routine, unchanged.
    expect(shouldOfferRoutineUpdate([1, 2, 3], draft([1, 2, 3], [1, 2, 3]))).toBe(false);
    // Added, removed, reordered during the workout.
    expect(shouldOfferRoutineUpdate([1, 2, 3], draft([1, 2, 3, 4], [1, 2, 3]))).toBe(true);
    expect(shouldOfferRoutineUpdate([1, 2, 3], draft([1, 3], [1, 2, 3]))).toBe(true);
    expect(shouldOfferRoutineUpdate([1, 2, 3], draft([2, 1, 3], [1, 2, 3]))).toBe(true);
    // "Repeat last" of a partial workout: different from the routine, but nothing changed.
    expect(shouldOfferRoutineUpdate([1, 2, 3], draft([1], [1]))).toBe(false);
    // Changed back to exactly the routine: nothing to update.
    expect(shouldOfferRoutineUpdate([1, 2, 3], draft([1, 2, 3], [1]))).toBe(false);
    // Drafts saved before this field existed compare with the routine.
    expect(shouldOfferRoutineUpdate([1, 2], draft([1]))).toBe(true);
  });

  it('round-trips through JSON and tolerates damaged drafts', () => {
    const d = draft([7], [7]);
    d.exercises[0].sets = [{ ...blankSet({ text: '100', exactKg: 100, exactText: '100' }, '5'), done: true, logId: 3, completedAt: 'x' }];
    expect(parseDraft(JSON.stringify(d))).toEqual(d);
    expect(parseDraft('not json')).toBeNull();
    expect(parseDraft(JSON.stringify({ version: 2, exercises: [] }))).toBeNull();
    expect(parseDraft(JSON.stringify({ version: 1, exercises: [{ exerciseId: 'x' }, { exerciseId: 4 }] }))?.exercises).toHaveLength(1);
  });

  it('validates input and numbers ticked sets per exercise', () => {
    expect(parseWeightKg({ text: '' }, 'kg')).toBe(0);
    expect(parseWeightKg({ text: '2,5' }, 'kg')).toBe(2.5);
    expect(parseWeightKg({ text: '135' }, 'lb')).toBeCloseTo(61.23497, 5);
    expect(parseWeightKg({ text: '-5' }, 'kg')).toBeNull();
    expect(setInputError(blankSet({ text: '50' }, '0'), 'kg')).toMatch(/reps/);
    expect(setInputError(blankSet({ text: '50' }, '5'), 'kg')).toBeNull();

    const d = draft([1]);
    d.exercises[0].sets = [
      { ...blankSet({ text: '50' }, '5'), done: true },
      blankSet({ text: '50' }, '5'),
      { ...blankSet({ text: '55' }, '3'), done: true, setType: 'drop' },
    ];
    expect(loggedSets(d, 'now').map((s) => [s.setNumber, s.weight, s.reps, s.setType])).toEqual([
      [1, 50, 5, 'working'],
      [2, 55, 3, 'drop'],
    ]);
  });
});
