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
  activeRestrictions: InjuryRestriction[];
  deloadThresholds: {
    stallCountTrigger: number;
    avgFatigueTrigger: number;
    fatigueLookbackSessions: number;
  };
  createdAt: string;
}
