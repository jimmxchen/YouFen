import { getPrisma } from '@/lib/db/client'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import type { CommunityMember, CommunityStats, MemberVoicePower, MemberActivityItem, FeaturedContributor } from '@/types/member'
import type { MemberProposal, MemberProposalOption } from '@/types/proposal'
import type { ContributionTokenEvent, TokenReceipt } from '@/types/token'

export async function getMemberProfile(userId: string, communityId: string): Promise<CommunityMember> {
  const prisma = getPrisma()

  // Member + community + balance in parallel
  const [member, community, balance] = await Promise.all([
    prisma.member.findFirst({
      where: { userId, communityId },
    }),
    prisma.community.findUnique({
      where: { id: communityId },
      select: { id: true, name: true, slug: true, description: true },
    }),
    prisma.memberTokenBalance.findUnique({
      where: { communityId_memberId: { communityId, memberId: '' } },
    }).catch(() => null), // memberId unknown yet
  ])

  if (!member || !community) {
    throw new Error('MEMBER_NOT_FOUND')
  }

  // Real balance
  const realBalance = await prisma.memberTokenBalance.findUnique({
    where: { communityId_memberId: { communityId, memberId: member.id } },
  })

  // Real stats
  const [memberCount, activeProposals, todayContributions, trustedRecords] = await Promise.all([
    prisma.member.count({ where: { communityId } }).catch(() => 0),
    prisma.proposal.count({ where: { communityId, status: 'active' } }).catch(() => 0),
    prisma.contribution.count({
      where: {
        communityId,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }).catch(() => 0),
    prisma.publicRecord.count({
      where: { communityId, status: 'verified' },
    }).catch(() => 0),
  ])

  // Real user name
  const userRows = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  const realName = userRows[0]?.name || member.displayName

  const totalBalance = realBalance ? Number(realBalance.totalBalance) : 0
  const activeBalance = realBalance ? Number(realBalance.activeGovernanceBalance) : 0
  const pendingBalance = realBalance ? Number(realBalance.pendingGovernanceBalance) : 0
  const earnedThisMonth = realBalance ? Number(realBalance.tokensEarnedCurrentEpoch) : 0

  const voicePower: MemberVoicePower = {
    total: totalBalance,
    active: activeBalance,
    pending: pendingBalance,
    rankPercent: 0,
    earnedThisMonth,
  }

  const stats: CommunityStats = {
    members: memberCount,
    activeProposals,
    contributionsThisWeek: todayContributions,
    trustedRecords,
  }

  const initials = realName
    .split(/\s+/)
    .map((s) => s[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const availableProposals = await fetchMemberProposals(communityId, member.id)

  // Fetch all missing data in parallel
  const [
    contributionRows,
    recordRows,
    topBalances,
    higherRankedCount,
    totalWithBalance,
    upcomingEvent,
    latestAnnouncement,
  ] = await Promise.all([
    prisma.contribution.findMany({
      where: { memberId: member.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }).catch(() => []),
    prisma.publicRecord.findMany({
      where: { communityId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }).catch(() => []),
    prisma.memberTokenBalance.findMany({
      where: { communityId },
      orderBy: { totalBalance: 'desc' },
      take: 10,
    }).catch(() => []),
    realBalance
      ? prisma.memberTokenBalance.count({
          where: { communityId, totalBalance: { gt: realBalance.totalBalance } },
        }).catch(() => 0)
      : Promise.resolve(0),
    prisma.memberTokenBalance.count({
      where: { communityId, totalBalance: { gt: 0n } },
    }).catch(() => 0),
    prisma.activity.findFirst({
      where: { communityId, status: 'upcoming' },
      orderBy: { startTime: 'asc' },
    }).catch(() => null),
    prisma.activity.findFirst({
      where: { communityId },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null),
  ])

  // Build contributions
  const contributions: ContributionTokenEvent[] = contributionRows.map((c) => ({
    id: c.id,
    title: c.description?.slice(0, 60) ?? '',
    description: c.description ?? '',
    amount: Number(c.approvedTokenAmount ?? c.suggestedTokenAmount ?? 0n),
    status: c.status as 'approved' | 'pending' | 'rejected',
    activationStatus: (c.status === 'approved' ? 'active' : 'pending') as 'active' | 'pending',
    approvedBy: c.reviewedBy ?? undefined,
    createdAt: c.createdAt.toISOString(),
  }))

  // Build receipts
  const receipts: TokenReceipt[] = recordRows.map((r) => ({
    id: r.id,
    title: `${r.recordType}: ${r.sourceTable ?? ''}#${r.sourceId ?? ''}`,
    type: r.recordType as TokenReceipt['type'],
    status: (r.status === 'verified' ? 'verified' : r.status === 'failed' ? 'failed' : 'pending') as TokenReceipt['status'],
    network: 'Injective Testnet',
    txHash: r.txHash ?? undefined,
    explorerUrl: r.txHash ? `https://testnet-explorer.injective.network/tx/${r.txHash}` : undefined,
    blockHeight: r.blockNumber != null ? String(r.blockNumber) : undefined,
    createdAt: r.createdAt.toISOString(),
  }))

  // Build featured contributors (need member names)
  const topBalanceMemberIds = topBalances.map((b) => b.memberId)
  const topMembers = topBalanceMemberIds.length > 0
    ? await prisma.member.findMany({
        where: { id: { in: topBalanceMemberIds } },
        select: { id: true, displayName: true, role: true },
      }).catch(() => [])
    : []
  const memberMap = new Map(topMembers.map((m) => [m.id, m]))

  const featuredContributors: FeaturedContributor[] = topBalances.map((b) => ({
    name: memberMap.get(b.memberId)?.displayName ?? 'Member',
    role: memberMap.get(b.memberId)?.role ?? 'member',
    voicePower: Number(b.totalBalance),
  }))

  // Calculate rank
  const rankPercent = totalWithBalance > 0
    ? Math.round((higherRankedCount / totalWithBalance) * 100)
    : 0
  voicePower.rankPercent = rankPercent

  // Build activity feed
  const activityFeed: MemberActivityItem[] = [
    ...contributionRows.slice(0, 10).map((c) => ({
      id: `c-${c.id}`,
      type: 'contribution' as const,
      title: c.description?.slice(0, 60) ?? 'Contribution',
      description: c.status === 'approved' ? 'Approved' : c.status === 'rejected' ? 'Rejected' : 'Pending review',
      createdAt: c.createdAt.toISOString(),
      status: (c.status === 'approved' ? 'approved' : undefined) as MemberActivityItem['status'],
    })),
    ...recordRows.slice(0, 5).filter((r) => r.status === 'verified').map((r) => ({
      id: `r-${r.id}`,
      type: 'record' as const,
      title: `${r.recordType}`,
      description: r.txHash ? `Tx: ${r.txHash.slice(0, 10)}...` : 'On-chain record',
      createdAt: r.createdAt.toISOString(),
      status: 'verified' as MemberActivityItem['status'],
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20)

  return {
    id: member.id,
    name: realName,
    role: member.role,
    tags: member.tags || [],
    avatarInitials: initials || '?',
    communityId: community.id,
    communityName: community.name,
    communityDescription: community.description || '',
    voicePower,
    stats,
    announcement: latestAnnouncement
      ? {
          title: latestAnnouncement.title,
          body: latestAnnouncement.description ?? '',
          createdAt: latestAnnouncement.createdAt.toISOString(),
        }
      : { title: '', body: '', createdAt: '' },
    nextEvent: upcomingEvent
      ? {
          title: upcomingEvent.title,
          description: upcomingEvent.description ?? '',
          startsAt: upcomingEvent.startTime?.toISOString() ?? '',
          location: upcomingEvent.location ?? '',
          status: 'open' as const,
        }
      : { title: '', description: '', startsAt: '', location: '', status: 'open' as const },
    activity: activityFeed,
    chatMessages: [],
    chatRooms: [],
    featuredContributors,
    contributions,
    availableProposals,
    receipts,
  }
}

async function fetchMemberProposals(communityId: string, memberId: string): Promise<MemberProposal[]> {
  const prisma = getPrisma()
  const proposals = await prisma.proposal.findMany({
    where: { communityId },
    orderBy: { createdAt: 'desc' },
  })

  if (proposals.length === 0) return []

  const proposalIds = proposals.map((p) => p.id)
  const [allVotes, memberVotes, snapshots] = await Promise.all([
    prisma.vote.findMany({ where: { proposalId: { in: proposalIds } } }),
    prisma.vote.findMany({ where: { proposalId: { in: proposalIds }, memberId } }),
    prisma.proposalMemberSnapshot.findMany({ where: { proposalId: { in: proposalIds }, memberId } }),
  ])

  const voteMap = new Map<string, Array<{ optionId: string; memberId: string; activeGovernanceBalanceSnapshot: bigint }>>()
  for (const v of allVotes) {
    const list = voteMap.get(v.proposalId) ?? []
    list.push(v)
    voteMap.set(v.proposalId, list)
  }

  const memberVoteMap = new Map(memberVotes.map((v) => [v.proposalId, v]))
  const snapshotMap = new Map(snapshots.map((s) => [s.proposalId, s]))

  return proposals.map((p) => {
    const votes = voteMap.get(p.id) ?? []
    const voterIds = new Set(votes.map((v) => v.memberId))
    const memberVote = memberVoteMap.get(p.id)
    const snapshot = snapshotMap.get(p.id)

    const rawOptions = (p.options as Array<{ id: string; text: string }> | null) ?? []
    const voteCountMap = new Map<string, number>()
    for (const v of votes) {
      voteCountMap.set(v.optionId, (voteCountMap.get(v.optionId) ?? 0) + 1)
    }

    const options: MemberProposalOption[] = rawOptions.map((opt) => ({
      id: opt.id,
      text: opt.text,
      votes: voteCountMap.get(opt.id) ?? 0,
    }))

    const now = new Date()
    const endTime = p.endTime ? new Date(p.endTime) : null
    let status: MemberProposal['status'] = 'upcoming'
    if (p.status === 'ended' || (endTime && endTime < now)) {
      status = 'ended'
    } else if (p.status === 'active') {
      status = 'active'
    }

    return {
      id: p.id,
      title: p.title,
      description: p.description ?? '',
      status,
      endsAt: p.endTime ? p.endTime.toISOString() : '',
      snapshotWeight: snapshot ? Number(snapshot.activeGovernanceToken) : 0,
      voterCount: voterIds.size,
      href: `/vote/${p.id}`,
      options,
      votedOptionId: memberVote?.optionId,
    }
  })
}
