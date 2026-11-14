import { EPLEY_MAX_REPS, bestE1rmSet, epleyE1rm } from '../e1rm';

describe('epleyE1rm', () => {
  it('applies Epley', () => {
    expect(epleyE1rm(100, 5)).toBeCloseTo(116.6667, 4);
    expect(epleyE1rm(100, 10)).toBeCloseTo(133.3333, 4);
    expect(epleyE1rm(60, 3)).toBe(66);
  });

  it('treats a single as its own 1RM', () => {
    expect(epleyE1rm(140, 1)).toBe(140);
  });

  it('estimates up to 12 reps and no further', () => {
    expect(EPLEY_MAX_REPS).toBe(12);
    expect(epleyE1rm(50, 12)).toBe(70);
    expect(epleyE1rm(50, 13)).toBeNull();
    expect(epleyE1rm(50, 30)).toBeNull();
  });

  it('gives no estimate for zero or invalid reps', () => {
    expect(epleyE1rm(100, 0)).toBeNull();
    expect(epleyE1rm(100, -3)).toBeNull();
    expect(epleyE1rm(100, 2.5)).toBeNull();
    expect(epleyE1rm(100, Number.NaN)).toBeNull();
  });

  it('gives no estimate for zero, negative or non-finite weight', () => {
    expect(epleyE1rm(0, 5)).toBeNull();
    expect(epleyE1rm(-20, 5)).toBeNull();
    expect(epleyE1rm(Number.NaN, 5)).toBeNull();
    expect(epleyE1rm(Number.POSITIVE_INFINITY, 5)).toBeNull();
  });
});

describe('bestE1rmSet', () => {
  it('picks the set with the highest estimate', () => {
    const sets = [
      { id: 'a', weight: 100, reps: 5 }, // 116.67
      { id: 'b', weight: 110, reps: 3 }, // 121
      { id: 'c', weight: 120, reps: 1 }, // 120
    ];
    const best = bestE1rmSet(sets);
    expect(best?.set).toBe(sets[1]);
    expect(best?.e1rm).toBeCloseTo(121, 10);
  });

  it('ignores sets without an estimate', () => {
    const sets = [
      { weight: 40, reps: 20 }, // > 12 reps
      { weight: 0, reps: 10 }, // bodyweight logged as 0
      { weight: 50, reps: 8 },
    ];
    const best = bestE1rmSet(sets);
    expect(best?.set).toBe(sets[2]);
    expect(best?.e1rm).toBeCloseTo(63.3333, 4);
  });

  it('keeps the earlier set on a tie', () => {
    const sets = [
      { weight: 80, reps: 5 },
      { weight: 80, reps: 5 },
    ];
    expect(bestE1rmSet(sets)?.set).toBe(sets[0]);
  });

  it('returns null when nothing qualifies', () => {
    expect(bestE1rmSet([])).toBeNull();
    expect(bestE1rmSet([{ weight: 0, reps: 5 }, { weight: 20, reps: 15 }])).toBeNull();
  });
});
