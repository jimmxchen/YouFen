import { describe, expect, it } from 'vitest';

import {
  InvalidChainActionTransition,
  assertTransition,
  canTransition,
  isConfirmedMutation,
  isTerminal,
  nextStates,
  rollsBackPending,
  type ChainActionStatus,
} from './action-state-machine';

describe('ChainAction state machine', () => {
  it('allows the happy path awaiting -> ready -> submitting -> submitted -> confirming -> verified', () => {
    const path: ChainActionStatus[] = [
      'awaiting_signatures',
      'ready_to_submit',
      'submitting',
      'submitted',
      'confirming',
      'verified',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1]), `${path[i]}->${path[i + 1]}`).to.equal(true);
    }
  });

  it('permits a submitting -> ready_to_submit retry', () => {
    expect(canTransition('submitting', 'ready_to_submit')).to.equal(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransition('awaiting_signatures', 'verified')).to.equal(false);
    expect(canTransition('awaiting_signatures', 'submitting')).to.equal(false);
    expect(canTransition('verified', 'reverted')).to.equal(false);
    expect(canTransition('reverted', 'verified')).to.equal(false);
  });

  it('assertTransition throws InvalidChainActionTransition on an illegal move', () => {
    expect(() => assertTransition('verified', 'submitting')).to.throw(InvalidChainActionTransition);
    expect(() => assertTransition('awaiting_signatures', 'ready_to_submit')).to.not.throw();
  });

  it('treats reverted / expired / superseded as terminal', () => {
    expect(isTerminal('reverted')).to.equal(true);
    expect(isTerminal('expired')).to.equal(true);
    expect(isTerminal('superseded')).to.equal(true);
    expect(nextStates('reverted')).to.deep.equal([]);
    expect(isTerminal('confirming')).to.equal(false);
  });

  it('marks ONLY verified as a confirmed-balance mutation', () => {
    expect(isConfirmedMutation('verified')).to.equal(true);
    for (const s of ['submitted', 'confirming', 'reverted', 'superseded'] as ChainActionStatus[]) {
      expect(isConfirmedMutation(s), s).to.equal(false);
    }
  });

  it('rolls back the pending delta on reverted / expired only', () => {
    expect(rollsBackPending('reverted')).to.equal(true);
    expect(rollsBackPending('expired')).to.equal(true);
    expect(rollsBackPending('verified')).to.equal(false);
  });
});
