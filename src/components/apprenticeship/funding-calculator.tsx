'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Calculator, PoundSterling, TrendingDown, Building2 } from 'lucide-react'

/**
 * UK Apprenticeship funding bands by level (2025/26 rates).
 * These represent the maximum government funding available per programme.
 */
const FUNDING_BANDS: Record<number, { max: number; label: string }> = {
  3: { max: 9000, label: 'Level 3 (Advanced)' },
  4: { max: 12000, label: 'Level 4 (Higher)' },
  5: { max: 15000, label: 'Level 5 (Foundation Degree)' },
  6: { max: 22000, label: 'Level 6 (Degree)' },
  7: { max: 27000, label: 'Level 7 (Masters)' },
}

type CompanySize = 'sme' | 'levy'

interface FundingCalculatorProps {
  className?: string
}

/**
 * Interactive UK Apprenticeship funding calculator.
 *
 * @description Helps employers understand the true cost of hiring an apprentice
 * by calculating government contributions, co-investment amounts, and monthly costs
 * based on company size and programme level.
 */
export function FundingCalculator({ className }: FundingCalculatorProps) {
  const [companySize, setCompanySize] = useState<CompanySize>('sme')
  const [level, setLevel] = useState<number>(4)

  const band = FUNDING_BANDS[level]
  const totalCost = band.max
  const isSME = companySize === 'sme'

  // SMEs pay 5% co-investment; levy payers draw from levy pot
  const govContribution = isSME ? Math.round(totalCost * 0.95) : totalCost
  const employerCost = isSME ? totalCost - govContribution : 0
  const durationMonths = level <= 4 ? 24 : 36
  const monthlyCost = Math.round(employerCost / durationMonths)

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calculator className="h-5 w-5 text-international-orange" />
          Funding Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="company-size">Company Size</Label>
            <Select value={companySize} onValueChange={(v) => setCompanySize(v as CompanySize)}>
              <SelectTrigger id="company-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sme">SME (pay bill under £3m)</SelectItem>
                <SelectItem value="levy">Levy Payer (pay bill £3m+)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="programme-level">Programme Level</Label>
            <Select value={String(level)} onValueChange={(v) => setLevel(Number(v))}>
              <SelectTrigger id="programme-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FUNDING_BANDS).map(([lvl, info]) => (
                  <SelectItem key={lvl} value={lvl}>
                    {info.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-muted rounded-xl text-center">
            <PoundSterling className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xl font-bold text-foreground">
              £{totalCost.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Training Cost</p>
          </div>

          <div className="p-4 bg-status-success-light rounded-xl text-center">
            <TrendingDown className="h-5 w-5 mx-auto text-status-success mb-1" />
            <p className="text-xl font-bold text-status-success">
              £{govContribution.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Gov. Funded</p>
          </div>

          <div className="p-4 bg-muted rounded-xl text-center">
            <Building2 className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xl font-bold text-foreground">
              {isSME ? `£${employerCost.toLocaleString()}` : '£0'}
            </p>
            <p className="text-xs text-muted-foreground">Your Cost</p>
          </div>

          <div className="p-4 bg-international-orange/10 rounded-xl text-center">
            <Calculator className="h-5 w-5 mx-auto text-international-orange mb-1" />
            <p className="text-xl font-bold text-international-orange">
              £{monthlyCost}/mo
            </p>
            <p className="text-xs text-muted-foreground">Monthly Cost</p>
          </div>
        </div>

        {/* Explanation */}
        <div className="p-4 bg-muted/50 rounded-lg">
          {isSME ? (
            <p className="text-sm text-muted-foreground">
              <Badge variant="success" className="mr-2">95% Funded</Badge>
              As an SME, the government covers 95% of apprenticeship training costs.
              You co-invest just 5% — that&apos;s <strong className="text-foreground">£{employerCost.toLocaleString()}</strong> over {durationMonths} months.
              Additional incentive payments of £1,000 may also apply.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Badge variant="info" className="mr-2">Levy Funded</Badge>
              As a levy-paying employer, training costs come from your existing Apprenticeship Levy pot.
              No additional cost — you&apos;re already paying the levy.
              Unspent levy funds expire after 24 months.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
