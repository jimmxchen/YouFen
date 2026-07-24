'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { ExternalLink, ShieldCheck, Copy, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { useAdminRecords } from '@/lib/hooks/use-admin-data'
import { useCommunity } from '@/lib/hooks/use-community'
import type { AdminRecord } from '@/lib/api/admin'
import { cn } from '@/lib/utils'

const STATUS_KEYS: Record<string, string> = {
  pending: 'recordStatusPending',
  submitting: 'recordStatusRecording',
  confirming: 'recordStatusRecording',
  verified: 'recordStatusRecorded',
  recorded: 'recordStatusRecorded',
  failed: 'recordStatusFailed',
  superseded: 'recordStatusFailed',
}

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  verified: CheckCircle2,
  recorded: CheckCircle2,
  pending: Clock,
  submitting: Clock,
  confirming: Clock,
  failed: XCircle,
  superseded: Clock,
}

const STATUS_COLORS: Record<string, string> = {
  verified: 'text-emerald-700 bg-emerald-50',
  recorded: 'text-emerald-700 bg-emerald-50',
  pending: 'text-amber-700 bg-amber-50',
  submitting: 'text-blue-700 bg-blue-50',
  confirming: 'text-blue-700 bg-blue-50',
  failed: 'text-red-700 bg-red-50',
  superseded: 'text-amber-700 bg-amber-50',
}

const TYPE_KEYS: Record<string, string> = {
  token_mint: 'recordTypeVpBatch',
  advance_mint: 'recordTypeVpBatch',
  token_reversal: 'recordTypeVpBatch',
  epoch_summary: 'recordTypeCommunity',
  policy_version: 'recordTypeRule',
  proposal_snapshot: 'recordTypePoll',
  proposal_result: 'recordTypeVoteResult',
  epoch_budget_created: 'recordTypeCommunity',
  budget_advance: 'recordTypeVpBatch',
  advance_debt_repayment: 'recordTypeVpBatch',
  inflation_rate_change: 'recordTypeRule',
  proposal_created: 'recordTypePoll',
}

const TYPE_TINTS: Record<string, string> = {
  token_mint: 'bg-emerald-50 text-emerald-700',
  advance_mint: 'bg-emerald-50 text-emerald-700',
  token_reversal: 'bg-amber-50 text-amber-700',
  epoch_summary: 'bg-neutral-100 text-neutral-600',
  policy_version: 'bg-blue-50 text-blue-700',
  proposal_snapshot: 'bg-purple-50 text-purple-700',
  proposal_result: 'bg-blue-50 text-blue-700',
  epoch_budget_created: 'bg-neutral-100 text-neutral-600',
  budget_advance: 'bg-emerald-50 text-emerald-700',
  advance_debt_repayment: 'bg-amber-50 text-amber-700',
  inflation_rate_change: 'bg-blue-50 text-blue-700',
  proposal_created: 'bg-purple-50 text-purple-700',
}

const typeFilters = ['all', 'token', 'votes', 'rules', 'epoch'] as const

function recordCategory(r: AdminRecord): string {
  const t = r.recordType
  if (t === 'token_mint' || t === 'advance_mint' || t === 'token_reversal' || t === 'budget_advance' || t === 'advance_debt_repayment') return 'token'
  if (t === 'proposal_result' || t === 'proposal_snapshot' || t === 'proposal_created') return 'votes'
  if (t === 'policy_version' || t === 'inflation_rate_change') return 'rules'
  return 'epoch'
}

export default function AdminRecordsPage() {
  const t = useTranslations('admin')
  const locale = useLocale()
  const { communityId } = useCommunity()
  const { records, loading } = useAdminRecords(communityId)
  const [filter, setFilter] = useState<string | 'all'>('all')
  const [copiedHash, setCopiedHash] = useState<string | null>(null)

  const filtered = filter === 'all'
    ? records
    : records.filter(r => recordCategory(r) === filter)

  const copyToClipboard = (hash: string) => {
    navigator.clipboard.writeText(hash)
    setCopiedHash(hash)
    setTimeout(() => setCopiedHash(null), 2000)
  }

  const formatDate = (dateStr: string) => {
    return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(dateStr))
  }

  const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-8)}`

  return (
    <div className="space-y-6">
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
              'px-3 py-1.5 rounded-2xl text-sm font-medium transition-all duration-200',
              filter === f
                ? 'bg-[#131517] text-white'
                : 'bg-white border border-[#F0F0F0] text-[#525252] hover:border-[#E5E5E5] hover:text-[#131517]'
            )}
          >
            {f === 'all' ? t('all') : t(`recordType${f.charAt(0).toUpperCase() + f.slice(1)}` as any)}
          </button>
        ))}
      </div>

      {/* Records list */}
      {loading ? (
        <div className="text-center py-20 text-[#939597]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-[#939597]">
          <ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm">No trusted records yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((record) => {
            const statusKey = STATUS_KEYS[record.recordType] || 'recordStatusPending'
            const StatusIcon = STATUS_ICONS[record.status] || Clock
            const typeKey = TYPE_KEYS[record.recordType] || record.recordType
            const tint = TYPE_TINTS[record.recordType] || 'bg-neutral-100 text-neutral-600'

            return (
              <div
                key={record.id}
                className="rounded-2xl border border-[#F0F0F0] bg-white p-5 hover:border-[#E5E5E5] transition-all duration-200"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-2xl text-xs font-medium', tint)}>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {t(typeKey)}
                  </span>
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium',
                    STATUS_COLORS[record.status] || 'bg-gray-100 text-gray-700'
                  )}>
                    <StatusIcon className="w-3 h-3" />
                    {t(statusKey)}
                  </span>
                  <span className="text-xs text-[#939597] ml-auto">
                    {formatDate(record.createdAt)}
                  </span>
                </div>

                {/* Record hash */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-[#939597]">{t('dataHash')}:</span>
                  <code className="text-xs font-mono text-[#525252]">{shortHash(record.recordHash)}</code>
                  <button
                    onClick={() => copyToClipboard(record.recordHash)}
                    className="p-1 rounded hover:bg-[#FAFAFA] text-[#939597] hover:text-[#131517] transition-colors"
                  >
                    {copiedHash === record.recordHash ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Transaction details */}
                <div className="flex items-center gap-4 text-xs text-[#939597]">
                  {record.txHash && (
                    <>
                      <span>{t('txHash')}: <code className="font-mono">{shortHash(record.txHash)}</code></span>
                      <a
                        href={`https://testnet-injective.cloud.blockscout.com/tx/${record.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-600"
                      >
                        {t('viewOnChain')}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </>
                  )}
                  {record.blockNumber && (
                    <span>{t('recordFieldNetwork')}: Block #{record.blockNumber}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
