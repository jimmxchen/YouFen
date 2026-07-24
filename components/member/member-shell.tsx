import type { ReactNode } from 'react'

interface MemberShellProps {
  children: ReactNode
}

export function MemberShell({ children }: MemberShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-white pb-24 text-[#131517] lg:pb-12 lg:pl-64">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-br from-emerald-500/[0.08] via-blue-500/[0.06] to-transparent lg:h-96"
      />
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col lg:max-w-6xl">
        {children}
      </div>
    </main>
  )
}
