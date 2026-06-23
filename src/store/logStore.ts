import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { generateId } from '@/utils/helpers';
import type { SessionLog, SetLog, VerticalJumpLog, StallFlag, StallFlagType, SessionMood, ExercisePR } from '@/types/logging';
import { useProgramStore } from '@/store/programStore';
import { useNexusStore } from '@/store/nexusStore';
import { mapSessionLogToNexus } from '@/lib/nexusSync';
import { enqueue as outboxEnqueue } from '@/lib/outbox';
import { detectNewPRs, currentPR } from '@/lib/prDetection';

interface LogStore {
  sessionLogs: SessionLog[];
  jumpLogs: VerticalJumpLog[];
  stallFlags: StallFlag[];
  // v1.6 — append-only Personal Records (one row per achievement).
  exercisePRs: ExercisePR[];
  // PRs detected on the most recent finalize, awaiting the celebration modal.
  // null when there's nothing to celebrate. Cleared by clearCelebratedPRs.
  lastCelebratedPRs: ExercisePR[] | null;

  // Session logging
  startSession: (sessionTemplateId: string, programId: string) => SessionLog;
  updateSessionNote: (logId: string, notes: string) => void;
  setPerceivedFatigue: (logId: string, fatigue: number) => void;
  setSessionDebrief: (
    logId: string,
    debrief: {
      raw: string;
      rpe: number | null;
      painFlags: string[];
      mood: SessionMood | null;
      noteSummary: string;
    } | null,
  ) => void;
  finalizeSession: (logId: string) => void;
  unfinalizeSession: (logId: string) => void;
  discardSession: (logId: string) => void;

  // Set logging
  logSet: (logId: string, set: Omit<SetLog, 'id' | 'sessionLogId'>) => void;
  updateSet: (logId: string, setId: string, updates: Partial<SetLog>) => void;
  deleteSet: (logId: string, setId: string) => void;

  // Jump logging
  logJump: (j: Omit<VerticalJumpLog, 'id'>) => void;
  deleteJump: (id: string) => void;

  // Stall flags
  checkAndFlagStalls: (exerciseId: string) => void;
  resolveFlag: (flagId: string, action: StallFlag['resolutionAction']) => void;

  // PRs
  clearCelebratedPRs: () => void;
  currentPRFor: (exerciseId: string) => ExercisePR | null;
  prHistoryFor: (exerciseId: string) => ExercisePR[];
  prsForSession: (sessionId: string) => ExercisePR[];

  // Selectors
  getSetsForExercise: (exerciseId: string) => SetLog[];
  getLastSessionLog: (sessionTemplateId: string) => SessionLog | null;
}

