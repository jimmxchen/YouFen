"use client"

import { ArrowUpRight, Building2, UsersRound } from "lucide-react"
import { useLocale } from "next-intl"
import { Link } from "@/i18n/navigation"
import { Navbar } from "@/components/layout/navbar"

const roleCards = [
  {
    href: "/admin",
    title: {
      en: "I'm an operator",
      zh: "我是运营者",
    },
    description: {
      en: "Create a community, shape contribution rules, review member activity, and manage trusted decisions.",
      zh: "创建社群、制定贡献规则、审核成员活动，并管理可信决策。",
    },
    icon: Building2,
    accent: "bg-blue-400 text-white",
    surface:
      "bg-gradient-to-br from-blue-50 via-white to-white text-[#131517] border-blue-100 hover:border-blue-200 hover:shadow-[0_28px_70px_rgba(59,130,246,0.16)]",
    eyebrowClass: "text-[#939597]",
    bodyClass: "text-[#525252]",
    arrowClass: "bg-blue-50 text-blue-600 border-blue-100",
    glow: "from-blue-100/90 via-white/0 to-white/0",
  },
  {
    href: "/member/demo",
    title: {
      en: "I'm a member",
      zh: "我是成员",
    },
    description: {
      en: "Join your community, follow updates, submit contributions, and see how your participation grows.",
      zh: "加入你的社群、查看动态、提交贡献，并看到自己的参与持续积累。",
    },
    icon: UsersRound,
    accent: "bg-emerald-400 text-white",
    surface:
      "bg-white text-[#131517] border-[#E9E9E9] hover:border-emerald-200 hover:shadow-[0_28px_70px_rgba(16,185,129,0.14)]",
    eyebrowClass: "text-[#939597]",
    bodyClass: "text-[#525252]",
    arrowClass: "bg-[#F7F7F7] text-[#131517] border-[#ECECEC]",
    glow: "from-emerald-100/80 via-white/0 to-white/0",
  },
]

export default function ChooseRolePage() {
  const locale = useLocale()
  const copyLocale = locale === "zh" ? "zh" : "en"
  const cardPrompt = copyLocale === "zh" ? "用有份可以做什么？" : "What can we do with YouFen?"

  return (
    <main className="min-h-screen bg-white flex flex-col overflow-hidden">
      <Navbar forceLight />
      <div className="flex flex-1 items-center justify-center px-5 pb-14 pt-28 sm:px-8 lg:pt-32">
        <section className="w-full max-w-6xl">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-7 md:grid-cols-2 lg:gap-10">
            {roleCards.map((card) => {
              const Icon = card.icon

              return (
                <Link
                  key={card.href}
                  href={card.href}
                  className={`group relative flex aspect-[1.08/1] min-h-[300px] overflow-hidden rounded-[32px] border p-7 shadow-sm transition-all duration-300 hover:-translate-y-2 sm:p-8 ${card.surface}`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${card.glow}`} />
                  <div className="absolute inset-x-8 top-0 h-px bg-white/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="relative flex h-full w-full flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="min-w-0 flex-1 text-3xl font-semibold leading-tight tracking-tight sm:text-[34px] sm:leading-tight lg:text-[38px] xl:whitespace-nowrap">
                        {card.title[copyLocale]}
                      </h2>
                      <div className={`flex size-11 items-center justify-center rounded-full border transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1 ${card.arrowClass}`}>
                        <ArrowUpRight className="size-5" />
                      </div>
                    </div>

                    <div className="mt-auto flex items-center gap-6">
                      <div className={`flex size-24 shrink-0 items-center justify-center rounded-[28px] transition-transform duration-300 group-hover:scale-105 sm:size-28 ${card.accent}`}>
                        <Icon className="size-12 sm:size-14" />
                      </div>
                      <div className="flex min-h-24 flex-1 flex-col justify-center sm:min-h-28">
                        <p className={`text-sm font-semibold leading-5 ${card.eyebrowClass}`}>
                          {cardPrompt}
                        </p>
                        <p className={`mt-2 max-w-md text-base leading-6 ${card.bodyClass}`}>
                          {card.description[copyLocale]}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}
