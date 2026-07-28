'use client'

import { Timer, Vote } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { activeProposals, type ActiveProposal } from './demo-data'

/**
 * 治理进行时。大事记只展示「已结束」的投票；这里展示「正在投」的提案——
 * 实时赞同率、参与/法定人数、截止倒计时——让治理页面动起来。demo 数据；
 * 真实环境由 proposal 快照 + VoteCast 事件投影提供。
 */
function CountdownChip({ hours }: { hours: number }) {
  const t = useTranslations('records.proposals')
  const label = hours >= 24 ? t('endsInDays', { days: Math.round(hours / 24) }) : t('endsInHours', { hours })
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
      <Timer className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}

function ProposalRow({ p }: { p: ActiveProposal }) {
  const t = useTranslations('records.proposals')
  const quorumMet = p.voters >= p.quorum
  return (
    <div className="px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-medium text-neutral-900">{t(`items.${p.key}`)}</h3>
        <CountdownChip hours={p.endsInHours} />
      </div>
      {/* 实时赞同率 */}
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-neutral-400">{t('approval')}</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
          <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${p.approvalPct}%` }} />
        </span>
        <span className="w-10 text-right text-xs font-semibold tabular-nums text-emerald-600">{p.approvalPct}%</span>
      </div>
      {/* 参与 / 法定 */}
      <p className="mt-2 text-[13px] tabular-nums text-neutral-500">
        {t('turnout', { voters: p.voters, total: p.totalMembers })}
        <span className="mx-1.5 text-neutral-300">·</span>
        {quorumMet ? (
          <span className="text-emerald-600">{t('quorumMet', { quorum: p.quorum })}</span>
        ) : (
          <span className="text-amber-600">{t('quorumShort', { need: p.quorum - p.voters })}</span>
        )}
      </p>
    </div>
  )
}

export function LiveProposals() {
  const t = useTranslations('records.proposals')
  if (activeProposals.length === 0) return null

  return (
    <section aria-label={t('title')}>
      <div className="flex items-start gap-3.5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-50 border border-neutral-100">
          <Vote className="h-[18px] w-[18px] text-blue-500" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">{t('title')}</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-500">{t('intro')}</p>
        </div>
      </div>

      <div className="mt-6 divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200/80 bg-white">
        {activeProposals.map((p) => (
          <ProposalRow key={p.id} p={p} />
        ))}
      </div>
    </section>
  )
}
