// Pure PUBLIC-RECORDS verification handlers for v0.7 governance records
// (docs/BLOCKCHAIN-DESIGN-v0.7.md §6, endpoints #16-#18: payload / proof /
// verify). Every handler is (deps, params) => Promise<ApiResult> with all
// collaborators injected, so it unit/DB-tests with a fake reader + a Prisma
// read port. Route adapters wire the real deps and stay thin.
//
// These endpoints are PUBLIC, read-only, and rate-limit-aware. They live
// alongside the v0.6 `/verify` route (app/api/public-records/[id]/verify) which
// is left untouched — this file adds the v0.7 variants that also report
// `enforcementMatches` (the ChainEvent post-state vs the indexed projection).

import type { PrismaClient } from '@prisma/client';

import { computeRecordHash } from '../../blockchain/hashing/record-hash';
import type { GovernanceReader } from '../../blockchain/relay/governance-runtime';
import type { Hex32, RecordEnvelope } from '../../blockchain/types';

import { fail, ok, type ApiResult } from '../core/respond';
import type { RateLimiter } from '../public-records/rate-limit';

// ---- Injected ports (structural subsets of the frozen surfaces) ----

/** The Prisma delegates these handlers touch — the real client satisfies it. */
export type PublicRecordsReadPort = Pick<
  PrismaClient,
  'publicRecord' | 'chainEvent' | 'memberChainBalance' | 'communityTokenState'
>;

/** The only on-chain read the verify handler needs (key-free, no signing). */
export type RecordExistsReader = Pick<GovernanceReader, 'recordExists'>;

export interface PayloadDeps {
  readonly prisma: PublicRecordsReadPort;
}

export interface ProofDeps {
  readonly prisma: PublicRecordsReadPort;
  readonly contractAddress: string;
  readonly explorerBaseUrl: string;
}

export interface VerifyV07Deps {
  readonly prisma: PublicRecordsReadPort;
  readonly reader: RecordExistsReader;
  readonly rateLimiter: RateLimiter;
  readonly explorerBaseUrl: string;
}

/** The superset the deps resolver produces; routes pick per-handler subsets. */
export interface PublicRecordsV07Deps {
  readonly prisma: PublicRecordsReadPort;
  readonly reader: RecordExistsReader;
  readonly contractAddress: string;
  readonly explorerBaseUrl: string;
}

const RECORD_SCHEMA = 'youfen.record.v1' as const;

// Events that carry an absolute post-state (memberBalanceAfter/totalSupplyAfter +
// the monotonic govSeqAfter as ledgerSeq) which the projection folds.
const BALANCE_EVENTS: ReadonlySet<string> = new Set(['MintExecuted', 'ReversalExecuted']);

// ---- Helpers ----

/** Parse the stored canonical envelope; null when it is not valid JSON. */
function parseEnvelope(envelopeJson: string): RecordEnvelope | null {
  try {
    return JSON.parse(envelopeJson) as RecordEnvelope;
  } catch {
    return null;
  }
}

/**
 * Recompute recordHash from the stored envelope by re-canonicalizing the parsed
 * object (RFC 8785) and keccak256-ing it. Detects a tampered envelope or a
 * corrupted recordHash column. Returns null when the envelope is unparseable or
 * carries a value canonicalize rejects (both => a genuine hash mismatch).
 */
function recomputeRecordHash(envelopeJson: string): Hex32 | null {
  const envelope = parseEnvelope(envelopeJson);
  if (envelope === null) return null;
  try {
    return computeRecordHash(envelope);
  } catch {
    return null;
  }
}

/** Coerce a Prisma Decimal / bigint / decimal string into a bigint (or null). */
function toBigInt(value: unknown): bigint | null {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return Number.isInteger(value) ? BigInt(value) : null;
    const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
    return /^-?\d+$/.test(text) ? BigInt(text) : null;
  } catch {
    return null;
  }
}

/** Read a string-ish arg out of the JSON `args` blob, or null. */
function argString(args: unknown, key: string): string | null {
  if (typeof args !== 'object' || args === null) return null;
  const value = (args as Record<string, unknown>)[key];
  return value === undefined || value === null ? null : String(value);
}

/**
 * A projection is consistent with an event's post-state when the projection has
 * advanced at least to the event's ledgerSeq (fresher-wins): equal seq means the
 * projection must equal this event's post-state exactly; a higher seq means a
 * later event legitimately superseded it; a lower seq means the projection lags
 * the chain (drift) — enforcement is NOT proven.
 */
