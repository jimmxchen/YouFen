import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ChatRoomView } from '@/components/member/chat-room-view'
import { MemberShell } from '@/components/member/member-shell'
import { MobileBottomNav } from '@/components/member/mobile-bottom-nav'
import { getDemoMember } from '@/lib/demo/member-data'

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
  const member = getDemoMember(communityId)
  const room = member.chatRooms.find((chatRoom) => chatRoom.id === chatId)

  if (!room) {
    notFound()
  }

  const onlineCount = room.participants.filter((participant) => participant.status === 'online').length
  const reactionsByMessageId = Object.fromEntries(
    room.messages
      .filter((message) => message.reactions)
      .map((message) => [message.id, t('chat.reactions', { count: message.reactions ?? 0 })])
  )

  return (
    <MemberShell>
      <ChatRoomView
        room={room}
        locale={locale}
        communityId={communityId}
        labels={{
          back: t('chat.backToChats'),
          online: t('chat.online', { count: onlineCount }),
          members: t('chat.members', { count: room.participants.length }),
          pinned: t('chat.operatorPrompt'),
          search: t('chat.search'),
          searchPlaceholder: t('chat.searchPlaceholder'),
          searchEmpty: t('chat.searchEmpty'),
          muted: t('chat.muted'),
          composer: t('chat.composer'),
          send: t('chat.send'),
          reactionsByMessageId,
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
        }}
      />
    </MemberShell>
  )
}
