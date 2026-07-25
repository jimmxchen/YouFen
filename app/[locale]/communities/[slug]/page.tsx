import { notFound } from 'next/navigation'
import { BadgeCheck, FileCheck2, Goal, Trophy, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from '@/i18n/navigation'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { getPublicCommunityBySlug } from '@/lib/api/public-community'

interface PublicCommunityPageProps {
  params: Promise<{
    locale: string
    slug: string
  }>
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US').format(value)
}

export default async function PublicCommunityPage({ params }: PublicCommunityPageProps) {
  const { locale, slug } = await params
  const community = await getPublicCommunityBySlug(slug)
  if (!community) notFound()

  const isZh = locale === 'zh'

  return (
    <main className="min-h-screen bg-white">
      <Navbar forceLight />

      <section className="border-b border-[#F0F0F0] px-5 pb-14 pt-32 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-medium text-emerald-600">
            {isZh ? '公开社区' : 'Public community'}
          </p>
          <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
            <div>
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-[#131517] sm:text-5xl">
                {community.name}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#525252]">
                {community.description || (isZh ? '这个社区还没有公开简介。' : 'This community has not added a public description yet.')}
              </p>
              {community.goal && (
                <div className="mt-6 flex max-w-2xl gap-3 rounded-2xl border border-[#F0F0F0] bg-[#FAFAFA] p-4">
                  <Goal className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                  <p className="text-sm leading-6 text-[#525252]">{community.goal}</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Metric label={isZh ? '成员' : 'Members'} value={formatNumber(community.stats.members, locale)} />
              <Metric label={isZh ? '贡献' : 'Contributions'} value={formatNumber(community.stats.contributions, locale)} />
              <Metric label={isZh ? '可信记录' : 'Records'} value={formatNumber(community.stats.trustedRecords, locale)} />
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-12 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="mb-5 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-[#131517]">
                {isZh ? '主要贡献者' : 'Featured contributors'}
              </h2>
            </div>
            <div className="overflow-hidden rounded-2xl border border-[#F0F0F0]">
              {community.featuredContributors.length > 0 ? (
                community.featuredContributors.map((contributor, index) => (
                  <div
                    key={contributor.id}
                    className={`flex items-center gap-4 px-5 py-4 ${index > 0 ? 'border-t border-[#F0F0F0]' : ''}`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#FAFAFA] text-sm font-semibold text-[#131517]">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#131517]">{contributor.name}</p>
                      <p className="mt-0.5 text-xs capitalize text-[#939597]">{contributor.role}</p>
                    </div>
                    <span className="text-sm font-semibold text-[#131517]">
                      {formatNumber(contributor.voicePower, locale)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="px-5 py-10 text-sm text-[#939597]">
                  {isZh ? '贡献者会在这里公开展示。' : 'Contributors will appear here once activity is recorded.'}
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <InfoRow
              icon={<Users className="h-5 w-5" aria-hidden="true" />}
              title={isZh ? '访客可见' : 'Visible to visitors'}
              body={isZh ? '这个页面不需要登录即可查看。' : 'This page can be viewed without signing in.'}
            />
            <InfoRow
              icon={<FileCheck2 className="h-5 w-5" aria-hidden="true" />}
              title={isZh ? '公开可信记录' : 'Public trusted records'}
              body={isZh ? '重要投票和规则变更可生成可验证记录。' : 'Important votes and rule changes can be publicly verified.'}
            />
            <InfoRow
              icon={<BadgeCheck className="h-5 w-5" aria-hidden="true" />}
              title={isZh ? '参与产生发言权' : 'Participation creates voice power'}
              body={isZh ? '成员贡献会沉淀为社区内的治理权重。' : 'Member contributions accumulate into governance weight inside the community.'}
            />
            <Link
              href="/records"
              className="inline-flex w-full items-center justify-center rounded-2xl bg-[#131517] px-4 py-3 text-sm font-medium text-white transition-all hover:bg-black"
            >
              {isZh ? '查看可信记录' : 'View trusted records'}
            </Link>
          </aside>
        </div>
      </section>

      <Footer />
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#F0F0F0] bg-white p-4 text-center shadow-sm">
      <p className="text-2xl font-semibold text-[#131517]">{value}</p>
      <p className="mt-1 text-xs text-[#939597]">{label}</p>
    </div>
  )
}

function InfoRow({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-[#F0F0F0] bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          {icon}
        </span>
        <div>
          <h3 className="text-sm font-semibold text-[#131517]">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-[#525252]">{body}</p>
        </div>
      </div>
    </div>
  )
}
