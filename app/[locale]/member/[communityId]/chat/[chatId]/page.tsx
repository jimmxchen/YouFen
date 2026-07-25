import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth'
import { getMemberProfile } from '@/lib/api/member/queries'
import { db } from '@/db'
import { chatConversations } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { ChatRoomView } from '@/components/member/chat-room-view'
import { MemberShell } from '@/components/member/member-shell'
import { MobileBottomNav } from '@/components/member/mobile-bottom-nav'
import type { ChatRoom } from '@/types/member'

interface MemberChatRoomPageProps {
  params: Promise<{
    locale: string
    communityId: string
    chatId: string
  }>
}

export default async function MemberChatRoomPage({ params }: MemberChatRoomPageProps) {
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
    inviteCode: '',
    sharedMediaCount: 0,
    lastMessage: { author: '', body: '' },
    participants: [],
    messages: [],
  }

  return (
    <MemberShell member={member}>
      <ChatRoomView
        room={room}
        locale={locale}
        communityId={communityId}
        currentUserId={userId}
        currentMemberName={member.name}
        labels={{
          back: t('chat.backToChats'),
          online: t('chat.online', { count: 0 }),
          members: t('chat.members', { count: 0 }),
          pinned: t('chat.operatorPrompt'),
          search: t('chat.search'),
          searchPlaceholder: t('chat.searchPlaceholder'),
          searchEmpty: t('chat.searchEmpty'),
          muted: t('chat.muted'),
          composer: t('chat.composer'),
          send: t('chat.send'),
          reactionsByMessageId: {},
          addImage: t('chat.addImage'),
          addReaction: t('chat.addReaction'),
          settings: t('chat.settings'),
          imageShared: t('chat.imageShared'),
          reactionSuffix: t('chat.reactionSuffix'),
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
          contribute: t('nav.contribute'),
        }}
      />
    </MemberShell>
  )
}
