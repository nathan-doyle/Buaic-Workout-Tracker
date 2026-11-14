/**
 * The active workout as an external store (`useSyncExternalStore`). SQLite is the
 * source of truth: the session row exists from the start, ticked sets are written
 * at once and the draft is saved shortly after every edit (and on `flush()`, which
 * the screen calls when the app goes to the background). After a crash, `resume()`
 * rebuilds everything from the database.
 *
 * No React Native imports, so Jest drives it on node:sqlite. Haptics, sounds and the
 * rest timer are the screen's job, based on what the methods return.
 */
import { useSyncExternalStore } from 'react';

import type { DbAdapter } from '../../db/adapter';
import type { Clock } from '../../db/queries';
import * as W from '../../db/workouts';
import { addToBests, detectPrs, emptyBests, type ExerciseBests, type PrKind, prLabel } from '../../lib/prs';
import { entryFromKg, type WeightUnit } from '../../lib/units';
import {
  blankSet,
  convertDraft,
  type DraftExercise,
  type DraftSet,
  emptyDraft,
  loggedSets,
  moveItem,
  parseDraft,
  type SetType,
  setInputError,
  toLoggedSet,
  type WorkoutDraft,
} from '../../lib/workoutDraft';

/** An exercise as it enters a workout (from a routine, the last workout or the picker). */
export interface ExerciseTemplate {
  exerciseId: number;
  name: string;
  variation: string;
  muscle: string;
  targetSets: number;
  repMin: number | null;
  repMax: number | null;
  restSeconds: number | null;
}

export interface ActiveSession {
  id: number;
  name: string;
  routineId: number | null;
  startedAt: string;
}

export interface ActiveWorkoutState {
  session: ActiveSession | null;
  draft: WorkoutDraft | null;
  previous: Record<number, W.PreviousSet[]>;
  /** All-time bests from completed workouts (this workout's sets not included). */
  bests: Record<number, ExerciseBests>;
}

export interface PrSummaryItem {
  name: string;
  variation: string;
  weight: number;
  reps: number;
  label: string;
}

export interface WorkoutSummary {
  splitName: string;
  totalVolume: number;
  totalSets: number;
  durationSeconds: number;
  exerciseHighlights: {
    name: string;
    variation: string;
    topWeight: number;
    topReps: number;
    completedSetsCount: number;
    isPR: boolean;
  }[];
  newPRCount: number;
  prs: PrSummaryItem[];
}

export type ToggleResult =
  | { ok: false; error: string }
  | { ok: true; done: boolean; prLabel: string | null; restSeconds: number | null };

export type FinishResult = { ok: false; error: string } | { ok: true; summary: WorkoutSummary };

export interface ActiveWorkoutDeps {
  getDb: () => DbAdapter;
  clock: () => Clock;
  /** Unit the screen shows weights in. */
  unit: () => WeightUnit;
  /** Debounce for saving typed input (ms). */
  saveDelayMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  onError?: (what: string, error: unknown) => void;
}

const EMPTY: ActiveWorkoutState = { session: null, draft: null, previous: {}, bests: {} };

/** PR kinds of each set in order, each compared with the bests before it (warm-ups never count). */
export function prsInOrder(
  base: ExerciseBests,
  sets: readonly { weight: number; reps: number; setType: SetType }[]
): PrKind[][] {
  let bests = base;
  return sets.map((set) => {
    if (set.setType === 'warmup') return [];
    const prs = detectPrs(bests, set);
    bests = addToBests(bests, set);
    return prs;
  });
}

