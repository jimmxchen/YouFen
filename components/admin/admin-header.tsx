"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { Bell, Search, LogOut, User } from "lucide-react"
import { VoicePowerBadge } from "@/components/admin/voice-power-badge"
import { type Member } from "@/types/admin"
import { demoMembers, demoContributions, demoProposals, demoTasks } from "@/lib/demo-data"

interface AdminHeaderProps {
  communityName: string
  currentUser: Member
  title?: string
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

export function AdminHeader({ communityName, currentUser, title }: AdminHeaderProps) {
  const t = useTranslations("admin")
  const roleLabels: Record<Member["role"], string> = {
    owner: t("roleOwner"),
    manager: t("roleManager"),
    member: t("roleMember"),
  }
  const router = useRouter()
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
    const fromContributions = demoContributions
      .filter((c) => c.status === "pending")
      .map((c) => ({
        id: `contribution-${c.id}`,
        title: "New contribution awaiting review",
        description: `${c.memberName}: ${c.description}`,
        createdAt: c.createdAt,
        href: "/admin/contributions",
      }))

    const fromProposals = demoProposals
      .filter((p) => p.status === "active")
      .map((p) => ({
        id: `proposal-${p.id}`,
        title: "Proposal ending soon",
        description: `${p.title} (ends ${p.endTime})`,
        createdAt: p.createdAt,
        href: `/admin/proposals/${p.id}`,
      }))

    const fromTasks = demoTasks
      .filter((tsk) => tsk.status === "pending" && tsk.priority === "high")
      .map((tsk) => ({
        id: `task-${tsk.id}`,
        title: "High-priority task due",
        description: `${tsk.title} (due ${tsk.dueDate})`,
        createdAt: tsk.createdAt,
        href: "/admin/management",
      }))

    return [...fromContributions, ...fromProposals, ...fromTasks].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    )
  }, [])

  const hasUnread = notifications.some((n) => !readIds.has(n.id))

  function handleNotificationClick(item: NotificationItem) {
    setReadIds((prev) => new Set(prev).add(item.id))
    setNotifOpen(false)
    router.push(item.href)
  }

  const searchResults: SearchResult[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []

    const memberResults = demoMembers
      .filter((m) => m.name.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q))
      .slice(0, 5)
      .map((m) => ({
        id: `member-${m.id}`,
        category: t("members"),
        label: m.name,
        sublabel: m.email || "",
        href: `/admin/members/${m.id}`,
      }))

    const contributionResults = demoContributions
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

    const proposalResults = demoProposals
      .filter((p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
      .slice(0, 5)
      .map((p) => ({
        id: `proposal-${p.id}`,
        category: t("polls"),
        label: p.title,
        sublabel: p.description,
        href: `/admin/proposals/${p.id}`,
      }))

    const taskResults = demoTasks
      .filter((tsk) => tsk.title.toLowerCase().includes(q) || tsk.description.toLowerCase().includes(q))
      .slice(0, 5)
      .map((tsk) => ({
        id: `task-${tsk.id}`,
        category: t("management"),
        label: tsk.title,
        sublabel: tsk.assigneeName,
        href: "/admin/management",
      }))

    return [...memberResults, ...contributionResults, ...proposalResults, ...taskResults]
  }, [query, t])

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
        {title ? (
          <>
            <h1 className="text-base font-medium text-[#131517]">{communityName}</h1>
            <span className="text-sm text-[#D4D4D4]">/</span>
            <span className="text-sm text-[#939597]">{title}</span>
          </>
        ) : (
          <h1 className="text-base font-medium text-[#131517]">{communityName}</h1>
        )}
      </div>
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
                <p className="text-xs text-[#939597] mt-0.5">{roleLabels[currentUser.role]}</p>
                <p className="text-xs text-[#939597] mt-0.5">{currentUser.email}</p>
                <div className="mt-1.5">
                  <VoicePowerBadge value={currentUser.voicePower} size="sm" />
                </div>
              </div>

              <button
                onClick={() => router.push("/admin")}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#525252] hover:bg-[#FAFAFA] transition-colors"
              >
                <User className="w-4 h-4" />
                {t("myDashboard")}
              </button>
              <button
                onClick={() => router.push("/sign-in")}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                {t("signOut")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
