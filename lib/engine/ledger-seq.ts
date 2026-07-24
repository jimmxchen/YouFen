// Community-scoped monotonic ledger sequence allocation (single source of
// truth). Only token_mint / advance_mint / token_reversal records carry a
// ledgerSeq; it is assigned inside the business transaction from
// CommunityTokenState so a late/retried record can never overwrite a fresher
// balance snapshot (BLOCKCHAIN-DESIGN invariant 6).

import { EngineError } from './errors';
import type { EngineTx } from './types';

/**
 * Atomically bump CommunityTokenState.ledgerSeq and return the new value.
 * Throws EngineError('NOT_FOUND') if the community has no state row.
 */
export async function allocateLedgerSeq(
  tx: EngineTx,
  communityId: string,
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ ledgerSeq: bigint }>>`UPDATE "CommunityTokenState" SET "ledgerSeq" = "ledgerSeq" + 1 WHERE "communityId" = ${communityId} RETURNING "ledgerSeq"`;
  if (rows.length === 0) {
    throw new EngineError('NOT_FOUND', `no CommunityTokenState for community ${communityId}`);
  }
  return Number(rows[0].ledgerSeq);
}
