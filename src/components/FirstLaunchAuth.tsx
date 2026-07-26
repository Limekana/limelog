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
import { useTranslation } from 'react-i18next';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Button, Card } from '@/components/ui';
import { useNexusStore } from '@/store/nexusStore';
import { inheritFromNexus } from '@/lib/suiteSso';
import { setGuestMode } from '@/lib/guestMode';
import { translateAuthError } from '@/lib/authErrors';
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
  const { t } = useTranslation();
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
        setError(result.reason ?? t('auth.errNexus'));
        setBusy(false);
        return;
      }
      // nexusStore's auth-state listener fires; App.tsx re-evaluates and
      // routes away from this screen on its own. Clear guest flag too in
      // case the user was in guest mode and is now upgrading.
      await setGuestMode(false);
      onContinue();
    } catch (err) {
      setError(translateAuthError(err as Error, t));
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
      setError(translateAuthError(err as Error, t));
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
      setError(translateAuthError(err as Error, t));
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
          {/* "LimeLog" is the product name — deliberately not a key. */}
          <div className="fla-wordmark">LimeLog</div>
          <div className="fla-tagline">{t('auth.tagline')}</div>
        </div>

        <Card padding="md" className="fla-card">
          <div className="fla-title">
            {showEmail
              ? mode === 'signin'
                ? t('auth.titleSignInEmail')
                : t('auth.titleCreateAccount')
              : t('auth.titleGetStarted')}
          </div>
          <div className="fla-sub">
            {showEmail ? t('auth.subEmail') : t('auth.subGetStarted')}
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
                    {t('auth.nexus')}
                  </Button>
                  <p className="fla-nexus-note">{t('auth.nexusNote')}</p>
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
                {t('auth.google')}
              </Button>

              <button
                type="button"
                className="fla-toggle"
                onClick={() => setShowEmail(true)}
                disabled={disabled}
              >
                {t('auth.useEmail')}
              </button>
            </div>
          )}

          {showEmail && (
            <form onSubmit={handleEmail} className="fla-form">
              <label className="fla-field">
                <span className="fla-field-label">{t('auth.emailLabel')}</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="fla-field">
                <span className="fla-field-label">{t('auth.passwordLabel')}</span>
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
                {disabled ? '…' : mode === 'signin' ? t('auth.signIn') : t('auth.createAccount')}
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
                  {mode === 'signin' ? t('auth.needAccount') : t('auth.haveAccount')}
                </button>
                <button
                  type="button"
                  className="fla-toggle"
                  onClick={() => setShowEmail(false)}
                >
                  {t('auth.back')}
                </button>
              </div>
            </form>
          )}

          {error && <p className="fla-error">{error}</p>}
          {!configured && <p className="fla-warn">{t('auth.notConfigured')}</p>}
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
            {t('auth.guest')}
          </button>
          <p className="fla-guest-note">{t('auth.guestNote')}</p>
        </div>
      </div>
    </div>
  );
}
