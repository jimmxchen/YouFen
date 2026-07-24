import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { AdminHeader } from '@/components/admin/admin-header'
import { demoMembers } from '@/lib/demo-data'
import type { AdminView } from '@/types/admin'

const viewTitles: Record<AdminView, string> = {
  dashboard: '',
  members: '',
  contributions: '',
  proposals: '',
  records: '',
}

export default function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const currentUser = demoMembers[0]
  const communityName = 'AdventureX Community'

  return (
    <div className="min-h-screen bg-white">
      <AdminSidebar communityName={communityName} />
      <div className="ml-64">
        <AdminHeader communityName={communityName} currentUser={currentUser} />
        <main className="p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
