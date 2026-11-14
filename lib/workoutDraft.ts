/**
 * The active workout as edited on screen, saved as `workout_sessions.draft_json`
 * on the in-progress session (debounced while typing, immediately on tick).
 * Ticked sets are also written to `set_logs` straight away; the draft holds what
 * isn't a logged set yet: typed values, the exercise list and its order, notes.
 *
 * Pure functions only, so they run in Jest. Weights are kept as `WeightEntry`
 * (typed text in `draft.unit` plus the exact kg it came from).
 */
import { convertEntry, entryToKg, type WeightEntry, type WeightUnit } from './units';

export const SET_TYPES = ['warmup', 'working', 'drop', 'failure'] as const;
export type SetType = (typeof SET_TYPES)[number];

export interface DraftSet {
  /** Stable key for list rows and undo (not a database id). */
  key: string;
  setType: SetType;
  weight: WeightEntry;
  reps: string;
  /** Empty unless RPE is entered. */
  rpe: string;
  done: boolean;
  /** `set_logs.id` while ticked. */
  logId: number | null;
  /** When it was ticked (ISO). */
  completedAt: string | null;
}

export interface DraftExercise {
  exerciseId: number;
  name: string;
  variation: string;
  muscle: string;
  notes: string;
  /** Rest after a set of this exercise; null = the default from Settings. */
  restSeconds: number | null;
  repMin: number | null;
  repMax: number | null;
  sets: DraftSet[];
}

export interface WorkoutDraft {
  version: 1;
  /** Unit the weight texts are written in. */
  unit: WeightUnit;
  exercises: DraftExercise[];
  /** Exercise ids the workout started with (to tell whether the user changed the list). */
  initialExerciseIds?: number[];
}

/** A ticked set as stored (kg at full precision). */
export interface LoggedSet {
  exerciseId: number;
  setNumber: number;
  weight: number;
  reps: number;
  setType: SetType;
  rpe: number | null;
  completedAt: string;
}

let keyCounter = 0;
/** A key unique within this app run (drafts restored from disk keep their keys). */
export function newSetKey(): string {
  keyCounter += 1;
  return `s${Date.now().toString(36)}${keyCounter.toString(36)}`;
}

export function emptyDraft(unit: WeightUnit): WorkoutDraft {
  return { version: 1, unit, exercises: [] };
}

export function blankSet(weight: WeightEntry = { text: '' }, reps = ''): DraftSet {
  return { key: newSetKey(), setType: 'working', weight, reps, rpe: '', done: false, logId: null, completedAt: null };
}

