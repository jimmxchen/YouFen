import { NextRequest, NextResponse } from 'next/server'
import { getRecords, toAdminRecord } from '@/lib/api/admin'

export async function GET(req: NextRequest) {
  const communityId = req.nextUrl.searchParams.get('communityId') ?? 'adventurex'
  try {
    const rows = await getRecords(communityId)
    const records = rows.map(toAdminRecord)
    return NextResponse.json({ records })
  } catch (e) {
    console.error('[admin/records]', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
