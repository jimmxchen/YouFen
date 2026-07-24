import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { notFound } from 'next/navigation'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import '../globals.css'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

const customFont = localFont({
  src: [
    {
      path: '../../public/font/BUAFC2XP3YCVWDC5LF3GWTKRIOZXURVB.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/font/ITOtz0GJh0f4Y4Fu3osXqgXYuAw.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/font/6Q6YTQSA7J7EBIZ4AJJG7JJSMMDPZUW6.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-custom',
  display: 'swap',
})

export const metadata: Metadata = {
  title: '有份儿 YouFen - 让每个参与者真正有份儿',
  description: '无代码社群共治网站，把成员贡献变成发言权，让大家一起决定社区未来',
  keywords: ['社群治理', '社区管理', 'DAO', '投票', '发言权'],
}

// This is the root layout. It lives INSIDE the [locale] segment on purpose:
// when the locale URL param changes (/zh/... -> /en/...), Next.js re-renders
// this layout, so NextIntlClientProvider receives the new locale's messages.
// A provider above the [locale] segment would never re-render on locale
// switch, leaving all translated text stale.
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }
  // Enables static rendering + makes getMessages() resolve for this locale
  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <html lang={locale}>
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          attributes like data-gr-ext-installed onto <body> before React
          hydrates, causing a benign attribute mismatch. This suppresses that
          one element's warning only — it does not affect children. */}
      <body className={`${customFont.variable} font-sans`} suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
