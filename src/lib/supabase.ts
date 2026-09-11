import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';

// Supabase backend — overridable at build time via Vite env vars so the app
// can be re-built against a self-hosted Supabase instance without forking
// (see `.env.example`). The defaults below point at the canonical Limecore
// project, matching NCC (`src/lib/supabase.ts`) and StudyDesk
// (`src/lib/supabase.js`), so any public build keeps working.
//
// These MUST have hardcoded defaults, not env-only values. Vite inlines
// `import.meta.env` at build time and `.env` is gitignored, so a build from a
// clean source checkout — which is exactly what F-Droid does — baked in
// `undefined` and shipped an app whose createClient threw "supabaseUrl is
// required." at startup: no sign-in, no sync. It also made the build
// unreproducible, since our local output embedded values the public source
// could not produce. The anon key is publishable (RLS is the access gate) and
// is already inlined in every released APK, so committing it exposes nothing.
const url =
  import.meta.env.VITE_SUPABASE_URL || 'https://hkktorzhaqnfqsnlstda.supabase.co';
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ykHLJ4QuFm2HKXACygwezw_c_cvR_yf';

// ── Where the session actually lives ───────────────────────────────────────
//
// With no `storage` option supabase-js defaults to the WebView's
// localStorage. NCC has used Capacitor Preferences since v1.7 and StudyDesk
// since v1.10, both for the reason their comments give: Preferences is
// Android SharedPreferences, and localStorage is WebView storage that Android
// evicts under pressure. This app was the one that never got the port, so it
// was the one whose users were silently signed out when the system decided it
// needed the space — with nothing on the server to show for it, because from
// Supabase's side nothing happened at all.
//
// `getItem` falls back to localStorage on a MISSING value, not only on a
// thrown one. That is the upgrade path: every existing install has its session
// in localStorage right now, and without the read-through every one of them
// would be signed out by this very fix. Found once, it is written into
// Preferences, so the fallback is a migration rather than a permanent second
// home.
const capacitorStorage: SupportedStorage = {
  async getItem(key) {
    try {
      const { value } = await Preferences.get({ key });
      if (value !== null && value !== undefined) return value;
      // Nothing in Preferences: this is either a fresh install or an install
      // upgrading from the localStorage era. Migrate rather than sign out.
      const legacy = localStorage.getItem(key);
      if (legacy !== null) {
        try {
          await Preferences.set({ key, value: legacy });
          localStorage.removeItem(key);
        } catch {
          /* keep the legacy copy; it is still the live session */
        }
      }
      return legacy;
    } catch {
      return localStorage.getItem(key);
    }
  },
  async setItem(key, value) {
    try {
      await Preferences.set({ key, value });
    } catch {
      localStorage.setItem(key, value);
    }
  },
  async removeItem(key) {
    try {
      await Preferences.remove({ key });
    } catch {
      /* fall through — the localStorage copy below must go either way */
    }
    try {
      localStorage.removeItem(key);
    } catch {
      /* private mode */
    }
  },
};

export const supabase = createClient(url, anonKey, {
  auth: {
    // Web keeps localStorage: there is no Preferences plugin in a browser, the
    // eviction problem is an Android WebView one, and wrapping a synchronous
    // store in an async shim there buys nothing.
    storage: Capacitor.isNativePlatform() ? capacitorStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'wt_nexus_auth',
  },
});

// ── Mobile session durability (v1.10) ───────────────────────────────────
// Ported from NCC's supabase.ts, which got this in v1.7; this app never did.
// supabase-js drives its token auto-refresh loop off browser visibility /
// `online` events. In a Capacitor Android WebView those fire unreliably once
// the app is paused, so a backgrounded app can sail past the access-token
// expiry without refreshing. Driving the loop off the native app lifecycle
// instead is Supabase's documented mobile fix: stop on background, (re)start
// on foreground. startAutoRefresh() also runs an immediate tick, so a token
// that expired while backgrounded is refreshed the moment the app returns.
if (Capacitor.isNativePlatform()) {
  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}

export const isNexusConfigured = Boolean(url && anonKey);
