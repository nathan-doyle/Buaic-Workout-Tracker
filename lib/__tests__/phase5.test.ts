/**
 * Phase 5 logic: onboarding state, review prompt rules, share card data.
 */
import {
  barFor,
  currentStep,
  initialOnboarding,
  isLastStep,
  nextStep,
  onboardingWrites,
  planToApply,
  previousStep,
  setBar,
  STARTER_PLANS,
} from '../onboarding';
import { REVIEW_AFTER_WORKOUTS, shouldRequestReview } from '../reviewPrompt';
import { buildShareCard, describeShareCard, MAX_EXERCISE_ROWS, SHARE_SIZES, type ShareSummaryInput } from '../shareCard';
import { KG_PER_LB } from '../units';
import { formatFileSize, parseRestorePointName, pickRestorePoints, restorePointName } from '../restorePoints';

describe('onboarding', () => {
  const start = initialOnboarding({ unit: 'kg', barKg: 20, barLb: 45 });

  it('has three steps: units, bar, plan', () => {
    expect(currentStep(start)).toBe('units');
    const s2 = nextStep(start);
    expect(currentStep(s2)).toBe('bar');
    const s3 = nextStep(s2);
    expect(currentStep(s3)).toBe('plan');
    expect(isLastStep(s3)).toBe(true);
    expect(nextStep(s3)).toBe(s3); // no step past the last
    expect(previousStep(start)).toBe(start);
    expect(currentStep(previousStep(s3))).toBe('bar');
  });

  it('starts from the current settings and keeps the starter splits by default', () => {
    expect(start).toEqual({ step: 0, unit: 'kg', barKg: 20, barLb: 45, plan: 'keep' });
    expect(initialOnboarding({ unit: 'lb', barKg: 15, barLb: 35 })).toMatchObject({ unit: 'lb', barKg: 15, barLb: 35 });
  });

  it('the bar follows the chosen unit', () => {
    const lb = { ...start, unit: 'lb' as const };
    expect(barFor(lb)).toBe(45);
    const changed = setBar(lb, 35);
    expect(changed).toMatchObject({ barLb: 35, barKg: 20 });
    expect(setBar(start, 15)).toMatchObject({ barKg: 15, barLb: 45 });
  });

  it('completing writes unit, bar for that unit and done', () => {
    const s = { ...start, step: 2, unit: 'lb' as const, barLb: 35, plan: 'ppl' as const };
    expect(onboardingWrites(s, true)).toEqual([
      ['unit', 'lb'],
      ['barLb', 35],
      ['onboardingStatus', 'done'],
    ]);
    expect(planToApply(s, true)).toBe('ppl');
  });

  it('skipping keeps the defaults for steps not passed, and is always marked done', () => {
    expect(onboardingWrites({ ...start, unit: 'lb' }, false)).toEqual([['onboardingStatus', 'done']]);
    expect(onboardingWrites({ ...start, step: 1, unit: 'lb', barLb: 25 }, false)).toEqual([
      ['unit', 'lb'],
      ['onboardingStatus', 'done'],
    ]);
    expect(onboardingWrites({ ...start, step: 2, barKg: 15, plan: 'blank' }, false)).toEqual([
      ['unit', 'kg'],
      ['barKg', 15],
      ['onboardingStatus', 'done'],
    ]);
    // Skipping never replaces the starter splits.
    expect(planToApply({ ...start, step: 2, plan: 'blank' }, false)).toBe('keep');
  });

  it('offers the three templates, the starter splits and blank', () => {
    expect(STARTER_PLANS.map((p) => p.id).sort()).toEqual(['blank', 'full-body-3x', 'keep', 'ppl', 'upper-lower']);
  });
});

