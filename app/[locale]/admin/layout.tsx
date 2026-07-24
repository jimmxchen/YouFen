import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { AdminHeader } from "@/components/admin/admin-header"
import { AdminCommunityProvider } from "@/components/admin/admin-community-provider"
import { AdminGate } from "@/components/admin/admin-gate"
import { getSession } from "@/lib/auth"
import { toAdminMember } from "@/lib/api/admin/transforms"
import { getPrisma } from '@/lib/db/client'
import { db } from "@/db"
import { users } from "@/db/schema"
import { eq } from "drizzle-orm"

async function getAdminData(targetCommunityId?: string) {
  const userId = await getSession()
  if (!userId) return null

  try {
    const userRows = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const realName = userRows[0]?.name
    const realEmail = userRows[0]?.email

    const prisma = getPrisma()

    // Fetch all communities this user owns/admins
    const ownedMemberships = await prisma.member.findMany({
      where: { userId, role: { in: ["owner", "admin"] } },
    })

    // Look up community names
    const communityIds = ownedMemberships.map((m) => m.communityId)
    const communities = communityIds.length > 0
      ? await prisma.community.findMany({
          where: { id: { in: communityIds } },
          select: { id: true, name: true },
        })
      : []
    const communityMap = new Map(communities.map((c) => [c.id, c.name]))

    const ownedCommunities = ownedMemberships.map((m) => ({
      communityId: m.communityId,
      communityName: communityMap.get(m.communityId) ?? m.communityId,
      role: m.role,
    }))

    if (ownedCommunities.length === 0) {
      return { noMembership: true as const }
    }

    const isOwner = true // They must be owner/admin since we filtered by role

    // Pick the target community or the first one
    const activeCommunity = targetCommunityId
      ? ownedCommunities.find((c) => c.communityId === targetCommunityId) ?? ownedCommunities[0]
      : ownedCommunities[0]

    const memberRow = await prisma.member.findFirst({
      where: { userId, communityId: activeCommunity.communityId },
    })

    if (!memberRow) {
      return { noMembership: true as const }
    }

    // Get balance for this membership
    const balance = await prisma.memberTokenBalance.findUnique({
      where: { communityId_memberId: { communityId: activeCommunity.communityId, memberId: memberRow.id } },
    })

    const member = toAdminMember({ ...memberRow, balance: balance ?? null })
    const communityId = activeCommunity.communityId
    const communityName = activeCommunity.communityName

    return {
      noMembership: false as const,
      isOwner,
      memberCommunityId: communityId,
      user: { id: userId, name: realName || member.name, email: realEmail },
      memberships: [{
        memberId: member.id,
        communityId,
        communityName,
        role: member.role,
        voicePower: member.voicePower,
        contributionCount: member.contributionCount,
        tags: member.tags,
      }],
      ownedCommunities,
    }
  } catch {
    return {
      noMembership: false as const,
      isOwner: false,
      memberCommunityId: null as string | null,
      user: { id: userId, name: "Admin", email: undefined },
      memberships: [{
        memberId: userId,
        communityId: "unknown",
        communityName: "Community",
        role: "member" as const,
        voicePower: 0,
        contributionCount: 0,
        tags: [] as string[],
      }],
      ownedCommunities: [] as Array<{ communityId: string; communityName: string; role: string }>,
    }
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Read communityId from cookie (set by middleware or client-side navigation)
  const cookieStore = await cookies()
  const targetCommunityId = cookieStore.get('youfen_active_community')?.value

  const data = await getAdminData(targetCommunityId)

  if (!data) {
    redirect("/sign-in")
  }

  if (data.noMembership) {
    redirect("/choose-role")
  }

  const defaultMembership = data.memberships[0]

  const currentUser = {
    id: data.user.id,
    name: data.user.name,
    email: data.user.email,
    role: (defaultMembership?.role || "member") as "owner" | "manager" | "member",
    voicePower: defaultMembership?.voicePower || 0,
    contributionCount: defaultMembership?.contributionCount || 0,
    tags: defaultMembership?.tags || [],
    joinedAt: "",
    lastActiveAt: "",
  }

  const communityId = defaultMembership?.communityId || "unknown"
  const communityName = defaultMembership?.communityName || "Community"

  return (
    <AdminCommunityProvider value={{ communityId, communityName }}>
      <AdminGate isOwner={data.isOwner} memberCommunityId={data.memberCommunityId}>
        <div className="min-h-screen bg-white">
          <AdminSidebar communityName={communityName} />
          <div className="ml-64">
            <AdminHeader
              communityName={communityName}
              currentUser={currentUser}
              memberships={data.memberships}
              ownedCommunities={data.ownedCommunities}
            />
            <main className="px-5 py-10 lg:px-8 lg:py-12">
              {children}
            </main>
          </div>
        </div>
      </AdminGate>
    </AdminCommunityProvider>
  )
}
