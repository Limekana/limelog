// limelog#42 (owner decision B2, 2026-10-03): what ticking DONE on a set with
// empty fields means.
//
// The reps and weight inputs show the programme's target as a grey placeholder,
// and on a phone that placeholder reads as a value already entered. Before
// this, DONE logged `reps: null`: a completed set with no reps, which then
// surfaced as "95 kg×—" in LAST. Now DONE on an empty field logs exactly the
// value the user was looking at. When there is nothing to fall back on, DONE
// is refused, so a completed set always has reps.
import type { SetLog } from '@/types/logging';

/**
 * The reps a target like "5", "8-12", "8–12" or "5+" commits a set to when the
 * user leaves the field empty. For a range it is the LOW end: crediting the
 * ceiling would trip the "ceiling hit, add weight" progression off reps nobody
 * typed. Returns null for targets with no number ("AMRAP", "").
 */
export function repFloor(targetReps: string | undefined): number | null {
  if (!targetReps) return null;
  const m = targetReps.match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return n > 0 ? n : null;
}

export type DoneResult =
  | { ok: true; fill: Partial<Pick<SetLog, 'reps' | 'weightKg'>> }
  | { ok: false; reason: 'reps-required' };

/**
 * Resolve a DONE tap on an open set. `fill` holds only the fields that were
 * empty and had a target to take; typed values are never overwritten. A typed
 * 0 counts as typed (a failed attempt is a real record).
 */
export function resolveDone(
  set: Pick<SetLog, 'reps' | 'weightKg'>,
  targetReps: string | undefined,
  targetWeight: number | undefined,
): DoneResult {
  const fill: Partial<Pick<SetLog, 'reps' | 'weightKg'>> = {};
  if (set.reps == null) {
    const reps = repFloor(targetReps);
    if (reps == null) return { ok: false, reason: 'reps-required' };
    fill.reps = reps;
  }
  if (set.weightKg == null && targetWeight != null && targetWeight > 0) {
    fill.weightKg = targetWeight;
  }
  return { ok: true, fill };
}
