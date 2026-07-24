import type { ReactNode } from 'react'
import { YouFenLogo } from '@/components/brand/youfen-logo'

interface MemberShellProps {
  children: ReactNode
}

export function MemberShell({ children }: MemberShellProps) {
  return (
    <main className="min-h-screen bg-white pb-24 text-[#131517] lg:pb-0 lg:pl-64">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col lg:max-w-7xl lg:p-8">
        <div className="flex h-14 items-center border-b border-[#F0F0F0] px-5 lg:hidden">
          <YouFenLogo markClassName="h-8 w-8" textClassName="text-base" />
        </div>
        {children}
      </div>
    </main>
  )
}
