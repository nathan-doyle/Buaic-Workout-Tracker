/**
 * CSV export (Phase 6) on node:sqlite: one row per completed set, in date order,
 * exact kg plus the display unit, quoting, bodyweight, warm-ups, and no workout in
 * progress.
 */
import { parseCsv, UTF8_BOM } from '../../lib/csv';
import { lbToKg } from '../../lib/units';
import { buildSetsCsv, exactKg, listExportSets, setsCsvHeader } from '../csvExport';
import type { NodeDb } from '../testing/nodeSqliteAdapter';
import { createFreshV2Database, exerciseIdByName, logCompletedWorkout } from '../testing/v2Fixture';
import { logSet, startWorkout } from '../workouts';

let db: NodeDb;
let cleanup: () => void;
let bench: number;
let squat: number;
let pushUp: number;

beforeEach(() => {
  ({ db, cleanup } = createFreshV2Database());
  bench = exerciseIdByName(db, 'Bench Press');
  squat = exerciseIdByName(db, 'Squat');
  db.run(`INSERT INTO exercises (name, variation, primary_muscle, equipment, created_at) VALUES (?, '', ?, ?, ?)`, [
    'Push-Up',
    'Lower Chest',
    'Bodyweight',
    '2026-01-01T00:00:00Z',
  ]);
  pushUp = exerciseIdByName(db, 'Push-Up');
});
afterEach(() => cleanup());

