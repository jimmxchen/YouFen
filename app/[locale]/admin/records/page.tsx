'use client'

import { useTranslations, useLocale } from 'next-intl'
import { ExternalLink, ShieldCheck, Copy, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { demoRecords, KIND_TINT, type ChainRecord } from '@/components/records/demo-data'
import { ProvenanceJourney } from '@/components/records/provenance-journey'
import { ChainStatusStrip } from '@/components/records/chain-status'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const statusConfig: Record<ChainRecord['status'], { labelKey: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  verified: { labelKey: 'status.verified', icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50' },
  pending: { labelKey: 'status.pending', icon: Clock, color: 'text-amber-700', bg: 'bg-amber-50' },
  submitting: { labelKey: 'status.submitting', icon: Clock, color: 'text-blue-700', bg: 'bg-blue-50' },
  confirming: { labelKey: 'status.confirming', icon: Clock, color: 'text-blue-700', bg: 'bg-blue-50' },
  failed: { labelKey: 'status.failed', icon: XCircle, color: 'text-red-700', bg: 'bg-red-50' },
  superseded: { labelKey: 'status.superseded', icon: Clock, color: 'text-amber-700', bg: 'bg-amber-50' },
}

const typeFilters = ['all', 'token', 'votes', 'rules', 'epoch'] as const

export default function AdminRecordsPage() {
  const t = useTranslations('records')
  const locale = useLocale()
  const [filter, setFilter] = useState<string | 'all'>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const filtered = filter === 'all'
    ? demoRecords
    : demoRecords.filter(r => {
        const kind = r.kind
        if (filter === 'token') return kind === 'tokenMint' || kind === 'advanceMint' || kind === 'tokenReversal'
        if (filter === 'votes') return kind === 'proposalResult'
        if (filter === 'rules') return kind === 'policyVersion'
        if (filter === 'epoch') return kind === 'epochSummary'
        return true
      })

  const copyToClipboard = (hash: string, id: string) => {
    navigator.clipboard.writeText(hash)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const formatDate = (dateStr: string) => {
    return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(dateStr))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[40px] font-medium text-[#131517] leading-[48px]">
          {t('title')}
        </h1>
        <p className="text-lg text-[#525252] mt-2">
          {t('subtitle')}
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {typeFilters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-2xl text-sm font-medium transition-all duration-200',
              filter === f
                ? 'bg-[#131517] text-white'
                : 'bg-white border border-[#F0F0F0] text-[#525252] hover:border-[#E5E5E5] hover:text-[#131517]'
            )}
          >
            {t(`filter.${f}`)}
          </button>
        ))}
      </div>

      {/* Records list */}
      <div className="space-y-3">
        {filtered.map((record) => {
          const statusCfg = statusConfig[record.status]
          const StatusIcon = statusCfg.icon
          const isOpen = openId === record.id

          return (
            <div
              key={record.id}
              className="rounded-2xl border border-[#F0F0F0] bg-white overflow-hidden hover:border-[#E5E5E5] transition-all duration-200"
            >
              {/* Clickable header row */}
              <button
                onClick={() => setOpenId(isOpen ? null : record.id)}
                className="w-full text-left p-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-2xl text-xs font-medium ${KIND_TINT[record.kind]}`}>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {t(`kind.${record.kind}`)}
                  </span>
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium',
                    statusCfg.bg, statusCfg.color
                  )}>
                    <StatusIcon className="w-3 h-3" />
                    {t(statusCfg.labelKey)}
                  </span>
                  <span className="text-xs text-[#939597] ml-auto">
                    {formatDate(record.date)}
                  </span>
                </div>

                <h3 className="text-[15px] font-medium text-[#131517] leading-snug">
                  {t(`demo.${record.id}.title`)}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-[#525252]">
                  {t(`demo.${record.id}.summary`)}
                </p>

                {/* Vote stats inline */}
                {record.vote && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-xs text-[#939597]">{t('vote.approval')}</span>
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-100">
                        <span
                          className="block h-full rounded-full bg-emerald-500"
                          style={{ width: `${record.vote.approvalPct}%` }}
                        />
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-emerald-600">
                        {record.vote.approvalPct}%
                      </span>
                    </span>
                    <span className="text-xs tabular-nums text-[#939597]">
                      {t('vote.turnout', {
                        voters: record.vote.voters,
                        total: record.vote.totalMembers,
                        pct: Math.round((record.vote.voters / record.vote.totalMembers) * 100),
                      })}
                    </span>
                  </div>
                )}
              </button>

              {/* Expandable provenance journey */}
              {isOpen && (
                <div className="border-t border-[#F0F0F0] px-5 pb-5">
                  <ProvenanceJourney record={record} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Chain status */}
      <ChainStatusStrip />
    </div>
  )
}
