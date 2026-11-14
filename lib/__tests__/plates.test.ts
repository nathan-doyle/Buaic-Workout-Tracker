import { describePlates, platesPerSide } from '../plates';

const KG = [25, 20, 15, 10, 5, 2.5, 1.25];
const LB = [45, 35, 25, 10, 5, 2.5];

describe('plate calculator', () => {
  it('loads kg plates per side', () => {
    expect(platesPerSide(100, 20, KG)).toEqual({ perSide: [25, 15], achieved: 100, remainder: 0, belowBar: false });
    expect(platesPerSide(142.5, 20, KG).perSide).toEqual([25, 25, 10, 1.25]);
    expect(describePlates([25, 25, 10, 1.25])).toBe('25 × 2, 10, 1.25');
  });

  it('loads lb plates per side', () => {
    expect(platesPerSide(225, 45, LB).perSide).toEqual([45, 45]);
    expect(platesPerSide(135, 45, LB).perSide).toEqual([45]);
    expect(platesPerSide(187.5, 45, LB)).toMatchObject({ perSide: [45, 25], achieved: 185, remainder: 2.5 });
  });

  it('reports what it cannot make exactly, and the empty bar', () => {
    const r = platesPerSide(101, 20, KG);
    expect(r.achieved).toBe(100);
    expect(r.remainder).toBe(1);
    expect(platesPerSide(20, 20, KG).perSide).toEqual([]);
    expect(platesPerSide(15, 20, KG)).toMatchObject({ belowBar: true, perSide: [] });
    expect(platesPerSide(60, 20, [])).toMatchObject({ achieved: 20, remainder: 40 });
  });
});