/** The export read back as objects keyed by column title. */
function exportRows(unit: 'kg' | 'lb' = 'kg') {
  const csv = buildSetsCsv(db, unit);
  const [header, ...rows] = parseCsv(csv.text);
  expect(header).toEqual(setsCsvHeader(unit));
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

function routineId(name: string): number {
  return db.get<{ id: number }>('SELECT id FROM routines WHERE name = ?', [name])!.id;
}

describe('CSV export', () => {
  it('an empty database gives the header only (with BOM and CRLF)', () => {
    const csv = buildSetsCsv(db, 'kg');
    expect(csv.setCount).toBe(0);
    expect(csv.workoutCount).toBe(0);
    expect(csv.text.startsWith(UTF8_BOM)).toBe(true);
    expect(csv.text).toBe(`${UTF8_BOM}${setsCsvHeader('kg').join(',')}\r\n`);
  });

  it('writes one row per set with every column', () => {
    const id = logCompletedWorkout(db, {
      name: 'Push',
      routineId: routineId('Push'),
      startIso: '2026-11-02T17:00:00Z',
      endIso: '2026-11-02T18:05:00Z',
      sets: [
        { exerciseId: bench, weight: 40, reps: 10, setType: 'warmup' },
        { exerciseId: bench, weight: 100, reps: 5, rpe: 8.5 },
        { exerciseId: bench, weight: 90, reps: 8, setType: 'drop' },
        { exerciseId: bench, weight: 80, reps: 9, setType: 'failure' },
      ],
    });
    db.run('UPDATE workout_sessions SET notes = ? WHERE id = ?', ['Good day', id]);
    db.run('UPDATE session_exercises SET notes = ? WHERE session_id = ?', ['Pause reps', id]);

    const rows = exportRows('kg');
    expect(rows).toHaveLength(4);
    expect(rows[1]).toEqual({
      Date: '2026-11-02',
      'Start time': '18:00', // 17:00 UTC in UTC+1
      Workout: 'Push',
      Routine: 'Push',
      Exercise: 'Bench Press',
      Variation: 'Barbell',
      'Primary muscle': expect.any(String),
      Set: '2',
      'Set type': 'Working',
      'Weight (kg exact)': '100',
      'Weight (kg)': '100',
      Reps: '5',
      RPE: '8.5',
      'Workout notes': 'Good day',
      'Exercise notes': 'Pause reps',
    });
    expect(rows.map((r) => r['Set type'])).toEqual(['Warm-up', 'Working', 'Drop', 'Failure']);
    expect(rows.map((r) => r.Set)).toEqual(['1', '2', '3', '4']);
    expect(rows[0].RPE).toBe('');
  });

  it('keeps lb-entered weights exact in kg and shows them in lb as the app does', () => {
    logCompletedWorkout(db, {
      name: 'Push',
      startIso: '2026-11-02T17:00:00Z',
      endIso: '2026-11-02T18:00:00Z',
      sets: [
        { exerciseId: bench, weight: lbToKg(135), reps: 10 },
        { exerciseId: bench, weight: lbToKg(225), reps: 5 },
        { exerciseId: bench, weight: lbToKg(137.5), reps: 3 },
      ],
    });
    const lb = exportRows('lb');
    expect(lb.map((r) => r['Weight (lb)'])).toEqual(['135', '225', '137.5']);
    expect(lb.map((r) => r['Weight (kg exact)'])).toEqual(['61.23496995', '102.05828325', '62.368950875']);
    // The exact column converts back to the entered pounds.
    for (const [i, entered] of [135, 225, 137.5].entries()) {
      expect(Number(lb[i]['Weight (kg exact)']) / 0.45359237).toBeCloseTo(entered, 9);
    }
    // In kg the second column is rounded to 0.25 like the app.
    const kg = exportRows('kg');
    expect(kg.map((r) => r['Weight (kg)'])).toEqual(['61.25', '102', '62.25']);
  });

  it('drops binary floating-point noise but nothing else', () => {
    expect(exactKg(135 * 0.45359237)).toBe(61.23496995);
    expect(exactKg(0.1 + 0.2)).toBe(0.3);
    expect(exactKg(61.25)).toBe(61.25);
    expect(exactKg(-0)).toBe(0);
  });

  it('writes bodyweight sets as 0 so columns still sum, and added load as its weight', () => {
    logCompletedWorkout(db, {
      name: 'Calisthenics',
      startIso: '2026-11-03T08:00:00Z',
      endIso: '2026-11-03T08:30:00Z',
      sets: [
        { exerciseId: pushUp, weight: 0, reps: 20 },
        { exerciseId: pushUp, weight: 10, reps: 12 },
      ],
    });
    const rows = exportRows('lb');
    expect(rows.map((r) => [r['Weight (kg exact)'], r['Weight (lb)'], r.Reps])).toEqual([
      ['0', '0', '20'],
      ['10', '22', '12'],
    ]);
    expect(rows[0].Routine).toBe('');
  });

  it('orders by local date, start, exercise order in the workout, then set', () => {
    // Logged out of order: the later workout first.
    logCompletedWorkout(db, {
      name: 'Later',
      startIso: '2026-11-05T17:00:00Z',
      endIso: '2026-11-05T18:00:00Z',
      sets: [{ exerciseId: bench, weight: 100, reps: 5 }],
    });
    logCompletedWorkout(db, {
      name: 'Earlier',
      startIso: '2026-11-02T17:00:00Z',
      endIso: '2026-11-02T18:00:00Z',
      sets: [
        { exerciseId: squat, weight: 120, reps: 5 },
        { exerciseId: squat, weight: 125, reps: 5 },
        { exerciseId: bench, weight: 90, reps: 5 },
      ],
    });
    // Same day, two workouts: the earlier start comes first.
    logCompletedWorkout(db, {
      name: 'Evening',
      startIso: '2026-11-05T19:00:00Z',
      endIso: '2026-11-05T19:30:00Z',
      sets: [{ exerciseId: squat, weight: 60, reps: 5 }],
    });
    logCompletedWorkout(db, {
      name: 'Morning',
      startIso: '2026-11-05T06:00:00Z',
      endIso: '2026-11-05T07:00:00Z',
      sets: [{ exerciseId: squat, weight: 50, reps: 5 }],
    });
    const rows = exportRows('kg');
    expect(rows.map((r) => `${r.Date} ${r.Workout} ${r.Exercise} ${r.Set}`)).toEqual([
      '2026-11-02 Earlier Squat 1',
      '2026-11-02 Earlier Squat 2',
      '2026-11-02 Earlier Bench Press 1',
      '2026-11-05 Morning Squat 1',
      '2026-11-05 Later Bench Press 1',
      '2026-11-05 Evening Squat 1',
    ]);
    expect(buildSetsCsv(db, 'kg').workoutCount).toBe(4);
  });

  it('uses the local date and time of the zone the workout was logged in', () => {
    // 23:30 UTC on 2 Nov is 00:30 on 3 Nov in UTC+1.
    logCompletedWorkout(db, {
      name: 'Late',
      startIso: '2026-11-02T23:30:00Z',
      endIso: '2026-11-03T00:30:00Z',
      tzOffsetMinutes: 60,
      sets: [{ exerciseId: bench, weight: 60, reps: 5 }],
    });
    // 03:00 UTC on 2 Nov is 22:00 on 1 Nov in UTC-5.
    logCompletedWorkout(db, {
      name: 'Travel',
      startIso: '2026-11-02T03:00:00Z',
      endIso: '2026-11-02T04:00:00Z',
      tzOffsetMinutes: -300,
      sets: [{ exerciseId: bench, weight: 60, reps: 5 }],
    });
    const rows = exportRows('kg');
    expect(rows.map((r) => [r.Workout, r.Date, r['Start time']])).toEqual([
      ['Travel', '2026-11-01', '22:00'],
      ['Late', '2026-11-03', '00:30'],
    ]);
  });

  it('quotes commas, quotes and line breaks in names and notes', () => {
    const now = '2026-11-01T00:00:00Z';
    db.run(`INSERT INTO exercises (name, variation, primary_muscle, created_at) VALUES (?, ?, ?, ?)`, [
      'Curl, "hammer"',
      'Rope, cable',
      'Biceps',
      now,
    ]);
    const curl = exerciseIdByName(db, 'Curl, "hammer"');
    const id = logCompletedWorkout(db, {
      name: 'Arms, day "A"',
      startIso: '2026-11-02T17:00:00Z',
      endIso: '2026-11-02T18:00:00Z',
      sets: [{ exerciseId: curl, weight: 14, reps: 12 }],
    });
    db.run('UPDATE workout_sessions SET notes = ? WHERE id = ?', ['Line one\nLine two, "quoted"', id]);
    db.run('UPDATE session_exercises SET notes = ? WHERE session_id = ?', ['-1 rep next time', id]);

    const csv = buildSetsCsv(db, 'kg');
    expect(csv.text).toContain('"Arms, day ""A"""');
    expect(csv.text).toContain('"Line one\nLine two, ""quoted"""');
    const [row] = exportRows('kg');
    expect(row.Workout).toBe('Arms, day "A"');
    expect(row.Exercise).toBe('Curl, "hammer"');
    expect(row.Variation).toBe('Rope, cable');
    expect(row['Workout notes']).toBe('Line one\nLine two, "quoted"');
    expect(row['Exercise notes']).toBe("'-1 rep next time"); // stays text in a spreadsheet
  });

  it('leaves out a workout in progress, even its ticked sets', () => {
    logCompletedWorkout(db, {
      name: 'Done',
      startIso: '2026-11-02T17:00:00Z',
      endIso: '2026-11-02T18:00:00Z',
      sets: [{ exerciseId: bench, weight: 100, reps: 5 }],
    });
    const open = startWorkout(db, { name: 'Open', routineId: null, draftJson: '{}' }, { now: new Date('2026-11-06T10:00:00Z'), tzOffsetMinutes: 60 });
    logSet(db, open, { exerciseId: squat, setNumber: 1, weight: 200, reps: 1, setType: 'working', rpe: null, completedAt: '2026-11-06T10:01:00Z' }, 0);

    expect(listExportSets(db)).toHaveLength(1);
    const rows = exportRows('kg');
    expect(rows.map((r) => r.Workout)).toEqual(['Done']);
    expect(buildSetsCsv(db, 'kg').workoutCount).toBe(1);
  });

  it('keeps sets of an archived exercise and a deleted routine', () => {
    const push = routineId('Push');
    logCompletedWorkout(db, {
      name: 'Push',
      routineId: push,
      startIso: '2026-11-02T17:00:00Z',
      endIso: '2026-11-02T18:00:00Z',
      sets: [{ exerciseId: bench, weight: 100, reps: 5 }],
    });
    db.run('UPDATE exercises SET archived_at = ? WHERE id = ?', ['2026-11-03T00:00:00Z', bench]);
    db.run('DELETE FROM routines WHERE id = ?', [push]);
    const [row] = exportRows('kg');
    expect(row.Exercise).toBe('Bench Press');
    expect(row.Workout).toBe('Push');
    expect(row.Routine).toBe('');
  });
});
