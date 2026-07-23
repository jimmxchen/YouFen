import Link from 'next/link'
import { CalendarDays, ChevronRight } from 'lucide-react'
import type { MemberProposal } from '@/types/proposal'

interface AvailableVotesProps {
  proposals: MemberProposal[]
  locale: string
  tokenSymbol: string
  labels: {
    title: string
    snapshotWeight: string
    emptyTitle: string
    emptyBody: string
    status: Record<MemberProposal['status'], string>
  }
}

function formatToken(value: number, symbol: string, locale: string) {
  return `${new Intl.NumberFormat(locale).format(value)} ${symbol}`
}

export function AvailableVotes({ proposals, locale, tokenSymbol, labels }: AvailableVotesProps) {
  return (
    <section className="rounded-[24px] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-[#de475e]" aria-hidden="true" />
        <h2 className="text-lg font-semibold">{labels.title}</h2>
      </div>

      {proposals.length === 0 ? (
        <div className="rounded-2xl bg-[#f8f7f4] p-4">
          <h3 className="text-sm font-semibold">{labels.emptyTitle}</h3>
          <p className="mt-1 text-sm leading-6 text-[#6f7174]">{labels.emptyBody}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((proposal) => (
            <Link
              key={proposal.id}
              href={`/${locale}${proposal.href}`}
              className="block rounded-2xl border border-[#ece8df] p-4 transition hover:border-[#de475e]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-[#de475e]">
                    {labels.status[proposal.status]}
                  </p>
                  <h3 className="mt-1 text-sm font-semibold leading-5">{proposal.title}</h3>
                  <p className="mt-1 text-sm leading-5 text-[#6f7174]">
                    {labels.snapshotWeight}:{' '}
                    {formatToken(proposal.snapshotWeight, tokenSymbol, locale)}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-[#939597]" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
