'use client'
import Link from 'next/link'
import { CircleUserRound, ChevronRight, Home, Languages, MessageCircle, Vote } from 'lucide-react'
import { YouFenLogo } from '@/components/brand/youfen-logo'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter, usePathname } from '@/i18n/navigation'

interface MobileBottomNavProps {
  locale: string
  communityId: string
  active: 'home' | 'chat' | 'vote' | 'me'
  labels: {
    home: string
    chat: string
    vote: string
    me: string
  }
}

const items = [
  {
    id: 'home',
    href: '',
    icon: Home,
  },
  {
    id: 'chat',
    href: '/chat',
    icon: MessageCircle,
  },
  {
    id: 'vote',
    href: '/vote',
    icon: Vote,
  },
  {
    id: 'me',
    href: '/me',
    icon: CircleUserRound,
  },
] as const

export function MobileBottomNav({ locale, communityId, active, labels }: MobileBottomNavProps) {
  const t = useTranslations('member')
  const currentLocale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  const otherLocale = currentLocale === 'zh' ? 'en' : 'zh'
  const localeLabel = otherLocale === 'en' ? 'English' : '中文'

  const switchLanguage = () => {
    router.replace(pathname, { locale: otherLocale })
  }

  return (
    <>
      <nav className="fixed bottom-0 left-1/2 z-30 grid w-full max-w-md -translate-x-1/2 grid-cols-4 border-t border-black/[0.08] bg-white/80 px-3 py-2 backdrop-blur-[20px] lg:hidden">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = active === item.id

          return (
            <Link
              key={item.id}
              href={`/${locale}/member/${communityId}${item.href}`}
              className={`flex min-h-12 flex-col items-center justify-center rounded-2xl text-xs font-medium transition ${
                isActive ? 'bg-black/[0.06] text-[#131517]' : 'text-[#939597] hover:text-[#525252]'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="mb-1 h-5 w-5" aria-hidden="true" />
              {labels[item.id]}
            </Link>
          )
        })}
      </nav>

      <nav className="fixed left-0 top-0 z-40 hidden min-h-screen w-64 flex-col border-r border-[#F0F0F0] bg-[#FAFAFA] lg:flex">
        <Link
          href={`/${locale}/member/${communityId}`}
          className="flex h-16 items-center border-b border-[#F0F0F0] px-6 text-[#131517] transition-colors hover:text-[#10B981]"
          aria-label="YouFen"
        >
          <YouFenLogo markClassName="h-9 w-9" textClassName="text-lg" />
        </Link>

        <div className="flex flex-1 flex-col gap-1 px-3 py-4">
          {items.map((item) => {
            const Icon = item.icon
            const isActive = active === item.id

            return (
              <Link
                key={item.id}
                href={`/${locale}/member/${communityId}${item.href}`}
                className={`flex min-h-10 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-[color,background-color] duration-200 border border-transparent ${
                  isActive
                    ? 'border-[#F0F0F0] bg-white text-[#131517]'
                    : 'text-[#525252] hover:bg-white/60 hover:text-[#131517]'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="flex-1">{labels[item.id]}</span>
                {isActive ? <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" /> : null}
              </Link>
            )
          })}
        </div>

        <div className="p-4 border-t border-[#F0F0F0] space-y-2">
          <Link
            href={`/${locale}/`}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[#939597] hover:text-[#131517] transition-colors rounded-2xl hover:bg-white/60"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            {t('backToLanding')}
          </Link>
          <button
            onClick={switchLanguage}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[#939597] hover:text-[#131517] transition-colors rounded-2xl hover:bg-white/60 w-full"
          >
            <Languages className="w-4 h-4" />
            {localeLabel}
          </button>
        </div>
      </nav>
    </>
  )
}
