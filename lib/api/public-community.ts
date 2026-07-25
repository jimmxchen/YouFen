import { isDatabaseConfigured } from '@/db'
import { getPrisma } from '@/lib/db/client'

export interface PublicCommunityProfile {
  id: string
  slug: string
  name: string
  description: string
  goal: string | null
  stats: {
    members: number
    contributions: number
    trustedRecords: number
  }
  featuredContributors: Array<{
    id: string
    name: string
    role: string
    voicePower: number
  }>
}

const adventureXDemo: PublicCommunityProfile = {
  id: 'adventurex',
  slug: 'adventurex',
  name: 'AdventureX Community',
  description:
    'A public demo community showing contribution-based voice power, member participation, voting, and trusted records.',
  goal: 'Build a transparent community where contributors can see how participation becomes governance power.',
  stats: {
    members: 25,
    contributions: 42,
    trustedRecords: 8,
  },
  featuredContributors: [
    { id: 'm1', name: 'Dan', role: 'owner', voicePower: 800 },
    { id: 'm2', name: 'Alice', role: 'manager', voicePower: 620 },
    { id: 'm3', name: 'Bob', role: 'member', voicePower: 460 },
  ],
}

export async function getPublicCommunityBySlug(slug: string): Promise<PublicCommunityProfile | null> {
  const normalizedSlug = slug.trim().toLowerCase()
  if (!isDatabaseConfigured()) {
    return normalizedSlug === adventureXDemo.slug ? adventureXDemo : null
  }

  const prisma = getPrisma()
  const community = await prisma.community.findUnique({
    where: { slug: normalizedSlug },
    select: { id: true, slug: true, name: true, description: true, goal: true, isPublic: true },
  })

  if (!community || !community.isPublic) return null

  const [memberCount, contributionCount, trustedRecordCount, members, balances] = await Promise.all([
    prisma.member.count({ where: { communityId: community.id } }),
    prisma.contribution.count({ where: { communityId: community.id } }),
    prisma.publicRecord.count({ where: { communityId: community.id } }),
    prisma.member.findMany({
      where: { communityId: community.id },
      orderBy: { contributionCount: 'desc' },
      take: 6,
      select: { id: true, displayName: true, role: true },
    }),
    prisma.memberTokenBalance.findMany({
      where: { communityId: community.id },
      select: { memberId: true, totalBalance: true },
    }),
  ])

  const balanceByMemberId = new Map(balances.map((balance) => [balance.memberId, balance.totalBalance]))
  const featuredContributors = members
    .map((member) => ({
      id: member.id,
      name: member.displayName,
      role: member.role,
      voicePower: Number(balanceByMemberId.get(member.id) ?? 0n),
    }))
    .sort((a, b) => b.voicePower - a.voicePower)

  return {
    id: community.id,
    slug: community.slug,
    name: community.name,
    description: community.description ?? '',
    goal: community.goal,
    stats: {
      members: memberCount,
      contributions: contributionCount,
      trustedRecords: trustedRecordCount,
    },
    featuredContributors,
  }
}
