import { MessageCircle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ChatRoomBrowser } from '@/components/member/chat-room-browser'
import { MemberShell } from '@/components/member/member-shell'
import { MobileBottomNav } from '@/components/member/mobile-bottom-nav'
import { memberMuted, memberSubtle } from '@/components/member/ui'
import { getDemoMember } from '@/lib/demo/member-data'

interface MemberChatPageProps {
  params: {
    locale: string
    communityId: string
  }
}

export default async function MemberChatPage({ params }: MemberChatPageProps) {
  const t = await getTranslations('member')
  const member = getDemoMember(params.communityId)
  const baseHref = `/${params.locale}/member/${params.communityId}`
  const unreadCount = member.chatRooms.reduce((total, room) => total + room.unreadCount, 0)

  return (
    <MemberShell>
      <header className="px-5 pb-4 pt-6 lg:px-0 lg:pb-8 lg:pt-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={`truncate text-sm ${memberSubtle}`}>{member.communityName}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[#131517] lg:text-[40px] lg:font-medium lg:leading-[48px]">
              {t('chat.title')}
            </h1>
            <p className={`mt-3 max-w-2xl text-sm leading-6 ${memberMuted} lg:text-base`}>
              {t('chat.description')}
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#131517] text-white">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      </header>

      <div className="space-y-4 px-5 pb-28 lg:px-0">
        <ChatRoomBrowser
          rooms={member.chatRooms}
          baseHref={baseHref}
          labels={{
            searchChats: t('chat.searchChats'),
            groupChats: t('chat.groupChats'),
            unread: t('chat.unread', { count: unreadCount }),
            pinned: t('chat.pinned'),
            muted: t('chat.muted'),
            empty: t('chat.noChatsFound'),
            members: t('chat.members', { count: '__COUNT__' }),
          }}
        />
      </div>

      <MobileBottomNav
        locale={params.locale}
        communityId={params.communityId}
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
