import { getRequestConfig } from 'next-intl/server'

export const locales = ['zh', 'en'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'zh'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const validLocale =
    requested && locales.includes(requested as Locale)
      ? (requested as Locale)
      : defaultLocale

  return {
    locale: validLocale,
    messages: (await import(`./messages/${validLocale}.json`)).default,
  }
})
