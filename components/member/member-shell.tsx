import type { ReactNode } from 'react'
import { MemberHeader } from '@/components/member/member-header'
import { type CommunityMember } from '@/types/member'

interface MemberShellProps {
  children: ReactNode
  member: CommunityMember
}

export function MemberShell({ children, member }: MemberShellProps) {
  return (
    <main className="min-h-screen bg-white pb-24 text-[#131517] lg:pb-0 lg:pl-64">
      <MemberHeader member={member} />
      <div className="flex min-h-screen w-full flex-col px-5 py-8 lg:px-8 lg:py-10">
        {children}
      </div>
    </main>
  )
}
