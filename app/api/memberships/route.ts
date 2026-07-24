import { NextResponse } from "next/server"
import { db } from "@/db"
import { communityMembers, communities } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { getSession } from "@/lib/auth"

export async function GET() {
  const userId = await getSession()
  if (!userId) {
    return NextResponse.json({ memberships: [] }, { status: 401 })
  }

  const rows = await db
    .select({
      memberId: communityMembers.id,
      communityId: communities.id,
      communityName: communities.name,
      role: communityMembers.role,
      voicePower: communityMembers.voicePower,
    })
    .from(communityMembers)
    .innerJoin(communities, eq(communityMembers.communityId, communities.id))
    .where(eq(communityMembers.userId, userId))

  return NextResponse.json({ memberships: rows })
}
