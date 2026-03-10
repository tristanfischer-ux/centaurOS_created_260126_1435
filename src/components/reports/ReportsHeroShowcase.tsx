'use client'

/**
 * @file ReportsHeroShowcase.tsx
 *
 * @description Inspiring hero empty state for the Reports page with quick-start
 * actions, visual preview strip, and capability badges. Shown only when no
 * report has been generated yet in the current session.
 *
 * @related
 * - src/app/(platform)/reports/page.tsx — Parent page
 * - src/lib/reports/templates.ts — Template definitions
 */

import {
  CalendarDays,
  Briefcase,
  Sparkles,
  FileDown,
  FileText,
  Presentation,
  Share2,
  Mail,
  Clock,
  ImageIcon,
  BarChart3,
  TrendingUp,
  Target,
  AlignLeft,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import type { ReportTemplateId } from '@/lib/reports/report-document-types'

interface QuickStartAction {
  id: ReportTemplateId | 'custom'
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  accent: string
}

const QUICK_START_ACTIONS: QuickStartAction[] = [
  {
    id: 'weekly-update',
    label: 'Weekly Update',
    description: 'Last week · Internal tone · 10 sections',
    icon: CalendarDays,
    accent: 'bg-info/10 text-info',
  },
  {
    id: 'board-pack',
    label: 'Board Pack',
    description: 'Last month · Board tone · 11 sections',
    icon: Briefcase,
    accent: 'bg-warning/10 text-warning',
  },
  {
    id: 'custom',
    label: 'Start from Scratch',
    description: 'Pick your own sections, tone, and date range',
    icon: Sparkles,
    accent: 'bg-international-orange/10 text-international-orange',
  },
]

const CAPABILITY_BADGES = [
  { icon: FileDown, label: 'PDF' },
  { icon: FileText, label: 'DOCX' },
  { icon: Presentation, label: 'PPTX' },
  { icon: Mail, label: 'Email' },
  { icon: Share2, label: 'Share' },
  { icon: Clock, label: 'Schedule' },
  { icon: ImageIcon, label: 'Infographic' },
]

// INTENT: Static mockup thumbnails give users a taste of what report sections look like
const PREVIEW_SECTIONS = [
  { icon: AlignLeft, label: 'Executive Summary', color: 'bg-info/10' },
  { icon: TrendingUp, label: 'Key Metrics', color: 'bg-success/10' },
  { icon: BarChart3, label: 'Completion Trend', color: 'bg-warning/10' },
  { icon: Target, label: 'Objectives', color: 'bg-international-orange/10' },
]

interface ReportsHeroShowcaseProps {
  onQuickStart: (templateId: ReportTemplateId) => void
}

export function ReportsHeroShowcase({ onQuickStart }: ReportsHeroShowcaseProps) {
  return (
    <div className="space-y-8">
      {/* Quick-start cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {QUICK_START_ACTIONS.map(action => {
          const Icon = action.icon
          return (
            <Card
              key={action.id}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.99]"
              onClick={() => onQuickStart(action.id as ReportTemplateId)}
            >
              <CardContent className="p-5">
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', action.accent)}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-display font-semibold text-foreground">
                  {action.label}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {action.description}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Visual preview strip */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          What your reports include
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {PREVIEW_SECTIONS.map(section => {
            const Icon = section.icon
            return (
              <div
                key={section.label}
                className="rounded-xl border border-border bg-card p-4 space-y-3"
              >
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', section.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-xs font-medium text-foreground">{section.label}</p>
                {/* Placeholder text lines */}
                <div className="space-y-1.5">
                  <div className="h-1.5 w-full rounded-full bg-muted" />
                  <div className="h-1.5 w-4/5 rounded-full bg-muted" />
                  <div className="h-1.5 w-3/5 rounded-full bg-muted" />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Capability badges */}
      <div className="flex flex-wrap items-center gap-2">
        {CAPABILITY_BADGES.map(cap => {
          const Icon = cap.icon
          return (
            <Badge key={cap.label} variant="secondary" className="gap-1.5 px-2.5 py-1 text-xs font-normal">
              <Icon className="h-3 w-3" />
              {cap.label}
            </Badge>
          )
        })}
      </div>
    </div>
  )
}
