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
const SLOT_COUNT = 7;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Unconditional cancel of every reserved slot.
 *
 * Why blind-cancel instead of `getPending() → filter → cancel`:
 *
 *   1. `@capacitor/local-notifications.getPending()` reads SharedPreferences.
 *      Recurring alarms (`every: 'week'`) live in AlarmManager but their
 *      SharedPreferences entries can get evicted after the first fire — so
 *      `getPending()` returns nothing while the underlying alarm keeps
 *      firing on its old schedule.
 *   2. `Settings → Storage → Clear data` wipes SharedPreferences but does
 *      NOT cancel the AlarmManager alarms the plugin scheduled — the
 *      `RECEIVE_BOOT_COMPLETED` re-registrations are gone, but any alarm
 *      not yet fired is still queued.
 *   3. Switching active programs (Mon/Wed/Fri → Tue/Thu) used to leak the
 *      old day-slots: Mon/Wed/Fri alarms with the old session bodies kept
 *      firing because `getPending()` couldn't see them to cancel them.
 *
 * Cancelling each ID blindly always reaches the underlying alarm because
 * `AlarmManager.cancel(PendingIntent)` matches on intent action + ID, not
 * on SharedPreferences presence. Calling `cancel` on a non-existent ID is
 * a no-op on Android — safe to call all 7 every time.
 */
async function cancelAllSlots(): Promise<void> {
  const allSlotIds = Array.from({ length: SLOT_COUNT }, (_, i) => ({
    id: BASE_ID + i,
  }));
  try {
    // Diagnostic: log what SharedPreferences still thinks is pending so a
    // logcat sweep can confirm phantom alarms (those NOT in this list but
    // still firing) are the reason we blind-cancel.
    const { notifications: pending } = await LocalNotifications.getPending();
    const ours = pending.filter(
      (n: { id: number }) => n.id >= BASE_ID && n.id < BASE_ID + SLOT_COUNT,
    );
    console.log(
      `[notifications] cancelAllSlots: getPending reports ${ours.length} in our range — blind-cancelling all ${SLOT_COUNT} regardless`,
    );
  } catch {
    /* getPending failed — cancel anyway */
  }
  await LocalNotifications.cancel({ notifications: allSlotIds });
}

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
    // App-startup defensive sweep: blind-cancel every slot in case AlarmManager
    // is still holding phantom alarms from a previous install / data clear /
    // older program. `scheduleWorkoutReminders` will re-issue fresh schedules
    // immediately after this when the activeProgram effect mounts. The 1.0.1
    // fix relied on the scheduling path alone to clean up — that left a window
    // where a phantom alarm could fire between app launch and the program
    // effect running. This sweep closes that window.
    await cancelAllSlots();
  } catch (_) {}
}

export async function scheduleWorkoutReminders(
  sessions: SessionTemplate[]
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { display } = await LocalNotifications.requestPermissions();
    if (display !== 'granted') return;

    // Blind-cancel all 7 reserved slots before scheduling. See cancelAllSlots
    // docstring for why this can't trust getPending(). Always cancel even
    // when sessions.length === 0 so an empty program clears prior alarms.
    await cancelAllSlots();

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
    await cancelAllSlots();
  } catch (_) {}
}
