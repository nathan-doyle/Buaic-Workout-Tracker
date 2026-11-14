import {
  DISPLAY_STEP,
  KG_PER_LB,
  displayWeight,
  convertEntry,
  entryFromKg,
  entryToKg,
  formatVolume,
  formatWeight,
  fromKg,
  kgToLb,
  lbToKg,
  roundToStep,
  toKg,
  type WeightEntry,
  type WeightUnit,
} from '../units';

describe('constants', () => {
  it('uses the exact pound', () => {
    expect(KG_PER_LB).toBe(0.45359237);
  });

  it('rounds kg to 0.25 and lb to 0.5', () => {
    expect(DISPLAY_STEP).toEqual({ kg: 0.25, lb: 0.5 });
  });
});

describe('lbToKg / kgToLb', () => {
  it('converts with the exact factor', () => {
    expect(lbToKg(1)).toBe(0.45359237);
    expect(lbToKg(135)).toBeCloseTo(61.23497, 5);
    expect(kgToLb(0.45359237)).toBe(1);
    expect(kgToLb(100)).toBeCloseTo(220.46226, 5);
  });

  it('round-trips without drift', () => {
    for (const lb of [0, 2.5, 45, 135, 225, 315, 405.5]) {
      expect(kgToLb(lbToKg(lb))).toBeCloseTo(lb, 10);
    }
  });

  it('maps zero to zero', () => {
    expect(lbToKg(0)).toBe(0);
    expect(kgToLb(0)).toBe(0);
  });
});

describe('toKg / fromKg', () => {
  it('passes kg through unchanged', () => {
    expect(toKg(61.3, 'kg')).toBe(61.3);
    expect(fromKg(61.3, 'kg')).toBe(61.3);
  });

  it('converts lb', () => {
    expect(toKg(135, 'lb')).toBe(135 * 0.45359237);
    expect(fromKg(135 * 0.45359237, 'lb')).toBeCloseTo(135, 10);
  });
});

