/**
 * Hands a picker request to the exercise picker route and its result back to the
 * screen that opened it (routes can't pass callbacks as params).
 */
import type { useRouter } from 'expo-router';

import type { LibraryExercise } from '../../db/routines';

export interface PickRequest {
  title: string;
  /** Pick several (Add) or one (Swap). */
  multiple: boolean;
  /** Already present: shown as added and not selectable. */
  excludeIds?: number[];
  /** Where a newly created exercise goes, for the create screen's hint. */
  destination: string;
  onPick: (exercises: LibraryExercise[]) => void;
}

let pending: PickRequest | null = null;

export function openExercisePicker(router: ReturnType<typeof useRouter>, request: PickRequest): void {
  pending = request;
  router.push('/exercise-picker');
}

export function currentPickRequest(): PickRequest | null {
  return pending;
}

export function clearPickRequest(): void {
  pending = null;
}
