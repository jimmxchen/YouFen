'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Search, Send, X } from 'lucide-react'
import { type ChatConversation, type ChatMessage } from '@/types/admin'
import { useCommunity } from '@/lib/hooks/use-community'
import { cn } from '@/lib/utils'

// ---- helpers ----

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatRelativeDay(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()
  return isToday ? formatTime(iso) : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** Map raw API message (senderRole) → ChatMessage (isAdmin) */
function toChatMessage(raw: {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  senderRole: string
  content: string
  createdAt: string
}): ChatMessage {
  return {
    id: raw.id,
    conversationId: raw.conversationId,
    senderId: raw.senderId,
    senderName: raw.senderName,
    isAdmin: raw.senderRole === 'admin',
    content: raw.content,
    createdAt: raw.createdAt,
  }
}

// ---- constants ----

const POLL_INTERVAL = 3000

interface MemberItem {
  id: string
  name: string
  role: string
  tags: string[]
  voicePower: number
  hasConversation: boolean
  conversationId: string | null
}

// ---- component ----

export default function ChatPage() {
  const t = useTranslations('admin')
  const { communityId } = useCommunity()

  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastTsRef = useRef<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [members, setMembers] = useState<MemberItem[]>([])
  const [memberQuery, setMemberQuery] = useState('')
  const [creatingId, setCreatingId] = useState<string | null>(null)

  const activeConversation = conversations.find(c => c.id === activeId) ?? null
  const threadMessages = messages.filter(m => m.conversationId === activeId)

  // ---- auto-scroll to bottom ----

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [threadMessages.length])

  // ---- fetch conversations ----

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${communityId}/conversations`)
      if (!res.ok) return
      const data = await res.json()
      setConversations(data.conversations)
      if (!activeId && data.conversations.length > 0) {
        setActiveId(data.conversations[0].id)
      }
    } catch { /* ignore */ }
  }, [communityId, activeId])

  // ---- fetch messages ----

  const fetchMessages = useCallback(async (convId: string, since?: string) => {
    try {
      const params = new URLSearchParams({ conversationId: convId })
      if (since) params.set('since', since)
      const res = await fetch(`/api/chat/${communityId}/messages?${params}`)
      if (!res.ok) return
      const data = await res.json()
      const mapped: ChatMessage[] = data.messages.map(toChatMessage)

      if (since) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id))
          const newMsgs = mapped.filter(m => !existingIds.has(m.id))
          return [...prev, ...newMsgs]
        })
      } else {
        setMessages(prev => {
          const other = prev.filter(m => m.conversationId !== convId)
          return [...other, ...mapped]
        })
      }
      if (mapped.length > 0) {
        lastTsRef.current = mapped[mapped.length - 1].createdAt
      }
    } catch { /* ignore */ }
  }, [communityId])

  // ---- init ----

  useEffect(() => {
    setLoading(true)
    fetchConversations().finally(() => setLoading(false))
  }, [communityId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeId) return
    setMessages([])
    lastTsRef.current = ''
    fetchMessages(activeId)
  }, [activeId, fetchMessages])

  // ---- polling ----

  useEffect(() => {
    if (!activeId) return
    pollRef.current = setInterval(() => {
      fetchMessages(activeId, lastTsRef.current || undefined)
    }, POLL_INTERVAL)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [activeId, fetchMessages])

  // ---- actions ----

  const selectConversation = (id: string) => {
    setActiveId(id)
    setConversations(prev => prev.map(c => c.id === id ? { ...c, unreadCount: 0 } : c))
  }

  const sendMessage = async () => {
    if (!draft.trim() || !activeConversation) return
    const content = draft.trim()
    setDraft('')

    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      conversationId: activeConversation.id,
      senderId: 'me',
      senderName: 'Admin',
      isAdmin: true,
      content,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])

    try {
      const res = await fetch(`/api/chat/${communityId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeConversation.id, content }),
      })
      if (res.ok) {
        const data = await res.json()
        setMessages(prev => prev.map(m =>
          m.id === optimistic.id ? toChatMessage(data.message) : m
        ))
        setConversations(prev => prev.map(c => c.id === activeConversation.id
          ? { ...c, lastMessage: content, lastMessageAt: new Date().toISOString() }
          : c
        ))
      }
    } catch { /* keep optimistic */ }
  }

  // ---- modal ----

  const openModal = useCallback(async () => {
    setShowModal(true)
    setMemberQuery('')
    try {
      const res = await fetch(`/api/chat/${communityId}/members`)
      if (res.ok) {
        const data = await res.json()
        setMembers(data.members)
      }
    } catch { /* ignore */ }
  }, [communityId])

  const startChat = async (member: MemberItem) => {
    if (member.hasConversation && member.conversationId) {
      selectConversation(member.conversationId)
      setShowModal(false)
      return
    }
    setCreatingId(member.id)
    try {
      const res = await fetch(`/api/chat/${communityId}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: member.id }),
      })
      if (res.ok) {
        const data = await res.json()
        await fetchConversations()
        selectConversation(data.conversation.id)
        setShowModal(false)
      }
    } catch { /* ignore */ }
    setCreatingId(null)
  }

  const filteredMembers = members.filter(m => {
    if (!memberQuery.trim()) return true
    const q = memberQuery.toLowerCase()
    return (
      m.name.toLowerCase().includes(q) ||
      m.role.toLowerCase().includes(q) ||
      m.tags.some(tag => tag.toLowerCase().includes(q))
    )
  })

  // ---- derived ----

  const memberInitial = (activeConversation?.memberName || activeConversation?.title)?.[0] || '?'

  // ---- render ----

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[40px] font-medium text-[#131517] leading-[48px]">
            {t('chat')}
          </h1>
          <p className="text-lg text-[#525252] mt-2">
            {t('chatSubtitle')}
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#131517] text-white text-sm font-medium hover:bg-[#262626] hover:-translate-y-0.5 transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          {t('newChat')}
        </button>
      </div>

      {/* chat layout */}
      <div className="flex h-[680px] rounded-2xl border border-[#F0F0F0] bg-white overflow-hidden shadow-sm">
        {/* ---- sidebar ---- */}
        <div className="w-80 border-r border-[#F0F0F0] flex flex-col bg-[#FAFAFA]/50">
          <div className="px-5 py-4 border-b border-[#F0F0F0] bg-white">
            <h2 className="text-sm font-semibold text-[#131517]">{t('conversations')}</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-sm text-[#939597]">
                Loading...
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-sm text-[#939597] px-5 text-center gap-2">
                <p>{t('noConversationSelected')}</p>
                <button
                  onClick={openModal}
                  className="text-emerald-600 font-medium hover:text-emerald-700 transition-colors"
                >
                  {t('newChat')}
                </button>
              </div>
            ) : (
              conversations.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => selectConversation(conv.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-5 py-4 text-left transition-colors',
                    activeId === conv.id
                      ? 'bg-white border-r-2 border-r-emerald-500'
                      : 'hover:bg-white/60 border-r-2 border-r-transparent'
                  )}
                >
                  <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center text-white text-sm font-semibold shadow-sm">
                    {(conv.memberName || conv.title)?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#131517] truncate">
                        {conv.memberName || conv.title || 'Chat'}
                      </p>
                      <span className="text-[11px] text-[#939597] shrink-0">
                        {formatRelativeDay(conv.lastMessageAt)}
                      </span>
                    </div>
                    <p className="text-xs text-[#939597] truncate mt-0.5">
                      {conv.lastMessage || ' '}
                    </p>
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="shrink-0 min-w-[20px] h-[20px] px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-semibold flex items-center justify-center">
                      {conv.unreadCount}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* ---- thread ---- */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeConversation ? (
            <>
              {/* thread header */}
              <div className="shrink-0 px-6 py-4 border-b border-[#F0F0F0] flex items-center gap-3 bg-white">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center text-white text-sm font-semibold shadow-sm">
                  {memberInitial.toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#131517]">
                    {activeConversation.memberName || activeConversation.title || 'Chat'}
                  </p>
                  <p className="text-xs text-emerald-600 font-medium">{t('online')}</p>
                </div>
              </div>

              {/* messages */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 bg-[#FAFAFA]/30">
                {threadMessages.length === 0 && (
                  <div className="flex items-center justify-center h-full text-sm text-[#939597]">
                    No messages yet. Say hello!
                  </div>
                )}
                {threadMessages.map(msg => {
                  const isMe = msg.isAdmin
                  return (
                    <div key={msg.id} className={cn('flex gap-2', isMe ? 'justify-end' : 'justify-start')}>
                      {/* avatar for received messages */}
                      {!isMe && (
                        <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center text-white text-xs font-semibold mt-1">
                          {memberInitial.toUpperCase()}
                        </div>
                      )}

                      <div className={cn('max-w-[65%]', isMe ? 'items-end' : 'items-start')}>
                        {/* sender name for received */}
                        {!isMe && (
                          <p className="text-xs text-[#939597] mb-1 px-1">{msg.senderName}</p>
                        )}

                        <div
                          className={cn(
                            'px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm',
                            isMe
                              ? 'bg-[#131517] text-white rounded-br-md'
                              : 'bg-white text-[#131517] rounded-bl-md border border-[#F0F0F0]'
                          )}
                        >
                          {msg.content}
                        </div>

                        <p className={cn(
                          'text-[11px] text-[#939597] mt-1 px-1',
                          isMe ? 'text-right' : 'text-left'
                        )}>
                          {formatTime(msg.createdAt)}
                        </p>
                      </div>

                      {/* avatar for sent messages */}
                      {isMe && (
                        <div className="w-8 h-8 shrink-0 rounded-full bg-[#131517] flex items-center justify-center text-white text-xs font-semibold mt-1">
                          A
                        </div>
                      )}
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* composer */}
              <div className="shrink-0 px-6 py-4 border-t border-[#F0F0F0] flex items-center gap-3 bg-white">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendMessage() }}
                  placeholder={t('typeMessage')}
                  className="flex-1 px-4 py-3 rounded-2xl border border-[#F0F0F0] bg-[#FAFAFA] text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 transition-all"
                />
                <button
                  onClick={sendMessage}
                  disabled={!draft.trim()}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#131517] text-white text-sm font-semibold hover:bg-[#262626] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:bg-[#131517] shadow-sm"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('send')}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-sm text-[#939597] gap-3">
              <div className="w-16 h-16 rounded-full bg-[#FAFAFA] flex items-center justify-center">
                <Send className="w-6 h-6 text-[#D4D4D4]" />
              </div>
              <p>{t('noConversationSelected')}</p>
            </div>
          )}
        </div>
      </div>

      {/* ---- New Chat Modal ---- */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />

          <div className="relative w-full max-w-md max-h-[560px] bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
            {/* modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0F0]">
              <h2 className="text-lg font-semibold text-[#131517]">{t('newChat')}</h2>
              <button
                onClick={() => setShowModal(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-[#525252] hover:bg-[#FAFAFA] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* search */}
            <div className="px-5 py-3 border-b border-[#F0F0F0]">
              <div className="flex items-center gap-2 rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-[#939597]" />
                <input
                  type="text"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  placeholder="Search members..."
                  className="min-w-0 flex-1 bg-transparent text-sm text-[#131517] outline-none placeholder:text-[#A3A3A3]"
                  autoFocus
                />
              </div>
            </div>

            {/* member list */}
            <div className="flex-1 overflow-y-auto">
              {filteredMembers.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-[#939597]">
                  {memberQuery ? 'No members match your search' : 'No members found'}
                </div>
              ) : (
                filteredMembers.map(member => (
                  <button
                    key={member.id}
                    onClick={() => startChat(member)}
                    disabled={creatingId === member.id}
                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-[#FAFAFA] transition-colors disabled:opacity-50"
                  >
                    <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-sm font-semibold shadow-sm">
                      {member.name[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[#131517] truncate">{member.name}</p>
                        <span className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                          member.role === 'owner' ? 'bg-amber-100 text-amber-700' :
                          member.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        )}>
                          {member.role}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {member.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-xs text-[#939597]">{tag}</span>
                        ))}
                        <span className="text-xs text-[#939597]">VP: {member.voicePower}</span>
                      </div>
                    </div>
                    {creatingId === member.id ? (
                      <span className="text-xs text-[#939597]">Creating...</span>
                    ) : member.hasConversation ? (
                      <span className="text-xs text-emerald-600 font-medium">Open</span>
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FAFAFA]">
                        <Plus className="h-4 w-4 text-[#939597]" />
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
