import { defineRouting } from 'next-intl/routing'

// 支持的语言列表 + 默认语言 — single source of truth for the whole app
export const routing = defineRouting({
  locales: ['zh', 'en'],
  defaultLocale: 'zh',
  localePrefix: 'always',
  localeCookie: {
    name: 'NEXT_LOCALE',
    maxAge: 31536000,
  },
})

export type Locale = (typeof routing.locales)[number]
