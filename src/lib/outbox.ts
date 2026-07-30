// ── LimeLog v1.2 offline outbox ──────────────────────────────────────────────
//
// Ported from StudyDesk v1.1's outbox.js — same single-flight drain, same
// attempt cap, same cached-status discipline for useSyncExternalStore. The
// LimeLog-specific shape:
//
//   - Two kinds today: `upsert_workout_session` (the existing finalize push)
//     and `delete_workout_session` (for the future delete-from-history feature
//     deferred per LimeLog v1.0.1 release notes). Add more here as edit/delete
//     surfaces ship.
//   - Drain triggers: `online`, `visibilitychange` (Capacitor bridges Android
//     `onResume` into the WebView's visibility events), app mount, post-sign-in,
//     manual "Retry now" button.
//   - Idempotency contract: every kind is UPSERT-style (`pushWorkoutToNexus`
//     creates a new session ID inside the handler, but the outbox item is
//     idempotent end-to-end because the payload doesn't yet reference a remote
//     ID — the retry creates a fresh row with the same data, no duplicate risk
//     because the prior call failed before the row landed). For `delete_*`,
//     `DELETE WHERE id = ?` is naturally idempotent.
//   - One-shot migration: legacy `wt_nexus_pending` items (pre-v1.2) are read
//     once on module load and re-enqueued as `upsert_workout_session`, then
//     the old key is cleared. No data loss on upgrade.
//
// Storage shape (localStorage `limelog-outbox`):
//   [ { id, createdAt, kind, payload, attempts, lastAttemptAt?, lastError? } ]
//
// Items at MAX_ATTEMPTS go to the back of the queue rather than dropping —
// silent data loss is worse than a stuck queue surfaced in the UI.

import {
  pushWorkoutToNexus,
  pushBodyMetricToNexus,
  deleteBodyMetricFromNexus,
  pushExercisePRToNexus,
  type NexusWorkoutPayload,
  type NexusBodyMetricPayload,
  type NexusExercisePRPayload,
} from './nexusSync';
import { supabase, isNexusConfigured } from './supabase';

const STORAGE_KEY = 'limelog-outbox';
const META_KEY = 'limelog-outbox-meta';
const LEGACY_KEY = 'wt_nexus_pending'; // pre-v1.2 PendingPush queue
const MAX_ATTEMPTS = 5;

// ── Types ─────────────────────────────────────────────────────────────────

type OutboxKind =
  | 'upsert_workout_session'
  | 'delete_workout_session'
  // v1.2 — Body Metrics. Same upsert/delete pair pattern.
  | 'upsert_body_metric'
  | 'delete_body_metric'
  // v1.6 — Personal Records. Push-only (append-only), upsert by id.
  | 'upsert_exercise_pr';

interface OutboxItem<K extends OutboxKind = OutboxKind> {
  id: string;
  createdAt: string;
  kind: K;
  payload: KindPayload[K];
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
}

interface KindPayload {
  upsert_workout_session: NexusWorkoutPayload;
  delete_workout_session: { id: string };
  upsert_body_metric: NexusBodyMetricPayload;
  delete_body_metric: { id: string };
  upsert_exercise_pr: NexusExercisePRPayload;
}

interface OutboxMeta {
  lastSuccessAt?: string | null;
  lastError?: string | null;
  lastErrorAt?: string | null;
}

export interface OutboxStatus {
  pending: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  oldestEnqueuedAt: string | null;
  /** Items that have hit MAX_ATTEMPTS — surface as stuck-queue warning. */
  stuck: number;
}

// ── Storage helpers ───────────────────────────────────────────────────────

function loadItems(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveItems(items: OutboxItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    // Quota-exceeded is unrecoverable for the outbox — log and continue.
    // The next mutation will overwrite + try again with whatever fits.
     
    console.error('[outbox] storage write failed:', e);
  }
  cachedStatus = null;
}

