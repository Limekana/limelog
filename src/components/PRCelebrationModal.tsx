// ─── v1.6 PR Celebration ─────────────────────────────────────────────────
//
// Fires the moment a finalized session sets one or more new Personal Records.
// Mounted once at the app root (outside the route tree) so it survives the
// post-finish navigate('/today'). Reads the just-detected PRs off logStore;
// dismissing clears them.

import { useLogStore } from '@/store/logStore';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/store/userStore';
import { formatWeight } from '@/utils/helpers';
import { Trophy } from 'lucide-react';
import './PRCelebrationModal.css';

export function PRCelebrationModal() {
  const prs = useLogStore((s) => s.lastCelebratedPRs);
  const clear = useLogStore((s) => s.clearCelebratedPRs);
  const { t } = useTranslation();
  const unit = useUserStore((s) => s.profile.unitPreference);

  if (!prs || prs.length === 0) return null;

  return (
    <div className="pr-modal__overlay" onClick={clear}>
      <div className="pr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('progress.newPr')}>
        <div className="pr-modal__burst" aria-hidden="true">
          <Trophy size={34} />
        </div>
        <div className="pr-modal__title">
          {t('progress.newPrTitle', { count: prs.length })}
        </div>
        <div className="pr-modal__list">
          {prs.map((pr) => (
            <div key={pr.id} className="pr-modal__row">
              <span className="pr-modal__ex">{pr.exerciseName}</span>
              <span className="pr-modal__val">
                {pr.weightKg > 0 ? `${formatWeight(pr.weightKg, unit)} × ${pr.reps}` : t('progress.repsOnly', { count: pr.reps })}
              </span>
            </div>
          ))}
        </div>
        <button className="pr-modal__btn" onClick={clear}>{t('progress.nice')}</button>
      </div>
    </div>
  );
}
