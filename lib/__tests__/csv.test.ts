import { csvField, csvLine, csvNumber, parseCsv, toCsv, UTF8_BOM } from '../csv';
import { localTimeString } from '../dates';

describe('csvField (RFC 4180)', () => {
  it('leaves plain text alone', () => {
    expect(csvField('Bench Press')).toBe('Bench Press');
    expect(csvField('')).toBe('');
  });

  it('quotes commas, quotes, CR and LF, doubling inner quotes', () => {
    expect(csvField('Curl, hammer')).toBe('"Curl, hammer"');
    expect(csvField('The "big" one')).toBe('"The ""big"" one"');
    expect(csvField('line 1\nline 2')).toBe('"line 1\nline 2"');
    expect(csvField('a\r\nb')).toBe('"a\r\nb"');
  });

  it('writes null and undefined as empty fields', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('keeps text that looks like a formula as text', () => {
    expect(csvField('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvField('-2 kg next time')).toBe("'-2 kg next time");
    expect(csvField('+5')).toBe("'+5");
    expect(csvField('@home')).toBe("'@home");
    expect(csvField('=A1, then "B"')).toBe(`"'=A1, then ""B"""`);
    expect(csvField('Felt good - easy')).toBe('Felt good - easy');
  });

  it('keeps non-ASCII text as is', () => {
    expect(csvField('Développé couché')).toBe('Développé couché');
  });
});

describe('csvNumber', () => {
  it('uses a dot and no grouping, whatever the locale', () => {
    expect(csvNumber(61.23496995)).toBe('61.23496995');
    expect(csvNumber(1234.5)).toBe('1234.5');
    expect(csvNumber(0)).toBe('0');
    expect(csvNumber(-0)).toBe('0');
    expect(csvField(8.5)).toBe('8.5');
  });

  it('spells out exponent forms and drops non-finite values', () => {
    expect(csvNumber(1e-7)).toBe('0.0000001');
    expect(csvNumber(Number.NaN)).toBe('');
    expect(csvNumber(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('never prefixes negative numbers', () => {
    expect(csvField(-5)).toBe('-5');
  });
});

describe('toCsv / parseCsv', () => {
  it('ends every record with CRLF and can add a BOM', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('a,b\r\n1,x\r\n');
    expect(toCsv(['a'], [], { bom: true })).toBe(`${UTF8_BOM}a\r\n`);
    expect(csvLine(['x', null, 2])).toBe('x,,2');
  });

  it('round-trips awkward text', () => {
    const rows = [
      ['Curl, hammer', 'He said "go"', 'two\nlines', '', 'Ünïcödé 💪'],
      ['plain', 'a\r\nb', '"', ',', 'end'],
    ];
    const text = toCsv(['c1', 'c2', 'c3', 'c4', 'c5'], rows, { bom: true });
    expect(parseCsv(text)).toEqual([['c1', 'c2', 'c3', 'c4', 'c5'], ...rows]);
  });
});

describe('localTimeString', () => {
  it('gives HH:MM in the given zone, across midnight', () => {
    expect(localTimeString(new Date('2026-11-02T23:30:00Z'), 60)).toBe('00:30');
    expect(localTimeString(new Date('2026-11-02T03:05:00Z'), -300)).toBe('22:05');
    expect(localTimeString(new Date('2026-07-01T09:00:00Z'), 330)).toBe('14:30');
  });

  it('refuses invalid input', () => {
    expect(() => localTimeString(new Date('nope'), 0)).toThrow(RangeError);
    expect(() => localTimeString(new Date(), Number.NaN)).toThrow(RangeError);
  });
});
