import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Exercise, SessionExercise } from '@/types/program';
import { Button } from '@/components/ui';
import { TrendingUp } from 'lucide-react';
import { PlateBar } from '@/components/PlateBar';
import { convertLoad, usesBarbell, type Unit } from '@/utils/plateMath';
import './WeightUpModal.css';

export interface QualifyingExercise {
  se: SessionExercise;
  exercise: Exercise;
  increment: number;
  sessionId: string;
}

interface Props {
  qualifying: QualifyingExercise[];
  /** v1.14 Item 13 — the modal used to hardcode "kg" in its increment line,
   *  which was wrong on an lb account. Threading the real unit through is the
   *  same change as drawing the bar, so it is made here rather than left. */
  unit: Unit;
  /** Cast Iron only: the bay is that theme's idea, not a universal one. */
  showBay?: boolean;
  onConfirm: (confirmedSeIds: string[]) => void;
  onSkip: () => void;
}

export function WeightUpModal({ qualifying, unit, showBay = false, onConfirm, onSkip }: Props) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState<Set<string>>(new Set(qualifying.map((q) => q.se.id)));

  function toggle(seId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(seId) ? next.delete(seId) : next.add(seId);
      return next;
    });
  }

  return (
    <div className="weight-up-modal__overlay">
      <div className="weight-up-modal">
        <div className="weight-up-modal__header">
          <TrendingUp size={18} color="var(--accent)" />
          <span className="weight-up-modal__title">{t('progress.readyToProgress')}</span>
        </div>
        <p className="weight-up-modal__body">
          {t('progress.weightUpBody')}
        </p>
        <div className="weight-up-modal__list">
          {qualifying.map((q) => {
            // v1.14 Item 13 — "+2.5 kg" is a number; the bay is what it will
            // feel like to walk up to. The NEW total, not the old one: this
            // modal is asking you to agree to next week's bar.
            const nextKg = q.se.targetWeight != null ? q.se.targetWeight + q.increment : null;
            const bay = showBay && usesBarbell(q.exercise.equipment) && nextKg != null && nextKg > 0;
            return (
              <label key={q.se.id} className="weight-up-modal__item">
                <input
                  type="checkbox"
                  className="weight-up-modal__checkbox"
                  checked={checked.has(q.se.id)}
                  onChange={() => toggle(q.se.id)}
                />
                <div className="weight-up-modal__item-info">
                  <span className="weight-up-modal__item-name">{q.exercise.name}</span>
                  <span className="weight-up-modal__item-increment">
                    +{convertLoad(q.increment, 'kg', unit)} {unit}
                  </span>
                  {bay && (
                    <PlateBar
                      total={convertLoad(nextKg, 'kg', unit)}
                      unit={unit}
                      size="sm"
                      showReadout={false}
                    />
                  )}
                </div>
              </label>
            );
          })}
        </div>
        <div className="weight-up-modal__actions">
          <Button variant="secondary" size="sm" onClick={onSkip}>{t('log.skip')}</Button>
          <Button variant="primary" size="sm" onClick={() => onConfirm(Array.from(checked))}>
            {t('progress.applyFinish')}
          </Button>
        </div>
      </div>
    </div>
  );
}
