import Link from 'next/link'
import { BellOff, ChevronRight, Pin } from 'lucide-react'
import type { ChatRoom } from '@/types/member'
import { memberMuted, memberSubtle } from '@/components/member/ui'

interface ChatRoomListProps {
  rooms: ChatRoom[]
  baseHref: string
  labels: {
    pinned: string
    muted: string
    members: (count: number) => string
  }
}

export function ChatRoomList({ rooms, baseHref, labels }: ChatRoomListProps) {
  if (rooms.length === 0) {
    return null
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#F0F0F0] bg-white">
      {rooms.map((room, index) => (
        <Link
          key={room.id}
          href={`${baseHref}/chat/${room.id}`}
          className={`flex min-h-[84px] items-center gap-3 px-4 py-3 transition hover:bg-[#FAFAFA] ${
            index > 0 ? 'border-t border-gray-100' : ''
          }`}
        >
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#131517] text-sm font-semibold text-white">
            {room.avatarInitials}
            {room.pinned ? (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Pin className="h-3 w-3" aria-label={labels.pinned} />
              </span>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h2 className="truncate text-base font-semibold text-[#131517]">{room.title}</h2>
              <span className={`shrink-0 text-xs ${memberSubtle}`}>{room.updatedAt}</span>
            </div>
            <p className={`mt-1 truncate text-sm ${memberMuted}`}>
              <span className="font-medium text-[#525252]">{room.lastMessage.author}: </span>
              {room.lastMessage.body}
            </p>
            <div className={`mt-1 flex items-center gap-2 text-xs ${memberSubtle}`}>
              <span>{labels.members(room.participants.length)}</span>
              {room.muted ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <BellOff className="h-3 w-3" aria-hidden="true" />
                    {labels.muted}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ChevronRight className="h-4 w-4 text-[#939597]" aria-hidden="true" />
          </div>
        </Link>
      ))}
    </section>
  )
}
