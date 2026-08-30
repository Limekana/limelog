// LimeLog → Nexus push handler.
//
// v1.0–v1.1: this file owned BOTH the push (`pushWorkoutToNexus`) AND the
// retry queue (`pushOrQueue`, `drainPendingQueue`, `wt_nexus_pending`
// localStorage). v1.2 split the queue out to `lib/outbox.ts` — that's where
// persistence, single-flight, attempt cap, and online/visibility re-triggers
// now live. The legacy `wt_nexus_pending` key is auto-migrated by outbox.ts
// on first load.
//
// This file is now just the handler + the payload mapper. Call sites use
// `enqueue('upsert_workout_session', payload)` from outbox.ts instead of the
// removed `pushOrQueue` wrapper.

import { supabase, isNexusConfigured } from './supabase';
import type { SessionLog } from '@/types/logging';
import type { Exercise, SessionTemplate } from '@/types/program';

interface NexusSetPayload {
  exercise: string;
  weightKg?: number;
  reps?: number;
  rpe?: number;
}

export interface NexusWorkoutPayload {
  // v1.6.1 — the LOCAL SessionLog id. Threaded through so the push upserts a
  // stable row instead of minting a fresh random id every dispatch. Without
  // this, an outbox retry / double-dispatch inserted a NEW session each time —
  // one workout became N duplicate cloud sessions (the "6 workouts" bug).
  sessionId: string;
  sessionType: string;
  date: string;
  notes?: string;
  sets: NexusSetPayload[];
  // v1.9 (Item 4) — cardio. Absent on a strength session, which is exactly what
  // NULL means in `workout_sessions`.
  activityType?: string;
  durationSeconds?: number;
  distanceMeters?: number;
  // v1.4 — optional AI debrief fields (null when not used).
  aiDebriefRaw?: string | null;
  aiRpe?: number | null;
  aiPainFlags?: string[] | null;
  aiMood?: string | null;
  aiNoteSummary?: string | null;
}

export function mapSessionLogToNexus(
  log: SessionLog,
  session: SessionTemplate | undefined,
  exercises: Exercise[],
): NexusWorkoutPayload {
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));

  const sets: NexusSetPayload[] = log.sets
    .filter((s) => s.completed)
    .map((s) => {
      const ex = exerciseById.get(s.exerciseId);
      return {
        exercise: ex?.name ?? 'Unknown exercise',
        weightKg: s.weightKg ?? undefined,
        reps: s.reps ?? undefined,
        rpe: s.rpe ?? undefined,
      };
    });

  return {
    sessionId: log.id,
    // v1.9 — `session_type` is NOT NULL and is what NCC and older LimeLog
    // builds display, so a cardio session puts its activity there rather than
    // falling through to the generic 'workout'. The row then reads sensibly on
    // a client that knows nothing about `activity_type`.
    sessionType: session?.name ?? log.activityType ?? 'workout',
    date: log.finalizedAt ?? log.loggedAt,
    notes: log.notes,
    sets,
    activityType: log.activityType,
    durationSeconds: log.durationSeconds,
    distanceMeters: log.distanceMeters,
    aiDebriefRaw: log.aiDebriefRaw ?? null,
    aiRpe: log.aiRpe ?? null,
    aiPainFlags: log.aiPainFlags ?? null,
    aiMood: log.aiMood ?? null,
    aiNoteSummary: log.aiNoteSummary ?? null,
  };
}

/**
 * Push one workout payload to Supabase. Two-step write (session row, then
 * sets) with rollback of the session if the sets insert fails. Throws on
 * any failure — caller decides whether to enqueue for retry.
 *
 * Called by:
 *   - outbox.ts dispatch for the `upsert_workout_session` kind (typical path)
 *   - directly during dev/testing if needed
 */
export async function pushWorkoutToNexus(workout: NexusWorkoutPayload): Promise<string> {
  if (!isNexusConfigured) throw new Error('Nexus not configured');

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  if (!user) throw new Error('Not signed in to Nexus');

  // v1.6.1 — idempotent push, honouring the outbox's UPSERT-style contract.
  // Use the STABLE local session id (not a fresh random one) and UPSERT, so a
  // retry / double-dispatch converges on the same row instead of inserting a
  // duplicate. Sets are replaced wholesale (delete-then-insert) so re-pushing
  // an edited workout doesn't leave stale or duplicated set rows.
  const sessionId = workout.sessionId;
  const now = new Date().toISOString();

  const { error: sessionErr } = await supabase
    .from('workout_sessions')
    .upsert({
      id: sessionId,
      user_id: user.id,
      session_type: workout.sessionType,
      activity_type: workout.activityType ?? null,
      duration_seconds: workout.durationSeconds ?? null,
      distance_meters: workout.distanceMeters ?? null,
      date: workout.date,
      notes: workout.notes ?? null,
      ai_debrief_raw: workout.aiDebriefRaw ?? null,
      ai_rpe: workout.aiRpe ?? null,
      ai_pain_flags: workout.aiPainFlags ?? null,
      ai_mood: workout.aiMood ?? null,
      ai_note_summary: workout.aiNoteSummary ?? null,
      updated_at: now,
    });
  if (sessionErr) throw sessionErr;

  // Replace this session's sets atomically-enough: clear then re-insert. The
  // clear is keyed on session_id so it only touches this workout's rows.
  const { error: clearErr } = await supabase
    .from('workout_sets')
    .delete()
    .eq('session_id', sessionId);
  if (clearErr) throw clearErr;

  if (workout.sets.length > 0) {
    const setRows = workout.sets.map((s) => ({
      id: crypto.randomUUID(),
      user_id: user.id,
      session_id: sessionId,
      exercise: s.exercise,
      weight_kg: s.weightKg ?? null,
      reps: s.reps ?? null,
      rpe: s.rpe ?? null,
    }));

    const { error: setsErr } = await supabase.from('workout_sets').insert(setRows);
    if (setsErr) throw setsErr;
  }

  return sessionId;
}

