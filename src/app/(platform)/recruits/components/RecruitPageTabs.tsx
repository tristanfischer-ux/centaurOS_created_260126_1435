/**
 * @file RecruitPageTabs.tsx
 *
 * @description Tab wrapper for the Recruits page.
 * "For You" tab (default) shows AI-matched executive recruits.
 * "Browse All" tab shows the existing directory/filter view.
 * Includes a toggle to show/hide sample (demo) profiles in the Browse tab.
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Sparkles, Search, FlaskConical } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

interface RecruitPageTabsProps {
  forYouContent: React.ReactNode
  browseContent: React.ReactNode
  /** Number of demo/sample People listings available */
  demoPeopleCount?: number
  /** Whether demo listings are currently shown (driven by URL searchParam) */
  showDemo?: boolean
}

export function RecruitPageTabs({
  forYouContent,
  browseContent,
  demoPeopleCount = 0,
  showDemo = false,
}: RecruitPageTabsProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<'for-you' | 'browse'>('for-you')
  const router = useRouter()

  function handleDemoToggle(checked: boolean) {
    // INTENT: Toggle demo listings via URL searchParam so the server component
    // re-fetches with/without demo data. This preserves SSR and avoids client state drift.
    const url = new URL(window.location.href)
    if (checked) {
      url.searchParams.set('demo', '1')
    } else {
      url.searchParams.delete('demo')
    }
    router.push(url.pathname + url.search)
  }

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('for-you')}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === 'for-you'
                ? 'border-international-orange text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
            )}
          >
            <Sparkles className="h-4 w-4" />
            For You
          </button>
          <button
            onClick={() => setActiveTab('browse')}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === 'browse'
                ? 'border-international-orange text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
            )}
          >
            <Search className="h-4 w-4" />
            Browse All
          </button>
        </div>

        {/* Demo toggle — only visible on Browse tab when demo data exists */}
        {activeTab === 'browse' && demoPeopleCount > 0 && (
          <div className="flex items-center gap-2 pb-2">
            <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
            <label
              htmlFor="demo-toggle"
              className="text-xs text-muted-foreground cursor-pointer select-none"
            >
              Show sample profiles ({demoPeopleCount})
            </label>
            <Switch
              id="demo-toggle"
              checked={showDemo}
              onCheckedChange={handleDemoToggle}
              className="scale-75"
            />
          </div>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'for-you' && <div className="space-y-6">{forYouContent}</div>}
      {activeTab === 'browse' && <div className="space-y-6">{browseContent}</div>}
    </div>
  )
}
