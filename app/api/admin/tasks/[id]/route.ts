import { NextRequest, NextResponse } from 'next/server'
import { updateTaskStatus } from '@/lib/api/admin'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const body = await req.json()
    const { status } = body
    if (!status) return NextResponse.json({ error: 'MISSING_STATUS' }, { status: 400 })
    const task = await updateTaskStatus(id, status)
    return NextResponse.json({ task })
  } catch (e) {
    console.error('[admin/tasks/[id]] PATCH', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
