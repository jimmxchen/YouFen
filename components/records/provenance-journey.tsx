'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ScrollText,
  Fingerprint,
  Landmark,
  ShieldCheck,
  ChevronDown,
  ExternalLink,
  Check,
  Copy,
  Loader2,
  Search,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type ChainRecord, explorerTxUrl, shortHash } from './demo-data'

/** 记录状态 → 溯源旅程走到第几步（1-4） */
function stepReached(record: ChainRecord): number {
  switch (record.status) {
    case 'pending':
      return 1
    case 'submitting':
      return 2
    case 'confirming':
      return 3
    default:
      return 4
  }
}

/** 哈希分组展示：每 8 字符一组，方便肉眼逐段比对 */
function chunkHash(hash: string): string {
  const body = hash.startsWith('0x') ? hash.slice(2) : hash
  return '0x ' + (body.match(/.{1,8}/g) ?? [body]).join(' ')
}

type VerifyPhase = 'idle' | 'reading' | 'hashing' | 'comparing' | 'match'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function CopyButton({ value, label, doneLabel }: { value: string; label: string; doneLabel: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        } catch {
          /* 剪贴板不可用时静默 */
        }
      }}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-1.5 py-0.5 text-[11px] text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-600"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
      {copied ? doneLabel : label}
    </button>
  )
}

