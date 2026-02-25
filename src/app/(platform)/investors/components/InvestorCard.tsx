/**
 * @file InvestorCard.tsx
 *
 * @description Card component for a single investor firm in the directory grid.
 * Displays firm name, subcategory badge, location, fund size, stage focus,
 * sectors, outreach priority/status, and website/LinkedIn links.
 */

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Building2, Globe, Linkedin, MapPin, TrendingUp, CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InvestorFirm } from '@/actions/investors'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a GBP fund size number to a human-readable string.
 * e.g. 500000000 → "£500M", 1500000000 → "£1.5B"
 */
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

/**
 * Maps outreach priority to a Badge variant.
 */
function priorityVariant(priority: string | undefined): 'destructive' | 'warning' | 'secondary' | 'outline' {
  if (priority === 'A') return 'destructive'
  if (priority === 'B') return 'warning'
  if (priority === 'C') return 'secondary'
  return 'outline'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface InvestorCardProps {
  firm: InvestorFirm
}

/**
 * Renders a single investor firm as a card in the directory grid.
 */
// GOTCHA: stage_focus and sectors may be stored as a comma-separated string
// (from CSV import) or as an array (from seeded data). Normalise before use.
function toArray(val: unknown): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val as string[]
  if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

export function InvestorCard({ firm }: InvestorCardProps) {
  const attrs = firm.attributes
  const stageFocus = toArray(attrs.stage_focus).slice(0, 2)
  const sectors = toArray(attrs.sectors).slice(0, 3)

  return (
    <Card className="flex flex-col h-full hover:-translate-y-0.5 active:scale-[0.99] duration-200 transition-all">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <Link
              href={`/investors/${firm.id}`}
              className="text-base font-semibold text-foreground hover:text-international-orange transition-colors line-clamp-2 leading-snug"
            >
              {firm.title}
            </Link>
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
                <Badge variant={priorityVariant(attrs.outreach_priority)} className="text-xs shrink-0">
                  Priority {attrs.outreach_priority}
                </Badge>
              )}
            </div>
          </div>
          {/* Active deploying indicator */}
          <div className="shrink-0 mt-0.5">
            {attrs.is_active_deploying ? (
              <CheckCircle2 className="h-4 w-4 text-success" aria-label="Actively deploying capital" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" aria-label="Not currently deploying" />
            )}
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
          {attrs.fund_size_gbp && (
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
            {toArray(attrs.stage_focus).length > 2 && (
              <span className="text-xs text-muted-foreground">
                +{toArray(attrs.stage_focus).length - 2}
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
            {toArray(attrs.sectors).length > 3 && (
              <span className="text-xs text-muted-foreground self-center">
                +{toArray(attrs.sectors).length - 3}
              </span>
            )}
          </div>
        )}

        {/* Outreach status */}
        {attrs.outreach_status && (
          <p className="text-xs text-muted-foreground">
            Status: <span className="text-foreground font-medium">{attrs.outreach_status}</span>
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
              href={attrs.website_url}
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
              href={attrs.linkedin_company_url}
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
