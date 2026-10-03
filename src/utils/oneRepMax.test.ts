import { describe, it, expect } from 'vitest';
import {
  estimate1RM,
  estimate1RMRaw,
  oneRMHistoryForExercise,
  bestEstimateForExercise,
  missedRepRatio,
  MAX_RELIABLE_REPS,
} from './oneRepMax';

// Characterization tests (v1.16, limecore#11).
//
// This module is the single estimator for the whole app, and it is single
// BECAUSE it once was not: PR detection carried its own uncapped Epley, which
// scored 100 kg x 5 at 116.67 while this file scored the same set 112.50, and
// admitted high-rep sets that the Est. 1RM chart then refused to plot. The
// blend point, the cap and the rep-1 shortcut are each load-bearing, and none
// of them is obvious to someone simplifying this function.

describe('estimate1RMRaw — the blend', () => {
  it('returns the working weight unchanged for a single rep', () => {
    // 1 rep at the working weight IS the 1RM; estimating it would inflate it.
    expect(estimate1RMRaw(100, 1)).toBe(100);
  });

  it('uses Brzycki at and below 10 reps', () => {
    // 100 x 36 / (37 - 5)
    expect(estimate1RMRaw(100, 5)).toBeCloseTo(112.5, 10);
    // 100 x 36 / (37 - 10)
    expect(estimate1RMRaw(100, 10)).toBeCloseTo(133.333333, 5);
  });

  it('switches to Epley above 10 reps', () => {
    // 100 x (1 + 11/30) — Brzycki would give 100x36/26 = 138.46
    expect(estimate1RMRaw(100, 11)).toBeCloseTo(136.666666, 5);
  });

  it('stays finite well past the Brzycki asymptote', () => {
    // Brzycki's denominator hits zero at 37 reps. Epley is linear, so the
    // uncapped path must not blow up for a genuinely long set.
    expect(estimate1RMRaw(100, 37)).toBeCloseTo(223.333333, 5);
    expect(Number.isFinite(estimate1RMRaw(100, 50) as number)).toBe(true);
  });

  it('rejects non-positive or non-finite input rather than returning a number', () => {
    expect(estimate1RMRaw(0, 5)).toBeNull();
    expect(estimate1RMRaw(-10, 5)).toBeNull();
    expect(estimate1RMRaw(100, 0)).toBeNull();
    expect(estimate1RMRaw(100, -1)).toBeNull();
    expect(estimate1RMRaw(NaN, 5)).toBeNull();
    expect(estimate1RMRaw(100, Infinity)).toBeNull();
  });
});

describe('estimate1RM — the reliability cap', () => {
  it('agrees with the raw estimate at or below the cap', () => {
    for (const reps of [1, 5, 10, 11, MAX_RELIABLE_REPS]) {
      expect(estimate1RM(100, reps)).toBe(estimate1RMRaw(100, reps));
    }
  });

  it('refuses to guess above the cap', () => {
    expect(estimate1RM(100, MAX_RELIABLE_REPS + 1)).toBeNull();
    expect(estimate1RM(100, 20)).toBeNull();
  });

  it('keeps the cap at 12', () => {
    // Moving this silently changes which sets can set a PR and which appear on
    // the chart — the two must never disagree again.
    expect(MAX_RELIABLE_REPS).toBe(12);
  });

  it('leaves the raw estimator uncapped, for re-valuing historical rows', () => {
    expect(estimate1RMRaw(100, 20)).not.toBeNull();
  });
});

type Log = Parameters<typeof bestEstimateForExercise>[0][number];

function log(over: Partial<Log> & { sets: Log['sets'] }): Log {
  return { finalizedAt: '2026-01-05T10:00:00.000Z', ...over } as Log;
}

function set(over: Partial<Log['sets'][number]> = {}) {
  return { exerciseId: 'squat', weightKg: 100, reps: 5, completed: true, ...over } as Log['sets'][number];
}

describe('bestEstimateForExercise', () => {
  it('takes the best completed set across finalized sessions', () => {
    const best = bestEstimateForExercise(
      [
        log({ sets: [set({ weightKg: 100, reps: 5 })] }),
        log({ sets: [set({ weightKg: 110, reps: 5 })] }),
      ],
      'squat',
    );
    expect(best).toBeCloseTo(123.75, 10);
  });

  it('ignores sessions that were never finalized', () => {
    const best = bestEstimateForExercise(
      [
        log({ sets: [set({ weightKg: 100, reps: 5 })] }),
        log({ finalizedAt: undefined, sets: [set({ weightKg: 200, reps: 5 })] }),
      ],
      'squat',
    );
    expect(best).toBeCloseTo(112.5, 10);
  });

  it('ignores incomplete sets and other exercises', () => {
    const best = bestEstimateForExercise(
      [
        log({
          sets: [
            set({ weightKg: 100, reps: 5 }),
            set({ weightKg: 300, reps: 5, completed: false }),
            set({ exerciseId: 'bench', weightKg: 300, reps: 5 }),
          ],
        }),
      ],
      'squat',
    );
    expect(best).toBeCloseTo(112.5, 10);
  });

  it('ignores a set whose estimate is above the reliability cap', () => {
    const best = bestEstimateForExercise(
      [log({ sets: [set({ weightKg: 100, reps: 5 }), set({ weightKg: 200, reps: 20 })] })],
      'squat',
    );
    expect(best).toBeCloseTo(112.5, 10);
  });

  it('is null when nothing qualifies', () => {
    expect(bestEstimateForExercise([], 'squat')).toBeNull();
    expect(bestEstimateForExercise([log({ sets: [] })], 'squat')).toBeNull();
  });
});

