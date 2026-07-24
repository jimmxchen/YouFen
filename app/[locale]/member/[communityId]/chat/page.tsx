import { MessageCircle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import type { ChatParticipant } from '@/types/member'
import { ChatRoomBrowser } from '@/components/member/chat-room-browser'
import { MemberShell } from '@/components/member/member-shell'
import { MobileBottomNav } from '@/components/member/mobile-bottom-nav'
import { memberMuted } from '@/components/member/ui'
import { getDemoMember } from '@/lib/demo/member-data'

interface MemberChatPageProps {
  params: Promise<{
    locale: string
    communityId: string
  }>
}

export default async function MemberChatPage({ params }: MemberChatPageProps) {
  const { locale, communityId } = await params
  const t = await getTranslations('member')
  const member = getDemoMember(communityId)
  const baseHref = `/${locale}/member/${communityId}`

  // Identify "you" from the demo data, then build a de-duplicated contact pool
  // of everyone else who could be messaged directly.
  const selfMessage = member.chatRooms
    .flatMap((room) => room.messages)
    .find((message) => message.isCurrentMember)
  const currentMember: ChatParticipant = {
    id: 'you',
    name: selfMessage?.author ?? member.name,
    role: selfMessage?.role ?? member.role,
    avatarInitials: selfMessage?.avatarInitials ?? member.avatarInitials,
    status: 'online',
  }
  const contactMap = new Map<string, ChatParticipant>()
  for (const room of member.chatRooms) {
    for (const participant of room.participants) {
      if (participant.name === currentMember.name) continue
      if (!contactMap.has(participant.id)) contactMap.set(participant.id, participant)
    }
  }
  const contacts = [...contactMap.values()]

  return (
    <MemberShell member={member}>
      <header className="px-5 pb-4 pt-6 lg:px-0 lg:pb-8 lg:pt-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-normal text-[#131517] lg:text-[40px] lg:font-medium lg:leading-[48px]">
              {t('chat.title')}
            </h1>
            <p className={`mt-3 max-w-2xl text-sm leading-6 ${memberMuted} lg:text-base`}>
              {t('chat.description')}
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#131517] text-white">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      </header>

      <div className="space-y-4 px-5 pb-28 lg:px-0">
        <ChatRoomBrowser
          rooms={member.chatRooms}
          baseHref={baseHref}
          locale={locale}
          communityId={communityId}
          contacts={contacts}
          currentMember={currentMember}
          directMessageCategory={t('chat.directMessage')}
          labels={{
            searchChats: t('chat.searchChats'),
            pinned: t('chat.pinned'),
            muted: t('chat.muted'),
            empty: t('chat.noChatsFound'),
            members: t('chat.members', { count: '__COUNT__' }),
            newMessage: t('chat.newMessage'),
            compose: {
              title: t('chat.composeTitle'),
              to: t('chat.composeTo'),
              searchPlaceholder: t('chat.composeSearchPlaceholder'),
              messagePlaceholder: t('chat.composeMessagePlaceholder'),
              start: t('chat.composeStart'),
              empty: t('chat.composeEmpty'),
              selectHint: t('chat.composeSelectHint'),
              noSelection: t('chat.composeNoSelection'),
              cancel: t('chat.cancel'),
              close: t('chat.composeClose'),
            },
          }}
        />
      </div>

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
