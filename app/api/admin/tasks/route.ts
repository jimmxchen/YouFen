import { NextRequest, NextResponse } from 'next/server'
import { getTasks, createTask } from '@/lib/api/admin'

export async function GET(req: NextRequest) {
  const communityId = req.nextUrl.searchParams.get('communityId')
  const status = req.nextUrl.searchParams.get('status') ?? undefined
  if (!communityId) return NextResponse.json({ error: 'MISSING_COMMUNITY_ID' }, { status: 400 })
  try {
    const tasks = await getTasks(communityId, status)
    return NextResponse.json({ tasks })
  } catch (e) {
    console.error('[admin/tasks]', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { communityId, title, description, priority, assigneeId, assigneeName, dueDate, createdBy } = body
    if (!communityId || !title) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
    }
    const task = await createTask({ communityId, title, description, priority, assigneeId, assigneeName, dueDate, createdBy })
    return NextResponse.json({ task }, { status: 201 })
  } catch (e) {
    console.error('[admin/tasks] POST', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
