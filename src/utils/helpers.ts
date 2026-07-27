import { kgToLb } from '@/types/bodyMetrics';
import i18n from '@/i18n';

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

// ── Locale-aware dates ─────────────────────────────────────────────────────

/** The formatting locale, deliberately not the same value as the i18n resource
 *  language. i18n resolves to a bare code ('en'); the device reports a region
 *  ('en-GB', 'en-IN', 'pt-BR'). When the two agree on language, prefer the
 *  device's regional tag so a UK user keeps "26 Jul" and a US user gets
 *  "Jul 26" — both reading the same English strings. When the user has picked a
 *  language that differs from the device, the region no longer applies. */
export function formatLocale(): string {
  const lang = (i18n.language || 'en').split('-')[0];
  const nav = (typeof navigator !== 'undefined'
    && (navigator.languages?.[0] || navigator.language)) || '';
  return nav.split('-')[0] === lang ? nav : lang;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(formatLocale(), {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

/** Localised weekday names, indexed 0 = Sunday to match Date.getDay() and the
 *  dayOfWeek fields stored on session templates.
 *
 *  Built from a known week (2024-01-07 was a Sunday) rather than a hardcoded
 *  list, so every locale — including ar, hi and zh — gets correct names for
 *  free. Computed per call: the language can change at runtime. */
export function weekdayNames(style: 'long' | 'short' | 'narrow'): string[] {
  const fmt = new Intl.DateTimeFormat(formatLocale(), { weekday: style });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
}

export function todayIso(): string {
  return new Date().toISOString();
}

export function getDayOfWeek(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return new Date().getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
