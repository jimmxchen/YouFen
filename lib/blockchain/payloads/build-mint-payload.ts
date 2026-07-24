// Mint payload builder (BLOCKCHAIN-DESIGN §1, §4.4). Pure and IO-free: the
// pepper is an explicit argument. Shared payload helpers live here (no cycle:
// this module imports only hashing; the other builders import these helpers).

import { TerminalError } from '../errors';
import { canonicalize } from '../hashing/canonicalize';
import { hashCommunityId, hashMemberId } from '../hashing/id-hash';
import { computeRecordHash } from '../hashing/record-hash';
import type {
  BuiltRecord,
  Hex32,
  RecordEnvelope,
  RecordType,
  SubmittableRecord,
  TokenMintEventData,
} from '../types';

const SCHEMA = 'youfen.record.v1' as const;

/** Payload values are integers/strings/booleans only. */
type PayloadValue = string | number | boolean;
type PayloadObject = Record<string, PayloadValue>;

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Deterministic bigint → payload integer. Values within the safe-integer range
 * serialize as JSON numbers; anything larger becomes a decimal string so the
 * canonical form never loses precision.
 */
export function toPayloadInt(value: bigint): number | string {
  if (value <= MAX_SAFE && value >= MIN_SAFE) {
    return Number(value);
  }
  return value.toString(10);
}

/** Date → Unix seconds (payload time keys always end in `At`). */
export function unixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Assemble the immutable BuiltRecord from a type + payload + the chain args that
 * precede the trailing recordHash. recordHash is computed once and appended.
 */
export function finalizeBuilt(
  type: RecordType,
  payload: PayloadObject,
  chainArgsHead: readonly (Hex32 | bigint | number)[],
): BuiltRecord {
  const envelope: RecordEnvelope = { schema: SCHEMA, type, payload };
  const canonicalJson = canonicalize(envelope);
  const recordHash = computeRecordHash(envelope);
  const chainArgs: SubmittableRecord['chainArgs'] = [
    ...chainArgsHead,
    recordHash,
  ];
  return { recordType: type, envelope, canonicalJson, recordHash, chainArgs };
}

/** budgetSource → the uint8 code the contract expects (0 current, 1 advance). */
function budgetSourceCode(
  budgetSource: TokenMintEventData['budgetSource'],
): 0 | 1 {
  return budgetSource === 'next_epoch_advance' ? 1 : 0;
}

/**
 * Build a token_mint / advance_mint BuiltRecord from a mint event. The record
 * type is derived from budgetSource; an advance mint must carry a positive
 * governanceActivationEpoch or it is a terminal data error.
 */
export function buildMintPayload(
  mint: TokenMintEventData,
  pepper: string,
): BuiltRecord {
  const isAdvance = mint.budgetSource === 'next_epoch_advance';
  const activationEpoch = mint.governanceActivationEpoch ?? 0;

  if (isAdvance && activationEpoch <= 0) {
    throw new TerminalError(
      'ADVANCE_WITHOUT_ACTIVATION_EPOCH: advance mint requires governanceActivationEpoch > 0',
    );
  }

  const type: RecordType = isAdvance ? 'advance_mint' : 'token_mint';
  const communityIdHash = hashCommunityId(mint.communityId);
  const memberIdHash = hashMemberId(mint.communityId, mint.memberId, pepper);

  const payload: PayloadObject = {
    amount: toPayloadInt(mint.amount),
    budgetSource: mint.budgetSource,
    communityIdHash,
    createdAt: unixSeconds(mint.createdAt),
    epochNumber: mint.epochNumber,
    memberBalanceAfter: toPayloadInt(mint.memberBalanceAfter),
    memberBalanceBefore: toPayloadInt(mint.memberBalanceBefore),
    memberIdHash,
    mintEventId: mint.id,
    mintType: mint.mintType,
    tokenPolicyVersion: mint.tokenPolicyVersion,
    totalSupplyAfter: toPayloadInt(mint.totalSupplyAfter),
    totalSupplyBefore: toPayloadInt(mint.totalSupplyBefore),
  };

  // Advance mints carry the activation epoch; normal mints omit the key entirely
  // (never write 0/null — that would change the canonical preimage).
  if (isAdvance) {
    payload.activationEpoch = activationEpoch;
  }

  // ledgerSeq (contract guard) is additive: present -> enter payload + chainArgs;
  // absent -> omit the key so pre-existing preimages stay byte-identical.
  const hasLedgerSeq = mint.ledgerSeq !== undefined && mint.ledgerSeq !== null;
  if (hasLedgerSeq) {
    payload.ledgerSeq = mint.ledgerSeq as number;
  }

  const chainArgsHead: readonly (Hex32 | bigint | number)[] = [
    communityIdHash,
    memberIdHash,
    mint.amount,
    mint.memberBalanceAfter,
    mint.totalSupplyAfter,
    budgetSourceCode(mint.budgetSource),
    activationEpoch,
    // ledgerSeq is the last arg before the trailing recordHash (contract order).
    ...(hasLedgerSeq ? [mint.ledgerSeq as number] : []),
  ];

  return finalizeBuilt(type, payload, chainArgsHead);
}
