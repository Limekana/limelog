/**
 * Workout reminder notifications via @capacitor/local-notifications.
 *
 * REQUIRED (one-time setup):
 *   npm install @capacitor/local-notifications
 *   npx cap sync android
 *
 * Schedules a weekly 9 AM notification for every day that has a session
 * in the active program. Safe to call on web (no-ops when not on native).
 */

import { Capacitor } from '@capacitor/core';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — installed separately; see setup comment above
import { LocalNotifications } from '@capacitor/local-notifications';
import type { SessionTemplate } from '@/types/program';

const CHANNEL_ID = 'workout-reminders';
/** Notification IDs 100–106 are reserved for days 0 (Sun) – 6 (Sat). */
const BASE_ID = 100;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function setupNotificationChannel(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Workout Reminders',
      description: 'Daily 9 AM reminder on days you have a session scheduled',
      importance: 4, // IMPORTANCE_HIGH
      vibration: true,
      sound: 'default',
      lights: true,
    });
  } catch (_) {}
}

export async function scheduleWorkoutReminders(
  sessions: SessionTemplate[]
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { display } = await LocalNotifications.requestPermissions();
    if (display !== 'granted') return;

    // Cancel any previously scheduled reminders
    const { notifications: pending } = await LocalNotifications.getPending();
    const ours = pending.filter((n: { id: number }) => n.id >= BASE_ID && n.id < BASE_ID + 7);
    if (ours.length > 0) await LocalNotifications.cancel({ notifications: ours });

    if (sessions.length === 0) return;

    const now = new Date();

    // De-dupe by dayOfWeek (multiple sessions on the same day share an ID slot;
    // keep the first so we don't try to schedule two notifications under one id).
    const seen = new Set<number>();
    const unique = sessions.filter((s) => {
      if (seen.has(s.dayOfWeek)) return false;
      seen.add(s.dayOfWeek);
      return true;
    });

    const toSchedule = unique
      .map((s: SessionTemplate) => {
        // Next future occurrence of this day-of-week at 09:00
        const target = new Date(now);
        target.setHours(9, 0, 0, 0);
        const diff = (s.dayOfWeek - now.getDay() + 7) % 7;
        const daysToAdd = diff === 0 && now.getTime() >= target.getTime() ? 7 : diff;
        target.setDate(target.getDate() + daysToAdd);

        // Hard guard: never schedule a past time. If math still produced one, push a week.
        if (target.getTime() <= now.getTime()) {
          target.setDate(target.getDate() + 7);
        }

        return {
          id: BASE_ID + s.dayOfWeek,
          title: `${DAY_NAMES[s.dayOfWeek]} session`,
          body: s.name,
          schedule: {
            at: target,
            repeats: true,
            every: 'week' as const,
            allowWhileIdle: true,
          },
          channelId: CHANNEL_ID,
          smallIcon: 'ic_stat_icon_config_sample',
          sound: 'default',
        };
      })
      .filter((n) => n.schedule.at.getTime() > now.getTime());

    if (toSchedule.length === 0) return;
    await LocalNotifications.schedule({ notifications: toSchedule });
  } catch (err) {
    console.warn('[notifications] scheduling failed:', err);
  }
}

export async function cancelWorkoutReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { notifications: pending } = await LocalNotifications.getPending();
    const ours = pending.filter((n: { id: number }) => n.id >= BASE_ID && n.id < BASE_ID + 7);
    if (ours.length > 0) await LocalNotifications.cancel({ notifications: ours });
  } catch (_) {}
}
