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
import { Building2, Globe, Linkedin, MapPin, TrendingUp, CheckCircle2, Briefcase, Heart, GitCompare, Clock } from 'lucide-react'
import { MatchScoreBadge } from './MatchScoreBadge'
import { cn } from '@/lib/utils'
import { formatFundSize } from '@/lib/format'
import type { InvestorFirm } from '@/actions/investors'

// ---------------------------------------------------------------------------
// Date formatting helper
// ---------------------------------------------------------------------------

function formatDateRelative(dateString: string | undefined): string | null {
  if (!dateString) return null
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
    return `${Math.floor(diffDays / 365)}y ago`
  } catch {
    return null
  }
}

function formatChequeRange(cheque: { min: number | null; max: number | null } | undefined): string | null {
  if (!cheque || (cheque.min == null && cheque.max == null)) return null

  const formatValue = (n: number) => {
    if (n >= 1000000) return `£${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `£${(n / 1000).toFixed(0)}K`
    return `£${n}`
  }

  if (cheque.min != null && cheque.max != null) {
    return `${formatValue(cheque.min)}-${formatValue(cheque.max)}`
  }
  // GOTCHA: formatValue already includes £ prefix — don't double it
  if (cheque.min != null) return `${formatValue(cheque.min)}+`
  return `up to ${formatValue(cheque.max!)}`
}

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

/**
 * Returns semantic text color class for quality score display.
 * 8-10: success, 5-7: warning, 0-4: destructive
 */
function qualityScoreColor(score: number | undefined): 'success' | 'warning' | 'destructive' {
  if (score == null) return 'warning'
  if (score >= 8) return 'success'
  if (score >= 5) return 'warning'
  return 'destructive'
}

/** True if value is a non-empty string, non-empty array, or non-null/zero number. */
function hasData(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'object') return Object.keys(v).length > 0
  return Boolean(v)
}

/** True if cheque range has at least one non-null bound. */
function hasChequeRange(cr: { min: number | null; max: number | null } | undefined): boolean {
  return cr != null && (cr.min != null || cr.max != null)
}

/** Count how many key data dimensions are populated (max 5). */
function computeDataDepth(firm: InvestorFirm): number {
  const a = firm.attributes
  let depth = 0
  // 1. Basics: location OR fund size (DD-02: OR not AND — either is valuable)
  if (a.hq_city || (a.fund_size_gbp != null && a.fund_size_gbp !== 0)) depth++
  // 2. Strategy: stage focus or sectors
  if ((a.stage_focus ?? []).length > 0 || (Array.isArray(a.sectors) ? a.sectors.length : 0) > 0) depth++
  // 3. Track record: portfolio companies
  if ((a.portfolio_companies?.length ?? 0) > 0) depth++
  // 4. Intelligence: thesis, geo focus, or cheque range (DD-01: check bounds not just truthy)
  if (a.investment_thesis || (a.geo_focus ?? []).length > 0 || hasChequeRange(a.cheque_range_gbp)) depth++
  // 5. Deep data: fund history, exits, or performance (DD-04: guard against empty objects)
  if (hasData(a.fund_history) || hasData(a.exits) || hasData(a.fund_performance)) depth++
  return depth
}

const DEPTH_LABELS = ['Minimal', 'Basic', 'Good', 'Detailed', 'Rich', 'Comprehensive'] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface InvestorCardProps {
  firm: InvestorFirm
  matchScore?: number
  /** Product fit level: 'strong' (green), 'partial' (amber), or undefined (hidden) */
  productFit?: 'strong' | 'partial'
  isShortlisted?: boolean
  onToggleShortlist?: () => void
  isCompareSelected?: boolean
  onToggleCompare?: () => void
}

export function InvestorCard({
  firm,
  matchScore,
  productFit,
  isShortlisted,
  onToggleShortlist,
  isCompareSelected,
  onToggleCompare,
}: InvestorCardProps) {
  const attrs = firm.attributes
  const stageFocus = (attrs.stage_focus ?? []).slice(0, 2)
  const sectors = (Array.isArray(attrs.sectors) ? attrs.sectors : []).slice(0, 3)
  const qualityClass = qualityDotClass(attrs.data_quality_score)
  const portfolioCount = attrs.portfolio_companies?.length ?? 0
  const fundSizeLabel = formatFundSize(attrs.fund_size_gbp)
  const dataDepth = computeDataDepth(firm)
  // DD-10: Compute URLs once instead of calling ensureProtocol twice per URL
  const websiteHref = attrs.website_url ? ensureProtocol(attrs.website_url) : ''
  const linkedinHref = attrs.linkedin_company_url ? ensureProtocol(attrs.linkedin_company_url) : ''

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
              : 'border-border bg-background sm:opacity-0 sm:group-hover:opacity-100'
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
            {productFit && (
              <Badge
                variant={productFit === 'strong' ? 'success' : 'warning'}
                size="sm"
              >
                {productFit === 'strong' ? 'Product Fit' : 'Partial Fit'}
              </Badge>
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

        {/* Quality Score Bar */}
        {attrs.data_quality_score != null && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Quality</span>
                    <span className={cn(
                      'text-xs font-semibold',
                      qualityScoreColor(attrs.data_quality_score) === 'success' && 'text-success',
                      qualityScoreColor(attrs.data_quality_score) === 'warning' && 'text-warning',
                      qualityScoreColor(attrs.data_quality_score) === 'destructive' && 'text-destructive'
                    )}>
                      {attrs.data_quality_score.toFixed(1)}/10
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        qualityScoreColor(attrs.data_quality_score) === 'success' && 'bg-success',
                        qualityScoreColor(attrs.data_quality_score) === 'warning' && 'bg-warning',
                        qualityScoreColor(attrs.data_quality_score) === 'destructive' && 'bg-destructive'
                      )}
                      style={{ width: `${Math.min((attrs.data_quality_score / 10) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Data quality score: {attrs.data_quality_score.toFixed(1)}/10</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Thesis Snippet */}
        {(attrs.investment_thesis || attrs.ideal_company_profile) && (
          <p className="text-xs text-muted-foreground line-clamp-2 italic">
            "{attrs.investment_thesis || attrs.ideal_company_profile}"
          </p>
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
            {(Array.isArray(attrs.sectors) ? attrs.sectors : []).length > 3 && (
              <span className="text-xs text-muted-foreground self-center">
                +{(Array.isArray(attrs.sectors) ? attrs.sectors : []).length - 3}
              </span>
            )}
          </div>
        )}

        {/* Cheque Range Badge */}
        {formatChequeRange(attrs.cheque_range_gbp) && (
          <div className="flex items-center gap-2">
            <Badge variant="info" className="text-xs">
              {formatChequeRange(attrs.cheque_range_gbp)}
            </Badge>
          </div>
        )}

        {/* Geo Focus Badges */}
        {(attrs.geo_focus ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(attrs.geo_focus ?? []).slice(0, 3).map(geo => (
              <Badge key={geo} variant="outline" className="text-xs">
                {geo}
              </Badge>
            ))}
            {(attrs.geo_focus ?? []).length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{(attrs.geo_focus ?? []).length - 3}
              </Badge>
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

      <CardFooter className="pt-0 flex flex-col gap-2">
        {/* Data freshness indicator */}
        {(attrs.last_synced || attrs.last_verified) && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDateRelative(attrs.last_synced || attrs.last_verified)}
          </div>
        )}

        {/* View profile link + action buttons */}
        <div className="flex items-center justify-between gap-2 w-full">
          <Link
            href={`/investors/${firm.id}`}
            className="text-xs text-international-orange font-medium hover:underline"
          >
            View profile →
          </Link>
          <div className="flex items-center gap-3">
            {/* Data depth indicator — DD-09: hidden when depth is 0 */}
            {dataDepth > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* DD-06: role="meter" for screen readers; DD-07: tabIndex for keyboard focus */}
                    <div
                      className="flex items-center gap-1"
                      role="meter"
                      aria-label="Profile data depth"
                      aria-valuenow={dataDepth}
                      aria-valuemin={0}
                      aria-valuemax={5}
                      aria-valuetext={`${DEPTH_LABELS[dataDepth] ?? 'Unknown'} — ${dataDepth} of 5 data dimensions`}
                      tabIndex={0}
                    >
                      {Array.from({ length: 5 }, (_, i) => (
                        <span
                          key={i}
                          className={cn(
                            'h-1.5 w-2.5 rounded-sm transition-colors',
                            i < dataDepth ? 'bg-international-orange' : 'bg-border'
                          )}
                        />
                      ))}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{DEPTH_LABELS[dataDepth] ?? 'Unknown'} profile — {dataDepth}/5 data dimensions</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {websiteHref && (
              <a
                href={websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={`${firm.title} website`}
              >
                <Globe className="h-3.5 w-3.5" />
              </a>
            )}
            {linkedinHref && (
              <a
                href={linkedinHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={`${firm.title} LinkedIn`}
              >
                <Linkedin className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}
