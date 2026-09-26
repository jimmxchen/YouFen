'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PollOptionBarProps {
  text: string
  pct: number
  meta?: string
  isWinning?: boolean
  selected?: boolean
  interactive?: boolean
  disabled?: boolean
  /** Whether the relative percentage/fill is safe to reveal (e.g. after the viewer has voted). */
  showResults?: boolean
  onSelect?: () => void
}

/**
 * Option label renders faded inside the bar itself (not as a separate
 * heading) so the bar fill + percentage stay the primary focal point.
 */
export function PollOptionBar({
  text,
  pct,
  meta,
  isWinning = false,
  selected = false,
  interactive = false,
  disabled = false,
  showResults = true,
  onSelect,
}: PollOptionBarProps) {
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={interactive && !disabled ? onSelect : undefined}
        disabled={!interactive || disabled}
        aria-pressed={interactive ? selected : undefined}
        className={cn(
          'relative block h-12 w-full overflow-hidden rounded-xl border text-left transition-all duration-200',
          selected ? 'border-emerald-500 ring-2 ring-emerald-500/15' : 'border-[#F0F0F0]',
          interactive && !disabled && 'cursor-pointer hover:border-[#D9D9D9]',
          !interactive && 'cursor-default',
          interactive && disabled && 'cursor-not-allowed opacity-70',
        )}
      >
        <div className="absolute inset-0 bg-[#FAFAFA]" />
        <div
          className={cn(
            'absolute inset-y-0 left-0 transition-all duration-500',
            isWinning ? 'bg-gradient-to-r from-emerald-100 to-green-50' : 'bg-[#EFEFEF]',
            !showResults && 'blur-sm',
          )}
          style={{ width: `${showResults ? pct : 100}%` }}
        />
        <div className="relative flex h-full items-center justify-between gap-3 px-4">
          <span className="truncate text-sm font-medium text-[#131517]/30">{text}</span>
          {showResults ? (
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[#131517]">
              {selected && <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />}
              {pct}%
            </span>
          ) : (
            selected && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
          )}
        </div>
      </button>
      {meta ? <p className="px-1 text-xs text-[#939597]">{meta}</p> : null}
    </div>
  )
}
