// v1.4 — cross-app SSO consumer (LimeLog side).
//
// Queries NCC's signature-protected SessionContentProvider for an active
// Supabase session and hands the bundle to supabase.auth.setSession so
// the user inherits NCC's sign-in without a separate Google round-trip.
//
// Failure modes (all surface via { available: false, reason }):
//   - NCC not installed
//   - LimeLog signed with a different cert than NCC
//   - NCC has no active session (user signed out, or never signed in)
//
// Caller flow: show "Continue with Nexus" button → call inheritFromNexus()
// → on { ok: true } the supabase client is now authenticated and the
// normal store init (nexusStore.init in App.tsx) takes over. On
// { ok: false } show the reason and fall back to the existing sign-in UI.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '@/lib/supabase';

interface SuiteSsoPluginAndroid {
  getNexusSession(): Promise<{
    available: boolean;
    reason?: string;
    bundleJson?: string;
    publishedAt?: number;
  }>;
}

// Plugin name MUST match @CapacitorPlugin(name = "SuiteSso") on the Java
// side. registerPlugin is the canonical Capacitor 5+ binding for custom
// plugins registered via MainActivity.registerPlugin(...).
const SuiteSso = registerPlugin<SuiteSsoPluginAndroid>('SuiteSso');

interface InheritResult {
  ok: boolean;
  reason?: string;
  email?: string;
}

/** Pull NCC's active session and apply it to LimeLog's Supabase client.
 *  No-op on web (sibling apps don't exist there). */
export async function inheritFromNexus(): Promise<InheritResult> {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, reason: 'Cross-app sign-in is only available on Android.' };
  }
  let queryResult: Awaited<ReturnType<SuiteSsoPluginAndroid['getNexusSession']>>;
  try {
    queryResult = await SuiteSso.getNexusSession();
  } catch (e) {
    return { ok: false, reason: 'SSO plugin unavailable: ' + (e as Error).message };
  }
  if (!queryResult.available) {
    return { ok: false, reason: queryResult.reason ?? 'No Nexus session available.' };
  }
  let bundle: { access_token?: string; refresh_token?: string; email?: string };
  try {
    bundle = JSON.parse(queryResult.bundleJson ?? '{}');
  } catch {
    return { ok: false, reason: 'Nexus returned a malformed session bundle.' };
  }
  if (!bundle.access_token || !bundle.refresh_token) {
    return { ok: false, reason: 'Nexus session missing required tokens.' };
  }
  // supabase.auth.setSession trades the refresh_token for a fresh
  // access_token if needed AND fires onAuthStateChange, so LimeLog's
  // existing nexusStore.init wiring takes over automatically.
  const { error } = await supabase.auth.setSession({
    access_token: bundle.access_token,
    refresh_token: bundle.refresh_token,
  });
  if (error) {
    return { ok: false, reason: 'Supabase rejected the inherited session: ' + error.message };
  }
  return { ok: true, email: bundle.email };
}
