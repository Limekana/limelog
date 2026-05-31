import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProgramStore } from '@/store/programStore';
import { useLogStore } from '@/store/logStore';
import type { SessionTemplate } from '@/types/program';
import { getDayOfWeek } from '@/utils/helpers';
import { bestEstimateForExercise, missedRepRatio } from '@/utils/oneRepMax';
import { EmptyState, Button, Badge } from '@/components/ui';
import { Dumbbell, AlertTriangle, CheckCircle2, TrendingUp, ChevronRight } from 'lucide-react';
import './TodayPage.css';

function isSameLocalDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function TodayPage() {
  const navigate = useNavigate();
  const { activeProgram, exercises, advancePhase } = useProgramStore();
  const { sessionLogs, startSession, unfinalizeSession, discardSession, stallFlags } = useLogStore();

  const now = new Date();
  const today = getDayOfWeek();
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][today];
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

  const todaySessions: SessionTemplate[] = activeProgram
    ? activeProgram.sessions.filter((s) => s.dayOfWeek === today)
    : [];

  // v1.2 — phase tracking honors Program.activePhaseId when set. Old
  // programs without the field fall back to lowest-orderIndex (matches
  // v1.1 behavior). Sorted explicitly so the "next phase" lookup is
  // stable regardless of how phases are stored.
  function getCurrentPhaseAndNext() {
    if (!activeProgram || activeProgram.phases.length === 0) {
      return { current: null, next: null };
    }
    const sorted = [...activeProgram.phases].sort((a, b) => a.orderIndex - b.orderIndex);
    const idx = activeProgram.activePhaseId
      ? sorted.findIndex((ph) => ph.id === activeProgram.activePhaseId)
      : 0;
    const safeIdx = idx < 0 ? 0 : idx;
    return {
      current: sorted[safeIdx] ?? null,
      next: safeIdx < sorted.length - 1 ? sorted[safeIdx + 1] : null,
    };
  }
  const { current: phase, next: nextPhase } = getCurrentPhaseAndNext();

  // v1.2 — deload suggestion. Walks the last 3 finalized sessions and
  // compares logged reps to each exercise's targetReps lower-bound.
  // ≥30% missed-rep ratio surfaces a soft "consider deload" banner.
  // Does not auto-advance — the user always decides.
  const deloadSuggestion = useMemo(() => {
    if (!activeProgram) return null;
    if (phase?.type === 'deload') return null; // already on a deload phase
    const targetReps = new Map<string, string>();
    for (const session of activeProgram.sessions) {
      for (const se of session.exercises) {
        // Only first occurrence wins — different sessions can prescribe
        // different rep ranges for the same exercise; we use whichever
        // appears first as a reasonable default.
        if (!targetReps.has(se.exerciseId)) targetReps.set(se.exerciseId, se.targetReps);
      }
    }
    const recent = [...sessionLogs]
      .filter((l) => l.finalizedAt)
      .sort((a, b) => new Date(b.finalizedAt!).getTime() - new Date(a.finalizedAt!).getTime());
    const result = missedRepRatio(recent, targetReps, 3);
    // Need a meaningful sample size — single-set ratios overreact.
    if (result.totalSets < 10) return null;
    if (result.ratio < 0.3) return null;
    return result;
  }, [activeProgram, sessionLogs, phase?.type]);

  function handleAdvancePhase() {
    if (!activeProgram || !nextPhase) return;
    const advanced = advancePhase(activeProgram.id);
    if (advanced) {
      // No flash component here — the Badge update at the top of the
      // page provides instant visual confirmation that the advance
      // landed (phase name + variant change).
    }
  }

  function handleStartSession(session: SessionTemplate) {
    const log = startSession(session.id, activeProgram!.id);
    navigate(`/workout/${log.id}`);
  }

  function handleResume(logId: string) {
    navigate(`/workout/${logId}`);
  }

  function handleDiscard(logId: string) {
    if (confirm('Discard this workout? All logged sets will be lost.')) {
      discardSession(logId);
    }
  }

  const activeStalls = stallFlags.filter((f) => !f.resolved);

  if (!activeProgram) {
    return (
      <div className="today-page">
        <div className="today-header">
          <div>
            <span className="today-header__day">{dayName}</span>
            <span className="today-header__date">{dateStr}</span>
          </div>
        </div>
        <EmptyState
          icon={<Dumbbell size={36} />}
          title="No active program"
          description="Create a program in the Program tab to get started."
          action={<Button variant="primary" onClick={() => navigate('/program')}>Go to Programs</Button>}
        />
      </div>
    );
  }

  return (
    <div className="today-page">
      <div className="today-header">
        <div>
          <span className="today-header__day">{dayName}</span>
          <span className="today-header__date">{dateStr}</span>
        </div>
        {phase && (
          <Badge
            label={phase.name}
            variant={
              phase.type === 'deload' ? 'info'
              : phase.type === 'peaking' ? 'accent'
              : phase.type === 'intensification' ? 'warning'
              : 'muted'
            }
            size="md"
          />
        )}
      </div>

      {activeStalls.length > 0 && (
        <div className="today-alert">
          <AlertTriangle size={15} />
          <span>{activeStalls.length} stall flag{activeStalls.length > 1 ? 's' : ''} detected — consider a deload</span>
        </div>
      )}

      {/* v1.2 — deload suggestion from missed-rep heuristic. Only shows
          when ≥30% of completed sets in the last 3 sessions fell short
          of their target rep lower-bound, AND we're not already on a
          deload phase. Suggestion only — never auto-advances. */}
      {deloadSuggestion && (
        <div className="today-alert today-alert--warn">
          <AlertTriangle size={15} />
          <span>
            {deloadSuggestion.missedSets}/{deloadSuggestion.totalSets} sets fell short over your last 3 sessions —
            {' '}
            {nextPhase ? 'consider advancing to a deload phase.' : 'consider scheduling a deload.'}
          </span>
        </div>
      )}

      {/* v1.2 — phase advance prompt. Shown whenever there's a next
          phase available; the user manually triggers progression. The
          deload heuristic above can prompt this.
          v1.4 — variant + size aligned with Start session (primary md)
          since both are "begin the next thing" actions and should share
          the same visual weight. The chevron stays as a direction cue. */}
      {nextPhase && (
        <div className="today-phase-advance">
          <div className="today-phase-advance__copy">
            <span className="today-phase-advance__label">Next phase</span>
            <span className="today-phase-advance__name">{nextPhase.name}</span>
          </div>
          <Button variant="primary" size="md" onClick={handleAdvancePhase}>
            Advance <ChevronRight size={14} aria-hidden="true" />
          </Button>
        </div>
      )}

      {todaySessions.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={36} />}
          title="Rest day"
          description="No sessions scheduled today. Recovery is training."
        />
      ) : (
        todaySessions.map((session) => {
          // Only today's logs count as "active for today" — last week's data stays in the past.
          const log = sessionLogs.find((l) =>
            l.sessionTemplateId === session.id && isSameLocalDay(l.loggedAt, now)
          );
          const isDone = log !== undefined && log.finalizedAt !== undefined;
          const isActive = log !== undefined && !isDone;

          const completedCount = log?.sets.filter((s) => s.completed).length ?? 0;
          const plannedCount = session.exercises.reduce((sum, se) => sum + se.targetSets, 0);

          // v1.2 — top estimated 1RM for the session's first exercise
          // (usually the main lift). Surfaces in the card header as
          // motivation/context. Omitted if no prior data exists.
          const firstEx = session.exercises[0];
          const firstExName = firstEx ? exercises.find((e) => e.id === firstEx.exerciseId)?.name : null;
          const firstExBest = firstEx ? bestEstimateForExercise(sessionLogs, firstEx.exerciseId) : null;

          return (
            <div key={session.id} className="today-session">
              <div className="today-session__header">
                <div className="today-session__title-block">
                  <span className="today-session__name">{session.name}</span>
                  <span className="today-session__sub">
                    {session.exercises.length} exercise{session.exercises.length === 1 ? '' : 's'} · {plannedCount} sets
                  </span>
                  {firstExBest != null && firstExName && (
                    <span className="today-session__orm" title="Best estimated 1RM from your logs">
                      <TrendingUp size={11} aria-hidden="true" />
                      {' '}Top e1RM · {firstExName}: {Math.round(firstExBest * 10) / 10} kg
                    </span>
                  )}
                </div>
                {!log && (
                  <Button variant="primary" size="md" onClick={() => handleStartSession(session)}>
                    Start
                  </Button>
                )}
                {isActive && (
                  <div className="today-session__active-actions">
                    <Button variant="primary" size="md" onClick={() => handleResume(log!.id)}>
                      Resume
                    </Button>
                    <button
                      className="today-session__discard"
                      onClick={() => handleDiscard(log!.id)}
                      aria-label="Discard workout"
                    >
                      Discard
                    </button>
                  </div>
                )}
                {isDone && (
                  <div className="today-session__done-row">
                    <Badge label="Done" variant="success" />
                    <button
                      className="today-session__undo"
                      onClick={() => unfinalizeSession(log!.id)}
                    >
                      Undo
                    </button>
                  </div>
                )}
              </div>

              {isActive && (
                <div className="today-session__progress-row">
                  <div className="today-session__progress">
                    <div
                      className="today-session__progress-fill"
                      style={{ width: `${plannedCount > 0 ? Math.min(100, (completedCount / plannedCount) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="today-session__progress-text">
                    {completedCount} / {plannedCount}
                  </span>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
