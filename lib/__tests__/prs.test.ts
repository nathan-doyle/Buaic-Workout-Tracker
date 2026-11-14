import { addToBests, bestsFromSets, detectPrs, emptyBests, prLabel } from '../prs';

describe('personal records', () => {
  it('never calls the first set of an exercise a PR', () => {
    expect(detectPrs(emptyBests(), { weight: 100, reps: 5 })).toEqual([]);
  });

  it('detects heavier weight, better e1RM and rep maxes against earlier bests', () => {
    const bests = bestsFromSets([
      { weight: 100, reps: 5 },
      { weight: 90, reps: 8 },
    ]);
    expect(bests.maxWeight).toBe(100);
    expect(bests.repMax[5]).toBe(100);
    expect(bests.repMax[8]).toBe(90);
    expect(bests.repMax[10]).toBeNull();

    // 92.5 × 8: rep max for 8 (and 1/3/5? no: 100 is heavier), e1RM 117.2 > 116.7
    const prs = detectPrs(bests, { weight: 92.5, reps: 8 });
    expect(prs).toEqual([{ kind: 'e1rm' }, { kind: 'reps', reps: 8 }]);
    expect(prLabel(prs)).toBe('Best e1RM');

    expect(prLabel(detectPrs(bests, { weight: 102.5, reps: 1 }))).toBe('Heaviest');
    // Same weight as before is no record.
    expect(detectPrs(bests, { weight: 100, reps: 5 })).toEqual([]);
  });

  it('counts a set for every rep max at or below its reps', () => {
    const bests = addToBests(emptyBests(), { weight: 100, reps: 6 });
    expect(bests.repMax).toEqual({ 1: 100, 3: 100, 5: 100, 8: null, 10: null });
    // A 10-rep set is not a 10-rep "record" when no 10-rep set existed before.
    expect(detectPrs(bests, { weight: 60, reps: 10 })).toEqual([]);
  });

  it('ignores bodyweight sets, no-estimate rep counts and float noise', () => {
    const bests = bestsFromSets([{ weight: 61.234991, reps: 5 }]);
    expect(detectPrs(bests, { weight: 0, reps: 20 })).toEqual([]);
    expect(detectPrs(bests, { weight: 61.2349911, reps: 5 })).toEqual([]);
    expect(detectPrs(bestsFromSets([{ weight: 40, reps: 15 }]), { weight: 40, reps: 14 })).toEqual([]);
    expect(prLabel([{ kind: 'reps', reps: 3 }, { kind: 'reps', reps: 5 }])).toBe('5-rep max');
    expect(prLabel([])).toBeNull();
  });
});
