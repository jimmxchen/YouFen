'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, X, Eye, Zap, Filter } from 'lucide-react'
import { VoicePowerBadge } from '@/components/admin/voice-power-badge'
import { useAdminContributions } from '@/lib/hooks/use-admin-data'
import { useCommunity } from '@/lib/hooks/use-community'
import { type Contribution, ContributionStatus } from '@/types/admin'
import { cn } from '@/lib/utils'

const statusFilters = ['all', 'pending', 'approved', 'rejected'] as const

const statusColors: Record<ContributionStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
}

export default function ContributionsPage() {
  const t = useTranslations('admin')
  const [filter, setFilter] = useState<string | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [localStatuses, setLocalStatuses] = useState<Record<string, ContributionStatus>>({})

  const apiStatus = filter === 'all' ? undefined : filter
  const { communityId } = useCommunity()
  const { contributions, refetch } = useAdminContributions(communityId, apiStatus)

  const getStatus = (c: Contribution): ContributionStatus => localStatuses[c.id] || c.status

  const filtered = contributions

  const selected = filtered.find(c => c.id === selectedId)

  const handleApprove = async (id: string) => {
    try {
      await fetch(`/api/contributions/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedTokenAmount: 0 }),
      })
      setLocalStatuses(prev => ({ ...prev, [id]: 'approved' }))
      setSelectedId(null)
      refetch()
    } catch {
      // silently fail, refetch will show actual state
    }
  }

  const handleReject = async (id: string) => {
    try {
      await fetch(`/api/contributions/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      setLocalStatuses(prev => ({ ...prev, [id]: 'rejected' }))
      setSelectedId(null)
      refetch()
    } catch {
      // silently fail
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[40px] font-medium text-[#131517] leading-[48px]">
          {t('contributions')}
        </h1>
        <p className="text-lg text-[#525252] mt-2">
          {t('contributionsSubtitle')}
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-[#939597]" />
        {statusFilters.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-2xl text-sm font-medium transition-all duration-200',
              filter === s
                ? 'bg-[#131517] text-white'
                : 'bg-white border border-[#F0F0F0] text-[#525252] hover:border-[#E5E5E5] hover:text-[#131517]'
            )}
          >
            {s === 'all' ? t('all') : t(s)}
            {s !== 'all' && (
              <span className="ml-1.5 text-xs opacity-70">
                ({contributions.filter(c => getStatus(c) === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Contributions list */}
      <div className="rounded-2xl border border-[#F0F0F0] bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#F0F0F0]">
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                {t('member')}
              </th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                {t('contribution')}
              </th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                {t('type')}
              </th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                {t('aiSuggestion')}
              </th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                {t('status')}
              </th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                {t('date')}
              </th>
              <th className="text-right text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                {t('actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {filtered.map((c, i) => (
              <tr
                key={c.id}
                className={cn(
                  'cursor-pointer transition-colors',
                  i % 2 === 1 ? 'bg-[#FAFAFA]/50' : '',
                  selectedId === c.id ? 'bg-emerald-50/50' : 'hover:bg-[#FAFAFA]'
                )}
                onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center text-white text-sm font-medium shrink-0">
                      {c.memberName[0]}
                    </div>
                    <span className="text-sm font-medium text-[#131517]">{c.memberName}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-[#525252] max-w-sm">
                  <span className="text-sm text-[#525252]">{c.description}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FAFAFA] border border-[#F0F0F0] text-xs text-[#525252]">
                    {c.type}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <VoicePowerBadge value={c.suggestedVP} size="sm" />
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
                    statusColors[getStatus(c)]
                  )}>
                    {t(getStatus(c))}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-[#525252]">{c.createdAt}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {getStatus(c) === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(c.id)}
                          className="p-1.5 rounded-2xl hover:bg-emerald-50 text-emerald-600 transition-colors"
                          title={t('approve')}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleReject(c.id)}
                          className="p-1.5 rounded-2xl hover:bg-red-50 text-red-500 transition-colors"
                          title={t('reject')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <button className="p-1.5 rounded-2xl hover:bg-[#FAFAFA] text-[#939597] hover:text-[#131517] transition-colors" title={t('viewDetails')}>
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="rounded-2xl border border-[#F0F0F0] bg-white p-6 space-y-4">
          <h3 className="text-base font-semibold text-[#131517]">
            {t('aiAnalysis')}
          </h3>
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-[#FAFAFA] border border-[#F0F0F0]">
            <div className="p-2 rounded-2xl bg-emerald-50 text-emerald-600 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-[#131517]">{selected.aiReason}</p>
              <div className="mt-2">
                <VoicePowerBadge value={selected.suggestedVP} size="sm" />
              </div>
            </div>
          </div>
          {getStatus(selected) === 'pending' && (
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleApprove(selected.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 hover:-translate-y-0.5 transition-all duration-200"
              >
                <Check className="w-4 h-4" />
                {t('approve')}
              </button>
              <button
                onClick={() => handleReject(selected.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-[#F0F0F0] text-[#525252] text-sm font-medium hover:bg-[#FAFAFA] hover:text-[#131517] transition-all"
              >
                <X className="w-4 h-4" />
                {t('reject')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
