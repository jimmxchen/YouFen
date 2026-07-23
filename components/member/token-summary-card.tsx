import { Clock3, ShieldCheck, Sparkles, Vote } from 'lucide-react'
import type { TokenBalance } from '@/types/token'

interface TokenSummaryCardProps {
  token: TokenBalance
  locale: string
  labels: {
    title: string
    active: string
    pending: string
    ownershipShare: string
    ownershipHint: string
    voteShare: string
  }
}

function formatToken(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value)
}

function formatPercent(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value) + '%'
}

export function TokenSummaryCard({ token, locale, labels }: TokenSummaryCardProps) {
  return (
    <section className="rounded-[28px] bg-[#131517] p-5 text-white shadow-[0_24px_60px_rgba(19,21,23,0.22)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-white/60">{labels.title}</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-5xl font-semibold leading-none tracking-normal">
              {formatToken(token.totalBalance, locale)}
            </span>
            <span className="pb-1 text-base text-white/70">{token.symbol}</span>
          </div>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/10 p-4">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-200">
            <Vote className="h-4 w-4" aria-hidden="true" />
          </div>
          <p className="text-xs text-white/55">{labels.active}</p>
          <p className="mt-1 text-2xl font-semibold">
            {formatToken(token.activeVotingBalance, locale)}
          </p>
        </div>
        <div className="rounded-2xl bg-white/10 p-4">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-300/20 text-amber-100">
            <Clock3 className="h-4 w-4" aria-hidden="true" />
          </div>
          <p className="text-xs text-white/55">{labels.pending}</p>
          <p className="mt-1 text-2xl font-semibold">
            {formatToken(token.pendingBalance, locale)}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <ShieldCheck className="h-4 w-4 text-emerald-200" aria-hidden="true" />
          <span>{labels.ownershipShare}</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-3xl font-semibold">
              {formatPercent(token.ownershipPercentage, locale)}
            </p>
            <p className="mt-1 text-xs leading-5 text-white/55">
              {labels.ownershipHint}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-medium">
              {formatPercent(token.governancePercentage, locale)}
            </p>
            <p className="mt-1 text-xs leading-5 text-white/55">{labels.voteShare}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
