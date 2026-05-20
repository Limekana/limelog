import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { generateId } from '@/utils/helpers';
import type { Exercise, Program, Phase, SessionTemplate, SessionExercise, WorkoutTemplate } from '@/types/program';
import { BUILTIN_EXERCISES } from '@/data/builtinExercises';

function seedExercisesIfEmpty(stored: Exercise[]): Exercise[] {
  if (stored.length > 0) return stored;
  const seeded = BUILTIN_EXERCISES.map((e) => ({ ...e, id: generateId() }));
  storage.setExercises(seeded);
  return seeded;
}

interface ProgramStore {
  programs: Program[];
  exercises: Exercise[];
  activeProgram: Program | null;
  workoutTemplates: WorkoutTemplate[];

  // Exercise CRUD
  addExercise: (e: Omit<Exercise, 'id'>) => Exercise;
  updateExercise: (id: string, updates: Partial<Exercise>) => void;
  deleteExercise: (id: string) => void;

  // Program CRUD
  createProgram: (p: Omit<Program, 'id' | 'createdAt' | 'phases' | 'sessions' | 'userId'>) => Program;
  updateProgram: (id: string, updates: Partial<Pick<Program, 'name' | 'description' | 'status'>>) => void;
  deleteProgram: (id: string) => void;
  setActiveProgram: (id: string) => void;

  // Phase CRUD
  addPhase: (programId: string, p: Omit<Phase, 'id' | 'programId'>) => void;
  updatePhase: (programId: string, phaseId: string, updates: Partial<Phase>) => void;
  deletePhase: (programId: string, phaseId: string) => void;

  // Session CRUD
  addSession: (s: Omit<SessionTemplate, 'id' | 'exercises'>) => void;
  updateSession: (id: string, updates: Partial<SessionTemplate>) => void;
  deleteSession: (id: string) => void;

  // SessionExercise CRUD
  addSessionExercise: (sessionId: string, e: Omit<SessionExercise, 'id' | 'sessionId'>) => void;
  updateSessionExercise: (sessionId: string, exId: string, updates: Partial<SessionExercise>) => void;
  removeSessionExercise: (sessionId: string, exId: string) => void;
  reorderSessionExercises: (sessionId: string, orderedIds: string[]) => void;

  // Workout Template CRUD
  saveAsTemplate: (name: string, session: SessionTemplate) => WorkoutTemplate;
  deleteWorkoutTemplate: (id: string) => void;
  applyTemplate: (sessionId: string, templateId: string) => void;
}

