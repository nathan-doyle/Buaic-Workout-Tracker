import { addMonths, monthOf } from '../dates';
import {
  coverageLevel,
  coverageWindow,
  exerciseSessionPoints,
  isBig3,
  monthTotals,
  muscleSetCounts,
  nextRoutineId,
  parseMuscleList,
  percentChange,
  pointsInRange,
  rangeStart,
  repMaxTable,
  weekComparison,
  weeklyStreak,
} from '../stats';

describe('addMonths / monthOf', () => {
  it('moves by calendar months and clamps the day', () => {
    expect(addMonths('2026-11-14', -1)).toBe('2026-10-14');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
    expect(addMonths('2026-01-15', -12)).toBe('2025-01-15');
    expect(addMonths('2026-12-31', 2)).toBe('2027-02-28');
    expect(monthOf('2026-11-14')).toBe('2026-11');
  });
});

describe('weeks and streak', () => {
  const s = (localDate: string, setCount = 10, volumeKg = 1000) => ({ localDate, setCount, volumeKg });

  it('compares this week so far with all of last week (Monday start)', () => {
    // 2026-11-14 is a Saturday.
    const sessions = [s('2026-11-02'), s('2026-11-08', 5, 500), s('2026-11-09'), s('2026-11-14', 12, 1500), s('2026-11-15')];
    const c = weekComparison(sessions, '2026-11-14', 'monday');
    expect(c.thisWeekStart).toBe('2026-11-09');
    expect(c.thisWeek).toEqual({ workouts: 2, sets: 22, volumeKg: 2500 });
    expect(c.lastWeek).toEqual({ workouts: 2, sets: 15, volumeKg: 1500 });
  });

  it('follows a Sunday week start', () => {
    const c = weekComparison([s('2026-11-08'), s('2026-11-07')], '2026-11-14', 'sunday');
    expect(c.thisWeekStart).toBe('2026-11-08');
    expect(c.thisWeek.workouts).toBe(1);
    expect(c.lastWeek.workouts).toBe(1);
  });

  it('counts consecutive weeks; an empty current week does not break it yet', () => {
    const dates = ['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-04'];
    expect(weeklyStreak(dates, '2026-11-14', 'monday')).toBe(3); // weeks of 19 Oct, 26 Oct, 2 Nov
    expect(weeklyStreak([...dates, '2026-11-10'], '2026-11-14', 'monday')).toBe(4);
    expect(weeklyStreak(['2026-10-20'], '2026-11-14', 'monday')).toBe(0); // gap of a full week
    expect(weeklyStreak([], '2026-11-14', 'monday')).toBe(0);
  });

  it('monthly totals and percent change', () => {
    expect(monthTotals([s('2026-10-31'), s('2026-11-01', 3, 300), s('2026-11-30', 4, 400)], '2026-11')).toEqual({
      workouts: 2,
      sets: 7,
      volumeKg: 700,
    });
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(5, 0)).toBeNull();
  });
});

describe('exercise charts', () => {
  const row = (sessionId: number, localDate: string, weight: number, reps: number, setType = 'working') => ({
    sessionId,
    localDate,
    weight,
    reps,
    setType,
  });

  it('one point per session: best e1RM, top weight, working volume', () => {
    const points = exerciseSessionPoints([
      row(1, '2026-09-01', 40, 10, 'warmup'),
      row(1, '2026-09-01', 100, 5),
      row(1, '2026-09-01', 90, 8),
      row(2, '2026-10-01', 100, 15),
      row(3, '2026-11-01', 0, 12),
    ]);
    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ sessionId: 1, topWeight: 100, volumeKg: 500 + 720 });
    expect(points[0].e1rm).toBeCloseTo(116.67, 2); // 100 × 5 (90 × 8 = 114)
    expect(points[1]).toMatchObject({ e1rm: null, topWeight: 100, volumeKg: 1500 }); // 15 reps: no estimate
    expect(points[2]).toMatchObject({ e1rm: null, topWeight: null, volumeKg: 0 }); // bodyweight
  });

  it('ranges cut by calendar months', () => {
    expect(rangeStart('1M', '2026-11-14')).toBe('2026-10-14');
    expect(rangeStart('3M', '2026-11-14')).toBe('2026-08-14');
    expect(rangeStart('1Y', '2026-11-14')).toBe('2025-11-14');
    expect(rangeStart('ALL', '2026-11-14')).toBeNull();
    const pts = ['2025-01-01', '2026-08-20', '2026-10-13', '2026-10-14', '2026-11-14'].map((localDate) => ({ localDate }));
    expect(pointsInRange(pts, '1M', '2026-11-14').map((p) => p.localDate)).toEqual(['2026-10-14', '2026-11-14']);
    expect(pointsInRange(pts, 'ALL', '2026-11-14')).toHaveLength(5);
  });

  it('rep-max table: heaviest for at least N reps, first date it was lifted', () => {
    const table = repMaxTable([
      row(1, '2026-09-01', 100, 6),
      row(2, '2026-10-01', 110, 1),
      row(3, '2026-11-01', 100, 8),
      row(3, '2026-11-01', 120, 3, 'warmup'),
      row(4, '2026-11-02', 0, 20),
    ]);
    expect(table.map((r) => [r.target, r.weight, r.reps, r.localDate])).toEqual([
      [1, 110, 1, '2026-10-01'],
      [3, 100, 6, '2026-09-01'],
      [5, 100, 6, '2026-09-01'],
      [8, 100, 8, '2026-11-01'],
      [10, null, null, null],
    ]);
  });
});

