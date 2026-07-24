import { describe, expect, it } from 'vitest';

import {
  calculateBaseMintBudget,
  calculateCarriedOverDebt,
  calculateCumulativeAdvanceRateBps,
  calculateEffectiveRegularBudget,
  calculateMaxAdvanceAmount,
  calculateMemberEpochCap,
  calculateOwnershipPercentage,
  resolveAdvanceApproval,
} from './calc';
import { EngineError } from './errors';

describe('calculateBaseMintBudget', () => {
  it('computes supply * bps / 10000 with bigint floor', () => {
    // 1_000_000 * 250 / 10000 = 25_000
    expect(calculateBaseMintBudget(1_000_000n, 250)).toBe(25_000n);
  });

  it('floors the integer division (no rounding up)', () => {
    // 10_001 * 1 / 10000 = 1.0001 -> floor 1
    expect(calculateBaseMintBudget(10_001n, 1)).toBe(1n);
  });

  it('returns 0 when opening supply is 0', () => {
    expect(calculateBaseMintBudget(0n, 500)).toBe(0n);
  });

  it('returns 0 when the inflation rate is 0 bps', () => {
    expect(calculateBaseMintBudget(1_000_000n, 0)).toBe(0n);
  });

  it('handles very large bigint supplies without precision loss', () => {
    const supply = 123_456_789_012_345_678_901_234_567_890n;
    // bps 10000 (100%) returns the supply unchanged
    expect(calculateBaseMintBudget(supply, 10000)).toBe(supply);
  });

  it('throws VALIDATION_ERROR on negative supply', () => {
    expect(() => calculateBaseMintBudget(-1n, 250)).toThrowError(EngineError);
    try {
      calculateBaseMintBudget(-1n, 250);
    } catch (e) {
      expect((e as EngineError).code).toBe('VALIDATION_ERROR');
    }
  });

  it('throws VALIDATION_ERROR on negative bps', () => {
    expect(() => calculateBaseMintBudget(1_000_000n, -1)).toThrowError(EngineError);
  });
});

describe('calculateEffectiveRegularBudget', () => {
  it('subtracts debt from base', () => {
    expect(calculateEffectiveRegularBudget(1000n, 300n)).toBe(700n);
  });

  it('clamps to 0 when debt exceeds base', () => {
    expect(calculateEffectiveRegularBudget(300n, 1000n)).toBe(0n);
  });

  it('throws VALIDATION_ERROR on negative input', () => {
    expect(() => calculateEffectiveRegularBudget(-1n, 0n)).toThrowError(EngineError);
    expect(() => calculateEffectiveRegularBudget(0n, -1n)).toThrowError(EngineError);
  });
});

describe('calculateCarriedOverDebt', () => {
  it('carries the debt remainder when debt exceeds base', () => {
    // debt 1000 - base 300 -> 700 rolls to next epoch
    expect(calculateCarriedOverDebt(300n, 1000n)).toBe(700n);
  });

  it('carries nothing when base covers the debt', () => {
    expect(calculateCarriedOverDebt(1000n, 300n)).toBe(0n);
    expect(calculateCarriedOverDebt(1000n, 1000n)).toBe(0n);
  });
});

describe('calculateMaxAdvanceAmount', () => {
  it('computes base * bps / 10000', () => {
    // 1000 * 5000 / 10000 = 500
    expect(calculateMaxAdvanceAmount(1000n, 5000)).toBe(500n);
  });

  it('throws VALIDATION_ERROR on negative bps', () => {
    expect(() => calculateMaxAdvanceAmount(1000n, -5)).toThrowError(EngineError);
  });
});

describe('calculateMemberEpochCap', () => {
  it('computes base * bps / 10000', () => {
    // 1000 * 2000 / 10000 = 200
    expect(calculateMemberEpochCap(1000n, 2000)).toBe(200n);
  });
});

describe('calculateOwnershipPercentage', () => {
  it('returns a percentage in [0,100]', () => {
    expect(calculateOwnershipPercentage(1n, 4n)).toBe(25);
  });

  it('returns 0 when supply is 0', () => {
    expect(calculateOwnershipPercentage(0n, 0n)).toBe(0);
    expect(calculateOwnershipPercentage(5n, 0n)).toBe(0);
  });

  it('produces fractional percentages', () => {
    expect(calculateOwnershipPercentage(1n, 3n)).toBeCloseTo(33.3333, 3);
  });

  it('throws VALIDATION_ERROR on negative input', () => {
    expect(() => calculateOwnershipPercentage(-1n, 10n)).toThrowError(EngineError);
    expect(() => calculateOwnershipPercentage(1n, -10n)).toThrowError(EngineError);
  });
});

describe('calculateCumulativeAdvanceRateBps', () => {
  it('returns MAX_SAFE_INTEGER when base is 0 and something is requested', () => {
    expect(calculateCumulativeAdvanceRateBps(0n, 1n, 0n)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('returns 0 when base is 0 and nothing is requested', () => {
    expect(calculateCumulativeAdvanceRateBps(0n, 0n, 0n)).toBe(0);
  });

  it('accumulates already-advanced + requested against the base budget', () => {
    // (900 already + 900 requested) * 10000 / 10000 base = 1800 bps
    expect(calculateCumulativeAdvanceRateBps(900n, 900n, 10000n)).toBe(1800);
  });

  it('floors the bps result', () => {
    // (0 + 1) * 10000 / 3 = 3333.33 -> floor 3333
    expect(calculateCumulativeAdvanceRateBps(0n, 1n, 3n)).toBe(3333);
  });

  it('throws VALIDATION_ERROR on negative input', () => {
    expect(() => calculateCumulativeAdvanceRateBps(-1n, 0n, 100n)).toThrowError(EngineError);
    expect(() => calculateCumulativeAdvanceRateBps(0n, -1n, 100n)).toThrowError(EngineError);
    expect(() => calculateCumulativeAdvanceRateBps(0n, 0n, -1n)).toThrowError(EngineError);
  });
});

describe('resolveAdvanceApproval (§6.2 decision table)', () => {
  it('forbids anything above 2500 bps', () => {
    expect(resolveAdvanceApproval(2501, false, false)).toBe('system_forbidden');
    // forbidden dominates related-party / special flags
    expect(resolveAdvanceApproval(3000, true, true)).toBe('system_forbidden');
  });

  it('requires a community proposal for related parties', () => {
    expect(resolveAdvanceApproval(0, true, false)).toBe('community_proposal');
    expect(resolveAdvanceApproval(500, true, false)).toBe('community_proposal');
  });

  it('requires a community proposal for special no-contribution mints', () => {
    expect(resolveAdvanceApproval(0, false, true)).toBe('community_proposal');
  });

  it('requires a community proposal above 1000 bps', () => {
    expect(resolveAdvanceApproval(1001, false, false)).toBe('community_proposal');
    expect(resolveAdvanceApproval(2500, false, false)).toBe('community_proposal');
  });

  it('requires dual-admin approval above 0 and up to 1000 bps', () => {
    expect(resolveAdvanceApproval(1, false, false)).toBe('dual_admin');
    expect(resolveAdvanceApproval(1000, false, false)).toBe('dual_admin');
  });

  it('applies the standard rule at exactly 0 bps', () => {
    expect(resolveAdvanceApproval(0, false, false)).toBe('standard_rule');
  });
});
