'use client'

import Link from 'next/link'
import { ArrowLeft, BellOff, ImagePlus, Info, Search, SendHorizonal, Smile, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ChatRoom } from '@/types/member'
import { memberMuted, memberSubtle } from '@/components/member/ui'

interface ChatRoomViewProps {
  room: ChatRoom
  locale: string
  communityId: string
  labels: {
    back: string
    online: string
    members: string
    pinned: string
    search: string
    searchPlaceholder: string
    searchEmpty: string
    muted: string
    composer: string
    send: string
    reactionsByMessageId: Record<string, string>
    addImage: string
    addReaction: string
    settings: string
  }
}

export function ChatRoomView({ room, locale, communityId, labels }: ChatRoomViewProps) {
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!normalizedQuery) return []

    return room.messages.filter((message) =>
      [message.author, message.role, message.body].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      )
    )
  }, [normalizedQuery, room.messages])
  const pinnedMessage = room.messages.find((message) => message.isOperator)
  const baseHref = `/${locale}/member/${communityId}`

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-black/[0.08] bg-white/90 px-3 py-3 backdrop-blur-[20px] lg:static lg:mx-auto lg:mt-8 lg:w-full lg:max-w-3xl lg:rounded-2xl lg:border lg:border-black/[0.08] lg:px-4">
        <div className="flex items-center gap-2">
          <Link
            href={`${baseHref}/chat`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#525252] hover:bg-black/[0.04]"
            aria-label={labels.back}
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#131517] text-sm font-semibold text-white">
            {room.avatarInitials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-[#131517]">{room.title}</h1>
            <p className={`mt-0.5 truncate text-xs ${memberSubtle}`}>
              {labels.online} · {labels.members}
            </p>
          </div>
          <button
            type="button"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              showSearch ? 'bg-[#131517] text-white' : 'text-[#525252] hover:bg-black/[0.04]'
            }`}
            aria-label={labels.search}
            onClick={() => setShowSearch((current) => !current)}
          >
            {showSearch ? <X className="h-5 w-5" aria-hidden="true" /> : <Search className="h-5 w-5" aria-hidden="true" />}
          </button>
          <Link
            href={`${baseHref}/chat/${room.id}/settings`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#525252] hover:bg-black/[0.04]"
            aria-label={labels.settings}
          >
            <Info className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>

        {showSearch ? (
          <div className="mt-3">
            <label className="sr-only" htmlFor="chat-search">
              {labels.search}
            </label>
            <div className="flex min-h-11 items-center gap-2 rounded-full border border-gray-200 bg-[#FAFAFA] px-4">
              <Search className="h-4 w-4 shrink-0 text-[#939597]" aria-hidden="true" />
              <input
                id="chat-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={labels.searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-sm text-[#131517] outline-none placeholder:text-[#939597]"
              />
            </div>
          </div>
        ) : null}
      </header>

      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-28 pt-4 lg:px-0 lg:pt-5">
        {showSearch && normalizedQuery ? (
          <section className="rounded-2xl border border-black/[0.08] bg-white px-4 py-3">
            {matches.length > 0 ? (
              <div className="space-y-3">
                {matches.map((message) => (
                  <div key={message.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-[#131517]">{message.author}</p>
                      <span className={`shrink-0 text-xs ${memberSubtle}`}>{message.createdAt}</span>
                    </div>
                    <p className={`mt-1 line-clamp-2 text-sm leading-6 ${memberMuted}`}>{message.body}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className={`text-sm ${memberMuted}`}>{labels.searchEmpty}</p>
            )}
          </section>
        ) : null}

        {room.muted ? (
          <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-[#525252]">
            <BellOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            {labels.muted}
          </div>
        ) : null}

        {pinnedMessage ? (
          <section className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-700">
              {labels.pinned}
            </div>
            <p className="text-sm leading-6 text-emerald-950">{pinnedMessage.body}</p>
          </section>
        ) : null}

        <div className="space-y-4">
          {room.messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-2 ${message.isCurrentMember ? 'justify-end' : 'justify-start'}`}
            >
              {!message.isCurrentMember ? (
                <div className="mt-5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-semibold text-[#131517]">
                  {message.avatarInitials}
                </div>
              ) : null}

              <div className={`max-w-[78%] lg:max-w-[70%] ${message.isCurrentMember ? 'items-end' : 'items-start'}`}>
                {!message.isCurrentMember ? (
                  <div className="mb-1 flex items-center gap-2 px-1">
                    <span className="text-xs font-medium text-[#131517]">{message.author}</span>
                    <span className={`text-xs ${memberSubtle}`}>{message.role}</span>
                  </div>
                ) : null}

                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                    message.isCurrentMember
                      ? 'rounded-br-md bg-[#DCF8C6] text-[#131517]'
                      : message.isOperator
                        ? 'rounded-bl-md bg-emerald-50 text-emerald-950'
                        : 'rounded-bl-md bg-white text-[#131517]'
                  }`}
                >
                  {message.body}
                </div>

                <div
                  className={`mt-1 flex items-center gap-2 px-1 text-xs ${memberSubtle} ${
                    message.isCurrentMember ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <span>{message.createdAt}</span>
                  {message.reactions ? <span>{labels.reactionsByMessageId[message.id]}</span> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-[64px] left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-black/[0.08] bg-white/90 px-3 py-3 backdrop-blur-[20px] lg:bottom-6 lg:w-[calc(100%-48px)] lg:max-w-3xl lg:rounded-2xl lg:border lg:px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 text-[#525252]"
            aria-label={labels.addImage}
          >
            <ImagePlus className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex min-h-11 flex-1 items-center rounded-full border border-gray-200 bg-[#FAFAFA] px-4 text-sm text-[#939597]">
            {labels.composer}
          </div>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 text-[#525252]"
            aria-label={labels.addReaction}
          >
            <Smile className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#131517] text-white"
            aria-label={labels.send}
          >
            <SendHorizonal className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  )
}
