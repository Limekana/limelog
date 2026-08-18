// LimeLog ← Nexus recovery hydrate — v1.7 (BUG-6).
//
// LimeLog is push-only by contract (see CLAUDE.md): local + the offline outbox
// are the source of truth, and NCC only reads. That left one hole — if the
// local store is lost (reinstall, new device, cleared data, or a workout that
// errored out of local state), there was NO way to get pushed workouts back,
// even though they sat safely in the cloud. That already cost a real workout.
//
// This module adds a RECOVERY-ONLY pull. It never merges, overwrites, or
// deletes a local session — it only reconstructs sessions whose id is missing
// locally (and isn't tombstoned as an intentional discard). So local stays
// authoritative for everything it already knows; the cloud is consulted purely
// to refill genuine gaps. This is deliberately NOT the bidirectional LWW model
// StudyDesk uses — workout_sets have no natural merge key, so two-way merge
// would risk duplicate/stale sets.
//
// Reconstruction is best-effort by design: the cloud stores each set by
// exercise NAME (not the local exerciseId), and doesn't store programId /
// sessionTemplateId / setNumber. We resolve names back to local exercise ids
// where we can (so recovered sets re-link to progress/PR views), fall back to a
// stable synthetic id per unmatched name, and leave the template/program refs
// empty. A recovered session therefore shows its date, notes, exercises,
// weights, reps and RPE — enough to be real history again — but won't be tied
// to a program template. Recovered sessions are marked finalized (they're
// historical) so they never reopen as an in-progress workout.

import { supabase, isNexusConfigured } from './supabase';
import type { SessionLog, SetLog } from '@/types/logging';
import type { Exercise } from '@/types/program';

interface CloudSessionRow {
  id: string;
  session_type: string | null;
  // v1.9 (Item 4) — cardio. NULL on every pre-v1.9 row and on every strength
  // session, which is how the two shapes are told apart coming back in.
  activity_type: string | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  date: string | null;
  notes: string | null;
  ai_debrief_raw: string | null;
  ai_rpe: number | null;
  ai_pain_flags: string[] | null;
  ai_mood: string | null;
  ai_note_summary: string | null;
}

interface CloudSetRow {
  id: string;
  session_id: string;
  exercise: string | null;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
}

const VALID_MOODS = ['great', 'good', 'neutral', 'bad', 'terrible'] as const;
type Mood = (typeof VALID_MOODS)[number];
function coerceMood(m: string | null): Mood | null {
  return m && (VALID_MOODS as readonly string[]).includes(m) ? (m as Mood) : null;
}

/** Slug for a stable synthetic exercise id when a cloud set's exercise name
 *  doesn't match any local exercise. Keeps same-named sets grouped together. */
function syntheticExerciseId(name: string): string {
  return `rec:${name.trim().toLowerCase().replace(/\s+/g, '-')}`;
}

/**
 * Fetch all cloud workouts for the signed-in user and reconstruct them as local
 * SessionLogs. Pure fetch + map — the caller decides which to actually insert
 * (see logStore.recoverSessions, which skips ids that already exist locally or
 * are tombstoned). Returns [] when Nexus isn't configured or nobody's signed
 * in. Throws on a genuine query error so the caller can log it.
 *
 * @param exercises local exercise list, used to resolve set names → ids.
 */
export async function pullWorkoutsFromCloud(exercises: Exercise[]): Promise<SessionLog[]> {
  if (!isNexusConfigured) return [];
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  if (!user) return [];

  const { data: sessions, error: sErr } = await supabase
    .from('workout_sessions')
    .select('id, session_type, activity_type, duration_seconds, distance_meters, date, notes, ai_debrief_raw, ai_rpe, ai_pain_flags, ai_mood, ai_note_summary')
    .eq('user_id', user.id);
  if (sErr) throw sErr;
  if (!sessions?.length) return [];

  const { data: sets, error: setErr } = await supabase
    .from('workout_sets')
    .select('id, session_id, exercise, weight_kg, reps, rpe')
    .eq('user_id', user.id);
  if (setErr) throw setErr;

  // Resolve exercise NAME → local id (case-insensitive). Unmatched names get a
  // stable synthetic id so recovered sets for the same movement still group.
  const idByName = new Map<string, string>();
  for (const e of exercises) {
    const key = e.name.toLowerCase();
    if (!idByName.has(key)) idByName.set(key, e.id); // first match wins
  }
  const resolveExerciseId = (name: string): string =>
    idByName.get(name.trim().toLowerCase()) ?? syntheticExerciseId(name);

  // Group sets by session.
  const setsBySession = new Map<string, CloudSetRow[]>();
  for (const raw of (sets ?? []) as CloudSetRow[]) {
    const arr = setsBySession.get(raw.session_id);
    if (arr) arr.push(raw);
    else setsBySession.set(raw.session_id, [raw]);
  }

  return (sessions as CloudSessionRow[]).map((s) => {
    const date = s.date ?? new Date().toISOString();
    const rows = setsBySession.get(s.id) ?? [];
    const setLogs: SetLog[] = rows.map((r, i) => ({
      id: r.id,
      sessionLogId: s.id,
      exerciseId: resolveExerciseId(r.exercise ?? 'Exercise'),
      setNumber: i + 1,
      weightKg: r.weight_kg,
      reps: r.reps,
      rpe: r.rpe,
      completed: true, // only completed sets were ever pushed
    }));
    // v1.9 (Item 4) — a recovered cardio session must come back as cardio.
    // Without this it would restore as a strength session with no sets: a 10 km
    // run reappearing as an empty workout.
    const isCardio = !!s.activity_type;
    const log: SessionLog = {
      id: s.id,
      // Cardio genuinely has no template or program, so these stay absent
      // rather than being blanked. A recovered strength session keeps the
      // existing '' — its template is unknown, not nonexistent.
      ...(isCardio
        ? {
            activityType: s.activity_type ?? undefined,
            durationSeconds: s.duration_seconds ?? undefined,
            distanceMeters: s.distance_meters ?? undefined,
          }
        : { sessionTemplateId: '', programId: '' }),
      loggedAt: date,
      finalizedAt: date, // historical → finalized, never reopens in-progress
      perceivedFatigue: s.ai_rpe ?? null,
      notes: s.notes ?? undefined,
      sets: setLogs,
      aiDebriefRaw: s.ai_debrief_raw,
      aiRpe: s.ai_rpe,
      aiPainFlags: s.ai_pain_flags,
      aiMood: coerceMood(s.ai_mood),
      aiNoteSummary: s.ai_note_summary,
    };
    return log;
  });
}
