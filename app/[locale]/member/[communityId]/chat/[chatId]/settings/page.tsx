import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth'
import { getMemberProfile } from '@/lib/api/member/queries'
import { db } from '@/db'
import { chatConversations, chatParticipants } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { getPrisma } from '@/lib/db/client'
import { ChatSettingsView } from '@/components/member/chat-settings-view'
import { MemberShell } from '@/components/member/member-shell'
import { MobileBottomNav } from '@/components/member/mobile-bottom-nav'
import type { ChatRoom, ChatParticipant } from '@/types/member'

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

  // Fetch real participants
  const participantRows = await db
    .select()
    .from(chatParticipants)
    .where(eq(chatParticipants.conversationId, chatId))

  const participantMemberIds = participantRows.map(r => r.memberId)
  let participantMap = new Map<string, { name: string; role: string }>()

  if (participantMemberIds.length > 0) {
    const prisma = getPrisma()
    const members = await prisma.member.findMany({
      where: { id: { in: participantMemberIds } },
      select: { id: true, displayName: true, role: true },
    })
    for (const m of members) participantMap.set(m.id, { name: m.displayName, role: m.role })
  }

  const participants: ChatParticipant[] = participantRows.map(r => {
    const m = participantMap.get(r.memberId)
    const name = m?.name || r.memberId
    return {
      id: r.memberId,
      name,
      role: m?.role || 'member',
      avatarInitials: name.split(/\s+/).map((s: string) => s[0]).join('').toUpperCase().slice(0, 2) || '?',
      status: 'offline' as const,
    }
  })

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
    participants,
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
          members: t('chat.members', { count: participants.length }),
          online: t('chat.online', { count: 0 }),
          mute: t('chat.muteNotifications'),
          muted: t('chat.muted'),
          membersTitle: t('chat.membersTitle'),
          sharedMedia: t('chat.sharedMedia'),
          operator: t('chat.operator'),
          participantStatusById: {},
          addMembers: t('chat.addMembers'),
          addMembersHint: t('chat.addMembersHint'),
          selectMembers: t('chat.selectMembers'),
          searchPlaceholder: t('chat.composeSearchPlaceholder'),
          cancel: t('chat.cancel'),
          added: t('chat.added') || 'Added',
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
