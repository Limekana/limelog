import { describe, it, expect } from 'vitest';
import { sessionsForDay } from './todaySessions';
import type { SessionTemplate } from '@/types/program';

// limelog#43: Today offers the active phase's sessions, not every phase's.

const SAT = 6;
const MON = 1;

function s(id: string, phaseId: string, dayOfWeek: number): SessionTemplate {
  return { id, phaseId, dayOfWeek, name: id, exercises: [], orderIndex: 0 } as unknown as SessionTemplate;
}

const program = {
  sessions: [
    s('acc-push-sat', 'acc', SAT),
    s('acc-pull-mon', 'acc', MON),
    s('int-push-sat', 'int', SAT),
    s('int-pull-mon', 'int', MON),
  ],
};

describe('sessionsForDay', () => {
  it('reproduces #43: the weekday alone matches both phases', () => {
    // What Today used to do. Kept as the documented reproduction.
    expect(program.sessions.filter((x) => x.dayOfWeek === SAT).map((x) => x.id)).toEqual(['acc-push-sat', 'int-push-sat']);
  });

  it('offers only the current phase\'s session for the day', () => {
    expect(sessionsForDay(program, SAT, 'acc').map((x) => x.id)).toEqual(['acc-push-sat']);
    expect(sessionsForDay(program, SAT, 'int').map((x) => x.id)).toEqual(['int-push-sat']);
  });

  it('offers nothing on a rest day of the current phase even if another phase trains that day', () => {
    const p = { sessions: [s('acc-push-sat', 'acc', SAT), s('int-legs-sun', 'int', 0)] };
    expect(sessionsForDay(p, 0, 'acc')).toEqual([]);
  });

  it('falls back to every phase when the current phase has no sessions at all', () => {
    const p = { sessions: [s('int-push-sat', 'int', SAT)] };
    expect(sessionsForDay(p, SAT, 'acc').map((x) => x.id)).toEqual(['int-push-sat']);
  });

  it('keeps the old behaviour with no phase resolved, and is empty with no program', () => {
    expect(sessionsForDay(program, SAT, null)).toHaveLength(2);
    expect(sessionsForDay(null, SAT, 'acc')).toEqual([]);
  });
});
