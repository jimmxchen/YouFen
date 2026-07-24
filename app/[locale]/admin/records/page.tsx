'use client'

import { useTranslations } from 'next-intl'
import { ExternalLink, ShieldCheck, Copy, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { demoRecords } from '@/lib/demo-data'
import { type PublicRecord, RecordType, RecordStatus } from '@/types/admin'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const recordTypeLabels: Record<RecordType, string> = {
  community: 'recordTypeCommunity',
  rule: 'recordTypeRule',
  vp_batch: 'recordTypeVpBatch',
  proposal: 'recordTypeProposal',
  vote_result: 'recordTypeVoteResult',
}

const recordTypeIcons: Record<RecordType, typeof ShieldCheck> = {
  community: ShieldCheck,
  rule: ShieldCheck,
  vp_batch: ShieldCheck,
  proposal: ShieldCheck,
  vote_result: ShieldCheck,
}

const statusConfig: Record<RecordStatus, { labelKey: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  pending: { labelKey: 'recordStatusPending', icon: Clock, color: 'text-amber-700', bg: 'bg-amber-50' },
  recording: { labelKey: 'recordStatusRecording', icon: Clock, color: 'text-blue-700', bg: 'bg-blue-50' },
  recorded: { labelKey: 'recordStatusRecorded', icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50' },
  failed: { labelKey: 'recordStatusFailed', icon: XCircle, color: 'text-red-700', bg: 'bg-red-50' },
}

const typeFilters = ['all', 'vote_result', 'proposal', 'rule', 'vp_batch', 'community'] as const

export default function RecordsPage() {
  const t = useTranslations('admin')
  const [filter, setFilter] = useState<string | 'all'>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const filtered = filter === 'all'
    ? demoRecords
    : demoRecords.filter(r => r.type === filter)

  const copyToClipboard = (hash: string, id: string) => {
    navigator.clipboard.writeText(hash)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[40px] font-medium text-[#131517] leading-[48px]">
          {t('trustedRecords')}
        </h1>
        <p className="text-lg text-[#525252] mt-2">
          {t('trustedRecordsSubtitle')}
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {typeFilters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200',
              filter === f
                ? 'bg-[#0A0A0A] text-white'
            {f === 'all' ? t('all') : t(recordTypeLabels[f])}
        ))}
      </div>

      {/* Records list */}
      <div className="space-y-4">
        {filtered.map((record) => {
          const statusCfg = statusConfig[record.status]
          const StatusIcon = statusCfg.icon

          return (
            <div
              key={record.id}
              className="rounded-xl border border-[#F0F0F0] bg-white p-6 hover:shadow-md hover:border-[#E5E5E5] transition-all duration-200"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-3">
                  {/* Top row: type + status */}
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-50 text-blue-700 text-xs font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {t(recordTypeLabels[record.type])}
                    </span>
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium',
                      statusCfg.bg, statusCfg.color
                    )}>
                      <StatusIcon className="w-3 h-3" />
                      {t(statusCfg.labelKey)}
                    </span>
                  </div>

                  {/* Data preview */}
                  <div className="p-4 rounded-xl bg-[#FAFAFA] border border-[#F0F0F0] space-y-2">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-xs text-[#939597] block mb-0.5">{t('recordFieldCommunity')}</span>
                        <span className="text-[#131517] font-medium">
                          {(record.data as any)?.name || (record.data as any)?.proposalTitle || 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-[#939597] block mb-0.5">{t('recordFieldNetwork')}</span>
                        <span className="text-[#131517] font-medium capitalize">{record.network}</span>
                      </div>
                      <div>
                        <span className="text-xs text-[#939597] block mb-0.5">{t('recordFieldCreated')}</span>
                        <span className="text-[#131517]">{record.createdAt}</span>
                      </div>
                      {record.recordedAt && (
                        <div>
                          <span className="text-xs text-[#939597] block mb-0.5">{t('recordFieldRecordedOnChain')}</span>
                          <span className="text-[#131517]">{record.recordedAt}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hashes */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#939597] shrink-0 w-16">{t('dataHash')}</span>
                      <code className="flex-1 px-3 py-1.5 rounded-md bg-[#FAFAFA] border border-[#F0F0F0] text-xs text-[#525252] font-mono truncate">
                        {record.hash}
                      </code>
                      <button
                        onClick={() => copyToClipboard(record.hash, record.id)}
                        className="p-1.5 rounded-md hover:bg-[#FAFAFA] text-[#939597] hover:text-[#131517] transition-colors shrink-0"
                      >
                        {copiedId === record.id ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {record.txHash && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#939597] shrink-0 w-16">{t('txHash')}</span>
                        <code className="flex-1 px-3 py-1.5 rounded-md bg-[#FAFAFA] border border-[#F0F0F0] text-xs text-[#525252] font-mono truncate">
                          {record.txHash}
                        </code>
                        <a
                          href={`https://explorer.injective.network/tx/${record.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md hover:bg-blue-50 text-blue-500 transition-colors shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
