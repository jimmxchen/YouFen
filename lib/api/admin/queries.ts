// eslint-disable @typescript-eslint/no-explicit-any
import { getPrisma } from '@/lib/db/client'

export async function getMembers(communityId: string) {
  const prisma = getPrisma()
  const [members, balances] = await Promise.all([
    prisma.member.findMany({
      where: { communityId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.memberTokenBalance.findMany({
      where: { communityId },
    }),
  ])
  const balanceMap = new Map(balances.map((b: any) => [b.memberId, b]))
  return members.map((m: any) => ({ ...m, balance: balanceMap.get(m.id) ?? null }))
}

export async function getMemberByUserId(userId: string, communityId: string) {
  const prisma = getPrisma()
  const member = await prisma.member.findFirst({
    where: { userId, communityId },
  })
  if (!member) return null
  const balance = await prisma.memberTokenBalance.findUnique({
    where: { communityId_memberId: { communityId, memberId: member.id } },
  })
  return { ...member, balance }
}

export async function getFirstMemberByUserId(userId: string) {
  const prisma = getPrisma()
  const member = await prisma.member.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })
  if (!member) return null
  const [community, balance] = await Promise.all([
    prisma.community.findUnique({ where: { id: member.communityId } }),
    prisma.memberTokenBalance.findUnique({
      where: { communityId_memberId: { communityId: member.communityId, memberId: member.id } },
    }),
  ])
  return { ...member, community, balance }
}

export async function getMemberById(id: string) {
  const prisma = getPrisma()
  const member = await prisma.member.findUnique({ where: { id } })
  if (!member) return null
  const [balance, contributions] = await Promise.all([
    prisma.memberTokenBalance.findUnique({
      where: { communityId_memberId: { communityId: member.communityId, memberId: id } },
    }),
    prisma.contribution.findMany({
      where: { memberId: id },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  return { ...member, balance: balance ?? null, contributions }
}

export async function updateMember(id: string, data: { voicePower?: number; role?: string }) {
  const prisma = getPrisma()
  const member = await prisma.member.findUnique({ where: { id } })
  if (!member) return null

  if (data.role !== undefined) {
    await prisma.member.update({ where: { id }, data: { role: data.role } })
  }

  if (data.voicePower !== undefined) {
    await prisma.memberTokenBalance.upsert({
      where: { communityId_memberId: { communityId: member.communityId, memberId: id } },
      create: {
        communityId: member.communityId,
        memberId: id,
        totalBalance: BigInt(data.voicePower),
        activeGovernanceBalance: BigInt(data.voicePower),
      },
      update: { totalBalance: BigInt(data.voicePower), activeGovernanceBalance: BigInt(data.voicePower) },
    })
  }

  // Re-fetch with balance
  const [balance, contributions] = await Promise.all([
    prisma.memberTokenBalance.findUnique({
      where: { communityId_memberId: { communityId: member.communityId, memberId: id } },
    }),
    prisma.contribution.findMany({
      where: { memberId: id },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  return { ...member, balance: balance ?? null, contributions }
}

export async function getContributions(communityId: string, status?: string) {
  const prisma = getPrisma()
  const where: Record<string, unknown> = { communityId }
  if (status) where.status = status
  const [contributions, members] = await Promise.all([
    prisma.contribution.findMany({ where, orderBy: { createdAt: 'desc' } }),
    prisma.member.findMany({ where: { communityId } }),
  ])
  const memberMap = new Map(members.map((m: any) => [m.id, m]))
  return contributions.map((c: any) => ({
    ...c,
    member: memberMap.get(c.memberId) ?? { id: c.memberId, displayName: 'Unknown' } as typeof members[0],
  }))
}

export async function getProposals(communityId: string) {
  const prisma = getPrisma()
  const [proposals, memberCount] = await Promise.all([
    prisma.proposal.findMany({
      where: { communityId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.member.count({ where: { communityId } }),
  ])
  const proposalIds = proposals.map((p: any) => p.id)
  const votes = proposalIds.length > 0
    ? await prisma.vote.findMany({ where: { proposalId: { in: proposalIds } } })
    : []

  const voteMap = new Map<string, typeof votes>()
  for (const v of votes) {
    const list = voteMap.get(v.proposalId) ?? []
    list.push(v)
    voteMap.set(v.proposalId, list)
  }

  return proposals.map((proposal: any) => ({
    proposal,
    votes: voteMap.get(proposal.id) ?? [],
    memberCount,
  }))
}

export async function getProposalById(id: string) {
  const prisma = getPrisma()
  const proposal = await prisma.proposal.findUnique({ where: { id } })
  if (!proposal) return null
  const [votes, memberCount] = await Promise.all([
    prisma.vote.findMany({ where: { proposalId: id } }),
    prisma.member.count({ where: { communityId: proposal.communityId } }),
  ])
  return { proposal, votes, memberCount }
}

export async function getRecords(communityId: string) {
  const prisma = getPrisma()
  return prisma.publicRecord.findMany({
    where: { communityId },
    orderBy: { createdAt: 'desc' },
  })
}

// ---- Tasks ----

export async function getTasks(communityId: string, status?: string) {
  const prisma = getPrisma()
  const where: Record<string, unknown> = { communityId }
  if (status) where.status = status
  return prisma.task.findMany({ where, orderBy: { createdAt: 'desc' } })
}

export async function createTask(data: {
  communityId: string
  title: string
  description?: string
  priority?: string
  assigneeId?: string
  assigneeName?: string
  dueDate?: string
  createdBy?: string
}) {
  const prisma = getPrisma()
  return prisma.task.create({ data: { ...data, status: 'pending' } })
}

export async function updateTaskStatus(id: string, status: string) {
  const prisma = getPrisma()
  return prisma.task.update({ where: { id }, data: { status } })
}

// ---- Activities ----

export async function getActivities(communityId: string, status?: string) {
  const prisma = getPrisma()
  const where: Record<string, unknown> = { communityId }
  if (status) where.status = status
  return prisma.activity.findMany({ where, orderBy: { startTime: 'asc' } })
}

export async function createActivity(data: {
  communityId: string
  title: string
  description?: string
  type?: string
  location?: string
  startTime?: Date
  endTime?: Date
  createdBy?: string
}) {
  const prisma = getPrisma()
  return prisma.activity.create({ data: { ...data, status: 'upcoming' } })
}

export async function updateActivityStatus(id: string, status: string) {
  const prisma = getPrisma()
  return prisma.activity.update({ where: { id }, data: { status } })
}

// ---- Proposals ----

export async function createProposal(data: {
  communityId: string
  title: string
  description?: string
  options: Array<{ id: string; text: string }>
  startTime?: Date
  endTime?: Date
  createdBy?: string
}) {
  const prisma = getPrisma()

  const [tokenState, policy] = await Promise.all([
    prisma.communityTokenState.findUnique({ where: { communityId: data.communityId } }),
    prisma.communityTokenPolicy.findUnique({ where: { communityId: data.communityId } }),
  ])

  return prisma.proposal.create({
    data: {
      ...data,
      status: 'active',
      totalSupplySnapshot: tokenState?.currentTotalSupply ?? 0n,
      activeGovernanceSupplySnapshot: tokenState?.currentTotalSupply ?? 0n,
      tokenPolicyVersionSnapshot: policy?.policyVersion ?? 1,
      snapshotAt: new Date(),
    },
  })
}

export async function updateProposalStatus(id: string, status: string) {
  const prisma = getPrisma()
  const data: Record<string, unknown> = { status }
  if (status === 'ended') {
    data.endedAt = new Date()
  }
  return prisma.proposal.update({ where: { id }, data })
}

export async function endProposal(id: string) {
  const prisma = getPrisma()
  const proposal = await prisma.proposal.findUnique({ where: { id } })
  if (!proposal) throw new Error('PROPOSAL_NOT_FOUND')
  if (proposal.status === 'ended') throw new Error('ALREADY_ENDED')

  const votes = await prisma.vote.findMany({ where: { proposalId: id } })
  const voterIds = new Set(votes.map((v) => v.memberId))

  // Count vote weight by option
  const optionWeights = new Map<string, bigint>()
  for (const v of votes) {
    const w = optionWeights.get(v.optionId) ?? 0n
    optionWeights.set(v.optionId, w + v.activeGovernanceBalanceSnapshot)
  }

  let winningOptionId: string | null = null
  let maxWeight = 0n
  for (const [opt, w] of optionWeights) {
    if (w > maxWeight) { maxWeight = w; winningOptionId = opt }
  }

  const totalVoteWeight = votes.reduce((s, v) => s + v.activeGovernanceBalanceSnapshot, 0n)

  return prisma.proposal.update({
    where: { id },
    data: {
      status: 'ended',
      endedAt: new Date(),
      voterCount: voterIds.size,
      totalVoteWeight,
      winningOptionId,
    },
  })
}

export async function getDashboardStats(communityId: string) {
  const prisma = getPrisma()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [members, totalVoicePower, activeProposals, todayContributions, trustedRecords, activeTasks, upcomingActivities] =
    await Promise.all([
      prisma.member.count({ where: { communityId } }),
      prisma.memberTokenBalance.aggregate({
        where: { communityId },
        _sum: { totalBalance: true },
      }),
      prisma.proposal.count({ where: { communityId, status: 'active' } }),
      prisma.contribution.count({
        where: { communityId, createdAt: { gte: todayStart } },
      }),
      prisma.publicRecord.count({
        where: { communityId, status: 'verified' },
      }),
      prisma.task.count({ where: { communityId, status: { in: ['pending', 'inProgress'] } } }),
      prisma.activity.count({ where: { communityId, status: 'upcoming' } }),
    ])

  return {
    members,
    totalVoicePower: totalVoicePower._sum.totalBalance ?? 0n,
    activeProposals,
    todayContributions,
    trustedRecords,
    activeTasks,
    upcomingActivities,
  }
}
