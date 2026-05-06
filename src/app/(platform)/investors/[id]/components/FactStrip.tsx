/**
 * @file FactStrip.tsx
 *
 * @description Three inline fact cards at the top of the investor detail page.
 * Server component — no "use client" needed. Shows:
 *   1. Key Facts — fund size, cheque range
 *   2. Focus — stage focus, sector tags, geographic focus
 *   3. Provenance — website, LinkedIn, headquarters, last verified date
 *
 * Data comes from firm.attributes (the JSONB attributes column on
 * marketplace_listings). Adapted from forge-capital-app's investor modal
 * layout to ForgeOS's Tailwind + shadcn design system.
 */

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  CheckCircle2,
  Circle,
  Globe,
  Linkedin,
  MapPin,
} from 'lucide-react'

interface FactStripProps {
  attrs: {
    fund_size_gbp?: number
    aum_gbp?: number
    cheque_range_gbp?: { min: number | null; max: number | null }
    stage_focus?: string[]
    sectors?: string[]
    geo_focus?: string[]
    website_url?: string
    linkedin_company_url?: string
    hq_city?: string
    last_verified?: string
  }
  fundSizeLabel: string | null
  aumLabel: string | null
  chequeRangeLabel?: string
}

function ensureProtocol(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  // SECURITY: Block non-http(s) schemes (javascript:, data:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return ''
  return `https://${url}`
}

export function FactStrip({ attrs, fundSizeLabel, aumLabel }: FactStripProps) {
  const hasCheque = attrs.cheque_range_gbp && (attrs.cheque_range_gbp.min != null || attrs.cheque_range_gbp.max != null)
  const hasKeyFacts = fundSizeLabel || hasCheque
  const hasFocus = (attrs.stage_focus && attrs.stage_focus.length > 0) ||
    (Array.isArray(attrs.sectors) && attrs.sectors.length > 0) ||
    (attrs.geo_focus && attrs.geo_focus.length > 0)
  const hasProvenance = attrs.website_url || attrs.linkedin_company_url || attrs.hq_city || attrs.last_verified

  // Don't render the strip if there's nothing to show
  if (!hasKeyFacts && !hasFocus && !hasProvenance) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Card 1 — Key Facts */}
      {hasKeyFacts && (
        <Card className="bg-card">
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Key Facts</p>

            {fundSizeLabel && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Fund Size</p>
                <p className="text-sm font-semibold text-foreground">{fundSizeLabel}</p>
              </div>
            )}

            {aumLabel && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Assets Under Management</p>
                <p className="text-sm font-semibold text-foreground">{aumLabel}</p>
              </div>
            )}

            {hasCheque && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cheque Range</p>
                <p className="text-sm font-semibold text-foreground">
                  {formatCompact(attrs.cheque_range_gbp!.min)} &mdash; {formatCompact(attrs.cheque_range_gbp!.max)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Card 2 — Focus */}
      {hasFocus && (
        <Card className="bg-card">
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Focus</p>

            {attrs.stage_focus && attrs.stage_focus.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Stage</p>
                <div className="flex flex-wrap gap-1">
                  {attrs.stage_focus.map(s => (
                    <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(attrs.sectors) && attrs.sectors.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Sectors</p>
                <div className="flex flex-wrap gap-1">
                  {attrs.sectors.slice(0, 5).map(s => (
                    <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                  ))}
                  {attrs.sectors.length > 5 && (
                    <Badge variant="outline" className="text-[10px]">+{attrs.sectors.length - 5}</Badge>
                  )}
                </div>
              </div>
            )}

            {attrs.geo_focus && attrs.geo_focus.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Geography</p>
                <div className="flex flex-wrap gap-1">
                  {attrs.geo_focus.map(g => (
                    <Badge key={g} variant="outline" className="text-[10px]">{g}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Card 3 — Provenance */}
      {hasProvenance && (
        <Card className="bg-card">
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Provenance</p>

            {attrs.website_url && ensureProtocol(attrs.website_url) && (
              <a
                href={ensureProtocol(attrs.website_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-international-orange hover:underline"
              >
                <Globe className="h-3.5 w-3.5 shrink-0" />
                Website
              </a>
            )}

            {attrs.linkedin_company_url && ensureProtocol(attrs.linkedin_company_url) && (
              <a
                href={ensureProtocol(attrs.linkedin_company_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-international-orange hover:underline"
              >
                <Linkedin className="h-3.5 w-3.5 shrink-0" />
                LinkedIn
              </a>
            )}

            {attrs.hq_city && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {attrs.hq_city}
              </div>
            )}

            {attrs.last_verified && !isNaN(new Date(attrs.last_verified).getTime()) && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Last Verified</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(attrs.last_verified).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/**
 * Compact currency formatter for the cheque range values.
 * Returns "?" if null/undefined.
 */
function formatCompact(value: number | null | undefined): string {
  if (value == null) return '?'
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `£${(value / 1_000).toFixed(0)}k`
  return `£${value}`
}
