// v1.7 — first-run onboarding flag + training-goal seed.
//
// The onboarding wizard (OnboardingFlow) shows once on a fresh install, after
// the auth gate, when the user has no logged sessions yet. We persist a
// "completed" flag so skipping/finishing it doesn't re-show on every cold
// start (the session-count gate alone would re-trigger for a user who skipped
// without logging anything).
//
// The chosen training goal is informational for now (per the v1.6 plan, Q3 →
// "display only") — seeds a narrative context for a future AI debrief prompt,
// no logic gate. Stored locally; not synced.

import { supabase } from '@/lib/supabase';

const DONE_KEY = 'limelog.onboarded';
const GOAL_KEY = 'limelog.trainingGoal';

export type TrainingGoal = 'strength' | 'hypertrophy' | 'sport' | 'general';

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setOnboarded(): void {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    /* best-effort flag */
  }
}

export function setTrainingGoal(goal: TrainingGoal): void {
  try {
    localStorage.setItem(GOAL_KEY, goal);
  } catch {
    /* best-effort */
  }
}

// -- v1.10: the flag belongs to the ACCOUNT, not the device ----------------
// It was localStorage and nothing else, which is per-origin and per-device, so
// a returning user on a new phone, browser or reinstall - or, until today's
// Electron origin fix, just the next launch of the desktop build - looked
// brand new and was made to redo the wizard.
//
// localStorage stays the fast path and the only path for guests: it answers
// synchronously on first render. The cloud read is a correction layer that can
// only ever turn the wizard OFF. A failed network call therefore falls back to
// the local answer - showing the wizard to someone who has seen it is annoying,
// but hiding first-run setup from someone who needs it would be worse.

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Record completion against the account. Best-effort: the local flag is
 *  already set by the caller, so a failure costs a repeat wizard on the NEXT
 *  device, not a broken finish on this one. */
export async function markOnboardedCloud(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  try {
    const { error } = await supabase.from('user_preferences').upsert(
      { user_id: userId, limelog_onboarded: true, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (error) console.warn('[onboarding] cloud write failed:', error.message);
  } catch (e) {
    console.warn('[onboarding] cloud write threw:', (e as Error).message);
  }
}

/** Has this user onboarded anywhere? True only on a definite yes. Also
 *  back-fills a device that says done while the account does not know yet, so
 *  the first run of this version is the last time the wizard ever appears. */
export async function hydrateOnboardedFromCloud(): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) return false;
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('limelog_onboarded')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return false;
    if (data?.limelog_onboarded) {
      setOnboarded();
      return true;
    }
    if (isOnboarded()) await markOnboardedCloud();
    return false;
  } catch {
    return false;
  }
}
