import { useState } from 'react';
import { useProgramStore } from '@/store/programStore';
import { useLogStore } from '@/store/logStore';
import { useUserStore } from '@/store/userStore';
import { formatDate } from '@/utils/helpers';
import { EmptyState, Card, Button, Tabs, TabPanel } from '@/components/ui';
import { JumpLogModal } from '@/components/JumpLogModal';
import { LoadChart } from '@/components/LoadChart';
import { OneRMChart } from '@/components/OneRMChart';
import { bestEstimateForExercise } from '@/utils/oneRepMax';
import { BarChart2, TrendingUp, Zap } from 'lucide-react';
import './ProgressPage.css';

type ProgressTab = 'load' | 'orm' | 'jump' | 'history';

export function ProgressPage() {
  const { programs, exercises } = useProgramStore();
  const { sessionLogs, jumpLogs, stallFlags, getSetsForExercise } = useLogStore();
  const { profile } = useUserStore();
  const [selectedExId, setSelectedExId] = useState<string>(exercises[0]?.id ?? '');
  const [showJumpModal, setShowJumpModal] = useState(false);
  const [activeTab, setActiveTab] = useState<ProgressTab>('load');

  const unit = profile.unitPreference;
  const activeStalls = stallFlags.filter((f) => !f.resolved);

  const exercisedLogged = exercises.filter((e) => getSetsForExercise(e.id).length > 0);

  const recentJumps = [...jumpLogs]
    .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime())
    .slice(0, 10);

  const finalizedLogs = [...sessionLogs]
    .filter((l) => l.finalizedAt !== undefined)
    .sort((a, b) => new Date(b.finalizedAt!).getTime() - new Date(a.finalizedAt!).getTime());

  function getSessionName(sessionTemplateId: string): string {
    for (const prog of programs) {
      const session = prog.sessions.find((s) => s.id === sessionTemplateId);
      if (session) return session.name;
    }
    return 'Unknown session';
  }

  return (
    <div className="progress-page">
      <h1 className="progress-page__title">Progress</h1>

      <Tabs
        tabs={[
          { key: 'load', label: 'Load Trends' },
          { key: 'orm', label: 'Est. 1RM' },
          { key: 'jump', label: 'Vertical Jump' },
          { key: 'history', label: 'History' },
        ]}
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as ProgressTab)}
      />

      <TabPanel tabKey="load" activeKey={activeTab}>
        <>
          {activeStalls.length > 0 && (
            <div className="progress-stalls">
              <span className="progress-stalls__label">Stall flags</span>
              {activeStalls.map((f) => {
                const ex = exercises.find((e) => e.id === f.exerciseId);
                return (
                  <div key={f.id} className="progress-stall-item">
                    <span>{ex?.name ?? 'Unknown'}</span>
                    <span className="progress-stall-item__type">{f.flagType === 'weight_plateau' ? 'Weight plateau' : 'RPE creep'}</span>
                  </div>
                );
              })}
            </div>
          )}

          {exercisedLogged.length === 0 ? (
            <EmptyState icon={<BarChart2 size={36} />} title="No sessions logged yet" description="Complete a session to see load trends." />
          ) : (
            <>
              <select
                aria-label="Select exercise"
                className="progress-exercise-select"
                value={selectedExId}
                onChange={(e) => setSelectedExId(e.target.value)}
              >
                {exercisedLogged.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              {selectedExId && <LoadChart exerciseId={selectedExId} sessionLogs={sessionLogs} unit={unit} />}
            </>
          )}
        </>
      </TabPanel>

      <TabPanel tabKey="orm" activeKey={activeTab}>
        <>
          {/* Estimated 1RM = Brzycki for reps ≤ 10, Epley for 11-12, null
              above 12 reps (formula reliability craters). Per-exercise
              dropdown reuses the same logged-exercise list as the load
              tab so empty exercises don't clutter. Below the chart, a
              ranked list of every exercise's best e1RM gives an at-a-
              glance leaderboard across the user's main lifts. */}
          {exercisedLogged.length === 0 ? (
            <EmptyState
              icon={<TrendingUp size={36} />}
              title="No 1RM data yet"
              description="Complete a session with weight × reps logged to see an estimated 1RM trend."
            />
          ) : (
            <>
              <select
                aria-label="Select exercise for 1RM trend"
                className="progress-exercise-select"
                value={selectedExId}
                onChange={(e) => setSelectedExId(e.target.value)}
              >
                {exercisedLogged.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              {selectedExId && (
                <OneRMChart exerciseId={selectedExId} sessionLogs={sessionLogs} unit={unit} />
              )}

              {/* Best-ever leaderboard — sorted by estimated 1RM descending.
                  Useful for at-a-glance "where am I strongest" view without
                  cycling the dropdown across every lift. */}
              <div className="progress-orm-list">
                <div className="progress-orm-list__header">Best estimates</div>
                {exercisedLogged
                  .map((e) => ({ ex: e, best: bestEstimateForExercise(sessionLogs, e.id) }))
                  .filter((row) => row.best != null)
                  .sort((a, b) => (b.best ?? 0) - (a.best ?? 0))
                  .slice(0, 10)
                  .map((row) => {
                    const display = unit === 'lb'
                      ? Math.round((row.best ?? 0) * 2.2046 * 10) / 10
                      : Math.round((row.best ?? 0) * 10) / 10;
                    return (
                      <div key={row.ex.id} className="progress-orm-row">
                        <span className="progress-orm-row__name">{row.ex.name}</span>
                        <span className="progress-orm-row__value">{display} {unit}</span>
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </>
      </TabPanel>

      <TabPanel tabKey="jump" activeKey={activeTab}>
        <>
          <div className="progress-jump-header">
            <span className="progress-jump-header__count">{jumpLogs.length} entries</span>
            <Button size="sm" variant="primary" onClick={() => setShowJumpModal(true)}>
              <Zap size={13} aria-hidden="true" /> Log jump
            </Button>
          </div>

          {recentJumps.length === 0 ? (
            <EmptyState icon={<Zap size={36} />} title="No jumps logged" description="Track your vertical jump to monitor athletic progress." action={<Button variant="primary" onClick={() => setShowJumpModal(true)}>Log first jump</Button>} />
          ) : (
            recentJumps.map((j) => (
              <Card key={j.id} padding="sm">
                <div className="jump-entry">
                  <div>
                    <span className="jump-entry__height">{j.heightCm} cm</span>
                    <span className="jump-entry__condition">{j.condition.replace('_', ' ')}</span>
                  </div>
                  <span className="jump-entry__date">{formatDate(j.loggedAt)}</span>
                </div>
                {j.notes && <p className="jump-entry__notes">{j.notes}</p>}
              </Card>
            ))
          )}
        </>
      </TabPanel>

      {showJumpModal && <JumpLogModal onClose={() => setShowJumpModal(false)} />}

      <TabPanel tabKey="history" activeKey={activeTab}>
        <>
          {finalizedLogs.length === 0 ? (
            <EmptyState icon={<BarChart2 size={36} />} title="No completed sessions" description="Finish a session to see it here." />
          ) : (
            finalizedLogs.map((l) => {
              const totalSets = l.sets.filter((s) => s.completed).length;
              return (
                <Card key={l.id} padding="sm">
                  <div className="history-entry">
                    <div className="history-entry__main">
                      <span className="history-entry__name">{getSessionName(l.sessionTemplateId)}</span>
                      <span className="history-entry__date">{formatDate(l.finalizedAt!)}</span>
                    </div>
                    <div className="history-entry__meta">
                      <span className="history-entry__sets">{totalSets} sets</span>
                      {l.perceivedFatigue !== null && (
                        <span className="history-entry__fatigue">RPE {l.perceivedFatigue}</span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </>
      </TabPanel>
    </div>
  );
}
