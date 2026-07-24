import { NextRequest, NextResponse } from 'next/server'
import { getDashboardStats, toAdminDashboardStats } from '@/lib/api/admin'

export async function GET(req: NextRequest) {
  const communityId = req.nextUrl.searchParams.get('communityId') ?? 'adventurex'
  try {
    const stats = await getDashboardStats(communityId)
    return NextResponse.json({ stats: toAdminDashboardStats(stats) })
  } catch (e) {
    console.error('[admin/dashboard]', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
