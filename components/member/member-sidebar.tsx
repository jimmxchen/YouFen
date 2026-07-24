"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { YouFenLogo } from "@/components/brand/youfen-logo"
import { SideSwitcher } from "@/components/admin/side-switcher"

export function MemberSidebar() {
  const t = useTranslations("member")

  return (
    <aside className="w-64 min-h-screen bg-[#FAFAFA] border-r border-[#F0F0F0] flex flex-col fixed left-0 top-0 z-40">
      <div className="h-16 border-b border-[#F0F0F0] flex items-center px-6">
        <Link href="/" className="flex items-center text-[#131517] transition-colors hover:text-[#10B981]" aria-label="YouFen">
          <YouFenLogo markClassName="h-9 w-9" showText={false} />
        </Link>
        <div className="ml-auto">
          <SideSwitcher side="member" />
        </div>
      </div>
      <nav className="flex-1 py-4 px-3">
        <ul className="space-y-1">
          <li>
            <Link
              href="/member"
              className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium text-[#525252] hover:bg-white/60 hover:text-[#131517] transition-[color,background-color] duration-200"
            >
              {t("nav.home")}
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  )
}
