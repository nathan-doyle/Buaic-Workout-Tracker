/**
 * Home-screen widget content (Phase 7): week totals and day marks by Settings'
 * week start, the weekly streak, the next routine / workout in progress, the deep
 * link, and the tap plan.
 */
import { lbToKg } from '../units';
import {
  buildWidgetContent,
  buildWidgetTimeline,
  parseWidgetLink,
  planWidgetLink,
  weekRangeLabel,
  type WidgetInput,
  widgetUrl,
} from '../widgetSnapshot';

// 2026-11-14 is a Saturday.
const TODAY = '2026-11-14';
const ROUTINES = [
  { id: 4, name: 'Push', exerciseCount: 3 },
  { id: 7, name: 'Pull', exerciseCount: 1 },
  { id: 9, name: 'Legs', exerciseCount: 5 },
];

function input(overrides: Partial<WidgetInput> = {}): WidgetInput {
  return {
    today: TODAY,
    weekStart: 'monday',
    unit: 'kg',
    sessions: [
      { localDate: '2026-10-26', setCount: 3, volumeKg: 900 }, // Mon, two weeks back
      { localDate: '2026-11-02', setCount: 2, volumeKg: 500 }, // Mon, last week
      { localDate: '2026-11-08', setCount: 4, volumeKg: 1000 }, // Sun (last week from Monday, this week from Sunday)
      { localDate: '2026-11-10', setCount: 5, volumeKg: 1200.5 }, // Tue
      { localDate: '2026-11-10', setCount: 1, volumeKg: 100 }, // Tue, second workout
      { localDate: '2026-11-14', setCount: 2, volumeKg: 300 }, // Sat (today)
    ],
    routines: ROUTINES,
    lastRoutineId: 4,
    openWorkout: null,
    ...overrides,
  };
}

describe('weekRangeLabel', () => {
  it('names the days and the month', () => {
    expect(weekRangeLabel('2026-11-09')).toBe('9–15 NOV');
  });
  it('names both months when the week spans two', () => {
    expect(weekRangeLabel('2026-10-26')).toBe('26 OCT – 1 NOV');
    expect(weekRangeLabel('2026-12-28')).toBe('28 DEC – 3 JAN');
  });
});

describe('buildWidgetContent', () => {
  it('counts this week from Monday: workouts, sets, volume and day marks', () => {
    const c = buildWidgetContent(input());
    expect(c.weekLabel).toBe('THIS WEEK · 9–15 NOV');
    expect(c.workouts).toBe(3);
    expect(c.workoutsUnit).toBe('workouts');
    expect(c.weekDetail).toBe('8 sets · 1601 kg');
    expect(c.dayLetters).toBe('MTWTFSS');
    expect(c.trainedDays).toBe('0100010');
    expect(c.asOf).toBe(TODAY);
  });

  it('follows a Sunday week start', () => {
    const c = buildWidgetContent(input({ weekStart: 'sunday' }));
    expect(c.weekLabel).toBe('THIS WEEK · 8–14 NOV');
    expect(c.workouts).toBe(4);
    expect(c.weekDetail).toBe('12 sets · 2601 kg');
    expect(c.dayLetters).toBe('SMTWTFS');
    expect(c.trainedDays).toBe('1010001');
  });

  it('shows volume in pounds without touching the counts', () => {
    const c = buildWidgetContent(input({ unit: 'lb', sessions: [{ localDate: TODAY, setCount: 1, volumeKg: lbToKg(225 * 5) }] }));
    expect(c.weekDetail).toBe('1 set · 1125 lb');
    expect(c.workouts).toBe(1);
    expect(c.workoutsUnit).toBe('workout');
  });

  it('counts the weekly streak as Progress does', () => {
    expect(buildWidgetContent(input()).streak).toBe(3);
    expect(buildWidgetContent(input()).streakLabel).toBe('3-week streak');
    expect(buildWidgetContent(input({ weekStart: 'sunday' })).streak).toBe(3);
    // Nothing this week yet: last week's streak still stands.
    const lastWeekOnly = input({ sessions: [{ localDate: '2026-11-03', setCount: 1, volumeKg: 50 }] });
    expect(buildWidgetContent(lastWeekOnly).streakLabel).toBe('1-week streak');
  });

  it('ignores workouts dated after today', () => {
    const c = buildWidgetContent(input({ sessions: [{ localDate: '2026-11-15', setCount: 3, volumeKg: 100 }] }));
    expect(c.workouts).toBe(0);
    expect(c.trainedDays).toBe('0000000');
    expect(c.streak).toBe(0);
  });

  it('describes an empty week and no streak kindly', () => {
    const c = buildWidgetContent(input({ sessions: [] }));
    expect(c.workouts).toBe(0);
    expect(c.weekDetail).toBe('No workouts yet');
    expect(c.streakLabel).toBe('No streak yet');
    expect(c.accessibilityLabel).toContain('No workouts yet this week');
  });

  it('offers the routine after the last one trained, wrapping round', () => {
    const c = buildWidgetContent(input());
    expect(c).toMatchObject({ action: 'start', nextLabel: 'NEXT', nextName: 'Pull', nextDetail: '1 exercise', actionLabel: 'START' });
    expect(c.url).toBe('buaic://widget?action=start&routine=7');
    expect(buildWidgetContent(input({ lastRoutineId: 9 })).nextName).toBe('Push');
    // Last routine archived or never trained: the first one.
    expect(buildWidgetContent(input({ lastRoutineId: 99 })).nextName).toBe('Push');
    expect(buildWidgetContent(input({ lastRoutineId: null })).nextDetail).toBe('3 exercises');
  });

  it('resumes the workout in progress instead', () => {
    const c = buildWidgetContent(input({ openWorkout: { name: 'Push Day 5' } }));
    expect(c).toMatchObject({ action: 'resume', nextLabel: 'IN PROGRESS', nextName: 'Push Day 5', actionLabel: 'RESUME' });
    expect(c.url).toBe('buaic://widget?action=resume');
    expect(c.accessibilityLabel).toContain('Workout in progress: Push Day 5. Double-tap to resume.');
  });

  it('points to the routines screen when there are none', () => {
    const c = buildWidgetContent(input({ routines: [] }));
    expect(c).toMatchObject({ action: 'routines', nextName: 'Create a routine', actionLabel: 'OPEN' });
    expect(c.url).toBe('buaic://widget?action=routines');
  });

  it('reads as one sentence for screen readers', () => {
    expect(buildWidgetContent(input()).accessibilityLabel).toBe(
      'Buaic. 3 workouts this week, 8 sets · 1601 kg. 3-week streak. Next workout: Pull. Double-tap to start it.'
    );
  });

  it('holds only strings and numbers (the widget gets JSON)', () => {
    for (const value of Object.values(buildWidgetContent(input()))) {
      expect(['string', 'number']).toContain(typeof value);
    }
  });
});

