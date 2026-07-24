import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth'
import { getMemberProfile } from '@/lib/api/member/queries'
import { db } from '@/db'
import { chatConversations } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { ChatSettingsView } from '@/components/member/chat-settings-view'
import { MemberShell } from '@/components/member/member-shell'
import { MobileBottomNav } from '@/components/member/mobile-bottom-nav'
import type { ChatRoom } from '@/types/member'

interface MemberChatSettingsPageProps {
  params: Promise<{
    locale: string
    communityId: string
    chatId: string
  }>
}

export default async function MemberChatSettingsPage({ params }: MemberChatSettingsPageProps) {
  const { locale, communityId, chatId } = await params
  const t = await getTranslations('member')
  const userId = await getSession()
  if (!userId) redirect('/sign-in')
  const member = await getMemberProfile(userId, communityId)

  // Fetch conversation metadata from DB
  const convRows = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, chatId), eq(chatConversations.communityId, communityId)))
    .limit(1)

  const conv = convRows[0]
  const isDirect = conv?.type === 'admin_direct'
  const displayTitle = conv
    ? (isDirect ? 'Admin' : conv.title)
    : 'Chat'

  const room: ChatRoom = {
    id: chatId,
    title: displayTitle,
    description: '',
    avatarInitials: displayTitle.split(/\s+/).map((s: string) => s[0]).join('').toUpperCase().slice(0, 2) || 'CH',
    category: isDirect ? 'Direct' : 'Group',
    unreadCount: 0,
    muted: false,
    pinned: false,
    updatedAt: conv?.createdAt?.toISOString() || new Date().toISOString(),
    inviteCode: `${chatId}-invite`,
    sharedMediaCount: 0,
    lastMessage: { author: '', body: '' },
    participants: [],
    messages: [],
  }

  return (
    <MemberShell member={member}>
      <ChatSettingsView
        room={room}
        locale={locale}
        communityId={communityId}
        labels={{
          back: t('chat.backToChat'),
          title: t('chat.settings'),
          members: t('chat.members', { count: 0 }),
          online: t('chat.online', { count: 0 }),
          mute: t('chat.muteNotifications'),
          muted: t('chat.muted'),
          membersTitle: t('chat.membersTitle'),
          sharedMedia: t('chat.sharedMedia'),
          operator: t('chat.operator'),
          participantStatusById: {},
        }}
      />

      <MobileBottomNav
        locale={locale}
        communityId={communityId}
        active="chat"
        labels={{
          home: t('nav.home'),
          chat: t('nav.chat'),
          vote: t('nav.vote'),
          me: t('nav.me'),
        }}
      />
    </MemberShell>
  )
}
