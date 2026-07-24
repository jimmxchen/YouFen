'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  Bell,
  BellOff,
  Copy,
  Image as ImageIcon,
  Link as LinkIcon,
  Search,
  UserPlus,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ChatRoom } from '@/types/member'
import { memberMuted, memberPrimaryButton, memberSubtle } from '@/components/member/ui'

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
    invite: string
    inviteLink: string
    copyInvite: string
    search: string
    searchPlaceholder: string
    searchEmpty: string
    membersTitle: string
    sharedMedia: string
    publicInviteNote: string
    operator: string
    participantStatusById: Record<string, string>
  }
}

export function ChatSettingsView({ room, locale, communityId, labels }: ChatSettingsViewProps) {
  const [isMuted, setIsMuted] = useState(room.muted)
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const searchMatches = useMemo(() => {
    if (!normalizedQuery) return room.messages.slice(0, 3)

    return room.messages.filter((message) =>
      [message.author, message.role, message.body].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      )
    )
  }, [normalizedQuery, room.messages])

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-28 pt-5 lg:px-0 lg:pt-0">
      <header className="flex items-center gap-2">
        <Link
          href={`/${locale}/member/${communityId}/chat/${room.id}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#525252] hover:bg-[#FAFAFA]"
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

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
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
            <span className={`block truncate text-xs ${memberSubtle}`}>{labels.mute}</span>
          </span>
        </button>

        <button
          type="button"
          className="flex min-h-16 items-center gap-3 rounded-xl border border-[#F0F0F0] bg-white px-4 text-left transition hover:bg-[#FAFAFA]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <UserPlus className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[#131517]">{labels.invite}</span>
            <span className={`block truncate text-xs ${memberSubtle}`}>{labels.publicInviteNote}</span>
          </span>
        </button>

        <div className="flex min-h-16 items-center gap-3 rounded-xl border border-[#F0F0F0] bg-white px-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <ImageIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[#131517]">{labels.sharedMedia}</span>
            <span className={`block truncate text-xs ${memberSubtle}`}>{room.sharedMediaCount}</span>
          </span>
        </div>
      </div>

      <section className="mt-4 rounded-xl border border-[#F0F0F0] bg-white p-4">
        <div className="flex items-center gap-2">
          <LinkIcon className="h-4 w-4 text-[#525252]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[#131517]">{labels.inviteLink}</h2>
        </div>
        <div className="mt-3 flex gap-2">
          <div className="flex min-h-11 min-w-0 flex-1 items-center rounded-lg bg-[#FAFAFA] px-3 font-mono text-xs text-[#525252]">
            <span className="truncate">{room.inviteCode}</span>
          </div>
          <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#131517] text-white" aria-label={labels.copyInvite}>
            <Copy className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-[#F0F0F0] bg-white p-4">
        <label htmlFor="settings-search" className="text-sm font-semibold text-[#131517]">
          {labels.search}
        </label>
        <div className="mt-3 flex min-h-11 items-center gap-2 rounded-lg border border-[#F0F0F0] bg-[#FAFAFA] px-4">
          <Search className="h-4 w-4 shrink-0 text-[#939597]" aria-hidden="true" />
          <input
            id="settings-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm text-[#131517] outline-none placeholder:text-[#939597]"
          />
        </div>
        <div className="mt-4 space-y-3">
          {searchMatches.length > 0 ? (
            searchMatches.map((message) => (
              <div key={message.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-[#131517]">{message.author}</p>
                  <span className={`shrink-0 text-xs ${memberSubtle}`}>{message.createdAt}</span>
                </div>
                <p className={`mt-1 line-clamp-2 text-sm leading-6 ${memberMuted}`}>{message.body}</p>
              </div>
            ))
          ) : (
            <p className={`text-sm ${memberMuted}`}>{labels.searchEmpty}</p>
          )}
        </div>
      </section>

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

      <Link href={`/${locale}/member/${communityId}/chat/${room.id}`} className={`mt-4 ${memberPrimaryButton}`}>
        {labels.back}
      </Link>
    </div>
  )
}
