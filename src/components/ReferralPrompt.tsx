import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  REFERRAL_OPTIONS,
  REFERRAL_DISMISSED,
  recordReferralSource,
  shouldAskReferral,
} from '@/lib/referralSource';
import './ReferralPrompt.css';

// Item 8 — asks once, ever, then gets out of the way. See referralSource.ts
// for why this is self-reported and why it lives in auth metadata.
//
// Deliberately NOT a modal. This fires on a brand-new account's first real
// session, precisely the moment activation is decided; a blocking overlay
// demanding an answer before the app can be used would damage the number it
// exists to measure. It is a corner panel that can be ignored outright.
//
// Reads the user directly rather than from nexusStore: the store tracks
// `userEmail` / `userName`, not the User object, and adding a field to shared
// auth state for one instrumentation card is the larger change. This is
// mounted inside the authenticated route tree, so it remounts on sign-in and
// a one-shot read at mount is enough — guests get null and are never asked.
export function ReferralPrompt() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user ?? null;
      if (cancelled || !shouldAskReferral(u)) return;
      setUser(u);
      // Short beat before appearing, so this reads as an aside rather than
      // the next step of onboarding — which is what would make people answer
      // at random just to clear it.
      timer = setTimeout(() => setVisible(true), 1200);
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!visible || !user) return null;

  const answer = (source: string) => {
    recordReferralSource(user, source);
    // Leave the acknowledgement up briefly so the tap has a result; `closing`
    // also unmounts the buttons, so a double-tap cannot fire a second write
    // against a now-stale hasReferralSource read.
    setClosing(true);
    setTimeout(() => setVisible(false), 900);
  };

  return (
    <div className="ref-card" role="dialog" aria-live="polite" aria-label={t('referral.title')}>
      {closing ? (
        <div className="ref-thanks">{t('referral.thanks')}</div>
      ) : (
        <>
          <div className="ref-eyebrow">{t('referral.eyebrow')}</div>
          <div className="ref-title">{t('referral.title')}</div>
          <div className="ref-options">
            {REFERRAL_OPTIONS.map((key) => (
              <button key={key} type="button" className="ref-option" onClick={() => answer(key)}>
                {t(`referral.opt.${key}`)}
              </button>
            ))}
          </div>
          <button type="button" className="ref-dismiss" onClick={() => answer(REFERRAL_DISMISSED)}>
            {t('referral.dismiss')}
          </button>
        </>
      )}
    </div>
  );
}
