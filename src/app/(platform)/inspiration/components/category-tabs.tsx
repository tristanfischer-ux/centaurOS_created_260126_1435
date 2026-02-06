'use client'

import {
  Sparkles,
  Target,
  CircuitBoard,
  TrendingUp,
  Heart,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// CategoryTabs – intent-driven tab navigation for the Inspiration page
// Tabs organised around user needs rather than content source.
// ---------------------------------------------------------------------------

export type TabId = 'for-you' | 'by-need' | 'by-industry' | 'popular' | 'saved'

interface Tab {
  id: TabId
  label: string
  icon: React.ElementType
  count?: number
  /** Tailwind classes applied when the tab is active */
  activeClasses: string
  /** Colour applied to the icon when the tab is *not* active */
  iconColor: string
}

interface CategoryTabsProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  byNeedCount: number
  industryCount: number
  popularCount: number
  savedCount: number
  /** Number of identified gaps to display as a badge on "By Need" */
  gapCount?: number
}

export function CategoryTabs({
  activeTab,
  onTabChange,
  byNeedCount,
  industryCount,
  popularCount,
  savedCount,
  gapCount,
}: CategoryTabsProps) {
  const tabs: Tab[] = [
    {
      id: 'for-you',
      label: 'For You',
      icon: Sparkles,
      iconColor: 'text-international-orange',
      activeClasses:
        'bg-international-orange/10 text-international-orange border-international-orange',
    },
    {
      id: 'by-need',
      label: 'By Need',
      icon: Target,
      count: gapCount && gapCount > 0 ? gapCount : byNeedCount,
      iconColor: 'text-electric-blue',
      activeClasses:
        'bg-electric-blue/10 text-electric-blue border-electric-blue',
    },
    {
      id: 'by-industry',
      label: 'By Industry',
      icon: CircuitBoard,
      count: industryCount,
      iconColor: 'text-chart-5',
      activeClasses: 'bg-chart-5/10 text-chart-5 border-chart-5',
    },
    {
      id: 'popular',
      label: 'Popular',
      icon: TrendingUp,
      count: popularCount,
      iconColor: 'text-status-success',
      activeClasses:
        'bg-status-success-light text-status-success-dark border-status-success',
    },
    {
      id: 'saved',
      label: 'Saved',
      icon: Heart,
      count: savedCount,
      iconColor: 'text-muted-foreground',
      activeClasses:
        'bg-international-orange/10 text-international-orange border-international-orange',
    },
  ]

  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium',
              'border transition-all duration-200 select-none',
              isActive
                ? cn(tab.activeClasses, 'shadow-sm')
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            <Icon className={cn('h-4 w-4', !isActive && tab.iconColor)} />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={cn(
                  'text-xs tabular-nums px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center',
                  isActive ? 'bg-white/60 dark:bg-white/20' : 'bg-muted',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
