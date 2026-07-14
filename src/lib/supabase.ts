import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
   
  console.warn(
    '[nexus] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — Nexus sync will be disabled until they are set.'
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'wt_nexus_auth',
  },
});

export const isNexusConfigured = Boolean(url && anonKey);
