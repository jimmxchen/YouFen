import { getTranslations } from 'next-intl/server'
import { ChatRoomLoader } from '@/components/member/chat-room-loader'
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
  const baseHref = `/${locale}/member/${communityId}`
  const room = member.chatRooms.find((chatRoom) => chatRoom.id === chatId) ?? null

  return (
    <MemberShell member={member}>
      <ChatRoomLoader
        serverRoom={room}
        locale={locale}
        communityId={communityId}
        chatId={chatId}
        baseHref={baseHref}
        onlineTemplate={t('chat.online', { count: '__COUNT__' })}
        membersTemplate={t('chat.members', { count: '__COUNT__' })}
        labels={{
          back: t('chat.backToChats'),
          pinned: t('chat.operatorPrompt'),
          search: t('chat.search'),
          searchPlaceholder: t('chat.searchPlaceholder'),
          searchEmpty: t('chat.searchEmpty'),
          muted: t('chat.muted'),
          composer: t('chat.composer'),
          send: t('chat.send'),
          addImage: t('chat.addImage'),
          settings: t('chat.settings'),
          imageShared: t('chat.imageShared'),
        }}
        notFound={{
          title: t('chat.chatNotFound'),
          back: t('chat.backToChats'),
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
