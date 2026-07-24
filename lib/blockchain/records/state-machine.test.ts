import { describe, it, expect } from 'vitest';

import { TerminalError, InvalidTransitionError } from '../errors';
import type { VerificationStatus } from '../types';

import {
  TRANSITIONS,
  TERMINAL_STATES,
  canTransition,
  assertTransition,
  isDisplayableAsConfirmed,
} from './state-machine';

const ALL_STATES: readonly VerificationStatus[] = [
  'pending',
  'submitting',
  'confirming',
  'verified',
  'failed',
  'superseded',
];

// The authoritative 10-edge set (BLOCKCHAIN-DESIGN §5 + submitting->verified
// crash-recovery edge from §5 reconciler step 1).
const LEGAL_EDGES: ReadonlyArray<readonly [VerificationStatus, VerificationStatus]> = [
  ['pending', 'submitting'],
  ['submitting', 'confirming'],
  ['submitting', 'failed'],
  ['submitting', 'pending'],
  ['submitting', 'verified'],
  ['confirming', 'verified'],
  ['confirming', 'failed'],
  ['confirming', 'pending'],
  ['failed', 'pending'],
  ['verified', 'superseded'],
];

function isLegal(from: VerificationStatus, to: VerificationStatus): boolean {
  return LEGAL_EDGES.some(([f, t]) => f === from && t === to);
}

describe('state-machine transition table', () => {
  it('declares exactly 10 legal edges across the table', () => {
    const total = ALL_STATES.reduce((sum, s) => sum + TRANSITIONS[s].length, 0);
    expect(total).toBe(10);
  });

  it('matches the authoritative edge table entry by entry', () => {
    expect(TRANSITIONS).toEqual({
      pending: ['submitting'],
      submitting: ['confirming', 'failed', 'pending', 'verified'],
      confirming: ['verified', 'failed', 'pending'],
      failed: ['pending'],
      verified: ['superseded'],
      superseded: [],
    });
  });

  it('has no outgoing edges from superseded (absolute terminal)', () => {
    expect(TRANSITIONS.superseded).toEqual([]);
  });

  it('includes the submitting->verified crash-recovery edge', () => {
    expect(TRANSITIONS.submitting).toContain('verified');
  });
});

describe('canTransition — full 6x6 matrix', () => {
  for (const from of ALL_STATES) {
    for (const to of ALL_STATES) {
      const expected = isLegal(from, to);
      it(`${from} -> ${to} is ${expected ? 'legal' : 'illegal'}`, () => {
        expect(canTransition(from, to)).toBe(expected);
      });
    }
  }

  it('rejects every self-transition (x -> x)', () => {
    for (const s of ALL_STATES) {
      expect(canTransition(s, s)).toBe(false);
    }
  });
});

describe('assertTransition', () => {
  it('does not throw for any of the 10 legal edges', () => {
    for (const [from, to] of LEGAL_EDGES) {
      expect(() => assertTransition(from, to)).not.toThrow();
    }
  });

  it('throws InvalidTransitionError (also a TerminalError) for illegal edges', () => {
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        if (isLegal(from, to)) {
          continue;
        }
        let caught: unknown;
        try {
          assertTransition(from, to);
        } catch (e: unknown) {
          caught = e;
        }
        expect(caught).toBeInstanceOf(InvalidTransitionError);
        expect(caught).toBeInstanceOf(TerminalError);
      }
    }
  });

  it('embeds both from and to states in the error message', () => {
    let caught: InvalidTransitionError | undefined;
    try {
      assertTransition('verified', 'pending');
    } catch (e: unknown) {
      caught = e as InvalidTransitionError;
    }
    expect(caught).toBeInstanceOf(InvalidTransitionError);
    expect(caught?.message).toContain('verified');
    expect(caught?.message).toContain('pending');
  });
});

describe('TERMINAL_STATES', () => {
  it('is exactly verified and superseded', () => {
    expect(TERMINAL_STATES).toEqual(['verified', 'superseded']);
  });
});

describe('isDisplayableAsConfirmed', () => {
  it('is true only for verified', () => {
    for (const s of ALL_STATES) {
      expect(isDisplayableAsConfirmed(s)).toBe(s === 'verified');
    }
  });
});
