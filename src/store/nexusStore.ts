import { create } from 'zustand';
import { supabase, isNexusConfigured } from '@/lib/supabase';
import { drainPendingQueue, getPendingCount } from '@/lib/nexusSync';
import { signInWithGoogle as oauthSignInWithGoogle, initOAuthDeepLinkListener } from '@/lib/oauth';

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
      const { data: { user } } = await supabase.auth.getUser();
      set({ userEmail: user?.email ?? null, loading: false });

      supabase.auth.onAuthStateChange((_event, session) => {
        const wasSignedIn = Boolean(get().userEmail);
        const nowSignedIn = Boolean(session?.user);
        set({ userEmail: session?.user?.email ?? null });
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
