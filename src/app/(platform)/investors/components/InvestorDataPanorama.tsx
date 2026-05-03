/**
 * InvestorDataPanorama — surfaces populated attributes NOT already shown
 * by the §-numbered CollapsibleSections, FactStrip, Fund Details card,
 * FundPerformanceSection, PortfolioSection, or verification footer.
 *
 * Previously this rendered "Everything we know about this investor" which
 * duplicated investment thesis, pattern, ideal company profile, value-add,
 * sectors, stage/geo focus, fund size, cheque range, firm type, deployment
 * status, team expertise, connection brief, location, website, LinkedIn,
 * Twitter, portfolio companies, data quality score, hardware fit, last
 * verified, last synced, and data source — all shown in sections above.
 *
 * Now only surfaces supplementary fields not rendered elsewhere.
 */

import React from 'react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatFundSize } from '@/lib/format'
import { ExternalLink, Mail } from 'lucide-react'
import type { InvestorFirm } from '@/actions/investors'

interface Props {
  firm: InvestorFirm
}

export function InvestorDataPanorama({ firm }: Props) {
  const attrs = firm.attributes

  if (!attrs || Object.keys(attrs).length === 0) return null

  type Item = { label: string; value: React.ReactNode }

  // ── Render helpers ─────────────────────────────────────────────────────────

  const arrChips = (arr: unknown, cap?: number): React.ReactNode | null => {
    if (!Array.isArray(arr) || arr.length === 0) return null
    const limited = cap ? (arr as unknown[]).slice(0, cap) : (arr as unknown[])
    const overflow = cap && arr.length > cap ? arr.length - cap : 0
    return (
      <div className="flex flex-wrap gap-1.5">
        {limited.map((v, i) => {
          const text =
            typeof v === 'string'
              ? v
              : (v as { name?: string; company_name?: string })?.company_name ??
                (v as { name?: string })?.name ??
                JSON.stringify(v)
          if (!text) return null
          return (
            <span
              key={i}
              className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-foreground"
            >
              {text}
            </span>
          )
        })}
        {overflow > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            +{overflow} more
          </span>
        )}
      </div>
    )
  }

  const txt = (v: unknown): React.ReactNode | null => {
    if (v == null || v === '') return null
    return <span className="text-sm text-foreground">{String(v)}</span>
  }

  const bool = (v: unknown, trueLabel: string): React.ReactNode | null => {
    if (v == null) return null
    return v ? (
      <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium">
        ✓ {trueLabel}
      </span>
    ) : null
  }

  const mailLink = (email: unknown): React.ReactNode | null => {
    if (!email || typeof email !== 'string') return null
    return (
      <a
        href={`mailto:${email}`}
        className="text-international-orange hover:underline text-sm inline-flex items-center gap-1"
      >
        <Mail className="h-3 w-3" />
        {email}
      </a>
    )
  }

  const extraAttrs = attrs as unknown as Record<string, unknown>

  // ── Fund profile (only fields NOT in Fund Details card / FactStrip) ─────
  const fund: Item[] = []

  const aumGbp = extraAttrs.aum_gbp
  if (typeof aumGbp === 'number') {
    const aumLabel = formatFundSize(aumGbp) ?? `£${aumGbp.toLocaleString()}`
    fund.push({
      label: 'Assets under management',
      value: <span className="text-base font-bold text-foreground">{aumLabel}</span>,
    })
  }

  const fundTier = extraAttrs.fund_tier
  if (fundTier) {
    fund.push({
      label: 'Fund tier',
      value: (
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground font-medium">
          {String(fundTier)}
        </span>
      ),
    })
  }

  const foundingYear = extraAttrs.founding_year
  if (typeof foundingYear === 'number') {
    fund.push({
      label: 'Founded',
      value: <span className="text-sm font-semibold text-foreground">{foundingYear} <span className="text-xs text-muted-foreground font-normal">({new Date().getFullYear() - foundingYear} years)</span></span>,
    })
  }

  const lastFundClose = extraAttrs.last_fund_close_date
  if (lastFundClose && typeof lastFundClose === 'string') {
    const d = new Date(lastFundClose)
    if (!isNaN(d.getTime())) {
      fund.push({
        label: 'Last fund close',
        value: <span className="text-sm text-foreground">{d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>,
      })
    } else {
      const lt = txt(lastFundClose)
      if (lt) fund.push({ label: 'Last fund close', value: lt })
    }
  }

  // ── Company details (only fields NOT in header / FactStrip) ────────────
  const company: Item[] = []

  const incDate = extraAttrs.incorporation_date
  if (incDate && typeof incDate === 'string') {
    const d = new Date(incDate)
    const year = !isNaN(d.getTime()) ? d.getFullYear() : parseInt(incDate, 10)
    if (!isNaN(year)) {
      company.push({ label: 'Established', value: <span className="text-sm text-foreground">{year}</span> })
    }
  }

  const regAddress = txt(extraAttrs.registered_address)
  if (regAddress) company.push({ label: 'Registered address', value: regAddress })

  const notablePortfolio = extraAttrs.notable_portfolio
  const notableChips = arrChips(notablePortfolio, 15)
  if (notableChips) company.push({ label: 'Notable portfolio', value: notableChips })

  const contactEmailLink = mailLink(extraAttrs.contact_email ?? attrs.contact_email)
  if (contactEmailLink) company.push({ label: 'Contact email', value: contactEmailLink })

  // ── Trust & provenance (only fields NOT in verification footer) ────────
  const trust: Item[] = []

  const bvcaBadge = bool(extraAttrs.bvca_member, 'BVCA member')
  if (bvcaBadge) trust.push({ label: 'Industry membership', value: bvcaBadge })

  const memberType = txt(extraAttrs.member_type)
  if (memberType) trust.push({ label: 'Member type', value: memberType })

  const chNumber = extraAttrs.companies_house_number
  if (chNumber && typeof chNumber === 'string') {
    trust.push({
      label: 'Companies House',
      value: (
        <a
          href={`https://find-and-update.company-information.service.gov.uk/company/${chNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-international-orange hover:underline text-sm inline-flex items-center gap-1"
        >
          {chNumber} <ExternalLink className="h-3 w-3" />
        </a>
      ),
    })
  }

  const confidenceTier = txt(extraAttrs.confidence_tier)
  if (confidenceTier) trust.push({ label: 'Confidence tier', value: confidenceTier })

  const thesisAccuracy = txt(extraAttrs.thesis_accuracy)
  if (thesisAccuracy) trust.push({ label: 'Thesis accuracy', value: thesisAccuracy })

  const factCheck = txt(attrs.fact_check_status)
  if (factCheck) trust.push({ label: 'Fact-check status', value: factCheck })

  const urlVerifiedBadge = bool(extraAttrs.url_verified, 'URL verified')
  if (urlVerifiedBadge) trust.push({ label: 'URL verification', value: urlVerifiedBadge })

  const lastEnriched = extraAttrs.last_enriched
  if (lastEnriched && typeof lastEnriched === 'string') {
    const d = new Date(lastEnriched)
    if (!isNaN(d.getTime())) {
      trust.push({
        label: 'Last enriched',
        value: (
          <span className="text-sm text-muted-foreground">
            {d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        ),
      })
    }
  }

  // ── Assemble sections, drop empty ones ────────────────────────────────────
  const sections: Array<{ title: string; items: Item[] }> = [
    { title: 'Fund profile', items: fund },
    { title: 'Company details', items: company },
    { title: 'Trust & provenance', items: trust },
  ].filter((s) => s.items.length > 0)

  if (sections.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold">Additional Details</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Supplementary data not shown in the sections above. Empty fields hidden automatically.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {sections.map((s) => (
          <div key={s.title}>
            <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {s.title}
            </h4>
            <dl className="flex flex-col gap-y-3">
              {s.items.map((item, i) => (
                <div key={i} className="border-l-2 border-border pl-3">
                  <dt className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    {item.label}
                  </dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
