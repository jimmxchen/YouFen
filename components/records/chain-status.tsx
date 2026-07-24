'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Landmark } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

const EXPLORER_BASE = 'https://testnet-injective.cloud.blockscout.com'
const REFRESH_MS = 15_000

interface ChainStats {
  totalBlocks: number
  blockSeconds: number
}

/**
 * Injective 公共账本实时状态条。
 * 直接读 Blockscout 公开统计 API（CORS 开放），把"链在真实运行"翻译成
 * 文科管理者能感知的账本隐喻：已写到第 N 页、每 X 秒翻新一页。
 * 拉取失败时回退为不带数字的通用文案，不阻塞页面。
 */
export function ChainStatusStrip() {
  const t = useTranslations('records.chain')
  const locale = useLocale()
  const [stats, setStats] = useState<ChainStats | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const res = await fetch(`${EXPLORER_BASE}/api/v2/stats`)
        if (!res.ok) return
        const d = await res.json()
        const totalBlocks = Number(d.total_blocks)
        const blockSeconds = Number(d.average_block_time) / 1000
        if (alive && Number.isFinite(totalBlocks) && totalBlocks > 0) {
          setStats({ totalBlocks, blockSeconds: Number.isFinite(blockSeconds) ? blockSeconds : 0 })
        }
      } catch {
        /* 网络不可达时保持通用文案 */
      }
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const nf = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US')

  return (
    <div className="rounded-2xl border border-[#F0F0F0] bg-[#FAFAFA] p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Landmark className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-semibold text-neutral-900">{t('title')}</span>
        {stats && (
          <span className="ml-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            {t('liveTag')}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-neutral-500">
        {stats
          ? t('live', {
              pages: nf.format(stats.totalBlocks),
              seconds: stats.blockSeconds > 0 ? stats.blockSeconds.toFixed(1) : '1',
            })
          : t('fallback')}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <a
          href={EXPLORER_BASE}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-2xl border border-[#F0F0F0] bg-white px-3 py-1.5 text-[13px] font-medium text-[#525252] transition-colors hover:bg-[#FAFAFA]"
        >
          {t('open')}
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <span className="text-xs text-neutral-400">{t('engineerNote')}</span>
      </div>
    </div>
  )
}
