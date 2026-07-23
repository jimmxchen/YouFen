import Link from 'next/link'
import { History, ReceiptText, ShieldCheck } from 'lucide-react'

interface MobileBottomNavProps {
  locale: string
  communityId: string
  active: 'home' | 'history' | 'records'
  labels: {
    home: string
    history: string
    records: string
  }
}

const items = [
  {
    id: 'home',
    href: '',
    icon: ShieldCheck,
  },
  {
    id: 'history',
    href: '/history',
    icon: History,
  },
  {
    id: 'records',
    href: '/records',
    icon: ReceiptText,
  },
] as const

export function MobileBottomNav({ locale, communityId, active, labels }: MobileBottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-1/2 z-30 grid w-full max-w-md -translate-x-1/2 grid-cols-3 border-t border-black/5 bg-white/90 px-3 py-2 backdrop-blur">
      {items.map((item) => {
        const Icon = item.icon
        const isActive = active === item.id

        return (
          <Link
            key={item.id}
            href={`/${locale}/member/${communityId}${item.href}`}
            className={`flex min-h-12 flex-col items-center justify-center rounded-2xl text-xs font-medium ${
              isActive ? 'text-[#de475e]' : 'text-[#6f7174]'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon className="mb-1 h-5 w-5" aria-hidden="true" />
            {labels[item.id]}
          </Link>
        )
      })}
    </nav>
  )
}
