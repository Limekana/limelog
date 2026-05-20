import type { Program, Exercise, WorkoutTemplate } from '@/types/program';
import type { SessionLog, VerticalJumpLog, StallFlag } from '@/types/logging';
import type { UserProfile, InjuryRestriction } from '@/types/user';

const KEYS = {
  programs: 'wt_programs',
  exercises: 'wt_exercises',
  sessionLogs: 'wt_session_logs',
  jumpLogs: 'wt_jump_logs',
  stallFlags: 'wt_stall_flags',
  profile: 'wt_profile',
  workoutTemplates: 'wt_workout_templates',
} as const;

function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function set<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export const storage = {
  getPrograms: (): Program[] => get<Program[]>(KEYS.programs) ?? [],
  setPrograms: (v: Program[]) => set(KEYS.programs, v),

  getExercises: (): Exercise[] => get<Exercise[]>(KEYS.exercises) ?? [],
  setExercises: (v: Exercise[]) => set(KEYS.exercises, v),

  getSessionLogs: (): SessionLog[] => get<SessionLog[]>(KEYS.sessionLogs) ?? [],
  setSessionLogs: (v: SessionLog[]) => set(KEYS.sessionLogs, v),

  getJumpLogs: (): VerticalJumpLog[] => get<VerticalJumpLog[]>(KEYS.jumpLogs) ?? [],
  setJumpLogs: (v: VerticalJumpLog[]) => set(KEYS.jumpLogs, v),

  getStallFlags: (): StallFlag[] => get<StallFlag[]>(KEYS.stallFlags) ?? [],
  setStallFlags: (v: StallFlag[]) => set(KEYS.stallFlags, v),

  getProfile: (): UserProfile | null => get<UserProfile>(KEYS.profile),
  setProfile: (v: UserProfile) => set(KEYS.profile, v),

  getWorkoutTemplates: (): WorkoutTemplate[] => get<WorkoutTemplate[]>(KEYS.workoutTemplates) ?? [],
  setWorkoutTemplates: (v: WorkoutTemplate[]) => set(KEYS.workoutTemplates, v),

  getRestrictions: (): InjuryRestriction[] => {
    const profile = get<UserProfile>(KEYS.profile);
    return profile?.activeRestrictions ?? [];
  },
};
