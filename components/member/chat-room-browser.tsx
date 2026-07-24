'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { ChatRoom } from '@/types/member'
import { ChatRoomList } from '@/components/member/chat-room-list'
import { memberCard, memberMuted } from '@/components/member/ui'

interface ChatRoomBrowserProps {
  rooms: ChatRoom[]
  baseHref: string
  labels: {
    searchChats: string
    groupChats: string
    unread: string
    pinned: string
    muted: string
    empty: string
    members: string
  }
}

export function ChatRoomBrowser({ rooms, baseHref, labels }: ChatRoomBrowserProps) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const filteredRooms = useMemo(() => {
    if (!normalizedQuery) return rooms

    return rooms.filter((room) => {
      const participantText = room.participants
        .map((participant) => `${participant.name} ${participant.role}`)
        .join(' ')

      return [
        room.title,
        room.description,
        room.category,
        room.lastMessage.author,
        room.lastMessage.body,
        participantText,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [normalizedQuery, rooms])

  return (
    <>
      <section className="rounded-xl border border-[#F0F0F0] bg-white p-4">
        <label htmlFor="chat-list-search" className="sr-only">
          {labels.searchChats}
        </label>
        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] px-4">
          <Search className="h-4 w-4 shrink-0 text-[#939597]" aria-hidden="true" />
          <input
            id="chat-list-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.searchChats}
            className="min-w-0 flex-1 bg-transparent text-sm text-[#131517] outline-none placeholder:text-[#939597]"
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span className={memberMuted}>{labels.groupChats}</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            {labels.unread}
          </span>
        </div>
      </section>

      {filteredRooms.length > 0 ? (
        <ChatRoomList
          rooms={filteredRooms}
          baseHref={baseHref}
          labels={{
            pinned: labels.pinned,
            muted: labels.muted,
            members: (count) => labels.members.replace('__COUNT__', String(count)),
          }}
        />
      ) : (
        <section className={memberCard}>
          <p className={`text-sm ${memberMuted}`}>{labels.empty}</p>
        </section>
      )}
    </>
  )
}
