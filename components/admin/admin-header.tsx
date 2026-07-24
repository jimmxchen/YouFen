"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { Bell, Search, LogOut, User, ChevronDown, Plus, Check } from "lucide-react"
import { VoicePowerBadge } from "@/components/admin/voice-power-badge"
import { CreateCommunityModal } from "@/components/auth/create-community-modal"
import { type Member } from "@/types/admin"
import { useAdminMembers, useAdminContributions, useAdminProposals } from "@/lib/hooks/use-admin-data"
import { useCommunity } from "@/lib/hooks/use-community"

interface MembershipInfo {
  memberId: string
  communityId: string
  communityName: string
  role: string
  voicePower: number
}

interface OwnedCommunity {
  communityId: string
  communityName: string
  role: string
}

interface AdminHeaderProps {
  communityName: string
  currentUser: Member
  title?: string
  memberships?: MembershipInfo[]
  ownedCommunities?: OwnedCommunity[]
}

interface NotificationItem {
  id: string
  title: string
  description: string
  createdAt: string
  href: string
}

interface SearchResult {
  id: string
  category: string
  label: string
  sublabel: string
  href: string
}

export function AdminHeader({ communityName, currentUser, title, memberships, ownedCommunities = [] }: AdminHeaderProps) {
  const t = useTranslations("admin")
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const [readIds, setReadIds] = useState<Set<string>>(new Set())

  const [query, setQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Community switcher
  const [commSwitcherOpen, setCommSwitcherOpen] = useState(false)
  const commSwitcherRef = useRef<HTMLDivElement>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)

  const { communityId } = useCommunity()
  const { members } = useAdminMembers(communityId)
  const { contributions } = useAdminContributions(communityId)
  const { proposals } = useAdminProposals(communityId)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
      if (commSwitcherRef.current && !commSwitcherRef.current.contains(e.target as Node)) {
        setCommSwitcherOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const notifications: NotificationItem[] = useMemo(() => {
    const fromContributions = contributions
      .filter((c) => c.status === "pending")
      .map((c) => ({
        id: `contribution-${c.id}`,
        title: "New contribution awaiting review",
        description: `${c.memberName}: ${c.description}`,
        createdAt: c.createdAt,
        href: "/admin/contributions",
      }))

    const fromProposals = proposals
      .filter((p) => p.status === "active")
      .map((p) => ({
        id: `proposal-${p.id}`,
        title: "Proposal ending soon",
        description: `${p.title} (${p.endTime})`,
        createdAt: p.createdAt,
        href: `/admin/proposals/${p.id}`,
      }))

    return [...fromContributions, ...fromProposals].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    )
  }, [contributions, proposals])

  const hasUnread = notifications.some((n) => !readIds.has(n.id))

  function handleNotificationClick(item: NotificationItem) {
    setReadIds((prev) => new Set(prev).add(item.id))
    setNotifOpen(false)
    router.push(item.href)
  }

  const searchResults: SearchResult[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []

    const memberResults = members
      .filter((m) => m.name.toLowerCase().includes(q) || (m.email && m.email.toLowerCase().includes(q)))
      .slice(0, 5)
      .map((m) => ({
        id: `member-${m.id}`,
        category: t("members"),
        label: m.name,
        sublabel: m.email || "",
        href: `/admin/members/${m.id}`,
      }))

    const contributionResults = contributions
      .filter(
        (c) => c.description.toLowerCase().includes(q) || c.memberName.toLowerCase().includes(q)
      )
      .slice(0, 5)
      .map((c) => ({
        id: `contribution-${c.id}`,
        category: t("contributions"),
        label: c.description,
        sublabel: c.memberName,
        href: "/admin/contributions",
      }))

    const proposalResults = proposals
      .filter((p) => p.title.toLowerCase().includes(q) || (p.summary && p.summary.toLowerCase().includes(q)))
      .slice(0, 5)
      .map((p) => ({
        id: `proposal-${p.id}`,
        category: t("proposals"),
        label: p.title,
        sublabel: p.summary || p.description,
        href: `/admin/proposals/${p.id}`,
      }))

    return [...memberResults, ...contributionResults, ...proposalResults]
  }, [query, t, members, contributions, proposals])

  const groupedResults = useMemo(() => {
    const groups = new Map<string, SearchResult[]>()
    for (const result of searchResults) {
      const list = groups.get(result.category) || []
      list.push(result)
      groups.set(result.category, list)
    }
    return Array.from(groups.entries())
  }, [searchResults])

  function handleSearchResultClick(href: string) {
    setQuery("")
    setSearchOpen(false)
    router.push(href)
  }

  return (
    <header className="h-16 bg-white border-b border-[#F0F0F0] flex items-center justify-between px-8 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {/* Community switcher dropdown */}
        <div className="relative" ref={commSwitcherRef}>
          <button
            onClick={() => setCommSwitcherOpen(!commSwitcherOpen)}
            className="flex items-center gap-1.5 hover:bg-[#FAFAFA] rounded-lg px-2 py-1 -ml-2 transition-colors"
          >
            <h1 className="text-base font-medium text-[#131517]">{communityName}</h1>
            <ChevronDown className={`w-4 h-4 text-[#939597] transition-transform ${commSwitcherOpen ? 'rotate-180' : ''}`} />
          </button>

          {commSwitcherOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-[#F0F0F0] rounded-2xl z-50 py-1 shadow-lg">
              <div className="px-4 py-2 border-b border-[#F0F0F0]">
                <p className="text-xs font-medium text-[#939597]">
                  {t("yourCommunities")}
                </p>
              </div>

              {ownedCommunities.map((c) => (
                <button
                  key={c.communityId}
                  onClick={() => {
                    setCommSwitcherOpen(false)
                    document.cookie = `youfen_active_community=${c.communityId};path=/;max-age=86400`
                    window.location.href = '/admin'
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[#FAFAFA] transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center text-white text-xs font-medium shrink-0">
                    {c.communityName[0]}
                  </div>
                  <span className="text-[#131517] text-left truncate flex-1">{c.communityName}</span>
                  {c.communityId === communityId && (
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  )}
                </button>
              ))}

              {ownedCommunities.length <= 1 && (
                <button
                  onClick={() => {
                    setCommSwitcherOpen(false)
                    setCreateModalOpen(true)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-emerald-600 hover:bg-emerald-50 transition-colors border-t border-[#F0F0F0]"
                >
                  <Plus className="w-4 h-4" />
                  {t("createNewCommunity")}
                </button>
              )}
            </div>
          )}
        </div>

        {title && (
          <>
            <span className="text-sm text-[#D4D4D4]">/</span>
            <span className="text-sm text-[#939597]">{title}</span>
          </>
        )}
      </div>

      <CreateCommunityModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} />
      <div className="flex items-center gap-4">
        <div className="relative hidden md:block" ref={searchRef}>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl border border-[#F0F0F0] bg-[#FAFAFA] focus-within:border-[#D4D4D4] transition-colors">
            <Search className="w-4 h-4 text-[#939597] shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSearchOpen(true)
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder={t("searchPlaceholder")}
              className="text-sm text-[#131517] placeholder:text-[#939597] bg-transparent outline-none w-64"
            />
          </div>

          {searchOpen && query.trim() && (
            <div className="absolute top-full left-0 mt-2 w-96 bg-white border border-[#F0F0F0] rounded-2xl z-50 py-1 max-h-96 overflow-y-auto">
              {groupedResults.length === 0 ? (
                <p className="px-4 py-3 text-sm text-[#939597]">{t("noResultsFound")}</p>
              ) : (
                groupedResults.map(([category, results]) => (
                  <div key={category} className="py-1">
                    <p className="px-4 pt-1.5 pb-1 text-xs font-medium text-[#939597]">{category}</p>
                    {results.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => handleSearchResultClick(result.href)}
                        className="w-full text-left px-4 py-2 hover:bg-[#FAFAFA] transition-colors"
                      >
                        <p className="text-sm text-[#131517] truncate">{result.label}</p>
                        {result.sublabel && (
                          <p className="text-xs text-[#939597] truncate">{result.sublabel}</p>
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2 rounded-2xl hover:bg-[#FAFAFA] transition-colors"
          >
            <Bell className="w-5 h-5 text-[#525252]" />
            {hasUnread && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>

          {notifOpen && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-[#F0F0F0] rounded-2xl z-50 py-1 max-h-96 overflow-y-auto">
              <div className="px-4 py-2.5 border-b border-[#F0F0F0]">
                <p className="text-sm font-medium text-[#131517]">{t("notifications")}</p>
              </div>
              {notifications.length === 0 ? (
                <p className="px-4 py-3 text-sm text-[#939597]">{t("noNewNotifications")}</p>
              ) : (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className="w-full text-left px-4 py-2.5 hover:bg-[#FAFAFA] transition-colors flex items-start gap-2"
                  >
                    {!readIds.has(item.id) && (
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    )}
                    <div className={readIds.has(item.id) ? "pl-3.5" : ""}>
                      <p className="text-sm text-[#131517]">{item.title}</p>
                      <p className="text-xs text-[#939597] truncate">{item.description}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="relative flex items-center gap-3 pl-4 border-l border-[#F0F0F0]" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-3 hover:bg-[#FAFAFA] rounded-2xl px-2 py-1 transition-colors"
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
            <div className="absolute top-full right-0 mt-2 w-56 bg-white border border-[#F0F0F0] rounded-2xl z-50 py-1">
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
                onClick={() => router.push("/sign-in")}
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
