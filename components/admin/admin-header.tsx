'use client'
import { useTranslations } from 'next-intl'
import { Bell, Search } from 'lucide-react'
import { VoicePowerBadge } from '@/components/admin/voice-power-badge'
import { type Member } from '@/types/admin'

interface AdminHeaderProps {
  communityName: string
  currentUser: Member
  title?: string
}

export function AdminHeader({ communityName, currentUser, title }: AdminHeaderProps) {
  const t = useTranslations('admin')

  return (
    <header className="h-16 bg-white border-b border-[#F0F0F0] flex items-center justify-between px-8 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {title && (
          <>
            <span className="text-sm text-[#939597]">{communityName}</span>
            <span className="text-sm text-[#D4D4D4]">/</span>
            <h1 className="text-base font-medium text-[#131517]">{title}</h1>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#F0F0F0] bg-[#FAFAFA] text-[#939597]">
          <Search className="w-4 h-4" />
          <span className="text-sm">{t('search')}</span>
        </div>
        <button className="relative p-2 rounded-lg hover:bg-[#FAFAFA] transition-colors">
          <Bell className="w-5 h-5 text-[#525252]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <div className="flex items-center gap-3 pl-4 border-l border-[#F0F0F0]">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center text-white text-sm font-medium">
            {currentUser.name[0]}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-[#131517]">{currentUser.name}</p>
            <VoicePowerBadge value={currentUser.voicePower} size="sm" />
          </div>
        </div>
      </div>
    </header>
  )
}
