import { useState } from 'react';
import { useUserStore } from '@/store/userStore';
import { useProgramStore } from '@/store/programStore';
import type { MovementPattern, InjurySeverity } from '@/types';
import { Button } from '@/components/ui';
import './InjuryForm.css';

const ALL_PATTERNS: MovementPattern[] = ['push','pull','hinge','squat','carry','jump','accessory','core'];
const SEVERITIES: InjurySeverity[] = ['avoid', 'modify', 'monitor'];

interface Props { onClose: () => void; }

export function InjuryForm({ onClose }: Props) {
  const { addRestriction } = useUserStore();
  const { exercises } = useProgramStore();
  const [label, setLabel] = useState('');
  const [severity, setSeverity] = useState<InjurySeverity>('avoid');
  const [patterns, setPatterns] = useState<MovementPattern[]>([]);
  const [exIds, setExIds] = useState<string[]>([]);

  function togglePattern(p: MovementPattern) {
    setPatterns((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }
  function toggleEx(id: string) {
    setExIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function handleSave() {
    if (!label.trim()) return;
    addRestriction({
      label: label.trim(),
      severity,
      restrictedPatterns: patterns,
      restrictedExerciseIds: exIds,
      active: true,
    });
    onClose();
  }

  return (
    <div className="injury-form">
      <p className="injury-form__heading">New restriction</p>
      <input placeholder="Label (e.g. Lumbosacral stress)" value={label}
        onChange={(e) => setLabel(e.target.value)} autoFocus />

      <div className="injury-form__field">
        <span className="injury-form__label">Severity</span>
        <div className="injury-form__row">
          {SEVERITIES.map((s) => (
            <button key={s}
              className={`injury-form__chip${severity === s ? ' injury-form__chip--active injury-form__chip--' + s : ''}`}
              onClick={() => setSeverity(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="injury-form__field">
        <span className="injury-form__label">Restrict movement patterns</span>
        <div className="injury-form__grid">
          {ALL_PATTERNS.map((p) => (
            <button key={p}
              className={`injury-form__chip${patterns.includes(p) ? ' injury-form__chip--active injury-form__chip--avoid' : ''}`}
              onClick={() => togglePattern(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {exercises.length > 0 && (
        <div className="injury-form__field">
          <span className="injury-form__label">Restrict specific exercises</span>
          <div className="injury-form__grid">
            {exercises.map((e) => (
              <button key={e.id}
                className={`injury-form__chip${exIds.includes(e.id) ? ' injury-form__chip--active injury-form__chip--avoid' : ''}`}
                onClick={() => toggleEx(e.id)}>
                {e.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="injury-form__actions">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={handleSave} disabled={!label.trim()}>Save</Button>
      </div>
    </div>
  );
}
