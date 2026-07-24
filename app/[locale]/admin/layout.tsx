import { redirect } from "next/navigation"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { AdminHeader } from "@/components/admin/admin-header"
import { getSession } from "@/lib/auth"
import { db } from "@/db"
import { users, communityMembers, communities } from "@/db/schema"
import { eq } from "drizzle-orm"
import { demoMembers } from "@/lib/demo-data"

async function getAdminData() {
  const userId = await getSession()
  if (!userId) return null

  try {
    const userRows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (userRows.length === 0) return null

    const memberships = await db
      .select({
        memberId: communityMembers.id,
        communityId: communities.id,
        communityName: communities.name,
        role: communityMembers.role,
        voicePower: communityMembers.voicePower,
        contributionCount: communityMembers.contributionCount,
        tags: communityMembers.tags,
      })
      .from(communityMembers)
      .innerJoin(communities, eq(communityMembers.communityId, communities.id))
      .where(eq(communityMembers.userId, userId))

    return {
      user: userRows[0],
      memberships,
    }
  } catch {
    return null
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const data = await getAdminData()

  if (!data) {
    redirect("/sign-in")
  }

  // Use the first membership as default, or fall back to demo
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

  const communityName = defaultMembership?.communityName || "AdventureX Community"

  return (
    <div className="min-h-screen bg-white">
      <AdminSidebar
        communityName={communityName}
        user={currentUser}
        memberships={data.memberships}
      />
      <div className="ml-64">
        <AdminHeader
          communityName={communityName}
          currentUser={currentUser}
          memberships={data.memberships}
        />
        <main className="p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
