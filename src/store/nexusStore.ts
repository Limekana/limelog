import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { supabase, isNexusConfigured } from '@/lib/supabase';
import { drainPendingQueue, getPendingCount } from '@/lib/nexusSync';
import { signInWithGoogle as oauthSignInWithGoogle, initOAuthDeepLinkListener } from '@/lib/oauth';
import { setGuestMode, isGuestMode } from '@/lib/guestMode';
import { inheritFromNexus } from '@/lib/suiteSso';

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
  loading: boolean;
  lastError: string | null;
  pendingCount: number;
  lastPushAt: string | null;

  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  setSyncEnabled: (v: boolean) => void;
  retryPending: () => Promise<{ sent: number; remaining: number }>;
  refreshPendingCount: () => void;
  setLastPushAt: (iso: string) => void;
}

export const useNexusStore = create<NexusStore>((set, get) => ({
  configured: isNexusConfigured,
  syncEnabled: readSyncEnabled(),
  userEmail: null,
  loading: false,
  lastError: null,
  pendingCount: getPendingCount(),
  lastPushAt: null,

  init: async () => {
    if (!isNexusConfigured) return;
    initOAuthDeepLinkListener();
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

      set({ userEmail: user?.email ?? null, loading: false });

      supabase.auth.onAuthStateChange((event, session) => {
        const wasSignedIn = Boolean(get().userEmail);
        const nowSignedIn = Boolean(session?.user);
        set({ userEmail: session?.user?.email ?? null });
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
          void drainPendingQueue().then((result) => set({ pendingCount: result.remaining }));
        }
      });

      if (user && get().syncEnabled) {
        const result = await drainPendingQueue();
        set({ pendingCount: result.remaining });
      }
    } catch (err) {
      set({ loading: false, lastError: err instanceof Error ? err.message : String(err) });
    }
  },

  signIn: async (email, password) => {
    set({ loading: true, lastError: null });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ loading: false, lastError: error.message });
      throw error;
    }
    set({ userEmail: data.user?.email ?? null, loading: false });

    if (get().syncEnabled) {
      const result = await drainPendingQueue();
      set({ pendingCount: result.remaining });
    }
  },

  signUp: async (email, password) => {
    set({ loading: true, lastError: null });
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      set({ loading: false, lastError: error.message });
      throw error;
    }
    set({ userEmail: data.user?.email ?? null, loading: false });
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
    const { error } = await supabase.auth.signOut();
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
    set({ userEmail: null, loading: false });
  },

  setSyncEnabled: (v) => {
    writeSyncEnabled(v);
    set({ syncEnabled: v });
  },

  retryPending: async () => {
    const result = await drainPendingQueue();
    set({ pendingCount: result.remaining });
    return result;
  },

  refreshPendingCount: () => {
    set({ pendingCount: getPendingCount() });
  },

  setLastPushAt: (iso) => {
    set({ lastPushAt: iso });
  },
}));
