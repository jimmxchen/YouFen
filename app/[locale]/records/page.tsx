import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { RecordsExplorer } from '@/components/records/records-explorer'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'records' })
  return {
    title: `${t('title')} - YouFen`,
    description: t('subtitle'),
  }
}

export default async function RecordsPage() {
  const t = await getTranslations('records')
  return (
    <main className="min-h-screen bg-white">
      {/* 浅色毛玻璃页头（UIUX_Rules §4.2） */}
      <header className="sticky top-0 z-50 h-14 border-b border-black/[0.06] bg-white/80 backdrop-blur-[20px]">
        <div className="mx-auto flex h-full max-w-3xl items-center justify-between px-5 sm:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('back')}
          </Link>
          <LanguageSwitcher />
        </div>
      </header>
      <RecordsExplorer />
    </main>
  )
}
