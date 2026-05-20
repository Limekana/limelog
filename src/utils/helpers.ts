export function generateId(): string {
  return crypto.randomUUID();
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function kgToLb(kg: number): number {
  return Math.round(kg * 2.2046 * 10) / 10;
}

export function lbToKg(lb: number): number {
  return Math.round((lb / 2.2046) * 10) / 10;
}

export function formatWeight(kg: number, unit: 'kg' | 'lb'): string {
  if (unit === 'lb') return `${kgToLb(kg)} lb`;
  return `${kg} kg`;
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
