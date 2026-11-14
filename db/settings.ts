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
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  unit: 'kg',
  weekStart: 'monday',
  defaultRestSeconds: 90,
});

/** Rest presets the Settings screen offers (seconds). */
export const REST_PRESETS = [30, 60, 90, 120, 180, 240] as const;

const KEYS: { [K in keyof Settings]: string } = {
  unit: 'unit',
  weekStart: 'week_start',
  defaultRestSeconds: 'default_rest_seconds',
};

const VALIDATORS: { [K in keyof Settings]: (value: unknown) => value is Settings[K] } = {
  unit: (v): v is WeightUnit => v === 'kg' || v === 'lb',
  weekStart: (v): v is WeekStart => v === 'monday' || v === 'sunday',
  defaultRestSeconds: (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 5 && v <= 3600,
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