function loadMeta(): OutboxMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as OutboxMeta) : {};
  } catch {
    return {};
  }
}

function saveMeta(meta: OutboxMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch { /* see saveItems */ }
  cachedStatus = null;
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Public API ────────────────────────────────────────────────────────────

/** Enqueue a mutation for upstream sync. Triggers an immediate drain attempt.
 *  Returns synchronously — does NOT block on the drain. Failure surfaces via
 *  the meta + Settings panel; callers don't need to await.
 */
export function enqueue<K extends OutboxKind>(kind: K, payload: KindPayload[K]): void {
  if (!KIND_DISPATCH[kind]) {
     
    console.error('[outbox] unknown kind:', kind);
    return;
  }
  const items = loadItems();
  items.push({
    id: makeId(),
    createdAt: new Date().toISOString(),
    kind,
    payload,
    attempts: 0,
  });
  saveItems(items);
  // Fire-and-forget drain. Single-flight inside drain() coalesces overlapping
  // calls so this is safe even if many enqueues land in quick succession.
  void drain();
}

let draining = false;

/** Process pending items oldest-first. Coalesces concurrent calls via the
 *  `draining` flag. Stops on the first persistent failure to avoid burning
 *  through the queue with the same network error.
 *
 *  Returns the new queue depth so callers can decide whether to flash a
 *  result message. */
export async function drain(): Promise<{ sent: number; remaining: number }> {
  if (draining) return { sent: 0, remaining: loadItems().length };
  // Skip if offline — items stay queued. `online` event will re-trigger.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { sent: 0, remaining: loadItems().length };
  }
  // Skip if Supabase not configured — nothing to push to.
  if (!isNexusConfigured) {
    return { sent: 0, remaining: loadItems().length };
  }
  // Skip if no auth session — let post-sign-in path re-trigger.
  // (drainPendingQueue legacy did the same gate.)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { sent: 0, remaining: loadItems().length };

  draining = true;
  let sent = 0;
  try {
    for (;;) {
      const items = loadItems();
      if (items.length === 0) break;
      const item = items[0];
      const handler = KIND_DISPATCH[item.kind];
      if (!handler) {
        // Unknown kind — came from an older app version or a typo. Log + drop
        // so we notice in dev but the queue stays healthy.
         
        console.error('[outbox] dropping item with unknown kind:', item.kind);
        saveItems(items.slice(1));
        continue;
      }
      try {
        await handler(item.payload as never);
        // Success — remove from queue + bump last-success.
        saveItems(items.slice(1));
        saveMeta({ ...loadMeta(), lastSuccessAt: new Date().toISOString(), lastError: null });
        sent++;
      } catch (e) {
        const attempts = (item.attempts || 0) + 1;
        const errMsg = (e instanceof Error ? e.message : String(e));
        const updated = [
          { ...item, attempts, lastAttemptAt: new Date().toISOString(), lastError: errMsg },
          ...items.slice(1),
        ];
        // At ceiling? Move to the back of the queue so subsequent items can
        // still attempt. We never silently drop — the stuck-queue warning in
        // Settings surfaces this.
        if (attempts >= MAX_ATTEMPTS) {
          saveItems([...updated.slice(1), updated[0]]);
        } else {
          saveItems(updated);
        }
        saveMeta({ ...loadMeta(), lastError: errMsg, lastErrorAt: new Date().toISOString() });
        // Stop the drain pass — most likely the next item would hit the same
        // error. Next trigger (online / visibility / manual) tries again.
        break;
      }
    }
  } finally {
    draining = false;
  }
  return { sent, remaining: loadItems().length };
}

// v1.2 — cached snapshot. Same stable-reference contract as StudyDesk's:
// `useSyncExternalStore` requires getSnapshot to return a stable reference
// between actual state changes. Returning a fresh object each call would
// cause an infinite render loop.
let cachedStatus: OutboxStatus | null = null;

