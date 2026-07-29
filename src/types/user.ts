import type { MovementPattern } from './program';

export type InjurySeverity = 'avoid' | 'modify' | 'monitor';

export interface InjuryRestriction {
  id: string;
  label: string;
  restrictedPatterns: MovementPattern[];
  restrictedExerciseIds: string[];
  severity: InjurySeverity;
  active: boolean;
  createdAt: string;
  resolvedAt?: string;
  notes?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  unitPreference: 'kg' | 'lb';
  /** v1.8 — opt-in for the cloud AI debrief. Optional so profiles saved by an
   *  older build load unchanged; absent is read as off everywhere it is used. */
  aiEnabled?: boolean;
  activeRestrictions: InjuryRestriction[];
  deloadThresholds: {
    stallCountTrigger: number;
    avgFatigueTrigger: number;
    fatigueLookbackSessions: number;
  };
  createdAt: string;
}
