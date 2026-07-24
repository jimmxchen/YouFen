import { getTranslations } from 'next-intl/server'
import { ContributionTimeline } from '@/components/member/contribution-timeline'
import { MemberProfileActions } from '@/components/member/member-profile-actions'
import { MemberShell } from '@/components/member/member-shell'
import { MobileBottomNav } from '@/components/member/mobile-bottom-nav'
import { PendingContributionList } from '@/components/member/pending-contribution-list'
import { RecordReceiptList } from '@/components/member/record-receipt-list'
import { VoicePowerCard } from '@/components/member/voice-power-card'
import { memberCard, memberMuted, memberSubtle } from '@/components/member/ui'
import { getDemoMember } from '@/lib/demo/member-data'

interface MemberMePageProps {
  params: Promise<{
    locale: string
    communityId: string
  }>
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value)
}

export default async function MemberMePage({ params }: MemberMePageProps) {
  const { locale, communityId } = await params
  const t = await getTranslations('member')
  const member = getDemoMember(communityId)

  return (
    <MemberShell>
      <header className="px-5 pb-5 pt-6 lg:px-0 lg:pb-8 lg:pt-0">
        <p className={`truncate text-sm ${memberSubtle}`}>{member.communityName}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[#131517] lg:text-[40px] lg:font-medium lg:leading-[48px]">
          {t('me.title')}
        </h1>
        <p className={`mt-3 max-w-2xl text-sm leading-6 ${memberMuted} lg:text-base`}>
          {t('me.description')}
        </p>
      </header>

      <div className="px-5 lg:px-0">
        <VoicePowerCard
          voicePower={member.voicePower}
          locale={locale}
          labels={{
            title: t('voicePower.title'),
            active: t('voicePower.active'),
            pending: t('voicePower.pending'),
            rank: t('voicePower.rank', { rank: member.voicePower.rankPercent }),
            earnedThisMonth: t('voicePower.earnedThisMonth', {
              amount: formatNumber(member.voicePower.earnedThisMonth, locale),
            }),
          }}
        />
      </div>

      <div className="grid gap-5 px-5 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:px-0 mt-5">
        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className={memberCard}>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#F0F0F0] bg-white text-sm font-semibold text-[#131517]">
                {member.avatarInitials}
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-[#131517]">{member.name}</h2>
                <p className={`mt-1 text-sm ${memberSubtle}`}>
                  {t('me.role')}: {member.role}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {member.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-[#FAFAFA] px-3 py-1 text-xs text-[#525252]">
                  {tag}
                </span>
              ))}
            </div>
          </section>

          <MemberProfileActions
            contributeHref={`/${locale}/member/${communityId}/contribute`}
            publicHref={`/${locale}/member/${communityId}/public`}
            labels={{
              submitContribution: t('me.submitContribution'),
              viewPublicCommunity: t('me.viewPublicCommunity'),
              shareContributions: t('me.shareContributions'),
              shareCopied: t('me.shareCopied'),
            }}
          />
        </aside>

        <div className="space-y-6">
          <section>
            <h2 id="contributions" className="mb-3 text-xl font-semibold text-[#131517]">
              {t('me.contributions')}
            </h2>
            <PendingContributionList
              communityId={communityId}
              labels={{
                title: t('contribute.type'),
                status: t('status.pending'),
                submittedAt: t('me.submittedAt'),
                proof: t('contribute.proofLink'),
                evidence: t('contribute.evidence'),
              }}
            />
            <ContributionTimeline
              contributions={member.contributions}
              locale={locale}
              labels={{
                approvedBy: t('history.approvedBy'),
                statusLabel: t('history.statusLabel'),
                activeNow: t('history.activeNow'),
                pending: t('history.pending'),
                receiptVerified: t('history.receiptVerified'),
                noReceipt: t('history.noReceipt'),
                emptyTitle: t('history.emptyTitle'),
                emptyBody: t('history.emptyBody'),
              }}
            />
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[#131517]">{t('me.trustedRecords')}</h2>
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
