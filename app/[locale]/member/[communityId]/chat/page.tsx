import { ImagePlus, Pin, SendHorizonal, Smile } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
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
  const pinnedMessage = member.chatMessages.find((message) => message.isOperator)

  return (
    <MemberShell>
      <header className="sticky top-0 z-20 border-b border-black/[0.08] bg-white/90 px-5 py-4 backdrop-blur-[20px] lg:static lg:mx-auto lg:mt-8 lg:w-full lg:max-w-3xl lg:rounded-2xl lg:border lg:border-black/[0.08] lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#131517] text-sm font-semibold text-white">
            {member.communityName.slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-[#131517]">{member.communityName}</h1>
            <p className={`mt-0.5 text-xs ${memberSubtle}`}>
              {t('chat.online', { count: 12 })}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-28 pt-4 lg:px-0 lg:pt-5">
        {pinnedMessage ? (
          <section className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-700">
              <Pin className="h-3.5 w-3.5" aria-hidden="true" />
              {t('chat.operatorPrompt')}
            </div>
            <p className="text-sm leading-6 text-emerald-950">{pinnedMessage.body}</p>
          </section>
        ) : null}

        <div className="space-y-4">
          {member.chatMessages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-2 ${message.isCurrentMember ? 'justify-end' : 'justify-start'}`}
            >
              {!message.isCurrentMember ? (
                <div className="mt-5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-semibold text-[#131517]">
                  {message.avatarInitials}
                </div>
              ) : null}

              <div className={`max-w-[78%] lg:max-w-[70%] ${message.isCurrentMember ? 'items-end' : 'items-start'}`}>
                {!message.isCurrentMember ? (
                  <div className="mb-1 flex items-center gap-2 px-1">
                    <span className="text-xs font-medium text-[#131517]">{message.author}</span>
                    <span className={`text-xs ${memberSubtle}`}>{message.role}</span>
                  </div>
                ) : null}

                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                    message.isCurrentMember
                      ? 'rounded-br-md bg-[#131517] text-white'
                      : message.isOperator
                        ? 'rounded-bl-md bg-emerald-50 text-emerald-950'
                        : 'rounded-bl-md bg-white text-[#131517]'
                  }`}
                >
                  {message.body}
                </div>

                <div
                  className={`mt-1 flex items-center gap-2 px-1 text-xs ${memberSubtle} ${
                    message.isCurrentMember ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <span>{message.createdAt}</span>
                  {message.reactions ? (
                    <span>{t('chat.reactions', { count: message.reactions })}</span>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-[64px] left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-black/[0.08] bg-white/90 px-3 py-3 backdrop-blur-[20px] lg:bottom-6 lg:w-[calc(100%-48px)] lg:max-w-3xl lg:rounded-2xl lg:border lg:px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 text-[#525252]"
            aria-label="Add image"
          >
            <ImagePlus className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex min-h-11 flex-1 items-center rounded-full border border-gray-200 bg-[#FAFAFA] px-4 text-sm text-[#939597]">
            {t('chat.composer')}
          </div>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 text-[#525252]"
            aria-label="Add reaction"
          >
            <Smile className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#131517] text-white"
            aria-label={t('chat.send')}
          >
            <SendHorizonal className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
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
