// First-launch sign-in screen for LimeLog. Replaces the buried-in-Settings
// auth flow with an upfront affordance: sign in to enable Nexus sync, or
// continue locally without an account.
//
// Order of options (suite-wide convention):
//   1. Continue with Nexus — only shown when NCC is installed on this device
//      and has a published session. Inverted-card lime styling marks it as
//      the suite-native path.
//   2. Continue with Google — secondary card.
//   3. Use email instead — collapsed by default.
//   4. Continue as guest  — clearly last, with a caption explaining the
//      local-only trade-off.

import { useState, useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Button, Card } from '@/components/ui';
import { useNexusStore } from '@/store/nexusStore';
import { inheritFromNexus } from '@/lib/suiteSso';
import { setGuestMode } from '@/lib/guestMode';
import './FirstLaunchAuth.css';

const SuiteSsoProbe = registerPlugin<{
  getNexusSession(): Promise<{ available: boolean; reason?: string }>;
}>('SuiteSso');

interface FirstLaunchAuthProps {
  /** Called after the user picks any option that resolves to "let me in" —
   *  either a successful sign-in OR tapping Continue as Guest. The parent
   *  (App.tsx) re-evaluates its gate after this fires. */
  onContinue: () => void;
}

export function FirstLaunchAuth({ onContinue }: FirstLaunchAuthProps) {
  const { signIn, signUp, signInWithGoogle, configured, loading: storeLoading } =
    useNexusStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [showEmail, setShowEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nexusAvailable, setNexusAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  // Probe NCC's SessionContentProvider on mount. Silent on failure: when NCC
  // isn't installed or there's no published session, the affordance just
  // doesn't render. See NexusSyncCard for the symmetric probe in Settings.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await SuiteSsoProbe.getNexusSession();
        if (!cancelled && result.available) setNexusAvailable(true);
      } catch {
        /* fall through to Google/email path */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleNexus() {
    setError(null);
    setBusy(true);
    try {
      const result = await inheritFromNexus();
      if (!result.ok) {
        setError(result.reason ?? 'Could not inherit Nexus session.');
        setBusy(false);
        return;
      }
      // nexusStore's auth-state listener fires; App.tsx re-evaluates and
      // routes away from this screen on its own. Clear guest flag too in
      // case the user was in guest mode and is now upgrading.
      await setGuestMode(false);
      onContinue();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      // v1.1 — UI/UX review #12: do NOT clear guestMode here. signInWithGoogle
      // kicks off an OAuth round-trip that the user can abort by closing the
      // Chrome Custom Tab. If we cleared the flag pre-emptively and they
      // aborted, they'd lose their guest-mode state with no completed sign-in
      // to replace it. Instead, let the success path handle it — nexusStore's
      // onAuthStateChange fires SIGNED_IN when the OAuth completes, and the
      // session-driven re-render takes care of leaving FirstLaunchAuth. The
      // guest flag only really matters when there's no session; once we have
      // one, the gate ignores it.
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
      }
      await setGuestMode(false);
      setPassword('');
      // onAuthStateChange in nexusStore drives the parent re-render.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGuest() {
    await setGuestMode(true);
    onContinue();
  }

  const disabled = busy || storeLoading;

  return (
    <div className="fla-wrap">
      <div className="fla-stack">
        <div className="fla-header">
          <div className="fla-wordmark">LimeLog</div>
          <div className="fla-tagline">PERIODIZED STRENGTH · LOCK IN</div>
        </div>

        <Card padding="md" className="fla-card">
          <div className="fla-title">
            {showEmail
              ? mode === 'signin'
                ? 'Sign in with email'
                : 'Create account'
              : 'Get started'}
          </div>
          <div className="fla-sub">
            {showEmail
              ? 'Sync workouts across devices.'
              : 'Sign in to sync workouts to Nexus, or continue locally.'}
          </div>

          {!showEmail && (
            <div className="fla-actions">
              {/* Suite-native path — inverted lime card. Only visible when
                  NCC is installed and signed in on this device. */}
              {nexusAvailable && (
                <>
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    fullWidth
                    onClick={handleNexus}
                    disabled={disabled}
                    className="fla-nexus"
                  >
                    <span className="fla-nexus-glyph" aria-hidden="true">◈</span>
                    Continue with Nexus
                  </Button>
                  <p className="fla-nexus-note">
                    SIGNED IN TO NEXUS COMMAND CENTER ON THIS DEVICE
                  </p>
                </>
              )}

              <Button
                type="button"
                variant={nexusAvailable ? 'secondary' : 'primary'}
                size="md"
                fullWidth
                onClick={handleGoogle}
                disabled={disabled}
              >
                Continue with Google
              </Button>

              <button
                type="button"
                className="fla-toggle"
                onClick={() => setShowEmail(true)}
                disabled={disabled}
              >
                Use email instead
              </button>
            </div>
          )}

          {showEmail && (
            <form onSubmit={handleEmail} className="fla-form">
              <label className="fla-field">
                <span className="fla-field-label">Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="fla-field">
                <span className="fla-field-label">Password</span>
                <input
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </label>

              <Button
                type="submit"
                variant="primary"
                size="md"
                fullWidth
                disabled={disabled}
              >
                {disabled ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>

              <div className="fla-form-footer">
                <button
                  type="button"
                  className="fla-toggle"
                  onClick={() => {
                    setMode(mode === 'signin' ? 'signup' : 'signin');
                    setError(null);
                  }}
                >
                  {mode === 'signin' ? 'Need an account?' : 'Have an account?'}
                </button>
                <button
                  type="button"
                  className="fla-toggle"
                  onClick={() => setShowEmail(false)}
                >
                  Back
                </button>
              </div>
            </form>
          )}

          {error && <p className="fla-error">{error}</p>}
          {!configured && (
            <p className="fla-warn">
              Supabase not configured — sign-in unavailable. Tap Continue as
              guest to use the app locally.
            </p>
          )}
        </Card>

        {/* Guest path — visually below the card, distinct from the sign-in
            affordances. Keeps the "continue" verb to make the implication
            ("you'll use it without an account") obvious. */}
        <div className="fla-guest">
          <button
            type="button"
            className="fla-guest-btn"
            onClick={handleGuest}
            disabled={disabled}
          >
            Continue as guest
          </button>
          <p className="fla-guest-note">
            Local only — workouts stay on this device. You can sign in later
            from Profile → Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
