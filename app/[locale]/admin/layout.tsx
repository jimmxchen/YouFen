import { redirect } from "next/navigation"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { AdminHeader } from "@/components/admin/admin-header"
import { demoMembers } from "@/lib/demo-data"

function getAdminData() {
  // Demo mode — use first demo member as the admin user
  const demoUser = demoMembers[0]
  if (!demoUser) return null

  return {
    user: { id: demoUser.id, name: demoUser.name, email: demoUser.email },
    memberships: [{
      memberId: demoUser.id,
      communityId: "adventurex",
      communityName: "AdventureX Community",
      role: demoUser.role,
      voicePower: demoUser.voicePower,
      contributionCount: demoUser.contributionCount || 0,
      tags: demoUser.tags || [],
    }],
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
