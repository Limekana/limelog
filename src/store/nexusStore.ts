import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { supabase, isNexusConfigured } from '@/lib/supabase';
import { withCaptcha } from '@/lib/captcha';
import { signInWithGoogle as oauthSignInWithGoogle, initOAuthDeepLinkListener } from '@/lib/oauth';
import { setGuestMode, isGuestMode } from '@/lib/guestMode';
import { inheritFromNexus } from '@/lib/suiteSso';
import { scheduleOriginStamp } from '@/lib/originMarker';
// v1.2 — outbox replaces nexusSync's drainPendingQueue/getPendingCount as the
// persistence + retry layer. The actual push handler (pushWorkoutToNexus) is
// still in nexusSync.ts; the outbox dispatches to it via kind tables.
import {
  drain as outboxDrain,
  getStatus as outboxStatus,
  clear as outboxClear,
  installDrainTriggers as outboxInstallTriggers,
  type OutboxStatus,
} from '@/lib/outbox';
// v1.2.1 — AUDIT-LL-FSG-2: stores whose state we wipe on sign-out so
// User A's workout history / body data / progress photos don't surface
// under User B on a shared device. The cloud-side replay path is already
// closed (outboxClear above), so this is the LOCAL view-only leak fix.
// useProgramStore is intentionally NOT wiped — programs / exercises /
// workout templates are tool configuration, not history, and a global
// wipe would clobber the user's custom builtin overrides + force a
// re-seed of BUILTIN_EXERCISES that would lose their tweaks. The
// per-user scope of programs is tracked as a v1.3 design item.
import { useLogStore } from '@/store/logStore';
import { useBodyMetricsStore } from '@/store/bodyMetricsStore';
import { DEFAULT_PREFS as DEFAULT_BODY_METRICS_PREFS } from '@/types/bodyMetrics';

const SYNC_ENABLED_KEY = 'wt_nexus_sync_enabled';

function readSyncEnabled(): boolean {
  const raw = localStorage.getItem(SYNC_ENABLED_KEY);
  return raw === null ? true : raw === 'true';
}

function writeSyncEnabled(v: boolean): void {
  localStorage.setItem(SYNC_ENABLED_KEY, String(v));
}

interface NexusStore {
  configured: boolean;
  syncEnabled: boolean;
  userEmail: string | null;
  /** Display name from the identity provider, when it gives one. Needed so the
   *  avatar can show the same initials as NCC and StudyDesk, which both derive
   *  from the name and fall back to the address. Tracking only the email meant
   *  LimeLog could never agree with them. */
  userName: string | null;
  loading: boolean;
  lastError: string | null;
  pendingCount: number;
  lastPushAt: string | null;
  /** v1.2 — full outbox snapshot for the Settings status panel. Includes
   *  oldestEnqueuedAt, stuck count, lastError, lastSuccessAt — surfaced in
   *  the NexusSyncCard for diagnostic visibility. */
  outboxStatus: OutboxStatus;

  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  /** Resolves with whether the account still needs email confirmation — see
   *  the implementation note. Callers that don't care may ignore it. */
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  setSyncEnabled: (v: boolean) => void;
  retryPending: () => Promise<{ sent: number; remaining: number }>;
  refreshPendingCount: () => void;
  setLastPushAt: (iso: string) => void;
}

/** The provider's display name, or null. Supabase puts Google's on
 *  user_metadata.full_name; some providers use `name`. */
function displayNameOf(user: { user_metadata?: Record<string, unknown> } | null | undefined): string | null {
  const meta = user?.user_metadata ?? {};
  const n = String(meta.full_name || meta.name || '').trim();
  return n || null;
}

