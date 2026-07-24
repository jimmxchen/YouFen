"use client"

import { useRouter } from "@/i18n/navigation"
import { CreateCommunityModal } from "@/components/auth/create-community-modal"

interface AdminGateProps {
  isOwner: boolean
  memberCommunityId: string | null
  children: React.ReactNode
}

export function AdminGate({ isOwner, memberCommunityId, children }: AdminGateProps) {
  const router = useRouter()

  if (isOwner) return <>{children}</>

  return (
    <>
      {children}
      <CreateCommunityModal
        open
        onClose={() => {
          const target = memberCommunityId ? `/member/${memberCommunityId}` : "/member"
          router.push(target)
        }}
      />
    </>
  )
}