describe('roundToStep', () => {
  it('rounds to the nearest step', () => {
    expect(roundToStep(61.3, 0.25)).toBe(61.25);
    expect(roundToStep(61.4, 0.25)).toBe(61.5);
    expect(roundToStep(134.7, 0.5)).toBe(134.5);
    expect(roundToStep(134.76, 0.5)).toBe(135);
    expect(roundToStep(7, 1)).toBe(7);
  });

  it('rounds halves up', () => {
    expect(roundToStep(61.125, 0.25)).toBe(61.25);
    expect(roundToStep(10.25, 0.5)).toBe(10.5);
  });

  it('never returns negative zero', () => {
    expect(Object.is(roundToStep(-0.1, 0.25), 0)).toBe(true);
    expect(Object.is(roundToStep(-0, 0.5), 0)).toBe(true);
  });

  it('rejects a non-positive or non-finite step', () => {
    expect(() => roundToStep(1, 0)).toThrow(RangeError);
    expect(() => roundToStep(1, -0.5)).toThrow(RangeError);
    expect(() => roundToStep(1, Number.NaN)).toThrow(RangeError);
    expect(() => roundToStep(1, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('displayWeight', () => {
  it('shows a lb-entered weight exactly in lb', () => {
    for (const lb of [45, 95, 135, 137.5, 225, 315]) {
      expect(displayWeight(toKg(lb, 'lb'), 'lb')).toBe(lb);
    }
  });

  it('rounds kg to 0.25', () => {
    expect(displayWeight(toKg(135, 'lb'), 'kg')).toBe(61.25);
    expect(displayWeight(100, 'kg')).toBe(100);
    expect(displayWeight(102.6, 'kg')).toBe(102.5);
  });

  it('rounds lb to 0.5', () => {
    expect(displayWeight(100, 'lb')).toBe(220.5);
    expect(displayWeight(61, 'lb')).toBe(134.5); // a V1 "135 lb" set stored as 61.0 kg
  });
});

describe('formatWeight', () => {
  it('drops trailing zeros', () => {
    expect(formatWeight(60, 'kg')).toBe('60');
    expect(formatWeight(60.5, 'kg')).toBe('60.5');
    expect(formatWeight(61.25, 'kg')).toBe('61.25');
    expect(formatWeight(toKg(135, 'lb'), 'lb')).toBe('135');
    expect(formatWeight(61, 'lb')).toBe('134.5');
  });

  it('formats zero', () => {
    expect(formatWeight(0, 'kg')).toBe('0');
    expect(formatWeight(0, 'lb')).toBe('0');
  });

  it('shows a dash for non-finite values', () => {
    expect(formatWeight(Number.NaN, 'kg')).toBe('—');
    expect(formatWeight(Number.POSITIVE_INFINITY, 'lb')).toBe('—');
  });
});

describe('formatVolume', () => {
  it('shows whole units in the chosen unit', () => {
    expect(formatVolume(1234.6, 'kg')).toBe('1235');
    expect(formatVolume(100, 'lb')).toBe('220');
    expect(formatVolume(0, 'kg')).toBe('0');
  });

  it('shows 0 for a session without sets (NULL volume) or bad input', () => {
    expect(formatVolume(null, 'kg')).toBe('0');
    expect(formatVolume(undefined, 'lb')).toBe('0');
    expect(formatVolume(Number.NaN, 'kg')).toBe('0');
    expect(formatVolume(-0.2, 'kg')).toBe('0');
  });
});

describe('weight entries', () => {
  const toggle = (e: WeightEntry, from: WeightUnit, to: WeightUnit) => convertEntry(e, from, to);

  it('shows a stored weight with display rounding and keeps the exact kg', () => {
    const entry = entryFromKg(61.23496995, 'kg');
    expect(entry.text).toBe('61.25');
    expect(entryToKg(entry, 'kg')).toBe(61.23496995);
  });

  it('converts typed weights on a unit toggle, with display rounding', () => {
    expect(toggle({ text: '135' }, 'lb', 'kg').text).toBe('61.25');
    expect(toggle({ text: '100' }, 'kg', 'lb').text).toBe('220.5');
    expect(toggle({ text: '60' }, 'kg', 'kg')).toEqual({ text: '60' });
  });

  it('never drifts when toggled back and forth, and saves the exact typed value', () => {
    for (const lb of ['45', '95', '135', '185', '225', '315', '317.5']) {
      let entry: WeightEntry = { text: lb };
      for (let i = 0; i < 3; i++) entry = toggle(toggle(entry, 'lb', 'kg'), 'kg', 'lb');
      expect(entry.text).toBe(lb);
      expect(entryToKg(toggle(entry, 'lb', 'kg'), 'kg')).toBeCloseTo(Number(lb) * KG_PER_LB, 12);
    }
  });

  it('uses the text once the user edits it', () => {
    const converted = toggle({ text: '315' }, 'lb', 'kg'); // "143"
    expect(entryToKg({ ...converted, text: '140' }, 'kg')).toBe(140);
    expect(toggle({ ...converted, text: '140' }, 'kg', 'lb').text).toBe('308.5');
  });

  it('keeps text that is not a number, which saves as 0 (V1)', () => {
    expect(toggle({ text: '' }, 'kg', 'lb')).toEqual({ text: '' });
    expect(toggle({ text: 'abc' }, 'lb', 'kg')).toEqual({ text: 'abc' });
    expect(entryToKg({ text: '' }, 'lb')).toBe(0);
  });
});

describe('formatLoad', () => {
  const { formatLoad, isBodyweightEquipment } = jest.requireActual('../units') as typeof import('../units');
  it('shows BW, BW + added weight, or the weight', () => {
    expect(formatLoad(0, 'kg')).toBe('BW');
    expect(formatLoad(0, 'lb', true)).toBe('BW');
    expect(formatLoad(10, 'kg', true)).toBe('BW +10 kg');
    expect(formatLoad(4.5359237, 'lb', true)).toBe('BW +10 lb');
    expect(formatLoad(100, 'kg')).toBe('100 kg');
    expect(formatLoad(Number.NaN, 'kg')).toBe('—');
  });
  it('recognises bodyweight equipment', () => {
    expect([isBodyweightEquipment('Bodyweight'), isBodyweightEquipment('bodyweight'), isBodyweightEquipment('Barbell'), isBodyweightEquipment(null)]).toEqual([true, true, false, false]);
  });
});
