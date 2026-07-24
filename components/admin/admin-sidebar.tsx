"use client"

import { useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { Link, useRouter, usePathname } from "@/i18n/navigation"
import { LayoutDashboard, Users, ClipboardCheck, Vote, ShieldCheck, ChevronRight, Languages, ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { type AdminView, type Member } from "@/types/admin"

const VIEW_LABELS: Record<AdminView, string> = {
  dashboard: "dashboard",
  members: "members",
  contributions: "contributions",
  proposals: "proposals",
  records: "trustedRecords",
}

const ADMIN_VIEWS: AdminView[] = ["dashboard", "members", "contributions", "proposals", "records"]

function ViewIcon({ view }: { view: AdminView }) {
  switch (view) {
    case "dashboard": return <LayoutDashboard className="w-[18px] h-[18px]" />
    case "members": return <Users className="w-[18px] h-[18px]" />
    case "contributions": return <ClipboardCheck className="w-[18px] h-[18px]" />
    case "proposals": return <Vote className="w-[18px] h-[18px]" />
    case "records": return <ShieldCheck className="w-[18px] h-[18px]" />
  }
}

interface MembershipInfo {
  memberId: string
  communityId: string
  communityName: string
  role: string
  voicePower: number
  contributionCount?: number
}

interface AdminSidebarProps {
  communityName: string
  user: Member
  memberships: MembershipInfo[]
}

export function AdminSidebar({ communityName, user, memberships }: AdminSidebarProps) {
  const t = useTranslations("admin")
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [communityOpen, setCommunityOpen] = useState(false)

  const segments = pathname.split("/")
  const rawView = segments[2]
  const activeView = ADMIN_VIEWS.includes(rawView as AdminView) ? (rawView as AdminView) : "dashboard"

  const otherLocale = locale === "zh" ? "en" : "zh"
  const localeLabel = otherLocale === "en" ? "English" : "中文"

  const switchLanguage = () => {
    router.replace(pathname, { locale: otherLocale })
  }

  return (
    <aside className="w-64 min-h-screen bg-[#FAFAFA] border-r border-[#F0F0F0] flex flex-col fixed left-0 top-0 z-40">
      <div className="h-16 flex items-center px-6 border-b border-[#F0F0F0]">
        <Link href="/" className="text-lg font-semibold text-[#131517] hover:text-[#10B981] transition-colors">YouFen</Link>
      </div>

      {/* Community + Role switcher */}
      <div className="px-6 py-4 border-b border-[#F0F0F0] relative">
        <p className="text-xs text-[#939597] mb-1">{t("community")}</p>
        <button
          onClick={() => setCommunityOpen(!communityOpen)}
          className="flex items-center justify-between w-full text-left group"
        >
          <span className="text-sm font-medium text-[#131517] truncate">{communityName}</span>
          <ChevronDown className={cn("w-3.5 h-3.5 text-[#939597] transition-transform", communityOpen && "rotate-180")} />
        </button>
        <p className="text-xs text-[#939597] mt-0.5 capitalize">{user.role}</p>

        {communityOpen && memberships.length > 1 && (
          <div className="absolute top-full left-4 right-4 mt-1 bg-white border border-[#F0F0F0] rounded-lg shadow-lg z-50 py-1">
            {memberships.map((m) => (
              <button
                key={m.communityId}
                onClick={() => setCommunityOpen(false)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-[#FAFAFA] flex items-center justify-between",
                  m.communityName === communityName && "bg-[#F5F5F5]",
                )}
              >
                <div>
                  <div className="font-medium text-[#131517]">{m.communityName}</div>
                  <div className="text-xs text-[#939597] capitalize">{m.role}</div>
                </div>
                {m.communityName === communityName && <Check className="w-4 h-4 text-[#10B981]" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="flex-1 py-4 px-3">
        <ul className="space-y-1">
          {ADMIN_VIEWS.map((view) => {
            const isActive = activeView === view
            return (
              <li key={view}>
                <Link
                  href={view === "dashboard" ? "/admin" : `/admin/${view}`}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-white text-[#131517] shadow-sm border border-[#F0F0F0]"
                      : "text-[#525252] hover:bg-white/60 hover:text-[#131517]",
                  )}
                >
                  <ViewIcon view={view} />
                  <span className="flex-1">{t(VIEW_LABELS[view])}</span>
                  {isActive && <ChevronRight className="w-4 h-4 text-[#10B981]" />}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-[#F0F0F0] space-y-2">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 text-sm text-[#939597] hover:text-[#131517] transition-colors rounded-lg hover:bg-white/60"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          {t("backToLanding")}
        </Link>
        <button
          onClick={switchLanguage}
          className="flex items-center gap-2 px-3 py-2 text-sm text-[#939597] hover:text-[#131517] transition-colors rounded-lg hover:bg-white/60 w-full"
        >
          <Languages className="w-4 h-4" />
          {localeLabel}
        </button>
      </div>
    </aside>
  )
}
