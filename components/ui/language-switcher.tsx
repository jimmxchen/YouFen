'use client'

import { useLocale } from 'next-intl'
import { useRouter, usePathname } from 'next/navigation'
import { Globe } from 'lucide-react'

export function LanguageSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  const switchLanguage = () => {
    const newLocale = locale === 'zh' ? 'en' : 'zh'
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`)
    router.push(newPath)
  }

  return (
    <button
      onClick={switchLanguage}
      className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10"
      aria-label="Switch language"
    >
      <Globe className="w-4 h-4" />
      <span className="text-xs font-medium">{locale === 'zh' ? 'EN' : '中'}</span>
    </button>
  )
}
