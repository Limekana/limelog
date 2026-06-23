// ─── v1.6 Personal Record detection ──────────────────────────────────────
//
// After a session is finalized we check each exercise for a new PR. A PR is
// ranked by estimated one-rep max (Epley), so a heavier set at fewer reps and
// a lighter set at more reps are comparable — the user beats their PR whenever
// their best estimated 1RM for an exercise exceeds the previous best.
//
// Pure functions — no storage, no React. The store orchestrates persistence +
// the celebration.

import type { SetLog, SessionLog, ExercisePR } from '@/types/logging';

/** Epley 1RM estimate: weight × (1 + reps / 30). Single rep returns the raw
 *  weight. Bodyweight sets (weight 0) yield 0 — they don't compete on load. */
export function epley1RM(weightKg: number, reps: number): number {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps) || weightKg <= 0 || reps < 1) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** The best scoring set for an exercise within a list of sets, by Epley 1RM.
 *  Only completed sets with a positive weight + reps count. Returns null if
 *  none qualify. */
function bestSet(sets: SetLog[]): { weightKg: number; reps: number; oneRepMax: number } | null {
  let best: { weightKg: number; reps: number; oneRepMax: number } | null = null;
  for (const s of sets) {
    if (!s.completed) continue;
    if (s.weightKg == null || s.reps == null) continue;
    const orm = epley1RM(s.weightKg, s.reps);
    if (orm <= 0) continue;
    if (!best || orm > best.oneRepMax) {
      best = { weightKg: s.weightKg, reps: s.reps, oneRepMax: orm };
    }
  }
  return best;
}

/** The current PR (highest oneRepMaxKg) for an exercise from a PR list. */
export function currentPR(prs: ExercisePR[], exerciseId: string): ExercisePR | null {
  let best: ExercisePR | null = null;
  for (const p of prs) {
    if (p.exerciseId !== exerciseId) continue;
    if (!best || p.oneRepMaxKg > best.oneRepMaxKg) best = p;
  }
  return best;
}

/**
 * Inspect a finalized session and return a new PR row for every exercise whose
 * best estimated 1RM beats the existing PR for that exercise (or where no PR
 * exists yet). Caller supplies a name resolver + an id factory so this stays
 * free of app singletons.
 */
export function detectNewPRs(
  session: SessionLog,
  existingPRs: ExercisePR[],
  resolveName: (exerciseId: string) => string,
  makeId: () => string,
): ExercisePR[] {
  const date = session.loggedAt.slice(0, 10);
  const createdAt = new Date().toISOString();

  // Group this session's sets by exercise.
  const byExercise = new Map<string, SetLog[]>();
  for (const s of session.sets) {
    const list = byExercise.get(s.exerciseId);
    if (list) list.push(s);
    else byExercise.set(s.exerciseId, [s]);
  }

  const newPRs: ExercisePR[] = [];
  for (const [exerciseId, sets] of byExercise) {
    const best = bestSet(sets);
    if (!best) continue;
    const prior = currentPR(existingPRs, exerciseId);
    // Strictly greater — re-hitting the same 1RM isn't a new PR.
    if (prior && best.oneRepMax <= prior.oneRepMaxKg) continue;
    newPRs.push({
      id: makeId(),
      exerciseId,
      exerciseName: resolveName(exerciseId),
      weightKg: best.weightKg,
      reps: best.reps,
      oneRepMaxKg: Math.round(best.oneRepMax * 100) / 100,
      sessionId: session.id,
      date,
      createdAt,
    });
  }
  return newPRs;
}
