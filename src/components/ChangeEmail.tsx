// v1.17 (limecore#10) — change the account's login email, from the sync card.
//
// Same flow as StudyDesk's and NCC's: all three apps share one Supabase auth
// user, so one updateUser({ email }) changes the address everywhere. With
// "Secure email change" on, a link goes to the current address and one to the
// new address, and the change takes effect once both are opened. The links land
// on limecore.dev/confirmed (?flow=email-change, on the redirect allow list).
//
// Only for accounts that sign in with email and password: a Google account's
// address comes from Google. The user is read with getUser(), which asks the
// server without rotating any token, so it also gives the pending change.
//
// Supporters keep their Ko-fi renewals across a change: kofi_match_user follows
// the address an entitlement was paid with (applied 2026-10-05, NCC#122).

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { enterSubmit } from '@/lib/imeSubmit';
import { Button } from '@/components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REDIRECT = 'https://limecore.dev/confirmed?flow=email-change';

export function ChangeEmail({ userEmail }: { userEmail: string }) {
  const { t } = useTranslation();
  const [usesPassword, setUsesPassword] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    supabase.auth.getUser()
      .then(({ data }) => {
        if (!live || !data.user) return;
        const u = data.user;
        const providers = (u.app_metadata?.providers as string[] | undefined) ?? [u.app_metadata?.provider];
        setUsesPassword(!u.is_anonymous && providers.includes('email'));
        setPending(u.new_email ?? null);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [userEmail]);

  if (!usesPassword) return null;

  const send = async () => {
    const next = value.trim().toLowerCase();
    if (!EMAIL_RE.test(next)) { setMsg(t('sync.changeEmailInvalid')); return; }
    if (next === userEmail.toLowerCase()) { setMsg(t('sync.changeEmailSame')); return; }
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ email: next }, { emailRedirectTo: REDIRECT });
      if (error) throw error;
      setPending(next);
      setValue('');
      setOpen(false);
    } catch (e) {
      const err = e as { code?: string; status?: number };
      const code = err.code ?? '';
      setMsg(
        code === 'email_exists' ? t('sync.changeEmailTaken')
          : code === 'email_address_invalid' ? t('sync.changeEmailInvalid')
            : /rate_limit/.test(code) || err.status === 429 ? t('sync.changeEmailRateLimit')
              : t('sync.changeEmailFailed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {pending && (
        <p className="nexus-card__meta">{t('sync.changeEmailPending', { current: userEmail, next: pending })}</p>
      )}
      {open ? (
        <div className="nexus-card__form">
          <p className="nexus-card__meta">{t('sync.changeEmailWhy')}</p>
          <label className="settings-field">
            <span className="settings-field__sublabel">{t('sync.changeEmailLabel')}</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              {...enterSubmit(() => { void send(); })}
            />
          </label>
          <div className="nexus-card__actions">
            <Button size="sm" variant="primary" onClick={() => void send()} disabled={busy || !value.trim()}>
              {t('sync.changeEmailSend')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setMsg(null); }}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => { setOpen(true); setMsg(null); }}>
          {t('sync.changeEmail')}
        </Button>
      )}
      {msg && <p className="nexus-card__error">{msg}</p>}
    </>
  );
}
