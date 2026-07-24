import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db/client'
import { getContributions, toAdminContribution } from '@/lib/api/admin'

export async function GET(req: NextRequest) {
  const communityId = req.nextUrl.searchParams.get('communityId') ?? 'adventurex'
  const status = req.nextUrl.searchParams.get('status') ?? undefined
  try {
    const rows = await getContributions(communityId, status)
    const contributions = rows.map(toAdminContribution)
    return NextResponse.json({ contributions })
  } catch (e) {
    console.error('[admin/contributions]', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { communityId, memberId, description, type, suggestedTokenAmount } = await req.json()

    if (!communityId || !memberId || !description) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
    }

    const prisma = getPrisma()
    const contribution = await prisma.contribution.create({
      data: {
        communityId,
        memberId,
        description,
        type: type ?? 'other',
        suggestedTokenAmount: BigInt(suggestedTokenAmount ?? 0),
        status: 'pending',
        submittedBy: 'admin',
      },
    })

    return NextResponse.json({ contribution }, { status: 201 })
  } catch (e) {
    console.error('[admin/contributions] POST', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
