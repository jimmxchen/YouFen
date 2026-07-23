import { getTranslations } from 'next-intl/server'
import { AvailableVotes } from '@/components/member/available-votes'
import { MemberShell } from '@/components/member/member-shell'
import { MobileBottomNav } from '@/components/member/mobile-bottom-nav'
import { OwnershipTrendCard } from '@/components/member/ownership-trend-card'
import { PendingTokenCard } from '@/components/member/pending-token-card'
import { TokenSummaryCard } from '@/components/member/token-summary-card'
import { getDemoMember } from '@/lib/demo/member-data'

interface MemberPageProps {
  params: {
    locale: string
    communityId: string
  }
}

function formatToken(value: number, symbol: string, locale: string) {
  return `${new Intl.NumberFormat(locale).format(value)} ${symbol}`
}

function formatPercent(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value) + '%'
}

export default async function MemberCommunityPage({ params }: MemberPageProps) {
  const t = await getTranslations('member')
  const member = getDemoMember(params.communityId)

  return (
    <MemberShell>
      <header className="px-5 pb-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-[#6f7174]">{member.communityName}</p>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-normal">
              {t('dashboard.greeting', { name: member.name })}
            </h1>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-semibold shadow-sm">
            {member.avatarInitials}
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-[#6f7174]">
          {member.communityDescription}
        </p>
      </header>

      <div className="space-y-5 px-5">
        <TokenSummaryCard
          token={member.token}
          locale={params.locale}
          labels={{
            title: t('dashboard.token.title'),
            active: t('dashboard.token.active'),
            pending: t('dashboard.token.pending'),
            ownershipShare: t('dashboard.token.ownershipShare'),
            ownershipHint: t('dashboard.token.ownershipHint'),
            voteShare: t('dashboard.token.voteShare'),
          }}
        />

        <OwnershipTrendCard
          title={t('dashboard.ownershipTrend.title')}
          description={t('dashboard.ownershipTrend.description', {
            earned: formatToken(
              member.token.earnedThisMonth,
              member.token.symbol,
              params.locale
            ),
            minted: formatToken(
              member.token.communityMintedThisMonth,
              member.token.symbol,
              params.locale
            ),
            from: formatPercent(member.token.ownershipChange.from, params.locale),
            to: formatPercent(member.token.ownershipChange.to, params.locale),
          })}
        />

        <PendingTokenCard
          member={member}
          locale={params.locale}
          labels={{
            eyebrow: t('dashboard.pending.eyebrow'),
            activates: t('dashboard.pending.activates'),
            emptyTitle: t('dashboard.pending.emptyTitle'),
            emptyBody: t('dashboard.pending.emptyBody'),
          }}
        />

        <AvailableVotes
          proposals={member.availableProposals}
          locale={params.locale}
          tokenSymbol={member.token.symbol}
          labels={{
            title: t('dashboard.votes.title'),
            snapshotWeight: t('dashboard.votes.snapshotWeight'),
            emptyTitle: t('dashboard.votes.emptyTitle'),
            emptyBody: t('dashboard.votes.emptyBody'),
            status: {
              active: t('dashboard.votes.status.active'),
              upcoming: t('dashboard.votes.status.upcoming'),
              ended: t('dashboard.votes.status.ended'),
            },
          }}
        />
      </div>

      <MobileBottomNav
        locale={params.locale}
        communityId={params.communityId}
        active="home"
        labels={{
          home: t('nav.home'),
          history: t('nav.history'),
          records: t('nav.records'),
        }}
      />
    </MemberShell>
  )
}
