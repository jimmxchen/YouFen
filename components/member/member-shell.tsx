import type { ReactNode } from 'react'

interface MemberShellProps {
  children: ReactNode
}

export function MemberShell({ children }: MemberShellProps) {
  return (
    <main className="min-h-screen bg-[#f6f4ef] pb-24 text-[#131517]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
        {children}
      </div>
    </main>
  )
}