/** Current queue depth + meta for the Settings panel. */
export function getStatus(): OutboxStatus {
  if (cachedStatus) return cachedStatus;
  const items = loadItems();
  const meta = loadMeta();
  cachedStatus = {
    pending: items.length,
    lastSuccessAt: meta.lastSuccessAt ?? null,
    lastError: meta.lastError ?? null,
    lastErrorAt: meta.lastErrorAt ?? null,
    oldestEnqueuedAt: items[0]?.createdAt ?? null,
    stuck: items.filter((i) => (i.attempts || 0) >= MAX_ATTEMPTS).length,
  };
  return cachedStatus;
}

/** Clear the outbox. Called on auth sign-out — we don't want to retry the
 *  signed-out user's pending writes as the next signed-in user. */
export function clear(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(META_KEY);
  } catch { /* ignore */ }
  cachedStatus = null;
}

/** Wire `online` + `visibilitychange` drain triggers. Idempotent — safe to
 *  call multiple times (e.g. from React StrictMode double-mount). Returns a
 *  teardown helper for unit tests / hot reload. */
export function installDrainTriggers(): () => void {
  if (typeof window === 'undefined') return () => {};
  const onOnline = () => void drain();
  const onVis = () => {
    if (document.visibilityState === 'visible') void drain();
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVis);
  return () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVis);
  };
}

// ── Legacy migration ──────────────────────────────────────────────────────
//
// Pre-v1.2 LimeLog stored a flat array of PendingPush at `wt_nexus_pending`.
// Read it once on module load, re-enqueue every item as the v1.2 kind, and
// clear the legacy key. Safe across re-runs — once the legacy key is empty,
// this is a no-op.
//
// PendingPush shape (legacy): { id: string; payload: NexusWorkoutPayload; createdAt: string }

interface LegacyPendingPush {
  id: string;
  payload: NexusWorkoutPayload;
  createdAt: string;
}

function migrateLegacyQueue(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) {
      localStorage.removeItem(LEGACY_KEY);
      return;
    }
    const items = loadItems();
    for (const legacy of arr as LegacyPendingPush[]) {
      items.push({
        id: legacy.id || makeId(),
        createdAt: legacy.createdAt || new Date().toISOString(),
        kind: 'upsert_workout_session',
        payload: legacy.payload,
        attempts: 0,
      });
    }
    saveItems(items);
    localStorage.removeItem(LEGACY_KEY);
     
    console.log(`[outbox] migrated ${arr.length} legacy items from ${LEGACY_KEY}`);
  } catch (e) {
     
    console.warn('[outbox] legacy migration failed:', e);
  }
}

// Run migration on module load. Module-level execution happens once per app
// session at the import boundary — exactly what we want.
migrateLegacyQueue();

// ── Kind dispatch ─────────────────────────────────────────────────────────
//
// Each kind maps to its handler. The payload shape MUST match the handler's
// expectations. New mutation type? Add a kind to the OutboxKind union, the
// KindPayload map, and an entry here. Existing call sites in logStore /
// nexusStore route through `enqueue('kind', payload)`.

const KIND_DISPATCH: { [K in OutboxKind]: (p: KindPayload[K]) => Promise<unknown> } = {
  upsert_workout_session: (p) => pushWorkoutToNexus(p),
  delete_workout_session: async (p) => {
    if (!isNexusConfigured) throw new Error('Nexus not configured');
    const { error } = await supabase.from('workout_sessions').delete().eq('id', p.id);
    if (error) throw error;
    // Sets cascade-delete via FK (workout_sets.session_id REFERENCES workout_sessions
    // ON DELETE CASCADE per the v1.0 schema).
  },
  upsert_body_metric: (p) => pushBodyMetricToNexus(p),
  delete_body_metric: (p) => deleteBodyMetricFromNexus(p.id),
  upsert_exercise_pr: (p) => pushExercisePRToNexus(p),
};
