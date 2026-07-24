import { CheckCircle2, Clock3, ExternalLink, RotateCcw } from 'lucide-react'
import type { ReceiptStatus, TokenReceipt } from '@/types/token'
import {
  memberCard,
  memberInset,
  memberMuted,
  memberPrimaryButton,
  memberSubtle,
} from '@/components/member/ui'

interface RecordReceiptListProps {
  receipts: TokenReceipt[]
  labels: {
    verified: string
    failed: string
    pending: string
    blockHeight: string
    receiptHash: string
    waiting: string
    viewExplorer: string
    emptyTitle: string
    emptyBody: string
  }
}

function statusClasses(status: ReceiptStatus) {
  if (status === 'verified') return 'bg-emerald-50 text-emerald-700'
  if (status === 'failed') return 'bg-red-50 text-red-600'
  return 'bg-amber-50 text-amber-700'
}

function statusIcon(status: ReceiptStatus) {
  if (status === 'verified') {
    return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
  }
  if (status === 'failed') {
    return <RotateCcw className="h-4 w-4" aria-hidden="true" />
  }
  return <Clock3 className="h-4 w-4" aria-hidden="true" />
}

function statusLabel(
  status: ReceiptStatus,
  labels: Pick<RecordReceiptListProps['labels'], 'verified' | 'failed' | 'pending'>
) {
  if (status === 'verified') return labels.verified
  if (status === 'failed') return labels.failed
  return labels.pending
}

export function RecordReceiptList({ receipts, labels }: RecordReceiptListProps) {
  if (receipts.length === 0) {
    return (
      <div className={memberCard}>
        <h2 className="text-xl font-semibold text-[#131517]">{labels.emptyTitle}</h2>
        <p className={`mt-2 text-sm leading-6 ${memberMuted}`}>{labels.emptyBody}</p>
      </div>
    )
  }

  return (
    <section className="space-y-4">
      {receipts.map((receipt) => (
        <article key={receipt.id} className={memberCard}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-6 text-[#131517]">
                {receipt.title}
              </h2>
              <p className={`mt-1 truncate text-sm ${memberMuted}`}>
                {receipt.network} · {receipt.createdAt}
              </p>
            </div>
            <span
              className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${statusClasses(receipt.status)}`}
            >
              {statusIcon(receipt.status)}
              {statusLabel(receipt.status, labels)}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {receipt.blockHeight ? (
              <div className={memberInset}>
                <p className={`text-xs ${memberSubtle}`}>{labels.blockHeight}</p>
                <p className="mt-1 break-all text-sm font-medium text-[#131517]">
                  {receipt.blockHeight}
                </p>
              </div>
            ) : null}

            {receipt.txHash ? (
              <div className={memberInset}>
                <p className={`text-xs ${memberSubtle}`}>{labels.receiptHash}</p>
                <p className="mt-1 truncate font-mono text-sm font-medium text-[#131517]" title={receipt.txHash}>
                  {receipt.txHash}
                </p>
              </div>
            ) : (
              <div className={`${memberInset} text-sm leading-6 ${memberMuted} sm:col-span-2`}>
                {labels.waiting}
              </div>
            )}
          </div>

          {receipt.explorerUrl ? (
            <a
              href={receipt.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className={`mt-4 ${memberPrimaryButton}`}
            >
              {labels.viewExplorer}
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          ) : null}
        </article>
      ))}
    </section>
  )
}
