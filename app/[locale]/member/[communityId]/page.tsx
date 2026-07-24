import Link from 'next/link'
import { ArrowRight, CalendarDays, Megaphone, Vote } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ActivityFeed } from '@/components/member/activity-feed'
import { MemberShell } from '@/components/member/member-shell'
import { MobileBottomNav } from '@/components/member/mobile-bottom-nav'
import {
  memberCard,
  memberIconWell,
  memberMuted,
  memberPrimaryButton,
  memberSubtle,
} from '@/components/member/ui'
import { getDemoMember } from '@/lib/demo/member-data'

interface MemberPageProps {
  params: Promise<{
    locale: string
    communityId: string
  }>
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value)
}

export default async function MemberCommunityPage({ params }: MemberPageProps) {
  const { locale, communityId } = await params
  const t = await getTranslations('member')
  const member = getDemoMember(communityId)
  const activeVote = member.availableProposals.find((proposal) => proposal.status === 'active')
  const baseHref = `/${locale}/member/${communityId}`
  const recentActivity = member.activity.filter(
    (item) => !['update', 'event', 'vote'].includes(item.type)
  )

  return (
    <MemberShell>
      <header className="px-5 pb-5 pt-6 lg:px-0 lg:pb-8 lg:pt-0">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <p className={`truncate text-sm ${memberSubtle}`}>{member.communityName}</p>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-normal text-[#131517] lg:text-[40px] lg:font-medium lg:leading-[48px]">
              {t('dashboard.greeting', { name: member.name })}
            </h1>
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#525252] lg:text-base">
          {member.communityDescription}
        </p>
      </header>

      <div className="grid gap-5 px-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] lg:items-start lg:px-0">
        <div>
          <section className={memberCard}>
            <h2 className="text-xl font-semibold text-[#131517]">{t('dashboard.today')}</h2>
            <div className="mt-4 space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
              <div className="flex gap-3 lg:col-span-2">
                <div className={`${memberIconWell} bg-emerald-50 text-emerald-600`}>
                  <Megaphone className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm ${memberSubtle}`}>{t('dashboard.latestUpdate')}</p>
                  <h3 className="mt-1 text-lg font-semibold leading-6 text-[#131517]">
                    {member.announcement.title}
                  </h3>
                  <p className={`mt-1 text-sm leading-6 ${memberMuted}`}>
                    {member.announcement.body}
                  </p>
                </div>
              </div>

              <div className="border-t border-[#F0F0F0] pt-3 lg:rounded-2xl lg:border lg:bg-[#FAFAFA] lg:p-4">
                <div className="flex gap-3">
                  <CalendarDays
                    className="mt-0.5 h-5 w-5 shrink-0 text-blue-600"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${memberSubtle}`}>{t('dashboard.nextEvent')}</p>
                    <h3 className="mt-1 text-base font-semibold leading-6 text-[#131517]">
                      {member.nextEvent.title}
                    </h3>
                    <p className={`mt-1 text-sm leading-6 ${memberMuted}`}>
                      {member.nextEvent.startsAt} · {member.nextEvent.location}
                    </p>
                    <Link href={`${baseHref}/event`} className={`mt-3 ${memberPrimaryButton}`}>
                      {t('dashboard.joinEvent')}
                    </Link>
                  </div>
                </div>
              </div>

              {activeVote ? (
                <div className="border-t border-[#F0F0F0] pt-3 lg:rounded-2xl lg:border lg:bg-[#FAFAFA] lg:p-4">
                  <div className="flex gap-3">
                    <Vote className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${memberSubtle}`}>{t('dashboard.activeVote')}</p>
                      <h3 className="mt-1 text-base font-semibold leading-6 text-[#131517]">
                        {activeVote.title}
                      </h3>
                      <Link
                        href={`${baseHref}/vote`}
                        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#131517] px-4 text-sm font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#262626] active:translate-y-0"
                      >
                        {t('dashboard.voteNow')}
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className={memberCard}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${memberSubtle}`}>{t('dashboard.myVoice')}</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Metric
                    label={t('voicePower.active')}
                    value={formatNumber(member.voicePower.active, locale)}
                  />
                  <Metric
                    label={t('voicePower.pending')}
                    value={formatNumber(member.voicePower.pending, locale)}
                  />
                </div>
                <Link
                  href={`${baseHref}/me`}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#131517]"
                >
                  {t('dashboard.viewMyRecord')}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#131517]">
              {t('dashboard.recentActivity')}
            </h2>
            <div className="mt-4">
              <ActivityFeed items={recentActivity} />
            </div>
          </section>
        </aside>
      </div>

      <MobileBottomNav
        locale={locale}
        communityId={communityId}
        active="home"
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
    <div>
      <p className="text-2xl font-semibold text-[#131517]">{value}</p>
      <p className="mt-1 text-xs text-[#939597]">{label}</p>
    </div>
  )
}
