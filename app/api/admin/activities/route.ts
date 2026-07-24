import { NextRequest, NextResponse } from 'next/server'
import { getActivities, createActivity } from '@/lib/api/admin'

export async function GET(req: NextRequest) {
  const communityId = req.nextUrl.searchParams.get('communityId')
  const status = req.nextUrl.searchParams.get('status') ?? undefined
  if (!communityId) return NextResponse.json({ error: 'MISSING_COMMUNITY_ID' }, { status: 400 })
  try {
    const activities = await getActivities(communityId, status)
    return NextResponse.json({ activities })
  } catch (e) {
    console.error('[admin/activities]', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { communityId, title, description, type, location, startTime, endTime, createdBy } = body
    if (!communityId || !title) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
    }
    const activity = await createActivity({
      communityId,
      title,
      description,
      type,
      location,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      createdBy,
    })
    return NextResponse.json({ activity }, { status: 201 })
  } catch (e) {
    console.error('[admin/activities] POST', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
