'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import type { ChatParticipant } from '@/types/member'
import { ChatComposePanel } from '@/components/member/chat-compose-panel'
import type { ChatComposeLabels } from '@/components/member/chat-compose-panel'

interface NewChatButtonProps {
  communityId: string
  labels: {
    newChat: string
    newChatTitle: string
    selectMembers: string
    startChat: string
    composeSearchPlaceholder: string
    composeMessagePlaceholder: string
    close: string
    cancel: string
  }
}

export function NewChatButton({ communityId, labels }: NewChatButtonProps) {
  const [showPanel, setShowPanel] = useState(false)
  const [contacts, setContacts] = useState<ChatParticipant[]>([])

  useEffect(() => {
    if (!showPanel) return

    async function fetchMembers() {
      try {
        const res = await fetch(`/api/chat/${communityId}/members`)
        if (!res.ok) return
        const data = await res.json()
        setContacts(data.members.map((m: { id: string; name: string; role: string; voicePower: number }) => ({
          id: m.id,
          name: m.name,
          role: m.role,
          avatarInitials: m.name.split(/\s+/).map((s: string) => s[0]).join('').toUpperCase().slice(0, 2) || '?',
          status: 'offline' as const,
        })))
      } catch { /* ignore */ }
    }

    fetchMembers()
  }, [communityId, showPanel])

  const handleSubmit = useCallback(async (payload: { contacts: ChatParticipant[]; message: string }) => {
    const title = payload.contacts.map(c => c.name).join(', ').slice(0, 60)
    const participantIds = payload.contacts.map(c => c.id)

    try {
      const res = await fetch(`/api/chat/${communityId}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type: 'member_group', participantIds }),
      })
      if (!res.ok) return
      const data = await res.json()

      // Send first message
      await fetch(`/api/chat/${communityId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: data.conversation.id, content: payload.message }),
      })
    } catch { /* ignore */ }

    setShowPanel(false)
  }, [communityId])

  const composeLabels: ChatComposeLabels = {
    title: labels.newChatTitle,
    to: labels.selectMembers,
    searchPlaceholder: labels.composeSearchPlaceholder,
    messagePlaceholder: labels.composeMessagePlaceholder,
    start: labels.startChat,
    empty: labels.composeSearchPlaceholder,
    selectHint: labels.selectMembers,
    noSelection: labels.selectMembers,
    cancel: labels.cancel,
    close: labels.close,
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowPanel(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-[#131517] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#262626]"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {labels.newChat}
      </button>

      {showPanel && (
        <ChatComposePanel
          contacts={contacts}
          labels={composeLabels}
          onClose={() => setShowPanel(false)}
          onSubmit={handleSubmit}
        />
      )}
    </>
  )
}
