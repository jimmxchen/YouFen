'use client'

import type { ChatMessage, ChatRoom } from '@/types/member'

// Front-end only persistence for member-created chats. Real chats come from the
// server (getDemoMember); anything the user starts in the browser lives here so
// it survives reloads and can be reopened from its own /chat/[id] route.

const STORAGE_PREFIX = 'youfen:member-chats:'
const CHANGE_EVENT = 'youfen:local-chats-changed'

function isBrowser() {
  return typeof window !== 'undefined'
}

function storageKey(communityId: string) {
  return `${STORAGE_PREFIX}${communityId}`
}

export function getLocalChats(communityId: string): ChatRoom[] {
  if (!isBrowser()) return []

  try {
    const raw = window.localStorage.getItem(storageKey(communityId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as ChatRoom[]) : []
  } catch {
    return []
  }
}

export function getLocalChat(communityId: string, chatId: string): ChatRoom | null {
  return getLocalChats(communityId).find((room) => room.id === chatId) ?? null
}

function writeLocalChats(communityId: string, rooms: ChatRoom[]) {
  if (!isBrowser()) return

  try {
    window.localStorage.setItem(storageKey(communityId), JSON.stringify(rooms))
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { communityId } }))
  } catch {
    // Ignore quota / private-mode write failures — this is demo-only state.
  }
}

export function saveLocalChat(communityId: string, room: ChatRoom) {
  const rooms = getLocalChats(communityId)
  const index = rooms.findIndex((existing) => existing.id === room.id)

  if (index >= 0) {
    rooms[index] = room
  } else {
    rooms.unshift(room)
  }

  writeLocalChats(communityId, rooms)
}

export function updateLocalChatMessages(
  communityId: string,
  chatId: string,
  messages: ChatMessage[]
) {
  const rooms = getLocalChats(communityId)
  const index = rooms.findIndex((room) => room.id === chatId)
  if (index < 0) return

  const room = rooms[index]
  const lastMessage = messages[messages.length - 1]

  rooms[index] = {
    ...room,
    messages,
    lastMessage: lastMessage
      ? { author: lastMessage.author, body: lastMessage.body }
      : room.lastMessage,
  }

  writeLocalChats(communityId, rooms)
}

export function subscribeLocalChats(callback: () => void) {
  if (!isBrowser()) return () => {}

  const handler = () => callback()
  window.addEventListener(CHANGE_EVENT, handler)
  window.addEventListener('storage', handler)

  return () => {
    window.removeEventListener(CHANGE_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}
