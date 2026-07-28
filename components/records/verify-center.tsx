'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Loader2, Search, ShieldCheck, ShieldX } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { demoRecords, shortHash } from './demo-data'

/**
 * 自助验证中心。把单条记录里的「亲自验一验」升级成独立工具：粘贴任意
 * recordHash，页面当场复算数字指纹、核对链上存在、并检查是否合规放行。
 * demo：在本地记录集里匹配；真实环境调 GET /api/public-records/:id/verify
 * （返回 hashMatches / onChain / enforcementMatches）。
 */
type Phase = 'idle' | 'checking' | 'found' | 'notfound'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function VerifyCenter() {
  const t = useTranslations('records.verifyCenter')
  const [value, setValue] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [step, setStep] = useState(0)

  async function run() {
    const query = value.trim().toLowerCase()
    if (query.length === 0) return
    setPhase('checking')
    setStep(0)
    const hit = demoRecords.find((r) => r.recordHash.toLowerCase() === query)
    // 逐步动画：读取 → 复算指纹 → 比对链上+合规
    await wait(600)
    setStep(1)
    await wait(700)
    setStep(2)
    await wait(650)
    setPhase(hit ? 'found' : 'notfound')
  }

  const steps: string[] = [t('step1'), t('step2'), t('step3')]

  return (
    <section aria-label={t('title')}>
      <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/40 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-blue-500" />
          <h2 className="text-base font-semibold text-neutral-900">{t('title')}</h2>
        </div>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-500">{t('intro')}</p>

        {/* 输入 + 验证 */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setPhase('idle')
              }}
              placeholder={t('placeholder')}
              aria-label={t('placeholder')}
              className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-3 font-mono text-[13px] text-neutral-900 placeholder:font-sans placeholder:text-neutral-400 transition-all focus:border-blue-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10"
            />
          </div>
          <button
            onClick={run}
            disabled={phase === 'checking'}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-neutral-700 disabled:opacity-60"
          >
            {phase === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {t('button')}
          </button>
        </div>

        {/* 快捷：用一条示例 */}
        <button
          onClick={() => {
            setValue(demoRecords[0].recordHash)
            setPhase('idle')
          }}
          className="mt-2 text-[13px] text-blue-600 hover:text-blue-700"
        >
          {t('trySample', { hash: shortHash(demoRecords[0].recordHash) })}
        </button>

        {/* 结果 */}
        <AnimatePresence initial={false}>
          {phase !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <ul className="mt-4 space-y-2.5">
                {steps.map((label, i) => {
                  const done = phase === 'found' ? true : phase === 'checking' ? i < step : false
                  const active = phase === 'checking' && i === step
                  const failed = phase === 'notfound' && i === 2
                  return (
                    <li key={label} className="flex items-center gap-2.5 text-sm">
                      <span className="grid h-5 w-5 place-items-center">
                        {failed ? (
                          <ShieldX className="h-4 w-4 text-rose-500" />
                        ) : done ? (
                          <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
                        ) : active ? (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
                        )}
                      </span>
                      <span className={done ? 'text-neutral-700' : failed ? 'text-rose-600' : 'text-neutral-400'}>
                        {failed ? t('notFoundStep') : label}
                      </span>
                    </li>
                  )
                })}
              </ul>

              {phase === 'found' && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3.5 flex items-start gap-2.5 rounded-lg border border-emerald-100 bg-emerald-50 px-3.5 py-3"
                >
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <div className="text-sm font-medium text-emerald-800">{t('okTitle')}</div>
                    <div className="mt-0.5 text-[13px] leading-relaxed text-emerald-700">{t('okDesc')}</div>
                  </div>
                </motion.div>
              )}
              {phase === 'notfound' && (
                <div className="mt-3.5 flex items-start gap-2.5 rounded-lg border border-amber-100 bg-amber-50 px-3.5 py-3">
                  <ShieldX className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div className="text-[13px] leading-relaxed text-amber-800">{t('notFoundDesc')}</div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
