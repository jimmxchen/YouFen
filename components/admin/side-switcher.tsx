"use client"

import { useRouter } from "@/i18n/navigation"
import { useCommunity } from "@/lib/hooks/use-community"
import { cn } from "@/lib/utils"

interface SideSwitcherProps {
  side: "admin" | "member"
}

export function SideSwitcher({ side }: SideSwitcherProps) {
  const router = useRouter()
  const { communityId } = useCommunity()

  function switchTo(target: "admin" | "member") {
    if (target === side) return
    if (target === "admin") {
      router.push("/admin")
    } else {
      router.push(`/member/${communityId}`)
    }
  }

  return (
    <div className="inline-flex rounded-full bg-[#e5e5e5] p-0.5 gap-0.5">
      <button
        onClick={() => switchTo("admin")}
        className={cn(
          "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
          side === "admin"
            ? "bg-white text-[#131517] shadow-sm"
            : "text-[#939597] hover:text-[#525252]"
        )}
      >
        Admin
      </button>
      <button
        onClick={() => switchTo("member")}
        className={cn(
          "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
          side === "member"
            ? "bg-white text-[#131517] shadow-sm"
            : "text-[#939597] hover:text-[#525252]"
        )}
      >
        Member
      </button>
    </div>
  )
}
