import Link from 'next/link'
import { ArrowRight, FileCheck2 } from 'lucide-react'
import type { MemberProposal } from '@/types/proposal'
import { memberCard, memberMuted, memberPrimaryButton, memberSubtle } from '@/components/member/ui'

interface ProposalListProps {
  proposals: MemberProposal[]
  locale: string
  voicePower: number
  labels: {
    active: string
    upcoming: string
    ended: string
    yourVoicePower: string
    voters: (count: number) => string
    trustedRecord: string
    openVote: string
  }
}

function statusLabel(status: MemberProposal['status'], labels: ProposalListProps['labels']) {
  if (status === 'active') return labels.active
  if (status === 'upcoming') return labels.upcoming
  return labels.ended
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value)
}

export function ProposalList({ proposals, locale, voicePower, labels }: ProposalListProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {proposals.map((proposal) => (
        <article key={proposal.id} className={`${memberCard} flex flex-col`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">
                {statusLabel(proposal.status, labels)}
              </p>
              <h2 className="mt-1 text-lg font-semibold leading-6 text-[#131517]">
                {proposal.title}
              </h2>
              <p className={`mt-2 text-sm leading-6 ${memberMuted}`}>
                {proposal.description}
              </p>
            </div>
            {proposal.trustedRecordStatus === 'verified' ? (
              <FileCheck2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm lg:mb-6">
            <div className="rounded-lg border border-[#F0F0F0] bg-[#FAFAFA] p-3">
              <p className={`text-xs ${memberSubtle}`}>{labels.yourVoicePower}</p>
              <p className="mt-1 font-semibold text-[#131517]">
                {formatNumber(voicePower, locale)}
              </p>
            </div>
            <div className="rounded-lg border border-[#F0F0F0] bg-[#FAFAFA] p-3">
              <p className={`text-xs ${memberSubtle}`}>{labels.ended}</p>
              <p className="mt-1 font-semibold text-[#131517]">
                {labels.voters(proposal.voterCount)}
              </p>
            </div>
          </div>

          {proposal.trustedRecordStatus === 'verified' ? (
            <p className="mt-4 text-sm font-medium text-emerald-700">
              {labels.trustedRecord}
            </p>
          ) : null}

          <Link href={`/${locale}${proposal.href}`} className={`mt-4 ${memberPrimaryButton} lg:mt-auto`}>
            {labels.openVote}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </article>
      ))}
    </section>
  )
}