function projectionConsistent(
  projectionValue: unknown,
  projectionSeq: bigint,
  eventValue: string | null,
  eventSeq: bigint,
): boolean {
  if (projectionSeq > eventSeq) return true;
  if (projectionSeq < eventSeq) return false;
  const proj = toBigInt(projectionValue);
  const evt = eventValue === null ? null : toBigInt(eventValue);
  return proj !== null && evt !== null && proj === evt;
}

interface ChainEventRow {
  readonly txHash: string;
  readonly blockNumber: number;
  readonly logIndex: number;
  readonly eventName: string;
  readonly communityId: string;
  readonly memberIdHash: string | null;
  readonly ledgerSeq: bigint | null;
  readonly appliedAt: Date | null;
  readonly args: unknown;
}

/** The earliest ChainEvent that carries this recordHash (its enforcement log). */
async function loadRecordEvent(
  prisma: PublicRecordsReadPort,
  recordHash: string,
): Promise<ChainEventRow | null> {
  const event = await prisma.chainEvent.findFirst({
    where: { recordHash },
    orderBy: [{ blockNumber: 'asc' }, { logIndex: 'asc' }],
  });
  return event as ChainEventRow | null;
}

interface EnforcementResult {
  readonly enforcementMatches: boolean;
  readonly detail: {
    readonly indexed: boolean;
    readonly applied: boolean;
    readonly eventName: string | null;
    readonly ledgerSeq: string | null;
  };
}

/**
 * enforcementMatches: does the on-chain-enforced post-state in the ChainEvent
 * agree with the indexed DB projection? For balance events we compare the
 * event's memberBalanceAfter / totalSupplyAfter to MemberChainBalance /
 * CommunityTokenState (fresher-wins aware). A non-balance event that has been
 * folded (appliedAt set) is enforced-and-projected with no balance to compare,
 * so it matches. An event that is missing or not yet applied does NOT match.
 */
async function evaluateEnforcement(
  prisma: PublicRecordsReadPort,
  recordHash: string,
): Promise<{ result: EnforcementResult; event: ChainEventRow | null }> {
  const event = await loadRecordEvent(prisma, recordHash);
  if (event === null) {
    return {
      event: null,
      result: {
        enforcementMatches: false,
        detail: { indexed: false, applied: false, eventName: null, ledgerSeq: null },
      },
    };
  }

  const applied = event.appliedAt !== null;
  const ledgerSeq = event.ledgerSeq !== null ? event.ledgerSeq.toString(10) : null;
  const baseDetail = {
    indexed: true,
    applied,
    eventName: event.eventName,
    ledgerSeq,
  };

  if (!applied) {
    return { event, result: { enforcementMatches: false, detail: baseDetail } };
  }

  if (!BALANCE_EVENTS.has(event.eventName)) {
    // Applied non-balance event: enforced and folded, nothing further to compare.
    return { event, result: { enforcementMatches: true, detail: baseDetail } };
  }

  const memberIdHash = event.memberIdHash;
  if (memberIdHash === null) {
    return { event, result: { enforcementMatches: false, detail: baseDetail } };
  }

  const eventSeq = event.ledgerSeq ?? 0n;
  const balanceAfter = argString(event.args, 'memberBalanceAfter');
  const supplyAfter = argString(event.args, 'totalSupplyAfter');

  const [memberBalance, supplyState] = await Promise.all([
    prisma.memberChainBalance.findUnique({
      where: { communityId_memberIdHash: { communityId: event.communityId, memberIdHash } },
    }),
    prisma.communityTokenState.findUnique({ where: { communityId: event.communityId } }),
  ]);

  if (memberBalance === null || supplyState === null) {
    return { event, result: { enforcementMatches: false, detail: baseDetail } };
  }

  const memberOk = projectionConsistent(
    memberBalance.balance,
    memberBalance.ledgerSeq,
    balanceAfter,
    eventSeq,
  );
  const supplyOk = projectionConsistent(
    supplyState.currentTotalSupply,
    supplyState.ledgerSeq,
    supplyAfter,
    eventSeq,
  );

  return {
    event,
    result: { enforcementMatches: memberOk && supplyOk, detail: baseDetail },
  };
}

/** The public tx/log coordinate block, or null when the record is not yet indexed. */
function chainCoordinates(
  event: ChainEventRow | null,
  explorerBaseUrl: string,
): Record<string, unknown> | null {
  if (event === null) return null;
  return {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    logIndex: event.logIndex,
    eventName: event.eventName,
    explorerUrl: `${explorerBaseUrl}/tx/${event.txHash}`,
  };
}

// ---- Handlers ----

/**
 * GET /:id/payload — the canonical `youfen.record.v1` JSON (the exact hash
 * preimage). `canonicalPayload` is the stored envelope text verbatim so a third
 * party can keccak256 its UTF-8 bytes and reproduce recordHash directly;
 * `envelope` is the parsed convenience view.
 */
