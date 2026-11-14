import { progressionHint } from '../progression';

const w = (weight: number, reps: number, setType = 'working') => ({ weight, reps, setType });

describe('progression hint', () => {
  it('adds the increment when every working set hit the top of the range', () => {
    expect(progressionHint([w(40, 10, 'warmup'), w(80, 8), w(80, 8), w(80, 9)], { repMin: 6, repMax: 8 }, 2.5)).toMatchObject({
      weightKg: 82.5,
      reps: 6,
      repsLabel: '6–8',
      increase: true,
    });
  });

  it('keeps the weight and aims for one more rep otherwise', () => {
    expect(progressionHint([w(80, 8), w(80, 7), w(80, 6)], { repMin: 6, repMax: 8 }, 2.5)).toMatchObject({
      weightKg: 80,
      reps: 7,
      increase: false,
    });
    // No range: one more rep than the weakest set at the top weight.
    expect(progressionHint([w(100, 5), w(90, 3)], { repMin: null, repMax: null }, 2.5)).toMatchObject({ weightKg: 100, reps: 6 });
  });

  it('handles bodyweight, missing history and lb increments', () => {
    expect(progressionHint([w(0, 12), w(0, 12)], { repMin: 8, repMax: 12 }, 2.5)).toMatchObject({ weightKg: 0, reps: 13, increase: false });
    expect(progressionHint([], { repMin: 8, repMax: 12 }, 2.5)).toBeNull();
    expect(progressionHint([w(10, 4, 'warmup')], { repMin: 8, repMax: 12 }, 2.5)).toBeNull();
    const lb = progressionHint([w(61.23496995, 5)], { repMin: 5, repMax: 5 }, 5 * 0.45359237);
    expect(lb!.weightKg / 0.45359237).toBeCloseTo(140, 6);
    expect(lb!.repsLabel).toBe('5');
  });
});
