import { CheckCircle2, Clock3, ShieldCheck, XCircle } from 'lucide-react'
import type { ContributionTokenEvent } from '@/types/token'

interface ContributionTimelineProps {
  contributions: ContributionTokenEvent[]
  locale: string
  tokenSymbol: string
  labels: {
    approvedBy: string
    tokenStatus: string
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
  if (status === 'rejected') return 'bg-rose-50 text-rose-600'
  return 'bg-amber-50 text-amber-600'
}

function formatAmount(value: number, tokenSymbol: string, locale: string) {
  return `+${new Intl.NumberFormat(locale).format(value)} ${tokenSymbol}`
}

export function ContributionTimeline({
  contributions,
  locale,
  tokenSymbol,
  labels,
}: ContributionTimelineProps) {
  if (contributions.length === 0) {
    return (
      <div className="rounded-[24px] bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">{labels.emptyTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-[#6f7174]">{labels.emptyBody}</p>
      </div>
    )
  }

  return (
    <section className="space-y-4">
      {contributions.map((contribution) => (
        <article key={contribution.id} className="rounded-[24px] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${statusTone(contribution.status)}`}
              >
                {statusIcon(contribution.status)}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold leading-6">{contribution.title}</h2>
                <p className="mt-1 text-sm leading-6 text-[#6f7174]">
                  {contribution.description}
                </p>
                <p className="mt-1 text-xs text-[#939597]">{contribution.createdAt}</p>
              </div>
            </div>
            <span className="shrink-0 text-lg font-semibold text-emerald-700">
              {formatAmount(contribution.amount, tokenSymbol, locale)}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-[#f8f7f4] p-3">
              <p className="text-xs text-[#939597]">{labels.approvedBy}</p>
              <p className="mt-1 break-words font-medium">
                {contribution.approvedBy ?? labels.pending}
              </p>
            </div>
            <div className="rounded-2xl bg-[#f8f7f4] p-3">
              <p className="text-xs text-[#939597]">{labels.tokenStatus}</p>
              <p className="mt-1 font-medium">
                {contribution.activationStatus === 'active'
                  ? labels.activeNow
                  : labels.pending}
              </p>
            </div>
          </div>

          {contribution.receipt ? (
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                {labels.receiptVerified}
              </div>
              {contribution.receipt.txHash ? (
                <p className="mt-2 truncate text-xs text-emerald-900/70" title={contribution.receipt.txHash}>
                  {contribution.receipt.txHash}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-[#f8f7f4] p-3 text-sm leading-6 text-[#6f7174]">
              {labels.noReceipt}
            </div>
          )}
        </article>
      ))}
    </section>
  )
}
