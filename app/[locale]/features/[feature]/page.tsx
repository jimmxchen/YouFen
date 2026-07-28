import { notFound } from 'next/navigation'
import { MarketingInfoPage } from '@/components/marketing/marketing-info-page'
import { featurePageSlugs, getFeaturePage } from '@/lib/marketing-pages'
import { routing } from '@/i18n/routing'

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    featurePageSlugs.map((feature) => ({ locale, feature }))
  )
}

export default async function FeaturePage({
  params,
}: {
  params: Promise<{ locale: string; feature: string }>
}) {
  const { locale, feature } = await params
  const content = getFeaturePage(locale, feature)
  if (!content) notFound()

  return <MarketingInfoPage content={content} />
}