export const useNexusStore = create<NexusStore>((set, get) => ({
  configured: isNexusConfigured,
  syncEnabled: readSyncEnabled(),
  userEmail: null,
  userName: null,
  loading: false,
  lastError: null,
  pendingCount: outboxStatus().pending,
  outboxStatus: outboxStatus(),
  lastPushAt: null,

  init: async () => {
    if (!isNexusConfigured) return;
    initOAuthDeepLinkListener();
    // v1.2 — install global drain triggers (window.online + visibilitychange).
    // Idempotent — safe to call multiple times. Returns a teardown helper that
    // we intentionally don't use; the listeners live for the app's lifetime.
    outboxInstallTriggers();
    set({ loading: true });
    try {
      let user = (await supabase.auth.getUser()).data.user;

      // v1.1 — auto-inherit from NCC on cold start when no local session.
      //
      // Why: Supabase rotates refresh_tokens on every refresh (default
      // behavior). NCC + LimeLog + StudyDesk all share ONE logical session
      // via the SSO bundle, but each app's supabase client persists its own
      // copy. Whichever side refreshes second gets a stale refresh_token,
      // its auto-refresh fails, and onAuthStateChange fires SIGNED_OUT.
      // Symptom: every cold start of LimeLog (after NCC has rotated in the
      // background) lands the user on the auth screen needing to tap
      // "Continue with Nexus" again. Reported 2026-05-28.
      //
      // Fix: when getUser() returns no user, probe NCC's ContentProvider
      // and silently inherit. As long as NCC is signed in, this re-syncs
      // LimeLog to the latest published bundle. The user never sees the
      // auth screen unless NCC itself has signed out. Guest mode and the
      // web platform short-circuit this path — guests opted out of auth
      // explicitly; web has no native plugin to call.
      if (!user && Capacitor.isNativePlatform() && !isGuestMode()) {
        try {
          const result = await inheritFromNexus();
          if (result.ok) {
            user = (await supabase.auth.getUser()).data.user;
          }
        } catch (e) {
          // Silent — fall through to no-user state, FirstLaunchAuth will
          // render with the manual Continue-with-Nexus affordance as the
          // user-visible fallback.
          console.warn('[nexus] auto-inherit on init failed:', e);
        }
      }

      set({ userEmail: user?.email ?? null, userName: displayNameOf(user), loading: false });

      // ACT-5 — cover the restored-session path too, not just fresh sign-ins.
      // Every account that predates this instrumentation only ever appears here.
      scheduleOriginStamp(user ?? null);

      supabase.auth.onAuthStateChange((event, session) => {
        const wasSignedIn = Boolean(get().userEmail);
        const nowSignedIn = Boolean(session?.user);
        set({ userEmail: session?.user?.email ?? null, userName: displayNameOf(session?.user) });
        scheduleOriginStamp(session?.user ?? null);
        // v1.1 — clear guestMode on any successful sign-in. Without this,
        // a user who signed out (which sets guestMode=true) and later signs
        // in via NexusSyncCard's form would keep guestMode=true while
        // having a real session. The gate would still work (userEmail
        // wins), but if their session ever expired, the next cold start
        // would silently land them in guest mode instead of attempting
        // auto-inherit. Centralizing the clear here means every sign-in
        // path (email, Google, Nexus inherit, restored session) converges
        // to the same state.
        if (event === 'SIGNED_IN') {
          void setGuestMode(false);
          window.dispatchEvent(new CustomEvent('limelog:guest-mode-changed'));
        }
        if (!wasSignedIn && nowSignedIn && get().syncEnabled) {
          void outboxDrain().then((result) => {
            const status = outboxStatus();
            set({ pendingCount: result.remaining, outboxStatus: status });
          });
        }
      });

      if (user && get().syncEnabled) {
        const result = await outboxDrain();
        set({ pendingCount: result.remaining, outboxStatus: outboxStatus() });
      }
    } catch (err) {
      set({ loading: false, lastError: err instanceof Error ? err.message : String(err) });
    }
  },

  signIn: async (email, password) => {
    set({ loading: true, lastError: null });
    // withCaptcha only involves hCaptcha if the server asks for it — see
    // lib/captcha.ts for why this is not a widget on the screen.
    const { data, error } = await withCaptcha((captchaToken) =>
      supabase.auth.signInWithPassword({ email, password, options: { captchaToken } }));
    if (error) {
      set({ loading: false, lastError: error.message });
      throw error;
    }
    set({ userEmail: data.user?.email ?? null, userName: displayNameOf(data.user), loading: false });

    if (get().syncEnabled) {
      const result = await outboxDrain();
      set({ pendingCount: result.remaining, outboxStatus: outboxStatus() });
    }
  },

  signUp: async (email, password) => {
    set({ loading: true, lastError: null });
    const { data, error } = await withCaptcha((captchaToken) =>
      supabase.auth.signUp({ email, password, options: { captchaToken } }));
    if (error) {
      set({ loading: false, lastError: error.message });
      throw error;
    }
    set({ userEmail: data.user?.email ?? null, userName: displayNameOf(data.user), loading: false });
    // AUTH-2 — Supabase returns a session only when the project auto-confirms.
    // With confirmation required, `session` is null and the caller has to show
    // the code step rather than waiting on an auth-state change that never
    // comes. Reported rather than inferred: previously a successful signup
    // awaiting confirmation looked identical to a stall.
    return { needsConfirmation: !data.session };
  },

  signInWithGoogle: async () => {
    set({ loading: true, lastError: null });
    try {
      await oauthSignInWithGoogle();
      // Web flow redirects away; native flow returns here and the auth-state listener picks up the session.
      set({ loading: false });
    } catch (err) {
      set({ loading: false, lastError: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  signOut: async () => {
    set({ loading: true, lastError: null });
    // v1.2 — clear the outbox BEFORE the auth round-trip. Anything not yet
    // drained is forfeit vs. potentially leaking writes to the next signed-in
    // user on a shared device. Matches StudyDesk's sign-out hygiene contract.
    outboxClear();
    // v1.2.1 — AUDIT-LL-FSG-2: wipe the personal-data stores so the next
    // signed-in user (on a shared device) doesn't inherit User A's
    // workout history, bodyweight log, or progress photos in the UI.
    // Cloud-side data stays scoped to A's user_id; this only addresses
    // the on-device residue. Wipe order doesn't matter — each call
    // both clears the in-memory zustand state and removes the underlying
    // localStorage key so a refresh after sign-out doesn't re-hydrate.
    try {
      localStorage.removeItem('wt_session_logs');
      localStorage.removeItem('wt_jump_logs');
      localStorage.removeItem('wt_stall_flags');
      useLogStore.setState({ sessionLogs: [], jumpLogs: [], stallFlags: [] });
    } catch (e) {
      console.warn('[nexus] log-store wipe failed:', e);
    }
    try {
      localStorage.removeItem('limelog-body-metrics');
      localStorage.removeItem('limelog-body-metrics-prefs');
      // bodyMetricsStore reads DEFAULT_PREFS from types/bodyMetrics on the
      // next mount; the setState below restores in-memory state to that
      // baseline so an already-mounted BodyMetricsPanel re-renders empty
      // immediately rather than holding A's last-seen values.
      useBodyMetricsStore.setState({ metrics: [], prefs: DEFAULT_BODY_METRICS_PREFS });
    } catch (e) {
      console.warn('[nexus] body-metrics wipe failed:', e);
    }
    try {
      localStorage.removeItem('limelog-progress-photos');
    } catch (e) {
      console.warn('[nexus] progress-photos wipe failed:', e);
    }
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      set({ loading: false, lastError: error.message });
      throw error;
    }
    // v1.1 — set guestMode TRUE on sign-out (was previously cleared to false).
    //
    // Why: nexusStore.init silently re-inherits from NCC on cold start if
    // the local session is missing AND guestMode is false (see the
    // refresh-token-rotation fix earlier in this file). Setting guestMode
    // to false here would mean the user's next app launch silently undoes
    // their sign-out by inheriting NCC's still-active session — bug report
    // 2026-05-28 "sign out buttons don't seem to do anything."
    //
    // Setting it to TRUE achieves two goals:
    //   1. The user lands in guest mode immediately. The app stays usable
    //      (no FirstLaunchAuth bounce); NexusSyncCard flips from the
    //      signed-in view to the sign-in form, which is the clear visible
    //      confirmation that sign-out completed.
    //   2. The next cold start respects guestMode and skips auto-inherit.
    //      The sign-out actually sticks.
    //
    // To re-sign-in later, the user opens Profile → Settings → Nexus sync
    // and uses Continue with Nexus / Google / email. Those paths each
    // clear guestMode via their own success handlers.
    await setGuestMode(true);
    window.dispatchEvent(new CustomEvent('limelog:guest-mode-changed'));
    set({
      userEmail: null,
      userName: null,
      loading: false,
      pendingCount: 0,
      outboxStatus: outboxStatus(),
    });
  },

  setSyncEnabled: (v) => {
    writeSyncEnabled(v);
    set({ syncEnabled: v });
  },

  retryPending: async () => {
    const result = await outboxDrain();
    set({ pendingCount: result.remaining, outboxStatus: outboxStatus() });
    return result;
  },

  refreshPendingCount: () => {
    const status = outboxStatus();
    set({ pendingCount: status.pending, outboxStatus: status });
  },

  setLastPushAt: (iso) => {
    set({ lastPushAt: iso });
  },
}));
