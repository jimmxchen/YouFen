import { NextRequest, NextResponse } from 'next/server'
import { getProposalById, toAdminProposal, updateProposalStatus, endProposal } from '@/lib/api/admin'
import { createProposalResultRecord } from '@/lib/api/chain/records'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const agg = await getProposalById(id)
    if (!agg) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ proposal: toAdminProposal(agg) })
  } catch (e) {
    console.error('[admin/proposals/[id]]', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const body = await req.json()
    const { status } = body
    if (!status) return NextResponse.json({ error: 'MISSING_STATUS' }, { status: 400 })

    if (status === 'ended') {
      const proposal = await endProposal(id)

      // Create on-chain result record (non-blocking)
      createProposalResultRecord(proposal).catch((e) =>
        console.error('[admin/proposals/[id]] result record failed:', e),
      )

      return NextResponse.json({ proposal })
    }

    const proposal = await updateProposalStatus(id, status)
    return NextResponse.json({ proposal })
  } catch (e) {
    console.error('[admin/proposals/[id]] PATCH', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
