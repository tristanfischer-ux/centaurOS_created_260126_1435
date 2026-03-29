/**
 * @file RecruitPageTabs.tsx
 *
 * @description Tab wrapper for the Recruits page.
 * "For You" tab (default) shows AI-matched executive recruits.
 * "Browse All" tab shows the existing directory/filter view.
 */

'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Sparkles, Search } from 'lucide-react'

interface RecruitPageTabsProps {
  forYouContent: React.ReactNode
  browseContent: React.ReactNode
}

export function RecruitPageTabs({
  forYouContent,
  browseContent,
}: RecruitPageTabsProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<'for-you' | 'browse'>('for-you')

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border">
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

      {/* Tab content */}
      {activeTab === 'for-you' && <div className="space-y-6">{forYouContent}</div>}
      {activeTab === 'browse' && <div className="space-y-6">{browseContent}</div>}
    </div>
  )
}
