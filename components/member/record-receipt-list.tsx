import Link from 'next/link'
import { CheckCircle2, Clock3, ExternalLink, RotateCcw } from 'lucide-react'
import type { ReceiptStatus, TokenReceipt } from '@/types/token'

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
  if (status === 'failed') return 'bg-rose-50 text-rose-700'
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
      <div className="rounded-[24px] bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">{labels.emptyTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-[#6f7174]">{labels.emptyBody}</p>
      </div>
    )
  }

  return (
    <section className="space-y-4">
      {receipts.map((receipt) => (
        <article key={receipt.id} className="rounded-[24px] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-6">{receipt.title}</h2>
              <p className="mt-1 truncate text-sm text-[#6f7174]">
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

          <div className="mt-4 space-y-3">
            {receipt.blockHeight ? (
              <div className="rounded-2xl bg-[#f8f7f4] p-3">
                <p className="text-xs text-[#939597]">{labels.blockHeight}</p>
                <p className="mt-1 break-all text-sm font-medium">{receipt.blockHeight}</p>
              </div>
            ) : null}

            {receipt.txHash ? (
              <div className="rounded-2xl bg-[#f8f7f4] p-3">
                <p className="text-xs text-[#939597]">{labels.receiptHash}</p>
                <p className="mt-1 truncate text-sm font-medium">{receipt.txHash}</p>
              </div>
            ) : (
              <div className="rounded-2xl bg-[#f8f7f4] p-3 text-sm leading-6 text-[#6f7174]">
                {labels.waiting}
              </div>
            )}
          </div>

          {receipt.explorerUrl ? (
            <Link
              href={receipt.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#131517] px-4 text-sm font-medium text-white"
            >
              {labels.viewExplorer}
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
        </article>
      ))}
    </section>
  )
}
