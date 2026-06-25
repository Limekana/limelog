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

export function getTrainingGoal(): TrainingGoal | null {
  try {
    const v = localStorage.getItem(GOAL_KEY);
    if (v === 'strength' || v === 'hypertrophy' || v === 'sport' || v === 'general') return v;
  } catch {
    /* ignore */
  }
  return null;
}
