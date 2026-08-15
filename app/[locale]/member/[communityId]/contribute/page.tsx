import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ContributionSubmitForm } from '@/components/member/contribution-submit-form'
import { MemberShell } from '@/components/member/member-shell'
import { MobileBottomNav } from '@/components/member/mobile-bottom-nav'
import { memberMuted, memberSubtle } from '@/components/member/ui'
import { getDemoMember } from '@/lib/demo/member-data'

interface MemberContributePageProps {
  params: Promise<{
    locale: string
    communityId: string
  }>
}

export default async function MemberContributePage({ params }: MemberContributePageProps) {
  const { locale, communityId } = await params
  const t = await getTranslations('member')
  const member = getDemoMember(communityId)
  const meHref = `/${locale}/member/${communityId}/me`

  const types = [
    { id: 'social-post', label: t('contribute.types.socialPost') },
    { id: 'event-recap', label: t('contribute.types.eventRecap') },
    { id: 'mentoring', label: t('contribute.types.mentoring') },
    { id: 'sponsor-intro', label: t('contribute.types.sponsorIntro') },
    { id: 'help-team', label: t('contribute.types.helpTeam') },
    { id: 'other', label: t('contribute.types.other') },
  ]

  return (
    <MemberShell member={member}>
      <header className="px-5 pb-5 pt-6 lg:px-0 lg:pb-8 lg:pt-0">
        <Link
          href={meHref}
          className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#F0F0F0] bg-white transition-all hover:border-[#E5E5E5] hover:bg-[#FAFAFA]"
          aria-label={t('contribute.backToMe')}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <p className={`truncate text-base ${memberSubtle}`}>{member.communityName}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[#131517] lg:text-[40px] lg:font-medium lg:leading-[48px]">
          {t('contribute.title')}
        </h1>
        <p className={`mt-3 max-w-2xl text-sm leading-6 ${memberMuted} lg:text-base`}>
          {t('contribute.description')}
        </p>
      </header>

      <div className="px-5 lg:px-0">
        <ContributionSubmitForm
          communityId={communityId}
          meHref={meHref}
          types={types}
          labels={{
            titleField: t('contribute.titleField'),
            titlePlaceholder: t('contribute.placeholderTitle'),
            type: t('contribute.type'),
            details: t('contribute.details'),
            detailsPlaceholder: t('contribute.detailsPlaceholder'),
            evidence: t('contribute.evidence'),
            evidenceHint: t('contribute.evidenceHint'),
            evidenceChosen: t('contribute.evidenceChosen'),
            proofLink: t('contribute.proofLink'),
            proofLinkPlaceholder: t('contribute.proofLinkPlaceholder'),
            reviewTitle: t('contribute.reviewTitle'),
            reviewNote: t('contribute.reviewNote'),
            submit: t('contribute.title'),
            successTitle: t('contribute.successTitle'),
            successBody: t('contribute.successBody'),
            backToMe: t('contribute.backToMe'),
            required: t('contribute.required'),
          }}
        />
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
