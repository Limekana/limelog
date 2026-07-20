import { createClient } from '@supabase/supabase-js';

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

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'wt_nexus_auth',
  },
});

export const isNexusConfigured = Boolean(url && anonKey);
