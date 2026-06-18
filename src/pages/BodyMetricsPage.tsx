// ── v1.3 BodyMetricsPage (BUG-19) ─────────────────────────────────────────
//
// Body metrics promoted from a ProgressPage tab to a first-class page + nav
// tab. NCC no longer mirrors body metrics (v1.3 scope reduction), so LimeLog
// is the sole owner and the feature earns a dedicated surface.
//
// v1.4 — the top of the page is now BodyMetricsSummaryCard: NCC's old
// body-metrics widget (weight hero + trend pill + sparkline w/ 7-day MA +
// measurements grid + all-time journey sub-line), rebuilt in LimeLog's
// lime/brutalist style, brought home since NCC dropped its body card in the
// scope reduction. The summary card owns the weight chart, so the panel below
// renders with showTrend={false} to avoid a duplicate chart; the panel keeps
// the log form, recent entries, and progress photos.

import { BodyMetricsPanel } from '@/components/BodyMetricsPanel';
import { BodyMetricsSummaryCard } from '@/components/BodyMetricsSummaryCard';
import { HealthWeekCard } from '@/components/HealthConnect';
import './BodyMetricsPage.css';

export function BodyMetricsPage() {
  return (
    <div className="body-page">
      <h1 className="body-page__title">Body</h1>
      <p className="body-page__subtitle">Weight, measurements &amp; progress photos</p>

      {/* v1.4 — current weight + trend + measurements, NCC-style card. */}
      <BodyMetricsSummaryCard />

      {/* v1.3 BUG-20 — Health Connect activity (today's steps/calories +
          7-day step bars). Self-gates; hidden when HC is unavailable. */}
      <HealthWeekCard />

      <BodyMetricsPanel showTrend={false} />
    </div>
  );
}
