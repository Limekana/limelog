import { useState } from 'react';
import { useNexusStore } from '@/store/nexusStore';
import { Button, Card, Badge } from '@/components/ui';
import { Cloud, CloudOff } from 'lucide-react';
import './NexusSyncCard.css';

export function NexusSyncCard() {
  const {
    configured,
    syncEnabled,
    userEmail,
    loading,
    lastError,
    pendingCount,
    lastPushAt,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    setSyncEnabled,
    retryPending,
  } = useNexusStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [localError, setLocalError] = useState<string | null>(null);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
      }
      setPassword('');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleGoogle() {
    setLocalError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRetry() {
    setRetryStatus('Retrying…');
    const result = await retryPending();
    setRetryStatus(
      result.sent > 0
        ? `Sent ${result.sent}, ${result.remaining} still queued`
        : result.remaining > 0
          ? `${result.remaining} still queued`
          : 'Queue empty'
    );
    setTimeout(() => setRetryStatus(null), 3000);
  }

  if (!configured) {
    return (
      <Card padding="md">
        <div className="nexus-card__header">
          <CloudOff size={18} />
          <span className="settings-field__label" style={{ margin: 0 }}>Nexus sync</span>
        </div>
        <p className="nexus-card__hint">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code>,
          then rebuild to enable.
        </p>
      </Card>
    );
  }

  return (
    <Card padding="md">
      <div className="nexus-card__header">
        <Cloud size={18} />
        <span className="settings-field__label" style={{ margin: 0 }}>Nexus sync</span>
        {userEmail && <Badge label="Connected" variant="success" />}
      </div>

      {userEmail ? (
        <>
          <p className="nexus-card__signed-in">
            Signed in as <strong>{userEmail}</strong>
          </p>

          <div className="nexus-card__row">
            <span className="settings-field__sublabel">Auto-push on finish</span>
            <button
              className={`settings-toggle__btn${syncEnabled ? ' settings-toggle__btn--active' : ''}`}
              onClick={() => setSyncEnabled(!syncEnabled)}
              style={{ flex: 'none', padding: '6px 14px' }}
            >
              {syncEnabled ? 'On' : 'Off'}
            </button>
          </div>

          <div className="nexus-card__row">
            <span className="settings-field__sublabel">
              {pendingCount > 0
                ? `${pendingCount} workout${pendingCount > 1 ? 's' : ''} queued`
                : 'Queue empty'}
            </span>
            {pendingCount > 0 && (
              <Button size="sm" variant="secondary" onClick={handleRetry}>
                Retry now
              </Button>
            )}
          </div>

          {retryStatus && <p className="nexus-card__status">{retryStatus}</p>}

          {lastPushAt && (
            <p className="nexus-card__meta">
              Last push: {new Date(lastPushAt).toLocaleTimeString()}
            </p>
          )}

          {lastError && <p className="nexus-card__error">{lastError}</p>}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => void signOut()}
            disabled={loading}
            className="nexus-card__signout"
          >
            Sign out
          </Button>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="nexus-card__form">
          <Button
            type="button"
            variant="secondary"
            size="md"
            fullWidth
            onClick={handleGoogle}
            disabled={loading}
            className="nexus-card__google"
          >
            Continue with Google
          </Button>

          <div className="nexus-card__divider">
            <span>or use email</span>
          </div>

          <label className="settings-field">
            <span className="settings-field__sublabel">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="settings-field settings-field--mt">
            <span className="settings-field__sublabel">Password</span>
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>

          {(localError ?? lastError) && (
            <p className="nexus-card__error">{localError ?? lastError}</p>
          )}

          <div className="nexus-card__actions">
            <Button type="submit" variant="primary" size="sm" disabled={loading}>
              {loading ? '…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
            </Button>
            <button
              type="button"
              className="nexus-card__toggle"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setLocalError(null);
              }}
            >
              {mode === 'signin' ? 'Need an account?' : 'Have an account?'}
            </button>
          </div>

          {pendingCount > 0 && (
            <p className="nexus-card__meta">
              {pendingCount} workout{pendingCount > 1 ? 's' : ''} queued — will sync after sign-in.
            </p>
          )}
        </form>
      )}
    </Card>
  );
}
