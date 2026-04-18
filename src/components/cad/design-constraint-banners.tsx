"use client"

/**
 * @file design-constraint-banners.tsx
 *
 * @description Phase VII triggers — auto-surface compliance, lead-time, and
 * MOQ constraint misses as actionable banners that open the design-iteration
 * dialog with the right `triggered_by`.
 *
 * Coverage caveat: supplier DB fill rate for `country` (~58%), `leadTime`
 * (~5%), `minimumOrder` (~2%) means banners will only fire when evidence is
 * present. Missing data yields no banner (not a false positive). This is
 * intentional — a loud false positive destroys founder trust; a silent miss
 * is recoverable via the Source-page "Reconsider" button.
 *
 * Detection logic per banner is deliberately conservative:
 *   - compliance_miss: target-market is a strict export regime (US/EU/UK)
 *     AND ≥1 shortlisted supplier is in an OFAC-stressed country.
 *   - lead_time_exceeded: ≥1 shortlisted supplier parses to >16 weeks.
 *     (No project-level target today; conservative ceiling stands in.)
 *   - moq_mismatch: project batchSize parses to a number N
 *     AND ≥1 shortlisted supplier's MOQ parses to >N.
 */

import React, { useMemo } from "react"
import { ShieldAlert, Clock, Package, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { CadLabSupplierMatch } from "@/actions/cad-lab-supplier-match"
import type { DesignIterationHostHandle } from "@/components/cad/design-iteration-host"

// Countries that trigger US/EU/UK export-control scrutiny on hardware components.
// Conservative: covers OFAC-sanctioned + comprehensively-embargoed jurisdictions.
// Maintained here rather than in a shared file so the list stays auditable in
// context; expand it via sanctions-screen.ts output when that lands.
const OFAC_STRESSED_ISO = new Set([
  "IR", "KP", "SY", "CU", "RU", "BY", "VE",
])

// Target markets that impose export controls strict enough to care about the
// above. Everything else stays out of the compliance banner surface.
const STRICT_EXPORT_REGIMES = new Set(["US", "EU", "UK", "CA"])

// Lead-time ceiling (weeks) above which we surface the lead-time banner.
// Deliberately generous so this only fires on genuinely long-lead parts.
const LEAD_TIME_CEILING_WEEKS = 16

interface Props {
  /** Full supplier-match records (not the thin ShortlistedSupplier) for ALL modules. */
  supplierMatches: Map<string, CadLabSupplierMatch[]>
  /** IDs of suppliers the founder has shortlisted. Filters supplierMatches down. */
  shortlistedSupplierIds: Set<string>
  /**
   * Target market (ISO-2) as selected on the Supply Risk Radar. Gates the
   * compliance banner — an empty target = no compliance claim to miss.
   */
  targetMarket: string | null
  /** Pilot/initial batch size from diagnostic answers. Used for MOQ detection. */
  batchSizeText: string | null
  /** Host ref so banner buttons can open the iteration dialog. */
  hostRef: React.RefObject<DesignIterationHostHandle | null>
}

export function DesignConstraintBanners({
  supplierMatches,
  shortlistedSupplierIds,
  targetMarket,
  batchSizeText,
  hostRef,
}: Props) {
  // Flatten shortlisted suppliers with their full match records. Dedupe by id —
  // the same supplier can match multiple modules and would otherwise be
  // counted twice in the banners.
  const shortlistedFull = useMemo(() => {
    const seen = new Map<string, CadLabSupplierMatch>()
    for (const matches of supplierMatches.values()) {
      for (const m of matches) {
        if (shortlistedSupplierIds.has(m.id) && !seen.has(m.id)) {
          seen.set(m.id, m)
        }
      }
    }
    return [...seen.values()]
  }, [supplierMatches, shortlistedSupplierIds])

  const complianceMiss = useMemo(() => {
    if (!targetMarket || !STRICT_EXPORT_REGIMES.has(targetMarket.toUpperCase())) return null
    const offenders = shortlistedFull.filter((s) => {
      const iso = (s.country ?? "").toUpperCase()
      return iso.length > 0 && OFAC_STRESSED_ISO.has(iso)
    })
    if (offenders.length === 0) return null
    return {
      offenders: offenders.map((s) => ({ id: s.id, name: s.name, country: s.country ?? "" })),
    }
  }, [shortlistedFull, targetMarket])

  const leadTimeExceeded = useMemo(() => {
    const offenders = shortlistedFull
      .map((s) => ({ s, weeks: parseLeadTimeWeeks(s.leadTime) }))
      .filter((x) => x.weeks !== null && x.weeks > LEAD_TIME_CEILING_WEEKS)
    if (offenders.length === 0) return null
    return {
      offenders: offenders.map((x) => ({ id: x.s.id, name: x.s.name, weeks: x.weeks as number })),
    }
  }, [shortlistedFull])

  const moqMismatch = useMemo(() => {
    const batchSize = parseBatchSize(batchSizeText)
    if (batchSize === null) return null
    const offenders = shortlistedFull
      .map((s) => ({ s, moq: parseMoq(s.minimumOrder) }))
      .filter((x) => x.moq !== null && x.moq > batchSize)
    if (offenders.length === 0) return null
    return {
      batchSize,
      offenders: offenders.map((x) => ({ id: x.s.id, name: x.s.name, moq: x.moq as number })),
    }
  }, [shortlistedFull, batchSizeText])

  const hasAny = complianceMiss || leadTimeExceeded || moqMismatch
  if (!hasAny) return null

  return (
    <Card className="p-4 space-y-3 border-warning/40 bg-warning/5">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <AlertTriangle className="h-4 w-4 text-warning" />
        Design constraints flagged on your shortlist
      </div>

      {complianceMiss && (
        <BannerRow
          icon={<ShieldAlert className="h-4 w-4 text-destructive" />}
          title={`Compliance miss — ${complianceMiss.offenders.length} supplier${complianceMiss.offenders.length === 1 ? "" : "s"} in export-stressed country`}
          body={`${complianceMiss.offenders.map((o) => `${o.name} (${o.country})`).join(", ")} may not pass ${targetMarket?.toUpperCase()} export controls.`}
          onReconsider={() => {
            const concernText = `Export-control compliance risk: ${complianceMiss.offenders.length} shortlisted supplier${complianceMiss.offenders.length === 1 ? " is" : "s are"} in OFAC-stressed jurisdictions (${complianceMiss.offenders.map((o) => `${o.name} — ${o.country}`).join("; ")}). Target market ${targetMarket?.toUpperCase()} requires export-control attestation that these suppliers cannot provide. Options: (a) swap to suppliers in aligned jurisdictions, (b) split scope so controlled items stay onshore, (c) rescope the design to remove the controlled functions.`
            void hostRef.current?.triggerConstraint({
              trigger: "compliance_miss",
              concernText,
              flaggingSpecialists: ["vp-supply-chain", "legal-counsel"],
              triggerContext: {
                targetMarket,
                offenderIds: complianceMiss.offenders.map((o) => o.id),
                offenderCountries: complianceMiss.offenders.map((o) => o.country),
              },
            })
          }}
        />
      )}

      {leadTimeExceeded && (
        <BannerRow
          icon={<Clock className="h-4 w-4 text-warning" />}
          title={`Lead time exceeded — ${leadTimeExceeded.offenders.length} supplier${leadTimeExceeded.offenders.length === 1 ? "" : "s"} above ${LEAD_TIME_CEILING_WEEKS} weeks`}
          body={`${leadTimeExceeded.offenders.map((o) => `${o.name} (${o.weeks}w)`).join(", ")}. If your launch window is tight, structure the design to compress.`}
          onReconsider={() => {
            const concernText = `Lead-time risk: ${leadTimeExceeded.offenders.length} shortlisted supplier${leadTimeExceeded.offenders.length === 1 ? " quotes" : "s quote"} lead times above ${LEAD_TIME_CEILING_WEEKS} weeks (${leadTimeExceeded.offenders.map((o) => `${o.name}: ${o.weeks}w`).join("; ")}). Options: (a) swap to faster-lead suppliers in the same category, (b) split the critical-path module into a short-lead core + a long-lead upgrade path, (c) relax spec so domestic fabs can quote.`
            void hostRef.current?.triggerConstraint({
              trigger: "lead_time_exceeded",
              concernText,
              flaggingSpecialists: ["vp-supply-chain", "vp-manufacturing"],
              triggerContext: {
                ceilingWeeks: LEAD_TIME_CEILING_WEEKS,
                offenderIds: leadTimeExceeded.offenders.map((o) => o.id),
                offenderWeeks: leadTimeExceeded.offenders.map((o) => o.weeks),
              },
            })
          }}
        />
      )}

      {moqMismatch && (
        <BannerRow
          icon={<Package className="h-4 w-4 text-warning" />}
          title={`MOQ mismatch — ${moqMismatch.offenders.length} supplier${moqMismatch.offenders.length === 1 ? "" : "s"} above your batch size of ${moqMismatch.batchSize}`}
          body={`${moqMismatch.offenders.map((o) => `${o.name} (MOQ ${o.moq})`).join(", ")}. You'll overbuy unless you change approach.`}
          onReconsider={() => {
            const concernText = `MOQ mismatch: project batch size is ${moqMismatch.batchSize} but ${moqMismatch.offenders.length} shortlisted supplier${moqMismatch.offenders.length === 1 ? "" : "s"} require higher minimums (${moqMismatch.offenders.map((o) => `${o.name}: ${o.moq}`).join("; ")}). Options: (a) swap to suppliers whose MOQ matches your pilot volume, (b) aggregate volume across units/modules, (c) redesign to use an off-the-shelf part that doesn't carry an MOQ.`
            void hostRef.current?.triggerConstraint({
              trigger: "moq_mismatch",
              concernText,
              flaggingSpecialists: ["vp-supply-chain"],
              triggerContext: {
                batchSize: moqMismatch.batchSize,
                offenderIds: moqMismatch.offenders.map((o) => o.id),
                offenderMoqs: moqMismatch.offenders.map((o) => o.moq),
              },
            })
          }}
        />
      )}
    </Card>
  )
}

function BannerRow({ icon, title, body, onReconsider }: {
  icon: React.ReactNode
  title: string
  body: string
  onReconsider: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 border border-border bg-card rounded-lg p-3">
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <div className="mt-0.5 flex-shrink-0">{icon}</div>
        <div className="space-y-0.5 min-w-0">
          <p className="text-xs font-medium text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground">{body}</p>
        </div>
      </div>
      <Button variant="secondary" size="sm" onClick={onReconsider} className="flex-shrink-0">
        Reconsider
      </Button>
    </div>
  )
}

// ─── Parsers ─────────────────────────────────────────────────────────
// GOTCHA: these live here (not in a shared lib) because the input strings are
// deliberately permissive — the supplier DB is free-form. Moving them into
// supplier-match.ts would encourage pure-function misuse where callers expect
// strict numeric fields.

/**
 * Parse a lead-time string into whole weeks. Accepts "8 weeks", "6-8 wk",
 * "45 days", "3 months". Returns null if no number found.
 */
export function parseLeadTimeWeeks(text: string | null | undefined): number | null {
  if (!text) return null
  const lower = text.toLowerCase()
  // Prefer the UPPER bound if a range is given — that's the worst case.
  const match = lower.match(/(\d+)\s*(?:-\s*(\d+))?\s*(day|week|wk|month|mo)s?/)
  if (!match) return null
  const low = Number(match[1])
  const high = match[2] ? Number(match[2]) : low
  const value = Math.max(low, high)
  const unit = match[3]
  if (unit.startsWith("day")) return Math.round(value / 7)
  if (unit.startsWith("week") || unit === "wk") return value
  if (unit.startsWith("month") || unit === "mo") return value * 4
  return null
}

/**
 * Parse a MOQ string into a single integer. Accepts "100", "100 units", "MOQ
 * 500", "≥ 1000". If a range, take the LOWER bound (that's the actual minimum).
 */
export function parseMoq(text: string | null | undefined): number | null {
  if (!text) return null
  const cleaned = text.replace(/[,]/g, "")
  const match = cleaned.match(/(\d+)/)
  if (!match) return null
  return Number(match[1])
}

/**
 * Parse a batch-size diagnostic answer. Accepts raw numbers, "100", "100-500",
 * "≤100". Returns the lower bound of ranges (pessimistic for MOQ check — a
 * 100-500 spec means the founder must be OK at 100, so flag suppliers above 100).
 */
export function parseBatchSize(text: string | null | undefined): number | null {
  if (!text) return null
  const cleaned = text.replace(/[,]/g, "")
  const match = cleaned.match(/(\d+)/)
  if (!match) return null
  return Number(match[1])
}
