// ── v1.3 Health Connect UI (BUG-20) ───────────────────────────────────────
//
// Two surfaces over the read-only Health Connect data:
//   • <HealthTodayStrip/> — compact steps + active-calories strip for TodayPage.
//   • <HealthWeekCard/>    — today's totals + a 7-day step bar chart for the
//                            Body page.
//
// Both share useHealthConnect(), which gates on capability → permission →
// data. When Health Connect is unavailable (web, F-Droid, or no HC framework)
// the surfaces render nothing, so the feature is invisible rather than broken.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Footprints, Flame } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import {
  healthCapability,
  hasHealthPermissions,
  requestHealthPermissions,
  readTodaySteps,
  readTodayActiveCalories,
  readWeeklySteps,
} from '@/utils/healthConnect';
import { weekdayNames } from '@/utils/helpers';
import './HealthConnect.css';

type HCStatus = 'loading' | 'unavailable' | 'needsPermission' | 'ready';

interface HCData {
  status: HCStatus;
  todaySteps: number | null;
  todayCalories: number | null;
  weekSteps: number[] | null;
}

const EMPTY: HCData = {
  status: 'loading',
  todaySteps: null,
  todayCalories: null,
  weekSteps: null,
};

function useHealthConnect() {
  const [data, setData] = useState<HCData>(EMPTY);

  const load = useCallback(async () => {
    const cap = await healthCapability();
    if (!cap.available) {
      setData({ ...EMPTY, status: 'unavailable' });
      return;
    }
    const granted = await hasHealthPermissions();
    if (!granted) {
      setData({ ...EMPTY, status: 'needsPermission' });
      return;
    }
    const [steps, cals, week] = await Promise.all([
      readTodaySteps(),
      readTodayActiveCalories(),
      readWeeklySteps(),
    ]);
    setData({ status: 'ready', todaySteps: steps, todayCalories: cals, weekSteps: week });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = useCallback(async () => {
    const res = await requestHealthPermissions();
    if (res.ok) await load();
  }, [load]);

  return { ...data, connect };
}

export function HealthTodayStrip() {
  const { status, todaySteps, todayCalories, connect } = useHealthConnect();

  if (status === 'loading' || status === 'unavailable') return null;

  if (status === 'needsPermission') {
    return (
      <button type="button" className="hc-strip hc-strip--connect" onClick={() => void connect()}>
        <Footprints size={15} aria-hidden />
        <span>Connect Health Connect for steps &amp; calories</span>
      </button>
    );
  }

  return (
    <div className="hc-strip">
      <Metric icon={<Footprints size={15} aria-hidden />} value={todaySteps} label="steps" />
      <Metric icon={<Flame size={15} aria-hidden />} value={todayCalories} label="kcal" />
    </div>
  );
}

export function HealthWeekCard() {
  const { status, weekSteps, todaySteps, todayCalories, connect } = useHealthConnect();

  if (status === 'loading' || status === 'unavailable') return null;

  if (status === 'needsPermission') {
    return (
      <Card padding="md" className="hc-card">
        <div className="hc-card__header">
          <h3 className="hc-card__title">Activity</h3>
        </div>
        <p className="hc-card__empty">
          Connect Health Connect to see your steps &amp; active calories here.
        </p>
        <Button variant="primary" fullWidth onClick={() => void connect()}>
          Connect Health Connect
        </Button>
      </Card>
    );
  }

  return (
    <Card padding="md" className="hc-card">
      <div className="hc-card__header">
        <h3 className="hc-card__title">Activity</h3>
        <span className="hc-card__source">via Health Connect</span>
      </div>
      <div className="hc-card__today">
        <Metric icon={<Footprints size={14} aria-hidden />} value={todaySteps} label="steps today" />
        <Metric icon={<Flame size={14} aria-hidden />} value={todayCalories} label="kcal today" />
      </div>
      {weekSteps && <StepBars week={weekSteps} />}
    </Card>
  );
}

function Metric({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number | null;
  label: string;
}) {
  return (
    <div className="hc-metric">
      <span className="hc-metric__icon">{icon}</span>
      <span className="hc-metric__value">{(value ?? 0).toLocaleString()}</span>
      <span className="hc-metric__label">{label}</span>
    </div>
  );
}

// Monday-first, matching readWeeklySteps()'s Monday → Sunday buckets.
// weekdayNames() is Sunday-indexed, so rotate Sunday to the end.
function dayLabels(): string[] {
  const narrow = weekdayNames('narrow');
  return [...narrow.slice(1), narrow[0]];
}

function StepBars({ week }: { week: number[] }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...week);
  const labels = dayLabels();
  return (
    <div className="hc-bars" role="img" aria-label={t('health.stepsWeekLabel')}>
      {week.map((v, i) => (
        <div key={i} className="hc-bars__col">
          <div className="hc-bars__track">
            <div className="hc-bars__fill" style={{ height: `${(v / max) * 100}%` }} />
          </div>
          <span className="hc-bars__label">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}
