import type { Program, Exercise, WorkoutTemplate } from '@/types/program';
import type { SessionLog, VerticalJumpLog, StallFlag, ExercisePR } from '@/types/logging';
import type { UserProfile, InjuryRestriction } from '@/types/user';
import { estimate1RMRaw } from '@/utils/oneRepMax';

const KEYS = {
  programs: 'wt_programs',
  exercises: 'wt_exercises',
  sessionLogs: 'wt_session_logs',
  jumpLogs: 'wt_jump_logs',
  stallFlags: 'wt_stall_flags',
  exercisePRs: 'wt_exercise_prs',
  profile: 'wt_profile',
  workoutTemplates: 'wt_workout_templates',
  // v1.7 (BUG-6) — ids of sessions the user discarded locally. Recovery-hydrate
  // consults this so a workout the user intentionally deleted is never
  // resurrected from the still-present cloud row (push-only means discards don't
  // propagate a cloud delete).
  sessionTombstones: 'wt_session_tombstones',
} as const;

// v1.8 — re-value PRs written before the two 1RM estimators were unified.
//
// PR detection used to score sets with its own uncapped Epley while the charts
// used the blended Brzycki/Epley in oneRepMax.ts. Those disagree below 11 reps
// (100 kg × 5 scored 116.67 vs 112.50), so stored PRs are inflated relative to
// anything detected from now on. Left alone, every user's existing PRs would
// become roughly 4 kg per 100 kg harder to beat and would effectively freeze.
//
// Re-valuing from the stored weightKg/reps rather than recomputing from session
// history keeps this self-contained and works even for PRs whose source session
// has since been deleted. estimate1RMRaw is deliberately the uncapped variant:
// a legacy PR set above MAX_RELIABLE_REPS still gets a comparable number
// instead of being dropped, which would destroy user history. New PRs above the
// cap can no longer be created — that is enforced in prDetection.
//
// Idempotent: re-valuing an already-migrated row recomputes the same number.
function migratePRValues(prs: ExercisePR[]): ExercisePR[] {
  let changed = false;
  const out = prs.map((pr) => {
    const revalued = estimate1RMRaw(pr.weightKg, pr.reps);
    if (revalued == null) return pr;
    const rounded = Math.round(revalued * 100) / 100;
    if (rounded === pr.oneRepMaxKg) return pr;
    changed = true;
    return { ...pr, oneRepMaxKg: rounded };
  });
  if (changed) set(KEYS.exercisePRs, out);
  return out;
}

function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function set<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // A failed write must never be silent. The most likely cause is quota
    // exhaustion (progress photos store multi-MB base64 in this same origin);
    // once quota is hit, an unguarded setItem throws synchronously and — since
    // store actions call storage.set() BEFORE their Zustand set() — aborts the
    // whole action, so "Finish workout" would silently lose the session.
    console.error('[storage] write failed for', key, e);
    const quota =
      e instanceof DOMException &&
      (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
    if (quota) {
      // Surface it so the user learns their data didn't persist (rather than
      // discovering a lost workout later). Progress photos are the usual
      // culprit — deleting some frees room for logs.
      try {
        alert(
          'Storage is full, so this change could not be saved. Free up space (e.g. delete some progress photos) and try again.',
        );
      } catch {
        /* alert unavailable (non-UI context) — the console.error above still fires */
      }
    }
    throw e;
  }
}

export const storage = {
  migratePRValues,

  getPrograms: (): Program[] => get<Program[]>(KEYS.programs) ?? [],
  setPrograms: (v: Program[]) => set(KEYS.programs, v),

  getExercises: (): Exercise[] => get<Exercise[]>(KEYS.exercises) ?? [],
  setExercises: (v: Exercise[]) => set(KEYS.exercises, v),

  getSessionLogs: (): SessionLog[] => get<SessionLog[]>(KEYS.sessionLogs) ?? [],
  setSessionLogs: (v: SessionLog[]) => set(KEYS.sessionLogs, v),

  getJumpLogs: (): VerticalJumpLog[] => get<VerticalJumpLog[]>(KEYS.jumpLogs) ?? [],
  setJumpLogs: (v: VerticalJumpLog[]) => set(KEYS.jumpLogs, v),

  getStallFlags: (): StallFlag[] => get<StallFlag[]>(KEYS.stallFlags) ?? [],
  setStallFlags: (v: StallFlag[]) => set(KEYS.stallFlags, v),

  getExercisePRs: (): ExercisePR[] => migratePRValues(get<ExercisePR[]>(KEYS.exercisePRs) ?? []),
  setExercisePRs: (v: ExercisePR[]) => set(KEYS.exercisePRs, v),

  getProfile: (): UserProfile | null => get<UserProfile>(KEYS.profile),
  setProfile: (v: UserProfile) => set(KEYS.profile, v),

  getWorkoutTemplates: (): WorkoutTemplate[] => get<WorkoutTemplate[]>(KEYS.workoutTemplates) ?? [],
  setWorkoutTemplates: (v: WorkoutTemplate[]) => set(KEYS.workoutTemplates, v),

  getRestrictions: (): InjuryRestriction[] => {
    const profile = get<UserProfile>(KEYS.profile);
    return profile?.activeRestrictions ?? [];
  },

  getSessionTombstones: (): string[] => get<string[]>(KEYS.sessionTombstones) ?? [],
  setSessionTombstones: (v: string[]) => set(KEYS.sessionTombstones, v),
};
