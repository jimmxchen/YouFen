import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { chatConversations, chatMessages, chatParticipants } from "@/db/schema"
import { eq, desc, and, inArray } from "drizzle-orm"
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

  // Check if user is admin/owner
  let isAdmin = false
  let memberId: string | null = null
  try {
    const prisma = getPrisma()
    const member = await prisma.member.findFirst({
      where: { userId, communityId },
      select: { id: true, role: true },
    })
    if (member) {
      memberId = member.id
      isAdmin = member.role === "owner" || member.role === "admin"
    }
  } catch { /* fall through */ }

  let conversationIds: string[] | null = null

  if (!isAdmin && memberId) {
    const participations = await db
      .select({ conversationId: chatParticipants.conversationId })
      .from(chatParticipants)
      .where(eq(chatParticipants.memberId, memberId))

    conversationIds = participations.map(p => p.conversationId)

    // Also include admin_direct conversations where memberId matches
    const directConvs = await db
      .select({ id: chatConversations.id })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.communityId, communityId),
          eq(chatConversations.type, "admin_direct"),
          eq(chatConversations.memberId, memberId)
        )
      )

    for (const c of directConvs) {
      if (!conversationIds.includes(c.id)) conversationIds.push(c.id)
    }

    if (conversationIds.length === 0) {
      return NextResponse.json({ conversations: [] })
    }
  }

  // Build where conditions
  const whereConditions: ReturnType<typeof eq>[] = [
    eq(chatConversations.communityId, communityId),
  ]
  if (conversationIds) {
    whereConditions.push(inArray(chatConversations.id, conversationIds))
  }

  const conversations = await db
    .select()
    .from(chatConversations)
    .where(and(...whereConditions))
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

  // Get participant counts
  const allConvIds = conversations.map(c => c.id)
  let participantCountMap = new Map<string, number>()
  if (allConvIds.length > 0) {
    const participantRows = await db
      .select({ conversationId: chatParticipants.conversationId })
      .from(chatParticipants)
      .where(inArray(chatParticipants.conversationId, allConvIds))

    for (const r of participantRows) {
      participantCountMap.set(r.conversationId, (participantCountMap.get(r.conversationId) || 0) + 1)
    }
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
        participantCount: participantCountMap.get(conv.id) || 0,
        lastMessage: lastMsgs[0]?.content || "",
        lastMessageAt: lastMsgs[0]?.createdAt?.toISOString() || conv.createdAt.toISOString(),
        unreadCount: 0,
      }
    })
  )

  return NextResponse.json({ conversations: withMeta })
}

// POST /api/chat/[communityId]/conversations
// Body: { title?, type?, memberId?, participantIds?: string[] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ communityId: string }> }
) {
  const { communityId } = await params
  const userId = await getSession()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { title, type, memberId, participantIds } = await req.json()

  let finalTitle = title?.trim()
  let finalType = type || "member_group"
  let finalMemberId: string | null = memberId || null

  const prisma = getPrisma()

  // Get the creator's member record
  const creatorMember = await prisma.member.findFirst({
    where: { userId, communityId },
    select: { id: true, displayName: true, role: true },
  })

  // If memberId is provided, look up member name and set as admin_direct
  if (memberId) {
    const targetMember = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, displayName: true, communityId: true },
    })
    if (!targetMember || targetMember.communityId !== communityId) {
      return NextResponse.json({ error: "Member not found in this community" }, { status: 404 })
    }
    finalTitle = finalTitle || targetMember.displayName
    finalType = "admin_direct"
    finalMemberId = targetMember.id
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

  // Add participants
  const allParticipantIds = new Set<string>()

  // Creator is always a participant
  if (creatorMember) {
    allParticipantIds.add(creatorMember.id)
  }

  // Add the direct member for admin_direct chats
  if (finalMemberId) {
    allParticipantIds.add(finalMemberId)
  }

  // Add explicitly provided participant IDs
  if (Array.isArray(participantIds)) {
    for (const pid of participantIds) {
      allParticipantIds.add(pid)
    }
  }

  if (allParticipantIds.size > 0) {
    await db.insert(chatParticipants).values(
      [...allParticipantIds].map(pid => ({
        id: generateId(),
        conversationId: id,
        memberId: pid,
      }))
    )
  }

  const conv = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, id))
    .limit(1)

  return NextResponse.json({ conversation: conv[0], participantCount: allParticipantIds.size }, { status: 201 })
}
