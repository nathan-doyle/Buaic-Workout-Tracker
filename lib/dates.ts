/**
 * Local calendar dates.
 *
 * A "local date" is a `YYYY-MM-DD` string in the user's time zone at the time of
 * the event. Everything about today, weeks, streaks, the calendar and coverage
 * works on these strings, never on UTC dates.
 *
 * Time zone offsets use the ISO sign: minutes to ADD to UTC to get local time
 * (UTC+1 → 60, UTC-5 → -300). That is the opposite sign of `Date#getTimezoneOffset`.
 */

export type WeekStart = 'monday' | 'sunday';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The device's offset from UTC at `date`, in minutes (ISO sign; handles DST). */
export function tzOffsetMinutesOf(date: Date): number {
  const offset = -date.getTimezoneOffset();
  return offset === 0 ? 0 : offset; // normalise -0
}

/** The local `YYYY-MM-DD` date of the instant `date` in a zone `tzOffsetMinutes` from UTC. */
export function localDateString(date: Date, tzOffsetMinutes: number): string {
  const time = date.getTime();
  if (!Number.isFinite(time)) throw new RangeError('Invalid Date');
  if (!Number.isFinite(tzOffsetMinutes)) {
    throw new RangeError(`tzOffsetMinutes must be finite, got ${tzOffsetMinutes}`);
  }
  return formatUtcDate(new Date(time + tzOffsetMinutes * MS_PER_MINUTE));
}

/** True for a well-formed `YYYY-MM-DD` string naming a real calendar day. */
export function isLocalDateString(value: string): boolean {
  return parseToUtcMidnight(value) !== null;
}

/** `localDate` moved by `days` calendar days (negative goes back). */
export function addDays(localDate: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError(`days must be an integer, got ${days}`);
  return formatUtcDate(new Date(requireUtcMidnight(localDate) + days * MS_PER_DAY));
}

/** Day of the week: 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(localDate: string): number {
  return new Date(requireUtcMidnight(localDate)).getUTCDay();
}

/** The first day of the week containing `localDate`. */
export function startOfWeek(localDate: string, weekStart: WeekStart): string {
  const firstDay = weekStart === 'monday' ? 1 : 0;
  const back = (dayOfWeek(localDate) - firstDay + 7) % 7;
  return addDays(localDate, -back);
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((requireUtcMidnight(to) - requireUtcMidnight(from)) / MS_PER_DAY);
}

function formatUtcDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Milliseconds of UTC midnight for a valid local date string, else null. */
function parseToUtcMidnight(value: string): number | null {
  const match = LOCAL_DATE_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day); // avoids Date.UTC's 0–99 → 1900s quirk
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null; // e.g. 2026-02-30 or month 13
  }
  return date.getTime();
}

function requireUtcMidnight(localDate: string): number {
  const ms = parseToUtcMidnight(localDate);
  if (ms === null) throw new RangeError(`Not a YYYY-MM-DD date: ${localDate}`);
  return ms;
}
