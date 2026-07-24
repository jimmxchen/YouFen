'use client'

import { PieChart } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { ownershipOthers, ownershipTop } from './demo-data'

/**
 * 所有权分布。把「有份儿」的核心——谁拥有社区多少——可视化：一条堆叠的
 * 所有权条 + 前几名图例 + 「其他成员」聚合，诚实呈现广泛分布而非巨鲸独大。
 * 并点出稀释叙事：相对所有权随新贡献自然变化。demo 数据。
 */
const SEGMENT_COLORS = ['#3b82f6', '#10b981', '#14b8a6', '#6366f1', '#38bdf8']
const OTHERS_COLOR = '#e5e7eb'

export function OwnershipBreakdown() {
  const t = useTranslations('records.ownership')
  const locale = useLocale()
  const nf = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US')

  return (
    <section aria-label={t('title')}>
      <div className="flex items-start gap-3.5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-50 border border-neutral-100">
          <PieChart className="h-[18px] w-[18px] text-blue-500" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">{t('title')}</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-500">{t('intro')}</p>
        </div>
      </div>

      {/* 堆叠所有权条 */}
      <div className="mt-6 flex h-3.5 w-full overflow-hidden rounded-full">
        {ownershipTop.map((o, i) => (
          <div
            key={o.name}
            className="h-full first:rounded-l-full"
            style={{ width: `${o.pct}%`, backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
            title={`${o.name} · ${o.pct}%`}
          />
        ))}
        <div
          className="h-full rounded-r-full"
          style={{ width: `${ownershipOthers.pct}%`, backgroundColor: OTHERS_COLOR }}
          title={`${t('others', { count: ownershipOthers.count })} · ${ownershipOthers.pct}%`}
        />
      </div>

      {/* 图例：前几名 + 其他聚合 */}
      <ul className="mt-5 divide-y divide-neutral-100 rounded-xl border border-neutral-200/80 bg-white">
        {ownershipTop.map((o, i) => (
          <li key={o.name} className="flex items-center gap-3 px-4 py-3">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
            />
            <span className="flex-1 text-[15px] font-medium text-neutral-800">{o.name}</span>
            <span className="text-[13px] tabular-nums text-neutral-400">{nf.format(o.balance)} AXO</span>
            <span className="w-14 text-right text-[15px] font-semibold tabular-nums text-neutral-900">{o.pct}%</span>
          </li>
        ))}
        <li className="flex items-center gap-3 px-4 py-3">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: OTHERS_COLOR }} />
          <span className="flex-1 text-[15px] text-neutral-500">{t('others', { count: ownershipOthers.count })}</span>
          <span className="w-14 text-right text-[15px] font-semibold tabular-nums text-neutral-500">
            {ownershipOthers.pct}%
          </span>
        </li>
      </ul>

      <p className="mt-3 text-[13px] leading-relaxed text-neutral-400">{t('dilutionNote')}</p>
    </section>
  )
}
