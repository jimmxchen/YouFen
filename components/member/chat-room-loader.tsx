'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { ChatMessage, ChatRoom } from '@/types/member'
import { ChatRoomView } from '@/components/member/chat-room-view'
import { memberMuted } from '@/components/member/ui'
import { getLocalChat, subscribeLocalChats, updateLocalChatMessages } from '@/lib/member/local-chats'

type ChatRoomViewLabels = Parameters<typeof ChatRoomView>[0]['labels']

interface ChatRoomLoaderProps {
  serverRoom: ChatRoom | null
  locale: string
  communityId: string
  chatId: string
  baseHref: string
  // Count-bearing labels arrive as templates with an `__COUNT__` placeholder so
  // this client component can resolve them for chats the server never rendered.
  onlineTemplate: string
  membersTemplate: string
  labels: Omit<ChatRoomViewLabels, 'online' | 'members'>
  notFound: {
    title: string
    back: string
  }
}

export function ChatRoomLoader({
  serverRoom,
  locale,
  communityId,
  chatId,
  baseHref,
  onlineTemplate,
  membersTemplate,
  labels,
  notFound,
}: ChatRoomLoaderProps) {
  const [localRoom, setLocalRoom] = useState<ChatRoom | null>(null)
  const [resolved, setResolved] = useState(serverRoom !== null)

  useEffect(() => {
    if (serverRoom) return

    const sync = () => {
      setLocalRoom(getLocalChat(communityId, chatId))
      setResolved(true)
    }
    sync()
    return subscribeLocalChats(sync)
  }, [serverRoom, communityId, chatId])

  const room = serverRoom ?? localRoom
  const isLocal = serverRoom === null

  const viewLabels = useMemo<ChatRoomViewLabels | null>(() => {
    if (!room) return null

    const onlineCount = room.participants.filter(
      (participant) => participant.status === 'online'
    ).length

    return {
      ...labels,
      online: onlineTemplate.replace('__COUNT__', String(onlineCount)),
      members: membersTemplate.replace('__COUNT__', String(room.participants.length)),
    }
  }, [room, labels, onlineTemplate, membersTemplate])

  if (!room || !viewLabels) {
    // Server rooms are resolved synchronously; only local lookups can be pending.
    if (!resolved) return null

    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center">
        <p className={`text-sm ${memberMuted}`}>{notFound.title}</p>
        <Link
          href={`${baseHref}/chat`}
          className="inline-flex items-center gap-2 rounded-xl bg-[#131517] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#262626]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {notFound.back}
        </Link>
      </div>
    )
  }

  return (
    <ChatRoomView
      room={room}
      locale={locale}
      communityId={communityId}
      labels={viewLabels}
      onMessagesChange={
        isLocal
          ? (messages: ChatMessage[]) => updateLocalChatMessages(communityId, chatId, messages)
          : undefined
      }
    />
  )
}
