import { Mic2, TrendingUp, Vote } from 'lucide-react'
import type { MemberVoicePower } from '@/types/member'
import { memberHeroCard, memberIconWell } from '@/components/member/ui'

interface VoicePowerCardProps {
  voicePower: MemberVoicePower
  locale: string
  labels: {
    title: string
    active: string
    pending: string
    rank: string
    earnedThisMonth: string
  }
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value)
}

export function VoicePowerCard({ voicePower, locale, labels }: VoicePowerCardProps) {
  return (
    <section className={memberHeroCard}>
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1 text-sm text-[#939597]">{labels.title}</p>
            <p className="text-4xl font-semibold leading-none tracking-normal text-[#131517]">
              {formatNumber(voicePower.total, locale)}
            </p>
            <p className="mt-3 text-sm text-[#525252]">
              {labels.rank}
            </p>
          </div>
          <div className={`${memberIconWell} bg-emerald-50 text-emerald-600`}>
            <Mic2 className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-[#F0F0F0] bg-[#FAFAFA] p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Vote className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="text-xs text-[#939597]">{labels.active}</p>
            <p className="mt-1 text-2xl font-semibold text-[#131517]">
              {formatNumber(voicePower.active, locale)}
            </p>
          </div>
          <div className="rounded-lg border border-[#F0F0F0] bg-[#FAFAFA] p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="text-xs text-[#939597]">{labels.pending}</p>
            <p className="mt-1 text-2xl font-semibold text-[#131517]">
              {formatNumber(voicePower.pending, locale)}
            </p>
          </div>
        </div>

        <p className="mt-5 rounded-lg border border-[#F0F0F0] bg-[#FAFAFA] p-4 text-sm text-[#525252]">
          {labels.earnedThisMonth}
        </p>
      </div>
    </section>
  )
}
