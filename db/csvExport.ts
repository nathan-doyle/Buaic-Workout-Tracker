/**
 * CSV export (Phase 6): every set of every completed workout, one row per set, for
 * spreadsheets. A workout in progress is never included.
 *
 * Rows come in date order: the workout's local date, then its start, then the
 * exercise order of that workout, then set number (the same order History and the
 * workout view use). Weights are written twice: the stored kg (exact to 15
 * significant digits, which is what spreadsheets keep) and the weight in the user's
 * unit rounded as the app shows it. Bodyweight sets are 0 in both, so columns
 * still sum. See V2_PROGRESS.md → Decisions (Phase 6).
 */
import { type CsvValue, toCsv } from '../lib/csv';
import { localTimeString } from '../lib/dates';
import { displayWeight, type WeightUnit } from '../lib/units';
import type { DbAdapter } from './adapter';

export interface ExportSetRow {
  sessionId: number;
  localDate: string | null;
  startedAt: string | null;
  dateCompleted: string;
  tzOffsetMinutes: number | null;
  workoutName: string;
  routineName: string | null;
  workoutNotes: string | null;
  exerciseName: string;
  variation: string;
  primaryMuscle: string;
  setNumber: number;
  setType: string;
  weightKg: number;
  reps: number;
  rpe: number | null;
  exerciseNotes: string | null;
}

/** Completed sets in export order. */
export function listExportSets(db: DbAdapter): ExportSetRow[] {
  return db.all<ExportSetRow>(
    `SELECT s.id AS sessionId, s.local_date AS localDate, s.started_at AS startedAt,
            s.date_completed AS dateCompleted, s.tz_offset_minutes AS tzOffsetMinutes,
            s.split_name AS workoutName, r.name AS routineName, s.notes AS workoutNotes,
            e.name AS exerciseName, e.variation, e.primary_muscle AS primaryMuscle,
            l.set_number AS setNumber, l.set_type AS setType, l.weight AS weightKg, l.reps, l.rpe,
            se.notes AS exerciseNotes
     FROM set_logs l
     JOIN workout_sessions s ON s.id = l.session_id
     JOIN exercises e ON e.id = l.exercise_id
     LEFT JOIN routines r ON r.id = s.routine_id
     LEFT JOIN session_exercises se ON se.session_id = l.session_id AND se.exercise_id = l.exercise_id
     WHERE s.status = 'completed'
     ORDER BY s.local_date, COALESCE(s.started_at, s.date_completed), s.id,
              COALESCE(se.position, 1000000), e.primary_muscle, e.name, l.set_number, l.id`
  );
}

const SET_TYPE_NAMES: Record<string, string> = { warmup: 'Warm-up', working: 'Working', drop: 'Drop', failure: 'Failure' };

/** Column titles; the second weight column is in the user's unit. */
export function setsCsvHeader(unit: WeightUnit): string[] {
  return [
    'Date',
    'Start time',
    'Workout',
    'Routine',
    'Exercise',
    'Variation',
    'Primary muscle',
    'Set',
    'Set type',
    'Weight (kg exact)',
    `Weight (${unit})`,
    'Reps',
    'RPE',
    'Workout notes',
    'Exercise notes',
  ];
}

/** Stored kg without binary floating-point noise (61.234969949999996 → 61.23496995). */
export function exactKg(kg: number): number {
  if (!Number.isFinite(kg)) return 0;
  const value = Number(kg.toPrecision(15));
  return value === 0 ? 0 : value;
}

/** One set as CSV values, in `setsCsvHeader` order. */
export function exportSetValues(row: ExportSetRow, unit: WeightUnit): CsvValue[] {
  const started = row.startedAt ?? row.dateCompleted;
  const startMs = Date.parse(started);
  const time = Number.isFinite(startMs) ? localTimeString(new Date(startMs), row.tzOffsetMinutes ?? 0) : '';
  const weightKg = Math.max(0, row.weightKg);
  return [
    row.localDate,
    time,
    row.workoutName,
    row.routineName,
    row.exerciseName,
    row.variation,
    row.primaryMuscle,
    row.setNumber,
    SET_TYPE_NAMES[row.setType] ?? row.setType,
    exactKg(weightKg),
    displayWeight(weightKg, unit),
    row.reps,
    row.rpe,
    row.workoutNotes?.trim() || null,
    row.exerciseNotes?.trim() || null,
  ];
}

export interface SetsCsv {
  text: string;
  setCount: number;
  workoutCount: number;
}

/** The whole export: UTF-8 BOM, header, one row per completed set. */
export function buildSetsCsv(db: DbAdapter, unit: WeightUnit): SetsCsv {
  const rows = listExportSets(db);
  return {
    text: toCsv(
      setsCsvHeader(unit),
      rows.map((row) => exportSetValues(row, unit)),
      { bom: true }
    ),
    setCount: rows.length,
    workoutCount: new Set(rows.map((r) => r.sessionId)).size,
  };
}
