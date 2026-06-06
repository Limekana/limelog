// ── v1.2 Body metrics analysis helpers ────────────────────────────────────
//
// Pure functions for the trend chart + leaderboard integration. No store
// coupling — every function takes its inputs explicitly so we can run them
// in tests / chart components / 1RM page without React-tree dependencies.

import type { BodyMetric } from '@/types/bodyMetrics';

/** Weight series — sorted oldest-first, only entries with weight set. */
export interface WeightPoint {
  date: string;
  weightKg: number;
  /** 7-day trailing moving average. null until the 7th eligible entry. */
  ma7: number | null;
}

export function weightSeries(metrics: BodyMetric[]): WeightPoint[] {
  const rows = metrics
    .filter((m) => m.weightKg != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: WeightPoint[] = [];
  for (let i = 0; i < rows.length; i++) {
    const window = rows.slice(Math.max(0, i - 6), i + 1);
    const ma7 =
      window.length >= 7
        ? window.reduce((s, x) => s + (x.weightKg ?? 0), 0) / window.length
        : null;
    out.push({ date: rows[i].date, weightKg: rows[i].weightKg!, ma7 });
  }
  return out;
}

/** Trend pill text — "−1.2 kg over 30d" / "+0.4 kg" / "Trending flat".
 *  Uses the last MA value vs the MA value ~windowDays ago. If we lack
 *  enough samples, returns null and the UI suppresses the pill. */
export function weightTrendOverDays(
  series: WeightPoint[],
  windowDays: number,
  now: Date = new Date(),
): { deltaKg: number; days: number } | null {
  if (series.length === 0) return null;
  const latest = series[series.length - 1];
  const since = new Date(now);
  since.setDate(since.getDate() - windowDays);
  const sinceKey = since.toISOString().slice(0, 10);
  // Find the earliest series point still within the window — that's our
  // baseline. Using the MA when available smooths the day-to-day jitter.
  const candidates = series.filter((p) => p.date >= sinceKey);
  if (candidates.length < 2) return null;
  const oldest = candidates[0];
  const baseline = oldest.ma7 ?? oldest.weightKg;
  const tip = latest.ma7 ?? latest.weightKg;
  const deltaKg = tip - baseline;
  // Compute actual day-span the window covered (may be less than windowDays
  // if the user just started logging).
  const days = Math.max(
    1,
    Math.round(
      (new Date(latest.date).getTime() - new Date(oldest.date).getTime()) /
        (1000 * 60 * 60 * 24),
    ),
  );
  return { deltaKg, days };
}

/** Strength-to-bodyweight ratio for the 1RM leaderboard.
 *  Returns null when the user has no weight logged OR the 1RM is unset. */
export function strengthToBodyweight(
  oneRepMax: number | null | undefined,
  bodyweightKg: number | null,
): number | null {
  if (!oneRepMax || !bodyweightKg) return null;
  return oneRepMax / bodyweightKg;
}
