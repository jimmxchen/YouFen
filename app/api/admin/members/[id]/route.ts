import { NextRequest, NextResponse } from 'next/server'
import { getMemberById, toAdminMember, toAdminContribution, updateMember } from '@/lib/api/admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const row = await getMemberById(id)
    if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
    const member = toAdminMember(row)
    const contributions = (row as any).contributions?.map((c: any) =>
      toAdminContribution({ ...c, member: { displayName: member.name, id: row.id } }),
    ) ?? []
    return NextResponse.json({ member, contributions })
  } catch (e) {
    console.error('[admin/members/[id]]', e)
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
    const { voicePower, role } = body

    const updated = await updateMember(id, { voicePower, role })
    if (!updated) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

    const member = toAdminMember(updated)
    return NextResponse.json({ member })
  } catch (e) {
    console.error('[admin/members/[id] PATCH]', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
