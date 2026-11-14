import { ALL_MUSCLE_GROUPS } from '../../../db/v1Constants';
import { MAPPED_MUSCLES, REGIONS, SILHOUETTE } from '../bodyMapRegions';

const points = (d: string) => [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);

it('draws every muscle group on at least one side', () => {
  expect([...MAPPED_MUSCLES].sort()).toEqual([...ALL_MUSCLE_GROUPS].sort());
});

it('keeps every region inside the left half of the canvas (the right half is mirrored)', () => {
  for (const d of [SILHOUETTE, ...REGIONS.front.map((r) => r.d), ...REGIONS.back.map((r) => r.d)]) {
    for (const [x, y] of points(d)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(420);
    }
  }
});

it('has one region per muscle per side', () => {
  for (const side of ['front', 'back'] as const) {
    const names = REGIONS[side].map((r) => r.muscle);
    expect(new Set(names).size).toBe(names.length);
  }
});
