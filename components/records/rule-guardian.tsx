'use client'

import { ShieldX, Ban, KeyRound, Scale } from 'lucide-react'
import { useTranslations } from 'next-intl'

/**
 * 规则守门（v0.7 协议执行层的叙事化呈现）。
 * v0.6 的公证隐喻只证明"已发生的事改不了"；v0.7 再叠一层"不合规的事发生不了"。
 * 用文科管理者能读懂的"越权尝试 → 账本回应"分隔行，讲清合约如何拒绝滥权。
 * 这些是教学型示例；v0.7 合约上线后即成为真实的越权 Revert 演示（见 HANDOFF）。
 */
const SCENARIOS = [
  { key: 'overMint', icon: Ban },
  { key: 'secretRule', icon: Ban },
  { key: 'voteStuffing', icon: Ban },
  { key: 'voteForYou', icon: KeyRound },
] as const

export function RuleGuardian() {
  const t = useTranslations('records.guardian')

  return (
    <section aria-label={t('aria')} className="mt-16">
      <div className="flex items-start gap-3.5">
        <div className="shrink-0 grid h-10 w-10 place-items-center rounded-full bg-neutral-900">
          <Scale className="h-[18px] w-[18px] text-white" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">{t('title')}</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-500">{t('intro')}</p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200/80 bg-white">
        {SCENARIOS.map((s, i) => {
          const Icon = s.icon
          return (
            <div
              key={s.key}
              className={`flex flex-col gap-2.5 px-5 py-4 sm:flex-row sm:items-center sm:gap-6 sm:py-5 ${
                i > 0 ? 'border-t border-neutral-100' : ''
              }`}
            >
              {/* 越权尝试 */}
              <div className="flex items-start gap-3 sm:flex-1">
                <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rose-50">
                  <Icon className="h-4 w-4 text-rose-500" strokeWidth={2} />
                </div>
                <p className="text-[15px] leading-snug text-neutral-800">{t(`${s.key}.attempt`)}</p>
              </div>
              {/* 账本回应 */}
              <div className="pl-10 sm:w-[46%] sm:shrink-0 sm:pl-0">
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-600">
                  <ShieldX className="h-3.5 w-3.5" />
                  {t(`${s.key}.verdict`)}
                </span>
                <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">{t(`${s.key}.reason`)}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* 诚实边界：账本保证什么 / 不保证什么 + 可退出性（UIUX 信任文案纪律） */}
      <div className="mt-5 flex flex-col gap-3 rounded-xl border border-neutral-100 bg-neutral-50/70 px-5 py-4 sm:flex-row sm:gap-4">
        <div className="flex-1">
          <p className="text-[13px] font-medium text-neutral-700">{t('boundaryTitle')}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-neutral-500">{t('boundary')}</p>
        </div>
        <div className="flex-1 sm:border-l sm:border-neutral-200 sm:pl-4">
          <p className="text-[13px] font-medium text-neutral-700">{t('exitTitle')}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-neutral-500">{t('exit')}</p>
        </div>
      </div>
    </section>
  )
}
