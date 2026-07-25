import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth'
import { db } from '@/db'
import { chatConversations, chatParticipants } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { getPrisma } from '@/lib/db/client'
import { ChatSettingsView } from '@/components/member/chat-settings-view'
import type { ChatRoom, ChatParticipant } from '@/types/member'

interface AdminChatSettingsPageProps {
  params: Promise<{
    locale: string
    chatId: string
  }>
}

export default async function AdminChatSettingsPage({ params }: AdminChatSettingsPageProps) {
  const { locale, chatId } = await params
  const t = await getTranslations('member')
  const userId = await getSession()
  if (!userId) redirect('/sign-in')

  const cookieStore = await cookies()
  const communityId = cookieStore.get('youfen_active_community')?.value
  if (!communityId) redirect('/choose-role')

  // Verify user is an admin/owner of this community
  const prisma = getPrisma()
  const adminMembership = await prisma.member.findFirst({
    where: { userId, communityId, role: { in: ['owner', 'admin'] } },
  })
  if (!adminMembership) redirect(`/${locale}/admin`)

  // Fetch conversation metadata
  const convRows = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, chatId), eq(chatConversations.communityId, communityId)))
    .limit(1)

  const conv = convRows[0]
  if (!conv) redirect(`/${locale}/admin/chat`)

  const isDirect = conv?.type === 'admin_direct'
  const displayTitle = isDirect ? 'Admin' : (conv?.title || 'Chat')

  // Fetch participants
  const participantRows = await db
    .select()
    .from(chatParticipants)
    .where(eq(chatParticipants.conversationId, chatId))

  const participantMemberIds = participantRows.map(r => r.memberId)
  let participantMap = new Map<string, { name: string; role: string }>()

  if (participantMemberIds.length > 0) {
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
    <ChatSettingsView
      room={room}
      locale={locale}
      communityId={communityId}
      backHref={`/${locale}/admin/chat`}
      labels={{
        back: t('chat.backToChats'),
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
  )
}