/** Reps as typed, or null when not a whole number ≥ 0. */
export function parseReps(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** RPE as typed (1–10, halves allowed), or null. */
export function parseRpe(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  if (text.trim() === '' || !Number.isFinite(value) || value < 1 || value > 10) return null;
  return Math.round(value * 2) / 2;
}

/** The weight in kg; blank means bodyweight (0). Null for text that isn't a number. */
export function parseWeightKg(entry: WeightEntry, unit: WeightUnit): number | null {
  const text = entry.text.trim().replace(',', '.');
  if (text === '') return 0;
  if (entry.exactKg !== undefined && entry.exactText === entry.text) return entry.exactKg;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return null;
  return entryToKg({ text }, unit);
}

/** Why a set can't be ticked, or null if it can. */
export function setInputError(set: DraftSet, unit: WeightUnit): string | null {
  if (parseWeightKg(set.weight, unit) === null) return 'Enter a weight (or leave it blank for bodyweight).';
  const reps = parseReps(set.reps);
  if (reps === null || reps < 1) return 'Enter the reps (1 or more).';
  return null;
}

/** The set as stored, with its set number within the exercise. */
export function toLoggedSet(
  exercise: DraftExercise,
  set: DraftSet,
  setNumber: number,
  unit: WeightUnit,
  completedAt: string
): LoggedSet {
  return {
    exerciseId: exercise.exerciseId,
    setNumber,
    weight: parseWeightKg(set.weight, unit) ?? 0,
    reps: parseReps(set.reps) ?? 0,
    setType: set.setType,
    rpe: parseRpe(set.rpe),
    completedAt: set.completedAt ?? completedAt,
  };
}

/** Every ticked set in screen order, numbered per exercise (1, 2, … over ticked sets only). */
export function loggedSets(draft: WorkoutDraft, fallbackCompletedAt: string): LoggedSet[] {
  const result: LoggedSet[] = [];
  for (const exercise of draft.exercises) {
    let n = 0;
    for (const set of exercise.sets) {
      if (!set.done) continue;
      n += 1;
      result.push(toLoggedSet(exercise, set, n, draft.unit, fallbackCompletedAt));
    }
  }
  return result;
}

/** Sets that were added but not ticked (dropped on finish). */
export function untickedSetCount(draft: WorkoutDraft): number {
  return draft.exercises.reduce((n, ex) => n + ex.sets.filter((s) => !s.done).length, 0);
}

/** The draft with every weight text re-expressed in `unit`. */
export function convertDraft(draft: WorkoutDraft, unit: WeightUnit): WorkoutDraft {
  if (draft.unit === unit) return draft;
  return {
    ...draft,
    unit,
    exercises: draft.exercises.map((ex) => ({
      ...ex,
      sets: ex.sets.map((s) => ({ ...s, weight: convertEntry(s.weight, draft.unit, unit) })),
    })),
  };
}

/** Moves the item at `from` to `to` (clamped). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Reads a stored draft; tolerates missing fields, returns null if it isn't a draft at all. */
export function parseDraft(json: string | null): WorkoutDraft | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObj(raw) || raw.version !== 1 || !Array.isArray(raw.exercises)) return null;
  const unit: WeightUnit = raw.unit === 'lb' ? 'lb' : 'kg';
  const exercises: DraftExercise[] = [];
  for (const e of raw.exercises) {
    if (!isObj(e) || typeof e.exerciseId !== 'number') continue;
    const sets: DraftSet[] = [];
    for (const s of Array.isArray(e.sets) ? e.sets : []) {
      if (!isObj(s)) continue;
      const w = isObj(s.weight) ? s.weight : {};
      sets.push({
        key: str(s.key) || newSetKey(),
        setType: (SET_TYPES as readonly unknown[]).includes(s.setType) ? (s.setType as SetType) : 'working',
        weight: {
          text: str(w.text),
          exactKg: numOrNull(w.exactKg) ?? undefined,
          exactText: typeof w.exactText === 'string' ? w.exactText : undefined,
        },
        reps: str(s.reps),
        rpe: str(s.rpe),
        done: s.done === true,
        logId: numOrNull(s.logId),
        completedAt: typeof s.completedAt === 'string' ? s.completedAt : null,
      });
    }
    exercises.push({
      exerciseId: e.exerciseId,
      name: str(e.name, 'Exercise'),
      variation: str(e.variation),
      muscle: str(e.muscle),
      notes: str(e.notes),
      restSeconds: numOrNull(e.restSeconds),
      repMin: numOrNull(e.repMin),
      repMax: numOrNull(e.repMax),
      sets,
    });
  }
  const initial = Array.isArray(raw.initialExerciseIds) && raw.initialExerciseIds.every((n) => typeof n === 'number')
    ? (raw.initialExerciseIds as number[])
    : undefined;
  return { version: 1, unit, exercises, initialExerciseIds: initial };
}

/** True when the workout's exercises (membership or order) differ from the routine's. */
export function exerciseListChanged(routineExerciseIds: readonly number[], draft: WorkoutDraft): boolean {
  const ids = draft.exercises.map((e) => e.exerciseId);
  return ids.length !== routineExerciseIds.length || ids.some((id, i) => id !== routineExerciseIds[i]);
}

/**
 * Whether to offer "Update routine?" on finish: only when the exercise list was
 * changed during this workout and now differs from the routine. (Repeating a
 * partial workout is not a change.)
 */
export function shouldOfferRoutineUpdate(routineExerciseIds: readonly number[], draft: WorkoutDraft): boolean {
  const ids = draft.exercises.map((e) => e.exerciseId);
  const initial = draft.initialExerciseIds ?? routineExerciseIds;
  const same = (a: readonly number[]) => a.length === ids.length && a.every((id, i) => id === ids[i]);
  return !same(initial) && !same(routineExerciseIds);
}
