// ── v1.3 Health Connect integration (BUG-20) ──────────────────────────────
//
// Reads steps + active calories from the Android Health Connect data layer
// (Samsung Health writes into it on Samsung phones). Read-only and local-only
// — nothing here ever syncs to Supabase.
//
// F-Droid note: this uses `androidx.health.connect` (Jetpack), NOT Google
// Play Services / GMS. (The v1.3 build-plan note claiming Health Connect
// "requires Google Play Services" is incorrect — NCC already ships this exact
// plugin F-Droid-clean. Declaring the Health Connect package under <queries>
// in the manifest is package-visibility, not a GMS dependency.) The plugin is
// loaded via dynamic import and every entry point degrades to "unavailable"
// when the plugin or the Health Connect framework is absent, so a build/device
// without Health Connect silently hides the feature instead of erroring.

import { Capacitor } from '@capacitor/core';

interface HealthCapability {
  available: boolean;
  reason: string;
  needsInstall?: boolean;
}

type RecordType = 'Steps' | 'ActiveCaloriesBurned' | 'TotalCaloriesBurned';
type AggregateRecordType = 'Steps' | 'ActiveCaloriesBurned' | 'TotalCaloriesBurned';

interface PermissionsResponse {
  read: RecordType[];
  write: RecordType[];
}

interface AggregateData {
  startTime: string;
  endTime: string;
  value: number;
  unit?: string;
}

interface HealthConnectModule {
  HealthConnect: {
    checkAvailability: () => Promise<{
      availability: 'Available' | 'NotInstalled' | 'NotSupported' | string;
    }>;
    requestPermissions: (opts: {
      read: RecordType[];
      write: RecordType[];
    }) => Promise<PermissionsResponse>;
    getGrantedPermissions: () => Promise<PermissionsResponse>;
    aggregateRecords: (opts: {
      start: string;
      end: string;
      type: AggregateRecordType;
      groupBy?: 'day' | 'hour' | 'week' | 'month';
    }) => Promise<{ aggregates: AggregateData[] }>;
  };
}

let cached: HealthConnectModule | null | undefined;

async function loadPlugin(): Promise<HealthConnectModule | null> {
  if (cached !== undefined) return cached;
  if (!Capacitor.isNativePlatform()) {
    cached = null;
    return null;
  }
  try {
    cached = (await import('@devmaxime/capacitor-health-connect')) as unknown as HealthConnectModule;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export async function healthCapability(): Promise<HealthCapability> {
  if (!Capacitor.isNativePlatform()) {
    return { available: false, reason: 'Health Connect is Android-only.' };
  }
  const mod = await loadPlugin();
  if (!mod) {
    return {
      available: false,
      reason: 'Health Connect plugin not installed.',
      needsInstall: true,
    };
  }
  try {
    const status = await mod.HealthConnect.checkAvailability();
    if (status.availability === 'Available') {
      return { available: true, reason: 'Ready.' };
    }
    if (status.availability === 'NotInstalled') {
      return { available: false, reason: 'Health Connect not installed on this phone.' };
    }
    return { available: false, reason: `Health Connect unavailable: ${status.availability}` };
  } catch (e) {
    return { available: false, reason: (e as Error).message };
  }
}

// v1.7 (BUG-7) — also request TotalCaloriesBurned. Samsung Health (the primary
// writer on the target S24) records TotalCaloriesBurned but frequently does NOT
// write ActiveCaloriesBurned, so an active-only read came back empty and the
// "kcal" figure never appeared. We keep Active as the preferred (exercise-only)
// figure and fall back to Total when Active has no data — see readTodayCalories.
const READ_PERMS: RecordType[] = ['Steps', 'ActiveCaloriesBurned', 'TotalCaloriesBurned'];

export async function requestHealthPermissions(): Promise<{ ok: boolean; reason?: string }> {
  const mod = await loadPlugin();
  if (!mod) return { ok: false, reason: 'Plugin missing.' };
  try {
    const result = await mod.HealthConnect.requestPermissions({ read: READ_PERMS, write: [] });
    const granted = result.read ?? [];
    if (granted.length === 0) {
      return { ok: false, reason: 'No permissions granted. Allow Steps + Active calories in Health Connect.' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

export async function hasHealthPermissions(): Promise<boolean> {
  const mod = await loadPlugin();
  if (!mod) return false;
  try {
    const result = await mod.HealthConnect.getGrantedPermissions();
    return (result.read?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

async function aggregateToday(type: AggregateRecordType): Promise<number | null> {
  const mod = await loadPlugin();
  if (!mod) return null;
  try {
    const start = startOfDay(new Date());
    const end = new Date();
    const result = await mod.HealthConnect.aggregateRecords({
      start: start.toISOString(),
      end: end.toISOString(),
      type,
      groupBy: 'day',
    });
    return (result.aggregates ?? []).reduce((sum, a) => sum + (a.value || 0), 0);
  } catch {
    return null;
  }
}

export async function readTodaySteps(): Promise<number | null> {
  const total = await aggregateToday('Steps');
  return total == null ? null : Math.round(total);
}

/**
 * Calories burned today, in kcal (rounded). Prefers ActiveCaloriesBurned
 * (exercise-only), but many sources — notably Samsung Health on the S24 —
 * populate only TotalCaloriesBurned, so an active read returns 0/empty. When
 * Active has no data we fall back to Total (which includes BMR) rather than
 * showing nothing: a slightly higher "kcal" figure is far more useful than a
 * permanently blank one, and the UI labels it generically as "kcal".
 *
 * Kept as `readTodayActiveCalories` for call-site compatibility.
 */
export async function readTodayActiveCalories(): Promise<number | null> {
  const active = await aggregateToday('ActiveCaloriesBurned');
  if (active != null && active > 0) return Math.round(active);
  const total = await aggregateToday('TotalCaloriesBurned');
  if (total != null && total > 0) return Math.round(total);
  // Neither source had data — preserve the null-vs-zero distinction: return the
  // active reading (0 or null) so "connected but no data yet" still renders 0.
  return active == null ? null : Math.round(active);
}

export async function readWeeklySteps(): Promise<number[] | null> {
  // Returns 7 numbers Monday → Sunday for the current ISO week.
  const mod = await loadPlugin();
  if (!mod) return null;
  try {
    const today = startOfDay(new Date());
    const day = today.getDay() === 0 ? 7 : today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 7);
    const result = await mod.HealthConnect.aggregateRecords({
      start: monday.toISOString(),
      end: sunday.toISOString(),
      type: 'Steps',
      groupBy: 'day',
    });
    const buckets: number[] = [0, 0, 0, 0, 0, 0, 0];
    for (const a of result.aggregates ?? []) {
      const d = startOfDay(new Date(a.startTime));
      const idx = Math.floor((d.getTime() - monday.getTime()) / 86_400_000);
      if (idx >= 0 && idx < 7) buckets[idx] = Math.round(a.value || 0);
    }
    return buckets;
  } catch {
    return null;
  }
}
