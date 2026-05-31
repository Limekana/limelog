// Guest-mode flag — lets users skip the first-launch auth screen and use
// LimeLog locally without a Nexus / Supabase session. Cloud sync stays
// disabled until the user signs in (Continue with Nexus / Google / email
// from either the first-launch screen on a fresh install, or from Profile →
// Settings → Nexus sync card later).
//
// Stored in localStorage (key `limelog.guestMode`) to match LimeLog's
// existing flag-storage pattern (see SYNC_ENABLED_KEY in nexusStore.ts).
// Capacitor's WebView localStorage persists across launches on Android
// (lives in /data/data/<pkg>/app_webview); only "Clear data" / uninstall
// wipes it, both of which legitimately drop the user back to the auth
// screen anyway.
//
// State transitions:
//   First launch       → flag absent → FirstLaunchAuth shown
//   Tap Continue Guest → flag set    → FirstLaunchAuth dismissed
//   Sign in from guest → flag cleared
//   Sign out           → flag cleared (so user lands back on FirstLaunchAuth)

const KEY = 'limelog.guestMode';

export function isGuestMode(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setGuestMode(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(KEY, '1');
    } else {
      localStorage.removeItem(KEY);
    }
  } catch {
    /* swallow — best-effort flag */
  }
}