describe('oneRMHistoryForExercise', () => {
  const histLog = (id: string, finalizedAt: string | undefined, sets: unknown[]) =>
    ({ id, loggedAt: finalizedAt ?? '', finalizedAt, sets } as never);

  it('returns one point per session — the day peak, not every set', () => {
    const out = oneRMHistoryForExercise(
      [],
      [
        histLog('l1', '2026-01-05T10:00:00.000Z', [
          { id: 's1', exerciseId: 'squat', weightKg: 100, reps: 5, completed: true },
          { id: 's2', exerciseId: 'squat', weightKg: 110, reps: 5, completed: true },
        ]),
      ],
      'squat',
    );
    expect(out).toHaveLength(1);
    expect(out[0].setWeightKg).toBe(110);
  });

  it('sorts oldest first so a chart can plot it directly', () => {
    const out = oneRMHistoryForExercise(
      [],
      [
        histLog('l2', '2026-02-05T10:00:00.000Z', [
          { id: 's2', exerciseId: 'squat', weightKg: 110, reps: 5, completed: true },
        ]),
        histLog('l1', '2026-01-05T10:00:00.000Z', [
          { id: 's1', exerciseId: 'squat', weightKg: 100, reps: 5, completed: true },
        ]),
      ],
      'squat',
    );
    expect(out.map((p) => p.setWeightKg)).toEqual([100, 110]);
  });

  it('skips unfinalized sessions, so a half-done PR cannot appear and vanish', () => {
    const out = oneRMHistoryForExercise(
      [],
      [
        histLog('l1', undefined, [
          { id: 's1', exerciseId: 'squat', weightKg: 100, reps: 5, completed: true },
        ]),
      ],
      'squat',
    );
    expect(out).toEqual([]);
  });

  it('produces no point for a session with no qualifying set', () => {
    const out = oneRMHistoryForExercise(
      [],
      [
        histLog('l1', '2026-01-05T10:00:00.000Z', [
          { id: 's1', exerciseId: 'squat', weightKg: 100, reps: 20, completed: true },
        ]),
      ],
      'squat',
    );
    expect(out).toEqual([]);
  });
});

describe('missedRepRatio — the deload heuristic', () => {
  const dl = (finalizedAt: string | undefined, sets: unknown[]) =>
    ({ finalizedAt, sets } as never);
  const targets = new Map([['squat', '5']]);

  it('counts completed sets that fell short of the target lower bound', () => {
    const out = missedRepRatio(
      [
        dl('2026-01-05', [
          { id: 'a', exerciseId: 'squat', reps: 4, completed: true },
          { id: 'b', exerciseId: 'squat', reps: 5, completed: true },
        ]),
      ],
      targets,
    );
    expect(out).toEqual({ ratio: 0.5, missedSets: 1, totalSets: 2 });
  });

  it('reads a range target as its lower bound', () => {
    const out = missedRepRatio(
      [dl('2026-01-05', [{ id: 'a', exerciseId: 'squat', reps: 6, completed: true }])],
      new Map([['squat', '5-8']]),
    );
    expect(out.missedSets).toBe(0);
  });

  it('skips a target it cannot parse rather than counting it as missed', () => {
    const out = missedRepRatio(
      [dl('2026-01-05', [{ id: 'a', exerciseId: 'squat', reps: 3, completed: true }])],
      new Map([['squat', 'AMRAP']]),
    );
    expect(out).toEqual({ ratio: 0, missedSets: 0, totalSets: 0 });
  });

  it('looks only at the most recent `limit` finalized sessions', () => {
    const miss = dl('2026-01-05', [{ id: 'a', exerciseId: 'squat', reps: 1, completed: true }]);
    const hit = dl('2026-01-04', [{ id: 'b', exerciseId: 'squat', reps: 9, completed: true }]);
    expect(missedRepRatio([miss, hit, hit, hit], targets, 1).totalSets).toBe(1);
    expect(missedRepRatio([miss, hit, hit, hit], targets, 3).totalSets).toBe(3);
  });

  it('ignores unfinalized sessions and incomplete sets', () => {
    const out = missedRepRatio(
      [
        dl(undefined, [{ id: 'a', exerciseId: 'squat', reps: 1, completed: true }]),
        dl('2026-01-05', [{ id: 'b', exerciseId: 'squat', reps: 1, completed: false }]),
      ],
      targets,
    );
    expect(out.totalSets).toBe(0);
  });

  it('is zero rather than NaN when nothing counts', () => {
    expect(missedRepRatio([], targets).ratio).toBe(0);
  });
});