describe('review prompt', () => {
  const base = { completedWorkouts: 5, appVersion: '2.0.0', promptedVersion: null, justFinished: true };

  it('asks after the 5th completed workout, right after a finish', () => {
    expect(REVIEW_AFTER_WORKOUTS).toBe(5);
    expect(shouldRequestReview(base)).toBe(true);
    expect(shouldRequestReview({ ...base, completedWorkouts: 4 })).toBe(false);
    expect(shouldRequestReview({ ...base, completedWorkouts: 12 })).toBe(true);
  });

  it('only right after a successful finish', () => {
    expect(shouldRequestReview({ ...base, justFinished: false })).toBe(false);
  });

  it('at most once per app version', () => {
    expect(shouldRequestReview({ ...base, promptedVersion: '2.0.0' })).toBe(false);
    expect(shouldRequestReview({ ...base, promptedVersion: '1.0.0' })).toBe(true);
    expect(shouldRequestReview({ ...base, completedWorkouts: 30, promptedVersion: '2.0.0' })).toBe(false);
  });

  it('never when the version is unknown (it could not be tracked)', () => {
    expect(shouldRequestReview({ ...base, appVersion: null })).toBe(false);
    expect(shouldRequestReview({ ...base, appVersion: '' })).toBe(false);
  });
});

describe('share card', () => {
  const summary: ShareSummaryInput = {
    splitName: 'Push',
    totalVolume: 100 * 5 * 3 + 60 * 8 * 2,
    totalSets: 5,
    durationSeconds: 52 * 60 + 20,
    exerciseHighlights: [
      { name: 'Bench Press', variation: '', topWeight: 100, topReps: 5, completedSetsCount: 3 },
      { name: 'Overhead Press', variation: 'Seated', topWeight: 60, topReps: 8, completedSetsCount: 2 },
    ],
    prs: [{ name: 'Bench Press', variation: '', weight: 100, reps: 5, label: 'Heaviest' }],
  };
  const now = new Date('2026-11-14T18:30:00Z');

  it('shows name, date, duration, volume, sets and PRs', () => {
    const card = buildShareCard(summary, { unit: 'kg', hideWeights: false, format: 'story', now, locale: 'en-GB' });
    expect(card.title).toBe('Push');
    expect(card.dateLabel).toContain('14');
    expect(card.duration).toBe('52 min');
    expect(card.volume).toBe('2,460 kg');
    expect(card.sets).toBe(5);
    expect(card.prCount).toBe(1);
    expect(card.prs).toEqual([{ exercise: 'Bench Press', label: 'Heaviest', detail: '100 kg × 5' }]);
    expect(card.exercises).toEqual([
      { name: 'Bench Press', sets: '3 sets', top: '100 kg × 5' },
      { name: 'Overhead Press (Seated)', sets: '2 sets', top: '60 kg × 8' },
    ]);
    expect(card.moreExercises).toBe(0);
  });

  it('respects the unit exactly (lb)', () => {
    const lb: ShareSummaryInput = {
      ...summary,
      totalVolume: 225 * KG_PER_LB * 5,
      exerciseHighlights: [{ name: 'Bench Press', variation: '', topWeight: 225 * KG_PER_LB, topReps: 5, completedSetsCount: 1 }],
      prs: [],
    };
    const card = buildShareCard(lb, { unit: 'lb', hideWeights: false, format: 'square', now, locale: 'en-US' });
    expect(card.volume).toBe('1,125 lb');
    expect(card.exercises[0].top).toBe('225 lb × 5');
  });

  it('hide weights removes every weight and the volume, keeps reps and sets', () => {
    const card = buildShareCard(summary, { unit: 'kg', hideWeights: true, format: 'story', now });
    expect(card.volume).toBeNull();
    expect(card.prs[0].detail).toBe('5 reps');
    expect(card.exercises.map((e) => e.top)).toEqual(['5 reps', '8 reps']);
    expect(JSON.stringify(card)).not.toMatch(/kg|lb/);
    expect(card.sets).toBe(5);
  });

  it('bodyweight sets read BW; one-rep sets are singular', () => {
    const bw: ShareSummaryInput = {
      ...summary,
      exerciseHighlights: [{ name: 'Pull-up', variation: '', topWeight: 0, topReps: 1, completedSetsCount: 1 }],
      prs: [],
    };
    const card = buildShareCard(bw, { unit: 'kg', hideWeights: false, format: 'story', now });
    expect(card.exercises[0]).toEqual({ name: 'Pull-up', sets: '1 set', top: 'BW × 1' });
    expect(buildShareCard(bw, { unit: 'kg', hideWeights: true, format: 'story', now }).exercises[0].top).toBe('1 rep');
  });

  it('a workout under a minute has no duration; a blank name reads Workout', () => {
    const card = buildShareCard({ ...summary, splitName: '  ', durationSeconds: 30 }, { unit: 'kg', hideWeights: false, format: 'story', now });
    expect(card.duration).toBeNull();
    expect(card.title).toBe('Workout');
  });

  it('caps exercise rows per format with "+ N more"', () => {
    const many: ShareSummaryInput = {
      ...summary,
      exerciseHighlights: Array.from({ length: 10 }, (_, i) => ({ name: `E${i}`, variation: '', topWeight: 50, topReps: 5, completedSetsCount: 1 })),
    };
    const story = buildShareCard(many, { unit: 'kg', hideWeights: false, format: 'story', now });
    expect(story.exercises).toHaveLength(MAX_EXERCISE_ROWS.story - 1);
    expect(story.moreExercises).toBe(10 - (MAX_EXERCISE_ROWS.story - 1));
    const exact = { ...many, exerciseHighlights: many.exerciseHighlights.slice(0, MAX_EXERCISE_ROWS.square) };
    expect(buildShareCard(exact, { unit: 'kg', hideWeights: false, format: 'square', now }).moreExercises).toBe(0);
  });

  it('story is 9:16 and square is 1:1', () => {
    expect(SHARE_SIZES.story.height / SHARE_SIZES.story.width).toBeCloseTo(16 / 9);
    expect(SHARE_SIZES.square.height).toBe(SHARE_SIZES.square.width);
  });

  it('describes itself for screen readers', () => {
    const card = buildShareCard(summary, { unit: 'kg', hideWeights: false, format: 'story', now, locale: 'en-GB' });
    expect(describeShareCard(card)).toMatch(/^Push, .*, 52 min, volume 2,460 kg, 5 sets, 1 personal record\.$/);
    const hidden = buildShareCard({ ...summary, prs: [] }, { unit: 'kg', hideWeights: true, format: 'story', now, locale: 'en-GB' });
    expect(describeShareCard(hidden)).not.toMatch(/volume|record/);
  });
});

