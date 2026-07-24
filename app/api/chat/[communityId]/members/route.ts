import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { chatConversations } from "@/db/schema"
import { eq, and, isNotNull } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { getPrisma } from "@/lib/db/client"

// GET /api/chat/[communityId]/members
// Returns community members with a flag indicating if they already have an admin_direct conversation
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ communityId: string }> }
) {
  const { communityId } = await params
  const userId = await getSession()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const prisma = getPrisma()

  const [members, balances] = await Promise.all([
    prisma.member.findMany({
      where: { communityId },
      orderBy: { createdAt: "desc" },
      select: { id: true, displayName: true, role: true, tags: true },
    }),
    prisma.memberTokenBalance.findMany({
      where: { communityId },
      select: { memberId: true, totalBalance: true },
    }),
  ])

  // Get all admin_direct conversations for this community that have a member_id
  const existingChats = await db
    .select({ memberId: chatConversations.memberId })
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.communityId, communityId),
        eq(chatConversations.type, "admin_direct"),
        isNotNull(chatConversations.memberId)
      )
    )

  const existingMemberIds = new Set(
    existingChats.map(c => c.memberId).filter(Boolean) as string[]
  )

  const balanceMap = new Map(balances.map(b => [b.memberId, Number(b.totalBalance)]))

  const result = members.map(m => ({
    id: m.id,
    name: m.displayName,
    role: m.role,
    tags: m.tags,
    voicePower: balanceMap.get(m.id) ?? 0,
    hasConversation: existingMemberIds.has(m.id),
    conversationId: null as string | null,
  }))

  // Attach conversationId for members who already have one
  if (existingMemberIds.size > 0) {
    const convMap = new Map<string, string>()
    const allDirect = await db
      .select({ id: chatConversations.id, memberId: chatConversations.memberId })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.communityId, communityId),
          eq(chatConversations.type, "admin_direct"),
          isNotNull(chatConversations.memberId)
        )
      )
    for (const c of allDirect) {
      if (c.memberId) convMap.set(c.memberId, c.id)
    }
    for (const m of result) {
      if (m.hasConversation) {
        m.conversationId = convMap.get(m.id) || null
      }
    }
  }

  return NextResponse.json({ members: result })
}
