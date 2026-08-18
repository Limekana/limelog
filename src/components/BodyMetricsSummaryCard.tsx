// ── v1.4 BodyMetricsSummaryCard (BUG-19 follow-up) ────────────────────────
//
// NCC's BodyMetricsCard widget, rebuilt for LimeLog. NCC's body-metrics card
// was removed from the suite hub in the v1.3 scope reduction (BUG-15); this
// brings its richer presentation home to LimeLog — the data's sole owner —
// adapted to the lime/brutalist DNA (matte surface, 3px lime accent, Barlow
// Condensed, sharp corners) instead of NCC's cyan glass.
//
// Presentation only: current-weight hero + informational trend pill, the
// signature weight sparkline with a dashed 7-day moving-average overlay, an
// all-time journey sub-line, and a latest-measurements grid. All data comes
// from useBodyMetricsStore via the existing analysis helpers — no new wiring.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useBodyMetricsStore } from '@/store/bodyMetricsStore';
import { weightSeries, weightTrendOverDays } from '@/lib/bodyMetricsAnalysis';
import { formatWeight, formatLength, kgToLb } from '@/types/bodyMetrics';
import type { BodyMetric } from '@/types/bodyMetrics';
import './BodyMetricsSummaryCard.css';

const MEASURE_FIELDS: Array<{ key: keyof BodyMetric; labelKey: string }> = [
  { key: 'chestCm', labelKey: 'body.chest' },
  { key: 'waistCm', labelKey: 'body.waist' },
  { key: 'hipsCm', labelKey: 'body.hips' },
  { key: 'armsCm', labelKey: 'body.arms' },
  { key: 'legsCm', labelKey: 'body.legs' },
];

export function BodyMetricsSummaryCard() {
  const { t } = useTranslation();
  const metrics = useBodyMetricsStore((s) => s.metrics);
  const prefs = useBodyMetricsStore((s) => s.prefs);
  const unit = prefs.unitSystem;
  const isImperial = unit === 'imperial';

  const series = useMemo(() => weightSeries(metrics), [metrics]);
  const trend30 = useMemo(() => weightTrendOverDays(series, 30), [series]);

  // Latest row carrying any tape measurement — newest first.
  const latestMeasurements = useMemo(() => {
    const sorted = [...metrics].sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const row of sorted) {
      const present = MEASURE_FIELDS.filter((f) => row[f.key] != null);
      if (present.length > 0) {
        return present.map((f) => ({
          label: t(f.labelKey),
          value: formatLength(row[f.key] as number, unit),
        }));
      }
    }
    return [];
  }, [metrics, unit, t]);

  // All-time journey (first → latest weighed entry).
  const journey = useMemo(() => {
    if (series.length < 2) return null;
    const start = series[0];
    const now = series[series.length - 1];
    const days = Math.max(
      1,
      Math.round((new Date(now.date).getTime() - new Date(start.date).getTime()) / 86_400_000),
    );
    return { start, days };
  }, [series]);

  // Empty state — nothing weighed yet.
  if (series.length === 0) {
    return (
      <div className="bm-summary bm-summary--empty">
        <span className="bm-summary__eyebrow">{t('body.currentWeight')}</span>
        <p className="bm-summary__empty-text">{t('body.emptyTrend')}</p>
      </div>
    );
  }

  const latest = series[series.length - 1];
  const trendDir =
    trend30 == null ? 'flat'
      : trend30.deltaKg < -0.2 ? 'down'
        : trend30.deltaKg > 0.2 ? 'up'
          : 'flat';

  return (
    <div className="bm-summary">
      <div className="bm-summary__head">
        <div>
          <span className="bm-summary__eyebrow">{t('body.currentWeight')}</span>
          <div className="bm-summary__weight">{formatWeight(latest.weightKg, unit)}</div>
        </div>
        {trend30 && (
          <span className={`bm-summary__pill is-${trendDir}`}>
            {trendDir === 'down' ? '↓' : trendDir === 'up' ? '↑' : '→'}{' '}
            {Math.abs(isImperial ? kgToLb(trend30.deltaKg) : trend30.deltaKg).toFixed(1)}{' '}
            {isImperial ? 'lb' : 'kg'} · {trend30.days}d
          </span>
        )}
      </div>

      <Sparkline series={series} />

      <div className="bm-summary__legend">
        <span><i className="bm-summary__swatch bm-summary__swatch--line" aria-hidden /> {t('body.weight')}</span>
        <span><i className="bm-summary__swatch bm-summary__swatch--ma" aria-hidden /> {t('body.sevenDayAvg')}</span>
        {journey && (
          <span className="bm-summary__journey">
            {t('body.fromWeight')} {formatWeight(journey.start.weightKg, unit)} · {journey.days}d
          </span>
        )}
      </div>

      {latestMeasurements.length > 0 && (
        <>
          <div className="bm-summary__divider">
            <span>{t('body.latestMeasurements')}</span>
          </div>
          <div className="bm-summary__measures">
            {latestMeasurements.map((m) => (
              <div className="bm-summary__measure" key={m.label}>
                <span className="bm-summary__measure-label">{m.label}</span>
                <span className="bm-summary__measure-value">{m.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Weight sparkline — solid accent line + dashed 7-day MA overlay. Last 30
// eligible points so the line stays legible on a phone.
function Sparkline({ series }: { series: ReturnType<typeof weightSeries> }) {
  const { t } = useTranslation();
  const data = series.slice(-30);
  const W = 300;
  const H = 76;
  const padX = 4;
  const padY = 8;
  const ys = data.map((p) => p.weightKg);
  const minY = Math.min(...ys) - 0.4;
  const maxY = Math.max(...ys) + 0.4;
  const xRange = Math.max(1, data.length - 1);
  const yRange = Math.max(0.4, maxY - minY);
  const sx = (i: number) => padX + (i / xRange) * (W - padX * 2);
  const sy = (v: number) => padY + (1 - (v - minY) / yRange) * (H - padY * 2);

  const linePath = data
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(p.weightKg).toFixed(1)}`)
    .join(' ');
  const maPath = data
    .map((p, i) => (p.ma7 != null ? `${sx(i).toFixed(1)},${sy(p.ma7).toFixed(1)}` : null))
    .filter(Boolean)
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt}`)
    .join(' ');

  const last = data[data.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      className="bm-summary__chart"
      role="img"
      aria-label={t('body.weightChartAvg')}
      preserveAspectRatio="none"
    >
      {maPath && <path d={maPath} className="bm-summary__chart-ma" fill="none" />}
      <path d={linePath} className="bm-summary__chart-line" fill="none" />
      <circle cx={sx(data.length - 1)} cy={sy(last.weightKg)} r={3} className="bm-summary__chart-dot" />
    </svg>
  );
}
