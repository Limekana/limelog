/**
 * Cast Iron theme — plate math.
 *
 * Pure module: no store access, no React, no side effects. Everything the
 * plate bay draws comes from solvePlates().
 *
 * Rules:
 *   1. The big plate is 20 kg or 45 lb. Never 25 kg — calibrated competition
 *      plates belong to a different theme.
 *   2. Heaviest plate sits against the collar, descending outward. Greedy
 *      descending fill makes that ordering true by construction rather than
 *      by a sort afterwards.
 *   3. Both sleeves mirror; the left sleeve is this array reversed.
 *   4. A leftover no plate can make is returned as `remainder` and drawn as a
 *      tape chip. Never silently dropped.
 *   5. Unit follows profile.unitPreference. Stored data stays canonical — only
 *      the drawing and the label convert.
 *
 * Arithmetic runs in integer hundredths. Subtracting 2.5 and 1.25 in floating
 * point strands a ~1e-14 remainder, which would light the tape chip on a
 * perfectly clean load.
 */

export type Unit = 'kg' | 'lb';

export interface PlateSpec {
  /** Plate weight in `unit`. */
  weight: number;
  /** Real plate diameter, mm — the reason 145 kg and 100 kg look different. */
  diameterMm: number;
  /** Drawn height at size 'lg', px. */
  heightPx: number;
  /** Drawn thickness, px. */
  thicknessPx: number;
}

export const BAR_WEIGHT: Record<Unit, number> = { kg: 20, lb: 45 };

/** Smallest plate in the inventory — the granularity of any load. */
export const SMALLEST_PLATE: Record<Unit, number> = { kg: 1.25, lb: 2.5 };

/** Descending. Order matters: it is both the greedy order and the collar-out order. */
export const PLATE_INVENTORY: Record<Unit, PlateSpec[]> = {
  kg: [
    { weight: 20, diameterMm: 450, heightPx: 90, thicknessPx: 13 },
    { weight: 15, diameterMm: 400, heightPx: 80, thicknessPx: 11 },
    { weight: 10, diameterMm: 325, heightPx: 65, thicknessPx: 9 },
    { weight: 5, diameterMm: 228, heightPx: 46, thicknessPx: 7 },
    { weight: 2.5, diameterMm: 190, heightPx: 38, thicknessPx: 5 },
    { weight: 1.25, diameterMm: 160, heightPx: 32, thicknessPx: 4 },
  ],
  lb: [
    { weight: 45, diameterMm: 450, heightPx: 90, thicknessPx: 13 },
    { weight: 35, diameterMm: 405, heightPx: 81, thicknessPx: 11 },
    { weight: 25, diameterMm: 350, heightPx: 70, thicknessPx: 9 },
    { weight: 10, diameterMm: 250, heightPx: 50, thicknessPx: 7 },
    { weight: 5, diameterMm: 200, heightPx: 40, thicknessPx: 5 },
    { weight: 2.5, diameterMm: 160, heightPx: 32, thicknessPx: 4 },
  ],
};

export interface PlateStack {
  /** Collar → outside, heaviest first. Left sleeve renders this reversed. */
  plates: PlateSpec[];
  /** Load on one sleeve, in `unit`. */
  perSide: number;
  /** Unmakeable leftover on one sleeve. 0 for a clean load. */
  remainder: number;
  total: number;
  barWeight: number;
  unit: Unit;
  /** total <= barWeight — draw a bare bar. */
  barOnly: boolean;
}

const toCenti = (n: number) => Math.round(n * 100);
const fromCenti = (n: number) => n / 100;

export function solvePlates(
  total: number,
  unit: Unit,
  barWeight: number = BAR_WEIGHT[unit],
): PlateStack {
  const barOnly = !Number.isFinite(total) || total <= barWeight;
  if (barOnly) {
    return { plates: [], perSide: 0, remainder: 0, total, barWeight, unit, barOnly: true };
  }

  // Odd totals cannot be split evenly across two sleeves; the leftover
  // surfaces as `remainder` rather than being rounded away silently.
  let perSideCenti = Math.round(toCenti(total - barWeight) / 2);
  const perSide = fromCenti(perSideCenti);

  const plates: PlateSpec[] = [];
  for (const spec of PLATE_INVENTORY[unit]) {
    const specCenti = toCenti(spec.weight);
    let n = Math.floor(perSideCenti / specCenti);
    while (n-- > 0) {
      plates.push(spec);
      perSideCenti -= specCenti;
    }
  }

  return {
    plates,
    perSide,
    remainder: fromCenti(perSideCenti),
    total,
    barWeight,
    unit,
    barOnly: false,
  };
}

function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** "BAR 20 + 20 + 20 + 2.5 PER SIDE" — real text under the bay, not an image. */
export function stackLabel(stack: PlateStack): string {
  const u = stack.unit.toUpperCase();
  if (stack.barOnly) return `BAR ONLY · ${trim(stack.barWeight)} ${u}`;
  const parts = stack.plates.map((p) => trim(p.weight));
  const tail = stack.remainder > 0 ? ` (+${trim(stack.remainder)} UNMADE)` : '';
  return `BAR ${trim(stack.barWeight)} + ${parts.join(' + ')} PER SIDE${tail}`;
}

/** Screen-reader label. Never let the drawing be the only representation. */
export function stackAriaLabel(stack: PlateStack): string {
  const word = stack.unit === 'kg' ? 'kilograms' : 'pounds';
  return stack.barOnly
    ? `Empty bar, ${trim(stack.barWeight)} ${word}`
    : `${trim(stack.total)} ${word} loaded`;
}

const KG_PER_LB = 0.45359237;

/** Converts, then snaps to the nearest achievable load in the target unit. */
export function convertLoad(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  const raw = to === 'lb' ? value / KG_PER_LB : value * KG_PER_LB;
  const step = SMALLEST_PLATE[to] * 2; // both sleeves
  return Math.round(raw / step) * step;
}

/**
 * Does this exercise get a bay at all? Barbell movements only — a bay on a
 * cable row would be a drawing of something that is not there.
 */
export function usesBarbell(equipment: string | undefined): boolean {
  return equipment === 'barbell';
}
