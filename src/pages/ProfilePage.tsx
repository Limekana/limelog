import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage, SUPPORTED_LANGS, LANGUAGE_NAMES, type Lang } from '@/i18n';
import { useScrollSelectedIntoView } from '@/utils/useScrollSelectedIntoView';
import { useUserStore } from '@/store/userStore';
import { Button, Card, Badge, EmptyState, Tabs, TabPanel } from '@/components/ui';
import { InjuryForm } from '@/components/InjuryForm';
import { ExerciseLibrary } from '@/components/ExerciseLibrary';
import { NexusSyncCard } from '@/components/NexusSyncCard';
import { ShieldAlert } from 'lucide-react';
import { downloadExport, deleteAccount, wipeAllLocalData } from '@/lib/dataRights';
import { supabase, isNexusConfigured } from '@/lib/supabase';
import './ProfilePage.css';

type Tab = 'injuries' | 'exercises' | 'settings';

export function ProfilePage() {
  const { profile, setName, setUnit, setAiEnabled, resolveRestriction, removeRestriction, updateDeloadThresholds } = useUserStore();
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').split('-')[0] as Lang;
  const langRef = useScrollSelectedIntoView<HTMLDivElement>();
  const [tab, setTab] = useState<Tab>('injuries');
  const [showInjuryForm, setShowInjuryForm] = useState(false);
  const [nameVal, setNameVal] = useState(profile.name);
  const [deleting, setDeleting] = useState(false);
  const [dataMsg, setDataMsg] = useState<string | null>(null);

  // ── GDPR Art. 20 — portability ──────────────────────────────────────────
  // Works as a guest too: a guest's training history never left the device,
  // but it is still their data.
  const onExport = async () => {
    setDataMsg(null);
    try {
      let account: { id: string; email?: string } | null = null;
      if (isNexusConfigured) {
        const { data } = await supabase.auth.getUser();
        if (data.user) account = { id: data.user.id, email: data.user.email };
      }
      const name = downloadExport(account);
      setDataMsg(t('settings.exportDone', { name }));
    } catch (e) {
      setDataMsg(t('settings.exportFailed', { msg: (e as Error).message }));
    }
  };

  // ── GDPR Art. 17 — erasure ──────────────────────────────────────────────
  // Two confirmations, because this is irreversible, there is no recovery
  // window, and one account spans all three apps — which the second
  // confirmation says explicitly.
  const onDeleteAccount = async () => {
    if (!window.confirm(t('settings.deleteAccountConfirm1'))) return;
    if (!window.confirm(t('settings.deleteAccountConfirm2'))) return;
    setDataMsg(null);
    setDeleting(true);
    try {
      await deleteAccount({
        clearLocal: async () => {
          wipeAllLocalData();
        },
      });
      window.location.reload();
    } catch (e) {
      setDataMsg(t('settings.deleteAccountFailed', { msg: (e as Error).message }));
      setDeleting(false);
    }
  };

  const activeRestrictions = profile.activeRestrictions.filter((r) => r.active);
  const resolvedRestrictions = profile.activeRestrictions.filter((r) => !r.active);

  return (
    <div className="profile-page">
      <div className="profile-page__header">
        <h1 className="profile-page__title">{t('profile.title')}</h1>
      </div>

      <Tabs
        tabs={[
          { key: 'injuries', label: t('profile.tabInjuries') },
          { key: 'exercises', label: t('profile.tabExercises') },
          { key: 'settings', label: t('profile.tabSettings') },
        ]}
        activeKey={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      <TabPanel tabKey="injuries" activeKey={tab}>
        <div className="profile-section">
          <div className="profile-section__header">
            <span className="profile-section__label">{t('profile.activeRestrictions')}</span>
            <Button size="sm" variant="primary" onClick={() => setShowInjuryForm(true)}>
              {t('common.add')}
            </Button>
          </div>

          {showInjuryForm && (
            <InjuryForm onClose={() => setShowInjuryForm(false)} />
          )}

          {activeRestrictions.length === 0 && !showInjuryForm && (
            <EmptyState
              icon={<ShieldAlert size={32} />}
              title={t('profile.noRestrictionsTitle')}
              description={t('profile.noRestrictionsBody')}
            />
          )}

          {activeRestrictions.map((r) => (
            <Card key={r.id} padding="sm">
              <div className="restriction-row">
                <div className="restriction-row__left">
                  <span className="restriction-row__label">{r.label}</span>
                  <Badge
                    label={t(`profile.severity.${r.severity}`, { defaultValue: r.severity })}
                    variant={r.severity === 'avoid' ? 'danger' : r.severity === 'modify' ? 'warning' : 'info'}
                  />
                </div>
                <div className="restriction-row__actions">
                  <Button size="sm" variant="ghost" onClick={() => resolveRestriction(r.id)}>{t('profile.resolve')}</Button>
                  <Button size="sm" variant="danger" onClick={() => removeRestriction(r.id)}>{t('profile.remove')}</Button>
                </div>
              </div>
              {r.restrictedPatterns.length > 0 && (
                <p className="restriction-row__patterns">
                  {t('profile.patterns', { list: r.restrictedPatterns.map((p) => t(`library.pattern.${p}`, { defaultValue: p })).join(', ') })}
                </p>
              )}
            </Card>
          ))}

          {resolvedRestrictions.length > 0 && (
            <>
              <p className="profile-section__sublabel">{t('profile.resolved')}</p>
              {resolvedRestrictions.map((r) => (
                <Card key={r.id} padding="sm" className="restriction-row--resolved">
                  <div className="restriction-row">
                    <span className="restriction-row__label">{r.label}</span>
                    <Button size="sm" variant="danger" onClick={() => removeRestriction(r.id)}>{t('profile.remove')}</Button>
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
              <span className="settings-field__label">{t('profile.name')}</span>
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
            <span className="settings-field__label">{t('profile.weightUnit')}</span>
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

          {/* Privacy & AI. Off by default — the debrief sends the note you type
              to Google Gemini, so it stays dark until asked for. */}
          <Card padding="md">
            <span className="settings-field__label">{t('settings.privacy')}</span>
            <div className="settings-field settings-field--mt">
              <span className="settings-field__sublabel">
                {profile.aiEnabled ? t('settings.aiFeaturesOnSub') : t('settings.aiFeaturesOffSub')}
              </span>
              <div className="settings-toggle">
                {([false, true] as const).map((on) => (
                  <button
                    key={String(on)}
                    className={`settings-toggle__btn${!!profile.aiEnabled === on ? ' settings-toggle__btn--active' : ''}`}
                    onClick={() => setAiEnabled(on)}
                    aria-pressed={!!profile.aiEnabled === on}
                  >
                    {on ? t('settings.aiOn') : t('settings.aiOff')}
                  </button>
                ))}
              </div>
            </div>
            {/* Free-tier disclosure — informed consent belongs at the switch. */}
            <div className="settings-field__sublabel settings-ai-note">
              {t('settings.aiTrainingNote')}
            </div>
            <a
              className="settings-field__sublabel settings-privacy-link"
              href="https://limekana.github.io/nexus-command-center/legal/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('settings.privacyPolicy')} ›
            </a>
          </Card>

          {/* Your data — GDPR Art. 17 / 20. Buttons rather than a "write to us"
              address: a right the user has to request is a right most of them
              never exercise. */}
          <Card padding="md">
            <span className="settings-field__label">{t('settings.yourData')}</span>
            <div className="settings-field__sublabel settings-ai-note">
              {t('settings.yourDataNote')}
            </div>
            <button
              className="settings-data-btn"
              onClick={onExport}
            >
              {t('settings.exportData')}
            </button>
            <button
              className="settings-data-btn settings-data-btn--danger"
              onClick={onDeleteAccount}
              disabled={deleting}
            >
              {deleting ? t('settings.deletingAccount') : t('settings.deleteAccount')}
            </button>
            <div className="settings-field__sublabel settings-ai-note">
              {t('settings.deleteAccountNote')}
            </div>
            {dataMsg && <div className="settings-data-msg">{dataMsg}</div>}
          </Card>

          <Card padding="md">
            <span className="settings-field__label">{t('settings.language')}</span>
            <div className="settings-lang-grid" ref={langRef}>
              {SUPPORTED_LANGS.map((code) => (
                <button
                  key={code}
                  className={`settings-toggle__btn${currentLang === code ? ' settings-toggle__btn--active' : ''}`}
                  onClick={() => setLanguage(code)}
                  aria-pressed={currentLang === code}
                >
                  {LANGUAGE_NAMES[code]}
                </button>
              ))}
            </div>
          </Card>

          <Card padding="md">
            <span className="settings-field__label">{t('profile.deloadThresholds')}</span>
            <label className="settings-field">
              <span className="settings-field__sublabel">{t('profile.stallTrigger')}</span>
              <input
                type="number"
                min="1"
                max="10"
                value={profile.deloadThresholds.stallCountTrigger}
                onChange={(e) => updateDeloadThresholds({ stallCountTrigger: Number(e.target.value) })}
              />
            </label>
            <label className="settings-field settings-field--mt">
              <span className="settings-field__sublabel">{t('profile.fatigueTrigger')}</span>
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
