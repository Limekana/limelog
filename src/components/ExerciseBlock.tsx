import { useState, useRef, useEffect } from 'react';
import './ExerciseBlock.css';
import { useLogStore } from '@/store/logStore';
import { formatWeight } from '@/utils/helpers';
import { playRestComplete } from '@/utils/audio';
import type { Exercise, SessionExercise } from '@/types/program';
import type { SessionLog, SetLog } from '@/types/logging';
import type { InjuryRestriction } from '@/types/user';
import { Badge } from '@/components/ui';
import { ChevronDown, ChevronUp, AlertTriangle, Plus, Trash2 } from 'lucide-react';

interface Props {
  sessionExercise: SessionExercise;
  exercise: Exercise;
  log: SessionLog;
  restriction: InjuryRestriction | null;
  unit: 'kg' | 'lb';
}

interface RestState {
  remaining: number;
  total: number;
}

const RING_RADIUS = 26;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

export function ExerciseBlock({ sessionExercise: se, exercise, log, restriction, unit }: Props) {
  const { logSet, updateSet, deleteSet, checkAndFlagStalls } = useLogStore();
  const [expanded, setExpanded] = useState(true);
  const [overrideRestriction, setOverrideRestriction] = useState(false);
  const [restState, setRestState] = useState<RestState | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, []);

  const mySets = log.sets
    .filter((s) => s.exerciseId === exercise.id)
    .sort((a, b) => a.setNumber - b.setNumber);

  const isRestricted = restriction !== null && restriction.severity === 'avoid' && !overrideRestriction;

  function addSet() {
    const last = mySets[mySets.length - 1];
    logSet(log.id, {
      exerciseId: exercise.id,
      setNumber: mySets.length + 1,
      weightKg: last?.weightKg ?? null,
      reps: last?.reps ?? null,
      rpe: last?.rpe ?? null,
      completed: false,
    });
  }

  function handleSetChange(setId: string, field: keyof SetLog, raw: string) {
    const value = raw === '' ? null : Number(raw);
    updateSet(log.id, setId, { [field]: value });
  }

  function startRestTimer() {
    const secs = se.restSeconds;
    if (!secs || secs <= 0) return;
    if (timerRef.current !== null) clearInterval(timerRef.current);
    setRestState({ remaining: secs, total: secs });
    timerRef.current = setInterval(() => {
      setRestState((prev) => {
        if (!prev) return null;
        if (prev.remaining <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          playRestComplete();
          return null;
        }
        return { ...prev, remaining: prev.remaining - 1 };
      });
    }, 1000);
  }

  function skipRest() {
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
    setRestState(null);
  }

  function handleComplete(setId: string, completed: boolean) {
    updateSet(log.id, setId, { completed });
    if (completed) {
      checkAndFlagStalls(exercise.id);
      startRestTimer();
    }
  }

  const ringOffset = restState
    ? RING_CIRC * (1 - restState.remaining / restState.total)
    : RING_CIRC;

  return (
    <div className="ex-block">
      <button className="ex-block__header" onClick={() => setExpanded((v) => !v)}>
        <div className="ex-block__title-row">
          <span className="ex-block__name">{exercise.name}</span>
          {restriction && (
            <Badge
              label={restriction.severity === 'avoid' ? 'Restricted' : restriction.severity}
              variant={restriction.severity === 'avoid' ? 'danger' : 'warning'}
            />
          )}
        </div>
        <div className="ex-block__meta">
          <span>{se.targetSets} × {se.targetReps}</span>
          {se.targetRpe && <span>RPE {se.targetRpe}</span>}
          {se.targetWeight && <span>{formatWeight(se.targetWeight, unit)}</span>}
          {se.restSeconds && <span>{se.restSeconds}s rest</span>}
        </div>
        {expanded
          ? <ChevronUp size={16} color="var(--text-tertiary)" />
          : <ChevronDown size={16} color="var(--text-tertiary)" />}
      </button>

      {expanded && (
        <div className="ex-block__body">
          {restriction && restriction.severity === 'avoid' && !overrideRestriction && (
            <div className="ex-block__restriction">
              <AlertTriangle size={14} />
              <span>{restriction.label} — flagged as avoid.</span>
              <button className="ex-block__override" onClick={() => setOverrideRestriction(true)}>
                Override
              </button>
            </div>
          )}
          {restriction && restriction.severity === 'modify' && (
            <div className="ex-block__restriction ex-block__restriction--warn">
              <AlertTriangle size={14} />
              <span>{restriction.label} — modify load/range as needed.</span>
            </div>
          )}

          {restState && (
            <div className="ex-block__rest-banner">
              <svg
                className="ex-block__rest-ring"
                viewBox="0 0 64 64"
                width={64}
                height={64}
                aria-hidden="true"
              >
                <circle
                  cx="32" cy="32" r={RING_RADIUS}
                  className="ex-block__rest-ring__track"
                />
                <circle
                  cx="32" cy="32" r={RING_RADIUS}
                  className="ex-block__rest-ring__progress"
                  strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
                  strokeDashoffset={ringOffset}
                />
              </svg>
              <div className="ex-block__rest-text">
                <span className="ex-block__rest-seconds">{restState.remaining}</span>
                <span className="ex-block__rest-label">rest</span>
              </div>
              <button className="ex-block__rest-skip" onClick={skipRest}>
                Skip
              </button>
            </div>
          )}

          {!isRestricted && (
            <>
              <div className="ex-block__set-header">
                <span>Set</span>
                <span>{unit}</span>
                <span>Reps</span>
                <span>RPE</span>
                <span />
              </div>
              {mySets.map((s) => (
                <div key={s.id} className={`ex-block__set-row${s.completed ? ' ex-block__set-row--done' : ''}`}>
                  <button className="ex-block__set-num" onClick={() => handleComplete(s.id, !s.completed)}>
                    {s.completed ? '✓' : s.setNumber}
                  </button>
                  <input type="number" min="0" step="0.5" className="ex-block__input"
                    value={s.weightKg ?? ''} placeholder="—"
                    onChange={(e) => handleSetChange(s.id, 'weightKg', e.target.value)} />
                  <input type="number" min="0" step="1" className="ex-block__input"
                    value={s.reps ?? ''} placeholder="—"
                    onChange={(e) => handleSetChange(s.id, 'reps', e.target.value)} />
                  <input type="number" min="6" max="10" step="0.5" className="ex-block__input"
                    value={s.rpe ?? ''} placeholder="—"
                    onChange={(e) => handleSetChange(s.id, 'rpe', e.target.value)} />
                  <button
                    className="ex-block__delete"
                    onClick={() => deleteSet(log.id, s.id)}
                    aria-label="Delete set"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button className="ex-block__add-set" onClick={addSet} aria-label="Add set">
                <Plus size={14} aria-hidden="true" /> Add set
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