describe('coverage', () => {
  it('primary sets count 1, secondary 0.5', () => {
    const counts = muscleSetCounts([
      { primaryMuscle: 'Upper Chest', secondaryMuscles: ['Triceps', 'Front Delts'] },
      { primaryMuscle: 'Upper Chest', secondaryMuscles: ['Triceps'] },
      { primaryMuscle: 'Triceps', secondaryMuscles: ['Triceps'] },
    ]);
    expect(counts).toEqual({ 'Upper Chest': 2, Triceps: 2, 'Front Delts': 0.5 });
  });

  it('bands 0 · 1–4 · 5–9 · 10–20 · 20+', () => {
    expect([0, 0.5, 4.5, 5, 9.5, 10, 20, 20.5, 30].map(coverageLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('rolling 7 days or the calendar week', () => {
    expect(coverageWindow('rolling', '2026-11-14', 'monday')).toEqual({ from: '2026-11-08', to: '2026-11-14' });
    expect(coverageWindow('week', '2026-11-14', 'monday')).toEqual({ from: '2026-11-09', to: '2026-11-14' });
    expect(coverageWindow('week', '2026-11-14', 'sunday')).toEqual({ from: '2026-11-08', to: '2026-11-14' });
  });

  it('parses secondary muscle JSON defensively', () => {
    expect(parseMuscleList('["Triceps", 3, "Lats"]')).toEqual(['Triceps', 'Lats']);
    expect(parseMuscleList('not json')).toEqual([]);
    expect(parseMuscleList(null)).toEqual([]);
  });
});

describe('Big 3 and next routine', () => {
  it('Big 3 = barbell bench, back squat, conventional/sumo deadlift (name + variation)', () => {
    const yes: [string, string][] = [
      ['Bench Press', 'Barbell'], ['Squat', 'Barbell'], ['Deadlift', 'Conventional'], ['Deadlift', 'Sumo'],
      // V1 exercises without a variation, any casing / spacing
      ['bench press', ''], [' SQUAT ', ''], ['Deadlift', ''],
      // whole-name customs
      ['Back Squat', ''], ['Barbell Bench Press', ''], ['Sumo Deadlift', 'Barbell'],
    ];
    const no: [string, string][] = [
      ['Romanian Deadlift', 'Barbell'], ['Deadlift', 'Trap Bar'], ['Front Squat', 'Barbell'], ['Hack Squat', 'Machine'],
      ['Goblet Squat', 'Dumbbell'], ['Bulgarian Split Squat', 'Dumbbell'], ['Squat', 'Smith Machine'],
      ['Incline Bench Press', 'Barbell'], ['Close-Grip Bench Press', 'Barbell'], ['Bench Press', 'Dumbbell'],
      ['Bench Press', 'Smith Machine'], ['Overhead Press', 'Barbell'], ['Back Squat', 'Smith Machine'],
    ];
    expect(yes.filter(([n, v]) => !isBig3(n, v))).toEqual([]);
    expect(no.filter(([n, v]) => isBig3(n, v))).toEqual([]);
  });

  it('next routine wraps round; unknown or none → first', () => {
    expect(nextRoutineId([3, 1, 2], 1)).toBe(2);
    expect(nextRoutineId([3, 1, 2], 2)).toBe(3);
    expect(nextRoutineId([3, 1, 2], null)).toBe(3);
    expect(nextRoutineId([3, 1, 2], 99)).toBe(3);
    expect(nextRoutineId([], 1)).toBeNull();
  });
});

describe('formatDuration', () => {
  it('minutes, then hours and minutes', () => {
    const { formatDuration } = jest.requireActual('../stats') as typeof import('../stats');
    expect([20, 48 * 60, 3900, 7200].map(formatDuration)).toEqual(['1 min', '48 min', '1 h 05 min', '2 h 00 min']);
  });
});
