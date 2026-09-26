'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Search, SendHorizonal, X } from 'lucide-react'
import type { ChatParticipant } from '@/types/member'
import { memberMuted, memberSubtle } from '@/components/member/ui'

export interface ChatComposeLabels {
  title: string
  to: string
  searchPlaceholder: string
  messagePlaceholder: string
  start: string
  empty: string
  selectHint: string
  noSelection: string
  cancel: string
  close: string
}

interface ChatComposePanelProps {
  contacts: ChatParticipant[]
  labels: ChatComposeLabels
  onClose: () => void
  onSubmit: (payload: { contacts: ChatParticipant[]; message: string }) => void
}

export function ChatComposePanel({ contacts, labels, onClose, onSubmit }: ChatComposePanelProps) {
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredContacts = useMemo(() => {
    if (!normalizedQuery) return contacts

    return contacts.filter((contact) =>
      `${contact.name} ${contact.role}`.toLowerCase().includes(normalizedQuery)
    )
  }, [contacts, normalizedQuery])

  const selectedContacts = useMemo(
    () => contacts.filter((contact) => selectedIds.includes(contact.id)),
    [contacts, selectedIds]
  )

  function toggleContact(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    )
  }

  const canSubmit = selectedContacts.length > 0 && message.trim().length > 0

  function handleSubmit() {
    if (!canSubmit) return
    onSubmit({ contacts: selectedContacts, message: message.trim() })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-[#F0F0F0] bg-white shadow-xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[#F0F0F0] px-4 py-3">
          <h2 className="text-base font-semibold text-[#131517]">{labels.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#525252] transition hover:bg-[#FAFAFA]"
            aria-label={labels.close}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="border-b border-[#F0F0F0] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`shrink-0 text-xs font-medium uppercase tracking-wide ${memberSubtle}`}>
              {labels.to}
            </span>
            {selectedContacts.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selectedContacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => toggleContact(contact.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-[#131517] px-2.5 py-1 text-xs font-medium text-white"
                  >
                    {contact.name}
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : (
              <span className={`text-xs ${memberMuted}`}>{labels.selectHint}</span>
            )}
          </div>

          <label htmlFor="chat-compose-search" className="sr-only">
            {labels.searchPlaceholder}
          </label>
          <div className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] px-4">
            <Search className="h-4 w-4 shrink-0 text-[#939597]" aria-hidden="true" />
            <input
              id="chat-compose-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-sm text-[#131517] outline-none placeholder:text-[#939597]"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {filteredContacts.length > 0 ? (
            <ul>
              {filteredContacts.map((contact) => {
                const isSelected = selectedIds.includes(contact.id)

                return (
                  <li key={contact.id}>
                    <button
                      type="button"
                      onClick={() => toggleContact(contact.id)}
                      aria-pressed={isSelected}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-[#FAFAFA]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-semibold text-[#131517]">
                        {contact.avatarInitials}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[#131517]">
                          {contact.name}
                        </span>
                        <span className={`block truncate text-xs ${memberSubtle}`}>
                          {contact.role}
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
            <p className={`px-3 py-6 text-center text-sm ${memberMuted}`}>{labels.empty}</p>
          )}
        </div>

        <div className="border-t border-[#F0F0F0] px-4 py-3">
          <label htmlFor="chat-compose-message" className="sr-only">
            {labels.messagePlaceholder}
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id="chat-compose-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  handleSubmit()
                }
              }}
              rows={2}
              placeholder={labels.messagePlaceholder}
              className="min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] px-4 py-2.5 text-sm text-[#131517] outline-none placeholder:text-[#939597] focus:border-[#E5E5E5] focus:ring-2 focus:ring-emerald-500/15"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#131517] text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#262626] hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:bg-[#D4D4D4] disabled:hover:translate-y-0 disabled:hover:bg-[#D4D4D4] disabled:hover:shadow-sm"
              aria-label={labels.start}
            >
              <SendHorizonal className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          {!canSubmit ? (
            <p className={`mt-2 text-xs ${memberSubtle}`}>{labels.noSelection}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
