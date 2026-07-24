import { CheckCircle2, Clock3, ShieldCheck, XCircle } from 'lucide-react'
import type { ContributionTokenEvent } from '@/types/token'
import {
  memberCard,
  memberIconWell,
  memberInset,
  memberMuted,
  memberSubtle,
} from '@/components/member/ui'

interface ContributionTimelineProps {
  contributions: ContributionTokenEvent[]
  locale: string
  tokenSymbol?: string
  labels: {
    approvedBy: string
    statusLabel: string
    activeNow: string
    pending: string
    receiptVerified: string
    noReceipt: string
    emptyTitle: string
    emptyBody: string
  }
}

function statusIcon(status: ContributionTokenEvent['status']) {
  if (status === 'approved') {
    return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
  }
  if (status === 'rejected') {
    return <XCircle className="h-4 w-4" aria-hidden="true" />
  }
  return <Clock3 className="h-4 w-4" aria-hidden="true" />
}

function statusTone(status: ContributionTokenEvent['status']) {
  if (status === 'approved') return 'bg-emerald-50 text-emerald-600'
  if (status === 'rejected') return 'bg-red-50 text-red-500'
  return 'bg-amber-50 text-amber-600'
}

function formatAmount(value: number, locale: string, tokenSymbol?: string) {
  const formatted = new Intl.NumberFormat(locale).format(value)
  return tokenSymbol ? `+${formatted} ${tokenSymbol}` : `+${formatted}`
}

export function ContributionTimeline({
  contributions,
  locale,
  tokenSymbol,
  labels,
}: ContributionTimelineProps) {
  if (contributions.length === 0) {
    return (
      <div className={memberCard}>
        <h2 className="text-xl font-semibold text-[#131517]">{labels.emptyTitle}</h2>
        <p className={`mt-2 text-sm leading-6 ${memberMuted}`}>{labels.emptyBody}</p>
      </div>
    )
  }

  return (
    <section className="space-y-4">
      {contributions.map((contribution) => (
        <article key={contribution.id} className={memberCard}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className={`${memberIconWell} ${statusTone(contribution.status)}`}>
                {statusIcon(contribution.status)}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold leading-6 text-[#131517]">
                  {contribution.title}
                </h2>
                <p className={`mt-1 text-sm leading-6 ${memberMuted}`}>
                  {contribution.description}
                </p>
                <p className={`mt-1 text-xs ${memberSubtle}`}>{contribution.createdAt}</p>
              </div>
            </div>
            <span className="shrink-0 pl-[52px] text-base font-semibold text-emerald-600 sm:pl-0">
              {formatAmount(contribution.amount, locale, tokenSymbol)}
            </span>
          </div>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className={memberInset}>
              <p className={`text-xs ${memberSubtle}`}>{labels.approvedBy}</p>
              <p className="mt-1 break-words font-medium text-[#131517]">
                {contribution.approvedBy ?? labels.pending}
              </p>
            </div>
            <div className={memberInset}>
              <p className={`text-xs ${memberSubtle}`}>{labels.statusLabel}</p>
              <p className="mt-1 font-medium text-[#131517]">
                {contribution.activationStatus === 'active'
                  ? labels.activeNow
                  : labels.pending}
              </p>
            </div>
          </div>

          {contribution.receipt ? (
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                {labels.receiptVerified}
              </div>
              {contribution.receipt.txHash ? (
                <p
                  className="mt-2 truncate font-mono text-xs text-emerald-800/70"
                  title={contribution.receipt.txHash}
                >
                  {contribution.receipt.txHash}
                </p>
              ) : null}
            </div>
          ) : (
            <div className={`mt-4 ${memberInset} text-sm leading-6 ${memberMuted}`}>
              {labels.noReceipt}
            </div>
          )}
        </article>
      ))}
    </section>
  )
}
