import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { AvailableVotes } from '@/components/member/available-votes'
import { MemberImpactCard } from '@/components/member/member-impact-card'
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

function receiptStatusLabel(status: string, labels: Record<string, string>) {
  if (status === 'verified') return labels.verified
  if (status === 'failed') return labels.failed
  return labels.pending
}

function formatToken(value: number, symbol: string) {
  return `${new Intl.NumberFormat('en-US').format(value)} ${symbol}`
}

function formatPercent(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`
}

export default async function MemberCommunityPage({ params }: MemberPageProps) {
  const t = await getTranslations('member')
  const member = getDemoMember(params.communityId)
  const homeHref = `/${params.locale}/member/${params.communityId}`
  const historyHref = `${homeHref}/history`
  const recordsHref = `${homeHref}/records`

  const receiptLabels = {
    verified: t('status.verified'),
    failed: t('status.failed'),
    pending: t('status.pending'),
  }

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
            earned: formatToken(member.token.earnedThisMonth, member.token.symbol),
            minted: formatToken(member.token.communityMintedThisMonth, member.token.symbol),
            from: formatPercent(member.token.ownershipChange.from),
            to: formatPercent(member.token.ownershipChange.to),
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

        <MemberImpactCard
          member={member}
          historyHref={historyHref}
          labels={{
            eyebrow: t('dashboard.history.eyebrow'),
            title: t('dashboard.history.title'),
            viewHistory: t('dashboard.history.viewHistory'),
            emptyTitle: t('dashboard.history.emptyTitle'),
            emptyBody: t('dashboard.history.emptyBody'),
            approvedBy: t('dashboard.history.approvedBy'),
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

        <section className="rounded-[24px] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-[#6f7174]">{t('dashboard.receipts.eyebrow')}</p>
              <h2 className="text-lg font-semibold">{t('dashboard.receipts.title')}</h2>
            </div>
            <Link
              href={recordsHref}
              className="flex items-center gap-1 text-sm font-medium text-[#de475e]"
            >
              {t('dashboard.receipts.viewAll')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <p className="mb-4 text-sm leading-6 text-[#6f7174]">
            {t('dashboard.receipts.description')}
          </p>

          {member.receipts.length === 0 ? (
            <div className="rounded-2xl bg-[#f8f7f4] p-4">
              <h3 className="text-sm font-semibold">{t('dashboard.receipts.emptyTitle')}</h3>
              <p className="mt-1 text-sm leading-6 text-[#6f7174]">
                {t('dashboard.receipts.emptyBody')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {member.receipts.slice(0, 2).map((receipt) => (
                <article key={receipt.id} className="rounded-2xl bg-[#f8f7f4] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">{receipt.title}</h3>
                      <p className="mt-1 text-xs text-[#6f7174]">
                        {receipt.network} · {receipt.createdAt}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[#333537]">
                      {receiptStatusLabel(receipt.status, receiptLabels)}
                    </span>
                  </div>
                  {receipt.txHash ? (
                    <p className="mt-3 truncate rounded-xl bg-white px-3 py-2 text-xs text-[#6f7174]">
                      {receipt.txHash}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
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
