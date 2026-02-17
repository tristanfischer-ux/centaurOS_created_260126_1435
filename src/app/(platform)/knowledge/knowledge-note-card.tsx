'use client'

/**
 * KnowledgeNoteCard — A single note in the knowledge grid.
 *
 * @description Displays a knowledge note with its type badge, title, description,
 * metadata (specialist, connections, confidence), and quick actions (pin, verify, archive).
 *
 * @component
 */

import React from 'react'
import {
  Pin,
  CheckCircle2,
  Eye,
  Link2,
  Archive,
  Quote,
  Gavel,
  Lightbulb,
  Heart,
  GraduationCap,
  MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { KnowledgeNoteSummary, KnowledgeDomain, KnowledgeNoteType } from '@/lib/knowledge-vault/types'

// ─── Type styling ────────────────────────────────────────────────────

const TYPE_STYLES: Record<KnowledgeNoteType, {
  icon: React.ReactNode
  label: string
  badgeClass: string
  borderClass: string
}> = {
  claim: {
    icon: <Quote className="h-3 w-3" />,
    label: 'Claim',
    badgeClass: 'bg-status-info-light text-status-info-dark',
    borderClass: 'border-l-status-info',
  },
  decision: {
    icon: <Gavel className="h-3 w-3" />,
    label: 'Decision',
    badgeClass: 'bg-status-warning-light text-status-warning-dark',
    borderClass: 'border-l-status-warning',
  },
  insight: {
    icon: <Lightbulb className="h-3 w-3" />,
    label: 'Insight',
    badgeClass: 'bg-chart-5/10 text-chart-5',
    borderClass: 'border-l-chart-5',
  },
  fact: {
    icon: <CheckCircle2 className="h-3 w-3" />,
    label: 'Fact',
    badgeClass: 'bg-status-success-light text-status-success-dark',
    borderClass: 'border-l-status-success',
  },
  preference: {
    icon: <Heart className="h-3 w-3" />,
    label: 'Preference',
    badgeClass: 'bg-chart-6/10 text-chart-6',
    borderClass: 'border-l-chart-6',
  },
  lesson: {
    icon: <GraduationCap className="h-3 w-3" />,
    label: 'Lesson',
    badgeClass: 'bg-orange-50 text-international-orange',
    borderClass: 'border-l-international-orange',
  },
  observation: {
    icon: <Eye className="h-3 w-3" />,
    label: 'Observation',
    badgeClass: 'bg-muted text-muted-foreground',
    borderClass: 'border-l-muted-foreground',
  },
}

// Specialist display names (abbreviated)
const SPECIALIST_NAMES: Record<string, string> = {
  'strategist': 'Sage',
  'cto': 'Max',
  'vp-engineering': 'Jian',
  'vp-manufacturing': 'Fang',
  'vp-supply-chain': 'Chase',
  'product-lead': 'Priya',
  'growth-marketer': 'Mia',
  'sales-lead': 'Sal',
  'chief-of-staff': 'Cal',
  'finance-lead': 'Finn',
  'fundraising-advisor': 'Fiona',
  'hiring-team': 'Harper',
  'legal-counsel': 'Leo',
}

interface KnowledgeNoteCardProps {
  /** The note to display */
  note: KnowledgeNoteSummary
  /** Available domains for showing domain name */
  domains: KnowledgeDomain[]
  /** Called when the card is clicked (opens detail) */
  onClick: () => void
  /** Called when pin is toggled */
  onPin: () => void
  /** Called when verify is toggled */
  onVerify: () => void
  /** Called when archive is triggered */
  onArchive: () => void
}

export function KnowledgeNoteCard({
  note,
  domains,
  onClick,
  onPin,
  onVerify,
  onArchive,
}: KnowledgeNoteCardProps) {
  const typeStyle = TYPE_STYLES[note.note_type]
  const domain = note.domain_id ? domains.find((d) => d.id === note.domain_id) : null
  const specialistName = note.source_specialist
    ? SPECIALIST_NAMES[note.source_specialist] ?? note.source_specialist
    : null
  const dateStr = new Date(note.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <Card
      className={cn(
        'group cursor-pointer border-l-4 transition-all duration-200 hover:shadow-md',
        typeStyle.borderClass
      )}
      onClick={onClick}
    >
      <CardContent className="pt-4 pb-3 px-4 space-y-3">
        {/* Top row: type badge + actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
              typeStyle.badgeClass
            )}>
              {typeStyle.icon}
              {typeStyle.label}
            </span>
            {note.is_pinned && (
              <Tooltip>
                <TooltipTrigger>
                  <Pin className="h-3 w-3 text-international-orange fill-international-orange" />
                </TooltipTrigger>
                <TooltipContent>Pinned</TooltipContent>
              </Tooltip>
            )}
            {note.is_verified && (
              <Tooltip>
                <TooltipTrigger>
                  <CheckCircle2 className="h-3 w-3 text-status-success" />
                </TooltipTrigger>
                <TooltipContent>Verified</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Quick actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
                aria-label="Note actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={onPin} className="gap-2 min-h-[44px]">
                <Pin className="h-4 w-4" />
                {note.is_pinned ? 'Unpin' : 'Pin'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onVerify} className="gap-2 min-h-[44px]">
                <CheckCircle2 className="h-4 w-4" />
                {note.is_verified ? 'Unverify' : 'Verify'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onArchive} className="gap-2 min-h-[44px] text-destructive">
                <Archive className="h-4 w-4" />
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {note.title}
        </h3>

        {/* Description */}
        {note.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {note.description}
          </p>
        )}

        {/* Tags */}
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {note.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {note.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{note.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Footer: metadata */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {specialistName && (
              <span className="flex items-center gap-1">
                from {specialistName}
              </span>
            )}
            {domain && (
              <span>{domain.name}</span>
            )}
            <span>{dateStr}</span>
          </div>
          {note.link_count > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Link2 className="h-3 w-3" />
              {note.link_count}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
