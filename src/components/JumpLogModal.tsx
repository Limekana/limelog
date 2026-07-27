import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLogStore } from '@/store/logStore';
import type { JumpCondition } from '@/types/logging';
import { Button } from '@/components/ui';
import { X } from 'lucide-react';
import './JumpLogModal.css';

interface Props {
  onClose: () => void;
}

const CONDITIONS: { value: JumpCondition; labelKey: string }[] = [
  { value: 'fresh',        labelKey: 'jump.condFresh' },
  { value: 'morning',      labelKey: 'jump.condMorning' },
  { value: 'post_session', labelKey: 'jump.condPost' },
];

export function JumpLogModal({ onClose }: Props) {
  const { t } = useTranslation();
  const { logJump } = useLogStore();
  const [heightCm, setHeightCm] = useState('');
  const [condition, setCondition] = useState<JumpCondition>('fresh');
  const [notes, setNotes] = useState('');

  function handleSave() {
    const h = parseFloat(heightCm);
    if (isNaN(h) || h <= 0) return;
    logJump({
      userId: 'local',
      loggedAt: new Date().toISOString(),
      heightCm: h,
      condition,
      notes: notes.trim() || undefined,
    });
    onClose();
  }

  return (
    <div className="jump-modal-backdrop" onClick={onClose}>
      <div className="jump-modal" onClick={(e) => e.stopPropagation()}>
        <div className="jump-modal__header">
          <span className="jump-modal__title">{t('jump.title')}</span>
          <button className="jump-modal__close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="jump-modal__body">
          <label className="jump-modal__label">
            {t('jump.height')}
            <input
              type="number"
              min="0"
              step="0.5"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              placeholder={t('jump.heightPh')}
              autoFocus
            />
          </label>

          <label className="jump-modal__label">{t('jump.condition')}</label>
          <div className="jump-modal__conditions">
            {CONDITIONS.map((c) => (
              <button
                key={c.value}
                className={`jump-modal__cond${condition === c.value ? ' jump-modal__cond--active' : ''}`}
                onClick={() => setCondition(c.value)}
              >
                {t(c.labelKey)}
              </button>
            ))}
          </div>

          <label className="jump-modal__label">
            {t('jump.notes')}
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('jump.notesPh')}
            />
          </label>
        </div>

        <div className="jump-modal__footer">
          <Button variant="ghost" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!heightCm || parseFloat(heightCm) <= 0}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
