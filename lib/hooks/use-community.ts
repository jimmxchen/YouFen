"use client"

import { createContext, useContext } from "react"

export type CommunityContextValue = {
  communityId: string
  communityName: string
}

const CommunityContext = createContext<CommunityContextValue>({
  communityId: "unknown",
  communityName: "Community",
})

export function useCommunity() {
  return useContext(CommunityContext)
}

export { CommunityContext }
