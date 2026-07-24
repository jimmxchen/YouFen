// Payload builder registry (BLOCKCHAIN-DESIGN §1, §4.4). buildEnvelopeForSource
// dispatches a RecordSource to its builder and returns an immutable BuiltRecord.

import { TerminalError } from '../errors';
import type { BuildEnvelopeFn, BuiltRecord, RecordSource } from '../types';

import { buildMintPayload } from './build-mint-payload';
import { buildReversalPayload } from './build-reversal-payload';
import { buildEpochPayload } from './build-epoch-payload';
import { buildPolicyPayload } from './build-policy-payload';
import {
  buildProposalResultPayload,
  buildProposalSnapshotPayload,
} from './build-proposal-payload';

/**
 * Dispatch a source to its payload builder. For mint sources the builder derives
 * the record type from budgetSource; it must agree with the declared kind or the
 * source is internally inconsistent (terminal).
 */
export const buildEnvelopeForSource: BuildEnvelopeFn = (
  source: RecordSource,
  pepper: string,
): BuiltRecord => {
  switch (source.kind) {
    case 'token_mint':
    case 'advance_mint': {
      const built = buildMintPayload(source.mintEvent, pepper);
      if (built.recordType !== source.kind) {
        throw new TerminalError(
          `KIND_MISMATCH: source kind ${source.kind} but budgetSource yields ${built.recordType}`,
        );
      }
      return built;
    }
    case 'token_reversal':
      return buildReversalPayload(
        {
          reversalEvent: source.reversalEvent,
          originalRecordHash: source.originalRecordHash,
        },
        pepper,
      );
    case 'epoch_summary':
      return buildEpochPayload(source.epoch, pepper);
    case 'policy_version':
      return buildPolicyPayload(source.policy, pepper);
    case 'proposal_snapshot':
      return buildProposalSnapshotPayload(source.proposal, pepper);
    case 'proposal_result':
      return buildProposalResultPayload(source.proposal, pepper);
    default: {
      // Exhaustiveness guard — the union above is closed.
      const exhaustive: never = source;
      throw new TerminalError(
        `UNKNOWN_SOURCE_KIND: ${String((exhaustive as { kind?: string }).kind)}`,
      );
    }
  }
};

export {
  buildMintPayload,
  toPayloadInt,
  unixSeconds,
} from './build-mint-payload';
export { buildReversalPayload } from './build-reversal-payload';
export { buildEpochPayload } from './build-epoch-payload';
export { buildPolicyPayload } from './build-policy-payload';
export {
  buildProposalResultPayload,
  buildProposalSnapshotPayload,
} from './build-proposal-payload';
