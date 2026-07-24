'use client'
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  change?: { value: number; label: string }
  icon: LucideIcon
  accent?: 'cyan' | 'blue' | 'green' | 'amber'
  className?: string
}

const accentColors = {
  cyan: 'text-cyan-600 bg-cyan-50',
  blue: 'text-blue-600 bg-blue-50',
  green: 'text-emerald-600 bg-emerald-50',
  amber: 'text-amber-600 bg-amber-50',
}

export function StatCard({ title, value, change, icon: Icon, accent = 'cyan', className }: StatCardProps) {
  return (
    <div className={cn(
      'rounded-2xl border border-[#F0F0F0] bg-white p-6',
      'transition-all duration-200 hover:border-[#E5E5E5] hover:-translate-y-0.5',
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-[#939597] mb-1">{title}</p>
          <p className="text-2xl font-semibold text-[#131517]">{value}</p>
          {change && (
            <div className="flex items-center gap-1 mt-2">
              {change.value >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
              <span className={cn('text-xs font-medium', change.value >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                {change.value >= 0 ? '+' : ''}{change.value}%
              </span>
              <span className="text-xs text-[#939597]">{change.label}</span>
            </div>
          )}
        </div>
        <div className={cn('p-2.5 rounded-2xl', accentColors[accent])}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}
