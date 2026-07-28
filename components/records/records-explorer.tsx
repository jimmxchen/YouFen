'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  Clock,
  BadgeCheck,
  CircleAlert,
  History,
  Search,
  X,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import {
  demoRecords,
  KIND_CATEGORY,
  type ChainRecord,
  type RecordCategory,
  type RecordKind,
  type RecordStatus,
} from './demo-data'
import { ProvenanceJourney } from './provenance-journey'
import { ChainStatusStrip } from './chain-status'
import { OwnershipBreakdown } from './ownership-breakdown'
import { LiveProposals } from './live-proposals'
import { VerifyCenter } from './verify-center'

const KIND_TINT: Record<RecordKind, string> = {
  tokenMint: 'bg-emerald-50 text-emerald-700',
  advanceMint: 'bg-emerald-50 text-emerald-700',
  tokenReversal: 'bg-amber-50 text-amber-700',
  epochSummary: 'bg-neutral-100 text-neutral-600',
  policyVersion: 'bg-blue-50 text-blue-700',
  proposalResult: 'bg-blue-50 text-blue-700',
}

function StatusBadge({ status }: { status: RecordStatus }) {
  const t = useTranslations('records.status')
  if (status === 'verified')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
        <BadgeCheck className="w-3.5 h-3.5" />
        {t('verified')}
      </span>
    )
  if (status === 'failed')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        <CircleAlert className="w-3.5 h-3.5" />
        {t('failed')}
      </span>
    )
  if (status === 'superseded')
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        <History className="w-3.5 h-3.5" />
        {t('superseded')}
      </span>
    )
  return (
    /* 进行中状态用静态时钟图标，不做常驻旋转动画 */
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
      <Clock className="w-3.5 h-3.5" />
      {t(status)}
    </span>
  )
}

