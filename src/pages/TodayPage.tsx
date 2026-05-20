import { useNavigate } from 'react-router-dom';
import { useProgramStore } from '@/store/programStore';
import { useLogStore } from '@/store/logStore';
import type { SessionTemplate } from '@/types/program';
import { getDayOfWeek } from '@/utils/helpers';
import { EmptyState, Button, Badge } from '@/components/ui';
import { Dumbbell, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
  const { activeProgram } = useProgramStore();
  const { sessionLogs, startSession, unfinalizeSession, discardSession, stallFlags } = useLogStore();

  const now = new Date();
  const today = getDayOfWeek();
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][today];
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

  const todaySessions: SessionTemplate[] = activeProgram
    ? activeProgram.sessions.filter((s) => s.dayOfWeek === today)
    : [];

  function getCurrentPhase() {
    if (!activeProgram) return null;
    return activeProgram.phases.find((ph) => ph.orderIndex === 0) ?? activeProgram.phases[0] ?? null;
  }
  const phase = getCurrentPhase();

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

          return (
            <div key={session.id} className="today-session">
              <div className="today-session__header">
                <div className="today-session__title-block">
                  <span className="today-session__name">{session.name}</span>
                  <span className="today-session__sub">
                    {session.exercises.length} exercise{session.exercises.length === 1 ? '' : 's'} · {plannedCount} sets
                  </span>
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
