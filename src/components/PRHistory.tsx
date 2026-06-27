import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLogStore } from '@/store/logStore';
import { useProgramStore } from '@/store/programStore';
import type { ExercisePR } from '@/types/logging';
import { Trophy, ChevronDown } from 'lucide-react';
import './PRHistory.css';

interface Props {
  unit: 'kg' | 'lb';
}

function toDisplay(kg: number, unit: 'kg' | 'lb'): number {
  return unit === 'lb' ? Math.round(kg * 2.2046 * 10) / 10 : Math.round(kg * 10) / 10;
}

/**
 * v1.7 — per-exercise Personal Record history.
 *
 * The marquee PR surfaces (auto-detect + celebration + header chip + overload
 * strip) shipped in v1.6; this is the deferred standalone history view. For
 * every exercise that has at least one detected PR, render a row with the
 * current best, a mini estimated-1RM sparkline over the PR timeline, and a
 * tap-to-expand list of every PR (date · weight × reps · e1RM).
 *
 * Pure read over logStore.exercisePRs — PRs are auto-detected on finalize and
 * never hand-entered, so there's no input boundary here. Data already syncs to
 * the shared `exercise_prs` table (push-only); this is a presentation layer.
 */
export function PRHistory({ unit }: Props) {
  const { t } = useTranslation();
  const exercisePRs = useLogStore((s) => s.exercisePRs);
  const exercises = useProgramStore((s) => s.exercises);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Group PRs by exercise, sorted chronologically within each group, and order
  // exercises by their current (best) 1RM descending — strongest lifts first.
  const groups = useMemo(() => {
    const byExercise = new Map<string, ExercisePR[]>();
    for (const pr of exercisePRs) {
      const list = byExercise.get(pr.exerciseId);
      if (list) list.push(pr);
      else byExercise.set(pr.exerciseId, [pr]);
    }
    const rows = [...byExercise.entries()].map(([exerciseId, prs]) => {
      const sorted = [...prs].sort((a, b) => a.date.localeCompare(b.date));
      const best = sorted.reduce((m, p) => (p.oneRepMaxKg > m.oneRepMaxKg ? p : m), sorted[0]);
      // Prefer the live exercise name; fall back to the denormalised name on
      // the PR row (survives a rename/delete).
      const name = exercises.find((e) => e.id === exerciseId)?.name ?? sorted[0].exerciseName;
      return { exerciseId, name, prs: sorted, best };
    });
    return rows.sort((a, b) => b.best.oneRepMaxKg - a.best.oneRepMaxKg);
  }, [exercisePRs, exercises]);

  if (groups.length === 0) return null;

  return (
    <div className="pr-history">
      <div className="pr-history__header">
        <Trophy size={14} aria-hidden="true" />
        <span>{t('progress.prHistory')}</span>
      </div>

      {groups.map((g) => {
        const isOpen = expanded === g.exerciseId;
        const bestDisplay = toDisplay(g.best.oneRepMaxKg, unit);
        return (
          <div key={g.exerciseId} className={`pr-history__item${isOpen ? ' is-open' : ''}`}>
            <button
              className="pr-history__row"
              onClick={() => setExpanded(isOpen ? null : g.exerciseId)}
              aria-expanded={isOpen}
            >
              <div className="pr-history__row-main">
                <span className="pr-history__name">{g.name}</span>
                <span className="pr-history__best">
                  {bestDisplay} {unit}
                  <span className="pr-history__best-label"> · {t('progress.currentPr')}</span>
                </span>
              </div>
              <PRSparkline prs={g.prs} unit={unit} />
              <ChevronDown size={15} className="pr-history__chev" aria-hidden="true" />
            </button>

            {isOpen && (
              <div className="pr-history__detail">
                {[...g.prs].reverse().map((p) => (
                  <div key={p.id} className="pr-history__detail-row">
                    <span className="pr-history__detail-date">{p.date}</span>
                    <span className="pr-history__detail-set">
                      {p.weightKg > 0
                        ? `${toDisplay(p.weightKg, unit)} ${unit} × ${p.reps}`
                        : t('progress.bodyweight')}
                    </span>
                    <span className="pr-history__detail-orm">
                      {toDisplay(p.oneRepMaxKg, unit)} {unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Inline sparkline of PR estimated-1RM progression. One point per PR; a flat
 *  single dot when only one PR exists (still informative as "you have a PR"). */
function PRSparkline({ prs, unit }: { prs: ExercisePR[]; unit: 'kg' | 'lb' }) {
  const W = 64;
  const H = 24;
  const pad = 3;
  const values = prs.map((p) => toDisplay(p.oneRepMaxKg, unit));
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  if (values.length < 2) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="pr-spark" aria-hidden="true">
        <circle cx={W / 2} cy={H / 2} r="2.5" fill="var(--accent)" />
      </svg>
    );
  }

  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = pad + (H - pad * 2) - ((v - min) / range) * (H - pad * 2);
    return { x, y };
  });
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pr-spark" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r="2.5" fill="var(--accent)" />
    </svg>
  );
}
