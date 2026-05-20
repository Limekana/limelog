export interface SetLog {
  id: string;
  sessionLogId: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  completed: boolean;
  notes?: string;
}

export interface SessionLog {
  id: string;
  sessionTemplateId: string;
  programId: string;
  loggedAt: string;
  finalizedAt?: string;
  perceivedFatigue: number | null;
  notes?: string;
  sets: SetLog[];
}

export type JumpCondition = 'fresh' | 'post_session' | 'morning';

export interface VerticalJumpLog {
  id: string;
  userId: string;
  loggedAt: string;
  heightCm: number;
  condition: JumpCondition;
  notes?: string;
}

export type StallFlagType = 'weight_plateau' | 'rpe_creep';

export interface StallFlag {
  id: string;
  exerciseId: string;
  detectedAt: string;
  sessionLogIds: string[];
  flagType: StallFlagType;
  resolved: boolean;
  resolutionAction?: 'deload' | 'exercise_swap' | 'technique_reset' | 'ignored';
}
