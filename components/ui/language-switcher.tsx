'use client'

import { useLocale } from 'next-intl'
import { createNavigation } from 'next-intl/navigation'
import { Globe } from 'lucide-react'

const { usePathname, useRouter } = createNavigation()

interface LanguageSwitcherProps {
  isDark?: boolean
}

export function LanguageSwitcher({ isDark = false }: LanguageSwitcherProps) {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  const switchLanguage = () => {
    const newLocale = locale === 'zh' ? 'en' : 'zh'
    // usePathname() already strips the locale prefix (e.g. '/features' not '/zh/features')
    // Pass the target locale via the `locale` option so next-intl prefixes correctly
    router.push(pathname, { locale: newLocale })
  }

  const iconColor = isDark ? '#d1d5db' : '#131517'
  const iconHoverColor = isDark ? '#ffffff' : '#939597'

  return (
    <button
      onClick={switchLanguage}
      className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all"
      style={{
        color: iconColor,
        backgroundColor: 'transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = iconHoverColor
        e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = iconColor
        e.currentTarget.style.backgroundColor = 'transparent'
      }}
      aria-label="Switch language"
    >
      <Globe className="w-4 h-4" style={{ color: iconColor }} />
      <span className="text-xs font-medium">{locale === 'zh' ? 'EN' : '中'}</span>
    </button>
  )
}
