import { CheckCircle2, History } from 'lucide-react'
import Link from 'next/link'
import type { CommunityMember } from '@/types/member'

interface MemberImpactCardProps {
  member: CommunityMember
  historyHref: string
  labels: {
    eyebrow: string
    title: string
    viewHistory: string
    emptyTitle: string
    emptyBody: string
    approvedBy: string
  }
}

export function MemberImpactCard({ member, historyHref, labels }: MemberImpactCardProps) {
  return (
    <section className="rounded-[24px] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-[#6f7174]">{labels.eyebrow}</p>
          <h2 className="text-lg font-semibold">{labels.title}</h2>
        </div>
        <Link
          href={historyHref}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f2f2f2]"
          aria-label={labels.viewHistory}
        >
          <History className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>

      {member.contributions.length === 0 ? (
        <div className="rounded-2xl bg-[#f8f7f4] p-4">
          <h3 className="text-sm font-semibold">{labels.emptyTitle}</h3>
          <p className="mt-1 text-sm leading-6 text-[#6f7174]">{labels.emptyBody}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {member.contributions.slice(0, 3).map((contribution) => (
            <article key={contribution.id} className="flex gap-3">
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-medium leading-5">{contribution.title}</h3>
                  <span className="shrink-0 text-sm font-semibold text-emerald-700">
                    +{contribution.amount}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-5 text-[#6f7174]">
                  {contribution.description}
                </p>
                <p className="mt-1 text-xs text-[#939597]">
                  {contribution.createdAt}
                  {contribution.approvedBy
                    ? ` · ${labels.approvedBy} ${contribution.approvedBy}`
                    : ''}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
