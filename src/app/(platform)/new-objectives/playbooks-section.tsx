'use client'

// INTENT: This section renders below the user's own objectives, separated by
// a divider. It mirrors the Team page pattern: your own stuff at the top, then
// a curated set of ideas/packs beneath. Collapsible so power users can hide it.

import { useState } from 'react'
import { ChevronDown, ChevronRight, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlaybooksPage } from '../playbooks/playbooks-page'
import type { PlaybooksData, Member } from './types'

interface PlaybooksSectionProps {
  playbooksData: PlaybooksData
  members: Member[]
}

export function PlaybooksSection({ playbooksData, members }: PlaybooksSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <section className="space-y-6">
      {/* Divider */}
      <div className="border-t border-muted" />

      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-3 w-full text-left group"
        aria-expanded={isExpanded}
        aria-controls="playbooks-ideas-section"
      >
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-international-orange/10 shrink-0">
          <Lightbulb className="h-5 w-5 text-international-orange" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground group-hover:text-international-orange transition-colors">
            Other ideas for you to be getting on with
          </h2>
          <p className="text-sm text-muted-foreground">
            Pre-built objective packs and project templates to jump-start your next initiative
          </p>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Collapsible content */}
      <div
        id="playbooks-ideas-section"
        className={cn(
          'transition-all duration-300 overflow-hidden',
          isExpanded ? 'max-h-none opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <PlaybooksPage
          templates={playbooksData.templates}
          packs={playbooksData.packs}
          initialSavedPackIds={playbooksData.initialSavedPackIds}
          foundryContext={playbooksData.foundryContext ?? undefined}
          members={members.map(m => ({
            id: m.id,
            full_name: m.full_name,
            role: m.role ?? '',
            email: m.email,
            avatar_url: m.avatar_url,
          }))}
          universalSubsystems={playbooksData.universalSubsystems}
          embedded
        />
      </div>
    </section>
  )
}
