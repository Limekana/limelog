// limelog#43: Today lists the ACTIVE phase's sessions for the weekday.
//
// Every SessionTemplate belongs to exactly one phase (`phaseId` is required,
// and PhaseList groups by it), so a block with a Saturday Push in both
// Accumulation and Intensification has two Saturday sessions. Today used to
// filter on the weekday alone and listed both, which offers the wrong
// phase's prescription a tap away from "Start".
import type { Program, SessionTemplate } from '@/types/program';

/**
 * Sessions to offer on `dayOfWeek`. `currentPhaseId` is the phase Today already
 * resolves (activePhaseId, else the lowest orderIndex).
 *
 * One deliberate fallback: if the current phase has no sessions on ANY day,
 * every phase's sessions for the weekday are offered, as before. That only
 * happens when a program was set up with its work in a later phase that was
 * never advanced to, and an empty Today would hide a workout the user built.
 */
export function sessionsForDay(
  program: Pick<Program, 'sessions'> | null | undefined,
  dayOfWeek: number,
  currentPhaseId: string | null | undefined,
): SessionTemplate[] {
  if (!program) return [];
  const onDay = program.sessions.filter((s) => s.dayOfWeek === dayOfWeek);
  if (!currentPhaseId) return onDay;
  const phaseHasWork = program.sessions.some((s) => s.phaseId === currentPhaseId);
  if (!phaseHasWork) return onDay;
  return onDay.filter((s) => s.phaseId === currentPhaseId);
}
