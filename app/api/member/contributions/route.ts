import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getPrisma } from '@/lib/db/client'

export async function POST(req: NextRequest) {
  const userId = await getSession()
  if (!userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  try {
    const { communityId, title, description, type, evidence, proofLink } = await req.json()

    if (!communityId || !title || !description) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
    }

    const prisma = getPrisma()

    const member = await prisma.member.findFirst({
      where: { userId, communityId },
    })

    if (!member) {
      return NextResponse.json({ error: 'MEMBER_NOT_FOUND' }, { status: 404 })
    }

    const contribution = await prisma.contribution.create({
      data: {
        communityId,
        memberId: member.id,
        description: title,
        type: type ?? 'other',
        suggestedTokenAmount: 0n,
        status: 'pending',
        submittedBy: userId,
        evidence: proofLink ? [proofLink] : [],
      },
    })

    return NextResponse.json({ contribution: { id: contribution.id } }, { status: 201 })
  } catch (e) {
    console.error('[member/contributions]', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const userId = await getSession()
  if (!userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const communityId = req.nextUrl.searchParams.get('communityId')
  if (!communityId) {
    return NextResponse.json({ error: 'MISSING_COMMUNITY_ID' }, { status: 400 })
  }

  try {
    const prisma = getPrisma()

    const member = await prisma.member.findFirst({
      where: { userId, communityId },
    })

    if (!member) {
      return NextResponse.json({ contributions: [] })
    }

    const contributions = await prisma.contribution.findMany({
      where: { memberId: member.id, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      contributions: contributions.map((c) => ({
        id: c.id,
        title: c.description,
        type: c.type,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
      })),
    })
  } catch (e) {
    console.error('[member/contributions]', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
