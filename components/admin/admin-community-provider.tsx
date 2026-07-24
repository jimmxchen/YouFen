"use client"

import { CommunityContext, type CommunityContextValue } from "@/lib/hooks/use-community"

export function AdminCommunityProvider({
  value,
  children,
}: {
  value: CommunityContextValue
  children: React.ReactNode
}) {
  return (
    <CommunityContext.Provider value={value}>
      {children}
    </CommunityContext.Provider>
  )
}
