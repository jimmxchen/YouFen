// ChainAction state machine (docs/BLOCKCHAIN-DESIGN-v0.7.md §7). Pure and
// IO-free — the chain-action-service applies these transitions as conditional
// UPDATEs (`WHERE id + status IN(from)`), so a lost race is an idempotent no-op.
//
// The one economic invariant: ONLY a `verified` transition mutates confirmed
// balances (and only the indexer performs it). `reverted` / `expired` roll back
// the optimistic pending delta. Terminal states never transition again.

export type ChainActionStatus =
  | 'awaiting_signatures'
  | 'ready_to_submit'
  | 'submitting'
  | 'submitted'
  | 'confirming'
  | 'verified'
  | 'reverted'
  | 'expired'
  | 'superseded';

const TRANSITIONS: Readonly<Record<ChainActionStatus, readonly ChainActionStatus[]>> = {
  awaiting_signatures: ['ready_to_submit', 'expired'],
  ready_to_submit: ['submitting', 'expired'],
  submitting: ['submitted', 'ready_to_submit', 'reverted', 'expired'], // ready_to_submit = retry
  submitted: ['confirming', 'verified', 'reverted'],
  confirming: ['verified', 'reverted', 'expired'],
  verified: ['superseded'],
  reverted: [],
  expired: [],
  superseded: [],
};

export const TERMINAL_STATES: readonly ChainActionStatus[] = ['reverted', 'expired', 'superseded'];

export function isTerminal(status: ChainActionStatus): boolean {
  return TERMINAL_STATES.includes(status);
}

/** The set of statuses `from` may legally move to. */
export function nextStates(from: ChainActionStatus): readonly ChainActionStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: ChainActionStatus, to: ChainActionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidChainActionTransition extends Error {
  constructor(
    readonly from: ChainActionStatus,
    readonly to: ChainActionStatus,
  ) {
    super(`INVALID_CHAIN_ACTION_TRANSITION:${from}->${to}`);
    this.name = 'InvalidChainActionTransition';
  }
}

export function assertTransition(from: ChainActionStatus, to: ChainActionStatus): void {
  if (!canTransition(from, to)) throw new InvalidChainActionTransition(from, to);
}

/** True only for the `verified` transition — the sole path that credits confirmed balances. */
export function isConfirmedMutation(to: ChainActionStatus): boolean {
  return to === 'verified';
}

/** True for transitions that must roll back an optimistic pending delta. */
export function rollsBackPending(to: ChainActionStatus): boolean {
  return to === 'reverted' || to === 'expired';
}
