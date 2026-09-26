import { CalendarDays, CheckCircle2, FileCheck2, Megaphone, Vote } from 'lucide-react'
import type { MemberActivityItem } from '@/types/member'
import { memberCard, memberIconWell, memberMuted, memberSubtle } from '@/components/member/ui'

interface ActivityFeedProps {
  items: MemberActivityItem[]
  labels: {
    emptyTitle: string
    emptyBody: string
  }
}

function iconFor(type: MemberActivityItem['type']) {
  if (type === 'event') return CalendarDays
  if (type === 'contribution') return CheckCircle2
  if (type === 'vote') return Vote
  if (type === 'record') return FileCheck2
  return Megaphone
}

function toneFor(type: MemberActivityItem['type']) {
  if (type === 'event') return 'bg-blue-50 text-blue-600'
  if (type === 'contribution') return 'bg-emerald-50 text-emerald-600'
  if (type === 'vote') return 'bg-amber-50 text-amber-600'
  if (type === 'record') return 'bg-purple-50 text-purple-600'
  return 'bg-gray-100 text-[#525252]'
}

export function ActivityFeed({ items, labels }: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <div className={memberCard}>
        <h2 className="text-xl font-semibold text-[#131517]">{labels.emptyTitle}</h2>
        <p className={`mt-2 text-sm leading-6 ${memberMuted}`}>{labels.emptyBody}</p>
      </div>
    )
  }

  return (
    <section className="space-y-3">
      {items.map((item) => {
        const Icon = iconFor(item.type)

        return (
          <article key={item.id} className={memberCard}>
            <div className="flex gap-3">
              <div className={`${memberIconWell} ${toneFor(item.type)}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold leading-6 text-[#131517]">
                    {item.title}
                  </h2>
                  <span className={`shrink-0 text-xs ${memberSubtle}`}>
                    {item.createdAt}
                  </span>
                </div>
                <p className={`mt-1 text-sm leading-6 ${memberMuted}`}>{item.description}</p>
              </div>
            </div>
          </article>
        )
      })}
    </section>
  )
}
