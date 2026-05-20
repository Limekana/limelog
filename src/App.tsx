import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { TodayPage } from '@/pages/TodayPage';
import { ProgramPage } from '@/pages/ProgramPage';
import { ProgressPage } from '@/pages/ProgressPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { LibraryPage } from '@/pages/LibraryPage';
import { WorkoutPage } from '@/pages/WorkoutPage';
import { useProgramStore } from '@/store/programStore';
import { useNexusStore } from '@/store/nexusStore';
import { setupNotificationChannel, scheduleWorkoutReminders } from '@/utils/notifications';

export default function App() {
  const { activeProgram } = useProgramStore();

  // One-time channel creation
  useEffect(() => {
    setupNotificationChannel();
    void useNexusStore.getState().init();
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

  // Re-schedule whenever the active program changes
  useEffect(() => {
    const sessions = activeProgram?.sessions ?? [];
    scheduleWorkoutReminders(sessions);
  }, [activeProgram]);

  return (
    <BrowserRouter>
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
