/**
 * Rest timer state, epoch-based as in V1 (the end time is a wall-clock instant, so
 * Doze, backgrounding and a frozen JS clock can't make it drift). Pure functions;
 * `features/rest/restTimer.ts` adds notifications, sound and vibration.
 */

export type RestTimerState =
  | { status: 'idle' }
  | { status: 'running'; endsAt: number; durationSeconds: number; label: string }
  | { status: 'paused'; remainingMs: number; durationSeconds: number; label: string }
  | { status: 'done'; durationSeconds: number; label: string };

export const IDLE: RestTimerState = { status: 'idle' };

export function startRest(durationSeconds: number, now: number, label = ''): RestTimerState {
  const seconds = Math.max(1, Math.round(durationSeconds));
  return { status: 'running', endsAt: now + seconds * 1000, durationSeconds: seconds, label };
}

/** Whole seconds left (rounded up), 0 when done or idle. */
export function remainingSeconds(state: RestTimerState, now: number): number {
  if (state.status === 'running') return Math.max(0, Math.ceil((state.endsAt - now) / 1000));
  if (state.status === 'paused') return Math.max(0, Math.ceil(state.remainingMs / 1000));
  return 0;
}

/** Running → done once the end time has passed. */
export function tick(state: RestTimerState, now: number): RestTimerState {
  if (state.status === 'running' && now >= state.endsAt) {
    return { status: 'done', durationSeconds: state.durationSeconds, label: state.label };
  }
  return state;
}

/** Adds (or with a negative value removes) time. Going to zero or below ends the rest. */
export function adjustRest(state: RestTimerState, deltaSeconds: number, now: number): RestTimerState {
  if (state.status === 'running') {
    const endsAt = Math.max(now, state.endsAt) + deltaSeconds * 1000;
    if (endsAt <= now) return { status: 'done', durationSeconds: state.durationSeconds, label: state.label };
    return { ...state, endsAt, durationSeconds: Math.max(state.durationSeconds, Math.ceil((endsAt - now) / 1000)) };
  }
  if (state.status === 'paused') {
    const remainingMs = state.remainingMs + deltaSeconds * 1000;
    if (remainingMs <= 0) return { status: 'done', durationSeconds: state.durationSeconds, label: state.label };
    return { ...state, remainingMs };
  }
  if (state.status === 'done' && deltaSeconds > 0) return startRest(deltaSeconds, now, state.label);
  return state;
}

export function pauseRest(state: RestTimerState, now: number): RestTimerState {
  if (state.status !== 'running') return state;
  const remainingMs = state.endsAt - now;
  if (remainingMs <= 0) return tick(state, now);
  return { status: 'paused', remainingMs, durationSeconds: state.durationSeconds, label: state.label };
}

export function resumeRest(state: RestTimerState, now: number): RestTimerState {
  if (state.status !== 'paused') return state;
  return { status: 'running', endsAt: now + state.remainingMs, durationSeconds: state.durationSeconds, label: state.label };
}

/** 0–1 progress of the rest (1 = over). */
export function restProgress(state: RestTimerState, now: number): number {
  if (state.status === 'done') return 1;
  if (state.status === 'idle') return 0;
  const total = state.durationSeconds * 1000;
  const left = state.status === 'running' ? state.endsAt - now : state.remainingMs;
  return Math.min(1, Math.max(0, 1 - left / total));
}

/** `m:ss`. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
