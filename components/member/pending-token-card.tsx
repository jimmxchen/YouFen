import { Clock3 } from 'lucide-react'
import type { CommunityMember } from '@/types/member'

interface PendingTokenCardProps {
  member: CommunityMember
  locale: string
  labels: {
    eyebrow: string
    activates: string
    emptyTitle: string
    emptyBody: string
  }
}

function formatToken(value: number, symbol: string, locale: string) {
  return `${new Intl.NumberFormat(locale).format(value)} ${symbol}`
}

export function PendingTokenCard({ member, locale, labels }: PendingTokenCardProps) {
  if (member.token.pendingBalance <= 0) {
    return (
      <section className="rounded-[24px] bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Clock3 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{labels.emptyTitle}</h2>
            <p className="mt-1 text-sm leading-6 text-[#6f7174]">{labels.emptyBody}</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-[24px] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[#6f7174]">{labels.eyebrow}</p>
          <h2 className="mt-1 text-2xl font-semibold">
            {formatToken(member.pendingExplanation.amount, member.token.symbol, locale)}
          </h2>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <Clock3 className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-4 space-y-3 text-sm leading-6 text-[#55585c]">
        <p>{member.pendingExplanation.source}</p>
        <p>
          {labels.activates}:{' '}
          <span className="font-medium text-[#131517]">
            {member.pendingExplanation.activatesAt}
          </span>
        </p>
        <p>{member.pendingExplanation.reason}</p>
      </div>
    </section>
  )
}
