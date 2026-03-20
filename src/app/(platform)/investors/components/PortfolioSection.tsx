/**
 * @file PortfolioSection.tsx
 *
 * @description Grid of portfolio companies with sector, stage, and amount.
 * Renders as a card section within the investor detail page.
 */

import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Briefcase } from 'lucide-react'

interface PortfolioCompany {
  company_name: string
  sector?: string | null
  stage?: string | null
  amount_usd?: number | null
  description?: string | null
  why_appealing?: string | null
}

interface PortfolioSectionProps {
  companies: PortfolioCompany[]
}

function formatAmount(usd: number): string {
  if (usd >= 1_000_000) {
    const m = usd / 1_000_000
    return `$${m % 1 === 0 ? m : m.toFixed(1)}M`
  }
  if (usd >= 1_000) {
    return `$${Math.round(usd / 1_000)}K`
  }
  return `$${usd.toLocaleString()}`
}

export function PortfolioSection({ companies }: PortfolioSectionProps) {
  if (companies.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          Portfolio ({companies.length})
        </h2>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {companies.map((company) => (
            <div key={company.company_name} className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{company.company_name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {company.sector && (
                      <Badge variant="secondary" className="text-xs">{company.sector}</Badge>
                    )}
                    {company.stage && (
                      <Badge variant="outline" className="text-xs">{company.stage}</Badge>
                    )}
                  </div>
                </div>
                {company.amount_usd != null && company.amount_usd > 0 && (
                  <span className="text-sm font-semibold text-foreground shrink-0">
                    {formatAmount(company.amount_usd)}
                  </span>
                )}
              </div>
              {company.description && (
                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{company.description}</p>
              )}
              {company.why_appealing && (
                <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">{company.why_appealing}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
