import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { generateId } from '@/utils/helpers';
import type { SessionLog, SetLog, VerticalJumpLog, StallFlag, StallFlagType } from '@/types/logging';
import { useProgramStore } from '@/store/programStore';
import { useNexusStore } from '@/store/nexusStore';
import { mapSessionLogToNexus, pushOrQueue } from '@/lib/nexusSync';

interface LogStore {
  sessionLogs: SessionLog[];
  jumpLogs: VerticalJumpLog[];
  stallFlags: StallFlag[];

  // Session logging
  startSession: (sessionTemplateId: string, programId: string) => SessionLog;
  updateSessionNote: (logId: string, notes: string) => void;
  setPerceivedFatigue: (logId: string, fatigue: number) => void;
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

  // Selectors
  getSetsForExercise: (exerciseId: string) => SetLog[];
  getLastSessionLog: (sessionTemplateId: string) => SessionLog | null;
}

export const useLogStore = create<LogStore>((set, get) => ({
  sessionLogs: storage.getSessionLogs(),
  jumpLogs: storage.getJumpLogs(),
  stallFlags: storage.getStallFlags(),

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

  finalizeSession: (logId) => {
    const finalizedAt = new Date().toISOString();
    const sessionLogs = get().sessionLogs.map((l) =>
      l.id === logId ? { ...l, finalizedAt } : l
    );
    storage.setSessionLogs(sessionLogs);
    set({ sessionLogs });

    const finalizedLog = sessionLogs.find((l) => l.id === logId);
    if (!finalizedLog) return;

    const nexus = useNexusStore.getState();
    if (!nexus.configured || !nexus.syncEnabled) return;

    const { exercises, activeProgram } = useProgramStore.getState();
    const session = activeProgram?.sessions.find((s) => s.id === finalizedLog.sessionTemplateId);
    const payload = mapSessionLogToNexus(finalizedLog, session, exercises);

    void pushOrQueue(payload).then((result) => {
      const store = useNexusStore.getState();
      store.refreshPendingCount();
      if (result.ok) store.setLastPushAt(finalizedAt);
    });
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

  getSetsForExercise: (exerciseId) =>
    get().sessionLogs.flatMap((l) => l.sets.filter((s) => s.exerciseId === exerciseId)),

  getLastSessionLog: (sessionTemplateId) =>
    get().sessionLogs
      .filter((l) => l.sessionTemplateId === sessionTemplateId)
      .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime())[0] ?? null,
}));
