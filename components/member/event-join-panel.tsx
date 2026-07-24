'use client'

import { useEffect, useState } from 'react'
import { CalendarCheck2, MapPin, TicketCheck } from 'lucide-react'
import type { CommunityEvent } from '@/types/member'
import { memberCard, memberMuted, memberPrimaryButton, memberSubtle } from '@/components/member/ui'

interface EventJoinPanelProps {
  communityId: string
  event: CommunityEvent
  labels: {
    startsAt: string
    location: string
    join: string
    joined: string
    joinedBody: string
  }
}

export function EventJoinPanel({ communityId, event, labels }: EventJoinPanelProps) {
  const storageKey = `youfen:event-joined:${communityId}:${event.title}`
  const [joined, setJoined] = useState(event.status === 'joined')

  useEffect(() => {
    setJoined(window.localStorage.getItem(storageKey) === 'true' || event.status === 'joined')
  }, [event.status, storageKey])

  function joinEvent() {
    if (event.status !== 'open') return
    window.localStorage.setItem(storageKey, 'true')
    setJoined(true)
  }

  return (
    <section className={memberCard}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <CalendarCheck2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-[#131517]">{event.title}</h2>
          <p className={`mt-2 text-sm leading-6 ${memberMuted}`}>{event.description}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] p-3">
          <p className={`text-xs ${memberSubtle}`}>{labels.startsAt}</p>
          <p className="mt-1 text-sm font-medium text-[#131517]">{event.startsAt}</p>
        </div>
        <div className="rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] p-3">
          <p className={`text-xs ${memberSubtle}`}>{labels.location}</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-medium text-[#131517]">
            <MapPin className="h-4 w-4 text-blue-600" aria-hidden="true" />
            {event.location}
          </p>
        </div>
      </div>

      {joined ? (
        <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <TicketCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-emerald-950">{labels.joined}</p>
              <p className="mt-1 text-sm leading-6 text-emerald-800">{labels.joinedBody}</p>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" className={`mt-5 ${memberPrimaryButton}`} onClick={joinEvent}>
          {labels.join}
        </button>
      )}
    </section>
  )
}
