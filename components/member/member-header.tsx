"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { Bell, Search, LogOut, User } from "lucide-react"
import { VoicePowerBadge } from "@/components/admin/voice-power-badge"
import { type CommunityMember } from "@/types/member"

interface MemberHeaderProps {
  member: CommunityMember
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

export function MemberHeader({ member }: MemberHeaderProps) {
  const t = useTranslations("member")
  const router = useRouter()
  const baseHref = `/member/${member.communityId}`

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const [readIds, setReadIds] = useState<Set<string>>(new Set())

  const [query, setQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

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
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const notifications: NotificationItem[] = useMemo(() => {
    const fromActivity = member.activity
      .filter((a) => a.status === "new" || a.status === "active")
      .map((a) => ({
        id: `activity-${a.id}`,
        title: a.title,
        description: a.description,
        createdAt: a.createdAt,
        href: baseHref,
      }))

    const fromProposals = member.availableProposals
      .filter((p) => p.status === "active")
      .map((p) => ({
        id: `proposal-${p.id}`,
        title: t("header.notificationVoteEndingSoon"),
        description: `${p.title} (${p.endsAt})`,
        createdAt: p.endsAt,
        href: `${baseHref}${p.href}`,
      }))

    const fromContributions = member.contributions
      .filter((c) => c.activationStatus === "pending")
      .map((c) => ({
        id: `contribution-${c.id}`,
        title: t("header.notificationContributionPending"),
        description: c.title,
        createdAt: c.createdAt,
        href: `${baseHref}/me`,
      }))

    return [...fromActivity, ...fromProposals, ...fromContributions].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    )
  }, [member, baseHref, t])

  const hasUnread = notifications.some((n) => !readIds.has(n.id))

  function handleNotificationClick(item: NotificationItem) {
    setReadIds((prev) => new Set(prev).add(item.id))
    setNotifOpen(false)
    router.push(item.href)
  }

  const searchResults: SearchResult[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []

    const activityResults = member.activity
      .filter((a) => a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
      .slice(0, 5)
      .map((a) => ({
        id: `activity-${a.id}`,
        category: t("header.categoryActivity"),
        label: a.title,
        sublabel: a.description,
        href: baseHref,
      }))

    const contributionResults = member.contributions
      .filter((c) => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
      .slice(0, 5)
      .map((c) => ({
        id: `contribution-${c.id}`,
        category: t("header.categoryContributions"),
        label: c.title,
        sublabel: c.description,
        href: `${baseHref}/me`,
      }))

    const proposalResults = member.availableProposals
      .filter((p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
      .slice(0, 5)
      .map((p) => ({
        id: `proposal-${p.id}`,
        category: t("header.categoryVotes"),
        label: p.title,
        sublabel: p.description,
        href: `${baseHref}${p.href}`,
      }))

    const chatResults = member.chatRooms
      .filter(
        (room) =>
          room.title.toLowerCase().includes(q) || room.description.toLowerCase().includes(q)
      )
      .slice(0, 5)
      .map((room) => ({
        id: `chat-${room.id}`,
        category: t("header.categoryChats"),
        label: room.title,
        sublabel: room.description,
        href: `${baseHref}/chat/${room.id}`,
      }))

    return [...activityResults, ...contributionResults, ...proposalResults, ...chatResults]
  }, [query, member, baseHref, t])

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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#F0F0F0] bg-white px-5 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-base font-medium text-[#131517]">{member.communityName}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative hidden md:block" ref={searchRef}>
          <div className="flex items-center gap-2 rounded-lg border border-[#F0F0F0] bg-[#FAFAFA] px-3 py-1.5 transition-colors focus-within:border-[#D4D4D4]">
            <Search className="w-4 h-4 shrink-0 text-[#939597]" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSearchOpen(true)
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder={t("header.searchPlaceholder")}
              className="w-64 bg-transparent text-sm text-[#131517] outline-none placeholder:text-[#939597]"
            />
          </div>

          {searchOpen && query.trim() && (
            <div className="absolute top-full left-0 z-50 mt-2 max-h-96 w-96 overflow-y-auto rounded-xl border border-[#F0F0F0] bg-white py-1 shadow-lg">
              {groupedResults.length === 0 ? (
                <p className="px-4 py-3 text-sm text-[#939597]">{t("header.noResultsFound")}</p>
              ) : (
                groupedResults.map(([category, results]) => (
                  <div key={category} className="py-1">
                    <p className="px-4 pb-1 pt-1.5 text-xs font-medium text-[#939597]">{category}</p>
                    {results.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => handleSearchResultClick(result.href)}
                        className="w-full text-left px-4 py-2 hover:bg-[#FAFAFA] transition-colors"
                      >
                        <p className="truncate text-sm text-[#131517]">{result.label}</p>
                        {result.sublabel && (
                          <p className="truncate text-xs text-[#939597]">{result.sublabel}</p>
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
            className="relative rounded-lg p-2 transition-colors hover:bg-[#FAFAFA]"
          >
            <Bell className="h-5 w-5 text-[#525252]" />
            {hasUnread && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>

          {notifOpen && (
            <div className="absolute top-full right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-[#F0F0F0] bg-white py-1 shadow-lg">
              <div className="border-b border-[#F0F0F0] px-4 py-2.5">
                <p className="text-sm font-medium text-[#131517]">{t("header.notifications")}</p>
              </div>
              {notifications.length === 0 ? (
                <p className="px-4 py-3 text-sm text-[#939597]">{t("header.noNewNotifications")}</p>
              ) : (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-[#FAFAFA] transition-colors"
                  >
                    {!readIds.has(item.id) && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                    )}
                    <div className={readIds.has(item.id) ? "pl-3.5" : ""}>
                      <p className="text-sm text-[#131517]">{item.title}</p>
                      <p className="truncate text-xs text-[#939597]">{item.description}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="relative flex items-center gap-3 border-l border-[#F0F0F0] pl-4" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-[#FAFAFA]"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-400 text-sm font-medium text-white">
              {member.avatarInitials}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium text-[#131517]">{member.name}</p>
              <VoicePowerBadge value={member.voicePower.total} size="sm" />
            </div>
          </button>

          {menuOpen && (
            <div className="absolute top-full right-0 z-50 mt-2 w-56 rounded-xl border border-[#F0F0F0] bg-white py-1 shadow-lg">
              <div className="border-b border-[#F0F0F0] px-4 py-3">
                <p className="text-sm font-medium text-[#131517]">{member.name}</p>
                <p className="text-xs text-[#939597] capitalize mt-0.5">{member.role}</p>
                <p className="text-xs text-[#939597] mt-0.5">{member.email}</p>
                <div className="mt-1.5">
                  <VoicePowerBadge value={member.voicePower.total} size="sm" />
                </div>
              </div>

              <button
                onClick={() => {
                  setMenuOpen(false)
                  router.push(`${baseHref}/me`)
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-[#525252] hover:bg-[#FAFAFA] transition-colors"
              >
                <User className="h-4 w-4" />
                {t("header.myProfile")}
              </button>
              <button
                onClick={() => router.push("/sign-in")}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                {t("header.signOut")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
