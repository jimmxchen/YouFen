import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { locales } from '@/i18n'
import '../globals.css'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
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

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params;
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={`${customFont.variable} font-sans`}>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
