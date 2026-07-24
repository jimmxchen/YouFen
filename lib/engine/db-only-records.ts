// DB-only PublicRecord creation (single source of truth). These five record
// types are never mirrored on-chain: created straight to status 'recorded'
// (terminal on creation), chainEligible=false — never enqueued, never scanned by
// the reconciler. recordHash is still computed over the canonical envelope so
// the row is self-verifying.

import { canonicalize } from '../blockchain/hashing/canonicalize';
import { keccakUtf8 } from '../blockchain/hashing/record-hash';
import type { Hex32, RecordEnvelope } from '../blockchain/types';
import type { EngineTx } from './types';

/** The five DB-only record types (chainEligible=false, created 'recorded'). */
export type DbOnlyRecordType =
  | 'epoch_budget_created'
  | 'budget_advance'
  | 'advance_debt_repayment'
  | 'inflation_rate_change'
  | 'proposal_created';

/** DB-only envelope: distinct schema tag so it can never collide with the
 *  on-chain 'youfen.record.v1' preimage namespace. */
interface DbOnlyEnvelope {
  readonly schema: 'youfen.dbrecord.v1';
  readonly type: DbOnlyRecordType;
  readonly payload: Readonly<Record<string, string | number | boolean>>;
}

export interface CreateDbOnlyRecordInput {
  readonly communityId: string;
  readonly recordType: DbOnlyRecordType;
  readonly sourceTable: string;
  readonly sourceId: string;
  readonly payload: Record<string, string | number | boolean>;
}

/**
 * Create a DB-only PublicRecord. Returns the new row id. The envelope is
 * canonicalized (RFC-8785 subset) into envelopeJson and hashed with Ethereum
 * Keccak-256.
 */
export async function createDbOnlyRecord(
  tx: EngineTx,
  input: CreateDbOnlyRecordInput,
): Promise<{ id: string }> {
  const envelope: DbOnlyEnvelope = {
    schema: 'youfen.dbrecord.v1',
    type: input.recordType,
    payload: input.payload,
  };
  // canonicalize/keccakUtf8 are structural over the envelope; the schema literal
  // differs from 'youfen.record.v1' so we widen through unknown to satisfy the
  // frozen RecordEnvelope signature without loosening either contract.
  const envelopeJson = canonicalize(envelope as unknown as RecordEnvelope);
  const recordHash: Hex32 = keccakUtf8(envelopeJson);

  const created = (await tx.publicRecord.create({
    data: {
      communityId: input.communityId,
      recordType: input.recordType,
      status: 'recorded',
      chainEligible: false,
      envelopeJson,
      recordHash,
      sourceTable: input.sourceTable,
      sourceId: input.sourceId,
    },
  })) as { id: string };

  return { id: created.id };
}