function RecordRow({ record }: { record: ChainRecord }) {
  const t = useTranslations('records')
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const dateLabel = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${record.date}T00:00:00`))

  return (
    <li className="relative pl-9 sm:pl-12">
      {/* 时间线圆点 */}
      <span
        aria-hidden
        className={`absolute left-[9px] sm:left-[13px] top-[26px] w-2.5 h-2.5 rounded-full border-2 border-white ring-1 ${
          record.status === 'verified'
            ? 'bg-emerald-500 ring-emerald-200'
            : record.status === 'superseded' || record.status === 'failed'
              ? 'bg-amber-400 ring-amber-200'
              : 'bg-blue-400 ring-blue-200 animate-pulse'
        }`}
      />
      <div
        className={`rounded-xl border transition-all duration-200 ${
          open ? 'border-neutral-200 bg-white shadow-sm' : 'border-transparent hover:bg-neutral-50/80'
        }`}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full text-left px-4 py-4 sm:px-5"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <time className="text-xs tabular-nums text-neutral-400 w-14 shrink-0">{dateLabel}</time>
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${KIND_TINT[record.kind]}`}>
              {t(`kind.${record.kind}`)}
            </span>
            <StatusBadge status={record.status} />
            <ChevronDown
              className={`ml-auto w-4 h-4 text-neutral-300 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            />
          </div>
          <h3 className="mt-2 text-[15px] font-medium text-neutral-900 leading-snug">
            {t(`demo.${record.id}.title`)}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-neutral-500">{t(`demo.${record.id}.summary`)}</p>
          {record.vote && (
            /* 投票结果的赞同率与参与度直接展示在事件行内 */
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="inline-flex items-center gap-2">
                <span className="text-xs text-neutral-400">{t('vote.approval')}</span>
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
              <span className="text-xs tabular-nums text-neutral-400">
                {t('vote.turnout', {
                  voters: record.vote.voters,
                  total: record.vote.totalMembers,
                  pct: Math.round((record.vote.voters / record.vote.totalMembers) * 100),
                })}
              </span>
            </div>
          )}
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="border-t border-neutral-100 px-4 pb-5 sm:px-5">
                <ProvenanceJourney record={record} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </li>
  )
}

const CATEGORY_KEYS = ['all', 'token', 'votes', 'rules', 'epoch'] as const
type CategoryFilter = (typeof CATEGORY_KEYS)[number]

export function RecordsExplorer() {
  const t = useTranslations('records')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [query, setQuery] = useState('')

  // 本地化标题/摘要参与检索，管理员用人名或关键词即可查询
  const searchable = useMemo(
    () =>
      demoRecords.map((r) => ({
        record: r,
        haystack: [
          t(`demo.${r.id}.title`),
          t(`demo.${r.id}.summary`),
          t(`kind.${r.kind}`),
          r.recordHash,
          r.date,
        ]
          .join('\n')
          .toLowerCase(),
      })),
    [t]
  )

  const counts = useMemo(() => {
    const c: Record<CategoryFilter, number> = { all: demoRecords.length, token: 0, votes: 0, rules: 0, epoch: 0 }
    for (const r of demoRecords) c[KIND_CATEGORY[r.kind]]++
    return c
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = searchable
    .filter(
      ({ record, haystack }) =>
        (category === 'all' || KIND_CATEGORY[record.kind] === category) && (q === '' || haystack.includes(q))
    )
    // 最新在前——按日期倒序，新增事件放数组任意位置都自动排好
    .sort((a, b) => b.record.date.localeCompare(a.record.date))

  return (
    <div className="relative">
      {/* 顶部渐变装饰（UIUX_Rules §5.4，蓝 = 可信） */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 -z-10"
        style={{
          background:
            'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(96,165,250,0.05) 50%, rgba(147,197,253,0.02) 100%)',
        }}
      />

      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10 pb-24 pt-14 sm:pt-20">
        {/* 页头 —— 左对齐，全宽横跨两列之上 */}
        <header className="max-w-3xl">
          <p className="text-[13px] font-medium tracking-wide text-blue-600">{t('eyebrow')}</p>
          <h1 className="mt-2.5 text-3xl sm:text-[40px] font-semibold leading-tight text-neutral-900 text-balance">
            {t('title')}
          </h1>
          <p className="mt-2 text-sm font-medium tracking-wide text-blue-600/90">{t('tagline')}</p>
          <p className="mt-3.5 max-w-xl text-base leading-relaxed text-neutral-500">{t('subtitle')}</p>
        </header>

        {/* 两列 PC 布局：左=大事记主栏（宽），右=侧栏（所有权/治理/验证/账本）；移动端堆叠 */}
        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start lg:gap-14">
          {/* 主栏：大事记 */}
          <section aria-label={t('timelineAria')}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">{t('timelineTitle')}</h2>
            <span className="hidden sm:inline text-xs text-neutral-400">{t('timelineHint')}</span>
          </div>

          {/* 搜索框（UIUX_Rules §4.4 输入框规范） */}
          <div className="relative mt-5">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('filter.searchPlaceholder')}
              aria-label={t('filter.searchPlaceholder')}
              className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-10 text-[15px] text-neutral-900 placeholder:text-neutral-400 transition-all duration-200 focus:border-emerald-500 focus:outline-none focus:ring-[3px] focus:ring-emerald-500/10"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label={t('filter.clear')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 分区筛选片 */}
          <div className="mt-3.5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATEGORY_KEYS.map((key) => {
              const active = category === key
              return (
                <button
                  key={key}
                  onClick={() => setCategory(key)}
                  aria-pressed={active}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                    active
                      ? 'bg-neutral-900 text-white'
                      : 'border border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-800'
                  }`}
                >
                  {t(`filter.${key}`)}
                  <span className={`text-xs tabular-nums ${active ? 'text-neutral-400' : 'text-neutral-300'}`}>
                    {counts[key]}
                  </span>
                </button>
              )
            })}
          </div>

          {/* 结果计数（仅检索/筛选时显示） */}
          {(q !== '' || category !== 'all') && (
            <p className="mt-4 text-[13px] text-neutral-400">
              {t('filter.resultsCount', { count: filtered.length })}
            </p>
          )}

          {filtered.length > 0 ? (
            <ol className="relative mt-5 space-y-1.5">
              {/* 时间线纵轴 */}
              <span aria-hidden className="absolute left-[13px] sm:left-[17px] top-3 bottom-3 w-px bg-neutral-200/70" />
              {filtered.map(({ record }) => (
                <RecordRow key={record.id} record={record} />
              ))}
            </ol>
          ) : (
            /* 教学型空状态 */
            <div className="mt-10 flex flex-col items-start gap-2 rounded-xl border border-dashed border-neutral-200 px-6 py-10">
              <Search className="w-5 h-5 text-neutral-300" />
              <p className="text-[15px] font-medium text-neutral-700">{t('filter.emptyTitle')}</p>
              <p className="text-sm leading-relaxed text-neutral-400 max-w-md">{t('filter.emptyDesc')}</p>
              <button
                onClick={() => {
                  setQuery('')
                  setCategory('all')
                }}
                className="mt-2 rounded-lg border border-neutral-200 px-3.5 py-1.5 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
              >
                {t('filter.reset')}
              </button>
            </div>
          )}
        </section>

          {/* 侧栏：所有权 / 治理 / 自助验证 / 账本状态（PC 右列，移动端堆叠在下） */}
          <aside className="space-y-10">
            <OwnershipBreakdown />
            <LiveProposals />
            <VerifyCenter />
            <div className="border-t border-neutral-100 pt-6">
              <ChainStatusStrip />
              <p className="mt-4 text-[13px] leading-relaxed text-neutral-400">{t('privacyNote')}</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
