/**
 * Business-to-chain integration helpers. Create PublicRecords for key events.
 * Gracefully degrades to DB-only records when blockchain env is not configured.
 */
import { getPrisma } from '@/lib/db/client'
import { canonicalize } from '@/lib/blockchain/hashing/canonicalize'
import { computeRecordHash } from '@/lib/blockchain/hashing/record-hash'
import { hashCommunityId, hashProposalId, hashOptionId } from '@/lib/blockchain/hashing/id-hash'
import type { RecordEnvelope, RecordType } from '@/lib/blockchain/types'

function unixSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000)
}

function toPayloadInt(b: bigint): string {
  return b.toString()
}

/** Check if blockchain env is minimally configured. */
function isChainConfigured(): boolean {
  return !!(process.env.CONTRACT_ADDRESS && process.env.BLOCKCHAIN_PRIVATE_KEY)
}

async function createRecord(params: {
  communityId: string
  recordType: RecordType
  sourceTable: string
  sourceId: string
  envelope: RecordEnvelope
}): Promise<string | null> {
  try {
    const prisma = getPrisma()
    const envelopeJson = canonicalize(params.envelope)
    const recordHash = computeRecordHash(params.envelope)

    const row = await prisma.publicRecord.create({
      data: {
        communityId: params.communityId,
        recordType: params.recordType,
        status: 'pending',
        envelopeJson,
        recordHash,
        sourceTable: params.sourceTable,
        sourceId: params.sourceId,
        chainEligible: isChainConfigured(),
      },
    })
    return row.id
  } catch (e) {
    console.error('[chain/records] Failed to create record:', e)
    return null
  }
}

// ---- Proposal snapshot ----

export async function createProposalSnapshotRecord(proposal: {
  id: string
  communityId: string
  epochNumberSnapshot?: number | null
  totalSupplySnapshot?: bigint | null
  activeGovernanceSupplySnapshot?: bigint | null
  tokenPolicyVersionSnapshot?: number | null
  snapshotAt?: Date | null
  weightsMerkleRoot?: string | null
}): Promise<string | null> {
  const epochNum = proposal.epochNumberSnapshot ?? 0
  const totalSupply = proposal.totalSupplySnapshot ?? 0n
  const activeSupply = proposal.activeGovernanceSupplySnapshot ?? 0n
  const policyVer = proposal.tokenPolicyVersionSnapshot ?? 1
  const snapAt = proposal.snapshotAt ?? new Date()
  const communityIdHash = hashCommunityId(proposal.communityId)

  const payload: Record<string, string | number | boolean> = {
    activeGovernanceSupplySnapshot: toPayloadInt(activeSupply),
    communityIdHash,
    epochNumber: epochNum,
    policyVersion: policyVer,
    proposalId: proposal.id,
    snapshotAt: unixSeconds(snapAt),
    totalSupplySnapshot: toPayloadInt(totalSupply),
  }

  if (proposal.weightsMerkleRoot) {
    payload.weightsMerkleRoot = proposal.weightsMerkleRoot
  }

  const envelope: RecordEnvelope = {
    schema: 'youfen.record.v1',
    type: 'proposal_snapshot',
    payload,
  }

  return createRecord({
    communityId: proposal.communityId,
    recordType: 'proposal_snapshot',
    sourceTable: 'Proposal',
    sourceId: proposal.id,
    envelope,
  })
}

// ---- Proposal result ----

export async function createProposalResultRecord(proposal: {
  id: string
  communityId: string
  endedAt?: Date | null
  winningOptionId?: string | null
  voterCount?: number | null
  totalVoteWeight?: bigint | null
  votesMerkleRoot?: string | null
}): Promise<string | null> {
  const ended = proposal.endedAt ?? new Date()
  const winnerOptionId = proposal.winningOptionId ?? ''
  const vCount = proposal.voterCount ?? 0
  const tWeight = proposal.totalVoteWeight ?? 0n
  const communityIdHash = hashCommunityId(proposal.communityId)
  const winningOptionIdHash = hashOptionId(proposal.id, winnerOptionId)

  const payload: Record<string, string | number | boolean> = {
    communityIdHash,
    endedAt: unixSeconds(ended),
    proposalId: proposal.id,
    totalVoteWeight: toPayloadInt(tWeight),
    voterCount: vCount,
    winningOptionIdHash,
  }

  if (proposal.votesMerkleRoot) {
    payload.votesMerkleRoot = proposal.votesMerkleRoot
  }

  const envelope: RecordEnvelope = {
    schema: 'youfen.record.v1',
    type: 'proposal_result',
    payload,
  }

  return createRecord({
    communityId: proposal.communityId,
    recordType: 'proposal_result',
    sourceTable: 'Proposal',
    sourceId: proposal.id,
    envelope,
  })
}
