import { notFound } from 'next/navigation'
import { MarketingInfoPage } from '@/components/marketing/marketing-info-page'
import { getResourcePage, resourcePageSlugs } from '@/lib/marketing-pages'
import { routing } from '@/i18n/routing'

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    resourcePageSlugs.map((resource) => ({ locale, resource }))
  )
}

export default async function ResourcePage({
  params,
}: {
  params: Promise<{ locale: string; resource: string }>
}) {
  const { locale, resource } = await params
  const content = getResourcePage(locale, resource)
  if (!content) notFound()

  return <MarketingInfoPage content={content} />
}
