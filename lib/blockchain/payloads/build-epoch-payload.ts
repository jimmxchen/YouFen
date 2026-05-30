// Epoch summary payload builder (BLOCKCHAIN-DESIGN §1, §4.4). Pure and IO-free.

import { hashCommunityId } from '../hashing/id-hash';
import type { BuiltRecord, Hex32, TokenEpochData } from '../types';

import { finalizeBuilt, toPayloadInt, unixSeconds } from './build-mint-payload';

/**
 * Build an epoch_summary BuiltRecord. When the epoch has no explicit close time
 * the record's createdAt is used, but the payload key stays `closedAt`.
 */
export function buildEpochPayload(
  epoch: TokenEpochData,
  _pepper: string,
): BuiltRecord {
  const communityIdHash = hashCommunityId(epoch.communityId);
  const closedAt = unixSeconds(epoch.closedAt ?? epoch.createdAt);

  const payload = {
    advanceDebt: toPayloadInt(epoch.advanceDebtFromPreviousEpoch),
    advancedMinted: toPayloadInt(epoch.advancedMintedAmount),
    baseBudget: toPayloadInt(epoch.baseMintBudget),
    closedAt,
    communityIdHash,
    epochId: epoch.id,
    epochNumber: epoch.epochNumber,
    openingSupply: toPayloadInt(epoch.openingSupply),
    regularMinted: toPayloadInt(epoch.regularMintedAmount),
  };

  const chainArgsHead: readonly (Hex32 | bigint | number)[] = [
    communityIdHash,
    epoch.epochNumber,
    epoch.openingSupply,
    epoch.baseMintBudget,
    epoch.regularMintedAmount,
    epoch.advancedMintedAmount,
    epoch.advanceDebtFromPreviousEpoch,
  ];

  return finalizeBuilt('epoch_summary', payload, chainArgsHead);
}
