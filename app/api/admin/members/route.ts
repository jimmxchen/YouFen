import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { inArray } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import { getPrisma } from '@/lib/db/client'
import { getMembers, toAdminMember } from '@/lib/api/admin'

export async function GET(req: NextRequest) {
  const communityId = req.nextUrl.searchParams.get('communityId') ?? 'adventurex'
  try {
    const rows = await getMembers(communityId)
    const members = rows.map(toAdminMember)

    // Enrich with real user names from the auth users table
    const ids = members.map(m => m.id)
    if (ids.length > 0) {
      // member.id is the member record id, but we need the userId
      // rows[i].userId maps to users.id
      const memberIdToUserId = new Map<string, string>()
      for (const r of rows) {
        if (r.userId) memberIdToUserId.set(r.id, r.userId)
      }
      const userIds = [...new Set(memberIdToUserId.values())]

      if (userIds.length > 0) {
        const userRows = await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds))

        const userMap = new Map(userRows.map(u => [u.id, u]))
        for (const member of members) {
          const uid = memberIdToUserId.get(member.id)
          const user = uid ? userMap.get(uid) : null
          if (user) {
            member.name = user.name || member.name
            member.email = user.email || member.email
          }
        }
      }
    }

    return NextResponse.json({ members })
  } catch (e) {
    console.error('[admin/members]', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const userId = await getSession()
  if (!userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  let body: { userId?: string; communityId?: string; displayName?: string; role?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const { userId: targetUserId, communityId, displayName, role } = body

  if (!targetUserId || !communityId || !displayName?.trim() || !role?.trim()) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
  }

  try {
    const prisma = getPrisma()

    const existing = await prisma.member.findFirst({
      where: { communityId, userId: targetUserId },
    })
    if (existing) {
      return NextResponse.json({ error: 'ALREADY_MEMBER' }, { status: 409 })
    }

    const member = await prisma.member.create({
      data: {
        communityId,
        userId: targetUserId,
        displayName: displayName.trim(),
        role: role.trim(),
      },
    })

    await prisma.memberTokenBalance.create({
      data: {
        communityId,
        memberId: member.id,
        totalBalance: 0n,
        activeGovernanceBalance: 0n,
        pendingGovernanceBalance: 0n,
        tokensEarnedCurrentEpoch: 0n,
        tokensEarnedLifetime: 0n,
        tokensReversedLifetime: 0n,
      },
    })

    return NextResponse.json({ member: toAdminMember({ ...member, balance: null }) }, { status: 201 })
  } catch (e: any) {
    console.error('[admin/members]', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