export function createActiveWorkoutStore(deps: ActiveWorkoutDeps) {
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const saveDelayMs = deps.saveDelayMs ?? 400;
  const onError = deps.onError ?? ((what, error) => console.error(`Active workout: ${what}`, error));

  let state: ActiveWorkoutState = EMPTY;
  let pendingSave: unknown = null;
  let lastRemoved: { exerciseId: number; index: number; set: DraftSet } | null = null;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());
  const db = () => deps.getDb();

  function setState(next: ActiveWorkoutState) {
    state = next;
    emit();
  }

  function saveNow() {
    if (pendingSave !== null) {
      clearTimer(pendingSave);
      pendingSave = null;
    }
    if (!state.session || !state.draft) return;
    try {
      W.saveWorkoutDraft(db(), state.session.id, JSON.stringify(state.draft));
    } catch (error) {
      onError('saving draft', error);
    }
  }

  function saveSoon() {
    if (pendingSave !== null) clearTimer(pendingSave);
    pendingSave = setTimer(() => {
      pendingSave = null;
      saveNow();
    }, saveDelayMs);
  }

  function setDraft(draft: WorkoutDraft, persist: 'now' | 'soon') {
    setState({ ...state, draft });
    if (persist === 'now') saveNow();
    else saveSoon();
  }

  function loadHistory(exerciseIds: number[]) {
    const previous = { ...state.previous };
    const bests = { ...state.bests };
    for (const id of exerciseIds) {
      try {
        previous[id] = W.getPreviousSets(db(), id);
        bests[id] = W.getExerciseBests(db(), id);
      } catch (error) {
        onError('loading history', error);
        previous[id] = previous[id] ?? [];
        bests[id] = bests[id] ?? emptyBests();
      }
    }
    return { previous, bests };
  }

  /** Draft exercise with sets prefilled from last time (or the routine's targets). */
  function draftExercise(t: ExerciseTemplate, previous: W.PreviousSet[], unit: WeightUnit): DraftExercise {
    const working = previous.filter((p) => p.setType !== 'warmup');
    const source = working.length > 0 ? working : previous;
    const count = Math.max(1, t.targetSets || source.length || 1);
    const sets: DraftSet[] = [];
    for (let i = 0; i < count; i++) {
      const p = source[Math.min(i, source.length - 1)];
      sets.push(
        p
          ? blankSet(p.weight > 0 ? entryFromKg(p.weight, unit) : { text: '' }, String(p.reps))
          : blankSet({ text: '' }, t.repMin !== null ? String(t.repMin) : '')
      );
    }
    return {
      exerciseId: t.exerciseId,
      name: t.name,
      variation: t.variation,
      muscle: t.muscle,
      notes: '',
      restSeconds: t.restSeconds,
      repMin: t.repMin,
      repMax: t.repMax,
      sets,
    };
  }

  function findExercise(exerciseId: number): [number, DraftExercise] | null {
    const index = state.draft?.exercises.findIndex((e) => e.exerciseId === exerciseId) ?? -1;
    return index >= 0 && state.draft ? [index, state.draft.exercises[index]] : null;
  }

  function replaceExercise(index: number, exercise: DraftExercise): WorkoutDraft {
    const draft = state.draft!;
    const exercises = [...draft.exercises];
    exercises[index] = exercise;
    return { ...draft, exercises };
  }

  /** Number of the ticked set among the exercise's ticked sets (1-based). */
  const tickedNumber = (exercise: DraftExercise, key: string) => {
    let n = 0;
    for (const s of exercise.sets) {
      if (s.done || s.key === key) n += 1;
      if (s.key === key) break;
    }
    return n;
  };

  const store = {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** Loads an unfinished workout from the database (app start, after an import). */
    resume(): boolean {
      try {
        const row = W.getInProgressWorkout(db());
        if (!row) {
          setState(EMPTY);
          return false;
        }
        const unit = deps.unit();
        const parsed = parseDraft(row.draftJson) ?? emptyDraft(unit);
        const draft = convertDraft(parsed, unit);
        state = { ...EMPTY };
        const { previous, bests } = loadHistory(draft.exercises.map((e) => e.exerciseId));
        setState({
          session: { id: row.id, name: row.name, routineId: row.routineId, startedAt: row.startedAt },
          draft,
          previous,
          bests,
        });
        return true;
      } catch (error) {
        onError('resuming', error);
        return false;
      }
    },

    /** Starts a workout. Fails if one is already in progress. */
    start(name: string, routineId: number | null, templates: ExerciseTemplate[]): boolean {
      if (state.session) return false;
      try {
        if (W.getInProgressWorkout(db())) return store.resume() && false;
        const unit = deps.unit();
        state = { ...EMPTY };
        const { previous, bests } = loadHistory(templates.map((t) => t.exerciseId));
        const draft: WorkoutDraft = {
          ...emptyDraft(unit),
          exercises: templates.map((t) => draftExercise(t, previous[t.exerciseId] ?? [], unit)),
          initialExerciseIds: templates.map((t) => t.exerciseId),
        };
        const clock = deps.clock();
        const id = W.startWorkout(db(), { name, routineId, draftJson: JSON.stringify(draft) }, clock);
        setState({ session: { id, name, routineId, startedAt: clock.now.toISOString() }, draft, previous, bests });
        return true;
      } catch (error) {
        onError('starting', error);
        setState(EMPTY);
        return false;
      }
    },

    rename(name: string) {
      if (!state.session || name.trim() === '') return;
      try {
        W.renameWorkout(db(), state.session.id, name.trim());
        setState({ ...state, session: { ...state.session, name: name.trim() } });
      } catch (error) {
        onError('renaming', error);
      }
    },

    /** Re-expresses typed weights after the unit changed. */
    setUnit(unit: WeightUnit) {
      if (!state.draft || state.draft.unit === unit) return;
      setDraft(convertDraft(state.draft, unit), 'now');
    },

    updateSet(exerciseId: number, key: string, patch: Partial<Pick<DraftSet, 'reps' | 'rpe' | 'setType'>> & { weightText?: string }) {
      const found = findExercise(exerciseId);
      if (!found || !state.draft) return;
      const [index, exercise] = found;
      const sets = exercise.sets.map((s) => {
        if (s.key !== key) return s;
        const { weightText, ...rest } = patch;
        return { ...s, ...rest, weight: weightText === undefined ? s.weight : { ...s.weight, text: weightText } };
      });
      const next = { ...exercise, sets };
      const draft = replaceExercise(index, next);
      const set = sets.find((s) => s.key === key);
      if (set?.done && set.logId !== null && setInputError(set, draft.unit) === null) {
        try {
          W.updateLoggedSet(db(), set.logId, toLoggedSet(next, set, tickedNumber(next, key), draft.unit, set.completedAt ?? ''));
        } catch (error) {
          onError('updating set', error);
        }
      }
      setDraft(draft, 'soon');
    },

    /** Fills a set row with values (e.g. the progression hint). */
    fillSet(exerciseId: number, key: string, weightKg: number | null, reps: string) {
      const found = findExercise(exerciseId);
      if (!found || !state.draft) return;
      const [index, exercise] = found;
      const unit = state.draft.unit;
      const sets = exercise.sets.map((s) =>
        s.key === key && !s.done
          ? { ...s, weight: weightKg === null ? s.weight : weightKg > 0 ? entryFromKg(weightKg, unit) : { text: '' }, reps }
          : s
      );
      setDraft(replaceExercise(index, { ...exercise, sets }), 'soon');
    },

    /** Ticks or unticks a set. Ticking writes it to SQLite at once. */
    toggleDone(exerciseId: number, key: string): ToggleResult {
      const found = findExercise(exerciseId);
      if (!found || !state.session || !state.draft) return { ok: false, error: 'No workout in progress.' };
      const [index, exercise] = found;
      const set = exercise.sets.find((s) => s.key === key);
      if (!set) return { ok: false, error: 'Set not found.' };
      const unit = state.draft.unit;

      if (set.done) {
        try {
          if (set.logId !== null) W.deleteLoggedSet(db(), set.logId);
        } catch (error) {
          onError('unticking', error);
          return { ok: false, error: 'Could not update the set.' };
        }
        const sets = exercise.sets.map((s) => (s.key === key ? { ...s, done: false, logId: null, completedAt: null } : s));
        setDraft(replaceExercise(index, { ...exercise, sets }), 'now');
        return { ok: true, done: false, prLabel: null, restSeconds: null };
      }

      const inputError = setInputError(set, unit);
      if (inputError) return { ok: false, error: inputError };
      const completedAt = deps.clock().now.toISOString();
      const logged = toLoggedSet(exercise, set, tickedNumber(exercise, key), unit, completedAt);
      let logId: number;
      try {
        logId = W.logSet(db(), state.session.id, logged, index);
      } catch (error) {
        onError('logging set', error);
        return { ok: false, error: 'Could not save the set.' };
      }
      const sets = exercise.sets.map((s) => (s.key === key ? { ...s, done: true, logId, completedAt } : s));
      const next = { ...exercise, sets };
      setDraft(replaceExercise(index, next), 'now');

      // PR check: against all-time bests plus the sets ticked before it in this workout.
      const ticked = next.sets.filter((s) => s.done).map((s) => toLoggedSet(next, s, 0, unit, completedAt));
      const position = next.sets.filter((s) => s.done).findIndex((s) => s.key === key);
      const prs = prsInOrder(state.bests[exerciseId] ?? emptyBests(), ticked)[position] ?? [];
      return { ok: true, done: true, prLabel: prLabel(prs), restSeconds: exercise.restSeconds };
    },

    addSet(exerciseId: number) {
      const found = findExercise(exerciseId);
      if (!found) return;
      const [index, exercise] = found;
      const last = exercise.sets[exercise.sets.length - 1];
      const set = last ? { ...blankSet({ ...last.weight }, last.reps), setType: last.setType === 'warmup' ? 'working' as const : last.setType } : blankSet();
      setDraft(replaceExercise(index, { ...exercise, sets: [...exercise.sets, set] }), 'now');
    },

    /** Deletes a set row (and its logged set). `undoRemoveSet` brings it back. */
    removeSet(exerciseId: number, key: string) {
      const found = findExercise(exerciseId);
      if (!found) return;
      const [index, exercise] = found;
      const setIndex = exercise.sets.findIndex((s) => s.key === key);
      if (setIndex < 0) return;
      const set = exercise.sets[setIndex];
      try {
        if (set.logId !== null) W.deleteLoggedSet(db(), set.logId);
      } catch (error) {
        onError('removing set', error);
        return;
      }
      // The undo brings it back unticked: ticking again re-logs it with fresh PR checks.
      lastRemoved = { exerciseId, index: setIndex, set: { ...set, done: false, logId: null, completedAt: null } };
      setDraft(replaceExercise(index, { ...exercise, sets: exercise.sets.filter((s) => s.key !== key) }), 'now');
    },

    undoRemoveSet(): boolean {
      if (!lastRemoved) return false;
      const { exerciseId, index: setIndex, set } = lastRemoved;
      lastRemoved = null;
      const found = findExercise(exerciseId);
      if (!found) return false;
      const [index, exercise] = found;
      const sets = [...exercise.sets];
      sets.splice(Math.min(setIndex, sets.length), 0, set);
      setDraft(replaceExercise(index, { ...exercise, sets }), 'now');
      return true;
    },

    setType(exerciseId: number, key: string, setType: SetType) {
      store.updateSet(exerciseId, key, { setType });
    },

    setNotes(exerciseId: number, notes: string) {
      const found = findExercise(exerciseId);
      if (!found) return;
      setDraft(replaceExercise(found[0], { ...found[1], notes }), 'soon');
    },

    /** Adds exercises at the end (or at `at`); exercises already in the workout are skipped. */
    addExercises(templates: ExerciseTemplate[], at?: number) {
      if (!state.draft) return;
      const present = new Set(state.draft.exercises.map((e) => e.exerciseId));
      const fresh = templates.filter((t) => !present.has(t.exerciseId));
      if (fresh.length === 0) return;
      const { previous, bests } = loadHistory(fresh.map((t) => t.exerciseId));
      const draft = state.draft;
      const added = fresh.map((t) => draftExercise(t, previous[t.exerciseId] ?? [], draft.unit));
      const exercises = [...draft.exercises];
      exercises.splice(at ?? exercises.length, 0, ...added);
      state = { ...state, previous, bests };
      setDraft({ ...draft, exercises }, 'now');
    },

    /** Removes an exercise and its logged sets from this workout. */
    removeExercise(exerciseId: number) {
      const found = findExercise(exerciseId);
      if (!found || !state.draft) return;
      try {
        for (const s of found[1].sets) if (s.logId !== null) W.deleteLoggedSet(db(), s.logId);
      } catch (error) {
        onError('removing exercise', error);
        return;
      }
      setDraft({ ...state.draft, exercises: state.draft.exercises.filter((e) => e.exerciseId !== exerciseId) }, 'now');
    },

    /** Replaces an exercise with another at the same place (its logged sets are removed). */
    swapExercise(exerciseId: number, template: ExerciseTemplate) {
      const found = findExercise(exerciseId);
      if (!found || !state.draft || found[1].exerciseId === template.exerciseId) return;
      const at = found[0];
      store.removeExercise(exerciseId);
      store.addExercises([{ ...template, targetSets: template.targetSets || found[1].sets.length }], at);
    },

    moveExercise(from: number, to: number) {
      if (!state.draft) return;
      setDraft({ ...state.draft, exercises: moveItem(state.draft.exercises, from, to) }, 'now');
    },

    /** Saves pending input now (app going to the background). */
    flush() {
      saveNow();
    },

    /** Completes the workout. Unticked sets are dropped (the screen confirms first). */
    finish(): FinishResult {
      if (!state.session || !state.draft) return { ok: false, error: 'No workout in progress.' };
      const clock = deps.clock();
      const nowIso = clock.now.toISOString();
      const draft = state.draft;
      const sets = loggedSets(draft, nowIso);
      if (sets.length === 0) return { ok: false, error: 'Complete at least one set before finishing.' };

      const summary = summarize(state, sets, clock.now);
      try {
        saveNow();
        W.finishWorkout(
          db(),
          state.session.id,
          {
            name: state.session.name,
            exercises: draft.exercises.map((e) => ({ exerciseId: e.exerciseId, notes: e.notes })),
            sets,
          },
          clock
        );
      } catch (error) {
        onError('finishing', error);
        return { ok: false, error: 'Could not save the workout. Your sets are still here.' };
      }
      lastRemoved = null;
      setState(EMPTY);
      return { ok: true, summary };
    },

    /** Deletes the unfinished workout (the screen confirms first). */
    discard(): boolean {
      if (!state.session) return false;
      try {
        if (pendingSave !== null) clearTimer(pendingSave);
        pendingSave = null;
        W.discardWorkout(db(), state.session.id);
      } catch (error) {
        onError('discarding', error);
        return false;
      }
      lastRemoved = null;
      setState(EMPTY);
      return true;
    },

    /**
     * Re-reads "previous" and the all-time bests of this workout's exercises, after
     * past workouts were edited or deleted in History. The draft is not changed.
     */
    reloadHistory() {
      if (!state.draft) return;
      const { previous, bests } = loadHistory(state.draft.exercises.map((e) => e.exerciseId));
      setState({ ...state, previous, bests });
    },

    /** Forgets the in-memory state without touching the database (after a backup import). */
    reset() {
      if (pendingSave !== null) clearTimer(pendingSave);
      pendingSave = null;
      lastRemoved = null;
      setState(EMPTY);
    },
  };
  return store;
}

