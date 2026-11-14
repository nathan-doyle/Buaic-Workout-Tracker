import {
  addDays,
  dayOfWeek,
  daysBetween,
  isLocalDateString,
  localDateString,
  startOfWeek,
  tzOffsetMinutesOf,
} from '../dates';

describe('tzOffsetMinutesOf', () => {
  it('is the negated Date#getTimezoneOffset (ISO sign)', () => {
    const winter = new Date('2026-01-15T12:00:00Z');
    const summer = new Date('2026-07-15T12:00:00Z');
    expect(tzOffsetMinutesOf(winter)).toBe(-winter.getTimezoneOffset() || 0);
    expect(tzOffsetMinutesOf(summer)).toBe(-summer.getTimezoneOffset() || 0);
  });

  it('never returns negative zero', () => {
    const fake = { getTimezoneOffset: () => 0 } as unknown as Date;
    expect(Object.is(tzOffsetMinutesOf(fake), 0)).toBe(true);
  });
});

describe('localDateString', () => {
  // 23:30 UTC on 14 Nov: still the 14th in London, already the 15th in Berlin.
  const lateUtc = new Date('2026-11-14T23:30:00Z');
  // 00:30 UTC on 15 Nov: the 15th in London, still the 14th in New York.
  const earlyUtc = new Date('2026-11-15T00:30:00Z');

  it('uses the local day, not the UTC day, around midnight UTC', () => {
    expect(localDateString(lateUtc, 0)).toBe('2026-11-14');
    expect(localDateString(lateUtc, 60)).toBe('2026-11-15');
    expect(localDateString(earlyUtc, 0)).toBe('2026-11-15');
    expect(localDateString(earlyUtc, -300)).toBe('2026-11-14');
  });

  it('handles half-hour and large offsets', () => {
    expect(localDateString(new Date('2026-11-14T18:00:00Z'), 330)).toBe('2026-11-14'); // 23:30 IST
    expect(localDateString(new Date('2026-11-14T18:30:00Z'), 330)).toBe('2026-11-15'); // 00:00 IST
    expect(localDateString(new Date('2026-11-14T10:00:00Z'), 840)).toBe('2026-11-15'); // UTC+14
    expect(localDateString(new Date('2026-11-14T11:00:00Z'), -720)).toBe('2026-11-13'); // UTC-12
  });

  it('crosses month and year boundaries', () => {
    expect(localDateString(new Date('2026-12-31T23:00:00Z'), 60)).toBe('2027-01-01');
    expect(localDateString(new Date('2027-01-01T02:00:00Z'), -180)).toBe('2026-12-31');
    expect(localDateString(new Date('2028-02-28T23:00:00Z'), 120)).toBe('2028-02-29');
  });

  it('pads years, months and days', () => {
    expect(localDateString(new Date('0999-03-04T12:00:00Z'), 0)).toBe('0999-03-04');
  });

  it('rejects an invalid date or offset', () => {
    expect(() => localDateString(new Date('nope'), 0)).toThrow(RangeError);
    expect(() => localDateString(lateUtc, Number.NaN)).toThrow(RangeError);
  });
});

describe('isLocalDateString', () => {
  it('accepts real dates', () => {
    expect(isLocalDateString('2026-11-14')).toBe(true);
    expect(isLocalDateString('2028-02-29')).toBe(true);
    expect(isLocalDateString('0050-06-01')).toBe(true);
  });

  it('rejects impossible or malformed dates', () => {
    expect(isLocalDateString('2026-02-29')).toBe(false);
    expect(isLocalDateString('2026-13-01')).toBe(false);
    expect(isLocalDateString('2026-00-10')).toBe(false);
    expect(isLocalDateString('2026-04-31')).toBe(false);
    expect(isLocalDateString('2026-11-14T00:00:00Z')).toBe(false);
    expect(isLocalDateString('26-11-14')).toBe(false);
    expect(isLocalDateString('')).toBe(false);
  });
});

describe('addDays', () => {
  it('moves forwards and backwards across boundaries', () => {
    expect(addDays('2026-11-14', 1)).toBe('2026-11-15');
    expect(addDays('2026-11-14', -14)).toBe('2026-10-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-11-14', 0)).toBe('2026-11-14');
  });

  it('is not affected by daylight saving (dates, not instants)', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('rejects bad input', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => addDays('2026-11-14', 1.5)).toThrow(RangeError);
  });
});

describe('dayOfWeek', () => {
  it('numbers days from Sunday = 0', () => {
    expect(dayOfWeek('2026-11-15')).toBe(0); // Sunday
    expect(dayOfWeek('2026-11-16')).toBe(1); // Monday
    expect(dayOfWeek('2026-11-14')).toBe(6); // Saturday
  });

  it('rejects bad input', () => {
    expect(() => dayOfWeek('not a date')).toThrow(RangeError);
  });
});

describe('startOfWeek', () => {
  it('starts on Monday', () => {
    expect(startOfWeek('2026-11-14', 'monday')).toBe('2026-11-09'); // Sat → Mon
    expect(startOfWeek('2026-11-15', 'monday')).toBe('2026-11-09'); // Sun → previous Mon
    expect(startOfWeek('2026-11-16', 'monday')).toBe('2026-11-16'); // Mon → itself
  });

  it('starts on Sunday', () => {
    expect(startOfWeek('2026-11-14', 'sunday')).toBe('2026-11-08'); // Sat → Sun
    expect(startOfWeek('2026-11-15', 'sunday')).toBe('2026-11-15'); // Sun → itself
    expect(startOfWeek('2026-11-16', 'sunday')).toBe('2026-11-15'); // Mon → Sun
  });

  it('crosses month and year boundaries', () => {
    expect(startOfWeek('2027-01-01', 'monday')).toBe('2026-12-28');
    expect(startOfWeek('2027-01-01', 'sunday')).toBe('2026-12-27');
  });

  it('rejects bad input', () => {
    expect(() => startOfWeek('2026-11-31', 'monday')).toThrow(RangeError);
  });
});

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-11-14', '2026-11-14')).toBe(0);
    expect(daysBetween('2026-11-14', '2026-11-21')).toBe(7);
    expect(daysBetween('2026-11-21', '2026-11-14')).toBe(-7);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2028-02-01', '2028-03-01')).toBe(29);
  });

  it('rejects bad input', () => {
    expect(() => daysBetween('2026-11-14', 'x')).toThrow(RangeError);
  });
});
