export type MovementPattern =
  | 'push'
  | 'pull'
  | 'hinge'
  | 'squat'
  | 'carry'
  | 'jump'
  | 'accessory'
  | 'core';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'band'
  | 'kettlebell'
  | 'other';

export interface Exercise {
  id: string;
  name: string;
  movementPattern: MovementPattern;
  primaryMuscle: string;
  equipment: Equipment;
  isBilateral: boolean;
  notes?: string;
}

export type PhaseType = 'accumulation' | 'intensification' | 'peaking' | 'deload';

export interface Phase {
  id: string;
  programId: string;
  name: string;
  type: PhaseType;
  orderIndex: number;
  weekStart: number;
  weekEnd: number;
  notes?: string;
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SessionTemplate {
  id: string;
  phaseId: string;
  name: string;
  dayOfWeek: DayOfWeek;
  orderIndex: number;
  exercises: SessionExercise[];
  previousPerformance?: Record<string, number>;
}

export interface SessionExercise {
  id: string;
  sessionId: string;
  exerciseId: string;
  orderIndex: number;
  targetSets: number;
  targetReps: string;
  targetRpe?: number;
  targetWeight?: number;
  restSeconds?: number;
  notes?: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  createdAt: string;
  exercises: Array<{
    exerciseId: string;
    orderIndex: number;
    targetSets: number;
    targetReps: string;
    targetRpe?: number;
    targetWeight?: number;
    notes?: string;
  }>;
}

export interface Program {
  id: string;
  userId: string;
  name: string;
  description?: string;
  status: 'active' | 'archived';
  createdAt: string;
  phases: Phase[];
  sessions: SessionTemplate[];
  exerciseBestRecords?: Record<string, { maxWeightKg: number; maxReps: number }>;
}
