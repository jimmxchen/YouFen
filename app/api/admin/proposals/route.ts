import { NextRequest, NextResponse } from 'next/server'
import { getProposals, toAdminProposal, createProposal } from '@/lib/api/admin'
import { createProposalSnapshotRecord } from '@/lib/api/chain/records'

export async function GET(req: NextRequest) {
  const communityId = req.nextUrl.searchParams.get('communityId') ?? 'adventurex'
  try {
    const aggs = await getProposals(communityId)
    const proposals = aggs.map(toAdminProposal)
    return NextResponse.json({ proposals })
  } catch (e) {
    console.error('[admin/proposals]', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { communityId, title, description, options, startTime, endTime, createdBy } = body
    if (!communityId || !title || !options?.length) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
    }
    const proposal = await createProposal({
      communityId,
      title,
      description,
      options: options.map((text: string, i: number) => ({ id: `opt-${i}`, text })),
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      createdBy,
    })

    // Create on-chain snapshot record (non-blocking)
    createProposalSnapshotRecord(proposal).catch((e) =>
      console.error('[admin/proposals] snapshot record failed:', e),
    )

    return NextResponse.json({ proposal }, { status: 201 })
  } catch (e) {
    console.error('[admin/proposals] POST', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
