/**
 * Seeding, run after the migration as its own step (a seed problem can never
 * endanger the migration or user data).
 *
 * Phase 2 seeds only V1's starter content: when the database has no routines yet
 * (a fresh install, or a V1 database with no exercises, which V1 itself re-seeded
 * on launch), V1's six default exercises go into their splits. A settings flag
 * makes this happen at most once, so routines a user later removes never come back.
 * Phase 3 adds the full exercise library here (insert-if-missing on the identity).
 */
import { type DbAdapter, transaction } from './adapter';
import { addExerciseToSplits } from './queries';
import { ONBOARDING_STATUS_KEY } from './settings';
import { V1_DEFAULT_EXERCISES } from './v1Constants';

export const STARTER_SEEDED_KEY = 'starter_content_seeded';

/** Returns true if starter content was added. Idempotent. */
export function seedDatabase(db: DbAdapter, now: Date = new Date()): boolean {
  return transaction(db, () => {
    if (db.get('SELECT key FROM settings WHERE key = ?', [STARTER_SEEDED_KEY])) return false;
    const routines = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM routines')?.n ?? 0;
    const nowIso = now.toISOString();
    if (routines === 0) {
      for (const exercise of V1_DEFAULT_EXERCISES) {
        addExerciseToSplits(db, { ...exercise, isCustom: false }, 'template', nowIso);
      }
      // Phase 5: a brand-new user (no routines and no workouts yet) gets the short onboarding.
      // Anyone upgrading already has this flag set from an earlier launch, so never sees it.
      const sessions = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions')?.n ?? 0;
      if (sessions === 0) {
        db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING', [
          ONBOARDING_STATUS_KEY,
          JSON.stringify('pending'),
        ]);
      }
    }
    db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [STARTER_SEEDED_KEY, 'true']);
    return routines === 0;
  });
}
