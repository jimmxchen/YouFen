import type { Member, Contribution, Proposal, DashboardStats } from '@/types/admin'

/** BigInt → number, safe for admin-display ranges */
function n(v: bigint | null | undefined): number {
  return v != null ? Number(v) : 0
}

function dateStr(d: Date | null | undefined): string {
  return d ? d.toISOString().split('T')[0] : ''
}

// ---- Member ----

type MemberRow = {
  id: string
  displayName: string
  role: string
  contributionCount: number
  tags: string[]
  createdAt: Date
  lastActiveAt: Date
  balance: { totalBalance: bigint } | null
}

export function toAdminMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.displayName,
    email: undefined,
    role: (row.role as Member['role']) ?? 'member',
    voicePower: n(row.balance?.totalBalance),
    contributionCount: row.contributionCount,
    tags: row.tags,
    joinedAt: dateStr(row.createdAt),
    lastActiveAt: dateStr(row.lastActiveAt),
  }
}

// ---- Contribution ----

type ContributionRow = {
  id: string
  memberId: string
  description: string
  type: string | null
  suggestedTokenAmount: bigint
  approvedTokenAmount: bigint | null
  status: string
  aiReason: string | null
  evidence: string[]
  submittedBy: string
  reviewedAt: Date | null
  createdAt: Date
  member: { displayName: string }
}

export function toAdminContribution(row: ContributionRow): Contribution {
  return {
    id: row.id,
    memberId: row.memberId,
    memberName: row.member.displayName,
    description: row.description,
    type: row.type ?? '',
    suggestedVP: n(row.suggestedTokenAmount),
    approvedVP: row.approvedTokenAmount != null ? n(row.approvedTokenAmount) : undefined,
    status: row.status as Contribution['status'],
    aiReason: row.aiReason ?? undefined,
    evidence: row.evidence,
    submittedBy: row.submittedBy,
    createdAt: dateStr(row.createdAt),
    reviewedAt: row.reviewedAt ? dateStr(row.reviewedAt) : undefined,
  }
}

// ---- Proposal ----

interface ProposalAgg {
  proposal: {
    id: string
    title: string
    description: string | null
    status: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: any
    startTime: Date | null
    endTime: Date | null
    createdBy: string | null
    createdAt: Date
    votesMerkleRoot: string | null
  }
  votes: Array<{
    proposalId: string
    memberId: string
    optionId: string
    activeGovernanceBalanceSnapshot: bigint
  }>
  memberCount: number
}

export function toAdminProposal(agg: ProposalAgg): Proposal {
  const { proposal, votes, memberCount } = agg
  const options: Array<{ id: string; text: string; votes: number; voterCount: number }> = []

  const rawOptions = (proposal.options as Array<{ id: string; text: string }> | null) ?? []
  const voteMap = new Map<string, { votes: number; voters: Set<string> }>()
  for (const v of votes) {
    const entry = voteMap.get(v.optionId) ?? { votes: 0, voters: new Set<string>() }
    entry.votes += Number(v.activeGovernanceBalanceSnapshot)
    entry.voters.add(v.memberId)
    voteMap.set(v.optionId, entry)
  }

  for (const opt of rawOptions) {
    const aggVotes = voteMap.get(opt.id)
    options.push({
      id: opt.id,
      text: opt.text,
      votes: aggVotes?.votes ?? 0,
      voterCount: aggVotes?.voters.size ?? 0,
    })
  }

  const totalVP = votes.reduce((sum, v) => sum + Number(v.activeGovernanceBalanceSnapshot), 0)
  const voterIds = new Set(votes.map((v) => v.memberId))

  return {
    id: proposal.id,
    title: proposal.title,
    description: proposal.description ?? '',
    summary: undefined,
    options,
    status: proposal.status as Proposal['status'],
    voteType: 'weighted',
    startTime: proposal.startTime ? dateStr(proposal.startTime) : '',
    endTime: proposal.endTime ? dateStr(proposal.endTime) : '',
    createdBy: proposal.createdBy ?? '',
    createdAt: dateStr(proposal.createdAt),
    totalVotes: options.length,
    totalVP,
    voterCount: voterIds.size,
    totalMembers: memberCount,
    resultHash: proposal.votesMerkleRoot ?? undefined,
    chainTxHash: undefined,
  }
}

// ---- PublicRecord ----

type PublicRecordRow = {
  id: string
  communityId: string
  recordType: string
  status: string
  recordHash: string
  sourceTable: string
  sourceId: string
  txHash: string | null
  blockNumber: number | null
  submittedAt: Date | null
  confirmedAt: Date | null
  lastError: string | null
  supersededByRecordId: string | null
  chainEligible: boolean
  createdAt: Date
}

export interface AdminRecord {
  id: string
  recordType: string
  status: string
  recordHash: string
  txHash: string | null
  blockNumber: number | null
  confirmedAt: string | null
  createdAt: string
}

export function toAdminRecord(row: PublicRecordRow): AdminRecord {
  return {
    id: row.id,
    recordType: row.recordType,
    status: row.status,
    recordHash: row.recordHash,
    txHash: row.txHash,
    blockNumber: row.blockNumber,
    confirmedAt: row.confirmedAt ? dateStr(row.confirmedAt) : null,
    createdAt: dateStr(row.createdAt),
  }
}

// ---- Dashboard ----

export function toAdminDashboardStats(input: {
  members: number
  totalVoicePower: bigint
  activeProposals: number
  todayContributions: number
  trustedRecords: number
  activeTasks: number
  upcomingActivities: number
}): DashboardStats {
  return {
    members: input.members,
    totalVoicePower: n(input.totalVoicePower),
    activeProposals: input.activeProposals,
    todayContributions: input.todayContributions,
    trustedRecords: input.trustedRecords,
    activeTasks: input.activeTasks,
    upcomingActivities: input.upcomingActivities,
  }
}
