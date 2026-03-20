/**
 * @file InvestorCard.tsx
 *
 * @description Card component for a single investor firm in the directory grid.
 * Displays firm name, subcategory badge, location, fund size, stage focus,
 * sectors, quality indicator, partner/portfolio counts, and links.
 */

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Building2, Globe, Linkedin, MapPin, TrendingUp, CheckCircle2, Circle, Users, Briefcase } from 'lucide-react'
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

function formatFundSize(gbp: number): string {
  if (gbp >= 1_000_000_000) {
    const b = gbp / 1_000_000_000
    return `£${b % 1 === 0 ? b : b.toFixed(1)}B`
  }
  if (gbp >= 1_000_000) {
    const m = gbp / 1_000_000
    return `£${m % 1 === 0 ? m : m.toFixed(0)}M`
  }
  return `£${gbp.toLocaleString()}`
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

/**
 * Returns a CSS class for the quality indicator dot.
 * green: 9+, amber: 7-8.9, no dot for lower (shouldn't be pushed).
 */
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
}

export function InvestorCard({ firm }: InvestorCardProps) {
  const attrs = firm.attributes
  const stageFocus = (attrs.stage_focus ?? []).slice(0, 2)
  const sectors = (attrs.sectors ?? []).slice(0, 3)
  const qualityClass = qualityDotClass(attrs.data_quality_score)
  const portfolioCount = attrs.portfolio_companies?.length ?? 0

  return (
    <Card className="flex flex-col h-full hover:-translate-y-0.5 active:scale-[0.99] duration-200 transition-all">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {/* Quality indicator dot */}
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
          {/* Active deploying indicator */}
          <div className="shrink-0 mt-0.5">
            {attrs.is_active_deploying != null && (attrs.is_active_deploying ? (
              <span className="flex items-center gap-1 text-success">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="text-[10px] font-semibold uppercase tracking-wide">Active</span>
              </span>
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" aria-label="Not currently deploying" />
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 pb-3">
        {/* Location + Fund Size */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {attrs.hq_city && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {attrs.hq_city}
            </span>
          )}
          {attrs.fund_size_gbp != null && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              {formatFundSize(attrs.fund_size_gbp)}
            </span>
          )}
        </div>

        {/* Description snippet */}
        {firm.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{firm.description}</p>
        )}

        {/* Stage focus */}
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

        {/* Sectors */}
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

        {/* Portfolio + partner counts */}
        {portfolioCount > 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Briefcase className="h-3 w-3" />
            {portfolioCount} investment{portfolioCount !== 1 ? 's' : ''}
          </p>
        )}

        {/* Outreach status */}
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
          {attrs.website_url && (
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
          {attrs.linkedin_company_url && (
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
