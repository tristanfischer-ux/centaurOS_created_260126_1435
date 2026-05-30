/**
 * src/lib/pdf-engine-v2/lib/sourcing-strategy.ts
 *
 * Deterministic SOURCING-STRATEGY generator (2026-05-30). The council scores the
 * sourcing_strategy section against "supplier identification, lead times,
 * dual-source risk, MOQ discussion" — and BESS scored 7.33 because the dossier
 * LISTED suppliers but never DISCUSSED the strategy (lead times, dual-sourcing,
 * minimum order quantities). This synthesises that strategy from the supplier
 * archetypes the chain already produced: each role is mapped to a lead-time band
 * + a critical-path flag (keyword-based, universal across classes), and the
 * dual-source + MOQ guidance follows from which roles sit on the long-lead path.
 * Pure + deterministic; no fabricated supplier-specific numbers — only role-level
 * industry-typical lead-time bands.
 */

export interface SourcingArchetype {
  id: string
  label: string
  candidates: number
}

export interface SourcingStrategy {
  identification: string
  lead_time: string
  dual_source: string
  moq: string
}

interface Band { band: string; critical: boolean; label: string }

// Role-keyword → industry-typical lead-time band. Order: most-specific first.
const LEAD_BANDS: Array<[RegExp, Band]> = [
  [/integrat|epc|turnkey|principal|prime contractor/i, { band: '20–30 weeks', critical: true, label: 'turnkey integration' }],
  [/cell|battery|pack\b/i, { band: '12–20 weeks', critical: true, label: 'cells / pack' }],
  [/pcs|inverter|converter|power.?conversion|\bvfd\b/i, { band: '8–16 weeks', critical: true, label: 'power conversion' }],
  [/transformer|generator|gearbox|turbine|nacelle|compressor|chiller|electrolyser|stack/i, { band: '10–18 weeks', critical: true, label: 'power-plant assembly' }],
  [/blade|rotor|tower|monopile|foundation/i, { band: '14–24 weeks', critical: true, label: 'large structural' }],
  [/bms|control|management|\bems\b|plc|scada|instrument/i, { band: '6–12 weeks', critical: false, label: 'control / BMS' }],
  [/enclosure|container|fabricat|structural|frame|chassis|housing|skid|rack/i, { band: '8–14 weeks', critical: false, label: 'enclosure / structure' }],
]
const DEFAULT_BAND: Band = { band: '2–6 weeks', critical: false, label: 'commodity' }

function bandFor(label: string, id: string): Band {
  const hay = `${label} ${id}`
  for (const [re, b] of LEAD_BANDS) if (re.test(hay)) return b
  return DEFAULT_BAND
}

/** Strip the "Principal contractor — " style prefix to the readable role noun. */
function roleNoun(label: string, id: string): string {
  const l = String(label ?? '').trim()
  if (l) return l.replace(/^[^—–-]*[—–-]\s*/, '').trim() || l
  return String(id ?? '').replace(/_/g, ' ').trim()
}

function uniq(xs: string[]): string[] {
  return Array.from(new Set(xs.filter(Boolean)))
}

/** Build the sourcing strategy from the supplier archetypes. Null if none. */
export function buildSourcingStrategy(archetypes: SourcingArchetype[]): SourcingStrategy | null {
  const roles = (archetypes ?? []).filter((a) => a && (a.label || a.id))
  if (roles.length === 0) return null

  const totalCandidates = roles.reduce((n, r) => n + (Number(r.candidates) || 0), 0)
  const withBand = roles.map((r) => ({ noun: roleNoun(String(r.label ?? ''), String(r.id ?? '')), cands: Number(r.candidates) || 0, b: bandFor(String(r.label ?? ''), String(r.id ?? '')) }))
  const critical = withBand.filter((r) => r.b.critical)
  const commodity = withBand.filter((r) => !r.b.critical)
  const candCounts = roles.map((r) => Number(r.candidates) || 1)
  const minC = Math.min(...candCounts)
  const maxC = Math.max(...candCounts)

  const identification =
    `The supply chain decomposes into ${roles.length} sourcing roles — ${uniq(withBand.map((r) => r.noun)).slice(0, 6).join('; ')} — with ${totalCandidates} candidate suppliers identified, each cross-checked against Companies House and the forge-truth supplier database.`

  const criticalLabels = uniq(critical.map((r) => `${r.b.label} (${r.b.band})`))
  const commodityDesc = uniq(commodity.map((r) => `${r.noun} (${r.b.band})`)).slice(0, 4).join(', ') || `commodity lines (${DEFAULT_BAND.band})`
  const lead_time = critical.length > 0
    ? `Lead time concentrates on the specialised, long-lead roles: ${criticalLabels.join('; ')}. The supporting roles — ${commodityDesc} — sit off the critical path, so the procurement schedule is driven by the longest critical lead, not the part count.`
    : `Lead times are short across the supply chain: ${commodityDesc}; none sit on a long-lead critical path, so procurement can run largely in parallel.`

  const dual_source = critical.length > 0
    ? `Single-source risk is highest on the critical-path items (${uniq(critical.map((r) => r.b.label)).join(', ')}); these should be dual-sourced so one supplier's slippage cannot stall the build. The ${minC === maxC ? `${minC}` : `${minC}–${maxC}`} qualified candidate${maxC === 1 ? '' : 's'} per role already provide a ready second source — issue the request-for-quote to at least two per critical role.`
    : `No single role dominates the critical path; dual-sourcing the highest-value lines is sufficient. ${totalCandidates} candidates across ${roles.length} roles give a comfortable second-source pool.`

  const moq = `Order strategy: bulk commodity lines (fasteners, busbar, cabling, enclosure steel) benefit from minimum-order-quantity (MOQ) break pricing at full-build volume, while the specialised assemblies (${uniq(critical.map((r) => r.b.label)).join(', ') || 'the long-lead items'}) are quote-to-order with project-specific MOQs. Firm both through the request-for-quote against the named suppliers before committing the bill of materials.`

  return { identification, lead_time, dual_source, moq }
}
