import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { chatParticipants, chatConversations } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { generateId } from "@/lib/crypto"
import { getPrisma } from "@/lib/db/client"

// GET /api/chat/[communityId]/conversations/[id]/participants
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ communityId: string; id: string }> }
) {
  const { communityId, id: conversationId } = await params
  const userId = await getSession()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Verify conversation exists in this community
  const conv = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.communityId, communityId)))
    .limit(1)

  if (!conv[0]) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })

  const rows = await db
    .select()
    .from(chatParticipants)
    .where(eq(chatParticipants.conversationId, conversationId))

  const memberIds = rows.map(r => r.memberId)
  let memberMap = new Map<string, { name: string; role: string }>()

  if (memberIds.length > 0) {
    const prisma = getPrisma()
    const members = await prisma.member.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, displayName: true, role: true },
    })
    for (const m of members) memberMap.set(m.id, { name: m.displayName, role: m.role })
  }

  const participants = rows.map(r => {
    const m = memberMap.get(r.memberId)
    const name = m?.name || r.memberId
    return {
      id: r.memberId,
      name,
      role: m?.role || "member",
      avatarInitials: name.split(/\s+/).map((s: string) => s[0]).join("").toUpperCase().slice(0, 2) || "?",
      status: "offline" as const,
      joinedAt: r.joinedAt?.toISOString() || new Date().toISOString(),
    }
  })

  return NextResponse.json({ participants })
}

// POST /api/chat/[communityId]/conversations/[id]/participants
// Body: { memberIds: string[] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ communityId: string; id: string }> }
) {
  const { communityId, id: conversationId } = await params
  const userId = await getSession()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { memberIds } = await req.json()
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return NextResponse.json({ error: "memberIds array required" }, { status: 400 })
  }

  // Verify conversation exists
  const conv = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.communityId, communityId)))
    .limit(1)

  if (!conv[0]) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })

  // Get existing participant memberIds
  const existing = await db
    .select({ memberId: chatParticipants.memberId })
    .from(chatParticipants)
    .where(eq(chatParticipants.conversationId, conversationId))

  const existingIds = new Set(existing.map(e => e.memberId))

  // Insert only new members
  const toInsert = memberIds.filter(id => !existingIds.has(id))
  if (toInsert.length > 0) {
    await db.insert(chatParticipants).values(
      toInsert.map(memberId => ({
        id: generateId(),
        conversationId,
        memberId,
      }))
    )
  }

  // Return updated participants
  const rows = await db
    .select()
    .from(chatParticipants)
    .where(eq(chatParticipants.conversationId, conversationId))

  return NextResponse.json({ participants: rows, added: toInsert.length }, { status: 201 })
}
