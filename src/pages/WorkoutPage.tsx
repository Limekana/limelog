import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProgramStore } from '@/store/programStore';
import { useLogStore } from '@/store/logStore';
import { useUserStore } from '@/store/userStore';
import { formatWeight } from '@/utils/helpers';
import { playRestComplete } from '@/utils/audio';
import type { SetLog } from '@/types/logging';
import { WeightUpModal, type QualifyingExercise } from '@/components/WeightUpModal';
import { FatigueRating } from '@/components/FatigueRating';
import { DebriefSection } from '@/components/DebriefSection';
import { ChevronLeft, Plus, Trash2, X, Flag, Play, Timer } from 'lucide-react';
import './WorkoutPage.css';

const DEFAULT_REST_SECONDS = 90;

function parseRepCeiling(targetReps: string): number {
  const cleaned = targetReps.replace('–', '-').replace('–', '-');
  const parts = cleaned.split('-');
  return parseInt(parts[parts.length - 1], 10);
}

interface RestState {
  remaining: number;
  total: number;
  exerciseName: string;
}

export function WorkoutPage() {
  const { logId = '' } = useParams();
  const navigate = useNavigate();
  const { activeProgram, exercises, updateSessionExercise } = useProgramStore();
  const { sessionLogs, logSet, updateSet, deleteSet, checkAndFlagStalls, setPerceivedFatigue, finalizeSession, discardSession } = useLogStore();
  const { profile } = useUserStore();

  const log = sessionLogs.find((l) => l.id === logId) ?? null;
  const session = useMemo(
    () => activeProgram?.sessions.find((s) => s.id === log?.sessionTemplateId) ?? null,
    [activeProgram, log?.sessionTemplateId]
  );

  const [rest, setRest] = useState<RestState | null>(null);
  const restTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [modal, setModal] = useState<{ qualifying: QualifyingExercise[] } | null>(null);

  const cleanupTimer = useCallback(() => {
    if (restTickRef.current !== null) {
      clearInterval(restTickRef.current);
      restTickRef.current = null;
    }
  }, []);

  useEffect(() => cleanupTimer, [cleanupTimer]);

  const startRest = useCallback((secs: number, exerciseName: string) => {
    if (!secs || secs <= 0) return;
    cleanupTimer();
    setRest({ remaining: secs, total: secs, exerciseName });
    restTickRef.current = setInterval(() => {
      setRest((prev) => {
        if (!prev) return null;
        if (prev.remaining <= 1) {
          cleanupTimer();
          playRestComplete();
          return null;
        }
        return { ...prev, remaining: prev.remaining - 1 };
      });
    }, 1000);
  }, [cleanupTimer]);

  const skipRest = useCallback(() => {
    cleanupTimer();
    setRest(null);
  }, [cleanupTimer]);

  const adjustRest = useCallback((delta: number) => {
    setRest((prev) => {
      if (!prev) return null;
      const next = Math.max(1, prev.remaining + delta);
      return { ...prev, remaining: next, total: Math.max(prev.total, next) };
    });
  }, []);

  if (!log || !session || !activeProgram) {
    return (
      <div className="workout-page workout-page--missing">
        <button className="workout-page__back" onClick={() => navigate('/today')}>
          <ChevronLeft size={18} /> Back
        </button>
        <p className="workout-page__missing-msg">This workout no longer exists.</p>
      </div>
    );
  }

  const orderedExercises = [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
  const completedCount = log.sets.filter((s) => s.completed).length;
  const plannedCount = orderedExercises.reduce((sum, se) => sum + se.targetSets, 0);
  const pct = plannedCount > 0 ? Math.min(100, (completedCount / plannedCount) * 100) : 0;

  // The "current" exercise is the first one that still has incomplete sets — drives the idle rest bar.
  const currentExercise = orderedExercises.find((se) => {
    const exDoneSets = log.sets.filter((s) => s.exerciseId === se.exerciseId && s.completed).length;
    return exDoneSets < se.targetSets;
  }) ?? orderedExercises[0];
  const currentExerciseObj = exercises.find((e) => e.id === currentExercise?.exerciseId);
  const idleRestSecs = currentExercise?.restSeconds ?? DEFAULT_REST_SECONDS;
  const idleRestLabel = currentExerciseObj?.name ?? 'workout';

  function computeQualifying(): QualifyingExercise[] {
    if (!log || !session) return [];
    const result: QualifyingExercise[] = [];
    for (const se of session.exercises) {
      const exercise = exercises.find((e) => e.id === se.exerciseId);
      if (!exercise) continue;
      const completedSets = log.sets.filter((s) => s.exerciseId === se.exerciseId && s.completed);
      if (completedSets.length === 0) continue;
      const ceiling = parseRepCeiling(se.targetReps);
      if (isNaN(ceiling)) continue;
      const allHitCeiling = completedSets.every((s) => s.reps !== null && s.reps >= ceiling);
      if (!allHitCeiling) continue;
      if (se.targetRpe !== undefined) {
        const allBelowRpe = completedSets.every((s) => s.rpe === null || s.rpe <= se.targetRpe! - 1);
        if (!allBelowRpe) continue;
      }
      const pattern = exercise.movementPattern;
      const increment = pattern === 'squat' || pattern === 'hinge' ? 5 : 2.5;
      result.push({ se, exercise, increment, sessionId: session.id });
    }
    return result;
  }

  function handleFinish() {
    const qualifying = computeQualifying();
    if (qualifying.length > 0) {
      setModal({ qualifying });
    } else {
      finalizeSession(log!.id);
      navigate('/today');
    }
  }

  function handleModalConfirm(confirmedSeIds: string[]) {
    if (!modal) return;
    for (const item of modal.qualifying) {
      if (confirmedSeIds.includes(item.se.id)) {
        const newWeight = (item.se.targetWeight ?? 0) + item.increment;
        updateSessionExercise(item.sessionId, item.se.id, { targetWeight: newWeight });
      }
    }
    finalizeSession(log!.id);
    setModal(null);
    navigate('/today');
  }

  function handleModalSkip() {
    finalizeSession(log!.id);
    setModal(null);
    navigate('/today');
  }

  function handleDiscard() {
    if (confirm('Discard this workout? All logged sets will be lost.')) {
      discardSession(log!.id);
      navigate('/today');
    }
  }

  function getRestrictionForExercise(exId: string) {
    const exercise = exercises.find((e) => e.id === exId);
    if (!exercise) return null;
    return profile.activeRestrictions.find(
      (r) =>
        r.active &&
        (r.restrictedExerciseIds.includes(exId) ||
          r.restrictedPatterns.includes(exercise.movementPattern))
    ) ?? null;
  }

  const restPct = rest ? (rest.remaining / rest.total) * 100 : 0;
  const restUrgent = rest !== null && rest.remaining <= 5;

  return (
    <div className="workout-page" style={{ '--workout-progress': `${pct}%` } as React.CSSProperties}>
      {/* Sticky top: rest bar OR session header */}
      <div className="workout-top">
        <div className="workout-top__bar">
          <button className="workout-top__back" onClick={() => navigate('/today')} aria-label="Back">
            <ChevronLeft size={20} />
          </button>
          <div className="workout-top__title">
            <span className="workout-top__session">{session.name}</span>
            <span className="workout-top__progress-text">
              {completedCount}/{plannedCount} sets
            </span>
          </div>
          <button className="workout-top__discard" onClick={handleDiscard} aria-label="Discard workout">
            <Trash2 size={16} />
          </button>
        </div>

        {/* Session progress bar */}
        <div className="workout-top__progress" aria-hidden="true">
          <div className="workout-top__progress-fill" style={{ width: `${pct}%` }} />
        </div>

        {/* Persistent rest bar — idle state acts as a one-tap timer launcher */}
        <div className={`rest-bar${rest ? ' rest-bar--active' : ' rest-bar--idle'}${restUrgent ? ' rest-bar--urgent' : ''}`}>
          <div
            className="rest-bar__fill"
            style={{ width: rest ? `${restPct}%` : '0%' }}
            aria-hidden="true"
          />
          <div className="rest-bar__content">
            {rest ? (
              <>
                <div className="rest-bar__label">
                  <span className="rest-bar__label-eyebrow">Resting</span>
                  <span className="rest-bar__label-ex">{rest.exerciseName}</span>
                </div>
                <div className="rest-bar__seconds">
                  <span className="rest-bar__seconds-num">{rest.remaining}</span>
                  <span className="rest-bar__seconds-unit">s</span>
                </div>
                <div className="rest-bar__actions">
                  <button onClick={() => adjustRest(-15)} aria-label="Subtract 15 seconds">−15</button>
                  <button onClick={() => adjustRest(15)} aria-label="Add 15 seconds">+15</button>
                  <button className="rest-bar__skip" onClick={skipRest} aria-label="Skip rest">
                    <X size={16} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rest-bar__label">
                  <span className="rest-bar__label-eyebrow"><Timer size={11} /> Rest timer</span>
                  <span className="rest-bar__label-ex">{idleRestLabel} · {idleRestSecs}s</span>
                </div>
                <button
                  className="rest-bar__start"
                  onClick={() => startRest(idleRestSecs, idleRestLabel)}
                  aria-label={`Start ${idleRestSecs} second rest`}
                >
                  <Play size={14} />
                  <span>Start</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="workout-body">
        {orderedExercises.map((se, idx) => {
          const exercise = exercises.find((e) => e.id === se.exerciseId);
          if (!exercise) return null;
          const restriction = getRestrictionForExercise(se.exerciseId);
          const isRestrictedAvoid = restriction?.severity === 'avoid';
          const mySets = log.sets
            .filter((s) => s.exerciseId === exercise.id)
            .sort((a, b) => a.setNumber - b.setNumber);
          const doneSets = mySets.filter((s) => s.completed).length;
          const allDone = doneSets >= se.targetSets;

          return (
            <ExerciseSection
              key={se.id}
              index={idx + 1}
              exerciseName={exercise.name}
              exerciseId={exercise.id}
              targetSetsCount={se.targetSets}
              targetReps={se.targetReps}
              targetRpe={se.targetRpe}
              targetWeight={se.targetWeight}
              restSeconds={se.restSeconds}
              restriction={restriction}
              isRestrictedAvoid={isRestrictedAvoid}
              sets={mySets}
              doneSets={doneSets}
              allDone={allDone}
              unit={profile.unitPreference}
              onLogSet={(newSet) =>
                logSet(log.id, { ...newSet, exerciseId: exercise.id, setNumber: mySets.length + 1 })
              }
              onUpdateSet={(setId, updates) => updateSet(log.id, setId, updates)}
              onDeleteSet={(setId) => deleteSet(log.id, setId)}
              onCompleteSet={(setId, completed, restSecs) => {
                updateSet(log.id, setId, { completed });
                if (completed) {
                  checkAndFlagStalls(exercise.id);
                  startRest(restSecs ?? DEFAULT_REST_SECONDS, exercise.name);
                }
              }}
            />
          );
        })}

        <div className="workout-finalize">
          <FatigueRating
            value={log.perceivedFatigue}
            onChange={(v) => setPerceivedFatigue(log.id, v)}
          />

          <DebriefSection logId={log.id} />

          <button className="workout-finish-btn" onClick={handleFinish}>
            <Flag size={16} />
            <span>Finish workout</span>
          </button>
        </div>
      </div>

      {modal && (
        <WeightUpModal
          qualifying={modal.qualifying}
          onConfirm={handleModalConfirm}
          onSkip={handleModalSkip}
        />
      )}
    </div>
  );
}

interface ExerciseSectionProps {
  index: number;
  exerciseName: string;
  exerciseId: string;
  targetSetsCount: number;
  targetReps: string;
  targetRpe?: number;
  targetWeight?: number;
  restSeconds?: number;
  restriction: { severity: string; label: string } | null;
  isRestrictedAvoid: boolean;
  sets: SetLog[];
  doneSets: number;
  allDone: boolean;
  unit: 'kg' | 'lb';
  onLogSet: (set: Omit<SetLog, 'id' | 'sessionLogId' | 'exerciseId' | 'setNumber'>) => void;
  onUpdateSet: (setId: string, updates: Partial<SetLog>) => void;
  onDeleteSet: (setId: string) => void;
  onCompleteSet: (setId: string, completed: boolean, restSecs: number | undefined) => void;
}

function ExerciseSection({
  index,
  exerciseName,
  targetSetsCount,
  targetReps,
  targetRpe,
  targetWeight,
  restSeconds,
  restriction,
  isRestrictedAvoid,
  sets,
  doneSets,
  allDone,
  unit,
  onLogSet,
  onUpdateSet,
  onDeleteSet,
  onCompleteSet,
}: ExerciseSectionProps) {
  const [override, setOverride] = useState(false);
  const restricted = isRestrictedAvoid && !override;

  function addSet() {
    const last = sets[sets.length - 1];
    onLogSet({
      weightKg: last?.weightKg ?? targetWeight ?? null,
      reps: last?.reps ?? null,
      rpe: last?.rpe ?? null,
      completed: false,
    });
  }

  return (
    <section className={`ex-section${allDone ? ' ex-section--done' : ''}`}>
      <header className="ex-section__head">
        <div className="ex-section__index">{String(index).padStart(2, '0')}</div>
        <div className="ex-section__head-text">
          <h2 className="ex-section__name">{exerciseName}</h2>
          <div className="ex-section__meta">
            <span><strong>{targetSetsCount}</strong>×{targetReps}</span>
            {targetRpe !== undefined && <span>RPE {targetRpe}</span>}
            {targetWeight !== undefined && <span>{formatWeight(targetWeight, unit)}</span>}
            {restSeconds !== undefined && <span>{restSeconds}s rest</span>}
          </div>
        </div>
        <div className="ex-section__counter">
          <span className="ex-section__counter-done">{doneSets}</span>
          <span className="ex-section__counter-sep">/</span>
          <span className="ex-section__counter-target">{targetSetsCount}</span>
        </div>
      </header>

      {restriction && (
        <div className={`ex-section__flag${restriction.severity === 'avoid' ? ' ex-section__flag--avoid' : ' ex-section__flag--warn'}`}>
          <span>{restriction.label} — {restriction.severity === 'avoid' ? 'flagged as avoid' : 'modify load/range'}</span>
          {restriction.severity === 'avoid' && !override && (
            <button onClick={() => setOverride(true)}>Override</button>
          )}
        </div>
      )}

      {!restricted && (
        <div className="ex-section__sets">
          <div className="ex-section__set-grid ex-section__set-grid--head">
            <span>Done</span>
            <span>{unit}</span>
            <span>Reps</span>
            <span>RPE</span>
            <span />
          </div>

          {sets.map((s) => (
            <div
              key={s.id}
              className={`ex-section__set-grid ex-section__set-row${s.completed ? ' ex-section__set-row--done' : ''}`}
            >
              <button
                className="ex-section__set-check"
                onClick={() => onCompleteSet(s.id, !s.completed, restSeconds)}
                aria-label={s.completed ? `Set ${s.setNumber} done` : `Mark set ${s.setNumber} done`}
              >
                {s.completed ? '✓' : s.setNumber}
              </button>
              <input
                type="number" inputMode="decimal" min="0" step="0.5"
                value={s.weightKg ?? ''} placeholder={targetWeight !== undefined ? String(targetWeight) : '—'}
                onChange={(e) => onUpdateSet(s.id, { weightKg: e.target.value === '' ? null : Number(e.target.value) })}
              />
              <input
                type="number" inputMode="numeric" min="0" step="1"
                value={s.reps ?? ''} placeholder={targetReps}
                onChange={(e) => onUpdateSet(s.id, { reps: e.target.value === '' ? null : Number(e.target.value) })}
              />
              <input
                type="number" inputMode="decimal" min="6" max="10" step="0.5"
                value={s.rpe ?? ''} placeholder={targetRpe !== undefined ? String(targetRpe) : '—'}
                onChange={(e) => onUpdateSet(s.id, { rpe: e.target.value === '' ? null : Number(e.target.value) })}
              />
              <button
                className="ex-section__set-del"
                onClick={() => onDeleteSet(s.id)}
                aria-label={`Delete set ${s.setNumber}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          <button className="ex-section__add" onClick={addSet}>
            <Plus size={14} />
            <span>Add set</span>
          </button>
        </div>
      )}
    </section>
  );
}
