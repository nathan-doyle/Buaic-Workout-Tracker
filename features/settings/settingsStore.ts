/**
 * Settings as an external store: SQLite is the source of truth, this keeps the
 * current values in memory for `useSyncExternalStore`.
 */
import { useSyncExternalStore } from 'react';

import type { DbAdapter } from '../../db/adapter';
import { DEFAULT_SETTINGS, readSettings, type Settings, writeSetting } from '../../db/settings';

export interface SettingsStore {
  /** Loads the stored settings (at startup and after an import). */
  attach(db: DbAdapter): void;
  getSnapshot(): Settings;
  subscribe(listener: () => void): () => void;
  /** Persists one setting, then notifies subscribers. Throws if it can't be saved. */
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
}

export function createSettingsStore(): SettingsStore {
  let db: DbAdapter | null = null;
  let snapshot: Settings = { ...DEFAULT_SETTINGS };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  return {
    attach(adapter) {
      db = adapter;
      snapshot = readSettings(adapter);
      emit();
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(key, value) {
      if (!db) throw new Error('Settings are not loaded yet.');
      if (snapshot[key] === value) return;
      writeSetting(db, key, value);
      snapshot = { ...snapshot, [key]: value };
      emit();
    },
  };
}

export const settingsStore = createSettingsStore();

export function useSettings(): Settings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot);
}
