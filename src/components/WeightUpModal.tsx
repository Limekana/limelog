import { useState } from 'react';
import type { Exercise, SessionExercise } from '@/types/program';
import { Button } from '@/components/ui';
import { TrendingUp } from 'lucide-react';
import './WeightUpModal.css';

export interface QualifyingExercise {
  se: SessionExercise;
  exercise: Exercise;
  increment: number;
  sessionId: string;
}

interface Props {
  qualifying: QualifyingExercise[];
  onConfirm: (confirmedSeIds: string[]) => void;
  onSkip: () => void;
}

export function WeightUpModal({ qualifying, onConfirm, onSkip }: Props) {
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
          <span className="weight-up-modal__title">Ready to progress</span>
        </div>
        <p className="weight-up-modal__body">
          You hit the top of the rep range on every set for the exercises below. Confirm form was solid to apply the weight increase.
        </p>
        <div className="weight-up-modal__list">
          {qualifying.map((q) => (
            <label key={q.se.id} className="weight-up-modal__item">
              <input
                type="checkbox"
                className="weight-up-modal__checkbox"
                checked={checked.has(q.se.id)}
                onChange={() => toggle(q.se.id)}
              />
              <div className="weight-up-modal__item-info">
                <span className="weight-up-modal__item-name">{q.exercise.name}</span>
                <span className="weight-up-modal__item-increment">+{q.increment} kg</span>
              </div>
            </label>
          ))}
        </div>
        <div className="weight-up-modal__actions">
          <Button variant="secondary" size="sm" onClick={onSkip}>Skip</Button>
          <Button variant="primary" size="sm" onClick={() => onConfirm(Array.from(checked))}>
            Apply & Finish
          </Button>
        </div>
      </div>
    </div>
  );
}
