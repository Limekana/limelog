import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProgramStore } from '@/store/programStore';
import { useLogStore } from '@/store/logStore';
import { useUserStore } from '@/store/userStore';
import { formatWeight } from '@/utils/helpers';
import { playRestComplete } from '@/utils/audio';
import { getLastSessionSets, type LastSessionRef } from '@/lib/lastSessionSets';
import type { SetLog, ExercisePR } from '@/types/logging';
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

// v1.7 (BUG-9) — the rest timer is now WALL-CLOCK based, not a decrementing
// in-memory counter. The old model ran `setInterval` subtracting 1 each tick
// and held the count only in React state — so backgrounding the app (Android
// freezes WebView JS timers) made it drift/appear to "reset," and a process
// kill wiped it entirely, dumping the user out of the workout with no timer.
// Now we persist the ABSOLUTE end time to localStorage and always derive the
// remaining seconds from `Date.now()`. Backgrounding no longer matters (on
// resume we just recompute from wall-clock), and a kill-then-resume rehydrates
// the live timer from storage. The persisted record is scoped to the workout's
// logId so a stale timer never bleeds into a different session.
interface RestState {
  /** Absolute epoch ms when the rest ends. */
  endsAt: number;
  total: number;
  exerciseName: string;
}

interface PersistedRest extends RestState {
  logId: string;
}

const ACTIVE_REST_KEY = 'wt_active_rest';

function loadActiveRest(): PersistedRest | null {
  try {
    const raw = localStorage.getItem(ACTIVE_REST_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PersistedRest;
    return typeof p?.endsAt === 'number' && typeof p?.logId === 'string' ? p : null;
  } catch {
    return null;
  }
}

function saveActiveRest(r: RestState, logId: string): void {
  try {
    localStorage.setItem(ACTIVE_REST_KEY, JSON.stringify({ ...r, logId }));
  } catch {
    /* non-fatal — the in-memory timer still works this session */
  }
}

function clearActiveRest(): void {
  try {
    localStorage.removeItem(ACTIVE_REST_KEY);
  } catch {
    /* ignore */
  }
}

function remainingSecs(rest: RestState | null, now: number): number {
  return rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : 0;
}

export function WorkoutPage() {
  const { logId = '' } = useParams();
  const navigate = useNavigate();
  const { activeProgram, exercises, updateSessionExercise } = useProgramStore();
  const { sessionLogs, logSet, updateSet, deleteSet, checkAndFlagStalls, setPerceivedFatigue, finalizeSession, discardSession, currentPRFor } = useLogStore();
  const { profile } = useUserStore();

  const log = sessionLogs.find((l) => l.id === logId) ?? null;
  const session = useMemo(
    () => activeProgram?.sessions.find((s) => s.id === log?.sessionTemplateId) ?? null,
    [activeProgram, log?.sessionTemplateId]
  );

  const [rest, setRest] = useState<RestState | null>(null);
  // Bumped once a second while a rest is active, purely to re-render the
  // wall-clock-derived countdown. Not the source of truth — `rest.endsAt` is.
  const [, setTick] = useState(0);
  const [modal, setModal] = useState<{ qualifying: QualifyingExercise[] } | null>(null);

  // Rehydrate a still-running rest on mount (covers process-death + resume, and
  // a plain remount). Only adopt it if it belongs to THIS workout and hasn't
  // already elapsed; otherwise clear the stale record.
  useEffect(() => {
    const saved = loadActiveRest();
    if (saved && saved.logId === logId && saved.endsAt > Date.now()) {
      setRest({ endsAt: saved.endsAt, total: saved.total, exerciseName: saved.exerciseName });
    } else if (saved) {
      clearActiveRest();
    }
  }, [logId]);

  // The single interval: while a rest is active, tick once a second to refresh
  // the countdown, and fire completion the moment wall-clock passes endsAt.
  // Re-created whenever `rest` changes (start / adjust / skip), so there's never
  // a dangling timer. Because remaining is derived from Date.now(), a resume
  // after backgrounding is automatically correct — no drift, no reset.
  useEffect(() => {
    if (!rest) return;
    const check = () => {
      if (Date.now() >= rest.endsAt) {
        playRestComplete();
        clearActiveRest();
        setRest(null);
      } else {
        setTick((t) => t + 1);
      }
    };
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [rest]);

  const startRest = useCallback((secs: number, exerciseName: string) => {
    if (!secs || secs <= 0) return;
    const next: RestState = { endsAt: Date.now() + secs * 1000, total: secs, exerciseName };
    saveActiveRest(next, logId);
    setRest(next);
  }, [logId]);

  const skipRest = useCallback(() => {
    clearActiveRest();
    setRest(null);
  }, []);

  const adjustRest = useCallback((delta: number) => {
    setRest((prev) => {
      if (!prev) return null;
      const nextRemaining = Math.max(1, remainingSecs(prev, Date.now()) + delta);
      const next: RestState = {
        ...prev,
        endsAt: Date.now() + nextRemaining * 1000,
        total: Math.max(prev.total, nextRemaining),
      };
      saveActiveRest(next, logId);
      return next;
    });
  }, [logId]);

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
      clearActiveRest();
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
    clearActiveRest();
    setModal(null);
    navigate('/today');
  }

  function handleModalSkip() {
    finalizeSession(log!.id);
    clearActiveRest();
    setModal(null);
    navigate('/today');
  }

  function handleDiscard() {
    if (confirm('Discard this workout? All logged sets will be lost.')) {
      discardSession(log!.id);
      clearActiveRest();
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

  const restRemaining = remainingSecs(rest, Date.now());
  const restPct = rest ? (restRemaining / rest.total) * 100 : 0;
  const restUrgent = rest !== null && restRemaining <= 5;

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
                  <span className="rest-bar__seconds-num">{restRemaining}</span>
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
          const lastSession = getLastSessionSets(sessionLogs, exercise.id, log.id);
          const pr = currentPRFor(exercise.id);

          return (
            <ExerciseSection
              key={se.id}
              index={idx + 1}
              exerciseName={exercise.name}
              exerciseId={exercise.id}
              lastSession={lastSession}
              pr={pr}
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
  lastSession?: LastSessionRef | null;
  pr?: ExercisePR | null;
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
  lastSession,
  pr,
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
            {pr && (
              <span className="ex-section__pr" title="Current personal record">
                PR {formatWeight(pr.weightKg, unit)}×{pr.reps}
              </span>
            )}
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
          {/* v1.6 — progressive overload reference: what you did last time. */}
          {lastSession ? (
            <div className="ex-section__last">
              <span className="ex-section__last-label">Last · {lastSession.date.slice(5)}</span>
              <div className="ex-section__last-sets">
                {lastSession.sets.map((s) => (
                  <span key={s.id} className="ex-section__last-set">
                    {s.weightKg != null ? formatWeight(s.weightKg, unit) : '—'}
                    <span className="ex-section__last-x">×</span>
                    {s.reps ?? '—'}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="ex-section__last ex-section__last--empty">First time — no history yet</div>
          )}

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
                onChange={(e) => onUpdateSet(s.id, { weightKg: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
              />
              <input
                type="number" inputMode="numeric" min="0" step="1"
                value={s.reps ?? ''} placeholder={targetReps}
                onChange={(e) => onUpdateSet(s.id, { reps: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
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
