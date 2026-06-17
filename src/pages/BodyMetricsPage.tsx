// ── v1.3 BodyMetricsPage (BUG-19) ─────────────────────────────────────────
//
// Body metrics promoted from a ProgressPage tab to a first-class page + nav
// tab. NCC no longer mirrors body metrics (v1.3 scope reduction), so LimeLog
// is the sole owner and the feature earns a dedicated surface.
//
// The page wraps the existing BodyMetricsPanel (log form, weight trend chart,
// recent entries, progress photos) and adds a "Journey" card up top — the
// all-time current-vs-starting weight delta the panel's 30-day trend pill
// doesn't cover. (The plan's "body fat % / muscle mass" don't exist in
// LimeLog's model, which tracks weight + tape measurements — so we surface
// the real journey stat instead.)

import { useMemo } from 'react';
import { BodyMetricsPanel } from '@/components/BodyMetricsPanel';
import { Card } from '@/components/ui';
import { useBodyMetricsStore } from '@/store/bodyMetricsStore';
import { weightSeries } from '@/lib/bodyMetricsAnalysis';
import { formatWeight, kgToLb } from '@/types/bodyMetrics';
import { HealthWeekCard } from '@/components/HealthConnect';
import './BodyMetricsPage.css';

export function BodyMetricsPage() {
  const metrics = useBodyMetricsStore((s) => s.metrics);
  const prefs = useBodyMetricsStore((s) => s.prefs);
  const unit = prefs.unitSystem;

  // All-time journey — first vs latest weighed entry. Suppressed until there
  // are at least two weight points to compare.
  const journey = useMemo(() => {
    const series = weightSeries(metrics);
    if (series.length < 2) return null;
    const start = series[0];
    const now = series[series.length - 1];
    const deltaKg = now.weightKg - start.weightKg;
    const days = Math.max(
      1,
      Math.round(
        (new Date(now.date).getTime() - new Date(start.date).getTime()) / 86_400_000,
      ),
    );
    return { start, now, deltaKg, days };
  }, [metrics]);

  return (
    <div className="body-page">
      <h1 className="body-page__title">Body</h1>
      <p className="body-page__subtitle">Weight, measurements &amp; progress photos</p>

      {journey && (
        <Card padding="md" className="body-journey">
          <div className="body-journey__row">
            <div className="body-journey__stat">
              <span className="body-journey__label">Starting</span>
              <span className="body-journey__value">
                {formatWeight(journey.start.weightKg, unit)}
              </span>
              <span className="body-journey__date">{journey.start.date}</span>
            </div>
            <span className="body-journey__arrow" aria-hidden>
              →
            </span>
            <div className="body-journey__stat body-journey__stat--right">
              <span className="body-journey__label">Current</span>
              <span className="body-journey__value">
                {formatWeight(journey.now.weightKg, unit)}
              </span>
              <span className="body-journey__date">{journey.now.date}</span>
            </div>
          </div>
          <div
            className={`body-journey__delta ${
              journey.deltaKg < -0.2
                ? 'is-down'
                : journey.deltaKg > 0.2
                  ? 'is-up'
                  : 'is-flat'
            }`}
          >
            {journey.deltaKg > 0 ? '+' : ''}
            {unit === 'imperial'
              ? `${kgToLb(journey.deltaKg).toFixed(1)} lb`
              : `${journey.deltaKg.toFixed(1)} kg`}{' '}
            over {journey.days}d
          </div>
        </Card>
      )}

      {/* v1.3 BUG-20 — Health Connect activity (today's steps/calories +
          7-day step bars). Self-gates; hidden when HC is unavailable. */}
      <HealthWeekCard />

      <BodyMetricsPanel />
    </div>
  );
}