describe('buildWidgetTimeline', () => {
  it('adds the next two week starts with the week reset and the streak re-counted', () => {
    const entries = buildWidgetTimeline(input());
    expect(entries.map((e) => e.localDate)).toEqual([TODAY, '2026-11-16', '2026-11-23']);
    expect(entries[0].content.workouts).toBe(3);
    expect(entries[1].content).toMatchObject({ workouts: 0, weekDetail: 'No workouts yet', trainedDays: '0000000', streak: 3 });
    expect(entries[1].content.weekLabel).toBe('THIS WEEK · 16–22 NOV');
    // The week of 16 Nov ended without a workout: the streak is over.
    expect(entries[2].content.streak).toBe(0);
    // The next routine doesn't depend on the date.
    expect(entries[2].content.nextName).toBe('Pull');
  });

  it('follows the week start', () => {
    expect(buildWidgetTimeline(input({ weekStart: 'sunday' })).map((e) => e.localDate)).toEqual([TODAY, '2026-11-15', '2026-11-22']);
  });
});

describe('widget links', () => {
  it('builds and parses the link', () => {
    expect(widgetUrl({ action: 'start', routineId: 12 })).toBe('buaic://widget?action=start&routine=12');
    expect(widgetUrl({ action: 'start', routineId: null })).toBe('buaic://widget?action=start');
    expect(parseWidgetLink({ action: 'start', routine: '12' })).toEqual({ action: 'start', routineId: 12 });
    expect(parseWidgetLink({ action: 'resume' })).toEqual({ action: 'resume', routineId: null });
    expect(parseWidgetLink({ action: 'start', routine: '1; DROP' })).toEqual({ action: 'start', routineId: null });
    expect(parseWidgetLink({ action: 'delete' })).toBeNull();
    expect(parseWidgetLink({})).toBeNull();
    expect(parseWidgetLink({ action: ['start'] })).toBeNull();
  });

  const state = { hasOpenWorkout: false, routineIds: [4, 7, 9], lastRoutineId: 4 };

  it('always resumes an open workout', () => {
    const open = { ...state, hasOpenWorkout: true };
    expect(planWidgetLink({ action: 'start', routineId: 7 }, open)).toEqual({ kind: 'resume' });
    expect(planWidgetLink({ action: 'routines', routineId: null }, open)).toEqual({ kind: 'resume' });
    expect(planWidgetLink(null, open)).toEqual({ kind: 'resume' });
  });

  it('starts the routine the widget showed while it is active', () => {
    expect(planWidgetLink({ action: 'start', routineId: 9 }, state)).toEqual({ kind: 'start', routineId: 9 });
  });

  it('falls back to the routine that is next now', () => {
    expect(planWidgetLink({ action: 'start', routineId: 99 }, state)).toEqual({ kind: 'start', routineId: 7 });
    expect(planWidgetLink({ action: 'start', routineId: null }, state)).toEqual({ kind: 'start', routineId: 7 });
    expect(planWidgetLink({ action: 'start', routineId: 4 }, { ...state, routineIds: [] })).toEqual({ kind: 'routines' });
  });

  it('opens routines, or the app, for the other links', () => {
    expect(planWidgetLink({ action: 'routines', routineId: null }, state)).toEqual({ kind: 'routines' });
    // The workout the widget showed was finished elsewhere meanwhile.
    expect(planWidgetLink({ action: 'resume', routineId: null }, state)).toEqual({ kind: 'home' });
    expect(planWidgetLink(null, state)).toEqual({ kind: 'home' });
  });
});
