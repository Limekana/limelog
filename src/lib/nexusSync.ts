import { supabase, isNexusConfigured } from './supabase';
import type { SessionLog } from '@/types/logging';
import type { Exercise, SessionTemplate } from '@/types/program';

const PENDING_KEY = 'wt_nexus_pending';

export interface NexusSetPayload {
  exercise: string;
  weightKg?: number;
  reps?: number;
  rpe?: number;
}

export interface NexusWorkoutPayload {
  sessionType: string;
  date: string;
  notes?: string;
  sets: NexusSetPayload[];
}

interface PendingPush {
  id: string;
  payload: NexusWorkoutPayload;
  createdAt: string;
}

function readPending(): PendingPush[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingPush[]) : [];
  } catch {
    return [];
  }
}

function writePending(items: PendingPush[]): void {
  localStorage.setItem(PENDING_KEY, JSON.stringify(items));
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
    sessionType: session?.name ?? 'workout',
    date: log.finalizedAt ?? log.loggedAt,
    notes: log.notes,
    sets,
  };
}

export async function pushWorkoutToNexus(workout: NexusWorkoutPayload): Promise<string> {
  if (!isNexusConfigured) throw new Error('Nexus not configured');

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  if (!user) throw new Error('Not signed in to Nexus');

  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: sessionErr } = await supabase
    .from('workout_sessions')
    .insert({
      id: sessionId,
      user_id: user.id,
      session_type: workout.sessionType,
      date: workout.date,
      notes: workout.notes ?? null,
      updated_at: now,
    });
  if (sessionErr) throw sessionErr;

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
    if (setsErr) {
      await supabase.from('workout_sessions').delete().eq('id', sessionId);
      throw setsErr;
    }
  }

  return sessionId;
}

export async function pushOrQueue(workout: NexusWorkoutPayload): Promise<{ ok: boolean; queued: boolean; error?: unknown }> {
  if (!isNexusConfigured) {
    return { ok: false, queued: false, error: 'Nexus not configured' };
  }

  try {
    await pushWorkoutToNexus(workout);
    return { ok: true, queued: false };
  } catch (err) {
    const pending = readPending();
    pending.push({
      id: crypto.randomUUID(),
      payload: workout,
      createdAt: new Date().toISOString(),
    });
    writePending(pending);
    // eslint-disable-next-line no-console
    console.warn('[nexus] push failed, queued for retry:', err);
    return { ok: false, queued: true, error: err };
  }
}

export async function drainPendingQueue(): Promise<{ sent: number; remaining: number }> {
  if (!isNexusConfigured) return { sent: 0, remaining: 0 };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { sent: 0, remaining: readPending().length };

  let pending = readPending();
  let sent = 0;
  const failures: PendingPush[] = [];

  for (const item of pending) {
    try {
      await pushWorkoutToNexus(item.payload);
      sent++;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[nexus] retry failed for queued workout:', err);
      failures.push(item);
    }
  }

  pending = failures;
  writePending(pending);
  return { sent, remaining: pending.length };
}

export function getPendingCount(): number {
  return readPending().length;
}

export function clearPendingQueue(): void {
  writePending([]);
}