export const useLogStore = create<LogStore>((set, get) => ({
  sessionLogs: storage.getSessionLogs(),
  jumpLogs: storage.getJumpLogs(),
  stallFlags: storage.getStallFlags(),
  exercisePRs: storage.getExercisePRs(),
  lastCelebratedPRs: null,

  startSession: (sessionTemplateId, programId) => {
    const log: SessionLog = {
      id: generateId(),
      sessionTemplateId,
      programId,
      loggedAt: new Date().toISOString(),
      perceivedFatigue: null,
      sets: [],
    };
    const sessionLogs = [log, ...get().sessionLogs];
    storage.setSessionLogs(sessionLogs);
    set({ sessionLogs });
    return log;
  },

  updateSessionNote: (logId, notes) => {
    const sessionLogs = get().sessionLogs.map((l) => (l.id === logId ? { ...l, notes } : l));
    storage.setSessionLogs(sessionLogs);
    set({ sessionLogs });
  },

  setPerceivedFatigue: (logId, fatigue) => {
    const sessionLogs = get().sessionLogs.map((l) =>
      l.id === logId ? { ...l, perceivedFatigue: fatigue } : l
    );
    storage.setSessionLogs(sessionLogs);
    set({ sessionLogs });
  },

  // v1.4 — store the analysed AI debrief on the session (before finalize, so
  // finalizeSession's push picks it up). Passing null clears it.
  setSessionDebrief: (logId, debrief) => {
    const sessionLogs = get().sessionLogs.map((l) =>
      l.id === logId
        ? {
            ...l,
            aiDebriefRaw: debrief?.raw ?? null,
            aiRpe: debrief?.rpe ?? null,
            aiPainFlags: debrief?.painFlags ?? null,
            aiMood: debrief?.mood ?? null,
            aiNoteSummary: debrief?.noteSummary ?? null,
          }
        : l
    );
    storage.setSessionLogs(sessionLogs);
    set({ sessionLogs });
  },

  finalizeSession: (logId) => {
    const finalizedAt = new Date().toISOString();
    const sessionLogs = get().sessionLogs.map((l) =>
      l.id === logId ? { ...l, finalizedAt } : l
    );
    storage.setSessionLogs(sessionLogs);
    set({ sessionLogs });

    const finalizedLog = sessionLogs.find((l) => l.id === logId);
    if (!finalizedLog) return;

    const { exercises, activeProgram } = useProgramStore.getState();

    // v1.6 — Personal Records. Detection is local-first and runs regardless of
    // cloud config: a PR is a PR even offline / signed-out. The celebration
    // modal reads lastCelebratedPRs; the cloud push (below) only fires when
    // sync is on, mirroring the workout-session gate.
    const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name ?? 'Exercise';
    const newPRs = detectNewPRs(finalizedLog, get().exercisePRs, nameOf, generateId);
    if (newPRs.length > 0) {
      const exercisePRs = [...newPRs, ...get().exercisePRs];
      storage.setExercisePRs(exercisePRs);
      set({ exercisePRs, lastCelebratedPRs: newPRs });
    }

    const nexus = useNexusStore.getState();
    if (!nexus.configured || !nexus.syncEnabled) return;

    const session = activeProgram?.sessions.find((s) => s.id === finalizedLog.sessionTemplateId);
    const payload = mapSessionLogToNexus(finalizedLog, session, exercises);

    // v1.2 — route through outbox.enqueue instead of pushOrQueue. The
    // outbox handles persistence, single-flight drain, attempt cap, and
    // online/visibility re-triggering. nexusStore.refreshPendingCount reads
    // from the outbox's getStatus, so the Settings card stays accurate. We
    // optimistically stamp `lastPushAt` to the finalize time — the actual
    // network round-trip happens on the outbox drain, which may be moments
    // (online + signed in) or much later (offline / sign-in pending). The
    // UI's "last push" stamp tracks user intent more usefully than the
    // exact server-ack time.
    outboxEnqueue('upsert_workout_session', payload);
    // Push each new PR (push-only, append-only). Derived purely from the sets
    // just pushed — no new user input crosses the boundary.
    for (const pr of newPRs) {
      outboxEnqueue('upsert_exercise_pr', {
        id: pr.id,
        exerciseId: pr.exerciseId,
        exerciseName: pr.exerciseName,
        weightKg: pr.weightKg,
        reps: pr.reps,
        oneRepMaxKg: pr.oneRepMaxKg,
        sessionId: pr.sessionId,
        date: pr.date,
      });
    }
    const store = useNexusStore.getState();
    store.refreshPendingCount();
    store.setLastPushAt(finalizedAt);
  },

  unfinalizeSession: (logId) => {
    const sessionLogs = get().sessionLogs.map((l) =>
      l.id === logId ? { ...l, finalizedAt: undefined } : l
    );
    storage.setSessionLogs(sessionLogs);
    set({ sessionLogs });
  },

  discardSession: (logId) => {
    const sessionLogs = get().sessionLogs.filter((l) => l.id !== logId);
    storage.setSessionLogs(sessionLogs);
    set({ sessionLogs });
  },

  logSet: (logId, s) => {
    const newSet: SetLog = { ...s, id: generateId(), sessionLogId: logId };
    const sessionLogs = get().sessionLogs.map((l) =>
      l.id === logId ? { ...l, sets: [...l.sets, newSet] } : l
    );
    storage.setSessionLogs(sessionLogs);
    set({ sessionLogs });
  },

  updateSet: (logId, setId, updates) => {
    const sessionLogs = get().sessionLogs.map((l) =>
      l.id === logId
        ? { ...l, sets: l.sets.map((s) => (s.id === setId ? { ...s, ...updates } : s)) }
        : l
    );
    storage.setSessionLogs(sessionLogs);
    set({ sessionLogs });
  },

  deleteSet: (logId, setId) => {
    const sessionLogs = get().sessionLogs.map((l) =>
      l.id === logId ? { ...l, sets: l.sets.filter((s) => s.id !== setId) } : l
    );
    storage.setSessionLogs(sessionLogs);
    set({ sessionLogs });
  },

  logJump: (j) => {
    const jump: VerticalJumpLog = { ...j, id: generateId() };
    const jumpLogs = [jump, ...get().jumpLogs];
    storage.setJumpLogs(jumpLogs);
    set({ jumpLogs });
  },

  deleteJump: (id) => {
    const jumpLogs = get().jumpLogs.filter((j) => j.id !== id);
    storage.setJumpLogs(jumpLogs);
    set({ jumpLogs });
  },

  checkAndFlagStalls: (exerciseId) => {
    const allSets = get().getSetsForExercise(exerciseId);
    if (allSets.length < 9) return;

    const logs = get().sessionLogs
      .filter((l) => l.sets.some((s) => s.exerciseId === exerciseId))
      .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime())
      .slice(0, 3);

    if (logs.length < 3) return;

    const topWeights = logs.map((l) => {
      const exSets = l.sets.filter((s) => s.exerciseId === exerciseId && s.weightKg !== null);
      return exSets.length > 0 ? Math.max(...exSets.map((s) => s.weightKg!)) : 0;
    });

    const isPlateaued = topWeights[0] <= topWeights[1] && topWeights[1] <= topWeights[2];
    if (!isPlateaued) return;

    const existing = get().stallFlags.find(
      (f) => f.exerciseId === exerciseId && !f.resolved
    );
    if (existing) return;

    const flagType: StallFlagType = 'weight_plateau';
    const flag: StallFlag = {
      id: generateId(),
      exerciseId,
      detectedAt: new Date().toISOString(),
      sessionLogIds: logs.map((l) => l.id),
      flagType,
      resolved: false,
    };
    const stallFlags = [...get().stallFlags, flag];
    storage.setStallFlags(stallFlags);
    set({ stallFlags });
  },

  resolveFlag: (flagId, action) => {
    const stallFlags = get().stallFlags.map((f) =>
      f.id === flagId ? { ...f, resolved: true, resolutionAction: action } : f
    );
    storage.setStallFlags(stallFlags);
    set({ stallFlags });
  },

  clearCelebratedPRs: () => set({ lastCelebratedPRs: null }),

  currentPRFor: (exerciseId) => currentPR(get().exercisePRs, exerciseId),

  prHistoryFor: (exerciseId) =>
    get()
      .exercisePRs.filter((p) => p.exerciseId === exerciseId)
      .sort((a, b) => a.date.localeCompare(b.date)),

  prsForSession: (sessionId) => get().exercisePRs.filter((p) => p.sessionId === sessionId),

  getSetsForExercise: (exerciseId) =>
    get().sessionLogs.flatMap((l) => l.sets.filter((s) => s.exerciseId === exerciseId)),

  getLastSessionLog: (sessionTemplateId) =>
    get().sessionLogs
      .filter((l) => l.sessionTemplateId === sessionTemplateId)
      .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime())[0] ?? null,
}));
