import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getMemberProfile } from '@/lib/api/member/queries'
import { ContributionSubmitForm } from '@/components/member/contribution-submit-form'
import { MemberShell } from '@/components/member/member-shell'
import { MobileBottomNav } from '@/components/member/mobile-bottom-nav'
import { memberMuted } from '@/components/member/ui'

interface MemberContributePageProps {
  params: Promise<{
    locale: string
    communityId: string
  }>
}

export default async function MemberContributePage({ params }: MemberContributePageProps) {
  const { locale, communityId } = await params
  const t = await getTranslations('member')
  const userId = await getSession()
  if (!userId) redirect('/sign-in')
  const member = await getMemberProfile(userId, communityId)
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
        active="contribute"
        labels={{
          home: t('nav.home'),
          chat: t('nav.chat'),
          contribute: t('nav.contribute'),
          vote: t('nav.vote'),
          me: t('nav.me'),
        }}
      />
    </MemberShell>
  )
}
