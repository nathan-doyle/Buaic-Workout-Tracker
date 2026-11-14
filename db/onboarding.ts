/**
 * Onboarding's starter plan (Phase 5). A fresh install already has Buaic's starter
 * splits (seeded like V1); choosing a template or "start blank" replaces them.
 * Only ever done on a database with no workouts at all, so nothing logged can be
 * touched: otherwise the routines are left as they are.
 */
import { type DbAdapter, transaction } from './adapter';
import { addTemplate } from './library';
import type { StarterPlan } from '../lib/onboarding';

export type PlanResult = 'kept' | 'replaced' | 'refused';

export function applyStarterPlan(db: DbAdapter, plan: StarterPlan, now: Date = new Date()): PlanResult {
  if (plan === 'keep') return 'kept';
  const removed = transaction(db, () => {
    const sessions = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions')?.n ?? 0;
    if (sessions > 0) return false;
    // Only the seeded starter routines (source 'template'); anything the user made stays.
    db.run("DELETE FROM routines WHERE source = 'template'");
    return true;
  });
  if (!removed) return 'refused';
  if (plan !== 'blank') addTemplate(db, plan, now);
  return 'replaced';
}
