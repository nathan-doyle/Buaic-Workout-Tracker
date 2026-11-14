/**
 * A counter that goes up whenever all data is replaced (backup import), so screens
 * that keep data in memory (the Workout tab) know to reload.
 */
import { useSyncExternalStore } from 'react';

let revision = 0;
const listeners = new Set<() => void>();

export function bumpDataRevision(): void {
  revision += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDataRevision(): number {
  return useSyncExternalStore(subscribe, () => revision);
}
