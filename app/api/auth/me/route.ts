import { NextResponse } from "next/server"
import { db } from "@/db"
import { users } from "@/db/schema"
import { eq } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { getPrisma } from "@/lib/db/client"

export async function GET() {
  const userId = await getSession()
  if (!userId) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const rows = await db.select({ id: users.id, name: users.name, email: users.email, avatar: users.avatar }).from(users).where(eq(users.id, userId)).limit(1)
  if (rows.length === 0) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  let hasOwnedCommunity = false
  let memberCommunityId: string | null = null
  try {
    const prisma = getPrisma()
    const owned = await prisma.member.findFirst({
      where: { userId, role: { in: ["owner", "admin"] } },
    })
    hasOwnedCommunity = !!owned

    if (!hasOwnedCommunity) {
      const membership = await prisma.member.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      })
      memberCommunityId = membership?.communityId ?? null
    }
  } catch {}

  return NextResponse.json({ user: { ...rows[0], hasOwnedCommunity, memberCommunityId } })
}
