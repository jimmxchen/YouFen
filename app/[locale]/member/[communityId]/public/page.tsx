import Link from 'next/link'
import { ArrowLeft, FileCheck2, Users } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getMemberProfile } from '@/lib/api/member/queries'
import { MemberShell } from '@/components/member/member-shell'
import { MobileBottomNav } from '@/components/member/mobile-bottom-nav'
import { RecordReceiptList } from '@/components/member/record-receipt-list'
import { memberCard, memberMuted, memberSubtle } from '@/components/member/ui'

interface MemberPublicPageProps {
  params: Promise<{
    locale: string
    communityId: string
  }>
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value)
}

export default async function MemberPublicPage({ params }: MemberPublicPageProps) {
  const { locale, communityId } = await params
  const t = await getTranslations('member')
  const userId = await getSession()
  if (!userId) redirect('/sign-in')
  const member = await getMemberProfile(userId, communityId)
  const meHref = `/${locale}/member/${communityId}/me`

  return (
    <MemberShell member={member}>
      <header className="px-5 pb-5 pt-6 lg:px-0 lg:pb-8 lg:pt-0">
        <Link
          href={meHref}
          className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#F0F0F0] bg-white transition-all hover:border-[#E5E5E5] hover:bg-[#FAFAFA]"
          aria-label={t('public.backToMe')}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <p className={`truncate text-sm ${memberSubtle}`}>{t('public.label')}</p>
        <h1 className="text-3xl font-semibold tracking-normal text-[#131517] lg:text-[40px] lg:font-medium lg:leading-[48px]">
          {member.communityName}
        </h1>
        <p className={`mt-3 max-w-2xl text-sm leading-6 ${memberMuted} lg:text-base`}>
          {member.communityDescription}
        </p>
      </header>

      <div className="grid gap-5 px-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:px-0">
        <div className="space-y-5">
          <section className={memberCard}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Users className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#131517]">{t('public.contributors')}</h2>
                <p className={`mt-1 text-sm ${memberMuted}`}>{t('public.contributorsBody')}</p>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-[#F0F0F0]">
              {member.featuredContributors.map((contributor, index) => (
                <div
                  key={contributor.name}
                  className={`flex min-h-14 items-center gap-3 px-4 py-3 ${
                    index > 0 ? 'border-t border-[#F0F0F0]' : ''
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-[#FAFAFA] text-sm font-semibold text-[#131517]">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#131517]">{contributor.name}</p>
                    <p className={`mt-0.5 truncate text-xs ${memberSubtle}`}>{contributor.role}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-[#131517]">
                    {formatNumber(contributor.voicePower, locale)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-[#131517]">{t('public.records')}</h2>
            </div>
            <RecordReceiptList
              receipts={member.receipts}
              labels={{
                verified: t('status.verified'),
                failed: t('status.failed'),
                pending: t('status.pending'),
                blockHeight: t('records.blockHeight'),
                receiptHash: t('records.receiptHash'),
                waiting: t('records.waiting'),
                viewExplorer: t('records.viewExplorer'),
                emptyTitle: t('records.emptyTitle'),
                emptyBody: t('records.emptyBody'),
              }}
            />
          </section>
        </div>

        <aside className={`${memberCard} lg:sticky lg:top-24`}>
          <h2 className="text-xl font-semibold text-[#131517]">{t('public.stats')}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label={t('public.members')} value={formatNumber(member.stats.members, locale)} />
            <Metric
              label={t('public.voicePower')}
              value={formatNumber(member.voicePower.total, locale)}
            />
            <Metric
              label={t('public.contributions')}
              value={formatNumber(member.stats.contributionsThisWeek, locale)}
            />
            <Metric
              label={t('public.trustedRecords')}
              value={formatNumber(member.stats.trustedRecords, locale)}
            />
          </div>
        </aside>
      </div>

      <MobileBottomNav
        locale={locale}
        communityId={communityId}
        active="me"
        labels={{
          home: t('nav.home'),
          chat: t('nav.chat'),
          vote: t('nav.vote'),
          me: t('nav.me'),
        }}
      />
    </MemberShell>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#F0F0F0] bg-[#FAFAFA] p-3">
      <p className="text-xl font-semibold text-[#131517]">{value}</p>
      <p className="mt-1 text-xs text-[#939597]">{label}</p>
    </div>
  )
}
