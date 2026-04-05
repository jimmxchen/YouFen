'use client'
import { Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VoicePowerBadgeProps {
  value: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function VoicePowerBadge({ value, size = 'md', className }: VoicePowerBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full font-semibold text-white',
      'bg-gradient-to-r from-emerald-500 to-green-400',
      size === 'sm' && 'px-2 py-0.5 text-xs',
      size === 'md' && 'px-3 py-1 text-sm',
      size === 'lg' && 'px-4 py-1.5 text-base',
      className
    )}>
      <Zap className={cn('fill-white', size === 'sm' && 'w-3 h-3', size === 'md' && 'w-4 h-4', size === 'lg' && 'w-5 h-5')} />
      {value.toLocaleString()}
    </span>
  )
}
