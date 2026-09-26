import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FDROID_PAGE, checkFdroidUpdate, dismissUpdate, useFdroidUpdate } from '@/lib/fdroidUpdate';
import './FdroidUpdateNote.css';

// v1.16 (#26) — the "newer LimeLog on F-Droid" note. The logic, and why it is
// shaped the way it is, lives in src/lib/fdroidUpdate.ts.
//
// Mounted in Layout above the page, so it shows on every tab and never on the
// fullscreen workout screen: nobody should be told about an update between
// sets. Inline rather than a floating card, so it cannot cover the nav or
// collide with the referral prompt, which owns the corner above it.
//
// Same voice as the rest of LimeLog: uppercase display type, a raised panel,
// and the version change as a plate change — the old number struck, the new
// one in lime. The action is secondary so the lime stays on the number.

// After first paint and the initial sync, so it never competes with startup.
const CHECK_DELAY_MS = 4000;

export function FdroidUpdateNote() {
  const { t } = useTranslation();
  const { available } = useFdroidUpdate();

  useEffect(() => {
    const id = setTimeout(() => {
      void checkFdroidUpdate();
    }, CHECK_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  if (!available) return null;
  const { current, latest } = available;
  const latestLabel = latest.name || `#${latest.code}`;

  return (
    <aside className="upd-note" aria-label={t('update.eyebrow')}>
      <div className="upd-note__head">
        <span className="upd-note__eyebrow">{t('update.eyebrow')}</span>
        <span
          className="upd-note__versions"
          aria-label={t('update.versions', { current: current.name, latest: latestLabel })}
        >
          <s>{current.name}</s>
          <span aria-hidden="true">→</span>
          <span className="upd-note__new">{latestLabel}</span>
        </span>
      </div>
      <div className="upd-note__title">{t('update.title', { version: latestLabel })}</div>
      <div className="upd-note__actions">
        <a className="btn btn--secondary btn--sm upd-note__open" href={FDROID_PAGE} target="_blank" rel="noopener noreferrer">
          {t('update.open')}
        </a>
        <button type="button" className="upd-note__later" onClick={dismissUpdate}>
          {t('update.later')}
        </button>
      </div>
    </aside>
  );
}
