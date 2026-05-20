import { useState } from 'react';
import { useLogStore } from '@/store/logStore';
import type { JumpCondition } from '@/types/logging';
import { Button } from '@/components/ui';
import { X } from 'lucide-react';
import './JumpLogModal.css';

interface Props {
  onClose: () => void;
}

const CONDITIONS: { value: JumpCondition; label: string }[] = [
  { value: 'fresh',        label: 'Fresh'        },
  { value: 'morning',      label: 'Morning'      },
  { value: 'post_session', label: 'Post-session' },
];

export function JumpLogModal({ onClose }: Props) {
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
          <span className="jump-modal__title">Log vertical jump</span>
          <button className="jump-modal__close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="jump-modal__body">
          <label className="jump-modal__label">
            Height (cm)
            <input
              type="number"
              min="0"
              step="0.5"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              placeholder="e.g. 65.5"
              autoFocus
            />
          </label>

          <label className="jump-modal__label">Condition</label>
          <div className="jump-modal__conditions">
            {CONDITIONS.map((c) => (
              <button
                key={c.value}
                className={`jump-modal__cond${condition === c.value ? ' jump-modal__cond--active' : ''}`}
                onClick={() => setCondition(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <label className="jump-modal__label">
            Notes (optional)
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Surface, warm-up, context..."
            />
          </label>
        </div>

        <div className="jump-modal__footer">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!heightCm || parseFloat(heightCm) <= 0}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
