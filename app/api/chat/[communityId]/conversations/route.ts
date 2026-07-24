import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { chatConversations, chatMessages } from "@/db/schema"
import { eq, desc } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { generateId } from "@/lib/crypto"
import { getPrisma } from "@/lib/db/client"

// GET /api/chat/[communityId]/conversations
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ communityId: string }> }
) {
  const { communityId } = await params
  const userId = await getSession()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const conversations = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.communityId, communityId))
    .orderBy(desc(chatConversations.createdAt))

  // Collect memberIds to batch-fetch names
  const memberIds = [...new Set(conversations.map(c => c.memberId).filter(Boolean))] as string[]
  let memberNameMap = new Map<string, string>()
  if (memberIds.length > 0) {
    const prisma = getPrisma()
    const members = await prisma.member.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, displayName: true },
    })
    for (const m of members) memberNameMap.set(m.id, m.displayName)
  }

  // Attach last message to each conversation
  const withMeta = await Promise.all(
    conversations.map(async (conv) => {
      const lastMsgs = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, conv.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1)

      return {
        id: conv.id,
        communityId: conv.communityId,
        type: conv.type,
        title: conv.title,
        memberId: conv.memberId || null,
        memberName: conv.memberId ? (memberNameMap.get(conv.memberId) || conv.title) : null,
        createdAt: conv.createdAt,
        lastMessage: lastMsgs[0]?.content || "",
        lastMessageAt: lastMsgs[0]?.createdAt?.toISOString() || conv.createdAt.toISOString(),
        unreadCount: 0,
      }
    })
  )

  return NextResponse.json({ conversations: withMeta })
}

// POST /api/chat/[communityId]/conversations
// Body: { title?, type?, memberId? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ communityId: string }> }
) {
  const { communityId } = await params
  const userId = await getSession()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { title, type, memberId } = await req.json()

  let finalTitle = title?.trim()
  let finalType = type || "member_group"
  let finalMemberId: string | null = memberId || null

  // If memberId is provided, look up member name and set as admin_direct
  if (memberId) {
    const prisma = getPrisma()
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, displayName: true, communityId: true },
    })
    if (!member || member.communityId !== communityId) {
      return NextResponse.json({ error: "Member not found in this community" }, { status: 404 })
    }
    finalTitle = finalTitle || member.displayName
    finalType = "admin_direct"
    finalMemberId = member.id
  }

  if (!finalTitle) {
    return NextResponse.json({ error: "title required" }, { status: 400 })
  }

  const id = generateId()

  await db.insert(chatConversations).values({
    id,
    communityId,
    type: finalType,
    title: finalTitle,
    memberId: finalMemberId,
  })

  const conv = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, id))
    .limit(1)

  return NextResponse.json({ conversation: conv[0] }, { status: 201 })
}
