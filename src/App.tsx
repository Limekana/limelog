import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — installed separately; see notifications.ts setup comment
import { LocalNotifications } from '@capacitor/local-notifications';
import { Layout } from '@/components/Layout';
import { TodayPage } from '@/pages/TodayPage';
import { ProgramPage } from '@/pages/ProgramPage';
import { ProgressPage } from '@/pages/ProgressPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { LibraryPage } from '@/pages/LibraryPage';
import { WorkoutPage } from '@/pages/WorkoutPage';
import { FirstLaunchAuth } from '@/components/FirstLaunchAuth';
import { useProgramStore } from '@/store/programStore';
import { useNexusStore } from '@/store/nexusStore';
import { isGuestMode } from '@/lib/guestMode';
import {
  setupNotificationChannel,
  scheduleWorkoutReminders,
  WORKOUT_ACTION_START,
} from '@/utils/notifications';

/**
 * Subscribes to action-button taps on workout reminders and routes the user
 * to /today (where the "Start session" button is). Lives inside <BrowserRouter>
 * so useNavigate() works; a bare module-level listener would have no router
 * context when the app cold-starts from a notification tap. The handler is
 * a no-op if the listener fires before navigation is ready — Capacitor
 * replays the deferred event after `load()`, so the route lands either way.
 */
function NotificationActionBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle: { remove: () => void } | null = null;
    void (async () => {
      handle = await LocalNotifications.addListener(
        'localNotificationActionPerformed',
        (event: { actionId: string }) => {
          // actionId === 'tap' for the plain notification body tap, our
          // custom WORKOUT_ACTION_START for the explicit button. Both
          // surface the user on /today; the page's auto-route to
          // /workout/:logId handles the rest.
          if (
            event.actionId === WORKOUT_ACTION_START ||
            event.actionId === 'tap'
          ) {
            navigate('/today');
          }
        },
      );
    })();
    return () => {
      handle?.remove();
    };
  }, [navigate]);
  return null;
}

export default function App() {
  const { activeProgram } = useProgramStore();
  const userEmail = useNexusStore((s) => s.userEmail);
  const isNexusConfigured = useNexusStore((s) => s.configured);

  // Auth-gate state: whether the first-launch screen should be shown.
  // `null` while the guest-mode flag and the nexusStore are both still
  // resolving — render a splash to avoid flashing the auth screen for
  // returning users.
  const [guestMode, setGuestModeState] = useState<boolean | null>(null);
  const [nexusInitialized, setNexusInitialized] = useState(false);

  // One-time channel creation + nexusStore init. The init() call awaits
  // supabase.auth.getUser(), which is what sets userEmail to its restored
  // value; we set nexusInitialized after init resolves so the gate below
  // doesn't show the auth screen mid-restore.
  useEffect(() => {
    setupNotificationChannel();
    void (async () => {
      const guest = await isGuestMode();
      setGuestModeState(guest);
      await useNexusStore.getState().init();
      setNexusInitialized(true);
    })();
  }, []);

  // Listen for guest-mode flag changes triggered by FirstLaunchAuth (set)
  // or sign-out (clear). The Preferences plugin doesn't emit changes
  // natively, so callers dispatch this CustomEvent to re-trigger the gate.
  useEffect(() => {
    const onGuestChange = () => {
      void (async () => {
        const guest = await isGuestMode();
        setGuestModeState(guest);
      })();
    };
    window.addEventListener('limelog:guest-mode-changed', onGuestChange);
    return () => window.removeEventListener('limelog:guest-mode-changed', onGuestChange);
  }, []);

  // Drain Nexus queue when the device comes back online
  useEffect(() => {
    function onOnline() {
      const nexus = useNexusStore.getState();
      if (nexus.configured && nexus.syncEnabled && nexus.userEmail) {
        void nexus.retryPending();
      }
    }
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  // Re-schedule whenever the active program changes. Pass the exercise
  // library so the notification body can preview the first few exercises
  // by display name (the SessionExercise FK only carries exerciseId).
  // Library is read at effect-fire time so a new exercise added later
  // surfaces on the next program edit.
  const exerciseLibrary = useProgramStore((s) => s.exercises);
  useEffect(() => {
    const sessions = activeProgram?.sessions ?? [];
    scheduleWorkoutReminders(sessions, exerciseLibrary);
  }, [activeProgram, exerciseLibrary]);

  // Auth gate: show the first-launch screen on a fresh install (no email,
  // not in guest mode). Skipped when Supabase isn't configured (env vars
  // absent — local-only build) because there's no point asking for an
  // account that can never be created. Skipped during the initial state
  // resolution to avoid a one-frame flash for returning users.
  const isResolving = guestMode === null || !nexusInitialized;
  const shouldShowAuth =
    !isResolving && !userEmail && !guestMode && isNexusConfigured;

  if (isResolving) {
    return (
      <div className="fla-splash">
        <div className="fla-splash-text">LOADING</div>
      </div>
    );
  }

  if (shouldShowAuth) {
    return (
      <FirstLaunchAuth
        onContinue={() => {
          // FirstLaunchAuth's actions (set guest flag or trigger sign-in)
          // dispatch the limelog:guest-mode-changed event OR fire the
          // nexusStore auth listener. Either path flips the gate on the
          // next render. The explicit onContinue is a belt-and-suspenders
          // re-read of the guest flag in case Capacitor's Preferences write
          // landed after the event but before our listener was wired.
          void (async () => {
            const guest = await isGuestMode();
            setGuestModeState(guest);
          })();
        }}
      />
    );
  }

  return (
    <BrowserRouter>
      <NotificationActionBridge />
      <Routes>
        {/* Fullscreen workout view — outside Layout so the bottom nav is hidden */}
        <Route path="/workout/:logId" element={<WorkoutPage />} />

        <Route element={<Layout />}>
          <Route index element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/program" element={<ProgramPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
