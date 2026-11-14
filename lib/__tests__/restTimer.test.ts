import {
  adjustRest,
  formatClock,
  pauseRest,
  remainingSeconds,
  restProgress,
  resumeRest,
  startRest,
  tick,
} from '../restTimer';

const T0 = 1_000_000;

describe('rest timer', () => {
  it('counts down from wall-clock time, even across a long gap', () => {
    const s = startRest(90, T0, 'Bench Press');
    expect(remainingSeconds(s, T0)).toBe(90);
    expect(remainingSeconds(s, T0 + 30_500)).toBe(60);
    expect(tick(s, T0 + 89_999).status).toBe('running');
    // App was frozen in the background for 10 minutes: ends, no drift.
    expect(tick(s, T0 + 600_000)).toEqual({ status: 'done', durationSeconds: 90, label: 'Bench Press' });
    expect(restProgress(s, T0 + 45_000)).toBeCloseTo(0.5);
  });

  it('adds and removes 15 s; removing past zero ends the rest', () => {
    let s = startRest(60, T0);
    s = adjustRest(s, 15, T0 + 10_000);
    expect(remainingSeconds(s, T0 + 10_000)).toBe(65);
    s = adjustRest(s, -15, T0 + 10_000);
    expect(remainingSeconds(s, T0 + 10_000)).toBe(50);
    expect(adjustRest(s, -60, T0 + 10_000).status).toBe('done');
    // +15 on a finished rest starts a short extra rest.
    expect(remainingSeconds(adjustRest({ status: 'done', durationSeconds: 60, label: '' }, 15, T0), T0)).toBe(15);
  });

  it('pauses and resumes without losing time', () => {
    let s = startRest(90, T0);
    s = pauseRest(s, T0 + 20_000);
    expect(remainingSeconds(s, T0 + 500_000)).toBe(70);
    s = adjustRest(s, 15, T0 + 500_000);
    s = resumeRest(s, T0 + 500_000);
    expect(remainingSeconds(s, T0 + 500_000)).toBe(85);
  });

  it('formats clocks', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(95)).toBe('1:35');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});
