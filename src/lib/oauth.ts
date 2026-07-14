import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { supabase } from './supabase';

const NATIVE_REDIRECT = 'com.limecore.workouttracker://auth/callback';

function webRedirect(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = isNative() ? NATIVE_REDIRECT : webRedirect();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: isNative(),
    },
  });

  if (error) throw error;

  if (isNative()) {
    if (!data?.url) throw new Error('No OAuth URL returned from Supabase');
    await Browser.open({ url: data.url, presentationStyle: 'popover' });
  }
  // Web path: Supabase JS performs the redirect itself, page navigates away.
}

let deepLinkInitialized = false;

export function initOAuthDeepLinkListener(): void {
  if (deepLinkInitialized) return;
  if (!isNative()) return;
  deepLinkInitialized = true;

  void App.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(NATIVE_REDIRECT)) return;

    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      }
      // No implicit-flow (URL-fragment token) fallback: the app is PKCE-only
      // (supabase.ts flowType: 'pkce'), and MainActivity is an exported,
      // BROWSABLE deep-link target — so trusting access_token/refresh_token
      // straight out of the hash would let any app or crafted link fixate a
      // session with attacker-controlled tokens. Only the verified ?code=
      // exchange (PKCE code_verifier bound) is accepted.
    } catch (err) {
       
      console.warn('[nexus] OAuth callback failed:', err);
    } finally {
      await Browser.close().catch(() => undefined);
    }
  });
}