function summarize(state: ActiveWorkoutState, sets: ReturnType<typeof loggedSets>, now: Date): WorkoutSummary {
  const draft = state.draft!;
  let totalVolume = 0;
  const highlights: WorkoutSummary['exerciseHighlights'] = [];
  const prs: PrSummaryItem[] = [];
  for (const exercise of draft.exercises) {
    const mine = sets.filter((s) => s.exerciseId === exercise.exerciseId);
    if (mine.length === 0) continue;
    let top = mine[0];
    for (const s of mine) {
      totalVolume += s.weight * s.reps;
      if (s.weight > top.weight || (s.weight === top.weight && s.reps > top.reps)) top = s;
    }
    const perSet = prsInOrder(state.bests[exercise.exerciseId] ?? emptyBests(), mine);
    // One entry per exercise: the set with the most significant record (latest on a tie).
    let best: PrSummaryItem | null = null;
    let bestRank = 0;
    for (let i = 0; i < perSet.length; i++) {
      const kinds = perSet[i];
      const label = prLabel(kinds);
      if (!label) continue;
      const rank = kinds.some((k) => k.kind === 'weight') ? 3 : kinds.some((k) => k.kind === 'e1rm') ? 2 : 1;
      if (rank >= bestRank) {
        bestRank = rank;
        best = { name: exercise.name, variation: exercise.variation, weight: mine[i].weight, reps: mine[i].reps, label };
      }
    }
    if (best) prs.push(best);
    highlights.push({
      name: exercise.name,
      variation: exercise.variation,
      topWeight: top.weight,
      topReps: top.reps,
      completedSetsCount: mine.length,
      isPR: best !== null,
    });
  }
  const started = state.session ? Date.parse(state.session.startedAt) : now.getTime();
  return {
    splitName: state.session?.name ?? 'Workout',
    totalVolume,
    totalSets: sets.length,
    durationSeconds: Math.max(0, Math.round((now.getTime() - started) / 1000)),
    exerciseHighlights: highlights,
    newPRCount: prs.length,
    prs,
  };
}

export type ActiveWorkoutStore = ReturnType<typeof createActiveWorkoutStore>;

export function useActiveWorkout(store: ActiveWorkoutStore): ActiveWorkoutState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
