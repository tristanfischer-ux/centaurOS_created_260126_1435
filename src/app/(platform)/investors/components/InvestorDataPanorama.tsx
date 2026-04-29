/**
 * InvestorDataPanorama — surfaces every populated attribute on an investor
 * firm record in a categorised, auto-skip-empty grid.
 *
 * Council 2026-04-26 + Tristan's direct ask:
 * "the database on suppliers and investors is enormous, no point having lots
 *  of fields if all of those fields are not actually being revealed to the user."
 *
 * Mirrors SupplierDataPanorama in marketplace/[id]/listing-detail.tsx exactly:
 * same Card shell, same four-section grid, same dl/dt/dd layout with border-l-2.
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

  // Bail early if no attributes at all
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

  const link = (url: unknown, label: string): React.ReactNode | null => {
    if (!url || typeof url !== 'string') return null
    const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`
    return (
      <a
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        className="text-international-orange hover:underline text-sm inline-flex items-center gap-1"
      >
        {label} <ExternalLink className="h-3 w-3" />
      </a>
    )
  }

  // Long-text helper — renders as a paragraph block rather than an inline span
  const longTxt = (v: unknown): React.ReactNode | null => {
    if (v == null || v === '') return null
    return <p className="text-sm leading-relaxed text-foreground">{String(v)}</p>
  }

  // mailto link helper
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

  // ── Investment thesis ───────────────────────────────────────────────────────
  const thesis: Item[] = []

  const thesisText = longTxt(attrs.investment_thesis)
  if (thesisText) thesis.push({ label: 'Investment thesis', value: thesisText })

  const patternText = longTxt(attrs.investment_pattern)
  if (patternText) thesis.push({ label: 'Investment pattern', value: patternText })

  const idealText = longTxt(attrs.ideal_company_profile)
  if (idealText) thesis.push({ label: 'Ideal company profile', value: idealText })

  const valueAddText = longTxt(attrs.value_add)
  if (valueAddText) thesis.push({ label: 'Value-add', value: valueAddText })

  const sectorsChips = arrChips(attrs.sectors)
  if (sectorsChips) thesis.push({ label: 'Sector focus', value: sectorsChips })

  const stageChips = arrChips(attrs.stage_focus)
  if (stageChips) thesis.push({ label: 'Stage focus', value: stageChips })

  const geoChips = arrChips(attrs.geo_focus)
  if (geoChips) thesis.push({ label: 'Geographic focus', value: geoChips })

  // ── Fund profile ────────────────────────────────────────────────────────────
  const fund: Item[] = []

  // attributes.aum_gbp — assets under management (44 rows) — render prominently
  const aumGbp = (attrs as unknown as Record<string, unknown>).aum_gbp
  if (typeof aumGbp === 'number') {
    const aumLabel = formatFundSize(aumGbp) ?? `£${aumGbp.toLocaleString()}`
    fund.push({
      label: 'Assets under management',
      value: <span className="text-base font-bold text-foreground">{aumLabel}</span>,
    })
  }

  const fundSizeLabel = formatFundSize(attrs.fund_size_gbp)
  if (fundSizeLabel)
    fund.push({
      label: 'Fund size',
      value: <span className="text-sm font-semibold text-foreground">{fundSizeLabel}</span>,
    })

  if (
    attrs.cheque_range_gbp &&
    (attrs.cheque_range_gbp.min != null || attrs.cheque_range_gbp.max != null)
  ) {
    const lo = formatFundSize(attrs.cheque_range_gbp.min) ?? '?'
    const hi = formatFundSize(attrs.cheque_range_gbp.max) ?? '?'
    fund.push({
      label: 'Cheque range',
      value: (
        <span className="text-sm font-semibold text-foreground">
          {lo} – {hi}
        </span>
      ),
    })
  }

  const firmTypeText = txt(attrs.firm_type)
  if (firmTypeText) fund.push({ label: 'Firm type', value: firmTypeText })

  // attributes.fund_tier — e.g. "Tier 1" (40 rows) — render as a badge
  const fundTier = (attrs as unknown as Record<string, unknown>).fund_tier
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

  // attributes.founding_year (44 rows)
  const foundingYear = (attrs as unknown as Record<string, unknown>).founding_year
  if (typeof foundingYear === 'number') {
    fund.push({
      label: 'Founded',
      value: <span className="text-sm font-semibold text-foreground">{foundingYear} <span className="text-xs text-muted-foreground font-normal">({new Date().getFullYear() - foundingYear} years)</span></span>,
    })
  }

  // attributes.last_fund_close_date (40 rows)
  const lastFundClose = (attrs as unknown as Record<string, unknown>).last_fund_close_date
  if (lastFundClose && typeof lastFundClose === 'string') {
    const d = new Date(lastFundClose)
    if (!isNaN(d.getTime())) {
      fund.push({
        label: 'Last fund close',
        value: <span className="text-sm text-foreground">{d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>,
      })
    } else {
      // Store as plain string if not a parseable date
      const lt = txt(lastFundClose)
      if (lt) fund.push({ label: 'Last fund close', value: lt })
    }
  }

  const activeBadge = bool(attrs.is_active_deploying, 'Actively deploying')
  if (activeBadge) fund.push({ label: 'Deployment status', value: activeBadge })
  else if (attrs.is_active_deploying === false)
    fund.push({ label: 'Deployment status', value: <span className="text-sm text-muted-foreground">Not currently active</span> })

  const fundHistoryText = longTxt(
    typeof attrs.fund_history === 'string' ? attrs.fund_history : null
  )
  if (fundHistoryText) fund.push({ label: 'Fund history', value: fundHistoryText })

  const fundPerfText = longTxt(
    typeof attrs.fund_performance === 'string' ? attrs.fund_performance : null
  )
  if (fundPerfText) fund.push({ label: 'Fund performance', value: fundPerfText })

  const exitsText = longTxt(typeof attrs.exits === 'string' ? attrs.exits : null)
  if (exitsText) fund.push({ label: 'Notable exits', value: exitsText })

  const recentDealsText = longTxt(attrs.recent_deals_summary)
  if (recentDealsText) fund.push({ label: 'Recent deals', value: recentDealsText })

  // ── Team & access ───────────────────────────────────────────────────────────
  const team: Item[] = []

  const teamExpertiseText = longTxt(attrs.team_expertise)
  if (teamExpertiseText) team.push({ label: 'Team expertise', value: teamExpertiseText })

  const connectionText = longTxt(attrs.connection_brief)
  if (connectionText) team.push({ label: 'Connection brief', value: connectionText })

  // Build location from hq_city + hq_country (or fall back to location)
  const hqCountry = (attrs as unknown as Record<string, unknown>).hq_country
  const hqCity = attrs.hq_city ?? attrs.location
  const locationDisplay = hqCity && hqCountry
    ? `${hqCity}, ${hqCountry}`
    : hqCity ?? (hqCountry ? String(hqCountry) : null)
  const locationText = txt(locationDisplay)
  if (locationText) team.push({ label: 'Location', value: locationText })

  // attributes.incorporation_date (502 rows)
  const incDate = (attrs as unknown as Record<string, unknown>).incorporation_date
  if (incDate && typeof incDate === 'string') {
    const d = new Date(incDate)
    const year = !isNaN(d.getTime()) ? d.getFullYear() : parseInt(incDate, 10)
    if (!isNaN(year)) {
      team.push({ label: 'Established', value: <span className="text-sm text-foreground">{year}</span> })
    }
  }

  // attributes.registered_address (502 rows)
  const regAddress = txt((attrs as unknown as Record<string, unknown>).registered_address)
  if (regAddress) team.push({ label: 'Registered address', value: regAddress })

  // attributes.notable_portfolio — array of companies (46 rows) — render as chips
  const notablePortfolio = (attrs as unknown as Record<string, unknown>).notable_portfolio
  const notableChips = arrChips(notablePortfolio, 15)
  if (notableChips) team.push({ label: 'Notable portfolio', value: notableChips })

  const websiteLink = link(attrs.website_url, 'Visit website')
  if (websiteLink) team.push({ label: 'Website', value: websiteLink })

  const linkedinLink = link(attrs.linkedin_company_url, 'View LinkedIn')
  if (linkedinLink) team.push({ label: 'LinkedIn', value: linkedinLink })

  const twitterLink = link(attrs.twitter_company_url, 'View on X')
  if (twitterLink) team.push({ label: 'X (Twitter)', value: twitterLink })

  const twitterBioText = txt(attrs.twitter_company_bio)
  if (twitterBioText) team.push({ label: 'X bio', value: twitterBioText })

  const portfolioChips = arrChips(attrs.portfolio_companies, 20)
  if (portfolioChips) team.push({ label: 'Portfolio companies', value: portfolioChips })

  // ── Trust & data quality ────────────────────────────────────────────────────
  const trust: Item[] = []

  // Fields not in the typed interface — stored as freeform JSONB
  const extraAttrs = attrs as unknown as Record<string, unknown>

  // attributes.bvca_member — boolean (542 rows) — render as chip when true
  const bvcaBadge = bool(extraAttrs.bvca_member, 'BVCA member')
  if (bvcaBadge) trust.push({ label: 'Industry membership', value: bvcaBadge })

  // attributes.member_type — text (502 rows)
  const memberType = txt(extraAttrs.member_type)
  if (memberType) trust.push({ label: 'Member type', value: memberType })

  // attributes.companies_house_number — link to Companies House (502 rows)
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

  // attributes.outreach_status — text (542 rows)
  const outreachStatus = txt(extraAttrs.outreach_status)
  if (outreachStatus) trust.push({ label: 'Outreach status', value: outreachStatus })

  // attributes.contact_email — mailto link (26 rows)
  const contactEmailLink = mailLink(extraAttrs.contact_email ?? attrs.contact_email)
  if (contactEmailLink) trust.push({ label: 'Contact email', value: contactEmailLink })

  // data_quality_score: stored 0-100 on investor records (same as supplier)
  const dqs = attrs.data_quality_score
  if (typeof dqs === 'number') {
    const colour = dqs >= 80 ? 'text-success' : dqs >= 50 ? 'text-warning' : 'text-destructive'
    trust.push({
      label: 'Data quality score',
      value: <span className={cn('text-sm font-semibold tabular-nums', colour)}>{dqs} / 100</span>,
    })
  }

  // hardware_fit_score: stored 0-10
  const hfs = attrs.hardware_fit_score
  if (typeof hfs === 'number') {
    const hfsColour =
      hfs >= 8 ? 'text-success' : hfs >= 5 ? 'text-warning' : 'text-destructive'
    trust.push({
      label: 'Hardware fit score',
      value: (
        <span className={cn('text-sm font-semibold tabular-nums', hfsColour)}>
          {Number(hfs).toFixed(1)} / 10
        </span>
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

  // attributes.last_verified — date (590 rows)
  const lastVerified = extraAttrs.last_verified ?? attrs.last_verified
  if (lastVerified && typeof lastVerified === 'string') {
    const d = new Date(lastVerified)
    if (!isNaN(d.getTime())) {
      trust.push({
        label: 'Last verified',
        value: (
          <span className="text-sm text-muted-foreground">
            {d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        ),
      })
    }
  }

  // attributes.last_enriched — date (12 rows)
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

  if (attrs.last_synced) {
    const d = new Date(attrs.last_synced)
    if (!isNaN(d.getTime())) {
      trust.push({
        label: 'Last synced',
        value: (
          <span className="text-sm text-muted-foreground">
            {d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        ),
      })
    }
  }

  const dataSource = txt(
    typeof attrs.data_source === 'string'
      ? attrs.data_source.replace(/_/g, ' ')
      : null
  )
  if (dataSource) trust.push({ label: 'Data source', value: dataSource })

  // ── Assemble sections, drop empty ones ────────────────────────────────────
  const sections: Array<{ title: string; items: Item[] }> = [
    { title: 'Investment thesis', items: thesis },
    { title: 'Fund profile', items: fund },
    { title: 'Team & access', items: team },
    { title: 'Trust & data quality', items: trust },
  ].filter((s) => s.items.length > 0)

  if (sections.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold">Everything we know about this investor</h3>
        <p className="text-xs text-muted-foreground mt-1">
          All fields populated for this record. Empty fields hidden automatically.
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
