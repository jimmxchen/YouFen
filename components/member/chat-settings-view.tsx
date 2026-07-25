'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  Bell,
  BellOff,
  Image as ImageIcon,
  Plus,
  Search,
  Users,
  X,
  Check,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ChatRoom, ChatParticipant } from '@/types/member'
import { memberMuted, memberSubtle } from '@/components/member/ui'
import { getChatMuted, setChatMuted } from '@/lib/member/local-mutes'

interface ChatSettingsViewProps {
  room: ChatRoom
  locale: string
  communityId: string
  backHref?: string
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
    addMembers: string
    addMembersHint: string
    selectMembers: string
    searchPlaceholder: string
    cancel: string
    added: string
  }
}

export function ChatSettingsView({ room, locale, communityId, backHref, labels }: ChatSettingsViewProps) {
  const [isMuted, setIsMuted] = useState(room.muted)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [participants, setParticipants] = useState<ChatParticipant[]>(room.participants)
  const [allMembers, setAllMembers] = useState<ChatParticipant[]>([])
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    setIsMuted(getChatMuted(communityId, room.id, room.muted))
  }, [communityId, room.id, room.muted])

  // Sync participants when room prop changes
  useEffect(() => {
    setParticipants(room.participants)
  }, [room.participants])

  function toggleMuted() {
    setIsMuted((current) => {
      const next = !current
      setChatMuted(communityId, room.id, next)
      return next
    })
  }

  // Fetch all community members for the add panel
  useEffect(() => {
    if (!showAddPanel) return

    async function fetchMembers() {
      try {
        const res = await fetch(`/api/chat/${communityId}/members`)
        if (!res.ok) return
        const data = await res.json()
        const existingIds = new Set(participants.map(p => p.id))
        setAllMembers(
          data.members
            .filter((m: { id: string }) => !existingIds.has(m.id))
            .map((m: { id: string; name: string; role: string }) => ({
              id: m.id,
              name: m.name,
              role: m.role,
              avatarInitials: m.name.split(/\s+/).map((s: string) => s[0]).join('').toUpperCase().slice(0, 2) || '?',
              status: 'offline' as const,
            }))
        )
      } catch { /* ignore */ }
    }

    fetchMembers()
  }, [communityId, showAddPanel, participants])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredMembers = useMemo(() => {
    if (!normalizedQuery) return allMembers
    return allMembers.filter(m =>
      `${m.name} ${m.role}`.toLowerCase().includes(normalizedQuery)
    )
  }, [allMembers, normalizedQuery])

  function toggleMember(id: string) {
    setSelectedIds(current =>
      current.includes(id) ? current.filter(v => v !== id) : [...current, id]
    )
  }

  async function handleAddMembers() {
    if (selectedIds.length === 0) return
    setAdding(true)
    try {
      const res = await fetch(`/api/chat/${communityId}/conversations/${room.id}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: selectedIds }),
      })
      if (res.ok) {
        // Add selected members to local participant list
        const added = allMembers.filter(m => selectedIds.includes(m.id))
        setParticipants(prev => [...prev, ...added])
        setSelectedIds([])
        setShowAddPanel(false)
      }
    } catch { /* ignore */ }
    setAdding(false)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-28 pt-5 lg:px-0 lg:pt-0">
      <header className="flex items-center gap-2">
        <Link
          href={backHref || `/${locale}/member/${communityId}/chat/${room.id}`}
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
          onClick={toggleMuted}
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
          <div className="flex items-center gap-2">
            <span className={`text-xs ${memberSubtle}`}>{labels.members}</span>
            <button
              type="button"
              onClick={() => setShowAddPanel(true)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#131517] transition hover:bg-[#FAFAFA]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {labels.addMembers}
            </button>
          </div>
        </div>
        {participants.map((participant) => (
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

      {/* Add Member Panel */}
      {showAddPanel && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={labels.addMembers}
          onClick={() => setShowAddPanel(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-[#F0F0F0] bg-white shadow-xl sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 border-b border-[#F0F0F0] px-4 py-3">
              <h2 className="text-base font-semibold text-[#131517]">{labels.addMembers}</h2>
              <button
                type="button"
                onClick={() => setShowAddPanel(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#525252] transition hover:bg-[#FAFAFA]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>

            <div className="border-b border-[#F0F0F0] px-4 py-3">
              <p className={`text-xs ${memberSubtle}`}>{labels.addMembersHint}</p>
              <label htmlFor="add-member-search" className="sr-only">
                {labels.searchPlaceholder}
              </label>
              <div className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] px-4">
                <Search className="h-4 w-4 shrink-0 text-[#939597]" aria-hidden="true" />
                <input
                  id="add-member-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={labels.searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-sm text-[#131517] outline-none placeholder:text-[#939597]"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {filteredMembers.length > 0 ? (
                <ul>
                  {filteredMembers.map((m) => {
                    const isSelected = selectedIds.includes(m.id)
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => toggleMember(m.id)}
                          aria-pressed={isSelected}
                          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-[#FAFAFA]"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-semibold text-[#131517]">
                            {m.avatarInitials}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-[#131517]">
                              {m.name}
                            </span>
                            <span className={`block truncate text-xs ${memberSubtle}`}>
                              {m.role}
                            </span>
                          </span>
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-[#E5E5E5] bg-white text-transparent'
                            }`}
                            aria-hidden="true"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className={`px-3 py-6 text-center text-sm ${memberMuted}`}>
                  {labels.selectMembers}
                </p>
              )}
            </div>

            <div className="border-t border-[#F0F0F0] px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPanel(false)}
                  className="flex-1 rounded-xl border border-[#F0F0F0] px-4 py-2.5 text-sm font-medium text-[#525252] transition hover:bg-[#FAFAFA]"
                >
                  {labels.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleAddMembers}
                  disabled={selectedIds.length === 0 || adding}
                  className="flex-1 rounded-xl bg-[#131517] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#262626] disabled:cursor-not-allowed disabled:bg-[#D4D4D4]"
                >
                  {adding ? labels.added : `${labels.addMembers} (${selectedIds.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
