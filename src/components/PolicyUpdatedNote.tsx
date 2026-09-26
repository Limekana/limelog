import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { POLICY_URL, acknowledgePolicy, policyNoticeDue } from '@/lib/policyNotice';
import './ErrorBoundary.css';

// v1.16 (limecore#16, NCC#50) — the one-time "privacy policy updated" note.
// Who sees it, and why, is in lib/policyNotice.ts.
export function PolicyUpdatedNote() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(policyNoticeDue);
  if (!open) return null;
  const close = () => {
    acknowledgePolicy();
    setOpen(false);
  };
  return (
    <aside className="pol-note" aria-label={t('policy.eyebrow')}>
      <div className="pol-note__eyebrow">{t('policy.eyebrow')}</div>
      <p className="pol-note__body">{t('policy.body')}</p>
      <div className="pol-note__actions">
        <a className="btn btn--secondary btn--sm pol-note__read" href={POLICY_URL} target="_blank" rel="noopener noreferrer" onClick={close}>
          {t('policy.read')}
        </a>
        <button type="button" className="pol-note__ok" onClick={close}>
          {t('policy.ok')}
        </button>
      </div>
    </aside>
  );
}