describe('restore points', () => {
  it('names round-trip (UTC stamp as the import writes it)', () => {
    const at = new Date('2026-11-14T15:30:12.345Z');
    const name = restorePointName(at);
    expect(name).toBe('iron_and_stone.pre-import-20261114T153012.db');
    expect(parseRestorePointName(name)?.toISOString()).toBe('2026-11-14T15:30:12.000Z');
  });

  it('ignores other files and impossible dates', () => {
    for (const name of [
      'iron_and_stone.db',
      'iron_and_stone.v1-backup.db',
      'iron_and_stone.pre-import-20261114T153012.db-wal',
      'iron_and_stone.pre-import-20261340T153012.db',
      'iron_and_stone.pre-import-2026111T153012.db',
    ]) {
      expect(parseRestorePointName(name)).toBeNull();
    }
  });

  it('lists only restore points, newest first', () => {
    const list = pickRestorePoints([
      { name: 'iron_and_stone.db', size: 1 },
      { name: 'iron_and_stone.pre-import-20261101T080000.db', size: 2048 },
      { name: 'iron_and_stone.pre-import-20261114T153012.db', size: 4096 },
      { name: 'iron_and_stone.v1-backup.db', size: 3 },
    ]);
    expect(list.map((p) => p.size)).toEqual([4096, 2048]);
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(28 * 1024)).toBe('28 KB');
    expect(formatFileSize(3.25 * 1024 * 1024)).toBe('3.3 MB');
  });
});
