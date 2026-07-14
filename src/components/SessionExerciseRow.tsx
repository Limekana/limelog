import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProgramStore } from '@/store/programStore';
import type { Program, SessionExercise } from '@/types/program';
import { Trash2 } from 'lucide-react';
import './SessionExerciseRow.css';

interface Props {
  sessionExercise: SessionExercise;
  sessionId: string;
  program: Program;
}

export function SessionExerciseRow({ sessionExercise: se, sessionId, program: _ }: Props) {
  const { t } = useTranslation();
  const { exercises, updateSessionExercise, removeSessionExercise } = useProgramStore();
  const [open, setOpen] = useState(false);

  const exercise = exercises.find((e) => e.id === se.exerciseId);

  return (
    <div className="se-row">
      <div className="se-row__top">
        <button className="se-row__name-btn" onClick={() => setOpen((v) => !v)}>
          <span className="se-row__name">{exercise?.name ?? t('log.unknownExercise')}</span>
          <span className="se-row__targets">{se.targetSets}×{se.targetReps}{se.targetRpe ? ` @RPE${se.targetRpe}` : ''}</span>
        </button>
        <button className="se-row__del" onClick={() => removeSessionExercise(sessionId, se.id)}>
          <Trash2 size={12} />
        </button>
      </div>

      {open && (
        <div className="se-row__form">
          <select
            value={se.exerciseId}
            onChange={(e) => updateSessionExercise(sessionId, se.id, { exerciseId: e.target.value })}
          >
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>

          <div className="se-row__fields">
            <label>{t('log.sets')}
              <input type="number" min="1" value={se.targetSets}
                onChange={(e) => updateSessionExercise(sessionId, se.id, { targetSets: Math.max(0, Number(e.target.value)) })} />
            </label>
            <label>{t('log.colReps')}
              <input type="text" value={se.targetReps} placeholder={t('log.repsPlaceholder')}
                onChange={(e) => updateSessionExercise(sessionId, se.id, { targetReps: e.target.value })} />
            </label>
            <label>RPE
              <input type="number" min="6" max="10" step="0.5" value={se.targetRpe ?? ''}
                onChange={(e) => updateSessionExercise(sessionId, se.id, { targetRpe: e.target.value ? Number(e.target.value) : undefined })} />
            </label>
            <label>{t('log.targetKg')}
              <input type="number" min="0" step="2.5" value={se.targetWeight ?? ''}
                onChange={(e) => updateSessionExercise(sessionId, se.id, { targetWeight: e.target.value ? Number(e.target.value) : undefined })} />
            </label>
            <label>{t('log.restSecs')}
              <input type="number" min="0" step="15" value={se.restSeconds ?? ''}
                onChange={(e) => updateSessionExercise(sessionId, se.id, { restSeconds: e.target.value ? Number(e.target.value) : undefined })} />
            </label>
          </div>

          <textarea
            rows={2}
            placeholder={t('log.notesPlaceholder')}
            value={se.notes ?? ''}
            onChange={(e) => updateSessionExercise(sessionId, se.id, { notes: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
