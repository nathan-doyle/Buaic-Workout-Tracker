/**
 * Share card v2 (Phase 5): what the card shows, worked out from a finished
 * workout's summary. Two formats (9:16 story, square); weights and volume can be
 * hidden. Pure, so the rules are tested; `features/share` draws it.
 */
import { formatDuration } from './stats';
import { formatLoad, formatVolume, type WeightUnit } from './units';

export type ShareFormat = 'story' | 'square';

/** The card's pixel size when captured (both are what Instagram and messengers expect). */
export const SHARE_SIZES: Record<ShareFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

/** Exercise rows that fit on each format; the rest are summed up as "+ N more". */
export const MAX_EXERCISE_ROWS: Record<ShareFormat, number> = { story: 8, square: 3 };

export interface ShareSummaryInput {
  splitName: string;
  totalVolume: number;
  totalSets: number;
  durationSeconds: number;
  exerciseHighlights: { name: string; variation: string; topWeight: number; topReps: number; completedSetsCount: number }[];
  prs: { name: string; variation: string; weight: number; reps: number; label: string }[];
}

export interface ShareCardData {
  title: string;
  dateLabel: string;
  /** null when the workout has no meaningful duration (under a minute). */
  duration: string | null;
  /** null when weights are hidden. */
  volume: string | null;
  sets: number;
  prCount: number;
  prs: { exercise: string; label: string; detail: string }[];
  exercises: { name: string; sets: string; top: string }[];
  moreExercises: number;
}

const displayName = (name: string, variation: string) => (variation ? `${name} (${variation})` : name);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildShareCard(
  summary: ShareSummaryInput,
  options: { unit: WeightUnit; hideWeights: boolean; format: ShareFormat; now: Date; locale?: string }
): ShareCardData {
  const { unit, hideWeights, format, now } = options;
  const set = (weight: number, reps: number) => (hideWeights ? plural(reps, 'rep', 'reps') : `${formatLoad(weight, unit)} × ${reps}`);
  const rows = summary.exerciseHighlights.map((e) => ({
    name: displayName(e.name, e.variation),
    sets: plural(e.completedSetsCount, 'set', 'sets'),
    top: set(e.topWeight, e.topReps),
  }));
  const max = MAX_EXERCISE_ROWS[format];
  // "+ 1 more" would take the row it replaces, so show all when only one is over.
  const visible = rows.length > max ? rows.slice(0, max - 1) : rows;
  return {
    title: summary.splitName.trim() || 'Workout',
    dateLabel: now.toLocaleDateString(options.locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    duration: summary.durationSeconds >= 60 ? formatDuration(summary.durationSeconds) : null,
    volume: hideWeights ? null : `${Number(formatVolume(summary.totalVolume, unit)).toLocaleString(options.locale)} ${unit}`,
    sets: summary.totalSets,
    prCount: summary.prs.length,
    prs: summary.prs.map((p) => ({ exercise: displayName(p.name, p.variation), label: p.label, detail: set(p.weight, p.reps) })),
    exercises: visible,
    moreExercises: rows.length - visible.length,
  };
}

/** The card as one sentence, for screen readers (the image itself can't be read). */
export function describeShareCard(card: ShareCardData): string {
  const parts = [
    `${card.title}, ${card.dateLabel}`,
    card.duration,
    card.volume ? `volume ${card.volume}` : null,
    plural(card.sets, 'set', 'sets'),
    card.prCount > 0 ? plural(card.prCount, 'personal record', 'personal records') : null,
  ];
  return parts.filter(Boolean).join(', ') + '.';
}
