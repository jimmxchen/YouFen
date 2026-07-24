import type { ReactNode } from 'react'

interface MemberShellProps {
  children: ReactNode
}

export function MemberShell({ children }: MemberShellProps) {
  return (
    <main className="min-h-screen bg-white pb-24 text-[#131517] lg:pb-0 lg:pl-64">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col lg:max-w-7xl lg:p-8">
        {children}
      </div>
    </main>
  )
}
