/**
 * The app's active-workout store, bound to the expo-sqlite database and the device
 * clock, plus helpers that turn routines and past workouts into exercise templates.
 */
import { getDb } from '../../db/database';
import { getRoutineExercises, type LibraryExercise } from '../../db/routines';
import { getSessionExercises } from '../../db/workouts';
import { tzOffsetMinutesOf } from '../../lib/dates';
import { settingsStore } from '../settings/settingsStore';
import { createActiveWorkoutStore, type ExerciseTemplate, useActiveWorkout } from './activeWorkoutStore';

export const activeWorkout = createActiveWorkoutStore({
  getDb,
  clock: () => {
    const now = new Date();
    return { now, tzOffsetMinutes: tzOffsetMinutesOf(now) };
  },
  unit: () => settingsStore.getSnapshot().unit,
});

export const useActiveWorkoutState = () => useActiveWorkout(activeWorkout);

export function routineTemplates(routineId: number): ExerciseTemplate[] {
  return getRoutineExercises(getDb(), routineId).map((e) => ({
    exerciseId: e.exerciseId,
    name: e.name,
    variation: e.variation,
    muscle: e.muscle,
    targetSets: e.targetSets,
    repMin: e.repMin,
    repMax: e.repMax,
    restSeconds: e.restSeconds,
  }));
}

/** "Repeat last workout": the same exercises with as many sets as last time. */
export function sessionTemplates(sessionId: number, routineId: number | null): ExerciseTemplate[] {
  const fromRoutine = new Map(routineId !== null ? routineTemplates(routineId).map((t) => [t.exerciseId, t]) : []);
  return getSessionExercises(getDb(), sessionId).map((e) => ({
    exerciseId: e.exerciseId,
    name: e.name,
    variation: e.variation,
    muscle: e.muscle,
    targetSets: e.setCount,
    repMin: fromRoutine.get(e.exerciseId)?.repMin ?? null,
    repMax: fromRoutine.get(e.exerciseId)?.repMax ?? null,
    restSeconds: fromRoutine.get(e.exerciseId)?.restSeconds ?? null,
  }));
}

/** A library exercise added on the fly (no routine targets). */
export function libraryTemplate(e: Pick<LibraryExercise, 'id' | 'name' | 'variation' | 'muscle'>): ExerciseTemplate {
  return {
    exerciseId: e.id,
    name: e.name,
    variation: e.variation,
    muscle: e.muscle,
    targetSets: 3,
    repMin: null,
    repMax: null,
    restSeconds: null,
  };
}
