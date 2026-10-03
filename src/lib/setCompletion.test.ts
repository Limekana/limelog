import { describe, it, expect } from 'vitest';
import { repFloor, resolveDone } from './setCompletion';

// limelog#42 (owner decision B2): DONE on an empty field logs the target the
// user was looking at, and is refused when there is no target to take.

describe('repFloor', () => {
  it('reads a single target', () => {
    expect(repFloor('5')).toBe(5);
  });

  it('takes the LOW end of a range, hyphen or en dash', () => {
    expect(repFloor('8-12')).toBe(8);
    expect(repFloor('8–12')).toBe(8);
  });

  it('reads "5+" as 5', () => {
    expect(repFloor('5+')).toBe(5);
  });

  it('has nothing to offer for a target without a number', () => {
    expect(repFloor('AMRAP')).toBeNull();
    expect(repFloor('')).toBeNull();
    expect(repFloor(undefined)).toBeNull();
    expect(repFloor('0')).toBeNull();
  });
});

describe('resolveDone', () => {
  it('fills empty reps with the target floor', () => {
    expect(resolveDone({ reps: null, weightKg: 100 }, '8-12', 100)).toEqual({ ok: true, fill: { reps: 8 } });
  });

  it('never overwrites reps the user typed, including a failed 0', () => {
    expect(resolveDone({ reps: 6, weightKg: 100 }, '8-12', 100)).toEqual({ ok: true, fill: {} });
    expect(resolveDone({ reps: 0, weightKg: 100 }, '8-12', 100)).toEqual({ ok: true, fill: {} });
  });

  it('refuses DONE when reps are empty and the target has no number', () => {
    expect(resolveDone({ reps: null, weightKg: 100 }, 'AMRAP', undefined)).toEqual({ ok: false, reason: 'reps-required' });
    expect(resolveDone({ reps: null, weightKg: 100 }, '', undefined)).toEqual({ ok: false, reason: 'reps-required' });
  });

  it('fills an empty weight from the target, and leaves it empty without one', () => {
    expect(resolveDone({ reps: 5, weightKg: null }, '5', 100)).toEqual({ ok: true, fill: { weightKg: 100 } });
    expect(resolveDone({ reps: 5, weightKg: null }, '5', undefined)).toEqual({ ok: true, fill: {} });
  });

  it('fills both when both are empty', () => {
    expect(resolveDone({ reps: null, weightKg: null }, '5', 60)).toEqual({ ok: true, fill: { reps: 5, weightKg: 60 } });
  });
});
