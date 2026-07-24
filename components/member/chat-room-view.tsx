'use client'

import Link from 'next/link'
import { ArrowLeft, BellOff, ImagePlus, Info, Search, SendHorizonal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, ChatRoom } from '@/types/member'
import { memberMuted, memberSubtle } from '@/components/member/ui'
import { getChatMuted, subscribeChatMutes } from '@/lib/member/local-mutes'

interface ChatRoomViewProps {
  room: ChatRoom
  locale: string
  communityId: string
  onMessagesChange?: (messages: ChatMessage[]) => void
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
    addImage: string
    settings: string
    imageShared: string
  }
}

export function ChatRoomView({ room, locale, communityId, onMessagesChange, labels }: ChatRoomViewProps) {
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState(room.messages)
  const [draft, setDraft] = useState('')
  const [isMuted, setIsMuted] = useState(room.muted)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const didMountRef = useRef(false)

  useEffect(() => {
    const sync = () => setIsMuted(getChatMuted(communityId, room.id, room.muted))
    sync()
    return subscribeChatMutes(sync)
  }, [communityId, room.id, room.muted])

  useEffect(() => {
    // Skip the initial render so we only persist changes the user makes here.
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    onMessagesChange?.(messages)
  }, [messages, onMessagesChange])
  const normalizedQuery = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!normalizedQuery) return []

    return messages.filter((message) =>
      [message.author, message.role, message.body].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      )
    )
  }, [normalizedQuery, messages])
  const pinnedMessage = messages.find((message) => message.isOperator)
  const baseHref = `/${locale}/member/${communityId}`
  const currentMember = room.messages.find((message) => message.isCurrentMember)
  const currentMemberName = currentMember?.author ?? 'You'
  const currentMemberRole = currentMember?.role ?? 'Member'
  const currentMemberInitials = currentMember?.avatarInitials ?? 'YO'

  function createCurrentMemberMessage(body: string): ChatMessage {
    return {
      id: `local-${Date.now()}`,
      author: currentMemberName,
      role: currentMemberRole,
      avatarInitials: currentMemberInitials,
      body,
      createdAt: new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date()),
      isCurrentMember: true,
    }
  }

  function sendMessage() {
    const body = draft.trim()
    if (!body) return

    setMessages((current) => [...current, createCurrentMemberMessage(body)])
    setDraft('')
  }

  function addImage(fileName: string) {
    setMessages((current) => [
      ...current,
      createCurrentMemberMessage(`${labels.imageShared} ${fileName}`),
    ])
  }

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-[#F0F0F0] bg-white px-3 py-3 lg:static lg:mx-auto lg:w-full lg:max-w-3xl lg:rounded-xl lg:border lg:px-4">
        <div className="flex items-center gap-2">
          <Link
            href={`${baseHref}/chat`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#525252] transition-all hover:bg-[#FAFAFA]"
            aria-label={labels.back}
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#131517] text-sm font-semibold text-white">
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
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all ${
              showSearch ? 'bg-[#131517] text-white' : 'text-[#525252] hover:bg-[#FAFAFA]'
            }`}
            aria-label={labels.search}
            onClick={() => setShowSearch((current) => !current)}
          >
            {showSearch ? <X className="h-5 w-5" aria-hidden="true" /> : <Search className="h-5 w-5" aria-hidden="true" />}
          </button>
          <Link
            href={`${baseHref}/chat/${room.id}/settings`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#525252] transition-all hover:bg-[#FAFAFA]"
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
            <div className="flex min-h-11 items-center gap-2 rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] px-4">
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
          <section className="rounded-xl border border-[#F0F0F0] bg-white px-4 py-3">
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

        {isMuted ? (
          <div className="flex items-center gap-2 rounded-xl border border-[#F0F0F0] bg-white px-4 py-3 text-sm text-[#525252]">
            <BellOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            {labels.muted}
          </div>
        ) : null}

        {pinnedMessage ? (
          <section className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-700">
              {labels.pinned}
            </div>
            <p className="text-sm leading-6 text-emerald-950">{pinnedMessage.body}</p>
          </section>
        ) : null}

        <div className="space-y-4">
          {messages.map((message) => (
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
                  className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
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
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-[64px] left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-[#F0F0F0] bg-white px-3 py-3 lg:bottom-8 lg:left-[calc(50%+8rem)] lg:w-[calc(100%-20rem)] lg:max-w-3xl lg:rounded-xl lg:border lg:px-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) addImage(file.name)
            event.target.value = ''
          }}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#F0F0F0] text-[#525252] transition-all hover:border-[#E5E5E5] hover:bg-[#FAFAFA]"
            aria-label={labels.addImage}
          >
            <ImagePlus className="h-5 w-5" aria-hidden="true" />
          </button>
          <label className="sr-only" htmlFor="chat-composer">
            {labels.composer}
          </label>
          <input
            id="chat-composer"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                sendMessage()
              }
            }}
            placeholder={labels.composer}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] px-4 text-sm text-[#131517] outline-none placeholder:text-[#939597] focus:border-[#E5E5E5] focus:ring-2 focus:ring-emerald-500/15"
          />
          <button
            type="button"
            onClick={sendMessage}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#131517] text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#262626] hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:bg-[#D4D4D4] disabled:hover:translate-y-0 disabled:hover:bg-[#D4D4D4] disabled:hover:shadow-sm"
            aria-label={labels.send}
            disabled={!draft.trim()}
          >
            <SendHorizonal className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  )
}
