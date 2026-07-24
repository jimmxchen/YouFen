import { notFound } from 'next/navigation'
import { MarketingInfoPage } from '@/components/marketing/marketing-info-page'
import { getMarketingPage } from '@/lib/marketing-pages'

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const content = getMarketingPage(locale, 'terms')
  if (!content) notFound()

  return <MarketingInfoPage content={content} />
}
