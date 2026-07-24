'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Send } from 'lucide-react'
import { demoConversations, demoChatMessages } from '@/lib/demo-data'
import { type ChatMessage } from '@/types/admin'
import { cn } from '@/lib/utils'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatRelativeDay(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()
  return isToday ? formatTime(iso) : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function ChatPage() {
  const t = useTranslations('admin')
  const [conversations, setConversations] = useState(demoConversations)
  const [activeId, setActiveId] = useState<string | null>(conversations[0]?.id ?? null)
  const [messages, setMessages] = useState<ChatMessage[]>(demoChatMessages)
  const [draft, setDraft] = useState('')

  const activeConversation = conversations.find(c => c.id === activeId) ?? null
  const threadMessages = messages.filter(m => m.conversationId === activeId)

  const selectConversation = (id: string) => {
    setActiveId(id)
    setConversations(prev => prev.map(c => c.id === id ? { ...c, unreadCount: 0 } : c))
  }

  const sendMessage = () => {
    if (!draft.trim() || !activeConversation) return
    const newMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      conversationId: activeConversation.id,
      senderId: 'admin',
      senderName: 'Admin',
      isAdmin: true,
      content: draft.trim(),
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, newMessage])
    setConversations(prev => prev.map(c => c.id === activeConversation.id ? { ...c, lastMessage: newMessage.content, lastMessageAt: newMessage.createdAt } : c))
    setDraft('')
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-[40px] font-medium text-[#131517] leading-[48px]">
          {t('chat')}
        </h1>
        <p className="text-lg text-[#525252] mt-2">
          {t('chatSubtitle')}
        </p>
      </div>

      <div className="flex h-[640px] rounded-2xl border border-[#F0F0F0] bg-white overflow-hidden">
        {/* Conversation list */}
        <div className="w-80 border-r border-[#F0F0F0] flex flex-col">
          <div className="px-5 py-4 border-b border-[#F0F0F0]">
            <h2 className="text-sm font-semibold text-[#131517]">{t('conversations')}</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-5 py-3.5 text-left border-b border-[#F0F0F0] transition-colors',
                  activeId === conv.id ? 'bg-[#FAFAFA]' : 'hover:bg-[#FAFAFA]/60'
                )}
              >
                <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center text-white text-xs font-medium">
                  {conv.memberName[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[#131517] truncate">{conv.memberName}</p>
                    <span className="text-xs text-[#939597] shrink-0">{formatRelativeDay(conv.lastMessageAt)}</span>
                  </div>
                  <p className="text-xs text-[#939597] truncate mt-0.5">{conv.lastMessage}</p>
                </div>
                {conv.unreadCount > 0 && (
                  <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-medium flex items-center justify-center">
                    {conv.unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Thread */}
        <div className="flex-1 flex flex-col">
          {activeConversation ? (
            <>
              <div className="px-6 py-4 border-b border-[#F0F0F0] flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center text-white text-xs font-medium">
                  {activeConversation.memberName[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#131517]">{activeConversation.memberName}</p>
                  <p className="text-xs text-emerald-600">{t('online')}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {threadMessages.map(msg => (
                  <div key={msg.id} className={cn('flex', msg.isAdmin ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[70%] space-y-1', msg.isAdmin ? 'items-end' : 'items-start')}>
                      <div
                        className={cn(
                          'px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                          msg.isAdmin
                            ? 'bg-[#131517] text-white rounded-br-sm'
                            : 'bg-[#FAFAFA] text-[#131517] rounded-bl-sm'
                        )}
                      >
                        {msg.content}
                      </div>
                      <p className={cn('text-xs text-[#939597] px-1', msg.isAdmin ? 'text-right' : 'text-left')}>
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-6 py-4 border-t border-[#F0F0F0] flex items-center gap-3">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendMessage() }}
                  placeholder={t('typeMessage')}
                  className="flex-1 px-4 py-2.5 rounded-2xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
                <button
                  onClick={sendMessage}
                  disabled={!draft.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#131517] text-white text-sm font-medium hover:bg-[#262626] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:bg-[#131517]"
                >
                  <Send className="w-4 h-4" />
                  {t('send')}
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-[#939597]">
              {t('noConversationSelected')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
