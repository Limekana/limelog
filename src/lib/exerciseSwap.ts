// v1.15 Item 8 — swap an exercise for one workout.
//
// "The rack is taken", "this aggravates my shoulder today": the program is
// right in general and wrong for this one session. So a swap is recorded on
// the SessionLog (`exerciseSwaps`, keyed by the SessionExercise id) and never
// written back to the program. The sets logged under the swap carry the
// SUBSTITUTE's exerciseId, which is what actually happened, so PRs, history,
// stall checks and the push to Nexus all describe the lift that was done.
//
// `exerciseSwaps` itself stays local: pushWorkoutToNexus maps fields
// explicitly and this one is not among them. Nothing downstream needs it.
// It only exists so the open workout knows which exercise to draw.

import type { Exercise, SessionExercise } from '@/types/program';
import type { SessionLog } from '@/types/logging';
import type { InjuryRestriction } from '@/types/user';

/** The exercise this workout actually uses for a programmed slot. */
export function effectiveExerciseId(log: Pick<SessionLog, 'exerciseSwaps'> | null, se: SessionExercise): string {
  return log?.exerciseSwaps?.[se.id] ?? se.exerciseId;
}

/** An active restriction marked "avoid" that covers this exercise, if any. */
export function avoidRestriction(ex: Exercise, restrictions: InjuryRestriction[]): InjuryRestriction | null {
  return restrictions.find(
    (r) =>
      r.active &&
      r.severity === 'avoid' &&
      (r.restrictedExerciseIds.includes(ex.id) || r.restrictedPatterns.includes(ex.movementPattern)),
  ) ?? null;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Suggested substitutes for `current`, closest first.
 *
 * Rank 0: same movement pattern AND same primary muscle (bench → DB bench).
 * Rank 1: same movement pattern (bench → overhead press).
 * Rank 2: same primary muscle, different pattern.
 * Anything else is not a suggestion; it stays reachable through search.
 *
 * Exercises under an active "avoid" restriction are left out. This is the
 * injury tie-in the plan listed as a stretch: the swap is most often FOR an
 * injury, and suggesting another movement that hurts would defeat it. Within
 * a rank, a different equipment type sorts first, since the usual reason to
 * swap is that this equipment is unavailable. Then alphabetical, for stability.
 */
export function rankSubstitutes(
  current: Exercise,
  all: Exercise[],
  restrictions: InjuryRestriction[],
  limit = 12,
): Exercise[] {
  const muscle = norm(current.primaryMuscle);
  const scored: Array<{ ex: Exercise; rank: number }> = [];
  for (const ex of all) {
    if (ex.id === current.id) continue;
    if (avoidRestriction(ex, restrictions)) continue;
    const samePattern = ex.movementPattern === current.movementPattern;
    const sameMuscle = muscle !== '' && norm(ex.primaryMuscle) === muscle;
    const rank = samePattern && sameMuscle ? 0 : samePattern ? 1 : sameMuscle ? 2 : -1;
    if (rank < 0) continue;
    scored.push({ ex, rank });
  }
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(a.ex.equipment === current.equipment) - Number(b.ex.equipment === current.equipment) ||
      a.ex.name.localeCompare(b.ex.name),
  );
  return scored.slice(0, limit).map((s) => s.ex);
}

/** Free-text search across name and muscle, excluding the current exercise. */
export function searchExercises(query: string, current: Exercise, all: Exercise[], limit = 30): Exercise[] {
  const q = norm(query);
  if (!q) return [];
  return all
    .filter((ex) => ex.id !== current.id && (norm(ex.name).includes(q) || norm(ex.primaryMuscle).includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);
}
