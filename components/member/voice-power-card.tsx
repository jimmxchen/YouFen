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
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/20 via-transparent to-blue-500/20"
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-white/60">{labels.title}</p>
            <p className="mt-3 text-5xl font-semibold leading-none tracking-normal">
              {formatNumber(voicePower.total, locale)}
            </p>
            <p className="mt-3 text-sm text-white/60">
              {labels.rank}
            </p>
          </div>
          <div className={`${memberIconWell} bg-white/10`}>
            <Mic2 className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/10 p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/20 text-emerald-200">
              <Vote className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="text-xs text-white/55">{labels.active}</p>
            <p className="mt-1 text-2xl font-semibold">
              {formatNumber(voicePower.active, locale)}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/10 p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-300/20 text-blue-100">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="text-xs text-white/55">{labels.pending}</p>
            <p className="mt-1 text-2xl font-semibold">
              {formatNumber(voicePower.pending, locale)}
            </p>
          </div>
        </div>

        <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.06] p-4 text-sm text-white/70">
          {labels.earnedThisMonth}
        </p>
      </div>
    </section>
  )
}
