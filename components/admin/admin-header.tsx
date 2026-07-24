"use client"

import { useState, useRef, useEffect } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { Bell, Search, LogOut, User } from "lucide-react"
import { VoicePowerBadge } from "@/components/admin/voice-power-badge"
import { useAuth } from "@/components/auth/auth-context"
import { type Member } from "@/types/admin"

interface MembershipInfo {
  memberId: string
  communityId: string
  communityName: string
  role: string
  voicePower: number
}

interface AdminHeaderProps {
  communityName: string
  currentUser: Member
  title?: string
  memberships?: MembershipInfo[]
}

export function AdminHeader({ communityName, currentUser, title, memberships }: AdminHeaderProps) {
  const t = useTranslations("admin")
  const router = useRouter()
  const { signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  return (
    <header className="h-16 bg-white border-b border-[#F0F0F0] flex items-center justify-between px-8 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {title && (
          <>
            <span className="text-sm text-[#939597]">{communityName}</span>
            <span className="text-sm text-[#D4D4D4]">/</span>
            <h1 className="text-base font-medium text-[#131517]">{title}</h1>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#F0F0F0] bg-[#FAFAFA] text-[#939597]">
          <Search className="w-4 h-4" />
          <span className="text-sm">{t("search")}</span>
        </div>
        <button className="relative p-2 rounded-lg hover:bg-[#FAFAFA] transition-colors">
          <Bell className="w-5 h-5 text-[#525252]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        <div className="relative flex items-center gap-3 pl-4 border-l border-[#F0F0F0]" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-3 hover:bg-[#FAFAFA] rounded-lg px-2 py-1 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center text-white text-sm font-medium">
              {currentUser.name[0]}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-[#131517]">{currentUser.name}</p>
              <VoicePowerBadge value={currentUser.voicePower} size="sm" />
            </div>
          </button>

          {menuOpen && (
            <div className="absolute top-full right-0 mt-2 w-56 bg-white border border-[#F0F0F0] rounded-xl shadow-lg z-50 py-1">
              <div className="px-4 py-3 border-b border-[#F0F0F0]">
                <p className="text-sm font-medium text-[#131517]">{currentUser.name}</p>
                <p className="text-xs text-[#939597]">{currentUser.email}</p>
                <div className="mt-1.5">
                  <VoicePowerBadge value={currentUser.voicePower} size="sm" />
                  <span className="text-xs text-[#939597] ml-1 capitalize">{currentUser.role}</span>
                </div>
              </div>

              {memberships && memberships.length > 1 && (
                <div className="px-4 py-2 border-b border-[#F0F0F0]">
                  <p className="text-xs text-[#939597] mb-1.5">Your Communities</p>
                  {memberships.map((m) => (
                    <div key={m.communityId} className="flex items-center justify-between py-1">
                      <span className="text-sm text-[#131517] truncate flex-1">{m.communityName}</span>
                      <span className="text-xs text-[#939597] capitalize">{m.role}</span>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => router.push("/admin")}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#525252] hover:bg-[#FAFAFA] transition-colors"
              >
                <User className="w-4 h-4" />
                My Dashboard
              </button>
              <button
                onClick={async () => {
                  await signOut()
                  router.push("/sign-in")
                }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