export const useProgramStore = create<ProgramStore>((set, get) => ({
  programs: storage.getPrograms(),
  exercises: seedExercisesIfEmpty(storage.getExercises()),
  activeProgram: storage.getPrograms().find((p) => p.status === 'active') ?? null,
  workoutTemplates: storage.getWorkoutTemplates(),

  addExercise: (e) => {
    const exercise: Exercise = { ...e, id: generateId() };
    const exercises = [...get().exercises, exercise];
    storage.setExercises(exercises);
    set({ exercises });
    return exercise;
  },

  updateExercise: (id, updates) => {
    const exercises = get().exercises.map((e) => (e.id === id ? { ...e, ...updates } : e));
    storage.setExercises(exercises);
    set({ exercises });
  },

  deleteExercise: (id) => {
    const exercises = get().exercises.filter((e) => e.id !== id);
    storage.setExercises(exercises);
    set({ exercises });
  },

  createProgram: (p) => {
    const program: Program = {
      ...p,
      id: generateId(),
      userId: 'local',
      phases: [],
      sessions: [],
      createdAt: new Date().toISOString(),
    };
    const programs = [...get().programs, program];
    storage.setPrograms(programs);
    set({ programs });
    return program;
  },

  updateProgram: (id, updates) => {
    const programs = get().programs.map((p) => (p.id === id ? { ...p, ...updates } : p));
    storage.setPrograms(programs);
    const activeProgram = programs.find((p) => p.status === 'active') ?? null;
    set({ programs, activeProgram });
  },

  deleteProgram: (id) => {
    const programs = get().programs.filter((p) => p.id !== id);
    storage.setPrograms(programs);
    const activeProgram = programs.find((p) => p.status === 'active') ?? null;
    set({ programs, activeProgram });
  },

  setActiveProgram: (id) => {
    const programs = get().programs.map((p) => ({
      ...p,
      status: p.id === id ? ('active' as const) : ('archived' as const),
    }));
    storage.setPrograms(programs);
    const activeProgram = programs.find((p) => p.id === id) ?? null;
    set({ programs, activeProgram });
  },

  addPhase: (programId, p) => {
    const phase: Phase = { ...p, id: generateId(), programId };
    const programs = get().programs.map((prog) =>
      prog.id === programId ? { ...prog, phases: [...prog.phases, phase] } : prog
    );
    storage.setPrograms(programs);
    set({ programs, activeProgram: programs.find((p) => p.status === 'active') ?? null });
  },

  updatePhase: (programId, phaseId, updates) => {
    const programs = get().programs.map((prog) =>
      prog.id === programId
        ? { ...prog, phases: prog.phases.map((ph) => (ph.id === phaseId ? { ...ph, ...updates } : ph)) }
        : prog
    );
    storage.setPrograms(programs);
    set({ programs, activeProgram: programs.find((p) => p.status === 'active') ?? null });
  },

  deletePhase: (programId, phaseId) => {
    const programs = get().programs.map((prog) =>
      prog.id === programId
        ? { ...prog, phases: prog.phases.filter((ph) => ph.id !== phaseId) }
        : prog
    );
    storage.setPrograms(programs);
    set({ programs, activeProgram: programs.find((p) => p.status === 'active') ?? null });
  },

  addSession: (s) => {
    const session: SessionTemplate = { ...s, id: generateId(), exercises: [] };
    const programs = get().programs.map((prog) =>
      prog.phases.some((ph) => ph.id === s.phaseId)
        ? { ...prog, sessions: [...prog.sessions, session] }
        : prog
    );
    storage.setPrograms(programs);
    set({ programs, activeProgram: programs.find((p) => p.status === 'active') ?? null });
  },

  updateSession: (id, updates) => {
    const programs = get().programs.map((prog) => ({
      ...prog,
      sessions: prog.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }));
    storage.setPrograms(programs);
    set({ programs, activeProgram: programs.find((p) => p.status === 'active') ?? null });
  },

  deleteSession: (id) => {
    const programs = get().programs.map((prog) => ({
      ...prog,
      sessions: prog.sessions.filter((s) => s.id !== id),
    }));
    storage.setPrograms(programs);
    set({ programs, activeProgram: programs.find((p) => p.status === 'active') ?? null });
  },

  addSessionExercise: (sessionId, e) => {
    const ex: SessionExercise = { ...e, id: generateId(), sessionId };
    const programs = get().programs.map((prog) => ({
      ...prog,
      sessions: prog.sessions.map((s) =>
        s.id === sessionId ? { ...s, exercises: [...s.exercises, ex] } : s
      ),
    }));
    storage.setPrograms(programs);
    set({ programs, activeProgram: programs.find((p) => p.status === 'active') ?? null });
  },

  updateSessionExercise: (sessionId, exId, updates) => {
    const programs = get().programs.map((prog) => ({
      ...prog,
      sessions: prog.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, exercises: s.exercises.map((e) => (e.id === exId ? { ...e, ...updates } : e)) }
          : s
      ),
    }));
    storage.setPrograms(programs);
    set({ programs, activeProgram: programs.find((p) => p.status === 'active') ?? null });
  },

  removeSessionExercise: (sessionId, exId) => {
    const programs = get().programs.map((prog) => ({
      ...prog,
      sessions: prog.sessions.map((s) =>
        s.id === sessionId ? { ...s, exercises: s.exercises.filter((e) => e.id !== exId) } : s
      ),
    }));
    storage.setPrograms(programs);
    set({ programs, activeProgram: programs.find((p) => p.status === 'active') ?? null });
  },

  reorderSessionExercises: (sessionId, orderedIds) => {
    const programs = get().programs.map((prog) => ({
      ...prog,
      sessions: prog.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const reordered = orderedIds
          .map((id, i) => {
            const ex = s.exercises.find((e) => e.id === id);
            return ex ? { ...ex, orderIndex: i } : null;
          })
          .filter(Boolean) as SessionExercise[];
        return { ...s, exercises: reordered };
      }),
    }));
    storage.setPrograms(programs);
    set({ programs, activeProgram: programs.find((p) => p.status === 'active') ?? null });
  },

  saveAsTemplate: (name, session) => {
    const template: WorkoutTemplate = {
      id: generateId(),
      name,
      createdAt: new Date().toISOString(),
      exercises: session.exercises.map((se) => ({
        exerciseId: se.exerciseId,
        orderIndex: se.orderIndex,
        targetSets: se.targetSets,
        targetReps: se.targetReps,
        targetRpe: se.targetRpe,
        targetWeight: se.targetWeight,
        notes: se.notes,
      })),
    };
    const workoutTemplates = [...get().workoutTemplates, template];
    storage.setWorkoutTemplates(workoutTemplates);
    set({ workoutTemplates });
    return template;
  },

  deleteWorkoutTemplate: (id) => {
    const workoutTemplates = get().workoutTemplates.filter((t) => t.id !== id);
    storage.setWorkoutTemplates(workoutTemplates);
    set({ workoutTemplates });
  },

  applyTemplate: (sessionId, templateId) => {
    const template = get().workoutTemplates.find((t) => t.id === templateId);
    if (!template) return;
    const newExercises: SessionExercise[] = template.exercises.map((te) => ({
      ...te,
      id: generateId(),
      sessionId,
    }));
    const programs = get().programs.map((prog) => ({
      ...prog,
      sessions: prog.sessions.map((s) =>
        s.id === sessionId ? { ...s, exercises: newExercises } : s
      ),
    }));
    storage.setPrograms(programs);
    set({ programs, activeProgram: programs.find((p) => p.status === 'active') ?? null });
  },
}));
