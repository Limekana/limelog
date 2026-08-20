// v1.10 — in-app feedback.
//
// Deliberately a form in the app rather than a link to a survey: a link leaves
// the app, cannot work offline, and arrives without the app version or platform,
// which is most of what makes a report actionable.
//
// Submission goes through the outbox, not straight to Supabase, so a report
// written between sets in a basement gym is not lost. enqueue() persists first
// and drains on the next connection, so there is no failure path to render
// here — a delivery problem surfaces in the sync card like every other queued
// write.
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { Button, Card } from '@/components/ui';
import { enqueue } from '@/lib/outbox';
import { useNexusStore } from '@/store/nexusStore';
import pkg from '../../package.json';
import './FeedbackCard.css';

const CATEGORIES = ['bug', 'idea', 'praise', 'other'] as const;
const MAX = 4000;

// A v4 uuid for the row. crypto.randomUUID needs a secure context; the fallback
// still produces a real uuid rather than an invented id string, because the
// column is `uuid` and a "fb-1a2b" style value would be rejected by the
// database at the worst possible moment (offline, on retry).
function newFeedbackId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function FeedbackCard() {
  const { t } = useTranslation();
  const userEmail = useNexusStore((s) => s.userEmail);
  const [category, setCategory] = useState<string>('bug');
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const send = useCallback(() => {
    const body = message.trim();
    if (!body) {
      setNotice(t('profile.feedbackEmpty'));
      return;
    }
    if (!userEmail) {
      setNotice(t('profile.feedbackSignIn'));
      return;
    }
    enqueue('submit_feedback', {
      id: newFeedbackId(),
      category,
      rating: rating || null,
      message: body,
      appVersion: pkg.version,
      platform: Capacitor.getPlatform(),
    });
    setMessage('');
    setRating(0);
    setNotice(t('profile.feedbackThanks'));
  }, [message, userEmail, category, rating, t]);

  return (
    <Card>
      <div className="fb-card__header">
        <span className="settings-field__label" style={{ margin: 0 }}>
          {t('profile.feedback')}
        </span>
      </div>
      <p className="fb-card__hint">{t('profile.feedbackBlurb')}</p>

      <div className="fb-card__cats" role="group" aria-label={t('profile.feedbackCategory')}>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`fb-card__cat${category === c ? ' fb-card__cat--on' : ''}`}
            onClick={() => setCategory(c)}
            aria-pressed={category === c}
          >
            {t(`profile.fbCat.${c}`)}
          </button>
        ))}
      </div>

      <div className="fb-card__stars" role="group" aria-label={t('profile.feedbackRating')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`fb-card__star${n <= rating ? ' fb-card__star--on' : ''}`}
            onClick={() => setRating(n === rating ? 0 : n)}
            aria-label={t('profile.feedbackRatingN', { n })}
            aria-pressed={n <= rating}
          >
            {n <= rating ? '★' : '☆'}
          </button>
        ))}
      </div>

      <textarea
        className="fb-card__text"
        value={message}
        maxLength={MAX}
        onChange={(e) => {
          setMessage(e.target.value);
          if (notice) setNotice(null);
        }}
        placeholder={t('profile.feedbackPlaceholder')}
        aria-label={t('profile.feedback')}
      />
      <div className="fb-card__count">{message.length}/{MAX}</div>

      <Button size="sm" variant="ghost" onClick={send} disabled={!message.trim()}>
        {t('profile.feedbackSend')}
      </Button>

      {notice && <p className="fb-card__notice">{notice}</p>}
      <p className="fb-card__meta">
        {t('profile.feedbackMeta', { app: 'LimeLog', version: pkg.version })}
      </p>
    </Card>
  );
}
