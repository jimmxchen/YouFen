// Projection fold (docs/BLOCKCHAIN-DESIGN-v0.7.md §3/§7). Applies ONE decoded
// on-chain event to the DB projections inside a transaction. This is the only
// place confirmed balances change, and it runs only for events the indexer has
// read back from the chain — never from an API command path.
//
// Two guards make it safe to replay (retry / rebuild-from-scratch):
//   * idempotency — a ChainEvent row keyed by (txHash, logIndex); once
//     `appliedAt` is set the event is skipped.
//   * fresher-wins — MintExecuted/ReversalExecuted carry the ABSOLUTE post-state
//     (memberBalanceAfter / totalSupplyAfter) and the monotonic govSeqAfter as
//     `ledgerSeq`; a lower-seq event can never overwrite a fresher balance.
//
// NOTE: CommunityTokenState.currentTotalSupply is a v0.6 BigInt column (int64);
// it holds demo-scale supply. Real uint256-scale supply needs a Decimal(78,0)
// migration of that model (tracked in the design doc). Per-member balances
// already use MemberChainBalance.balance (Decimal(78,0)).

import type { Prisma } from '@prisma/client';

import type { DecodedChainEvent } from './event-decoder';

export type ApplyOutcome = 'applied' | 'skipped';

const CHAIN_ACTION_LOCKED: string[] = ['verified', 'superseded', 'reverted'];

/** Apply a single decoded event to the projections. Idempotent. */
export async function applyEvent(
  tx: Prisma.TransactionClient,
  event: DecodedChainEvent,
): Promise<ApplyOutcome> {
  const key = { txHash_logIndex: { txHash: event.txHash, logIndex: event.logIndex } };
  const existing = await tx.chainEvent.findUnique({ where: key });
  if (existing?.appliedAt) return 'skipped';

  if (!existing) {
    await tx.chainEvent.create({
      data: {
        communityId: event.communityId ?? '',
        eventName: event.eventName,
        blockNumber: event.blockNumber,
        logIndex: event.logIndex,
        txHash: event.txHash,
        recordHash: event.recordHash,
        memberIdHash: event.memberIdHash,
        proposalId: event.proposalId,
        ledgerSeq: event.ledgerSeq,
        args: event.args as Prisma.InputJsonValue,
      },
    });
  }

  switch (event.eventName) {
    case 'MintExecuted':
      await applyBalanceEvent(tx, event, /*isReversal*/ false);
      break;
    case 'ReversalExecuted':
      await applyBalanceEvent(tx, event, /*isReversal*/ true);
      break;
    case 'MemberEnrolled':
      await applyEnroll(tx, event);
      break;
    case 'MemberKeyRotated':
      await applyRotate(tx, event);
      break;
    case 'ProposalExecuted':
      await applyProposalExecuted(tx, event);
      break;
    default:
      // CommunityCreated / ApproverSet / EpochRolled / Policy* / Proposal(Created|Finalized)
      // / VoteCast / Paused / Unpaused are recorded as ChainEvent rows and folded
      // by higher-level projections derived from those logs (or are read-through).
      break;
  }

  await tx.chainEvent.update({ where: key, data: { appliedAt: new Date() } });
  return 'applied';
}

async function applyBalanceEvent(
  tx: Prisma.TransactionClient,
  e: DecodedChainEvent,
  isReversal: boolean,
): Promise<void> {
  const communityId = e.communityId;
  const memberIdHash = e.memberIdHash;
  if (communityId === null || memberIdHash === null) return;

  const seq = e.ledgerSeq ?? 0n;
  const balanceAfter = String(e.args.memberBalanceAfter ?? '0');
  const supplyAfter = String(e.args.totalSupplyAfter ?? '0');

  // per-member balance — fresher-wins on absolute post-state
  const mb = await tx.memberChainBalance.findUnique({
    where: { communityId_memberIdHash: { communityId, memberIdHash } },
  });
  if (mb === null) {
    await tx.memberChainBalance.create({
      data: { communityId, memberIdHash, balance: balanceAfter, ledgerSeq: seq },
    });
  } else if (seq > mb.ledgerSeq) {
    await tx.memberChainBalance.update({
      where: { id: mb.id },
      data: { balance: balanceAfter, ledgerSeq: seq },
    });
  }

  // community supply — fresher-wins
  const cs = await tx.communityTokenState.findUnique({ where: { communityId } });
  if (cs === null) {
    await tx.communityTokenState.create({
      data: { communityId, currentTotalSupply: BigInt(supplyAfter), ledgerSeq: seq },
    });
  } else if (seq > cs.ledgerSeq) {
    await tx.communityTokenState.update({
      where: { communityId },
      data: { currentTotalSupply: BigInt(supplyAfter), ledgerSeq: seq },
    });
  }

  // per-epoch regular-mint counter (mint only; increment is idempotent under the appliedAt guard)
  if (!isReversal) {
    const epochNumber = Number(e.args.epochNumber ?? 0);
    const regular = String(e.args.regularAmount ?? '0');
    await tx.memberEpochMintCounter.upsert({
      where: { communityId_memberIdHash_epochNumber: { communityId, memberIdHash, epochNumber } },
      create: { communityId, memberIdHash, epochNumber, regularMinted: regular },
      update: { regularMinted: { increment: regular } },
    });
  }

  // mark the driving ChainAction + PublicRecord verified (matched by recordHash)
  if (e.recordHash !== null) {
    await tx.chainAction.updateMany({
      where: { recordHash: e.recordHash, status: { notIn: CHAIN_ACTION_LOCKED as never } },
      data: { status: 'verified' },
    });
    await tx.publicRecord.updateMany({
      where: { recordHash: e.recordHash },
      data: { status: 'verified', blockNumber: e.blockNumber, confirmedAt: new Date() },
    });
  }
}

async function applyEnroll(tx: Prisma.TransactionClient, e: DecodedChainEvent): Promise<void> {
  const communityId = e.communityId;
  const memberIdHash = e.memberIdHash;
  if (communityId === null || memberIdHash === null) return;
  const signerAddress = String(e.args.signerAddress ?? '');
  await tx.memberSigner.upsert({
    where: { communityId_memberIdHash: { communityId, memberIdHash } },
    create: { communityId, memberId: '', memberIdHash, signerAddress, status: 'active', enrolledAt: new Date(), txHash: e.txHash },
    update: { signerAddress, status: 'active', enrolledAt: new Date(), txHash: e.txHash },
  });
}

async function applyRotate(tx: Prisma.TransactionClient, e: DecodedChainEvent): Promise<void> {
  const communityId = e.communityId;
  const memberIdHash = e.memberIdHash;
  if (communityId === null || memberIdHash === null) return;
  const newAddr = String(e.args.newAddr ?? '');
  await tx.memberSigner.updateMany({
    where: { communityId, memberIdHash },
    data: { signerAddress: newAddr, txHash: e.txHash },
  });
}

async function applyProposalExecuted(tx: Prisma.TransactionClient, e: DecodedChainEvent): Promise<void> {
  const proposalId = e.proposalId;
  if (proposalId === null) return;
  await tx.proposalExecution.upsert({
    where: { proposalId },
    create: { communityId: e.communityId ?? '', proposalId, kind: String(e.args.kind ?? ''), approved: true, executedAt: new Date(), txHash: e.txHash },
    update: { executedAt: new Date(), txHash: e.txHash },
  });
}
