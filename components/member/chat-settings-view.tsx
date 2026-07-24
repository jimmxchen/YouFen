'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  Bell,
  BellOff,
  Image as ImageIcon,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import type { ChatRoom } from '@/types/member'
import { memberMuted, memberSubtle } from '@/components/member/ui'

interface ChatSettingsViewProps {
  room: ChatRoom
  locale: string
  communityId: string
  labels: {
    back: string
    title: string
    members: string
    online: string
    mute: string
    muted: string
    membersTitle: string
    sharedMedia: string
    operator: string
    participantStatusById: Record<string, string>
  }
}

export function ChatSettingsView({ room, locale, communityId, labels }: ChatSettingsViewProps) {
  const [isMuted, setIsMuted] = useState(room.muted)

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-28 pt-5 lg:px-0 lg:pt-0">
      <header className="flex items-center gap-2">
        <Link
          href={`/${locale}/member/${communityId}/chat/${room.id}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#525252] transition-all hover:bg-[#FAFAFA]"
          aria-label={labels.back}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <p className={`truncate text-sm ${memberSubtle}`}>{labels.title}</p>
          <h1 className="truncate text-2xl font-semibold tracking-normal text-[#131517] lg:text-[40px] lg:font-medium lg:leading-[48px]">
            {room.title}
          </h1>
        </div>
      </header>

      <section className="mt-5 rounded-xl border border-[#F0F0F0] bg-white p-5 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-xl bg-[#131517] text-xl font-semibold text-white">
          {room.avatarInitials}
        </div>
        <h2 className="mt-4 text-xl font-semibold text-[#131517]">{room.title}</h2>
        <p className={`mx-auto mt-2 max-w-md text-sm leading-6 ${memberMuted}`}>{room.description}</p>
        <div className={`mt-3 flex items-center justify-center gap-2 text-sm ${memberSubtle}`}>
          <Users className="h-4 w-4" aria-hidden="true" />
          <span>{labels.members}</span>
          <span aria-hidden="true">·</span>
          <span>{labels.online}</span>
        </div>
      </section>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <button
          type="button"
          onClick={() => setIsMuted((current) => !current)}
          className="flex min-h-16 items-center gap-3 rounded-xl border border-[#F0F0F0] bg-white px-4 text-left transition hover:bg-[#FAFAFA]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-[#525252]">
            {isMuted ? <BellOff className="h-5 w-5" aria-hidden="true" /> : <Bell className="h-5 w-5" aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[#131517]">
              {isMuted ? labels.muted : labels.mute}
            </span>
          </span>
        </button>

        <div className="flex min-h-16 items-center gap-3 rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] px-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <ImageIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[#131517]">{labels.sharedMedia}</span>
            <span className={`block truncate text-xs ${memberSubtle}`}>{room.sharedMediaCount}</span>
          </span>
        </div>
      </div>

      <section className="mt-4 overflow-hidden rounded-xl border border-[#F0F0F0] bg-white">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="text-sm font-semibold text-[#131517]">{labels.membersTitle}</h2>
          <span className={`text-xs ${memberSubtle}`}>{labels.members}</span>
        </div>
        {room.participants.map((participant) => (
          <div key={participant.id} className="flex min-h-16 items-center gap-3 border-t border-gray-100 px-4 py-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-semibold text-[#131517]">
              {participant.avatarInitials}
              {participant.status === 'online' ? (
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-[#131517]">{participant.name}</p>
                {participant.isOperator ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {labels.operator}
                  </span>
                ) : null}
              </div>
              <p className={`mt-0.5 truncate text-xs ${memberSubtle}`}>
                {participant.role} ·{' '}
                {labels.participantStatusById[participant.id]}
              </p>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
