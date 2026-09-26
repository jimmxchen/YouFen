'use client'

// Front-end only persistence for chat mute preferences. Muting is a demo-scoped
// UI toggle, so it lives in localStorage keyed per community rather than on the
// server. The room view subscribes so the muted banner stays in sync with the
// settings toggle.

const STORAGE_PREFIX = 'youfen:member-chat-muted:'
const CHANGE_EVENT = 'youfen:local-chat-mutes-changed'

function isBrowser() {
  return typeof window !== 'undefined'
}

function storageKey(communityId: string) {
  return `${STORAGE_PREFIX}${communityId}`
}

function getMuteMap(communityId: string): Record<string, boolean> {
  if (!isBrowser()) return {}

  try {
    const raw = window.localStorage.getItem(storageKey(communityId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

// `fallback` is the room's own default (e.g. demo data may ship a room muted),
// used when the member has not set an explicit preference for this chat.
export function getChatMuted(communityId: string, chatId: string, fallback = false): boolean {
  return getMuteMap(communityId)[chatId] ?? fallback
}

export function setChatMuted(communityId: string, chatId: string, muted: boolean) {
  if (!isBrowser()) return

  try {
    const map = getMuteMap(communityId)
    map[chatId] = muted
    window.localStorage.setItem(storageKey(communityId), JSON.stringify(map))
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { communityId } }))
  } catch {
    // Ignore quota / private-mode write failures — this is demo-only state.
  }
}

export function subscribeChatMutes(callback: () => void) {
  if (!isBrowser()) return () => {}

  const handler = () => callback()
  window.addEventListener(CHANGE_EVENT, handler)
  window.addEventListener('storage', handler)

  return () => {
    window.removeEventListener(CHANGE_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}