// ── v1.2 Body Metrics push ────────────────────────────────────────────────
//
// Upsert by (user_id, date) — the UNIQUE constraint at the DB lets us write
// a fresh row OR overwrite an existing one for the same day in a single
// statement. Useful when the user weighs themselves in the morning, logs
// it, then edits later that day to add measurements.

export interface NexusBodyMetricPayload {
  id: string;
  date: string;
  weightKg?: number;
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  armsCm?: number;
  legsCm?: number;
  notes?: string;
}

export async function pushBodyMetricToNexus(p: NexusBodyMetricPayload): Promise<void> {
  if (!isNexusConfigured) throw new Error('Nexus not configured');
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  if (!user) throw new Error('Not signed in to Nexus');

  const row = {
    id: p.id,
    user_id: user.id,
    date: p.date,
    weight_kg: p.weightKg ?? null,
    chest_cm: p.chestCm ?? null,
    waist_cm: p.waistCm ?? null,
    hips_cm: p.hipsCm ?? null,
    arms_cm: p.armsCm ?? null,
    legs_cm: p.legsCm ?? null,
    notes: p.notes ?? null,
    updated_at: new Date().toISOString(),
  };

  // Conflict target is (user_id, date) — the natural primary identity for a
  // single user's daily snapshot. Using `onConflict: 'user_id,date'` lets
  // an "edit later that day" path overwrite without a separate read.
  const { error } = await supabase
    .from('body_metrics')
    .upsert(row, { onConflict: 'user_id,date' });
  if (error) throw error;
}

export async function deleteBodyMetricFromNexus(id: string): Promise<void> {
  if (!isNexusConfigured) throw new Error('Nexus not configured');
  const { error } = await supabase.from('body_metrics').delete().eq('id', id);
  if (error) throw error;
}

// v1.6 — Personal Records. Push-only, append-only: each detected PR is one row.
// Upsert by primary id keeps retries idempotent (the local PR keeps a stable
// id). All derived from already-pushed workout sets — no new user input.
export interface NexusExercisePRPayload {
  id: string;
  exerciseId: string;
  exerciseName: string;
  weightKg: number;
  reps: number;
  oneRepMaxKg: number;
  sessionId: string;
  date: string;
}

// -- v1.10: in-app feedback ------------------------------------------------
// `id` comes from the caller so an outbox retry files the same report rather
// than a second one. Retry safety is INSERT + duplicate-key check rather than
// UPSERT: `feedback` deliberately has no UPDATE policy, and an UPSERT onto an
// existing row becomes an UPDATE, which RLS would refuse. A 23505 means the
// first attempt landed, so it is success, not an error to surface.
export interface NexusFeedbackPayload {
  id: string;
  category: string;
  rating: number | null;
  message: string;
  appVersion: string;
  platform: string;
}

export async function pushFeedbackToNexus(p: NexusFeedbackPayload): Promise<void> {
  if (!isNexusConfigured) throw new Error('Nexus not configured');
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  if (!user) throw new Error('Not signed in to Nexus');

  const { error } = await supabase.from('feedback').insert({
    id: p.id,
    user_id: user.id,
    app: 'limelog',
    app_version: p.appVersion || null,
    platform: p.platform || null,
    category: p.category,
    rating: p.rating,
    message: p.message,
  });
  if (error && (error as { code?: string }).code !== '23505') throw error;
}

// ── retention (v1.12 Item 0) ─────────────────────────────────────────────────

export interface NexusAppOpenPayload {
  appVersion: string;
  platform: string;
  /** The user's own calendar date (YYYY-MM-DD), never the UTC one. */
  openedOn: string;
}

/**
 * Record that the user opened LimeLog today.
 *
 * Retention across the suite was previously inferred from content-row
 * timestamps and `auth.users.last_sign_in_at`; the latter moves on a silent
 * token refresh, so it recorded that the client woke up rather than that the
 * person came back.
 *
 * `app_opens`'s primary key is (user_id, app, opened_on), so this is idempotent
 * by construction — the caller upserts on every foreground and the database
 * collapses same-day repeats.
 */
export async function pushAppOpenToNexus(p: NexusAppOpenPayload): Promise<void> {
  if (!isNexusConfigured) throw new Error('Nexus not configured');
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  if (!user) throw new Error('Not signed in to Nexus');

  const { error } = await supabase.from('app_opens').upsert({
    user_id: user.id,
    app: 'limelog',
    app_version: p.appVersion || null,
    platform: p.platform || null,
    opened_on: p.openedOn,
  }, { onConflict: 'user_id,app,opened_on' });
  if (error) throw error;
}

export async function pushExercisePRToNexus(p: NexusExercisePRPayload): Promise<void> {
  if (!isNexusConfigured) throw new Error('Nexus not configured');
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  if (!user) throw new Error('Not signed in to Nexus');

  const row = {
    id: p.id,
    user_id: user.id,
    exercise_id: p.exerciseId,
    exercise_name: p.exerciseName,
    weight_kg: p.weightKg,
    reps: p.reps,
    one_rep_max_kg: p.oneRepMaxKg,
    session_id: p.sessionId,
    pr_date: p.date,
  };
  const { error } = await supabase.from('exercise_prs').upsert(row);
  if (error) throw error;
}
