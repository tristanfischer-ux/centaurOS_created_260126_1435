'use client'

import { cn } from '@/lib/utils'
import { Target, TrendingUp, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react'

interface StrategyHealthBarProps {
  total: number
  onTrack: number
  atRisk: number
  offTrack: number
  completed: number
  activeFilter: string | null
  onFilterChange: (filter: string | null) => void
}

export function StrategyHealthBar({
  total,
  onTrack,
  atRisk,
  offTrack,
  completed,
  activeFilter,
  onFilterChange,
}: StrategyHealthBarProps) {
  const stats = [
    {
      key: null as string | null,
      label: 'Total',
      value: total,
      icon: Target,
      color: 'text-foreground',
      bg: 'bg-muted/50',
      activeBg: 'bg-muted',
      border: 'border-muted-foreground/20',
    },
    {
      key: 'on-track',
      label: 'On Track',
      value: onTrack,
      icon: TrendingUp,
      color: 'text-status-success',
      bg: 'bg-status-success/5',
      activeBg: 'bg-status-success/15',
      border: 'border-status-success/30',
    },
    {
      key: 'at-risk',
      label: 'At Risk',
      value: atRisk,
      icon: AlertTriangle,
      color: 'text-status-warning',
      bg: 'bg-status-warning/5',
      activeBg: 'bg-status-warning/15',
      border: 'border-status-warning/30',
    },
    {
      key: 'off-track',
      label: 'Off Track',
      value: offTrack,
      icon: XCircle,
      color: 'text-status-error',
      bg: 'bg-status-error/5',
      activeBg: 'bg-status-error/15',
      border: 'border-status-error/30',
    },
    {
      key: 'completed',
      label: 'Completed',
      value: completed,
      icon: CheckCircle2,
      color: 'text-status-success',
      bg: 'bg-status-success/5',
      activeBg: 'bg-status-success/15',
      border: 'border-status-success/30',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {stats.map((stat) => {
        const isActive = activeFilter === stat.key
        return (
          <button
            key={stat.key ?? 'total'}
            onClick={() => onFilterChange(isActive ? null : stat.key)}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-200',
              'hover:shadow-sm hover:-translate-y-0.5',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? cn(stat.activeBg, stat.border, 'shadow-sm')
                : cn('bg-card border', 'hover:border-foreground/10')
            )}
          >
            <stat.icon className={cn('h-4 w-4 flex-shrink-0', stat.color)} />
            <div className="text-left">
              <div className="text-xl font-semibold tabular-nums text-foreground">
                {stat.value}
              </div>
              <div className="text-[11px] font-medium text-muted-foreground">
                {stat.label}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
