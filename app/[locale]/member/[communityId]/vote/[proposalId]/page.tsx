import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ArrowLeft, FileCheck2 } from 'lucide-react'
import { MemberShell } from '@/components/member/member-shell'
import { MobileBottomNav } from '@/components/member/mobile-bottom-nav'
import { PollVoteCard } from '@/components/member/poll-vote-card'
import { memberCard, memberInset, memberMuted, memberSubtle } from '@/components/member/ui'
import { getDemoMember } from '@/lib/demo/member-data'

interface MemberVoteDetailPageProps {
  params: Promise<{
    locale: string
    communityId: string
    proposalId: string
  }>
}

export default async function MemberVoteDetailPage({ params }: MemberVoteDetailPageProps) {
  const { locale, communityId, proposalId } = await params
  const t = await getTranslations('member')
  const member = getDemoMember(communityId)
  const proposal = member.availableProposals.find((p) => p.id === proposalId)

  if (!proposal) {
    notFound()
  }

  const voteHref = `/${locale}/member/${communityId}/vote`
  const formatNumber = (value: number) => new Intl.NumberFormat(locale).format(value)

  const weightTiles = [
    { label: t('vote.yourVoicePower'), value: member.voicePower.active },
    { label: t('vote.snapshotWeight'), value: proposal.snapshotWeight },
    { label: t('vote.pendingVoicePower'), value: member.voicePower.pending },
  ]

  return (
    <MemberShell member={member}>
      <header className="px-5 pb-5 pt-6 lg:px-0 lg:pb-8 lg:pt-0">
        <Link
          href={voteHref}
          className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#F0F0F0] bg-white transition-all hover:border-[#E5E5E5] hover:bg-[#FAFAFA]"
          aria-label={t('vote.backToVotes')}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <p className={`truncate text-base ${memberSubtle}`}>
          {t(`status.${proposal.status}`)}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[#131517] lg:text-[40px] lg:font-medium lg:leading-[48px]">
          {proposal.title}
        </h1>
        <p className={`mt-3 max-w-2xl text-sm leading-6 ${memberMuted} lg:text-base`}>
          {proposal.description}
        </p>
        {proposal.trustedRecordStatus === 'verified' ? (
          <p className="mt-4 flex items-center gap-2 text-sm font-medium text-emerald-700">
            <FileCheck2 className="h-4 w-4" aria-hidden="true" />
            {t('vote.trustedRecord')}
          </p>
        ) : null}
      </header>

      <div className="px-5 lg:px-0">
        <section className={`${memberCard} mb-4`}>
          <div className="grid grid-cols-3 gap-3">
            {weightTiles.map((tile) => (
              <div key={tile.label} className={memberInset}>
                <p className={`text-xs ${memberSubtle}`}>{tile.label}</p>
                <p className="mt-1 text-lg font-semibold text-[#131517]">
                  {formatNumber(tile.value)}
                </p>
              </div>
            ))}
          </div>
          <p className={`mt-3 text-xs leading-5 ${memberMuted}`}>{t('vote.snapshotNote')}</p>
        </section>

        <PollVoteCard
          communityId={communityId}
          proposalId={proposal.id}
          options={proposal.options}
          votable={proposal.status === 'active'}
          initialVotedOptionId={proposal.votedOptionId}
          labels={{
            votesLabel: (count) => t('vote.voters', { count }),
            castVote: t('vote.castVote'),
            voteCast: t('vote.voteCast'),
            voteCastBody: (optionText) => t('vote.voteCastBody', { option: optionText }),
            votingUpcoming: t('vote.votingUpcoming'),
          }}
        />
      </div>

      <MobileBottomNav
        locale={locale}
        communityId={communityId}
        active="vote"
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
