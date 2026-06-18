import { getTranslations } from 'next-intl/server'
import { MemberShell } from '@/components/member/member-shell'
import { MobileBottomNav } from '@/components/member/mobile-bottom-nav'
import { ProposalList } from '@/components/member/proposal-list'
import { memberMuted, memberSubtle } from '@/components/member/ui'
import { getDemoMember } from '@/lib/demo/member-data'

interface MemberVotePageProps {
  params: {
    locale: string
    communityId: string
  }
}

export default async function MemberVotePage({ params }: MemberVotePageProps) {
  const t = await getTranslations('member')
  const member = getDemoMember(params.communityId)

  return (
    <MemberShell>
      <header className="px-5 pb-5 pt-6 lg:px-0 lg:pb-8 lg:pt-0">
        <p className={`truncate text-sm ${memberSubtle}`}>{member.communityName}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[#131517] lg:text-[40px] lg:font-medium lg:leading-[48px]">
          {t('vote.title')}
        </h1>
        <p className={`mt-3 max-w-2xl text-sm leading-6 ${memberMuted} lg:text-base`}>
          {t('vote.description')}
        </p>
      </header>

      <div className="px-5 lg:px-0">
        <ProposalList
          proposals={member.availableProposals}
          locale={params.locale}
          voicePower={member.voicePower.active}
          labels={{
            active: t('vote.active'),
            upcoming: t('vote.upcoming'),
            ended: t('vote.ended'),
            yourVoicePower: t('vote.yourVoicePower'),
            voters: (count) => t('vote.voters', { count }),
            trustedRecord: t('vote.trustedRecord'),
            openVote: t('vote.openVote'),
          }}
        />
      </div>

      <MobileBottomNav
        locale={params.locale}
        communityId={params.communityId}
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