/** 链上存档卡：把链上字段用人话标签完整搬进页面 */
function ChainArchiveCard({ record }: { record: ChainRecord }) {
  const t = useTranslations('records.archive')
  const locale = useLocale()
  const sealedLabel = record.sealedAt
    ? new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(record.sealedAt))
    : null

  return (
    <div className="mt-5 rounded-xl border border-blue-100/70 bg-blue-50/30 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Landmark className="w-4 h-4 text-blue-500" />
        <h4 className="text-sm font-semibold text-neutral-900">{t('title')}</h4>
      </div>
      <dl className="mt-3.5 space-y-3 text-[13px]">
        <div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-neutral-400">{t('fingerprint')}</dt>
            <CopyButton value={record.recordHash} label={t('copy')} doneLabel={t('copied')} />
          </div>
          <dd className="mt-1 font-mono leading-relaxed text-neutral-700 break-all">{chunkHash(record.recordHash)}</dd>
        </div>
        {record.txHash && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-neutral-400">{t('txRef')}</dt>
              <CopyButton value={record.txHash} label={t('copy')} doneLabel={t('copied')} />
            </div>
            <dd className="mt-1 font-mono text-neutral-700">{shortHash(record.txHash)}</dd>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-neutral-400">{t('block')}</dt>
            <dd className="mt-1 text-neutral-700">
              {record.blockNumber != null
                ? t('blockValue', { page: record.blockNumber.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US') })
                : t('pendingValue')}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-400">{t('sealedAt')}</dt>
            <dd className="mt-1 text-neutral-700">{sealedLabel ?? t('pendingValue')}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">{t('network')}</dt>
            <dd className="mt-1 text-neutral-700">{t('networkValue')}</dd>
          </div>
        </div>
      </dl>
    </div>
  )
}

/** 查证指南：教会文科管理者用三个对照点看懂公证处网站 */
function VerifyGuide({ record }: { record: ChainRecord }) {
  const t = useTranslations('records')
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-4 inline-flex items-center gap-1 text-[13px] text-neutral-400 hover:text-neutral-600 transition-colors"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        {t('guide.toggle')}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-lg border border-neutral-100 bg-white p-4 text-[13px] leading-relaxed text-neutral-600">
              <p>{t('guide.intro')}</p>
              <ol className="mt-2 space-y-1 text-neutral-500">
                <li>{t('guide.s1')}</li>
                <li>{t('guide.s2')}</li>
                <li>{t('guide.s3')}</li>
              </ol>
              {record.demo ? (
                <p className="mt-3 text-neutral-400">{t('archive.demoNote')}</p>
              ) : (
                record.txHash && (
                  <a
                    href={explorerTxUrl(record.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-[13px] font-medium text-blue-600 transition-colors hover:bg-blue-50"
                  >
                    {t('guide.open')}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export function ProvenanceJourney({ record }: { record: ChainRecord }) {
  const t = useTranslations('records')
  const reached = stepReached(record)
  const [phase, setPhase] = useState<VerifyPhase>('idle')

  const steps = [
    { key: 'recorded', icon: ScrollText },
    { key: 'fingerprint', icon: Fingerprint },
    { key: 'stamped', icon: Landmark },
    { key: 'checkable', icon: ShieldCheck },
  ] as const

  async function runVerify() {
    if (phase !== 'idle' && phase !== 'match') return
    setPhase('reading')
    await wait(750)
    setPhase('hashing')
    await wait(950)
    setPhase('comparing')
    // 集成点：真实记录改为
    //   const res = await fetch(`/api/public-records/${record.id}/verify`)
    //   const { data } = await res.json() → data.hashMatches / data.onChain
    // demo 记录本地模拟比对耗时。
    await wait(850)
    setPhase('match')
  }

  const verifySteps: { key: 'reading' | 'hashing' | 'comparing'; done: boolean; active: boolean }[] = [
    { key: 'reading', done: phase === 'hashing' || phase === 'comparing' || phase === 'match', active: phase === 'reading' },
    { key: 'hashing', done: phase === 'comparing' || phase === 'match', active: phase === 'hashing' },
    { key: 'comparing', done: phase === 'match', active: phase === 'comparing' },
  ]

  return (
    <div className="pt-5">
      {/* 溯源旅程四步 */}
      <ol className="grid gap-3 md:grid-cols-4 md:gap-2">
        {steps.map((step, i) => {
          const n = i + 1
          const done = n < reached || (n === reached && reached === 4)
          const current = n === reached && reached < 4
          const Icon = step.icon
          return (
            <li key={step.key} className="relative flex gap-3 md:block">
              {/* 连接线（桌面横向 / 移动纵向） */}
              {i < steps.length - 1 && (
                <>
                  <span
                    aria-hidden
                    className={`hidden md:block absolute top-[18px] left-[calc(50%+26px)] right-[calc(-50%+26px)] h-px ${
                      n < reached ? 'bg-emerald-300' : 'bg-neutral-200'
                    }`}
                  />
                  <span
                    aria-hidden
                    className={`md:hidden absolute left-[18px] top-10 bottom-[-12px] w-px ${
                      n < reached ? 'bg-emerald-300' : 'bg-neutral-200'
                    }`}
                  />
                </>
              )}
              <div
                className="relative z-10 shrink-0 md:mx-auto md:mb-2 w-9 h-9 rounded-full grid place-items-center border"
                style={{
                  backgroundColor: done ? '#ECFDF5' : current ? '#EFF6FF' : '#FAFAFA',
                  borderColor: done ? '#A7F3D0' : current ? '#BFDBFE' : '#F0F0F0',
                }}
              >
                {done ? (
                  <Check className="w-4 h-4 text-emerald-600" strokeWidth={2.5} />
                ) : (
                  /* 当前步骤用静态蓝色图标标示进行中，不做常驻旋转动画 */
                  <Icon className={`w-4 h-4 ${current ? 'text-blue-500' : 'text-neutral-400'}`} />
                )}
              </div>
              <div className="md:text-center min-w-0">
                <div className="text-sm font-medium text-neutral-900">
                  {t(`journey.${step.key}.title`)}
                </div>
                <div className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">
                  {t(`journey.${step.key}.desc`)}
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {/* superseded 的更正说明 */}
      {record.status === 'superseded' && (
        <p className="mt-4 text-[13px] leading-relaxed text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3.5 py-2.5">
          {t('journey.supersededNote')}
        </p>
      )}

      {/* 链上存档原文（默认可见，把链上数据完整搬进页面） */}
      <ChainArchiveCard record={record} />

      {/* 亲自验一验 */}
      {record.status === 'verified' || record.status === 'superseded' ? (
        <div className="mt-4 rounded-xl border border-neutral-100 bg-neutral-50/60 p-4">
          {phase === 'idle' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-neutral-500 max-w-sm leading-relaxed">
                {t('verify.invite')}
              </p>
              <button
                onClick={runVerify}
                className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-neutral-700 hover:-translate-y-px hover:shadow-md"
              >
                <Search className="w-4 h-4" />
                {t('verify.button')}
              </button>
            </div>
          ) : (
            <div>
              <ul className="space-y-2.5">
                {verifySteps.map((s) => (
                  <li key={s.key} className="flex items-center gap-2.5 text-sm">
                    <span className="w-5 h-5 grid place-items-center">
                      {s.done ? (
                        <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                          <Check className="w-4 h-4 text-emerald-600" strokeWidth={2.5} />
                        </motion.span>
                      ) : s.active ? (
                        /* 查验动画为一次性动作反馈（约 1 秒），保留短暂加载指示 */
                        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
                      )}
                    </span>
                    <span className={s.done ? 'text-neutral-700' : s.active ? 'text-neutral-900' : 'text-neutral-400'}>
                      {t(`verify.steps.${s.key}`)}
                    </span>
                  </li>
                ))}
              </ul>
              <AnimatePresence>
                {phase === 'match' && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="mt-3.5 flex items-start gap-2.5 rounded-lg bg-emerald-50 border border-emerald-100 px-3.5 py-3"
                  >
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-emerald-800">{t('verify.matchTitle')}</div>
                      <div className="mt-0.5 text-[13px] leading-relaxed text-emerald-700">
                        {t('verify.matchDesc')}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      ) : null}

      {/* 查证指南（渐进披露） */}
      <VerifyGuide record={record} />
    </div>
  )
}
