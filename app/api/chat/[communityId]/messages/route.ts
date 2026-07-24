import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { chatMessages, chatConversations } from "@/db/schema"
import { eq, and, gt, asc } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { generateId } from "@/lib/crypto"

// GET /api/chat/[communityId]/messages?conversationId=xxx&since=timestamp
// Returns messages for a conversation. Use `since` for incremental polling.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ communityId: string }> }
) {
  const { communityId } = await params
  const userId = await getSession()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const conversationId = url.searchParams.get("conversationId")
  const since = url.searchParams.get("since")

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 })
  }

  // Verify conversation belongs to this community
  const conv = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.communityId, communityId)))
    .limit(1)

  if (conv.length === 0) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  const conditions = [eq(chatMessages.conversationId, conversationId)]
  if (since) {
    conditions.push(gt(chatMessages.createdAt, new Date(since)))
  }

  const messages = await db
    .select()
    .from(chatMessages)
    .where(and(...conditions))
    .orderBy(asc(chatMessages.createdAt))
    .limit(100)

  return NextResponse.json({ messages })
}

// POST /api/chat/[communityId]/messages
// Body: { conversationId, content }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ communityId: string }> }
) {
  const { communityId } = await params
  const userId = await getSession()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { conversationId, content } = await req.json()
  if (!conversationId || !content?.trim()) {
    return NextResponse.json({ error: "conversationId and content required" }, { status: 400 })
  }

  // Verify conversation belongs to this community
  const conv = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.communityId, communityId)))
    .limit(1)

  if (conv.length === 0) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  // Get sender name from users table
  const { users } = await import("@/db/schema")
  const userRows = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  const senderName = userRows[0]?.name || "Unknown"

  // Determine sender role — use Prisma Member table (not Drizzle community_members),
  // because the two ORMs map to different table names (Member vs community_members).
  const { getPrisma } = await import("@/lib/db/client")
  const prisma = getPrisma()
  const prismaMember = await prisma.member.findFirst({
    where: { userId, communityId },
    select: { role: true },
  })
  const role = prismaMember?.role
  const senderRole = role === "owner" || role === "manager" ? "admin" : "member"

  const id = generateId()
  const now = new Date()

  await db.insert(chatMessages).values({
    id,
    conversationId,
    senderId: userId,
    senderName,
    senderRole,
    content: content.trim(),
    createdAt: now,
  })

  const message = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.id, id))
    .limit(1)

  return NextResponse.json({ message: message[0] }, { status: 201 })
}