export async function handlePayloadV07(
  deps: PayloadDeps,
  input: { recordId: string },
): Promise<ApiResult> {
  const rec = await deps.prisma.publicRecord.findUnique({ where: { id: input.recordId } });
  if (rec === null) {
    return fail(404, 'RECORD_NOT_FOUND', `Public record '${input.recordId}' not found`);
  }

  return ok({
    recordId: rec.id,
    communityId: rec.communityId,
    recordType: rec.recordType,
    status: rec.status,
    recordHash: rec.recordHash,
    schema: RECORD_SCHEMA,
    canonicalPayload: rec.envelopeJson,
    envelope: parseEnvelope(rec.envelopeJson),
  });
}

/**
 * GET /:id/proof — tx/log coordinates (txHash, blockNumber, logIndex) from the
 * ChainEvent that carries this recordHash, plus the contract address. Includes a
 * clearly-labeled, NON-authoritative merkle field lifted from the payload (never
 * a substitute for recomputing recordHash from /payload + checking /verify).
 */
export async function handleProofV07(
  deps: ProofDeps,
  input: { recordId: string },
): Promise<ApiResult> {
  const rec = await deps.prisma.publicRecord.findUnique({ where: { id: input.recordId } });
  if (rec === null) {
    return fail(404, 'RECORD_NOT_FOUND', `Public record '${input.recordId}' not found`);
  }

  const event = await loadRecordEvent(deps.prisma, rec.recordHash);
  const envelope = parseEnvelope(rec.envelopeJson);
  const payload =
    envelope !== null && typeof envelope.payload === 'object' && envelope.payload !== null
      ? (envelope.payload as Record<string, unknown>)
      : {};
  const merkleRoot =
    (typeof payload.weightsMerkleRoot === 'string' && payload.weightsMerkleRoot) ||
    (typeof payload.votesMerkleRoot === 'string' && payload.votesMerkleRoot) ||
    (typeof payload.merkleRoot === 'string' && payload.merkleRoot) ||
    null;

  return ok({
    recordId: rec.id,
    recordHash: rec.recordHash,
    contractAddress: deps.contractAddress,
    chainCoordinates: chainCoordinates(event as ChainEventRow | null, deps.explorerBaseUrl),
    nonAuthoritativeMerkle: {
      note: 'Convenience only — NOT part of the on-chain proof. Verify by recomputing recordHash from GET /payload and checking GET /verify-v07 onChain=true.',
      merkleRoot,
    },
  });
}

/**
 * GET /:id/verify-v07 — public, rate-limited. Reports the three v0.7 checks:
 *   hashMatches        recomputed recordHash === stored recordHash
 *   onChain            reader.recordExists(recordHash) === true
 *   enforcementMatches the ChainEvent post-state === the indexed projection
 * `verified` is the AND of all three. On an RPC failure it returns 502 with
 * onChain:"unknown" (never a false verified) plus the DB-side status.
 */
export async function handleVerifyV07(
  deps: VerifyV07Deps,
  input: { recordId: string; clientKey: string },
): Promise<ApiResult> {
  if (!deps.rateLimiter.allow(input.clientKey)) {
    return fail(429, 'RATE_LIMITED', 'Too many verification requests; slow down');
  }

  const rec = await deps.prisma.publicRecord.findUnique({ where: { id: input.recordId } });
  if (rec === null) {
    return fail(404, 'RECORD_NOT_FOUND', `Public record '${input.recordId}' not found`);
  }

  const computedHash = recomputeRecordHash(rec.envelopeJson);
  const hashMatches =
    computedHash !== null && computedHash.toLowerCase() === rec.recordHash.toLowerCase();

  let onChain: boolean;
  try {
    onChain = await deps.reader.recordExists(rec.recordHash);
  } catch (error: unknown) {
    console.error('verify-v07 recordExists RPC failed', error);
    return fail(502, 'CHAIN_UNAVAILABLE', 'On-chain existence check failed', {
      onChain: 'unknown',
      dbStatus: rec.status,
    });
  }

  const { result, event } = await evaluateEnforcement(deps.prisma, rec.recordHash);
  const chain = chainCoordinates(event, deps.explorerBaseUrl);

  return ok({
    recordId: rec.id,
    recordType: rec.recordType,
    dbStatus: rec.status,
    hashMatches,
    onChain,
    enforcementMatches: result.enforcementMatches,
    verified: hashMatches && onChain && result.enforcementMatches,
    computedHash,
    storedHash: rec.recordHash,
    enforcement: result.detail,
    ...(chain ? { chain } : {}),
  });
}
