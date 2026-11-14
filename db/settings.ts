/**
 * Settings persisted in the `settings` table (key → JSON-encoded value).
 * Unknown or invalid stored values fall back to the defaults.
 */
import type { WeekStart } from '../lib/dates';
import type { WeightUnit } from '../lib/units';
import type { DbAdapter } from './adapter';

export interface Settings {
  unit: WeightUnit;
  weekStart: WeekStart;
  defaultRestSeconds: number;
  /** Start the rest timer when a set is ticked. */
  autoStartRest: boolean;
  restSound: boolean;
  restVibrate: boolean;
  showRpe: boolean;
  progressionHints: boolean;
  /** Steps for the ± buttons and the progression hint. */
  incrementKg: number;
  incrementLb: number;
  barKg: number;
  barLb: number;
  /** Plate sizes available (per side), any order. */
  platesKg: number[];
  platesLb: number[];
  /** The rest-timer notification explanation was shown (asked once, in context). */
  notificationsPrompted: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  unit: 'kg',
  weekStart: 'monday',
  defaultRestSeconds: 90,
  autoStartRest: true,
  restSound: true,
  restVibrate: true,
  showRpe: false,
  progressionHints: true,
  incrementKg: 2.5,
  incrementLb: 5,
  barKg: 20,
  barLb: 45,
  platesKg: [25, 20, 15, 10, 5, 2.5, 1.25],
  platesLb: [45, 35, 25, 10, 5, 2.5],
  notificationsPrompted: false,
} satisfies Settings);

/** Rest presets the Settings screen offers (seconds). */
export const REST_PRESETS = [30, 60, 90, 120, 180, 240] as const;

const KEYS: { [K in keyof Settings]: string } = {
  unit: 'unit',
  weekStart: 'week_start',
  defaultRestSeconds: 'default_rest_seconds',
  autoStartRest: 'auto_start_rest',
  restSound: 'rest_sound',
  restVibrate: 'rest_vibrate',
  showRpe: 'show_rpe',
  progressionHints: 'progression_hints',
  incrementKg: 'increment_kg',
  incrementLb: 'increment_lb',
  barKg: 'bar_kg',
  barLb: 'bar_lb',
  platesKg: 'plates_kg',
  platesLb: 'plates_lb',
  notificationsPrompted: 'notifications_prompted',
};

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const positive =
  (max: number) =>
  (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max;
const plateList = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length <= 20 && v.every((p) => positive(100)(p));

const VALIDATORS: { [K in keyof Settings]: (value: unknown) => value is Settings[K] } = {
  unit: (v): v is WeightUnit => v === 'kg' || v === 'lb',
  weekStart: (v): v is WeekStart => v === 'monday' || v === 'sunday',
  defaultRestSeconds: (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 5 && v <= 3600,
  autoStartRest: isBool,
  restSound: isBool,
  restVibrate: isBool,
  showRpe: isBool,
  progressionHints: isBool,
  incrementKg: positive(50),
  incrementLb: positive(100),
  barKg: positive(100),
  barLb: positive(200),
  platesKg: plateList,
  platesLb: plateList,
  notificationsPrompted: isBool,
};

export function isValidSetting<K extends keyof Settings>(key: K, value: unknown): value is Settings[K] {
  return VALIDATORS[key](value);
}

export function readSettings(db: DbAdapter): Settings {
  const rows = db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const result: Settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(KEYS) as (keyof Settings)[]) {
    const raw = stored.get(KEYS[key]);
    if (raw === undefined) continue;
    try {
      const value: unknown = JSON.parse(raw);
      if (isValidSetting(key, value)) (result as Record<keyof Settings, unknown>)[key] = value;
    } catch {
      // Unreadable value: keep the default.
    }
  }
  return result;
}

export function writeSetting<K extends keyof Settings>(db: DbAdapter, key: K, value: Settings[K]): void {
  if (!isValidSetting(key, value)) throw new RangeError(`Invalid value for setting ${key}`);
  db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [KEYS[key], JSON.stringify(value)]
  );
}
