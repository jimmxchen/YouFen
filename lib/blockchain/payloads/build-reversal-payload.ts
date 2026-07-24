// Reversal payload builder (BLOCKCHAIN-DESIGN §1, §4.4). Pure and IO-free.
// The reversal payload must reference the original record hash (PRD §10.3).

import { TerminalError } from '../errors';
import { hashCommunityId, hashMemberId } from '../hashing/id-hash';
import type {
  BuiltRecord,
  Hex32,
  TokenReversalEventData,
} from '../types';

import { finalizeBuilt, toPayloadInt, unixSeconds } from './build-mint-payload';

const HEX32_RE = /^0x[0-9a-fA-F]{64}$/;

export interface ReversalSource {
  readonly reversalEvent: TokenReversalEventData;
  readonly originalRecordHash: Hex32;
}

/**
 * Build a token_reversal BuiltRecord. The original record hash is mandatory and
 * must be a 66-char bytes32; a missing or malformed reference is terminal.
 */
export function buildReversalPayload(
  source: ReversalSource,
  pepper: string,
): BuiltRecord {
  const { reversalEvent, originalRecordHash } = source;

  if (
    typeof originalRecordHash !== 'string' ||
    !HEX32_RE.test(originalRecordHash)
  ) {
    throw new TerminalError(
      'MISSING_ORIGINAL_RECORD_HASH: reversal requires a bytes32 originalRecordHash',
    );
  }

  const communityIdHash = hashCommunityId(reversalEvent.communityId);
  const memberIdHash = hashMemberId(
    reversalEvent.communityId,
    reversalEvent.memberId,
    pepper,
  );
  const memberBalanceAfter = toPayloadInt(reversalEvent.totalBalanceAfter);
  const totalSupplyAfter = toPayloadInt(reversalEvent.totalSupplyAfter);

  const payload: Record<string, string | number | boolean> = {
    amount: toPayloadInt(reversalEvent.amount),
    communityIdHash,
    createdAt: unixSeconds(reversalEvent.createdAt),
    memberBalanceAfter,
    memberIdHash,
    originalRecordHash,
    reversalEventId: reversalEvent.id,
    totalSupplyAfter,
  };

  // ledgerSeq (contract guard) is additive: present -> enter payload + chainArgs;
  // absent -> omit the key so pre-existing preimages stay byte-identical.
  const hasLedgerSeq =
    reversalEvent.ledgerSeq !== undefined && reversalEvent.ledgerSeq !== null;
  if (hasLedgerSeq) {
    payload.ledgerSeq = reversalEvent.ledgerSeq as number;
  }

  const chainArgsHead: readonly (Hex32 | bigint | number)[] = [
    communityIdHash,
    memberIdHash,
    reversalEvent.amount,
    reversalEvent.totalBalanceAfter,
    reversalEvent.totalSupplyAfter,
    originalRecordHash,
    // ledgerSeq is the last arg before the trailing recordHash (contract order).
    ...(hasLedgerSeq ? [reversalEvent.ledgerSeq as number] : []),
  ];

  return finalizeBuilt('token_reversal', payload, chainArgsHead);
}
