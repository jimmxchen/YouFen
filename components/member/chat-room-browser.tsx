'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PenSquare, Search } from 'lucide-react'
import type { ChatParticipant, ChatMessage, ChatRoom } from '@/types/member'
import { ChatRoomList } from '@/components/member/chat-room-list'
import { ChatComposePanel, type ChatComposeLabels } from '@/components/member/chat-compose-panel'
import { memberCard, memberMuted } from '@/components/member/ui'
import { getLocalChats, saveLocalChat, subscribeLocalChats } from '@/lib/member/local-chats'

interface ChatRoomBrowserProps {
  rooms: ChatRoom[]
  baseHref: string
  locale: string
  communityId: string
  contacts: ChatParticipant[]
  currentMember: ChatParticipant
  directMessageCategory: string
  labels: {
    searchChats: string
    pinned: string
    muted: string
    empty: string
    members: string
    newMessage: string
    compose: ChatComposeLabels
  }
}

function toInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function ChatRoomBrowser({
  rooms,
  baseHref,
  locale,
  communityId,
  contacts,
  currentMember,
  directMessageCategory,
  labels,
}: ChatRoomBrowserProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [isComposing, setIsComposing] = useState(false)
  const [localChats, setLocalChats] = useState<ChatRoom[]>([])

  useEffect(() => {
    const sync = () => setLocalChats(getLocalChats(communityId))
    sync()
    return subscribeLocalChats(sync)
  }, [communityId])

  const allRooms = useMemo(() => [...localChats, ...rooms], [localChats, rooms])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredRooms = useMemo(() => {
    if (!normalizedQuery) return allRooms

    return allRooms.filter((room) => {
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
  }, [normalizedQuery, allRooms])

  function handleCreate({
    contacts: selected,
    message,
  }: {
    contacts: ChatParticipant[]
    message: string
  }) {
    const now = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date())
    const id = `local-${Date.now()}`

    const title =
      selected.length === 1
        ? selected[0].name
        : selected.map((contact) => contact.name.split(/\s+/)[0]).join(', ')
    const avatarInitials =
      selected.length === 1 ? selected[0].avatarInitials : toInitials(title) || 'GC'

    const firstMessage: ChatMessage = {
      id: `local-msg-${Date.now()}`,
      author: currentMember.name,
      role: currentMember.role,
      avatarInitials: currentMember.avatarInitials,
      body: message,
      createdAt: now,
      isCurrentMember: true,
    }

    const room: ChatRoom = {
      id,
      title,
      description: '',
      avatarInitials,
      category: directMessageCategory,
      unreadCount: 0,
      muted: false,
      pinned: false,
      updatedAt: now,
      inviteCode: '',
      sharedMediaCount: 0,
      lastMessage: { author: currentMember.name, body: message },
      participants: [currentMember, ...selected],
      messages: [firstMessage],
    }

    saveLocalChat(communityId, room)
    setIsComposing(false)
    router.push(`${baseHref}/chat/${id}`)
  }

  return (
    <>
      <section className="rounded-2xl border border-[#F0F0F0] bg-white p-4">
        <label htmlFor="chat-list-search" className="sr-only">
          {labels.searchChats}
        </label>
        <div className="flex items-center gap-2">
          <div className="flex min-h-11 flex-1 items-center gap-2 rounded-2xl border border-[#F0F0F0] bg-[#FAFAFA] px-4">
            <Search className="h-4 w-4 shrink-0 text-[#939597]" aria-hidden="true" />
            <input
              id="chat-list-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.searchChats}
              className="min-w-0 flex-1 bg-transparent text-sm text-[#131517] outline-none placeholder:text-[#939597]"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsComposing(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#131517] text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#262626] hover:shadow-md active:translate-y-0"
            aria-label={labels.newMessage}
          >
            <PenSquare className="h-5 w-5" aria-hidden="true" />
          </button>
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

      {isComposing ? (
        <ChatComposePanel
          contacts={contacts}
          labels={labels.compose}
          onClose={() => setIsComposing(false)}
          onSubmit={handleCreate}
        />
      ) : null}
    </>
  )
}
