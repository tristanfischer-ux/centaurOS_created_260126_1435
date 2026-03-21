/**
 * @file InvestorCard.tsx
 *
 * @description Card component for a single investor firm in the directory grid.
 * Displays firm name, subcategory badge, location, fund size, stage focus,
 * sectors, quality indicator, match score badge, shortlist heart, and compare checkbox.
 */

'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Building2, Globe, Linkedin, MapPin, TrendingUp, CheckCircle2, Circle, Briefcase, Heart, GitCompare } from 'lucide-react'
import { MatchScoreBadge } from './MatchScoreBadge'
import { cn } from '@/lib/utils'
import { formatFundSize } from '@/lib/format'
import type { InvestorFirm } from '@/actions/investors'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureProtocol(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  // SECURITY: Block non-http(s) schemes (javascript:, data:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return ''
  return `https://${url}`
}

function priorityVariant(priority: string | undefined): 'destructive' | 'warning' | 'secondary' | 'outline' {
  if (priority === 'A') return 'destructive'
  if (priority === 'B') return 'warning'
  if (priority === 'C') return 'secondary'
  return 'outline'
}

const PRIORITY_DESCRIPTIONS: Record<string, string> = {
  A: 'High priority — top-tier, actively deploying, most relevant',
  B: 'Medium priority — strong investor, good deployment history',
  C: 'Lower priority — secondary-tier or niche focus',
}

function formatStatus(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function qualityDotClass(score: number | undefined): string | null {
  if (score == null) return null
  if (score >= 9) return 'bg-success'
  if (score >= 7) return 'bg-warning'
  return 'bg-muted-foreground'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface InvestorCardProps {
  firm: InvestorFirm
  matchScore?: number
  isShortlisted?: boolean
  onToggleShortlist?: () => void
  isCompareSelected?: boolean
  onToggleCompare?: () => void
}

export function InvestorCard({
  firm,
  matchScore,
  isShortlisted,
  onToggleShortlist,
  isCompareSelected,
  onToggleCompare,
}: InvestorCardProps) {
  const attrs = firm.attributes
  const stageFocus = (attrs.stage_focus ?? []).slice(0, 2)
  const sectors = (attrs.sectors ?? []).slice(0, 3)
  const qualityClass = qualityDotClass(attrs.data_quality_score)
  const portfolioCount = attrs.portfolio_companies?.length ?? 0
  const fundSizeLabel = formatFundSize(attrs.fund_size_gbp)

  return (
    <Card className="flex flex-col h-full hover:-translate-y-0.5 active:scale-[0.99] duration-200 transition-all group relative">
      {/* Compare checkbox — shown on hover */}
      {onToggleCompare && (
        <button
          onClick={(e) => { e.preventDefault(); onToggleCompare() }}
          className={cn(
            'absolute top-3 left-3 z-10 h-5 w-5 rounded border flex items-center justify-center transition-all',
            isCompareSelected
              ? 'bg-foreground border-foreground text-background'
              : 'border-border bg-background opacity-0 group-hover:opacity-100'
          )}
          aria-label={isCompareSelected ? 'Remove from compare' : 'Add to compare'}
        >
          {isCompareSelected && <GitCompare className="h-3 w-3" />}
        </button>
      )}

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {qualityClass && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${qualityClass}`} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Data quality: {attrs.data_quality_score?.toFixed(1)}/10</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <Link
                href={`/investors/${firm.id}`}
                className="text-base font-semibold text-foreground hover:text-international-orange transition-colors line-clamp-2 leading-snug"
              >
                {firm.title}
              </Link>
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {firm.subcategory && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  {firm.subcategory}
                </Badge>
              )}
              {attrs.firm_type && (
                <Badge variant="outline" className="text-xs shrink-0">
                  {attrs.firm_type}
                </Badge>
              )}
              {attrs.outreach_priority && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant={priorityVariant(attrs.outreach_priority)} className="text-xs shrink-0 cursor-help">
                        Priority {attrs.outreach_priority}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{PRIORITY_DESCRIPTIONS[attrs.outreach_priority] ?? 'Outreach priority level'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
          {/* Match score + shortlist + active deploying */}
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            {matchScore != null && <MatchScoreBadge score={matchScore} />}
            {onToggleShortlist && (
              <button
                onClick={(e) => { e.preventDefault(); onToggleShortlist() }}
                className={cn(
                  'p-1 rounded-full transition-colors',
                  isShortlisted
                    ? 'text-international-orange'
                    : 'text-muted-foreground hover:text-international-orange'
                )}
                aria-label={isShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
              >
                <Heart className={cn('h-4 w-4', isShortlisted && 'fill-current')} />
              </button>
            )}
            {attrs.is_active_deploying && (
              <span className="flex items-center gap-1 text-success">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="text-[10px] font-semibold uppercase tracking-wide">Active</span>
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 pb-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {attrs.hq_city && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {attrs.hq_city}
            </span>
          )}
          {fundSizeLabel && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              {fundSizeLabel}
            </span>
          )}
        </div>

        {firm.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{firm.description}</p>
        )}

        {stageFocus.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {stageFocus.map(s => (
              <Badge key={s} variant="outline" className="text-xs">
                {s}
              </Badge>
            ))}
            {(attrs.stage_focus ?? []).length > 2 && (
              <span className="text-xs text-muted-foreground">
                +{(attrs.stage_focus ?? []).length - 2}
              </span>
            )}
          </div>
        )}

        {sectors.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {sectors.map(s => (
              <Badge key={s} variant="secondary" className="text-xs">
                {s}
              </Badge>
            ))}
            {(attrs.sectors ?? []).length > 3 && (
              <span className="text-xs text-muted-foreground self-center">
                +{(attrs.sectors ?? []).length - 3}
              </span>
            )}
          </div>
        )}

        {portfolioCount > 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Briefcase className="h-3 w-3" />
            {portfolioCount} investment{portfolioCount !== 1 ? 's' : ''}
          </p>
        )}

        {attrs.outreach_status && attrs.outreach_status !== 'not_started' && (
          <p className="text-xs text-muted-foreground">
            Status: <span className="text-foreground font-medium">{formatStatus(attrs.outreach_status)}</span>
          </p>
        )}
      </CardContent>

      <CardFooter className="pt-0 flex items-center justify-between gap-2">
        <Link
          href={`/investors/${firm.id}`}
          className="text-xs text-international-orange font-medium hover:underline"
        >
          View profile →
        </Link>
        <div className="flex items-center gap-2">
          {attrs.website_url && ensureProtocol(attrs.website_url) && (
            <a
              href={ensureProtocol(attrs.website_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={`${firm.title} website`}
            >
              <Globe className="h-3.5 w-3.5" />
            </a>
          )}
          {attrs.linkedin_company_url && ensureProtocol(attrs.linkedin_company_url) && (
            <a
              href={ensureProtocol(attrs.linkedin_company_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={`${firm.title} LinkedIn`}
            >
              <Linkedin className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}
