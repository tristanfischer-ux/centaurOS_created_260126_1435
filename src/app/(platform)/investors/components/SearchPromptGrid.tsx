/**
 * @file SearchPromptGrid.tsx
 *
 * @description Phase G: 6-card prompt grid above the investor search results.
 * Click → fires the prompt as the search query. Mirrors the Brainstorming
 * idea-grid pattern so the journey is "see prompts → click → see real
 * matches with why-fit + how-to-pitch + drafted email".
 *
 * Static prompts for now — they map to common UK hardware-founder fundraise
 * intents. The "Intelligence-embedded hardware funds" prompt aligns to the
 * new homepage thesis (commit 6dcee416, 2026-04-25).
 */

'use client'

import { Card, CardContent } from '@/components/ui/card'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PromptCard {
  title: string
  blurb: string
  query: string
}

const PROMPTS: PromptCard[] = [
  {
    title: 'UK Series A leads in food tech',
    blurb: 'Lead investors writing £2-6M cheques for vertical farming, alt-protein, and food robotics.',
    query: 'UK Series A lead investors food tech vertical farming',
  },
  {
    title: 'Climate funds with hardware portfolio',
    blurb: 'Climate-tech VCs that have actually funded hardware-heavy companies, not just software.',
    query: 'Climate funds with hardware portfolio companies UK Europe',
  },
  {
    title: 'Family office angels writing £100K+',
    blurb: 'Active UK family offices and angel syndicates with £100K-£500K cheques for hardware pre-seed.',
    query: 'UK family office angel syndicate hardware pre-seed £100K',
  },
  {
    title: 'Impact-aligned VCs for medical devices',
    blurb: 'Investors with explicit healthtech or medical-device theses and recent UK MedTech deals.',
    query: 'Impact medical device healthtech VC UK Series A',
  },
  {
    title: 'Pre-seed leads in industrial IoT',
    blurb: 'Pre-seed and seed leads writing first cheques into industrial IoT, automation, factory tools.',
    query: 'Pre-seed lead industrial IoT automation factory hardware UK',
  },
  {
    title: 'Intelligence-embedded hardware funds',
    blurb: 'Funds that get hardware + AI fusion — robotics, smart manufacturing, embedded ML at the edge.',
    query: 'AI hardware fusion robotics smart manufacturing embedded edge UK Europe',
  },
]

interface Props {
  onPick: (query: string) => void
  className?: string
}

export function SearchPromptGrid({ onPick, className }: Props) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-foreground">Search ideas</h2>
        <p className="text-xs text-muted-foreground">Click to run</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {PROMPTS.map((p) => (
          <Card
            key={p.title}
            role="button"
            tabIndex={0}
            onClick={() => onPick(p.query)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onPick(p.query)
              }
            }}
            className="cursor-pointer group border hover:border-international-orange/40 hover:shadow-sm transition-all hover:-translate-y-0.5 active:scale-[0.99] duration-200"
          >
            <CardContent className="p-4 space-y-1.5">
              <div className="flex items-start gap-2">
                <h3 className="text-sm font-semibold tracking-tight flex-1 text-foreground">
                  {p.title}
                </h3>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-international-orange transition-colors shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {p.blurb}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
