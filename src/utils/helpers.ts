import { kgToLb } from '@/types/bodyMetrics';

export function generateId(): string {
  return crypto.randomUUID();
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

// Lift weights. The conversion itself lives in types/bodyMetrics.ts. This
// module used to carry its own kgToLb/lbToKg on a truncated 2.2046 that also
// rounded *inside* the conversion, so lbToKg(kgToLb(x)) !== x. Rounding belongs
// at the display boundary, once — and only one constant should exist.

/** A lift weight in the user's chosen unit, rounded for display.
 *  For call sites that render their own unit label (charts, table rows). */
export function toDisplayWeight(kg: number, unit: 'kg' | 'lb'): number {
  return Math.round((unit === 'lb' ? kgToLb(kg) : kg) * 10) / 10;
}

/** A lift weight in the user's chosen unit, with the unit label. */
export function formatWeight(kg: number, unit: 'kg' | 'lb'): string {
  return `${toDisplayWeight(kg, unit)} ${unit}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

export function todayIso(): string {
  return new Date().toISOString();
}

export function getDayOfWeek(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return new Date().getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
