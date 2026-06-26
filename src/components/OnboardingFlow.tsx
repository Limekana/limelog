// v1.7 — first-run onboarding wizard for LimeLog.
//
// Shows once on a fresh install, after the auth gate, when no sessions have
// been logged yet. Three steps: welcome → training-goal prompt (display only)
// → "how logging works" explainer → land on Today. Skippable at every step.
//
// Matches the FirstLaunchAuth industrial-brutalist lime language (Barlow
// Condensed wordmark, lime accent, dark base) so the two first-surfaces feel
// continuous. The goal choice is informational (seeds a future AI narrative);
// no logic gate.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { Dumbbell, Target, ListChecks, Globe } from 'lucide-react';
import { setLanguage, SUPPORTED_LANGS, LANGUAGE_NAMES, type Lang } from '@/i18n';
import { setOnboarded, setTrainingGoal, type TrainingGoal } from '@/lib/onboarding';
import './OnboardingFlow.css';

interface Props {
  /** Fired when the user finishes or skips. Parent flips the gate and renders
   *  the main app. */
  onDone: () => void;
}

const GOALS: { key: TrainingGoal; labelKey: string }[] = [
  { key: 'strength', labelKey: 'onboarding.goalStrength' },
  { key: 'hypertrophy', labelKey: 'onboarding.goalHypertrophy' },
  { key: 'sport', labelKey: 'onboarding.goalSport' },
  { key: 'general', labelKey: 'onboarding.goalGeneral' },
];

export function OnboardingFlow({ onDone }: Props) {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').split('-')[0] as Lang;
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<TrainingGoal | null>(null);

  function finish() {
    if (goal) setTrainingGoal(goal);
    setOnboarded();
    onDone();
  }

  function skip() {
    setOnboarded();
    onDone();
  }

  return (
    <div className="onb-wrap">
      <div className="onb-stack">
        <div className="onb-header">
          <span className="onb-wordmark">{t('app.name')}</span>
          <span className="onb-tagline">{t('app.tagline')}</span>
        </div>

        {/* Brutalist step counter + hard lime progress slab */}
        <div className="onb-progress">
          <span className="onb-count">
            <b>{String(step + 1).padStart(2, '0')}</b>
            <span className="onb-count-total">/ 04</span>
          </span>
          <div className="onb-bars">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`onb-bar${i <= step ? ' on' : ''}`} />
            ))}
          </div>
        </div>

        <div className="onb-card" key={step}>
          {step === 0 && (
            <div className="onb-step">
              <div className="onb-icon"><Globe size={28} aria-hidden="true" /></div>
              <h1 className="onb-title">{t('onboarding.languageTitle')}</h1>
              <p className="onb-sub">{t('onboarding.languageBody')}</p>
              <div className="onb-langs">
                {SUPPORTED_LANGS.map((code) => (
                  <button
                    key={code}
                    className={`onb-goal${currentLang === code ? ' is-selected' : ''}`}
                    onClick={() => setLanguage(code)}
                    aria-pressed={currentLang === code}
                  >
                    {LANGUAGE_NAMES[code]}
                  </button>
                ))}
              </div>
              <Button variant="primary" size="lg" onClick={() => setStep(1)}>
                {t('common.continue')}
              </Button>
            </div>
          )}

          {step === 1 && (
            <div className="onb-step">
              <div className="onb-icon"><Dumbbell size={28} aria-hidden="true" /></div>
              <h1 className="onb-title">{t('onboarding.welcomeTitle')}</h1>
              <p className="onb-sub">{t('onboarding.welcomeBody')}</p>
              <Button variant="primary" size="lg" onClick={() => setStep(2)}>
                {t('onboarding.getStarted')}
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="onb-step">
              <div className="onb-icon"><Target size={28} aria-hidden="true" /></div>
              <h1 className="onb-title">{t('onboarding.goalTitle')}</h1>
              <p className="onb-sub">{t('onboarding.goalBody')}</p>
              <div className="onb-goals">
                {GOALS.map((g) => (
                  <button
                    key={g.key}
                    className={`onb-goal${goal === g.key ? ' is-selected' : ''}`}
                    onClick={() => setGoal(g.key)}
                    aria-pressed={goal === g.key}
                  >
                    {t(g.labelKey)}
                  </button>
                ))}
              </div>
              <Button variant="primary" size="lg" onClick={() => setStep(3)} disabled={!goal}>
                {t('common.continue')}
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="onb-step">
              <div className="onb-icon"><ListChecks size={28} aria-hidden="true" /></div>
              <h1 className="onb-title">{t('onboarding.howTitle')}</h1>
              <p className="onb-sub">{t('onboarding.howBody')}</p>
              <ol className="onb-howlist">
                <li>{t('onboarding.howStep1')}</li>
                <li>{t('onboarding.howStep2')}</li>
                <li>{t('onboarding.howStep3')}</li>
              </ol>
              <Button variant="primary" size="lg" onClick={finish}>
                {t('onboarding.start')}
              </Button>
            </div>
          )}
        </div>

        <button className="onb-skip" onClick={skip}>
          {t('onboarding.skip')}
        </button>
      </div>
    </div>
  );
}
