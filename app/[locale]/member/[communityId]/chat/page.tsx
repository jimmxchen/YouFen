import { MessageCircle, Search } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ChatRoomList } from '@/components/member/chat-room-list'
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
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#131517] text-white">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      </header>

      <div className="space-y-4 px-5 pb-28 lg:px-0">
        <section className="rounded-xl border border-[#F0F0F0] bg-white p-4">
          <label htmlFor="chat-list-search" className="sr-only">
            {t('chat.searchChats')}
          </label>
          <div className="flex min-h-11 items-center gap-2 rounded-lg border border-[#F0F0F0] bg-[#FAFAFA] px-4">
            <Search className="h-4 w-4 shrink-0 text-[#939597]" aria-hidden="true" />
            <input
              id="chat-list-search"
              placeholder={t('chat.searchChats')}
              className="min-w-0 flex-1 bg-transparent text-sm text-[#131517] outline-none placeholder:text-[#939597]"
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className={memberMuted}>{t('chat.groupChats')}</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              {t('chat.unread', { count: unreadCount })}
            </span>
          </div>
        </section>

        <ChatRoomList
          rooms={member.chatRooms}
          baseHref={baseHref}
          labels={{
            pinned: t('chat.pinned'),
            muted: t('chat.muted'),
            members: (count) => t('chat.members', { count }),
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
