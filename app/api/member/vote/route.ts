import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getPrisma } from '@/lib/db/client'

export async function POST(req: NextRequest) {
  const userId = await getSession()
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  let body: { communityId?: string; proposalId?: string; optionId?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const { communityId, proposalId, optionId } = body
  if (!communityId || !proposalId || !optionId) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
  }

  try {
    const prisma = getPrisma()

    const member = await prisma.member.findFirst({
      where: { userId, communityId },
    })
    if (!member) return NextResponse.json({ error: 'MEMBER_NOT_FOUND' }, { status: 404 })

    const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } })
    if (!proposal) return NextResponse.json({ error: 'PROPOSAL_NOT_FOUND' }, { status: 404 })
    if (proposal.status !== 'active') {
      return NextResponse.json({ error: 'PROPOSAL_NOT_ACTIVE' }, { status: 400 })
    }

    const existing = await prisma.vote.findUnique({
      where: { proposalId_memberId: { proposalId, memberId: member.id } },
    })
    if (existing) return NextResponse.json({ error: 'ALREADY_VOTED' }, { status: 409 })

    // Validate option belongs to proposal
    const rawOptions = (proposal.options as Array<{ id: string; text: string }> | null) ?? []
    if (!rawOptions.some((o) => o.id === optionId)) {
      return NextResponse.json({ error: 'INVALID_OPTION' }, { status: 400 })
    }

    // Snapshot balances
    const [balance, tokenState] = await Promise.all([
      prisma.memberTokenBalance.findUnique({
        where: { communityId_memberId: { communityId, memberId: member.id } },
      }),
      prisma.communityTokenState.findUnique({ where: { communityId } }),
    ])

    const totalBalance = balance?.totalBalance ?? 0n
    const activeGovBalance = balance?.activeGovernanceBalance ?? 0n
    const totalSupply = tokenState?.currentTotalSupply ?? 0n
    const govPct = totalSupply > 0n ? Number(activeGovBalance) / Number(totalSupply) : 0

    // Create vote + snapshot in a transaction
    const [vote] = await Promise.all([
      prisma.vote.create({
        data: {
          proposalId,
          memberId: member.id,
          optionId,
          totalTokenBalanceSnapshot: totalBalance,
          activeGovernanceBalanceSnapshot: activeGovBalance,
          totalSupplySnapshot: totalSupply,
          governancePercentageSnapshot: govPct,
        },
      }),
      prisma.proposalMemberSnapshot.upsert({
        where: { proposalId_memberId: { proposalId, memberId: member.id } },
        create: {
          proposalId,
          memberId: member.id,
          activeGovernanceToken: activeGovBalance,
        },
        update: { activeGovernanceToken: activeGovBalance },
      }),
    ])

    return NextResponse.json({
      vote: {
        id: vote.id,
        proposalId: vote.proposalId,
        memberId: vote.memberId,
        optionId: vote.optionId,
        totalTokenBalanceSnapshot: Number(vote.totalTokenBalanceSnapshot),
        activeGovernanceBalanceSnapshot: Number(vote.activeGovernanceBalanceSnapshot),
        totalSupplySnapshot: Number(vote.totalSupplySnapshot),
        governancePercentageSnapshot: vote.governancePercentageSnapshot,
      },
    }, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'ALREADY_VOTED' }, { status: 409 })
    }
    console.error('[member/vote] POST', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
