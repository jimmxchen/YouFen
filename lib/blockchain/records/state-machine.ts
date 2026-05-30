// PublicRecord verification state machine (BLOCKCHAIN-DESIGN §5, PRD §10.4).
// Pure functions only: no side effects, no mutation. The DB layer enforces every
// transition as a conditional UPDATE (WHERE status IN (from...)); this module is
// the single source of truth for which edges are legal.

import { InvalidTransitionError } from '../errors';
import type { VerificationStatus } from '../types';

/**
 * The complete legal-edge table. Exactly 10 edges:
 *   pending -> submitting
 *   submitting -> confirming | failed | pending | verified
 *   confirming -> verified | failed | pending
 *   failed -> pending
 *   verified -> superseded
 *
 * `submitting -> verified` is the crash-recovery edge (§5 reconciler step 1: the
 * contract already holds the recordHash, so the reconciler backfills txHash and
 * moves straight to verified). `submitting/confirming -> pending` are the
 * reconciler reset edges; `failed -> pending` is manual/auto retry. Self-edges
 * are never legal; same-status field patches go through patchInStatus instead.
 */
export const TRANSITIONS: Readonly<Record<VerificationStatus, readonly VerificationStatus[]>> = {
  pending: ['submitting'],
  submitting: ['confirming', 'failed', 'pending', 'verified'],
  confirming: ['verified', 'failed', 'pending'],
  failed: ['pending'],
  verified: ['superseded'],
  superseded: [],
};

/**
 * Terminal states. `verified` is terminal for the happy path yet may still be
 * superseded by a later correction record; `superseded` is the absolute terminal
 * state with no outgoing edges.
 */
export const TERMINAL_STATES: readonly VerificationStatus[] = ['verified', 'superseded'];

/** True iff `from -> to` is one of the 10 legal edges. Self-edges are never legal. */
export function canTransition(from: VerificationStatus, to: VerificationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Throws InvalidTransitionError (a TerminalError) when `from -> to` is illegal. */
export function assertTransition(from: VerificationStatus, to: VerificationStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(`Illegal record transition: '${from}' -> '${to}'`);
  }
}

/** Only `verified` may be shown to users as "confirmed on Injective" (PRD §10.4). */
export function isDisplayableAsConfirmed(status: VerificationStatus): boolean {
  return status === 'verified';
}
