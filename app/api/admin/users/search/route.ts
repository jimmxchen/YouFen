import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { or, ilike, and, notInArray, eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import { getPrisma } from '@/lib/db/client'

export async function GET(req: NextRequest) {
  const userId = await getSession()
  if (!userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const q = req.nextUrl.searchParams.get('q')?.trim()
  const communityId = req.nextUrl.searchParams.get('communityId')

  if (!q || q.length < 1) {
    return NextResponse.json({ users: [] })
  }

  if (!communityId) {
    return NextResponse.json({ error: 'MISSING_COMMUNITY_ID' }, { status: 400 })
  }

  try {
    const prisma = getPrisma()
    const existingMemberUserIds = (
      await prisma.member.findMany({
        where: { communityId, userId: { not: null } },
        select: { userId: true },
      })
    ).map(m => m.userId!)

    if (existingMemberUserIds.length > 0) {
      const results = await db
        .select({ id: users.id, name: users.name, email: users.email, avatar: users.avatar })
        .from(users)
        .where(
          and(
            or(
              ilike(users.name, `%${q}%`),
              ilike(users.email, `%${q}%`),
            ),
            notInArray(users.id, existingMemberUserIds),
          ),
        )
        .limit(10)

      return NextResponse.json({ users: results })
    }

    const results = await db
      .select({ id: users.id, name: users.name, email: users.email, avatar: users.avatar })
      .from(users)
      .where(
        or(
          ilike(users.name, `%${q}%`),
          ilike(users.email, `%${q}%`),
        ),
      )
      .limit(10)

    return NextResponse.json({ users: results })
  } catch (e) {
    console.error('[admin/users/search]', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
