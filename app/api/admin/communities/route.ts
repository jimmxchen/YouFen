import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import { getPrisma } from '@/lib/db/client'

export async function POST(req: NextRequest) {
  const userId = await getSession()
  if (!userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  let body: {
    name?: string; slug?: string; description?: string; goal?: string
    inflationRateBps?: number; advanceRateBps?: number; memberCapRateBps?: number
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

  try {
    const prisma = getPrisma()

    // Fetch the user's actual name from the users table
    const userRows = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const displayName = userRows[0]?.name || userId

    const community = await prisma.community.create({
      data: {
        name,
        slug,
        description: body.description?.trim() || null,
        goal: body.goal?.trim() || null,
        ownerId: userId,
      },
      select: { id: true, slug: true, name: true },
    })

    await prisma.member.create({
      data: {
        communityId: community.id,
        userId,
        displayName,
        role: 'owner',
      },
    })

    await prisma.communityTokenPolicy.create({
      data: {
        communityId: community.id,
        tokenName: `${name} Token`,
        tokenSymbol: slug.toUpperCase().slice(0, 8),
        initialSupply: 0n,
        currentTotalSupply: 0n,
        epochDurationDays: 30,
        monthlyInflationRateBps: body.inflationRateBps ?? 500,
        maxAdvanceRateBps: body.advanceRateBps ?? 2500,
        memberMintCapRateBps: body.memberCapRateBps ?? 1000,
        policyVersion: 1,
        effectiveEpoch: 1,
      },
    })

    await prisma.communityTokenState.create({
      data: {
        communityId: community.id,
        currentTotalSupply: 0n,
        ledgerSeq: 0n,
      },
    })

    return NextResponse.json({ community }, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002' || e?.code === '23505') {
      return NextResponse.json({ error: 'SLUG_TAKEN' }, { status: 409 })
    }
    console.error('[admin/communities]', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
