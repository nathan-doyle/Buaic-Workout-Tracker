/**
 * Editing a past workout on screen: the session as text fields (in the shown unit)
 * and back to a validated `SessionEdit` for `db/history.ts`. Weights keep their
 * exact kg while the text is untouched (`WeightEntry`), so opening and saving
 * without changes rewrites nothing.
 */
import type { SessionDetail, SessionEdit } from '../db/history';
import { isLocalDateString } from './dates';
import { type WeightEntry, type WeightUnit, entryFromKg } from './units';
import { type SetType, newSetKey, parseReps, parseRpe, parseWeightKg } from './workoutDraft';

export interface EditSetDraft {
  key: string;
  id?: number;
  weight: WeightEntry;
  reps: string;
  setType: SetType;
  rpe: string;
}

export interface EditExerciseDraft {
  exerciseId: number;
  name: string;
  variation: string;
  equipment: string | null;
  notes: string;
  sets: EditSetDraft[];
}

export interface SessionEditDraft {
  name: string;
  notes: string;
  localDate: string;
  exercises: EditExerciseDraft[];
}

export function draftFromDetail(detail: SessionDetail, unit: WeightUnit): SessionEditDraft {
  return {
    name: detail.name,
    notes: detail.notes ?? '',
    localDate: detail.localDate ?? '',
    exercises: detail.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      name: e.name,
      variation: e.variation,
      equipment: e.equipment,
      notes: e.notes ?? '',
      sets: e.sets.map((s) => ({
        key: newSetKey(),
        id: s.id,
        weight: s.weight > 0 ? entryFromKg(s.weight, unit) : { text: '', exactKg: 0, exactText: '' },
        reps: String(s.reps),
        setType: s.setType,
        rpe: s.rpe === null ? '' : String(s.rpe),
      })),
    })),
  };
}

/** A new set for an exercise, copying the last set's values (unticked sets don't exist here). */
export function addSetTo(exercise: EditExerciseDraft): EditExerciseDraft {
  const last = exercise.sets[exercise.sets.length - 1];
  const set: EditSetDraft = last
    ? { key: newSetKey(), weight: { ...last.weight }, reps: last.reps, setType: last.setType === 'warmup' ? 'working' : last.setType, rpe: '' }
    : { key: newSetKey(), weight: { text: '' }, reps: '', setType: 'working', rpe: '' };
  return { ...exercise, sets: [...exercise.sets, set] };
}

export type EditResult = { ok: true; edit: SessionEdit } | { ok: false; error: string };

/** The draft as a `SessionEdit`, or the first problem found (named by exercise and set). */
export function editFromDraft(draft: SessionEditDraft, unit: WeightUnit, today: string): EditResult {
  if (draft.name.trim() === '') return { ok: false, error: 'Give the workout a name.' };
  if (!isLocalDateString(draft.localDate)) return { ok: false, error: 'Enter the date as YYYY-MM-DD.' };
  if (draft.localDate > today) return { ok: false, error: "The date can't be in the future." };
  const exercises: SessionEdit['exercises'] = [];
  for (const e of draft.exercises) {
    const sets: SessionEdit['exercises'][number]['sets'] = [];
    for (const [i, s] of e.sets.entries()) {
      const where = `${e.name}, set ${i + 1}`;
      const weight = parseWeightKg(s.weight, unit);
      if (weight === null) return { ok: false, error: `${where}: enter a weight (or leave it blank for bodyweight).` };
      const reps = parseReps(s.reps);
      if (reps === null || reps < 1) return { ok: false, error: `${where}: enter the reps (1 or more).` };
      const rpe = s.rpe.trim() === '' ? null : parseRpe(s.rpe);
      if (s.rpe.trim() !== '' && rpe === null) return { ok: false, error: `${where}: RPE is 1–10.` };
      sets.push({ ...(s.id !== undefined ? { id: s.id } : {}), weight, reps, setType: s.setType, rpe });
    }
    exercises.push({ exerciseId: e.exerciseId, notes: e.notes, sets });
  }
  if (!exercises.some((e) => e.sets.length > 0)) return { ok: false, error: 'A workout needs at least one set. Delete the workout instead.' };
  return { ok: true, edit: { name: draft.name, notes: draft.notes, localDate: draft.localDate, exercises } };
}
