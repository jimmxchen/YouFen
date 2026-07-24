import { notFound } from 'next/navigation'
import { MarketingInfoPage } from '@/components/marketing/marketing-info-page'
import { getMarketingPage } from '@/lib/marketing-pages'

export default async function DemoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const content = getMarketingPage(locale, 'demo')
  if (!content) notFound()

  return <MarketingInfoPage content={content} />
}
