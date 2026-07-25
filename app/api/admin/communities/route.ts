import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import { getPrisma } from '@/lib/db/client'

/** PRD §13: 初始总供应量默认 10,000 */
const DEFAULT_INITIAL_SUPPLY = 10_000

export async function POST(req: NextRequest) {
  const userId = await getSession()
  if (!userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  let body: {
    name?: string; slug?: string; description?: string; goal?: string
    inflationRateBps?: number; advanceRateBps?: number; memberCapRateBps?: number
    initialSupply?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) {
    return NextResponse.json({ error: 'NAME_REQUIRED' }, { status: 400 })
  }

  const slug = (body.slug?.trim() || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')).slice(0, 64)

  if (!slug) {
    return NextResponse.json({ error: 'INVALID_SLUG' }, { status: 400 })
  }

  const initialSupply = Math.max(1, body.initialSupply ?? DEFAULT_INITIAL_SUPPLY)
  const inflationRateBps = body.inflationRateBps ?? 500   // 5%
  const advanceRateBps = body.advanceRateBps ?? 2500       // 25%
  const memberCapRateBps = body.memberCapRateBps ?? 1000   // 10%

  try {
    const prisma = getPrisma()

    // Fetch the user's actual name from the users table
    const userRows = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const displayName = userRows[0]?.name || userId

    /**
     * PRD §7.2 初始 Token 分配:
     * 社区创建时必须:
     *   - 明确每位成员获得数量
     *   - 生成初始分配记录 (TokenMintEvent / INITIAL_ALLOCATION)
     *   - 创建初始 Epoch
     *
     * 整个创建流程放在一个事务内原子完成。
     */
    const result = await prisma.$transaction(async (tx) => {
      // 1. 创建社区
      const community = await tx.community.create({
        data: {
          name,
          slug,
          description: body.description?.trim() || null,
          goal: body.goal?.trim() || null,
          ownerId: userId,
        },
        select: { id: true, slug: true, name: true },
      })

      // 2. 创建创建者为 owner 成员
      const member = await tx.member.create({
        data: {
          communityId: community.id,
          userId,
          displayName,
          role: 'owner',
        },
      })

      // 3. 创建 Token 政策 (PRD §13.1)
      await tx.communityTokenPolicy.create({
        data: {
          communityId: community.id,
          tokenName: `${name} Token`,
          tokenSymbol: slug.toUpperCase().slice(0, 8),
          initialSupply: BigInt(initialSupply),
          currentTotalSupply: BigInt(initialSupply),
          epochDurationDays: 30,
          monthlyInflationRateBps: inflationRateBps,
          maxAdvanceRateBps: advanceRateBps,
          memberMintCapRateBps: memberCapRateBps,
          policyVersion: 1,
          effectiveEpoch: 1,
        },
      })

      // 4. 创建供应量状态行 (规则与状态分离, ARCHITECTURE.md §3.2)
      await tx.communityTokenState.create({
        data: {
          communityId: community.id,
          currentTotalSupply: BigInt(initialSupply),
          ledgerSeq: 1n, // 初始分配占序号 1
        },
      })

      // 5. 计算 Epoch 1 预算 (PRD §25.1-25.3)
      const openingSupply = BigInt(initialSupply)
      const baseMintBudget = BigInt(
        Math.floor(initialSupply * inflationRateBps / 10_000)
      )
      const maxAdvanceAmount = BigInt(
        Math.floor(Number(baseMintBudget) * advanceRateBps / 10_000)
      )

      // 6. 创建 Epoch 1 (ACTIVE)
      const now = new Date()
      const epochEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      const epoch = await tx.tokenEpoch.create({
        data: {
          communityId: community.id,
          epochNumber: 1,
          openingSupply,
          inflationRateBps,
          baseMintBudget,
          advanceDebtFromPreviousEpoch: 0n,
          effectiveRegularBudget: baseMintBudget,
          maxAdvanceAmount,
          regularMintedAmount: 0n,
          advancedMintedAmount: 0n,
          unusedRegularBudget: 0n,
          status: 'active',
          startTime: now,
          endTime: epochEnd,
        },
      })

      // 7. 创建创建者的 Token 余额 (PRD §24.3)
      await tx.memberTokenBalance.create({
        data: {
          communityId: community.id,
          memberId: member.id,
          totalBalance: openingSupply,
          activeGovernanceBalance: openingSupply,
          pendingGovernanceBalance: 0n,
          tokensEarnedCurrentEpoch: openingSupply,
          tokensEarnedLifetime: openingSupply,
          tokensReversedLifetime: 0n,
          lastMintAt: now,
        },
      })

      // 8. 创建初始分配账本事件 (PRD §7.2, §24.4)
      await tx.tokenMintEvent.create({
        data: {
          communityId: community.id,
          memberId: member.id,
          epochId: epoch.id,
          epochNumber: 1,
          mintType: 'initial_allocation',
          budgetSource: 'current_epoch',
          amount: openingSupply,
          governanceStatus: 'active',
          memberBalanceBefore: 0n,
          memberBalanceAfter: openingSupply,
          totalSupplyBefore: 0n,
          totalSupplyAfter: openingSupply,
          tokenPolicyVersion: 1,
          reason: 'Initial community allocation',
          approvedBy: userId,
          ledgerSeq: 1,
        },
      })

      return community
    })

    return NextResponse.json({ community: result }, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002' || e?.code === '23505') {
      return NextResponse.json({ error: 'SLUG_TAKEN' }, { status: 409 })
    }
    console.error('[admin/communities]', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
