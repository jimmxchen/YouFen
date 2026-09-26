import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ChatSettingsView } from '@/components/member/chat-settings-view'
import { MemberShell } from '@/components/member/member-shell'
import { MobileBottomNav } from '@/components/member/mobile-bottom-nav'
import { getDemoMember } from '@/lib/demo/member-data'

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
  const member = getDemoMember(communityId)
  const room = member.chatRooms.find((chatRoom) => chatRoom.id === chatId)

  if (!room) {
    notFound()
  }

  const onlineCount = room.participants.filter((participant) => participant.status === 'online').length
  const participantStatusById = Object.fromEntries(
    room.participants.map((participant) => [
      participant.id,
      participant.status === 'online'
        ? t('chat.onlineStatus')
        : t('chat.lastSeen', { time: participant.lastSeen ?? '' }),
    ])
  )

  return (
    <MemberShell member={member}>
      <ChatSettingsView
        room={room}
        locale={locale}
        communityId={communityId}
        labels={{
          back: t('chat.backToChat'),
          title: t('chat.settings'),
          members: t('chat.members', { count: room.participants.length }),
          online: t('chat.online', { count: onlineCount }),
          mute: t('chat.muteNotifications'),
          muted: t('chat.muted'),
          membersTitle: t('chat.membersTitle'),
          sharedMedia: t('chat.sharedMedia'),
          operator: t('chat.operator'),
          participantStatusById,
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
