import { useState } from 'react';
import { useUserStore } from '@/store/userStore';
import { Button, Card, Badge, EmptyState, Tabs, TabPanel } from '@/components/ui';
import { InjuryForm } from '@/components/InjuryForm';
import { ExerciseLibrary } from '@/components/ExerciseLibrary';
import { NexusSyncCard } from '@/components/NexusSyncCard';
import { ShieldAlert } from 'lucide-react';
import './ProfilePage.css';

type Tab = 'injuries' | 'exercises' | 'settings';

export function ProfilePage() {
  const { profile, setName, setUnit, resolveRestriction, removeRestriction, updateDeloadThresholds } = useUserStore();
  const [tab, setTab] = useState<Tab>('injuries');
  const [showInjuryForm, setShowInjuryForm] = useState(false);
  const [nameVal, setNameVal] = useState(profile.name);

  const activeRestrictions = profile.activeRestrictions.filter((r) => r.active);
  const resolvedRestrictions = profile.activeRestrictions.filter((r) => !r.active);

  return (
    <div className="profile-page">
      <div className="profile-page__header">
        <h1 className="profile-page__title">Profile</h1>
      </div>

      <Tabs
        tabs={[
          { key: 'injuries', label: 'Injuries' },
          { key: 'exercises', label: 'Exercises' },
          { key: 'settings', label: 'Settings' },
        ]}
        activeKey={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      <TabPanel tabKey="injuries" activeKey={tab}>
        <div className="profile-section">
          <div className="profile-section__header">
            <span className="profile-section__label">Active restrictions</span>
            <Button size="sm" variant="primary" onClick={() => setShowInjuryForm(true)}>
              Add
            </Button>
          </div>

          {showInjuryForm && (
            <InjuryForm onClose={() => setShowInjuryForm(false)} />
          )}

          {activeRestrictions.length === 0 && !showInjuryForm && (
            <EmptyState
              icon={<ShieldAlert size={32} />}
              title="No active restrictions"
              description="Add injury flags to gate restricted movements during logging."
            />
          )}

          {activeRestrictions.map((r) => (
            <Card key={r.id} padding="sm">
              <div className="restriction-row">
                <div className="restriction-row__left">
                  <span className="restriction-row__label">{r.label}</span>
                  <Badge
                    label={r.severity}
                    variant={r.severity === 'avoid' ? 'danger' : r.severity === 'modify' ? 'warning' : 'info'}
                  />
                </div>
                <div className="restriction-row__actions">
                  <Button size="sm" variant="ghost" onClick={() => resolveRestriction(r.id)}>Resolve</Button>
                  <Button size="sm" variant="danger" onClick={() => removeRestriction(r.id)}>Remove</Button>
                </div>
              </div>
              {r.restrictedPatterns.length > 0 && (
                <p className="restriction-row__patterns">
                  Patterns: {r.restrictedPatterns.join(', ')}
                </p>
              )}
            </Card>
          ))}

          {resolvedRestrictions.length > 0 && (
            <>
              <p className="profile-section__sublabel">Resolved</p>
              {resolvedRestrictions.map((r) => (
                <Card key={r.id} padding="sm" className="restriction-row--resolved">
                  <div className="restriction-row">
                    <span className="restriction-row__label">{r.label}</span>
                    <Button size="sm" variant="danger" onClick={() => removeRestriction(r.id)}>Remove</Button>
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>
      </TabPanel>

      <TabPanel tabKey="exercises" activeKey={tab}>
        <ExerciseLibrary />
      </TabPanel>

      <TabPanel tabKey="settings" activeKey={tab}>
        <div className="profile-section">
          <Card padding="md">
            <label className="settings-field">
              <span className="settings-field__label">Name</span>
              <div className="settings-field__row">
                <input
                  value={nameVal}
                  onChange={(e) => setNameVal(e.target.value)}
                  onBlur={() => nameVal.trim() && setName(nameVal.trim())}
                />
              </div>
            </label>
          </Card>

          <Card padding="md">
            <span className="settings-field__label">Weight unit</span>
            <div className="settings-toggle">
              {(['kg', 'lb'] as const).map((u) => (
                <button
                  key={u}
                  className={`settings-toggle__btn${profile.unitPreference === u ? ' settings-toggle__btn--active' : ''}`}
                  onClick={() => setUnit(u)}
                >
                  {u}
                </button>
              ))}
            </div>
          </Card>

          <NexusSyncCard />

          <Card padding="md">
            <span className="settings-field__label">Deload thresholds</span>
            <label className="settings-field">
              <span className="settings-field__sublabel">Stall count trigger</span>
              <input
                type="number"
                min="1"
                max="10"
                value={profile.deloadThresholds.stallCountTrigger}
                onChange={(e) => updateDeloadThresholds({ stallCountTrigger: Number(e.target.value) })}
              />
            </label>
            <label className="settings-field settings-field--mt">
              <span className="settings-field__sublabel">Avg fatigue trigger (1–10)</span>
              <input
                type="number"
                min="1"
                max="10"
                step="0.5"
                value={profile.deloadThresholds.avgFatigueTrigger}
                onChange={(e) => updateDeloadThresholds({ avgFatigueTrigger: Number(e.target.value) })}
              />
            </label>
          </Card>
        </div>
      </TabPanel>
    </div>
  );
}
