export interface SetLog {
  id: string;
  sessionLogId: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  completed: boolean;
  notes?: string;
}

export type SessionMood = 'great' | 'good' | 'neutral' | 'bad' | 'terrible';

export interface SessionLog {
  id: string;
  sessionTemplateId: string;
  programId: string;
  loggedAt: string;
  finalizedAt?: string;
  perceivedFatigue: number | null;
  notes?: string;
  sets: SetLog[];
  // v1.4 — optional post-workout AI debrief. The user types a free-text note
  // and the cloud Gemini proxy extracts structured fields. All null when the
  // user skips it or AI is unavailable (the FatigueRating dots remain the
  // always-available fallback). Stored locally + pushed to workout_sessions.
  aiDebriefRaw?: string | null;
  aiRpe?: number | null;
  aiPainFlags?: string[] | null;
  aiMood?: SessionMood | null;
  aiNoteSummary?: string | null;
}

// v1.6 — Personal Records. Append-only: one row per PR achievement, so the
// per-exercise progression (sparkline) is just the rows for that exercise over
// time. "Current PR" for an exercise = the row with the highest oneRepMaxKg.
// Auto-detected on session finalize; never hand-entered. Pushed to the shared
// Supabase `exercise_prs` table (push-only, like workouts) for durability +
// cross-device, but the local copy is the on-device source of truth.
export interface ExercisePR {
  id: string;
  exerciseId: string;
  // Denormalised name at detection time — keeps the row meaningful even if the
  // exercise is later renamed/deleted, and lets the cloud row stand alone.
  exerciseName: string;
  weightKg: number;        // 0 for bodyweight
  reps: number;
  oneRepMaxKg: number;     // Epley estimate — ranks PRs across rep ranges
  sessionId: string;       // the SessionLog this PR was set in
  date: string;            // 'YYYY-MM-DD'
  createdAt: string;       // ISO
}

export type JumpCondition = 'fresh' | 'post_session' | 'morning';

export interface VerticalJumpLog {
  id: string;
  userId: string;
  loggedAt: string;
  heightCm: number;
  condition: JumpCondition;
  notes?: string;
}

export type StallFlagType = 'weight_plateau' | 'rpe_creep';

export interface StallFlag {
  id: string;
  exerciseId: string;
  detectedAt: string;
  sessionLogIds: string[];
  flagType: StallFlagType;
  resolved: boolean;
  resolutionAction?: 'deload' | 'exercise_swap' | 'technique_reset' | 'ignored';
}
