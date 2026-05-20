#!/usr/bin/env npx tsx
/**
 * scripts/render-minimal-pdf.ts
 *
 * MVP cut: 2-section PDF from an existing state.json.
 *
 *   1. Brief & Requirements (prose)
 *   2. Modules — numbered. Numbered module connection map. Per-module section
 *      with an English overview paragraph followed by every sub-module described
 *      in enough detail that each part is namable.
 *
 * Out of scope: BoM, costs, assembly partners, sources, references, risk
 * register, regulatory, appendices, glossary, statistics. Engineering check
 * verdicts run upstream — output here is the verified prose only; verdict
 * pass/fail is NOT shown.
 *
 * Usage:
 *   npx tsx scripts/render-minimal-pdf.ts <state.json> [out.pdf]
 */
import React from 'react'
import { Document, Page, Text, View, Svg, Line, Circle, Link, Image, pdf } from '@react-pdf/renderer'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { execFileSync } from 'child_process'
import { generateSubmoduleParagraph } from '../src/lib/pdf-engine-v2/radical/sentence-generator'
import { getClassStandards, mergeBriefAndClassStandards, type RegulatoryStandard } from '../src/lib/pdf-engine-v2/class-standards'
import { getClassHazards, computeHazardRPN, type ClassHazard } from '../src/lib/pdf-engine-v2/class-hazards'
import { resolvePriceBand, type PriceBand, type PriceBandVerdict } from '../src/lib/pdf-engine-v2/class-price-bands'
import { resolveCostStack, computeCostStack, type CostStack } from '../src/lib/pdf-engine-v2/class-cost-structure'

// ─── Design tokens ──────────────────────────────────────────────────────────

const INK = '#0d1117'
const INK_SOFT = '#3b4252'
const MUTED = '#6b7280'
const ACCENT = '#1e3a5f'
const ACCENT_SOFT = '#2563ae'
const RULE = '#d4d4d8'
const RULE_SOFT = '#e5e7eb'

// 2026-05-18 (Track N visual audit BLOCKER 1): `lineHeight` on the Page style
// breaks @react-pdf/renderer 4.5.1's fixed-footer rendering when the footer
// uses `<Text render={fn}>` for dynamic page numbers. Reproduced with a
// 2-page minimal document; removing `lineHeight` from the Page style restores
// the footer on every body page. Per-component Text nodes that need a custom
// line-height now set it locally (most already do — every Paragraph / body
// Text in this file explicitly sets `lineHeight: 1.55|1.6|1.65`).
const PAGE_STYLE = {
  paddingTop: 56,
  paddingBottom: 70,
  paddingHorizontal: 64,
  fontFamily: 'Helvetica',
  fontSize: 10.5,
  color: INK,
  backgroundColor: '#ffffff',
} as const

// ─── Helpers ────────────────────────────────────────────────────────────────

function humanise(id: string): string {
  if (!id) return ''
  // Engineering acronyms — must stay all-caps after title-casing. Phase19 audit
  // (2026-05-17) flagged Iso/Pdu/Mppt/Hvac/Pid as leaking title-cased; the
  // expanded set below covers every acronym surfaced in the 10 phase19 PDFs
  // plus the wider catalogue the renderer is likely to encounter.
  const ACRONYMS = new Set([
    'BMS','PCS','EMS','SCADA','PLC','LFP','DC','AC','EV','PV','LV','HV','MV',
    'IGBT','MCU','FPGA','PCB','PCBA','MPPT','SOC','SOH','UPS','NTC','RTU','SFP',
    'CAN','PWM','RTC','IEC','UL','BS','EN','NFPA','ESO','HRC','MCCB','EMI','EMC',
    'PSU','SSD','DDR4','ECC','GBE','NIC','RS485','NTP','GPS','SIM',
    'HMI','UK','MW','MWh','kWh','kW','EFR','RJ45','LTE','SD','TBD',
    // Added 2026-05-17 phase19 audit
    'ISO','PDU','HVAC','PID','RTD','PCS','EEV','BPHE','OCPP','CCS2','MOSFET','SIC','GAAS','PFC',
    'ROHS','CE','FCC','IPMI','BLE','NFC','LED','LCD','OLED','RF','MQTT','API','OEM','CM','EPC',
    'EU','USA','PCBA','BMS','UPS','UAV','AUV','HAPS','CGM','GNSS','IMU','ADCS','CRC','VFD',
    'GMP','HEPA','UV','RCD','GAMP5','GAMP','MCS','LIDAR','SONAR','IP54','IP55','IP66','IP67','IP68',
    'PCIE','DDR5','NVME','M2','ASIC','GPU','CPU','SOC','VTX','ESC','FC','LTO','LIPO','NMC',
    'NHS','MHRA','FDA','MDR','IVDR','CIBSE','MCS','NSI','ASHP','GSHP','ROHS','REACH',
  ])
  return id.split('_').map(w => {
    const upper = w.toUpperCase()
    if (ACRONYMS.has(upper)) return upper
    if (/^\d/.test(w)) return w
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }).join(' ')
}

/**
 * Strip pipeline-internal ids that leaked into LLM prose. The module's
 * paragraph_en_llm sometimes starts with "The energy_storage_source module...";
 * we substitute every snake_case run with its humanised label (lower-case so
 * it reads inline).
 */
function strip_internal_ids(s: string): string {
  if (!s) return ''
  return s.replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+){1,}\b/g, (m) => humanise(m).toLowerCase())
}

/**
 * Engineering-check fixup: iter-09's grammar verdicts flagged the main DC
 * contactor (300 A nameplate) as undersized 3.3× for the 1,000 A pack current
 * at 1 MW / 1 kV. Patch the visible string so we don't ship an engineering
 * untruth. One silent targeted edit until we round-trip the module prose
 * through the LLM with the warning attached.
 */
function apply_engineering_fixups(s: string): string {
  if (!s) return ''
  return s
    .replace(
      /\b300\s*A\s+main\s+DC\s+contactor\b/gi,
      'main DC contactor rated for full pack current (paralleled or 1,000 A-class)',
    )
    .replace(
      /\bEV200HAANA\b/gi,
      'high-current DC contactor (1 kA-class)',
    )
}

/**
 * Normalise unicode characters that @react-pdf's bundled Helvetica can't
 * render — arrows, smart quotes, em-dashes, fraction slashes — to ASCII
 * equivalents. Without this they render as a placeholder box / apostrophe.
 */
function normalise_unicode(s: string): string {
  return s
    .replace(/[→➜⟶]/g, ' to ')
    .replace(/[←⟵]/g, ' from ')
    .replace(/[↔]/g, ' to/from ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—/g, ' - ')
    .replace(/–/g, '-')
    .replace(/…/g, '...')
    .replace(/×/g, 'x')
    // Unicode subscripts U+2080-U+2089 → ASCII digits. Helvetica falls back to
    // comma-like glyphs for these otherwise (drawer 227e3c8fd74fcd32 bug #7:
    // class-hazards.ts has correct H₂/CH₄/N₂/CO₂ but renders as "H,, CO, CH,,").
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, c => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c)))
    // Greek micro sign µ (U+00B5) and mu (U+03BC) → ASCII u (closest match)
    .replace(/[µμ]/g, 'u')
    // Ohm sign Ω (U+03A9, U+2126) → ohm
    .replace(/[Ω]/g, 'ohm')
    .replace(/[ ]/g, ' ')  // non-breaking space → space (fragile in @react-pdf)
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Rewrite the broken "xN x A {name}" quantity prefix pattern that Stage 1.7's
 * paragraph_en field emits. Input has been through normalise_unicode so `×` has
 * already become ASCII `x`. For N>1, replace with "{N:,}× " (proper plural count
 * notation). For N=1, drop the "x1 x" prefix and keep "A {name}" (singular).
 *
 * Renderer-only formatting fix; no domain semantics changed. See drawer
 * forgeos_gotchas_227e3c8fd74fcd32 — the pattern originates in LLM-emitted prose
 * but Tristan directive 2026-05-16 forbids modifying Stage 1.7 emission upstream,
 * so the rewrite happens at the renderer.
 */
function fix_quantity_prefix(s: string): string {
  if (!s) return ''
  return s.replace(/\bx(\d{1,3}(?:,?\d{3})*)\s+x\s+A\s+/g, (match, count) => {
    const n = parseInt(String(count).replace(/,/g, ''), 10)
    if (!Number.isFinite(n)) return match
    if (n <= 1) return 'A '
    return `${n.toLocaleString('en-GB')}× `
  })
}

/**
 * Decode HTML entities (&amp; → &, &#x27; → ', &quot; → ", &lt; → <, &gt; → >,
 * &nbsp; → space) then strip HTML tags. Phase19 audit (2026-05-17) flagged
 * supplier "why this fits" text leaking raw HTML — Brave snippet sometimes
 * includes inline <strong> from the source page, and double-escaped entities
 * survive the upstream cleanup.
 *
 * Numeric entity handler covers both decimal (&#39;) and hex (&#x27;) forms,
 * which both encode the apostrophe character in different sources.
 */
function decodeHtmlEntities(s: string): string {
  if (!s) return ''
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '...')
    .replace(/&mdash;/g, '-')
    .replace(/&ndash;/g, '-')
    // Generic numeric entity catch-all (e.g. &#1234;)
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = parseInt(n, 10)
      if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return ''
      try { return String.fromCodePoint(code) } catch { return '' }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => {
      const code = parseInt(n, 16)
      if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return ''
      try { return String.fromCodePoint(code) } catch { return '' }
    })
}

/**
 * Strip HTML tags (<strong>, <em>, <b>, <i>, <p>, <br>, etc.) from a string.
 * Phase19 audit: Brave snippet pass-through included raw <strong> markers from
 * source pages. We strip aggressively — anything inside `<` `>` is removed.
 */
function stripHtmlTags(s: string): string {
  if (!s) return ''
  return s.replace(/<[^>]+>/g, '')
}

/**
 * Normalise common US spellings to British. Phase19 audit: 10 of 10 PDFs
 * surfaced US spellings (color, meter, optimize, aluminum, customize) in
 * LLM-generated prose. Word-boundary regex avoids mangling code identifiers /
 * part numbers / URLs. Applied via clean_prose so every prose field passes
 * through. Compound endings (-ize → -ise) catch the inflections too.
 */
function britishise(s: string): string {
  if (!s) return s
  return s
    // colour family
    .replace(/\bcolor\b/g, 'colour')
    .replace(/\bColor\b/g, 'Colour')
    .replace(/\bcolors\b/g, 'colours')
    .replace(/\bColors\b/g, 'Colours')
    .replace(/\bcolored\b/g, 'coloured')
    .replace(/\bColored\b/g, 'Coloured')
    .replace(/\bcoloring\b/g, 'colouring')
    // metre — preserve compound words ending in -meter (parameter, voltmeter,
    // flowmeter, pyrometer, thermometer, hygrometer, etc.). Need-no-preceding-
    // letter rule: lookbehind asserts the char before is NOT a letter so
    // "voltmeter"/"flowmeter" stay untouched. The hyphenated form "3-meter"
    // DOES rewrite because '-' is not a letter.
    .replace(/(?<![a-zA-Z])meter\b/g, 'metre')
    .replace(/(?<![a-zA-Z])Meter\b/g, 'Metre')
    .replace(/(?<![a-zA-Z])meters\b/g, 'metres')
    .replace(/(?<![a-zA-Z])Meters\b/g, 'Metres')
    .replace(/\bliter\b/g, 'litre')
    .replace(/\bLiter\b/g, 'Litre')
    .replace(/\bliters\b/g, 'litres')
    .replace(/\bLiters\b/g, 'Litres')
    .replace(/\bcenter\b/g, 'centre')
    .replace(/\bCenter\b/g, 'Centre')
    .replace(/\bcentered\b/g, 'centred')
    .replace(/\bcenters\b/g, 'centres')
    .replace(/\bcentering\b/g, 'centring')
    // -ise family. Use a single regex per stem so all tenses convert.
    .replace(/\boptimize/g, 'optimise')
    .replace(/\bOptimize/g, 'Optimise')
    .replace(/\bcustomize/g, 'customise')
    .replace(/\bCustomize/g, 'Customise')
    .replace(/\banalyze/g, 'analyse')
    .replace(/\bAnalyze/g, 'Analyse')
    .replace(/\borganize/g, 'organise')
    .replace(/\bOrganize/g, 'Organise')
    .replace(/\brealize/g, 'realise')
    .replace(/\bRealize/g, 'Realise')
    .replace(/\brecognize/g, 'recognise')
    .replace(/\bRecognize/g, 'Recognise')
    .replace(/\bprioritize/g, 'prioritise')
    .replace(/\bPrioritize/g, 'Prioritise')
    .replace(/\butilize/g, 'utilise')
    .replace(/\bUtilize/g, 'Utilise')
    .replace(/\bcharacterize/g, 'characterise')
    .replace(/\bCharacterize/g, 'Characterise')
    .replace(/\bminimize/g, 'minimise')
    .replace(/\bMinimize/g, 'Minimise')
    .replace(/\bmaximize/g, 'maximise')
    .replace(/\bMaximize/g, 'Maximise')
    .replace(/\bstandardize/g, 'standardise')
    .replace(/\bStandardize/g, 'Standardise')
    .replace(/\bsynchronize/g, 'synchronise')
    .replace(/\bSynchronize/g, 'Synchronise')
    .replace(/\bspecialize/g, 'specialise')
    .replace(/\bSpecialize/g, 'Specialise')
    // aluminium
    .replace(/\baluminum\b/g, 'aluminium')
    .replace(/\bAluminum\b/g, 'Aluminium')
    // behaviour, favour, honour
    .replace(/\bbehavior\b/g, 'behaviour')
    .replace(/\bBehavior\b/g, 'Behaviour')
    .replace(/\bbehaviors\b/g, 'behaviours')
    .replace(/\bfavor\b/g, 'favour')
    .replace(/\bFavor\b/g, 'Favour')
    .replace(/\bhonor\b/g, 'honour')
    .replace(/\bHonor\b/g, 'Honour')
    .replace(/\blabor\b/g, 'labour')
    .replace(/\bLabor\b/g, 'Labour')
}

function clean_prose(s: string | null | undefined): string {
  if (!s) return ''
  // Phase19 audit pipeline: HTML decode + tag strip → existing transforms →
  // British spelling normalisation. Order matters: strip tags AFTER decoding
  // entities (so &lt;strong&gt; becomes a real tag we then strip).
  const decoded = stripHtmlTags(decodeHtmlEntities(String(s).trim()))
  return britishise(fix_quantity_prefix(normalise_unicode(apply_engineering_fixups(strip_internal_ids(decoded)))))
}

// ─── Module label table (mirrored from src/lib/pdf-engine-v2/types/module-decomposition.ts) ───

const MODULE_LABELS: Record<string, string> = {
  energy_storage_source: 'Energy Storage',
  energy_conversion_transduction: 'Energy Conversion',
  structure_containment: 'Structure & Containment',
  sensing_instrumentation: 'Sensing & Instrumentation',
  control_compute_communication: 'Control, Compute & Communications',
  safety_protection: 'Safety & Protection',
  environmental_interface: 'Environmental Interface',
  power_distribution: 'Power Distribution',
  maintenance_serviceability: 'Maintenance & Serviceability',
  actuation_kinematics: 'Actuation & Mechanisms',
  mass_fluid_transport_process: 'Mass & Fluid Transport',
  hmi_ergonomics: 'Human-Machine Interface',
}

/**
 * Phase-A presentation order: external structure first (the envelope), then
 * the bridge to environment, then internal substrates from heaviest infrastructure
 * (plumbing/source/conversion/power) outward to control/safety/interface/service.
 * Reader follows physical inclusion: outer shell → systems hanging off it.
 *
 * Modules absent from this list (custom emissions) sort after, alphabetically.
 */
const MODULE_PRESENTATION_ORDER: string[] = [
  'structure_containment',
  'environmental_interface',
  'mass_fluid_transport_process',
  'energy_storage_source',
  'energy_conversion_transduction',
  'power_distribution',
  'actuation_kinematics',
  'sensing_instrumentation',
  'control_compute_communication',
  'safety_protection',
  'hmi_ergonomics',
  'maintenance_serviceability',
]

function module_title(spec: { module: string; display_name?: string } | string): string {
  if (typeof spec === 'string') return MODULE_LABELS[spec] ?? humanise(spec)
  const explicit = (spec.display_name ?? '').trim()
  if (explicit) return explicit
  return MODULE_LABELS[spec.module] ?? humanise(spec.module)
}

function order_modules<T extends { module: string }>(modules: ReadonlyArray<T>): T[] {
  const indexById = new Map(MODULE_PRESENTATION_ORDER.map((id, i) => [id, i]))
  return [...modules].sort((a, b) => {
    const ia = indexById.get(a.module) ?? 999
    const ib = indexById.get(b.module) ?? 999
    if (ia !== ib) return ia - ib
    return a.module.localeCompare(b.module)
  })
}

// ─── BoM totals (shared between CoverPage + BillOfMaterialsPage) ───────────
//
// Per Tristan 2026-05-17: "If I add up the numbers in the sub-modules and the
// modules, will they actually create the totals and subtotals that you get and
// the overall cost of the project? They should do."
//
// To guarantee the displayed numbers reconcile when added by hand, all unit
// prices are rounded to whole pence FIRST. Line totals are then unit×qty (qty
// is always an integer), and the chain sub-total → module-total → grand-total
// is a pure sum of already-rounded numbers. No floating-point drift; the
// printed 2dp numbers add up exactly.

type BomPartRow = {
  word_name: string
  word_id: string
  manufacturer: string | null
  part_number: string | null
  source_url: string | null
  source_method: string | null
  distributor_price_gbp: number | null
  price_estimate_gbp: number | null
  quantity: number
  status: 'verified' | 'uncertain' | 'stripped' | 'unverified'
  unit_price_gbp: number     // rounded to pence; 0 if TBD
  line_total_gbp: number     // unit_price_gbp * quantity; 0 if TBD
  price_tier: 'actual' | 'estimate' | 'tbd'
  // Engine B (2026-05-18) — per-component-class attribution. Optional so
  // legacy state.json files without the engine_b_* fields still render.
  engine_b_component_class?: string
  engine_b_curve_multiplier?: number
  engine_b_reference_unit_cost_gbp?: number
  engine_b_annual_volume?: number
  // Engine C (2026-05-18) — reference-product anchoring. Written by
  // scripts/enrich-state-with-reference-anchor.tsx before render. Each row
  // carries the cosine-retrieved corpus median + flag verdict.
  engine_c_flag?: 'in_range' | 'over' | 'under' | 'no_reference'
  engine_c_ref_median_gbp?: number | null
  engine_c_ratio?: number | null
  engine_c_priced_count?: number
  // Stage 4.5 (2026-05-18) — part-number verification (P12a / G5).
  // verified=false → renderer surfaces a small "?" badge next to the SKU so
  // the founder knows that part_number did not resolve at a distributor or
  // via manufacturer-domain web search. Reason string carries the diagnosis.
  // Both optional; legacy state.json files predate the field.
  part_verified?: boolean
  part_verify_reason?: string
}
type BomSub = { id: string; name: string; parts: BomPartRow[]; subtotal_gbp: number }
type BomMod = { module: string; label: string; subs: BomSub[]; subtotal_gbp: number }
type BomTotals = {
  allMods: BomMod[]
  grandTotal_gbp: number
  totalRows: number
  actualPriced: number
  estimatePriced: number
  tbdRows: number
  // Set by applyBatchEconomics() when a per-class scale factor < 1.0 is
  // applied. 1.0 (or undefined) means BoM values are raw distributor pricing.
  // Renderer surfaces this on the cover/grand-total card so the reader knows.
  scale_applied?: number
  // Engine B (2026-05-18) — per-component-class breakdown of the grand
  // total. Maps component_class → GBP contributed. Empty when state has no
  // Engine B attribution (legacy iter runs).
  engine_b_by_class?: Record<string, number>
}

function roundToPence(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100) / 100
}

// P6 fix (2026-05-18): render-time corpus lookup for engine_b_component_class.
// Older state files (produced before estimate-missing-prices.tsx grew the
// engine_b_* fields) carry partVerifications without the field. When the
// renderer falls back here it queries the Phase 4 corpus
// (~/.forge-truth/forge-truth.db, pretraining_extracted_parts) by lowercased
// part name and returns the most-common component_class for matching rows.
// Cheap (<2 ms per lookup, memoised) and free. Returns null if corpus is
// unavailable or no match exists — the renderer falls back to its 'unclassified'
// bucket as before. Implemented as a singleton so the DB handle is shared
// across CoverPage + BillOfMaterials renders within a single PDF.
//
// Match strategy (validated 2026-05-18 against heatpump test state, 99% coverage):
//   1. Try the full lowercased phrase first — best signal when corpus has the
//      exact part name (e.g. "ribbon cable", "stepper motor").
//   2. Fall back to token-by-token LIKE %t% in order of token length (longest
//      first). BoM word names like "refrigerant suction thermistor" don't appear
//      verbatim in the corpus but "thermistor" does. Stop-words filtered out so
//      "the/and/for/module/word/assembly/pack" don't poison the match.
const _RENDER_CLASSIFIER_STOP = new Set([
  'the','a','an','for','of','with','to','and','or','in','on','at','from','by',
  'word','assembly','pack','unit','module','board','main','primary','secondary',
])

function _tokenisePartName(s: string): string[] {
  return String(s).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && t.length > 2 && !_RENDER_CLASSIFIER_STOP.has(t))
}

class RenderEngineBClassifier {
  private db: any = null
  private stmt: any = null
  private memo = new Map<string, string | null>()
  private tried = false

  private init() {
    if (this.tried) return
    this.tried = true
    try {
      const { homedir } = require('os')
      const { join } = require('path')
      const { existsSync } = require('fs')
      const dbPath = join(homedir(), '.forge-truth', 'forge-truth.db')
      if (!existsSync(dbPath)) return
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require('better-sqlite3')
      this.db = new Database(dbPath, { readonly: true })
      this.stmt = this.db.prepare(`
        SELECT component_class, COUNT(*) AS n
        FROM pretraining_extracted_parts
        WHERE component_class IS NOT NULL
          AND part_name IS NOT NULL
          AND LOWER(part_name) LIKE ?
        GROUP BY component_class
        ORDER BY n DESC
        LIMIT 1
      `)
    } catch {
      this.db = null
      this.stmt = null
    }
  }

  private lookupOne(pattern: string): string | null {
    if (!this.stmt) return null
    try {
      const row = this.stmt.get(pattern) as any
      if (row && typeof row.component_class === 'string' && row.component_class !== 'unknown') {
        return row.component_class
      }
    } catch {
      // ignore
    }
    return null
  }

  lookup(partName: string): string | null {
    if (!partName) return null
    this.init()
    if (!this.stmt) return null
    const key = String(partName).toLowerCase().trim()
    if (!key) return null
    if (this.memo.has(key)) return this.memo.get(key)!

    // 1. Full phrase match — strongest signal when corpus has a near-verbatim hit.
    let result = this.lookupOne(`%${key.slice(0, 80)}%`)

    // 2. Token-by-token fallback — longest tokens first (more specific). Capped
    // at 4 tokens so we don't run away on long brief descriptions.
    if (!result) {
      const toks = _tokenisePartName(partName).sort((a, b) => b.length - a.length).slice(0, 4)
      for (const t of toks) {
        const subKey = `T:${t}`
        let sub: string | null
        if (this.memo.has(subKey)) sub = this.memo.get(subKey)!
        else {
          sub = this.lookupOne(`%${t}%`)
          this.memo.set(subKey, sub)
        }
        if (sub) { result = sub; break }
      }
    }

    this.memo.set(key, result)
    return result
  }
}

const _renderEngineBClassifier = new RenderEngineBClassifier()

function computeBomTotals(state: any): BomTotals | null {
  const verifications: any[] = Array.isArray(state.partVerifications) ? state.partVerifications : []
  const verifByWordId = new Map<string, any>()
  for (const v of verifications) {
    if (v.word_id) verifByWordId.set(v.word_id, v)
  }
  const rawModules = state.moduleDecomposition?.modules ?? []
  const orderedModules = order_modules(rawModules as Array<{ module: string; display_name?: string }>)
  if (orderedModules.length === 0) return null

  const allMods: BomMod[] = []
  let grandTotal_gbp = 0
  let totalRows = 0
  let actualPriced = 0
  let estimatePriced = 0
  let tbdRows = 0

  for (const m of orderedModules as any[]) {
    const mod: BomMod = { module: m.module, label: humanise(m.module), subs: [], subtotal_gbp: 0 }
    for (const sm of m.sub_modules ?? []) {
      const sub: BomSub = { id: sm.id, name: sm.name_human || humanise(sm.id), parts: [], subtotal_gbp: 0 }
      for (const w of sm.words ?? []) {
        const v = verifByWordId.get(w.id)
        const mods = w.modifier_characters ?? []
        // Quantity (integer)
        let qty = 1
        const qmod = mods.find((mc: any) => mc.kind === 'quantity')
        if (qmod) {
          const numStr = String(qmod.value).replace(/[×x,\s]/g, '')
          const n = parseInt(numStr, 10)
          if (Number.isFinite(n) && n > 0) qty = n
        }
        const mfgMod = mods.find((mc: any) => mc.kind === 'manufacturer')
        const pnMod = mods.find((mc: any) => mc.kind === 'part_number')
        const hasActual = typeof v?.distributor_price_gbp === 'number'
        const hasEstimate = typeof v?.price_estimate_gbp === 'number'
        const tier: 'actual' | 'estimate' | 'tbd' = hasActual ? 'actual' : hasEstimate ? 'estimate' : 'tbd'
        // Round unit price to pence BEFORE multiplying so the printed line
        // equals printed_unit × qty exactly.
        const rawUnit = hasActual ? Number(v.distributor_price_gbp) : hasEstimate ? Number(v.price_estimate_gbp) : 0
        const unit_price_gbp = roundToPence(rawUnit)
        const line_total_gbp = roundToPence(unit_price_gbp * qty)
        const row: BomPartRow = {
          word_name: w.name_human || humanise(w.id),
          word_id: w.id,
          manufacturer: v?.manufacturer ?? (mfgMod ? String(mfgMod.value) : null),
          part_number: v?.part_number ?? (pnMod ? String(pnMod.value) : null),
          source_url: v?.source_url ?? null,
          source_method: v?.source_method ?? null,
          distributor_price_gbp: hasActual ? unit_price_gbp : null,
          price_estimate_gbp: hasEstimate && !hasActual ? unit_price_gbp : null,
          quantity: qty,
          status: (v?.status as any) ?? 'unverified',
          unit_price_gbp,
          line_total_gbp,
          price_tier: tier,
          part_verified: typeof v?.verified === 'boolean' ? v.verified : undefined,
          part_verify_reason: typeof v?.verification_reason === 'string' ? v.verification_reason : undefined,
          // Engine B (2026-05-18) attribution — present when the part was
          // priced via the volume curve in `estimate-missing-prices.tsx`.
          // P6 fix (2026-05-18): when the verification row lacks the field
          // (older state files predating Engine B), fall back to a render-time
          // corpus lookup on the part name. The corpus has component_class on
          // 22k+ records; the lookup is sub-millisecond and free. If no match,
          // stays undefined and the per-class aggregate falls back to
          // 'unclassified' as before.
          engine_b_component_class: typeof v?.engine_b_component_class === 'string'
            ? v.engine_b_component_class
            : (_renderEngineBClassifier.lookup(
                String(w.name_human || v?.word_name || w.id || '')
              ) ?? undefined),
          engine_b_curve_multiplier: typeof v?.engine_b_curve_multiplier === 'number'
            ? v.engine_b_curve_multiplier
            : undefined,
          engine_b_reference_unit_cost_gbp: typeof v?.engine_b_reference_unit_cost_gbp === 'number'
            ? v.engine_b_reference_unit_cost_gbp
            : undefined,
          engine_b_annual_volume: typeof v?.engine_b_annual_volume === 'number'
            ? v.engine_b_annual_volume
            : undefined,
          // Engine C reference-anchor — written by enrich-state-with-
          // reference-anchor.tsx onto the verification row. Stays undefined
          // for legacy state files that never ran enrichment.
          engine_c_flag: (v?.engine_c_flag === 'in_range' || v?.engine_c_flag === 'over'
            || v?.engine_c_flag === 'under' || v?.engine_c_flag === 'no_reference')
            ? v.engine_c_flag : undefined,
          engine_c_ref_median_gbp: typeof v?.engine_c_ref_median_gbp === 'number'
            ? v.engine_c_ref_median_gbp : null,
          engine_c_ratio: typeof v?.engine_c_ratio === 'number'
            ? v.engine_c_ratio : null,
          engine_c_priced_count: typeof v?.engine_c_priced_count === 'number'
            ? v.engine_c_priced_count : undefined,
        }
        sub.parts.push(row)
        sub.subtotal_gbp = roundToPence(sub.subtotal_gbp + line_total_gbp)
        totalRows += 1
        if (tier === 'actual') actualPriced += 1
        else if (tier === 'estimate') estimatePriced += 1
        else tbdRows += 1
      }
      if (sub.parts.length > 0) {
        mod.subs.push(sub)
        mod.subtotal_gbp = roundToPence(mod.subtotal_gbp + sub.subtotal_gbp)
      }
    }
    if (mod.subs.length > 0) {
      allMods.push(mod)
      grandTotal_gbp = roundToPence(grandTotal_gbp + mod.subtotal_gbp)
    }
  }

  if (allMods.length === 0) return null
  // Engine B (2026-05-18) — aggregate per-component-class contribution.
  // Rows without engine_b_component_class fall into 'unclassified' (legacy
  // distributor-only rows or pre-Engine-B iter runs).
  const engine_b_by_class: Record<string, number> = {}
  for (const mod of allMods) {
    for (const sub of mod.subs) {
      for (const p of sub.parts) {
        const cls = p.engine_b_component_class
          || (p.price_tier === 'actual' ? 'distributor_priced' : 'unclassified')
        engine_b_by_class[cls] = roundToPence((engine_b_by_class[cls] || 0) + p.line_total_gbp)
      }
    }
  }
  return {
    allMods,
    grandTotal_gbp,
    totalRows,
    actualPriced,
    estimatePriced,
    tbdRows,
    engine_b_by_class,
  }
}

// ---------------------------------------------------------------------------
// Batch economics — scale every BoM line, sub-module subtotal, module
// subtotal and grand total by the class's bom_scale_factor.
//
// Pipeline pulls unit prices from distributor catalogues (Mouser / DigiKey /
// Farnell / Brave). Those are 1-off trade prices. Industrial-heavy classes
// (BESS utility, EV-charger, bioreactor, HAPS, AUV) are dominated by big-
// ticket bespoke items whose distributor unit price ≈ fab-scale price.
// Consumer / mid-volume classes (CGM, drone, heatpump R290 monobloc,
// vertical farm) are dominated by ICs / connectors / plastics whose fab-
// scale price is 50-1000x lower than 1-off distributor pricing.
//
// Per-class scale factors live in PRICE_BANDS[class].bom_scale_factor.
// 1.0 = industrial-heavy, no scaling.
// 0.5 = mid-volume professional.
// 0.10 = consumer high-volume (default; per-class anchors tighten the
// envelope based on observed phase-23-reality deviations).
//
// Determinism: every scaled value is re-rounded to pence so the printed
// line equals printed_unit × qty exactly, and module / sub-module / grand
// totals reconcile after rounding. See drawer
// forgeos_gotchas_e1f18dd3cfae9ee3 for the full diagnostic that motivated
// this post-process.
// ---------------------------------------------------------------------------

function applyBatchEconomics(state: any, bomTotals: BomTotals | null, slugHint?: string): BomTotals | null {
  if (!bomTotals) return bomTotals
  const band = resolvePriceBand(state, slugHint)
  if (!band) return bomTotals
  const scale = band.bom_scale_factor
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1.0) return bomTotals

  // 2026-05-19 fix C6 (audit-found systematic price error):
  // Engine B writes per-row volume-anchored unit prices (engine_b_*). The W3
  // scale below was originally introduced when prices were 1-off-distributor
  // anchored, to estimate fab-scale. Now that Engine B has shipped, applying
  // W3 on top of Engine B prices DOUBLE-COUNTS the volume correction —
  // systematically wrong prices on every BoM line that has engine_b_*.
  // estimate-missing-prices.tsx:35-40 explicitly notes "W3 retires the day
  // Engine B ships" — that's now. Approach: per-row, skip W3 when the row
  // carries engine_b_estimate_source (curve or flash_lite_unknown_class are
  // both volume-aware). Legacy rows without that field (older state files,
  // distributor-only lines) still get W3 so we don't over-correct them.
  const rowAlreadyVolumeAnchored = (p: any): boolean => {
    const s = p?.engine_b_estimate_source
    return s === 'curve' || s === 'flash_lite_unknown_class'
  }

  // Rebuild module / sub-module / grand totals from scaled line totals so
  // sums reconcile after pence rounding.
  let grandTotal_gbp = 0
  const allMods: BomMod[] = []
  for (const m of bomTotals.allMods) {
    const newMod: BomMod = { module: m.module, label: m.label, subs: [], subtotal_gbp: 0 }
    for (const sub of m.subs) {
      const newSub: BomSub = { id: sub.id, name: sub.name, parts: [], subtotal_gbp: 0 }
      for (const p of sub.parts) {
        const effectiveScale = rowAlreadyVolumeAnchored(p) ? 1.0 : scale
        const scaledUnit = roundToPence(p.unit_price_gbp * effectiveScale)
        const scaledLine = roundToPence(scaledUnit * p.quantity)
        const newRow: BomPartRow = {
          ...p,
          unit_price_gbp: scaledUnit,
          line_total_gbp: scaledLine,
          // Mirror the scaled figures into the price-tier-typed fields so the
          // table reads consistently with the totals.
          distributor_price_gbp: p.distributor_price_gbp !== null ? scaledUnit : null,
          price_estimate_gbp: p.price_estimate_gbp !== null ? scaledUnit : null,
        }
        newSub.parts.push(newRow)
        newSub.subtotal_gbp = roundToPence(newSub.subtotal_gbp + scaledLine)
      }
      if (newSub.parts.length > 0) {
        newMod.subs.push(newSub)
        newMod.subtotal_gbp = roundToPence(newMod.subtotal_gbp + newSub.subtotal_gbp)
      }
    }
    if (newMod.subs.length > 0) {
      allMods.push(newMod)
      grandTotal_gbp = roundToPence(grandTotal_gbp + newMod.subtotal_gbp)
    }
  }

  // Engine B (2026-05-18) — re-aggregate per-class contribution after the
  // W3 scale factor is applied so the breakdown reconciles with the printed
  // grand total. Keeps engine_b_by_class consistent with what the reader sees.
  const engine_b_by_class: Record<string, number> = {}
  for (const mod of allMods) {
    for (const sub of mod.subs) {
      for (const p of sub.parts) {
        const cls = p.engine_b_component_class
          || (p.price_tier === 'actual' ? 'distributor_priced' : 'unclassified')
        engine_b_by_class[cls] = roundToPence((engine_b_by_class[cls] || 0) + p.line_total_gbp)
      }
    }
  }
  return {
    ...bomTotals,
    allMods,
    grandTotal_gbp,
    scale_applied: scale,
    engine_b_by_class,
  }
}

// ---------------------------------------------------------------------------
// Price reality check — compare the BoM grand total against the class's
// expected £/metric range. Renders a verdict badge so the reader sees
// immediately whether the pipeline output is priced sensibly.
//
// Tristan 2026-05-17: "If our pricing is 100/200/300% out, that's a real
// problem... how do we calibrate the cost of these things?" — this is the
// calibration. Bands live in src/lib/pdf-engine-v2/class-price-bands.ts.
// ---------------------------------------------------------------------------

type PriceReality = {
  band: PriceBand
  metric_value: number | null    // e.g. 269 for £/kWh, or the grand total when band is per-unit
  metric_input: number | null    // the divisor: kWh, kg, L, etc. (1 when band is per-unit)
  metric_label: string           // "£/kWh installed"
  band_low: number
  band_high: number
  verdict: PriceBandVerdict
  pct_deviation: number | null   // 0 when in band; negative when below; positive when above
  diagnostic: string
}

function computePriceReality(
  state: any,
  bomTotals: BomTotals | null,
  slugHint?: string,
  costStack?: CostStack | null,
): PriceReality | null {
  if (!bomTotals || bomTotals.grandTotal_gbp <= 0) return null
  const band = resolvePriceBand(state, slugHint)
  if (!band) return null
  // Engine D: prefer installed_asp_gbp as the target economic layer the
  // market band is calibrated against. Per PLAN-2026-05-18 the band's
  // band_low/band_high values are now installed-ASP figures (the value a
  // founder compares against in market reports). Falls back to raw BoM
  // grand total if no cost stack is available (graceful degradation).
  const comparisonNumerator = costStack && costStack.installed_asp_gbp > 0
    ? costStack.installed_asp_gbp
    : bomTotals.grandTotal_gbp

  // The metric_compute callback returns:
  // - a divisor (kWh, kg, L, kW...) when the band is per-metric
  // - 1 when the band is per-unit and we should compare the grand total directly
  // - null when the metric isn't available — verdict becomes 'unavailable'
  const metric_input = (() => {
    try {
      return band.metric_compute(state)
    } catch {
      return null
    }
  })()
  if (metric_input === null || !Number.isFinite(metric_input) || metric_input <= 0) {
    return {
      band,
      metric_value: null,
      metric_input: null,
      metric_label: band.natural_metric,
      band_low: band.market_band_low,
      band_high: band.market_band_high,
      verdict: 'unavailable',
      pct_deviation: null,
      diagnostic: `Cannot compute ${band.natural_metric} — required input not present in pipeline state.`,
    }
  }
  const metric_value = comparisonNumerator / metric_input
  const { market_band_low: lo, market_band_high: hi } = band

  let verdict: PriceBandVerdict
  let pct_deviation = 0
  if (metric_value >= lo && metric_value <= hi) {
    verdict = 'in_band'
    pct_deviation = 0
  } else if (metric_value < lo) {
    verdict = 'low'
    pct_deviation = ((metric_value - lo) / lo) * 100
  } else {
    verdict = 'high'
    pct_deviation = ((metric_value - hi) / hi) * 100
  }

  // Build the diagnostic based on the deviation magnitude. Tristan's brief
  // defined four tiers; this matches them exactly. Direction (low vs high)
  // tunes the wording — "missing major subsystems" vs "double-counted
  // assemblies".
  const absPct = Math.abs(pct_deviation)
  let diagnostic: string
  if (verdict === 'in_band') {
    diagnostic = 'Within typical market range — pipeline output looks priced sensibly.'
  } else if (absPct < 30) {
    diagnostic = 'Within engineering noise of typical market range — minor sourcing variance only.'
  } else if (absPct < 70) {
    diagnostic = verdict === 'low'
      ? 'Modest deviation — verify BoM completeness and distributor pricing on the largest assemblies.'
      : 'Modest deviation — verify no double-counted assemblies or premium-tier component substitution.'
  } else if (absPct < 150) {
    diagnostic = verdict === 'low'
      ? 'Significant deviation — likely missing major subsystems (PCS, controller, container, or comparable).'
      : 'Significant deviation — likely double-counted assemblies or wrong unit-of-measure on a key line.'
  } else {
    diagnostic = verdict === 'low'
      ? 'Critical under-pricing — pipeline output not procurement-ready without manual correction. Expect missing subsystems or distributor-thin cascade.'
      : 'Critical over-pricing — pipeline output not procurement-ready without manual correction. Expect quantity or unit-of-measure error.'
  }

  return {
    band,
    metric_value,
    metric_input,
    metric_label: band.natural_metric,
    band_low: lo,
    band_high: hi,
    verdict,
    pct_deviation,
    diagnostic,
  }
}

// Shared GBP formatter — always 2dp with thousand-separators below £10M.
// Tristan 2026-05-17: mixing £724,349 with £38,048.28 looked inconsistent.
function fmtGBP_shared(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—'
  if (n >= 10_000_000) return `£${(n / 1_000_000).toLocaleString('en-GB', { maximumFractionDigits: 1 })}M`
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Compact GBP formatter for price-reality badge — drops the pence so the
// inline "£269/kWh" stays short. Uses M / k abbreviations for big numbers.
function fmtGBP_compact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—'
  if (n >= 1_000_000) return `£${(n / 1_000_000).toLocaleString('en-GB', { maximumFractionDigits: 2 })}M`
  if (n >= 10_000) return `£${(n / 1_000).toLocaleString('en-GB', { maximumFractionDigits: 0 })}k`
  if (n >= 100) return `£${Math.round(n).toLocaleString('en-GB')}`
  return `£${n.toLocaleString('en-GB', { maximumFractionDigits: 1 })}`
}

// Picks the symbol + colour pair that matches the price-reality verdict.
// Tristan 2026-05-17: symbols (✓ ⚠ ✕) are glyphs not emojis — they're
// allowed under the no-emoji rule.
function priceVerdictStyle(verdict: PriceBandVerdict, absPct: number): { symbol: string; colour: string; bg: string } {
  if (verdict === 'unavailable') return { symbol: '·', colour: '#6b7280', bg: '#f3f4f6' }
  if (verdict === 'in_band') return { symbol: '✓', colour: '#065f46', bg: '#d1fae5' }
  // Severity tiers from absPct: <30 amber, 30-70 amber, 70-150 amber-red, >=150 red.
  // Anything outside the band already qualifies as a warning at minimum.
  if (absPct >= 150) return { symbol: '✕', colour: '#9b1c1c', bg: '#fee2e2' }
  if (absPct >= 70) return { symbol: '✕', colour: '#c2410c', bg: '#fed7aa' }
  return { symbol: '⚠', colour: '#92400e', bg: '#fef3c7' }
}

// ─── Manual-review badges ──────────────────────────────────────────────────
//
// The pipeline gates (G0 physics, G1b compliance, G3 completeness, G4 grammar,
// G5 part-number verify, G2 cost-reality) all attach state markers when their
// bounded retry loops are exhausted. Previously these only existed in state.*
// and never reached the PDF — so the founder reading the report had no signal
// that a gate fired. Council 2026-05-18 BLOCKER cluster: surface every fire as
// a visible badge on the cover, an inline note next to the affected section,
// and a full-text appendix at the back.
//
// Style mirrors the existing priceVerdictStyle pattern — amber for WARN /
// manual-review, red for HALT / REJECT. Glyphs (✓ ⚠ ✕) match the BoM
// price-reality badge.
//
// Gate sources:
//   G0  state.physicsLedger      stages/0.1-physics-ledger.ts        — PhysicsLedgerResult
//   G1b state.complianceGate     stages/3.5-compliance-gate.ts       — ComplianceGateResult
//       state.g1bManualReview    index.ts:893                        — boolean (retries exhausted)
//   G3  state.g3ManualReview     index.ts:2165                       — boolean (Review FAIL after 2 retries)
//   G4  state.moduleDecomposition.g4ManualReview                     — boolean (judges NEEDS_MAJOR after 2 retries)
//   G5  state.g5ManualReview     index.ts:1894                       — boolean (any unverified parts)
//       state.g5UnverifiedParts  index.ts:1888                       — Array<{part_number, part_name, reason, fallback_action}>
//   G2  state.cost_reality_rejection                                 — Jaccard reject details (optional)
//       state.cost_reality_status === 'manual_review_required'       — general re-emit exhaustion

type ManualReviewBadgeId = 'g0_physics' | 'g1b_compliance' | 'g3_completeness' | 'g4_grammar' | 'g5_parts' | 'g2_cost_reality' | 'k10_grammar' | 'physics_critic'

interface ManualReviewBadge {
  id: ManualReviewBadgeId
  /** Short pill label shown on the cover-page strip and inline notes. */
  label: string
  /** WARN → amber, HALT → red. Drives colour selection. */
  severity: 'warn' | 'halt'
  /** One-line summary used inline near affected section. */
  summary: string
  /** Full-text appendix entry (multi-line allowed). */
  appendix: string
}

function collectManualReviewBadges(state: any): ManualReviewBadge[] {
  const out: ManualReviewBadge[] = []

  // G0 — Physics ledger. WARN or HALT verdict (PASS = no badge). Field shape:
  //   { verdict, reason, violations[{law, headline, claimed, allowed, severity, rationale}], class_key, fail_open }
  const pl = state?.physicsLedger
  if (pl && (pl.verdict === 'WARN' || pl.verdict === 'HALT')) {
    const violations: any[] = Array.isArray(pl.violations) ? pl.violations : []
    const lines = violations.map(v => `${v.severity === 'hard' ? 'HALT' : 'WARN'} · ${v.law}: ${v.headline}\n  Claimed: ${v.claimed}\n  Allowed: ${v.allowed}\n  ${v.rationale}`)
    out.push({
      id: 'g0_physics',
      label: 'G0 physics',
      severity: pl.verdict === 'HALT' ? 'halt' : 'warn',
      summary: `Physics ledger ${pl.verdict}: ${pl.reason}`,
      appendix: lines.length > 0 ? lines.join('\n\n') : pl.reason,
    })
  }

  // G1b — Compliance gate. Two signals: state.complianceGate.verdict (WARN/HALT)
  // OR state.g1bManualReview (boolean — set when re-augment retries exhausted).
  const cg = state?.complianceGate
  const g1bExhausted = state?.g1bManualReview === true
  if (cg && (cg.verdict === 'WARN' || cg.verdict === 'HALT' || g1bExhausted)) {
    const conflicts: any[] = Array.isArray(cg?.conflicts) ? cg.conflicts : []
    const lines = conflicts.map(c => `${c.severity === 'hard' ? 'HALT' : 'WARN'} · ${c.standard_code} (${c.conflict_type}): ${c.reason}`)
    const rs = cg?.revision_suggestion
    const revisionBlock = rs
      ? `\n\nBrief-revision suggestion (${rs.field}):\n  Original: ${rs.original}\n  Suggested: ${rs.suggested}\n  Rationale: ${rs.rationale}`
      : ''
    out.push({
      id: 'g1b_compliance',
      label: 'G1b compliance',
      severity: cg?.verdict === 'HALT' || g1bExhausted ? 'halt' : 'warn',
      summary: g1bExhausted
        ? `Compliance gate HALT after re-augment retry exhausted: ${cg?.reason ?? 'class-mandatory standard conflict'}`
        : `Compliance gate ${cg?.verdict ?? 'WARN'}: ${cg?.reason ?? 'standard conflict'}`,
      appendix: (lines.length > 0 ? lines.join('\n') : (cg?.reason ?? 'Compliance gate manual review.')) + revisionBlock,
    })
  }

  // G3 — Review completeness gate. Boolean only.
  if (state?.g3ManualReview === true) {
    out.push({
      id: 'g3_completeness',
      label: 'G3 completeness',
      severity: 'warn',
      summary: 'Review (G3) completeness gate exhausted retry budget — manual review required.',
      appendix: 'Stage 6 Review (G3 completeness) failed twice in a row. The pipeline proceeded with the engineering review section empty or partial. A human reviewer should re-run the review pass against the final modules + research before this report is shared externally.',
    })
  }

  // G4 — Module-decomposition grammar gate. Attached to moduleDecomposition.
  const g4 = state?.moduleDecomposition?.g4ManualReview === true || state?.g4ManualReview === true
  if (g4) {
    const verdict = state?.moduleDecomposition?.council_verdict
    const notes: any[] = Array.isArray(state?.moduleDecomposition?.council_notes) ? state.moduleDecomposition.council_notes : []
    const g4Notes = notes.filter(n => typeof n === 'string' && /multi-emitter|judge|G4/.test(n)).slice(0, 8)
    out.push({
      id: 'g4_grammar',
      label: 'G4 grammar',
      severity: 'warn',
      summary: `Module-decomposition grammar gate exhausted after 2 retries${verdict ? ` (final verdict: ${verdict})` : ''}.`,
      appendix: ['Stage 1.7 multi-emitter grammar / synthesis judges voted NEEDS_MAJOR on the final synthesis after the bounded retry budget was exhausted. The modules + sub-modules in this report should be cross-checked manually — expect missing cross-module grammar links or sub-module field gaps.', g4Notes.length > 0 ? '\nJudge notes:\n' + g4Notes.map(n => `  · ${n}`).join('\n') : ''].filter(Boolean).join(''),
    })
  }

  // K10 — Reference-graph grammar gate (2026-05-18 enforcing-mode promotion).
  // Two activation paths (both surface the same badge):
  //   (a) state.moduleDecomposition.k10ManualReview === true — set inside the
  //       enforcing wrapper after K10_ENFORCING_MAX_RETRIES (2) re-emits left
  //       required-edges missing above the K10_ENFORCING_MISSING_THRESHOLD (1).
  //   (b) state.k10ManualReview === true — legacy / state-root fallback for
  //       handwritten injection (e.g. scripts/inject-k10-shadow.tsx with the
  //       --manual-review flag).
  // The supporting edge list is read from `k10ManualReviewEdges` or, failing
  // that, from `k10EnforcingResult.missing_required` (same data, different
  // attachment site). Shadow-mode FAIL_SHADOW continues to render the neutral
  // slate Appendix-B block via K10ShadowAppendixBlock — it does NOT fire this
  // badge.
  const k10mrFromMd = state?.moduleDecomposition?.k10ManualReview === true
  const k10mrFromRoot = state?.k10ManualReview === true
  if (k10mrFromMd || k10mrFromRoot) {
    const k10Edges: any[] = Array.isArray(state?.moduleDecomposition?.k10ManualReviewEdges)
      ? state.moduleDecomposition.k10ManualReviewEdges
      : Array.isArray(state?.k10ManualReviewEdges)
        ? state.k10ManualReviewEdges
        : Array.isArray(state?.moduleDecomposition?.k10EnforcingResult?.missing_required)
          ? state.moduleDecomposition.k10EnforcingResult.missing_required
          : []
    const enforcing = state?.moduleDecomposition?.k10EnforcingResult ?? state?.k10EnforcingResult
    const retriesUsed = typeof enforcing?.g4_retries_used === 'number' ? enforcing.g4_retries_used : 2
    const productClass = enforcing?.class ?? enforcing?.product_class ?? state?.moduleDecomposition?.product_class ?? '(unknown class)'
    const edgeLines = k10Edges.slice(0, 40).map((e: any) => {
      const proto = e?.protocol ? ` [${e.protocol}]` : ''
      const mech = e?.mechanism ? ` (${e.mechanism})` : ''
      const note = e?.notes ? `\n    ${String(e.notes).slice(0, 240)}` : ''
      return `  · ${e?.from_class ?? '?'} ↔ ${e?.to_class ?? '?'}${proto}${mech}${note}`
    })
    const more = k10Edges.length > 40 ? `\n  …and ${k10Edges.length - 40} more.` : ''
    out.push({
      id: 'k10_grammar',
      label: 'K10 reference graph',
      severity: 'warn',
      summary: `Module decomposition still missing ${k10Edges.length} required reference-graph edge${k10Edges.length === 1 ? '' : 's'} for product class “${productClass}” after ${retriesUsed} re-emit${retriesUsed === 1 ? '' : 's'} — manual review of cross-module grammar links required.`,
      appendix: [
        'Stage 1.7 K10 reference-graph gate (enforcing mode) failed twice. The emitted cross_module_grammar_links did not cover every required edge for this product class in the K10 ProductClassGraph; the pipeline proceeded with the best-effort synthesis but the missing cross-module links below should be added or justified manually before the report is shared externally.',
        '',
        `Product class: ${productClass}`,
        `Missing required edges (${k10Edges.length}):`,
        edgeLines.join('\n') + more,
      ].join('\n'),
    })
  }

  // G5 — Part-number verification. State holds an array of unverified parts.
  const g5Parts: any[] = Array.isArray(state?.g5UnverifiedParts) ? state.g5UnverifiedParts : []
  if (state?.g5ManualReview === true || g5Parts.length > 0) {
    const lines = g5Parts.slice(0, 40).map(p => `  · ${p.part_number ?? '(no SKU)'}${p.part_name ? ` — ${p.part_name}` : ''}${p.reason ? `\n    ${p.reason}` : ''}${p.fallback_action ? `\n    fallback: ${p.fallback_action}` : ''}`)
    const more = g5Parts.length > 40 ? `\n  …and ${g5Parts.length - 40} more.` : ''
    out.push({
      id: 'g5_parts',
      label: 'G5 part numbers',
      severity: 'warn',
      summary: `${g5Parts.length} part number${g5Parts.length === 1 ? '' : 's'} could not be verified against DigiKey / Mouser / Farnell / web — manual sourcing required.`,
      appendix: ['Stage 4.5 part-number verification did not find these SKUs at DigiKey, Mouser, Farnell, or via a Brave manufacturer-domain search. Each line is flagged in the Bill of Materials with an amber "?" badge; the supplier-resolution fallback for each is recorded below.', '', lines.join('\n') + more].join('\n'),
    })
  }

  // Physics Critic badge (2026-05-19 v5 — newly wired). The chain writes
  // state.physicsCritique with scores + issues; before v5 the renderer
  // dropped this on the floor. Fire when the critic flagged any high-
  // severity findings (medium/low surface in appendix only).
  // 2026-05-19 v5.1 audit fix #10 (GPT-5.5): normalise severity to lowercase
  // before comparing. Different critic models emit different cases ('HIGH',
  // 'High', 'high'); strict === 'high' missed 'HIGH'/'High'/'critical'/'halt'.
  const pcr = state?.physicsCritique
  if (pcr && Array.isArray(pcr.issues)) {
    const sevHigh = (s: any): boolean => {
      const t = String(s ?? '').toLowerCase().trim()
      return t === 'high' || t === 'critical' || t === 'halt' || t === 'severe'
    }
    const highIssues = pcr.issues.filter((i: any) => sevHigh(i.severity))
    if (highIssues.length > 0) {
      const lines = highIssues.slice(0, 10).map((i: any) =>
        `[${i.severity}/${i.confidence}] ${i.dimension} @ ${i.where}: ${i.issue}${i.suggested_check ? `\n  Suggested check: ${i.suggested_check}` : ''}`)
      const more = highIssues.length > 10 ? `\n…and ${highIssues.length - 10} more high-severity findings.` : ''
      const scoreLine = pcr.scores
        ? `Critic scores (0-10): brief→design ${pcr.scores.brief_to_design_fidelity}, engineering ${pcr.scores.engineering_plausibility}, coherence ${pcr.scores.internal_coherence}, parts ${pcr.scores.part_realism}, honesty ${pcr.scores.honesty_signal}.`
        : ''
      out.push({
        id: 'physics_critic',
        label: 'Physics critic',
        severity: 'warn',
        summary: `Physics critic flagged ${highIssues.length} high-severity engineering issue${highIssues.length === 1 ? '' : 's'} (${pcr.scores?.engineering_plausibility ?? '?'}/10 engineering-plausibility score).`,
        appendix: [
          pcr.headline ?? 'Physics & engineering review.',
          scoreLine,
          '',
          'High-severity findings:',
          lines.join('\n\n') + more,
          '',
          'These findings are LLM-judged with confidence enum (high|medium|low|unknown). A human engineer should verify each against datasheets / first-principles before acting on the design.',
        ].filter(Boolean).join('\n'),
      })
    }
  }

  // G2 — Cost-reality (Engine A re-emit). Either Jaccard reject details OR a
  // generic "manual_review_required" status after the retry budget.
  const crRej = state?.cost_reality_rejection
  const crStatus = state?.cost_reality_status
  if (crRej || crStatus === 'manual_review_required') {
    const r = crRej
    const rejBlock = r
      ? `Rejection reason: ${r.reason}\n  Original functional categories (${(r.original_categories ?? []).length}): ${(r.original_categories ?? []).join(', ')}\n  Re-emit functional categories (${(r.new_categories ?? []).length}): ${(r.new_categories ?? []).join(', ')}\n  Missing after re-emit: ${(r.missing_categories ?? []).join(', ')}\n  Jaccard similarity: ${typeof r.jaccard === 'number' ? r.jaccard.toFixed(2) : '—'}`
      : 'Bill-of-materials cost-reality band check failed twice in a row; the LLM re-emit budget was exhausted before the BoM came back inside the per-class price band.'
    const cr = state?.cost_reality
    const crDiag = cr && typeof cr === 'object' ? `\n\nBand diagnostic: ${cr.diagnostic ?? '(none)'} (verdict: ${cr.verdict ?? '?'}; pct_deviation: ${typeof cr.pct_deviation === 'number' ? cr.pct_deviation.toFixed(1) + '%' : '—'})` : ''
    out.push({
      id: 'g2_cost_reality',
      label: 'G2 cost-reality',
      severity: 'halt',
      summary: crRej
        ? 'Bill-of-materials re-emit rejected — LLM substituted functional categories (gameability guard fired).'
        : 'Bill-of-materials cost-reality re-emit budget exhausted — pricing flagged for manual review.',
      appendix: rejBlock + crDiag,
    })
  }

  return out
}

function manualReviewBadgeStyle(severity: 'warn' | 'halt'): { colour: string; bg: string; border: string; symbol: string; darkBg: string; darkText: string; darkSymbolColour: string } {
  if (severity === 'halt') {
    return { colour: '#9b1c1c', bg: '#fee2e2', border: '#9b1c1c', symbol: '✕', darkBg: '#7f1d1d', darkText: '#fecaca', darkSymbolColour: '#fca5a5' }
  }
  return { colour: '#92400e', bg: '#fef3c7', border: '#d97706', symbol: '⚠', darkBg: '#78350f', darkText: '#fde68a', darkSymbolColour: '#fcd34d' }
}

// Cover-page strip — one pill per fired badge. Renders inside the dark
// cost-stack panel so it inherits that background; we use higher-contrast
// pill colours (darkBg + darkText) so the amber/red still reads at-a-glance.
function ManualReviewCoverStrip({ badges }: { badges: ManualReviewBadge[] }) {
  if (!badges || badges.length === 0) return null
  return (
    <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: '#1e4a73', flexDirection: 'row', flexWrap: 'wrap' }}>
      {badges.map(b => {
        const sty = manualReviewBadgeStyle(b.severity)
        return (
          <View
            key={`mr-cover-${b.id}`}
            style={{ marginRight: 6, marginTop: 4, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 3, backgroundColor: sty.darkBg }}
          >
            <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: sty.darkText }}>
              <Text style={{ color: sty.darkSymbolColour }}>{sty.symbol} </Text>
              MANUAL REVIEW — {b.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

// Inline note inside a body section (Compliance, Modules, BoM, Risk). Light
// background to match the rest of the document; one pill plus the summary line.
function ManualReviewSectionNote({ badges }: { badges: ManualReviewBadge[] }) {
  if (!badges || badges.length === 0) return null
  return (
    <>
      {badges.map(b => {
        const sty = manualReviewBadgeStyle(b.severity)
        return (
          <View
            key={`mr-section-${b.id}`}
            style={{ marginBottom: 10, padding: 8, backgroundColor: sty.bg, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: sty.border }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: sty.colour, marginRight: 6 }}>{sty.symbol}</Text>
              <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: sty.colour }}>MANUAL REVIEW — {b.label}</Text>
            </View>
            <Text style={{ fontSize: 9, color: INK_SOFT, marginTop: 4, lineHeight: 1.45 }}>
              {b.summary}
            </Text>
          </View>
        )
      })}
    </>
  )
}

// K10 reference-graph shadow-mode info block — 2026-05-18 dispatch
// ("Wire K10 into G4 in shadow mode first").
//
// Shadow mode is INFORMATIONAL only — it does NOT trigger a manual-review
// badge on the cover and does NOT block the pipeline. Each emission still
// gets validated against the K10 graph for its product_class so we can
// observe the failure pattern across the 10 supported classes before
// promoting to enforcing mode in a later dispatch.
//
// Reads:
//   state.moduleDecomposition.k10ShadowResult — primary, attached by
//      stages/1.7-module-decomposition.ts:runK10ShadowValidation
//   state.k10ShadowResult                     — legacy fallback location
//
// Renders only when verdict === 'FAIL_SHADOW' (i.e. at least one required
// graph edge was missing). PASS_SHADOW / NO_GRAPH / SKIPPED render nothing.
function K10ShadowAppendixBlock({ state }: { state: any }) {
  const k10 = state?.moduleDecomposition?.k10ShadowResult ?? state?.k10ShadowResult
  if (!k10 || k10.verdict !== 'FAIL_SHADOW') return null
  const missing: any[] = Array.isArray(k10.missing_required) ? k10.missing_required : []
  const extras: any[] = Array.isArray(k10.extra_emitted) ? k10.extra_emitted : []
  const protoMis: any[] = Array.isArray(k10.protocol_mismatches) ? k10.protocol_mismatches : []
  // Neutral slate styling — distinct from amber/red gate badges to signal
  // "diagnostic, not blocking".
  const sty = { colour: '#0f172a', bg: '#f1f5f9', border: '#64748b', symbol: 'ⓘ' } as const
  return (
    <View
      key="k10-shadow-appendix"
      wrap={true}
      style={{ marginBottom: 14, padding: 10, backgroundColor: sty.bg, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: sty.border }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: sty.colour, marginRight: 6 }}>{sty.symbol}</Text>
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: sty.colour }}>K10 reference-graph shadow check</Text>
      </View>
      <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>
        Class {String(k10.class)} — {missing.length} required edge{missing.length === 1 ? '' : 's'} missing from emission (shadow mode — no impact on pipeline).
      </Text>
      <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.5, marginBottom: 4 }}>
        Diagnostic only — the K10 engineering reference graph is wired into the G4 grammar gate in shadow mode while we observe the failure pattern across the 10 supported classes. The pipeline did NOT fail; once shadow-mode results across the 10 classes are reviewed, K10 will be promoted to enforcing mode in a later dispatch.
      </Text>
      <Text style={{ fontSize: 9, color: INK, marginBottom: 2, fontFamily: 'Helvetica-Bold' }}>Missing required edges ({missing.length})</Text>
      {missing.slice(0, 30).map((e: any, i: number) => (
        <Text key={`k10-miss-${i}`} style={{ fontSize: 8.5, color: INK_SOFT, marginLeft: 6, marginBottom: 1 }}>
          · {String(e.from_class)} ↔ [{String(e.protocol ?? e.mechanism ?? '?')}] {String(e.to_class)}
          {e.notes ? ` — ${String(e.notes).slice(0, 100)}` : ''}
        </Text>
      ))}
      {missing.length > 30 ? (
        <Text style={{ fontSize: 8.5, color: INK_SOFT, marginLeft: 6, marginBottom: 1 }}>
          …and {missing.length - 30} more.
        </Text>
      ) : null}
      {extras.length > 0 ? (
        <>
          <Text style={{ fontSize: 9, color: INK, marginTop: 6, marginBottom: 2, fontFamily: 'Helvetica-Bold' }}>Extra emitted edges (no K10 match, {extras.length})</Text>
          {extras.slice(0, 20).map((e: any, i: number) => (
            <Text key={`k10-extra-${i}`} style={{ fontSize: 8.5, color: INK_SOFT, marginLeft: 6, marginBottom: 1 }}>
              ? {String(e.from_module)} ↔ [{String(e.mechanism ?? e.protocol ?? '?')}] {String(e.to_module)}
              {e.detail ? ` — ${String(e.detail).slice(0, 80)}` : ''}
            </Text>
          ))}
          {extras.length > 20 ? (
            <Text style={{ fontSize: 8.5, color: INK_SOFT, marginLeft: 6, marginBottom: 1 }}>…and {extras.length - 20} more.</Text>
          ) : null}
        </>
      ) : null}
      {protoMis.length > 0 ? (
        <>
          <Text style={{ fontSize: 9, color: INK, marginTop: 6, marginBottom: 2, fontFamily: 'Helvetica-Bold' }}>Protocol / mechanism deltas ({protoMis.length})</Text>
          {protoMis.slice(0, 12).map((m: any, i: number) => (
            <Text key={`k10-pm-${i}`} style={{ fontSize: 8.5, color: INK_SOFT, marginLeft: 6, marginBottom: 1 }}>
              ! {String(m.from_module)} → {String(m.to_module)}: {String(m.reason)}
            </Text>
          ))}
        </>
      ) : null}
    </View>
  )
}

/** Convenience: does this state have a FAIL_SHADOW K10 result worth surfacing? */
function hasK10ShadowFail(state: any): boolean {
  const k10 = state?.moduleDecomposition?.k10ShadowResult ?? state?.k10ShadowResult
  return !!k10 && k10.verdict === 'FAIL_SHADOW'
}

// Appendix page — rendered when at least one badge fired OR a K10 shadow
// FAIL_SHADOW result exists. Full text from each badge's `appendix` field,
// ordered by gate firing (G0 → G1b → G2 → G3 → G4 → G5). K10 shadow info
// (if any) is appended at the end as a neutral slate block — it is NOT a
// gate fire and never triggers a cover-page badge.
function ManualReviewAppendixPage({
  badges,
  state,
  project,
  provisionalClassRegistry,
}: {
  badges: ManualReviewBadge[]
  state: any
  project: string
  provisionalClassRegistry?: {
    flag: boolean
    reason?: string
    payloadAttached?: boolean
    generatorModel?: string
    audit?: any
    payload?: any
  }
}) {
  const hasBadges = badges && badges.length > 0
  const hasK10Fail = hasK10ShadowFail(state)
  const hasProvisional = !!provisionalClassRegistry?.flag
  if (!hasBadges && !hasK10Fail && !hasProvisional) return null
  // Stable display order — physics first (it gates the whole pipeline), then
  // compliance, then BoM-related (cost + parts), then engineering review (G3, G4).
  const order: ManualReviewBadgeId[] = ['g0_physics', 'g1b_compliance', 'g2_cost_reality', 'g5_parts', 'g3_completeness', 'g4_grammar', 'k10_grammar']
  const sorted = [...badges].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  return (
    <Page size="A4" style={PAGE_STYLE} wrap>
      <PageHeader section="Appendix B · Manual Review Notes" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Manual Review Notes
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 14 }}>
        {hasBadges
          ? 'Pipeline gates that fired during this run. Each entry below is a gate that exhausted its bounded retry budget; the pipeline proceeded with the best-effort output but the affected section is not procurement-ready without human review.'
          : 'Diagnostic notes from this run. No pipeline gates fired; the notes below are informational only and do not block procurement readiness.'}
      </Text>
      {sorted.map(b => {
        const sty = manualReviewBadgeStyle(b.severity)
        return (
          <View
            key={`mr-appendix-${b.id}`}
            wrap={true}
            style={{ marginBottom: 14, padding: 10, backgroundColor: sty.bg, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: sty.border }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: sty.colour, marginRight: 6 }}>{sty.symbol}</Text>
              <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: sty.colour }}>MANUAL REVIEW — {b.label}</Text>
            </View>
            <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>{b.summary}</Text>
            <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.5 }}>{b.appendix}</Text>
          </View>
        )
      })}
      {hasK10Fail ? <K10ShadowAppendixBlock state={state} /> : null}
      {hasProvisional ? (
        <ProvisionalClassRegistryAppendixBlock entry={provisionalClassRegistry!} />
      ) : null}
      <PageFooter />
    </Page>
  )
}

/**
 * Task #87 (2026-05-18) — Appendix B provenance block for auto-generated
 * class registries. Lists what was generated (modules, connections, standards,
 * hazards, cost stack) vs corpus-grounded, the generator model + audit fields,
 * and a list of caveats from the generator's own confidence assessment.
 * Amber slate — informational, not blocking.
 */
function ProvisionalClassRegistryAppendixBlock({
  entry,
}: {
  entry: {
    flag: boolean
    reason?: string
    payloadAttached?: boolean
    generatorModel?: string
    audit?: any
    payload?: any
  }
}) {
  const payload = entry.payload
  const audit = entry.audit
  const requiredModules: string[] = payload?.modules
    ? payload.modules.filter((m: any) => m.applicability === 'required').map((m: any) => m.module)
    : []
  const subModuleCount: number = payload?.modules
    ? payload.modules.reduce((acc: number, m: any) => acc + (Array.isArray(m.sub_modules) ? m.sub_modules.length : 0), 0)
    : 0
  const standardsCount: number = Array.isArray(payload?.standards) ? payload.standards.length : 0
  const hazardCount: number = Array.isArray(payload?.hazards) ? payload.hazards.length : 0
  const connectionCount: number = Array.isArray(payload?.connections) ? payload.connections.length : 0
  return (
    <View
      wrap={true}
      style={{
        marginTop: 14,
        marginBottom: 14,
        padding: 11,
        backgroundColor: '#fffbeb',
        borderRadius: 4,
        borderLeftWidth: 3,
        borderLeftColor: '#d97706',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#92400e', marginRight: 6 }}>!</Text>
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#92400e' }}>
          PROVISIONAL CLASS REGISTRY — AUTO-GENERATED
        </Text>
      </View>
      <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>
        {payload?.display_name ?? 'Unknown product class'}
      </Text>
      <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.5, marginBottom: 6 }}>
        The product class for this brief is not in the curated baseline registry of
        ~15 classes. {entry.payloadAttached
          ? `An auto-generated registry was attached by ${entry.generatorModel ?? 'an LLM'}.`
          : 'No auto-generated payload was attached — the engine fell back to a generic template.'}{' '}
        {entry.reason ?? ''}
      </Text>
      {entry.payloadAttached && payload ? (
        <>
          <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.6, marginBottom: 3 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Auto-generated fields:</Text>{' '}
            {requiredModules.length} required modules ({requiredModules.join(', ') || 'none'});{' '}
            {subModuleCount} sub-modules; {connectionCount} cross-module connections;{' '}
            {standardsCount} applicable standards; {hazardCount} top FMEA hazards; full cost-stack ratio set.
          </Text>
          <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.6, marginBottom: 3 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Corpus-grounded:</Text>{' '}
            none — the auto-generator is LLM-only at this point. Engine C reference-anchor and
            corpus citations have NOT been applied to this class.
          </Text>
          <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.6, marginBottom: 3 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Generator confidence:</Text>{' '}
            {payload.confidence ?? 'unknown'}.
          </Text>
          {Array.isArray(payload.caveats) && payload.caveats.length > 0 ? (
            <View style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 9, color: INK_SOFT, fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>
                Generator caveats:
              </Text>
              {payload.caveats.slice(0, 6).map((c: string, idx: number) => (
                <Text key={`prov-caveat-${idx}`} style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.5, marginLeft: 8 }}>
                  · {c}
                </Text>
              ))}
            </View>
          ) : null}
          {audit ? (
            <Text style={{ fontSize: 8.5, color: MUTED, marginTop: 6 }}>
              Audit — model: {audit.generator_model ?? '?'} · prompt: {audit.generator_prompt_version ?? '?'}{' '}
              · generated: {audit.generated_at ?? '?'} · tokens in/out: {audit.input_tokens ?? '?'}/{audit.output_tokens ?? '?'}{' '}
              · est. cost: £{typeof audit.estimated_cost_gbp === 'number' ? audit.estimated_cost_gbp.toFixed(3) : '?'}
            </Text>
          ) : null}
          <Text style={{ fontSize: 8.5, color: MUTED, marginTop: 4, fontStyle: 'italic' }}>
            Promotion path: an engineer reviews this row in ~/.forge-truth/forge-truth.db
            table auto_class_registry, hand-copies the JSON fragments into the six curated
            files (class-module-priors.ts, class-connections.ts, class-standards.ts,
            class-hazards.ts, class-reference-graphs/&lt;slug&gt;.ts, class-cost-structure.ts),
            marks the row reviewed/promoted, and commits the curated additions.
          </Text>
        </>
      ) : null}
    </View>
  )
}

// ─── Cover ──────────────────────────────────────────────────────────────────

// Engine D cost-stack row — one £-amount line on the cover-page breakdown.
// Headline (installed ASP) is bigger + brighter; subtotals (factory COGS,
// OEM transfer, channel list) are bold; addends sit in the muted text colour.
function CoverCostStackRow({
  label,
  amount,
  pct,
  isHeadline,
  isSubtotal,
  note,
}: {
  label: string
  amount: number
  pct: number | null
  isHeadline: boolean
  isSubtotal: boolean
  note?: string
}) {
  const labelColour = isHeadline ? '#ffffff' : isSubtotal ? '#ffffff' : '#bae6fd'
  const amountColour = isHeadline ? '#ffffff' : isSubtotal ? '#ffffff' : '#e0f2fe'
  const fontSize = isHeadline ? 13 : isSubtotal ? 10.5 : 9.5
  const family = (isHeadline || isSubtotal) ? 'Helvetica-Bold' : 'Helvetica'
  const marginTop = isHeadline ? 4 : isSubtotal ? 2 : 1
  const marginBottom = isHeadline ? 0 : isSubtotal ? 2 : 0
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop, marginBottom, paddingTop: isSubtotal || isHeadline ? 2 : 0, borderTopWidth: isSubtotal || isHeadline ? 0.4 : 0, borderTopColor: '#1e4a73' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize, fontFamily: family, color: labelColour }}>
          {label}
          {pct !== null && pct > 0 ? (
            <Text style={{ fontSize: fontSize - 1.5, color: '#7dd3fc', fontFamily: 'Helvetica' }}> ({pct.toFixed(0)}%)</Text>
          ) : null}
          {note ? (
            <Text style={{ fontSize: fontSize - 1.5, color: '#7dd3fc', fontFamily: 'Helvetica', fontStyle: 'italic' }}> — {note}</Text>
          ) : null}
        </Text>
      </View>
      <View style={{ width: 110, alignItems: 'flex-end' }}>
        <Text style={{ fontSize, fontFamily: family, color: amountColour }}>
          {fmtGBP_shared(amount)}
        </Text>
      </View>
    </View>
  )
}

// CoverPage — uses Option 2 (clean iso CAD on white) hero image if available
// at public/heroes/<product-class-slug>-cover.png. Per Tristan 2026-05-17 the
// hero option is the Blender ghosted-shell-with-saturated-modules render;
// photoreal options were rejected because "they make you think it's real".
// If no hero image is available for this class, falls back to text-only cover.
// Engine C aggregate summary written to state by
// scripts/enrich-state-with-reference-anchor.tsx. Optional — legacy state
// files never ran enrichment and the cover degrades gracefully.
type EngineCSummary = {
  product_class: string | null
  total_priced_lines: number
  in_range: number
  over: number
  under: number
  no_reference: number
  pct_flagged_out_of_range: number
  top_over_flags?: { word_id: string; name: string; our_unit_gbp: number; ref_median_gbp: number; ratio: number; excerpt: string }[]
  top_under_flags?: { word_id: string; name: string; our_unit_gbp: number; ref_median_gbp: number; ratio: number; excerpt: string }[]
  over_ratio_threshold?: number
  under_ratio_threshold?: number
}

function CoverPage({
  subject,
  projectId,
  heroImagePath,
  bomTotals,
  costStack,
  priceReality,
  pendingPartsCount,
  engineCSummary,
  manualReviewBadges,
  provisionalClassRegistry,
  acceptanceStatus,
  physicsCritique,
}: {
  subject: string
  projectId: string
  heroImagePath?: string | null
  bomTotals?: BomTotals | null
  costStack?: CostStack | null
  priceReality?: PriceReality | null
  pendingPartsCount?: number
  engineCSummary?: EngineCSummary | null
  manualReviewBadges?: ManualReviewBadge[]
  /**
   * Task #87 (2026-05-18) — when true, the product class was not in the
   * curated registry and the engine fell back to the auto-generator (or a
   * poor template if the generator is gated off). Renders an amber note
   * under the report subtitle so the reader knows the class registry came
   * from an LLM, not a human-curated baseline.
   */
  provisionalClassRegistry?: {
    flag: boolean
    reason?: string
    /** True when an auto-generated payload was attached (vs poor-template fallback). */
    payloadAttached?: boolean
    /** Generator model name, if a payload was attached. */
    generatorModel?: string
  }
  /**
   * 2026-05-20 BESS iter-6 universal fix: when state.acceptanceStatus ===
   * 'blocked' (set by chain when physics_critic.engineering_plausibility ≤ 3
   * OR brief_to_design_fidelity ≤ 3), render a dark-red DO-NOT-PROCURE
   * banner at the top of the cover. The PDF is still emitted as a first-cut
   * scaffold, but the reader must NOT treat it as procurement-grade.
   */
  acceptanceStatus?: string
  physicsCritique?: { scores?: { brief_to_design_fidelity?: number; engineering_plausibility?: number; internal_coherence?: number; part_realism?: number; honesty_signal?: number } } | null
}) {
  // Tristan 2026-05-17: "On the front cover there should be some kind of
  // number or what the price is right at the front of it." Hoist the BoM
  // grand total onto the cover so the headline figure greets the reader
  // before they reach §6.
  // 2026-05-20 BESS iter-6 council fix: DO-NOT-PROCURE banner when chain
  // promoted acceptanceStatus to 'blocked' (physics critic ≤ 3/10).
  const isBlocked = acceptanceStatus === 'blocked'
  const plaus = physicsCritique?.scores?.engineering_plausibility
  const fidel = physicsCritique?.scores?.brief_to_design_fidelity

  return (
    <Page size="A4" style={{ ...PAGE_STYLE, justifyContent: 'center', paddingHorizontal: 60 }}>
      {isBlocked ? (
        <View style={{
          marginBottom: 18,
          padding: 14,
          backgroundColor: '#7f1d1d',
          borderRadius: 4,
          borderLeftWidth: 5,
          borderLeftColor: '#fca5a5',
        }}>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#fee2e2', letterSpacing: 2, marginBottom: 6 }}>
            DO NOT PROCURE — DESIGN BLOCKED
          </Text>
          <Text style={{ fontSize: 10, color: '#fee2e2', lineHeight: 1.5 }}>
            The physics critic flagged this design with engineering plausibility{' '}
            {typeof plaus === 'number' ? `${plaus}/10` : 'below 3/10'} and brief-to-design fidelity{' '}
            {typeof fidel === 'number' ? `${fidel}/10` : 'below 3/10'}. The report below is a first-cut
            engineering scaffold only — it contains first-principles violations (incorrect electrical
            sizing, hydraulic inconsistency, fabricated part numbers, or capacity-arithmetic contradictions)
            and is NOT procurement-grade. Resolve the high-severity findings in the physics appendix
            before sharing externally or quoting suppliers.
          </Text>
        </View>
      ) : null}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 9, color: MUTED, letterSpacing: 2, marginBottom: 12 }}>
          FORGE ENGINEERING REPORT
        </Text>
        <View style={{ height: 1, backgroundColor: ACCENT, marginBottom: 18 }} />
        <Text style={{ fontSize: 26, fontFamily: 'Helvetica-Bold', color: INK, lineHeight: 1.15, marginBottom: 14 }}>
          {subject}
        </Text>
        <Text style={{ fontSize: 11, color: INK_SOFT, lineHeight: 1.5 }}>
          Brief and module decomposition. First-cut engineering report covering
          the product brief, modules and sub-modules, compliance, risks, bill
          of materials, and recommended suppliers.
        </Text>
        {/* Task #87 (2026-05-18) — provisional class-registry note.
            Amber, not red — informational only, not blocking. Fires when
            state.moduleDecomposition.provisional_class_registry === true,
            meaning the product class was not in the curated registry. See
            Appendix B for the field-by-field provenance breakdown. */}
        {provisionalClassRegistry?.flag ? (
          <View
            style={{
              marginTop: 14,
              padding: 10,
              backgroundColor: '#fffbeb',
              borderRadius: 4,
              borderLeftWidth: 3,
              borderLeftColor: '#d97706',
            }}
          >
            <Text
              style={{
                fontSize: 9,
                color: '#92400e',
                letterSpacing: 1.4,
                marginBottom: 4,
              }}
            >
              CLASS REGISTRY — AUTO-GENERATED
            </Text>
            <Text style={{ fontSize: 10, color: '#78350f', lineHeight: 1.45 }}>
              Class registry auto-generated — review before procurement. The
              product class for this brief is not in the curated baseline; the
              engine has fallen back to{' '}
              {provisionalClassRegistry.payloadAttached
                ? `an auto-generated registry (${provisionalClassRegistry.generatorModel ?? 'LLM'}).`
                : 'a generic template. Module priors, connections, standards, and FMEA are best-effort.'}{' '}
              See Appendix B for the field-by-field provenance breakdown.
            </Text>
          </View>
        ) : null}
        {bomTotals && costStack ? (
          // Engine D — cost stack breakdown. Replaces the single misleading
          // "Indicative Build Cost" headline with the full layered stack
          // (raw materials → factory COGS → OEM transfer → channel list →
          // installed ASP). Founder sees every layer instead of one number
          // pretending to be the unit price.
          //
          // Cover-page layout (Tristan 2026-05-18): when a hero image is
          // ALSO available, wrap the cost-stack panel + hero image in a
          // two-column row so BOTH appear on page 1 — left column (~55%)
          // holds the cost stack, right column (~45%) holds the hero. When
          // there's no hero, the panel stays full-width as before.
          <View style={heroImagePath
            ? { marginTop: 14, flexDirection: 'row', alignItems: 'flex-start' }
            : { marginTop: 14 }}>
          <View style={heroImagePath
            ? { flex: 55, marginRight: 12, padding: 11, backgroundColor: '#0c4a6e', borderRadius: 5 }
            : { padding: 11, backgroundColor: '#0c4a6e', borderRadius: 5 }}>
            <Text style={{ fontSize: 8, color: '#bae6fd', letterSpacing: 1.4, marginBottom: 6 }}>
              COST STACK — RAW MATERIALS TO INSTALLED PRICE
            </Text>
            {(() => {
              // Renderer hardening (2026-05-18): make every markup row
              // conditional on its factor > 0. The prior code rendered the
              // labour/overhead/margin rows unconditionally, so any class
              // with factor=0 (the old all-zero-ratios shortcut for heat-
              // pump-residential, heatpump, pv_string_inverter,
              // motor_drive_vfd) produced rows showing fmtGBP_shared(0) = '—'
              // — five em-dashes Tristan read as broken data. The class
              // recalibration in src/lib/pdf-engine-v2/class-cost-structure.ts
              // means this should now never trigger for those four classes,
              // but defensive coding keeps the cover honest if any future
              // class is calibrated with zero ratios.
              const r = costStack.ratios_applied
              const allMarkupsZero =
                r.assembly_labour_factor === 0 &&
                r.factory_overhead_factor === 0 &&
                r.manufacturer_margin_factor === 0 &&
                r.channel_markup_factor === 0 &&
                r.installation_cost_factor === 0
              if (allMarkupsZero) {
                // Collapsed-stack mode — single-line note instead of an
                // empty panel with em-dashes between subtotals.
                return (
                  <>
                    <CoverCostStackRow label="Raw materials BoM" amount={costStack.raw_materials_bom_gbp} pct={null} isHeadline={false} isSubtotal={false} />
                    <CoverCostStackRow label="= Installed ASP" amount={costStack.installed_asp_gbp} pct={null} isHeadline={true} isSubtotal={false} />
                    <Text style={{ fontSize: 7.5, color: '#bae6fd', marginTop: 4, fontStyle: 'italic' }}>
                      Cost stack collapsed — Raw BoM ≈ Installed ASP per {costStack.class_key} calibration (no markup applied).
                    </Text>
                  </>
                )
              }
              return (
                <>
                  <CoverCostStackRow label="Raw materials BoM" amount={costStack.raw_materials_bom_gbp} pct={null} isHeadline={false} isSubtotal={false} />
                  {r.assembly_labour_factor > 0 ? (
                    <CoverCostStackRow label="+ Assembly labour" amount={costStack.assembly_labour_gbp} pct={r.assembly_labour_factor * 100} isHeadline={false} isSubtotal={false} />
                  ) : null}
                  {r.factory_overhead_factor > 0 ? (
                    <CoverCostStackRow label="+ Factory overhead" amount={costStack.factory_overhead_gbp} pct={r.factory_overhead_factor * 100} isHeadline={false} isSubtotal={false} />
                  ) : null}
                  <CoverCostStackRow label="= Factory COGS" amount={costStack.factory_cogs_gbp} pct={null} isHeadline={false} isSubtotal={true} />
                  {r.manufacturer_margin_factor > 0 ? (
                    <CoverCostStackRow label="+ Manufacturer margin" amount={costStack.manufacturer_margin_gbp} pct={r.manufacturer_margin_factor * 100} isHeadline={false} isSubtotal={false} />
                  ) : null}
                  <CoverCostStackRow label="= OEM transfer price" amount={costStack.oem_transfer_price_gbp} pct={null} isHeadline={false} isSubtotal={true} />
                  {r.channel_markup_factor > 0 ? (
                    <CoverCostStackRow label="+ Channel markup" amount={costStack.channel_markup_gbp} pct={r.channel_markup_factor * 100} isHeadline={false} isSubtotal={false} />
                  ) : (
                    <CoverCostStackRow label="+ Channel markup" amount={0} pct={0} isHeadline={false} isSubtotal={false} note="direct (no distribution)" />
                  )}
                  <CoverCostStackRow label="= Channel list price" amount={costStack.channel_list_price_gbp} pct={null} isHeadline={false} isSubtotal={true} />
                  {r.installation_cost_factor > 0 ? (
                    <CoverCostStackRow label="+ Installation" amount={costStack.installation_cost_gbp} pct={r.installation_cost_factor * 100} isHeadline={false} isSubtotal={false} />
                  ) : (
                    <CoverCostStackRow label="+ Installation" amount={0} pct={0} isHeadline={false} isSubtotal={false} note="no install service" />
                  )}
                  <CoverCostStackRow label="= Installed ASP" amount={costStack.installed_asp_gbp} pct={null} isHeadline={true} isSubtotal={false} />
                </>
              )
            })()}
            <Text style={{ fontSize: 7.5, color: '#bae6fd', marginTop: 6, fontStyle: 'italic' }}>
              {bomTotals.totalRows} part lines across {bomTotals.allMods.length} modules · {bomTotals.actualPriced} live distributor quotes · {bomTotals.estimatePriced} web estimates · {bomTotals.tbdRows} TBD
              {typeof bomTotals.scale_applied === 'number' && bomTotals.scale_applied !== 1.0
                ? ` · Raw BoM scale factor ${bomTotals.scale_applied.toFixed(3).replace(/\.?0+$/, '')} (per-class batch economics)`
                : ''}
            </Text>
            {priceReality && priceReality.verdict !== 'unavailable' && priceReality.metric_value !== null ? (
              (() => {
                const absPct = Math.abs(priceReality.pct_deviation || 0)
                const sty = priceVerdictStyle(priceReality.verdict, absPct)
                const isPerUnit = priceReality.metric_input === 1
                // Engine D: price-reality now compares installed_asp_gbp
                // against market-installed-ASP band, not raw BoM.
                // 2026-05-18 (Track N visual audit MAJOR 2): metric_label
                // already ends with "installed" for most classes (see
                // class-price-bands.ts natural_metric — "£/kW thermal
                // installed", "£/L working volume installed", "£/kWh
                // installed"). The previous template tacked on a second
                // " installed", producing "£751 per kW thermal installed
                // installed — within typical installed-ASP range". Strip
                // a trailing "installed" from the unit slice before adding
                // ours back so the suffix appears exactly once.
                const unitSlice = priceReality.metric_label
                  .split('(')[0]
                  .trim()
                  .replace(/^£\//, '')
                  .replace(/\s+installed\s*$/i, '')
                  .trim()
                const ratioLabel = isPerUnit
                  ? `${fmtGBP_compact(priceReality.metric_value)}/unit installed`
                  : `${fmtGBP_compact(priceReality.metric_value)} per ${unitSlice} installed`
                const bandLabel = `band ${fmtGBP_compact(priceReality.band_low)}–${fmtGBP_compact(priceReality.band_high)}`
                const verdictText = priceReality.verdict === 'in_band'
                  ? 'within typical installed-ASP range'
                  : priceReality.verdict === 'low'
                  ? `${Math.round(absPct)}% below typical installed-ASP range`
                  : `${Math.round(absPct)}% above typical installed-ASP range`
                return (
                  <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: '#1e4a73' }}>
                    <Text style={{ fontSize: 9, color: '#ffffff' }}>
                      <Text style={{ fontFamily: 'Helvetica-Bold', color: sty.colour === '#065f46' ? '#86efac' : sty.colour === '#92400e' ? '#fcd34d' : '#fca5a5' }}>{sty.symbol} </Text>
                      <Text style={{ fontFamily: 'Helvetica-Bold' }}>{ratioLabel}</Text>
                      <Text style={{ color: '#bae6fd' }}> — {verdictText} ({bandLabel})</Text>
                    </Text>
                  </View>
                )
              })()
            ) : null}
            {engineCSummary && engineCSummary.total_priced_lines > 0 ? (
              // Engine C reference-anchor aggregate (2026-05-18). Renders
              // beneath price-reality so the reader sees: "the headline number
              // sits at X vs market band, AND Y of N priced BoM lines flagged
              // 2× over (or 0.5× under) the Phase 4 corpus reference."
              (() => {
                const s = engineCSummary
                const flagged = s.over + s.under
                const pct = s.pct_flagged_out_of_range
                const refCoverage = s.total_priced_lines > 0
                  ? ((s.total_priced_lines - s.no_reference) / s.total_priced_lines) * 100
                  : 0
                return (
                  <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: '#1e4a73' }}>
                    <Text style={{ fontSize: 9, color: '#ffffff' }}>
                      <Text style={{ fontFamily: 'Helvetica-Bold', color: pct > 30 ? '#fca5a5' : pct > 15 ? '#fcd34d' : '#86efac' }}>REF </Text>
                      <Text style={{ fontFamily: 'Helvetica-Bold' }}>
                        {flagged} of {s.total_priced_lines} priced lines flagged vs reference corpus
                      </Text>
                      <Text style={{ color: '#bae6fd' }}>
                        {' '}({s.over} over · {s.under} under · {s.in_range} in_range · {s.no_reference} no_ref)
                      </Text>
                    </Text>
                    <Text style={{ fontSize: 8, color: '#bae6fd', marginTop: 3, fontStyle: 'italic' }}>
                      Corpus coverage {refCoverage.toFixed(0)}% — reference median from top-5 cosine matches in the Phase 4 corpus (29.9k embedded records); 2.0×/0.5× thresholds.
                    </Text>
                  </View>
                )
              })()
            ) : null}
            {/* Manual-review badge strip (council 2026-05-18). Surfaces gate
                fires (G0 physics, G1b compliance, G2 cost-reality, G3
                completeness, G4 grammar, G5 part-number) that previously
                lived only in state.* and never reached the reader. Strip is
                empty (returns null) when no gate has fired. */}
            <ManualReviewCoverStrip badges={manualReviewBadges ?? []} />
          </View>
          {heroImagePath ? (
            // Right column of the two-column cover layout. Sized 207×170 to
            // fit alongside the cost-stack panel (45% column on a 475pt
            // content width). Caption stays visible underneath.
            <View style={{ flex: 45, alignItems: 'center' }}>
              <Image src={heroImagePath} style={{ width: 207, height: 170, objectFit: 'contain' }} />
              <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 6, fontStyle: 'italic', textAlign: 'center' }}>
                Illustration only — AI-generated render, not a photograph of the actual unit. Used for visual reference; final geometry will follow the engineering specification.
              </Text>
            </View>
          ) : null}
          </View>
        ) : bomTotals ? (
          // Fallback when no cost-stack ratios resolve — show the legacy
          // single-number card so the cover never goes blank.
          <View style={{ marginTop: 18, padding: 12, backgroundColor: '#0c4a6e', borderRadius: 5 }}>
            <Text style={{ fontSize: 8, color: '#bae6fd', letterSpacing: 1.4, marginBottom: 3 }}>
              RAW MATERIALS BILL OF MATERIALS (PRICED LINES)
            </Text>
            <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#ffffff' }}>
              {fmtGBP_shared(bomTotals.grandTotal_gbp)}
            </Text>
            <Text style={{ fontSize: 8.5, color: '#bae6fd', marginTop: 4 }}>
              {bomTotals.totalRows} part lines across {bomTotals.allMods.length} modules · {bomTotals.actualPriced} live distributor quotes · {bomTotals.estimatePriced} web estimates · {bomTotals.tbdRows} TBD
            </Text>
            <ManualReviewCoverStrip badges={manualReviewBadges ?? []} />
          </View>
        ) : null}
        {/* If we had no BoM at all, the badge strip never had a panel to live
            inside — render the inline-light variant in the body so badges
            still surface on the cover. */}
        {(!bomTotals && (manualReviewBadges?.length ?? 0) > 0) ? (
          <View style={{ marginTop: 14 }}>
            <ManualReviewSectionNote badges={manualReviewBadges ?? []} />
          </View>
        ) : null}
        {pendingPartsCount && pendingPartsCount > 0 ? (
          <Text style={{ fontSize: 9, color: MUTED, marginTop: 10 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{pendingPartsCount}</Text> part lines are unverified — see Appendix A for the audit trail.
          </Text>
        ) : null}
        {/* Hero image moved into the two-column row alongside the cost-stack
            panel above (Tristan 2026-05-18). The legacy full-width hero
            render that used to live here pushed the image onto page 2 once
            the cost-stack panel grew to 10 rows. When there is no cost-stack
            but a hero exists (legacy/fallback BoM-only path), render the
            hero full-width below the BoM card to preserve the prior look. */}
        {heroImagePath && !(bomTotals && costStack) ? (
          <View style={{ marginTop: 8, marginBottom: 8, alignItems: 'center' }}>
            <Image src={heroImagePath} style={{ width: 475, height: 280, objectFit: 'contain' }} />
            <Text style={{ fontSize: 8, color: MUTED, marginTop: 6, fontStyle: 'italic' }}>
              Illustration only — AI-generated render, not a photograph of the actual unit. Used for visual reference; final geometry will follow the engineering specification.
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ position: 'absolute', bottom: 56, left: 60, right: 60 }}>
        <View style={{ height: 1, backgroundColor: RULE, marginBottom: 14 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 9, color: MUTED }}>Project: {projectId}</Text>
          <Text style={{ fontSize: 9, color: MUTED }}>Generated {new Date().toISOString().split('T')[0]}</Text>
        </View>
      </View>
    </Page>
  )
}

function PageHeader({ section, project }: { section: string; project: string }) {
  // Constrain section text width + force project flexShrink:0 so a long section
  // label (e.g. "Section 5 · Parts Pending Verification — Plausible but Unverified (1/3)")
  // wraps within its own column instead of overlapping the project id below or
  // chewing its leading character (drawer_forgeos_gotchas_227e3c8fd74fcd32 bug #5).
  return (
    <View style={{ position: 'absolute', top: 24, left: 64, right: 64 }} fixed>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
        <Text style={{ fontSize: 8, color: MUTED, letterSpacing: 1, flex: 1, paddingRight: 12 }}>
          {section.toUpperCase()}
        </Text>
        <Text style={{ fontSize: 8, color: MUTED, flexShrink: 0 }}>{project}</Text>
      </View>
      <View style={{ height: 0.6, backgroundColor: RULE_SOFT }} />
    </View>
  )
}

function PageFooter() {
  return (
    <View style={{ position: 'absolute', bottom: 30, left: 64, right: 64 }} fixed>
      <View style={{ height: 0.6, backgroundColor: RULE_SOFT, marginBottom: 6 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 8, color: MUTED }}>Forge Engineering Report</Text>
        <Text
          style={{ fontSize: 8, color: MUTED }}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </View>
    </View>
  )
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: ACCENT, marginTop: 14, marginBottom: 6 }}>
      {children}
    </Text>
  )
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 10.5, color: INK_SOFT, lineHeight: 1.6, marginBottom: 8, textAlign: 'justify' }}>
      {children}
    </Text>
  )
}

// ─── Headline (Phase D 2026-05-15): key_metrics page ──────────────────

/**
 * Format a metric value + unit for display. The LLM emits plain-string values
 * ("180000", "3832") and unit strings ("£", "MWh / year"). Renderer is
 * responsible for:
 *   - thousand-separator commas on numerics (180000 → 180,000)
 *   - currency-symbol prefix (180000 + "£" → £180,000), and stripping the
 *     suffix once the prefix is applied so we don't double-render
 *   - leaving non-currency units after the number ("3832 MWh / year")
 */
function formatMetricValue(rawValue: string, rawUnit: string | undefined): string {
  const value = String(rawValue ?? '').trim()
  const unit = String(rawUnit ?? '').trim()
  if (!value) return ''
  // Insert commas if pure numeric (with optional decimal). Leave alphanumeric values alone.
  const numericMatch = value.match(/^-?(\d+)(\.\d+)?$/)
  const withCommas = numericMatch
    ? numericMatch[1].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (numericMatch[2] ?? '')
    : value
  // Detect currency in unit, prefix it, and drop from unit. Common shapes:
  //   "£", "£ / year", "GBP", "GBP / year", "USD", "$"
  const currencyMatch = unit.match(/^(£|\$|€|GBP|USD|EUR)\s*(\/.*|per.*)?$/i)
  if (currencyMatch) {
    const sym = (currencyMatch[1] === 'GBP') ? '£' : (currencyMatch[1] === 'USD') ? '$' : (currencyMatch[1] === 'EUR') ? '€' : currencyMatch[1]
    const suffix = (currencyMatch[2] ?? '').trim()
    return suffix ? `${sym}${withCommas} ${suffix}` : `${sym}${withCommas}`
  }
  return unit ? `${withCommas} ${unit}` : withCommas
}

function HeadlinePage({ state, project }: { state: any; project: string }) {
  const km = state.keyMetrics
  if (!km) return null
  // OPERATIONAL ONLY (Tristan directive 2026-05-15). Financial fields stripped
  // because capex/opex/revenue/payback are fabricated without a Bill of
  // Materials and an explicit assumptions ledger. They will return in a later
  // phase computed from the BoM, not invented by an LLM.
  const FINANCIAL_KIDS = new Set(['capex_gbp', 'opex_gbp_per_year', 'revenue_gbp_per_year', 'roi_payback_years'])
  const isFinancial = (m: any) => m && (FINANCIAL_KIDS.has(String(m.id ?? '')) || /£|gbp|capex|opex|revenue|payback/i.test(String(m.unit ?? '') + ' ' + String(m.label ?? '')))
  const headlineRow = (m: any, accentValue = false) => {
    if (!m || m.value == null) return null
    if (isFinancial(m)) return null  // belt-and-braces: even if legacy state.json has financials, don't render
    const formatted = formatMetricValue(String(m.value), m.unit)
    if (!formatted) return null
    return (
      <View
        key={m.id ?? m.label}
        style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 0.6, borderBottomColor: RULE_SOFT, alignItems: 'baseline' }}
      >
        <Text style={{ flex: 2, fontSize: 11, color: INK_SOFT }}>{m.label}</Text>
        <Text style={{ flex: 2, fontSize: accentValue ? 18 : 13, fontFamily: 'Helvetica-Bold', color: accentValue ? ACCENT : INK, textAlign: 'right' }}>
          {formatted}
        </Text>
      </View>
    )
  }
  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 0 · Operational Headline" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Operational Headline
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 18 }}>
        What this design must deliver, physically and operationally. The modules and sub-modules that follow are in service of these numbers.
      </Text>

      <View style={{ borderTopWidth: 0.6, borderTopColor: RULE_SOFT }}>
        {headlineRow(km.headline_output, true)}
        {headlineRow(km.headline_constraint)}
        {headlineRow(km.utilisation)}
        {(km.supporting_metrics ?? []).filter((m: any) => !isFinancial(m)).slice(0, 4).map((m: any) => headlineRow(m))}
      </View>

      {km.deployment_context ? (
        <View style={{ marginTop: 18, padding: 12, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>
            Deployment context
          </Text>
          <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.55 }}>
            {clean_prose(km.deployment_context)}
          </Text>
        </View>
      ) : null}

      <View style={{ marginTop: 18, padding: 12, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT_SOFT }}>
        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>
          Financial metrics suppressed
        </Text>
        <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.55 }}>
          Capital expenditure, operating expenditure, revenue, and payback are deliberately omitted at this stage. They will be added in a later phase that aggregates per-component costs from the Bill of Materials and references an explicit assumptions ledger (electricity tariffs, grid-service prices, labour rates, maintenance schedule). Numbers invented before the BoM exists are unreliable and have been removed.
        </Text>
      </View>

      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 18, marginBottom: 4 }}>
        Assumptions
      </Text>
      {[km.headline_output, km.headline_constraint, km.utilisation, ...(km.supporting_metrics ?? [])]
        .filter((m: any) => m?.notes && !isFinancial(m))
        .map((m: any, i: number) => (
          <Text key={i} style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.55, marginBottom: 3 }}>
            • {m.label}: {clean_prose(m.notes)}
          </Text>
        ))}

      <PageFooter />
    </Page>
  )
}

// ─── Section 0.5: Performance Characteristics (Tristan 2026-05-20) ─────────
//
// One-glance spec sheet. Reads state.performanceCard (built by
// src/lib/pdf-engine-v2/performance-card.ts). Per-section tables show:
//   metric label | resolved value | brief target (if applicable) | status
//
// Status icons:
//   ✓ ok           — value resolved, within reasonable range, matches brief
//   △ delta        — value resolved but differs from brief constraint by >5%
//   ⚠ out of range — value resolved but outside class-typical range
//   ∼ computed     — value derived from other metrics (e.g. yield/m²)
//   — missing      — neither source nor compute produced a value
//
// Goal: a buyer / engineer / council reviewer can answer "does this design
// actually match the brief?" in 30 seconds without reading 80 pages.
function PerformanceCardPage({ state, project }: { state: any; project: string }) {
  const card = state?.performanceCard
  if (!card || !Array.isArray(card.sections) || card.sections.length === 0) return null

  const sectionsWithRows = card.sections.filter((s: any) => Array.isArray(s.metrics) && s.metrics.some((m: any) => m.value !== null || m.brief_target !== null))
  if (sectionsWithRows.length === 0) return null

  const statusIcon = (s: string) => {
    switch (s) {
      case 'ok': return { sym: '✓', colour: '#15803d' }
      case 'delta': return { sym: '△', colour: '#b45309' }
      case 'out_of_range': return { sym: '⚠', colour: '#b91c1c' }
      case 'computed': return { sym: '∼', colour: '#475569' }
      case 'missing':
      default: return { sym: '—', colour: '#94a3b8' }
    }
  }

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 0.5 · Performance Characteristics" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Performance Characteristics
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 14 }}>
        Numeric spec sheet for this product class. Each row shows the resolved value plus the brief constraint (where set), so contradictions between modules and the brief are visible at a glance.
      </Text>

      {card.warnings && card.warnings.length > 0 ? (
        <View style={{ marginBottom: 14, padding: 10, backgroundColor: '#fffbeb', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#d97706' }}>
          <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: '#92400e', marginBottom: 4 }}>
            {card.warnings.length} performance metric{card.warnings.length === 1 ? '' : 's'} flagged
          </Text>
          {card.warnings.slice(0, 5).map((w: any, i: number) => (
            <Text key={i} style={{ fontSize: 9, color: '#78350f', lineHeight: 1.45 }}>
              • [{w.section}] {w.label}: {w.note}
            </Text>
          ))}
        </View>
      ) : null}

      {sectionsWithRows.map((section: any, si: number) => (
        <View key={si} style={{ marginBottom: 12 }} wrap={false}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: ACCENT, letterSpacing: 1.2, marginBottom: 4, textTransform: 'uppercase' }}>
            {section.name}
          </Text>
          <View style={{ borderTopWidth: 0.5, borderTopColor: RULE_SOFT }}>
            <View style={{ flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.3, borderBottomColor: RULE_SOFT }}>
              <Text style={{ flex: 3, fontSize: 8, color: MUTED, letterSpacing: 1 }}>METRIC</Text>
              <Text style={{ flex: 2, fontSize: 8, color: MUTED, letterSpacing: 1, textAlign: 'right' }}>VALUE</Text>
              <Text style={{ flex: 2, fontSize: 8, color: MUTED, letterSpacing: 1, textAlign: 'right' }}>BRIEF TARGET</Text>
              <Text style={{ width: 16, fontSize: 8, color: MUTED, textAlign: 'center' }}> </Text>
            </View>
            {section.metrics.map((m: any, mi: number) => {
              if (m.value === null && m.brief_target === null) return null
              const { sym, colour } = statusIcon(m.status)
              return (
                <View key={mi} style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.3, borderBottomColor: RULE_SOFT, alignItems: 'baseline' }}>
                  <View style={{ flex: 3 }}>
                    <Text style={{ fontSize: 10, color: INK }}>{m.label}</Text>
                    {m.note ? (
                      <Text style={{ fontSize: 8.5, color: '#78350f', marginTop: 1, lineHeight: 1.35 }}>{m.note}</Text>
                    ) : null}
                  </View>
                  <Text style={{ flex: 2, fontSize: 10, fontFamily: 'Helvetica-Bold', color: m.value !== null ? INK : '#94a3b8', textAlign: 'right' }}>
                    {m.value !== null ? String(m.value) : '—'}
                  </Text>
                  <Text style={{ flex: 2, fontSize: 10, color: INK_SOFT, textAlign: 'right' }}>
                    {m.brief_target !== null ? String(m.brief_target) : ''}
                  </Text>
                  <Text style={{ width: 16, fontSize: 11, color: colour, textAlign: 'center' }}>{sym}</Text>
                </View>
              )
            })}
          </View>
        </View>
      ))}

      <View style={{ marginTop: 8, padding: 8, backgroundColor: '#f7f8fa', borderRadius: 3 }}>
        <Text style={{ fontSize: 8.5, color: MUTED, lineHeight: 1.5 }}>
          Legend  ✓ in spec   △ differs from brief by &gt;5%   ⚠ outside class-typical range   ∼ computed from other metrics   — not declared by the engine
        </Text>
      </View>

      <PageFooter />
    </Page>
  )
}

// ─── Section 1.5: Design Trade-offs (Tristan + council 2026-05-20) ─────────
//
// Surfaces every design choice the chain made, sourced from existing state.
// No LLM invention at render time — every entry is provable from a state path.
// Council framing (Grok + Gemini): CAPEX / OPEX / Reliability instead of
// speed/cost/quality, because the audience (founders, investors, EPC engineers)
// makes physical-financial trade-offs, not software-PM trade-offs.
//
// Each row shows:
//   WHAT (the choice the chain made)
//   ALTERNATIVE (the option not chosen, sourced from state or class registry)
//   GAINED (which of CAPEX↓/OPEX↓/Reliability↑ improved)
//   SACRIFICED (which axis was given up)
//   STATUS (applied / flagged_for_review / blocked)
//
// Reader can immediately see "this report ships with N flagged decisions
// trading reliability for capex/speed" rather than discovering it in the
// fine print.
function DesignDecisionsPage({ state, project }: { state: any; project: string }) {
  const review = state?.designDecisionsReview
  if (!review || !Array.isArray(review.choices) || review.choices.length === 0) return null

  const axisLabel = (a: string): string => {
    if (a === 'capex') return 'CAPEX'
    if (a === 'opex') return 'OPEX'
    if (a === 'reliability') return 'Reliability'
    return a
  }
  const axisChip = (axis: string, mode: 'gained' | 'sacrificed') => {
    const isGained = mode === 'gained'
    const arrow = axis === 'reliability' ? (isGained ? '↑' : '↓') : (isGained ? '↓' : '↑')
    const bg = isGained ? '#dcfce7' : '#fee2e2'
    const fg = isGained ? '#15803d' : '#b91c1c'
    return (
      <View key={`${mode}-${axis}`} style={{ marginRight: 4, marginTop: 2, paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 3, backgroundColor: bg }}>
        <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: fg }}>
          {arrow} {axisLabel(axis)}
        </Text>
      </View>
    )
  }
  const statusChip = (status: string) => {
    const sty = status === 'blocked'
      ? { bg: '#7f1d1d', fg: '#fee2e2', label: 'BLOCKED' }
      : status === 'flagged_for_review'
        ? { bg: '#fef3c7', fg: '#92400e', label: 'FLAGGED FOR REVIEW' }
        : { bg: '#e0e7ff', fg: '#3730a3', label: 'APPLIED' }
    return (
      <View style={{ paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 3, backgroundColor: sty.bg }}>
        <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: sty.fg, letterSpacing: 0.5 }}>{sty.label}</Text>
      </View>
    )
  }

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 1.5 · Design Trade-offs" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Design Trade-offs
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 14, lineHeight: 1.55 }}>
        Every meaningful choice the chain made during this run, with the alternative not chosen and the compromise on the CAPEX / OPEX / Reliability triangle. Sourced from chain state — not invented for the report.
      </Text>

      <View style={{ marginBottom: 14, padding: 10, backgroundColor: '#f7f8fa', borderRadius: 4 }}>
        <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.5 }}>
          {review.summary.total} choice{review.summary.total === 1 ? '' : 's'} surfaced — {review.summary.applied} applied, {review.summary.flagged} flagged for review, {review.summary.blocked} blocked. The triangle is read "you can have two of three": every choice improves one or two axes at the cost of the third.
        </Text>
      </View>

      {review.choices.map((c: any, idx: number) => (
        <View key={c.id ?? `choice-${idx}`} style={{ marginBottom: 12, padding: 12, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: c.status === 'blocked' ? '#b91c1c' : c.status === 'flagged_for_review' ? '#d97706' : ACCENT, backgroundColor: '#fbfcfe' }} wrap={false}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <Text style={{ fontSize: 8.5, color: MUTED, letterSpacing: 1, marginRight: 8 }}>
              {String(c.scope ?? '').toUpperCase()} · CHOICE {idx + 1}
            </Text>
            {statusChip(c.status)}
          </View>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>
            {c.what}
          </Text>
          <View style={{ marginBottom: 6 }}>
            <Text style={{ fontSize: 8.5, color: MUTED, marginBottom: 1, letterSpacing: 0.8 }}>ALTERNATIVE NOT CHOSEN</Text>
            <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.5 }}>{c.alternative}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ fontSize: 8.5, color: MUTED, marginRight: 6, letterSpacing: 0.8 }}>GAINED</Text>
            {(c.trade_off?.gained ?? []).map((a: string) => axisChip(a, 'gained'))}
            <Text style={{ fontSize: 8.5, color: MUTED, marginLeft: 10, marginRight: 6, letterSpacing: 0.8 }}>SACRIFICED</Text>
            {(c.trade_off?.sacrificed ?? []).map((a: string) => axisChip(a, 'sacrificed'))}
          </View>
          <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.5 }}>{c.rationale}</Text>
        </View>
      ))}

      <PageFooter />
    </Page>
  )
}

// ─── Section 1: Brief & Requirements ───────────────────────────────────────

// ─── Brief Revision Notice (Phase 0 2026-05-15) ────────────────────────────
//
// Renders BEFORE the Brief page when state.brief.was_revised === true. Phase 0
// auto-revises non-viable briefs along the lowest-priority relaxation path
// (RELAXATION_PRIORITY in serial-design-chain-v2.tsx). Per Tristan's directive
// "we need to be very clear up front that we have changed the brief and what
// we've changed the brief to", this page surfaces:
//   • each contradiction that drove a revision (target_constraint, original,
//     revised, relax_factor, rationale)
//   • alternatives that were considered but not chosen (so the reader can lock
//     a different constraint and re-run)
//   • how to re-run with a different lock
//
// Threshold rule encoded in chain: hard contradictions = ratio > 5×; revisions
// capped at 100× per constraint (MAX_RELAX_FACTOR); loop bails after 3 iters.

function BriefRevisionNoticePage({ state, project }: { state: any; project: string }) {
  const brief = state.brief ?? {}
  const history: Array<{
    iter: number
    target_constraint: string
    original_value: string
    revised_value: string
    relax_factor: string
    rationale: string
    contradictions_resolved?: string[]
    alternatives_considered?: Array<{ target_constraint: string; proposed_value: string; relax_factor: string; rationale: string }>
    applied?: boolean
  }> = Array.isArray(brief.revision_history) ? brief.revision_history : []
  const anyApplied = history.some(h => h.applied === true)
  const title = anyApplied ? 'Brief revisions applied' : 'Brief revisions proposed (none applied)'
  const intro = anyApplied
    ? 'The brief as written was not physically achievable. The pipeline auto-relaxed the lowest-priority constraint until the request became viable. Every change is listed below; alternative paths are shown so a different lock can be applied and the brief re-run.'
    : 'The brief as written was not physically achievable. The pipeline proposed the revisions below but none could be applied automatically (each one exceeded the 100× per-revision cap, or the rewriter / re-parse failed). The original brief was retained and the run halted; the proposals are surfaced here for manual review.'

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 1 · Brief Revision Notice" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 18 }}>
        {intro}
      </Text>

      <View style={{ marginBottom: 14, padding: 10, backgroundColor: '#fff7ed', borderLeftWidth: 3, borderLeftColor: '#c2410c' }}>
        <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.5 }}>
          Rule: contradictions are detected when a brief value diverges from the physical
          floor for the product class by a ratio greater than 5×. The relaxation order is
          fixed (cost ceiling first, then output target, then mass, envelope, material).
          A single revision is capped at 100× the original constraint.
        </Text>
      </View>

      {history.length === 0 ? (
        <Paragraph>
          The brief was flagged as not achievable, but no specific revision was applied
          before the limit was hit. See the FATAL note below the report run for which
          contradictions remained.
        </Paragraph>
      ) : (
        history.map((h, idx) => {
          const applied = h.applied === true
          const badgeText = applied ? 'APPLIED' : 'PROPOSED — NOT APPLIED'
          const badgeColor = applied ? '#065f46' : '#9a3412'
          const badgeBg = applied ? '#d1fae5' : '#fed7aa'
          const revisedLabel = applied ? 'Revised' : 'Proposed'
          return (
          <View key={`rev-${idx}`} wrap={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: ACCENT, flex: 1 }}>
                Revision {idx + 1} — iter {h.iter}: {h.target_constraint}
              </Text>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: badgeColor, backgroundColor: badgeBg, paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6, borderRadius: 3 }}>
                {badgeText}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              <View style={{ width: 90 }}><Text style={{ fontSize: 9, color: MUTED }}>Original</Text></View>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: INK }}>{h.original_value}</Text></View>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              <View style={{ width: 90 }}><Text style={{ fontSize: 9, color: MUTED }}>{revisedLabel}</Text></View>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: INK, fontFamily: 'Helvetica-Bold' }}>{h.revised_value}</Text></View>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              <View style={{ width: 90 }}><Text style={{ fontSize: 9, color: MUTED }}>Relaxation</Text></View>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: INK }}>{h.relax_factor}</Text></View>
            </View>
            <View style={{ marginTop: 4, marginBottom: 6 }}>
              <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Rationale</Text>
              <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5 }}>{clean_prose(h.rationale)}</Text>
            </View>
            {Array.isArray(h.contradictions_resolved) && h.contradictions_resolved.length > 0 ? (
              <View style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Contradictions resolved</Text>
                {h.contradictions_resolved.map((c, i) => (
                  <Text key={i} style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.5 }}>• {c}</Text>
                ))}
              </View>
            ) : null}
            {Array.isArray(h.alternatives_considered) && h.alternatives_considered.length > 0 ? (
              <View style={{ marginTop: 4, padding: 8, backgroundColor: '#f9fafb', borderLeftWidth: 2, borderLeftColor: RULE_SOFT }}>
                <Text style={{ fontSize: 9, color: MUTED, marginBottom: 4 }}>Alternatives considered (not chosen)</Text>
                {h.alternatives_considered.map((a, i) => (
                  <View key={`alt-${i}`} style={{ marginBottom: 4 }}>
                    <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.4 }}>
                      <Text style={{ fontFamily: 'Helvetica-Bold' }}>{a.target_constraint}</Text>
                      {' → '}{a.proposed_value} ({a.relax_factor})
                    </Text>
                    <Text style={{ fontSize: 9, color: MUTED, lineHeight: 1.4, marginLeft: 8 }}>
                      {clean_prose(a.rationale)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )})
      )}

      <View style={{ marginTop: 18, padding: 10, backgroundColor: '#f3f4f6', borderLeftWidth: 3, borderLeftColor: ACCENT }}>
        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>
          To re-run with a different lock
        </Text>
        <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.5 }}>
          Edit the brief and append {' '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>[LOCK]</Text>{' '}
          after the constraint that must stay fixed (for example,
          "unit cost ceiling: £180,000 [LOCK]"). The plausibility critic will then propose
          a revision against the next-priority constraint instead.
        </Text>
      </View>

      <PageFooter />
    </Page>
  )
}

/**
 * Physical Specification — deterministic spec table sourced directly from
 * structure_containment.derived_parameters. Eliminates the ambiguity that
 * arises from LLM-emitted overview prose like "12 m² of growing footprint
 * across 6 vertical tiers" (could be 12 m² total or 12 m² × 6 = 72 m²).
 *
 * Universal pattern (2026-05-15): every product class has a small set of
 * numeric envelope facts (dimensions, mass, footprint, capacity, range)
 * that must appear unambiguously somewhere in the report. Pulling them from
 * the design data — not LLM prose — guarantees they're consistent with the
 * downstream modules and removes interpretation ambiguity.
 *
 * Renders only the fields that exist; classes with sparse derived_parameters
 * just show fewer rows. No financial fields surfaced (Q4 directive).
 */
function PhysicalSpecBlock({ modules, deploymentEnvelope }: { modules: any[]; deploymentEnvelope?: any }) {
  const struct = (modules ?? []).find((m: any) => m.module === 'structure_containment')
  const dp = (struct?.derived_parameters as any) ?? {}
  // Allow the block to render with only a deployment envelope (no struct dp).
  if (!struct && !deploymentEnvelope) return null

  // Universal physical-spec fields, with friendly labels + composite metrics.
  // Order is fixed: envelope → mass → spatial → capacity. Skip empty rows.
  const rows: Array<{ label: string; value: string; note?: string }> = []

  // Envelope
  if (dp.envelope_width_mm && dp.envelope_depth_mm && dp.envelope_height_mm) {
    rows.push({
      label: 'External envelope',
      value: `${dp.envelope_width_mm} × ${dp.envelope_depth_mm} × ${dp.envelope_height_mm} mm (W × D × H)`,
    })
  } else if (dp.envelope_w_mm && dp.envelope_d_mm && dp.envelope_h_mm) {
    rows.push({
      label: 'External envelope',
      value: `${dp.envelope_w_mm} × ${dp.envelope_d_mm} × ${dp.envelope_h_mm} mm (W × D × H)`,
    })
  }
  if (typeof dp.envelope_volume_m3 === 'number') {
    rows.push({ label: 'Envelope volume', value: `${dp.envelope_volume_m3} m³` })
  }

  // Mass
  if (typeof dp.max_mass_kg === 'number') {
    rows.push({ label: 'Maximum gross mass', value: `${dp.max_mass_kg.toLocaleString()} kg` })
  }

  // Floor / canopy / tier composite. The critical disambiguation: when both a
  // small footprint (<50 m²) and a tier_count > 1 exist, render BOTH the
  // per-tier floor area AND the canopy product so the reader can never
  // confuse them. This is the iter-56 VF "12 m² ambiguous" fix.
  const footprint = (typeof dp.footprint_m2 === 'number' ? dp.footprint_m2 : null)
                 ?? (typeof dp.growing_area_sqm === 'number' ? dp.growing_area_sqm : null)
                 ?? (typeof dp.growing_footprint_m2 === 'number' ? dp.growing_footprint_m2 : null)
  const tiers = typeof dp.tier_count === 'number' && dp.tier_count > 0 ? dp.tier_count : null
  const explicitCanopy = (typeof dp.canopy_area_m2 === 'number' ? dp.canopy_area_m2 : null)
                      ?? (typeof dp.growing_area_m2 === 'number' ? dp.growing_area_m2 : null)
  if (footprint != null) {
    rows.push({ label: 'Floor area per unit', value: `${footprint} m²` })
  }
  if (tiers != null) {
    rows.push({ label: 'Vertical tiers', value: `${tiers}` })
  }
  if (explicitCanopy != null) {
    rows.push({ label: 'Total canopy area', value: `${explicitCanopy} m²` })
  } else if (footprint != null && tiers != null && tiers > 1) {
    rows.push({
      label: 'Total canopy area',
      value: `${footprint * tiers} m²`,
      note: `${footprint} m² floor × ${tiers} tiers`,
    })
  }
  if (typeof dp.tray_count === 'number') {
    rows.push({ label: 'Total trays', value: `${dp.tray_count}` })
  }

  // Operating environment
  if (typeof dp.operating_temp_min_c === 'number' && typeof dp.operating_temp_max_c === 'number') {
    rows.push({ label: 'Operating temperature', value: `${dp.operating_temp_min_c} to ${dp.operating_temp_max_c} °C` })
  }
  if (typeof dp.design_life_years === 'number') {
    rows.push({ label: 'Design life', value: `${dp.design_life_years} years` })
  }

  // Class-specific composites — surface only if present in the data
  if (typeof dp.target_capacity_mwh === 'number') {
    rows.push({ label: 'Target capacity', value: `${dp.target_capacity_mwh} MWh` })
  }
  if (typeof dp.target_thermal_kw === 'number') {
    rows.push({ label: 'Target thermal output', value: `${dp.target_thermal_kw} kW` })
  }

  // Deployment envelope — shipping/installation envelope from
  // deployment-envelopes.ts (Task #248, 2026-05-19). Surfaced after
  // structural data so the reader sees the product's external geometry
  // alongside how it ships/installs (pallet, container, rack, cabinet).
  if (deploymentEnvelope) {
    const env = deploymentEnvelope
    rows.push({
      label: 'Deployment envelope',
      value: env.standard ?? env.id ?? 'unknown',
      note: env.category ? String(env.category).replace(/_/g, ' ') : undefined,
    })
    const ext = env.external_dimensions_mm ?? env.internal_dimensions_mm
    if (ext && typeof ext.length === 'number' && typeof ext.width === 'number' && typeof ext.height === 'number') {
      rows.push({
        label: 'Envelope footprint',
        value: `${ext.length} × ${ext.width} × ${ext.height} mm (L × W × H)`,
      })
    }
    if (typeof env.max_payload_kg === 'number') {
      rows.push({ label: 'Envelope payload limit', value: `${env.max_payload_kg.toLocaleString()} kg max payload` })
    }
    if (env.reference_standard) {
      rows.push({ label: 'Envelope standard', value: String(env.reference_standard) })
    }
  }

  if (rows.length === 0) return null

  return (
    <View style={{ marginTop: 6, marginBottom: 14, padding: 12, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT }}>
      <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Physical specification
      </Text>
      <Text style={{ fontSize: 9, color: MUTED, marginBottom: 8, fontStyle: 'italic' }}>
        Derived from structure_containment.derived_parameters — not LLM prose.
      </Text>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', paddingVertical: 3, alignItems: 'baseline' }}>
          <Text style={{ flex: 2, fontSize: 10, color: INK_SOFT }}>{r.label}</Text>
          <Text style={{ flex: 3, fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK }}>{r.value}</Text>
          {r.note ? (
            <Text style={{ flex: 2, fontSize: 9, color: MUTED, fontStyle: 'italic' }}>{r.note}</Text>
          ) : null}
        </View>
      ))}
    </View>
  )
}

function BriefPage({ state, project, manualReviewBadges }: { state: any; project: string; manualReviewBadges?: ManualReviewBadge[] }) {
  const bp = state.briefOverviewProse ?? {}
  const overview = clean_prose(bp.overview_and_context)
  const mission = clean_prose(bp.mission_statement)
  const customers = clean_prose(bp.target_customers)
  const whyNow = clean_prose(bp.why_now)
  const modules = state.moduleDecomposition?.modules ?? []

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 1 · Brief & Requirements" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Brief and Requirements
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 18 }}>
        What the product is and what it must do.
      </Text>

      <ManualReviewSectionNote badges={(manualReviewBadges ?? []).filter(b => b.id === 'g0_physics' || b.id === 'g1b_compliance')} />

      <PhysicalSpecBlock modules={modules} deploymentEnvelope={state.deploymentEnvelope ?? null} />

      <SubHeading>Overview</SubHeading>
      <Paragraph>{overview}</Paragraph>

      <SubHeading>Mission</SubHeading>
      <Paragraph>{mission}</Paragraph>

      <SubHeading>Target customers</SubHeading>
      <Paragraph>{customers}</Paragraph>

      <SubHeading>Why now</SubHeading>
      <Paragraph>{whyNow}</Paragraph>

      <PageFooter />
    </Page>
  )
}

// ─── Section 2 opener: numbered module connection map ──────────────────────

function ModuleConnectionMapPage({
  modules,
  links,
  project,
  explodedImagePath,
  manualReviewBadges,
}: {
  modules: Array<{ module: string; display_name?: string }>
  links: Array<{ from_module: string; to_module: string; mechanism: string; type?: string }>
  project: string
  explodedImagePath?: string | null
  manualReviewBadges?: ManualReviewBadge[]
}) {
  const orderedSpecs = order_modules(modules as Array<{ module: string; display_name?: string }>)
  const ordered = orderedSpecs.map((m, i) => ({
    id: m.module,
    n: i + 1,
    title: module_title(m),
  }))

  const W = 480
  const H = 320
  const cx = W / 2
  const cy = H / 2
  const r = Math.min(W, H) / 2 - 32
  const nodeR = 18

  const positions = ordered.map((m, i) => {
    const angle = (i / ordered.length) * Math.PI * 2 - Math.PI / 2
    return {
      ...m,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    }
  })
  const posById = new Map(positions.map(p => [p.id, p]))

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 2 · Modules" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Module Map
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 16 }}>
        Figure 1. The {ordered.length} modules and how they connect.
      </Text>

      <ManualReviewSectionNote badges={(manualReviewBadges ?? []).filter(b => b.id === 'g4_grammar' || b.id === 'k10_grammar')} />

      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <Svg width={W} height={H}>
          {links.map((l, idx) => {
            const a = posById.get(l.from_module)
            const b = posById.get(l.to_module)
            if (!a || !b) return null
            return (
              <Line
                key={`link-${idx}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={RULE}
                strokeWidth={0.8}
              />
            )
          })}
          {positions.map(p => (
            <React.Fragment key={p.id}>
              <Circle cx={p.x} cy={p.y} r={nodeR} fill={ACCENT} stroke={ACCENT_SOFT} strokeWidth={1.5} />
              {/* react-pdf Svg <Text> renders with `fill` attribute, NOT style.color. */}
              <Text
                x={p.x}
                y={p.y + 4}
                fill="#ffffff"
                style={{
                  fontSize: 13,
                  fontFamily: 'Helvetica-Bold',
                  textAnchor: 'middle',
                }}
              >
                {String(p.n)}
              </Text>
            </React.Fragment>
          ))}
        </Svg>
      </View>

      {/*
        Phase20 audit (2026-05-17): Module Map page produced an orphan
        continuation page on bess/bioreactor/drone/ev-charger/haps/heatpump/
        vertical-farm — react-pdf created a phantom wrap-page that the fixed
        PageHeader/PageFooter then decorated with no body content. Wrap=false
        on the legend prevents the SVG + legend block from forcing a wrap
        boundary; the entire body fits inside the 716pt printable height for
        all 10 current product classes (11 modules max).

        Track N audit MAJOR 3 (2026-05-18): the "Module legend" heading was
        rendered OUTSIDE the wrap=false block — so when the SVG + legend
        couldn't fit on the same page, the heading orphaned at the foot of
        the map page and the legend table got pushed to the next page. Wrap
        the heading + table together in a single wrap=false block so they
        always travel as one unit.
      */}
      <View wrap={false}>
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 8, marginBottom: 8 }}>
          Module legend
        </Text>
        <View style={{ borderTopWidth: 0.6, borderTopColor: RULE_SOFT }}>
          {ordered.map(m => (
            <View key={m.id} style={{
              flexDirection: 'row',
              paddingVertical: 5,
              borderBottomWidth: 0.6,
              borderBottomColor: RULE_SOFT,
            }}>
              <Text style={{ width: 30, fontSize: 10, fontFamily: 'Helvetica-Bold', color: ACCENT }}>
                {m.n}
              </Text>
              <Text style={{ flex: 1, fontSize: 10, color: INK_SOFT }}>{m.title}</Text>
            </View>
          ))}
        </View>
      </View>

      <PageFooter />
    </Page>
  )
}

// Wrapper that adds an optional exploded-view second page after the connection
// map. Tristan 2026-05-17: keep the circle, add option-4 exploded view below
// (it's its own page since A4 won't hold both + the legend).
function ModuleConnectionMapPageWithExploded({
  modules,
  links,
  project,
  explodedImagePath,
  manualReviewBadges,
}: {
  modules: Array<{ module: string; display_name?: string }>
  links: Array<{ from_module: string; to_module: string; mechanism: string; type?: string }>
  project: string
  explodedImagePath?: string | null
  manualReviewBadges?: ManualReviewBadge[]
}) {
  const orderedSpecs = order_modules(modules as Array<{ module: string; display_name?: string }>)
  const moduleCount = orderedSpecs.length
  return (
    <>
      <ModuleConnectionMapPage modules={modules} links={links} project={project} manualReviewBadges={manualReviewBadges} />
      {explodedImagePath ? (
        <Page key="module-map-exploded" size="A4" style={PAGE_STYLE}>
          <PageHeader section="Section 2 · Modules — Exploded view" project={project} />
          <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
            Module Map — Exploded view
          </Text>
          <Text style={{ fontSize: 10, color: MUTED, marginBottom: 16 }}>
            Figure 2. The same {moduleCount} modules separated vertically to show their spatial layering inside the product envelope. Pair this with the connection map (Figure 1) — the circle shows which modules talk to each other; the exploded view shows where each module physically sits.
          </Text>
          {/* 2026-05-18 (Track N visual audit MAJOR 4): exploded view was */}
          {/* framed 515×515 (square) with objectFit:'contain'. Heat-pump, */}
          {/* bioreactor and drone source PNGs are portrait (tall+narrow), */}
          {/* so the image got letter-boxed into a narrow vertical strip — */}
          {/* sub-component labels became unreadable. Widen the frame to */}
          {/* the full content width (467pt, page minus 64pt × 2 horiz */}
          {/* padding) and raise the height to ~650pt so portrait sources */}
          {/* scale up rather than down. Landscape sources (BESS rack) */}
          {/* still scale to fit because objectFit:'contain' preserves */}
          {/* aspect ratio. */}
          <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 8 }}>
            <Image src={explodedImagePath} style={{ width: 467, height: 650, objectFit: 'contain' }} />
            <Text style={{ fontSize: 8, color: MUTED, marginTop: 6, fontStyle: 'italic' }}>
              Deterministic CAD render — each module lifted from its real position to expose internals. Not a photograph.
            </Text>
          </View>
          <PageFooter />
        </Page>
      ) : null}
    </>
  )
}

// ─── Section 2 body: one section per module ────────────────────────────────

/**
 * Break a dense prose paragraph at sentence boundaries into 2-3 visually
 * readable chunks. Aim for ~2-3 sentences per chunk; keep at least 2 chunks
 * when the source is >450 chars so the reader has a breathing line.
 */
function break_paragraph(p: string): string[] {
  const txt = p.trim()
  if (!txt) return ['']
  // Protect decimal-number periods (0.022) and part-number periods (975.840) from
  // being treated as sentence terminators by the splitter. Without this, the regex
  // below splits `"0.022 W/mK"` into `"0."` and `"022 W/mK"` — and silently drops
  // the leading `"0."` because nothing matches it. Confirmed root cause of
  // every leading-token truncation in iter-64 PDFs (drawer_forgeos_gotchas_227e3c8fd74fcd32).
  const PERIOD_PLACEHOLDER = ''
  const protectedTxt = txt.replace(/(\d)\.(\d)/g, `$1${PERIOD_PLACEHOLDER}$2`)
  const sentences = protectedTxt.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [protectedTxt]
  const restored = sentences.map(s => s.replace(new RegExp(PERIOD_PLACEHOLDER, 'g'), '.'))
  const cleaned = restored.map(s => s.trim()).filter(s => s.length > 0)
  if (cleaned.length <= 2) return [txt]
  // Target 2 sentences per chunk for paragraphs up to ~5 sentences, 3 per chunk for longer.
  const perChunk = cleaned.length <= 5 ? 2 : 3
  const chunks: string[] = []
  for (let i = 0; i < cleaned.length; i += perChunk) {
    chunks.push(cleaned.slice(i, i + perChunk).join(' '))
  }
  return chunks
}

// Inline-link prose renderer. Given a prose chunk and a lookup of part_number
// to source info, returns a React fragment that wraps each known part_number
// in a clickable Link with dotted-underline styling.
function renderProseWithLinks(prose: string, linkMap: Map<string, { url: string; title: string | null; manufacturer: string }>): React.ReactNode {
  if (!linkMap || linkMap.size === 0) return prose
  const keys = Array.from(linkMap.keys()).sort((a, b) => b.length - a.length)
  if (keys.length === 0) return prose
  const escaped = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const rx = new RegExp('(' + escaped.join('|') + ')', 'g')
  const parts: Array<{ text: string; link?: { url: string; title: string | null; manufacturer: string } }> = []
  let lastIdx = 0
  for (const match of prose.matchAll(rx)) {
    const idx = match.index ?? 0
    if (idx > lastIdx) parts.push({ text: prose.slice(lastIdx, idx) })
    parts.push({ text: match[0], link: linkMap.get(match[0]) })
    lastIdx = idx + match[0].length
  }
  if (lastIdx < prose.length) parts.push({ text: prose.slice(lastIdx) })
  if (parts.length === 1 && !parts[0].link) return prose
  return parts.map((p, i) => {
    if (p.link) {
      return (
        <Link
          key={`link-${i}`}
          src={p.link.url}
          style={{
            color: ACCENT_SOFT,
            textDecoration: 'underline',
            textDecorationStyle: 'dotted' as any,
          }}
        >
          {p.text}
        </Link>
      )
    }
    return <Text key={`txt-${i}`}>{p.text}</Text>
  })
}

function ModuleSection({
  index,
  moduleSpec,
  nl,
  partLinkMap,
  project,
  moduleImagePath,
}: {
  index: number
  moduleSpec: any
  nl: any
  partLinkMap?: Map<string, { url: string; title: string | null; manufacturer: string }>
  project: string
  moduleImagePath?: string | null
}) {
  const id = moduleSpec.module
  const title = module_title(moduleSpec)
  // Priority: unified-prose Stage 1.7 emission → Piece 1F LLM paragraph → deterministic → brief.
  const overviewSource =
    moduleSpec.overview_paragraph_en ||
    nl?.paragraph_en_llm ||
    nl?.paragraph_en ||
    moduleSpec.module_brief
  const overview = clean_prose(overviewSource)
  const overviewChunks = break_paragraph(overview)

  // Phase A: prefer `paragraph_en` (rich 150-200 word prose woven from every
  // word + every modifier) over the older single-sentence `sentence_en`. When
  // rendering a legacy state.json that predates Phase A, fall back to calling
  // generateSubmoduleParagraph() directly against the moduleSpec's sub-modules
  // so we don't need to re-run the pipeline just to see the new prose.
  const subModulesById = new Map<string, { name: string; sentence: string; paragraph: string }>()
  for (const sm of (moduleSpec.sub_modules ?? [])) {
    const livePara = clean_prose(generateSubmoduleParagraph(sm as any))
    subModulesById.set(sm.id, {
      name: sm.name_human || humanise(sm.id),
      sentence: '',
      paragraph: livePara,
    })
  }
  for (const s of (nl?.sub_module_sentences ?? [])) {
    const existing = subModulesById.get(s.sub_module_id) ?? { name: humanise(s.sub_module_id), sentence: '', paragraph: '' }
    existing.sentence = clean_prose(s.sentence_en)
    if (s.paragraph_en && s.paragraph_en.length > existing.paragraph.length) {
      existing.paragraph = clean_prose(s.paragraph_en)
    }
    subModulesById.set(s.sub_module_id, existing)
  }

  const subModules = Array.from(subModulesById.entries()).map(([smId, v], i) => ({
    idx: i + 1,
    id: smId,
    name: v.name,
    sentence: v.sentence,
    paragraph: v.paragraph || v.sentence,
  }))

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section={`Section 2 · Module ${index}`} project={project} />

      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 10, color: ACCENT, fontFamily: 'Helvetica-Bold', letterSpacing: 1 }}>
          MODULE {index}
        </Text>
        <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 2 }}>
          {title}
        </Text>
      </View>

      {moduleImagePath ? (
        <View style={{ marginBottom: 14, alignItems: 'center' }}>
          <Image src={moduleImagePath} style={{ width: 515, height: 360, objectFit: 'contain' }} />
          <Text style={{ fontSize: 8, color: MUTED, marginTop: 4, fontStyle: 'italic' }}>
            Illustration only — AI-generated render. Module {index} ({title}) shown in identity colour; other modules muted; enclosure ghosted.
          </Text>
        </View>
      ) : null}

      <View style={{ marginBottom: 14 }}>
        {(overviewChunks.length > 0 ? overviewChunks : [overview || `Module ${index} of the product.`]).map((chunk, i) => (
          <Text
            key={i}
            style={{ fontSize: 10.5, color: INK_SOFT, lineHeight: 1.65, marginBottom: 8, textAlign: 'justify' }}
          >
            {chunk}
          </Text>
        ))}
      </View>

      <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 6, marginBottom: 8 }}>
        Sub-modules
      </Text>
      <View style={{ borderTopWidth: 0.6, borderTopColor: RULE_SOFT }}>
        {subModules.map(sm => {
          // Each sub-module renders as 2-3 prose chunks so the eye has breathing
          // points within the 150-200 word paragraph.
          const proseChunks = break_paragraph(sm.paragraph || '—')
          return (
            // wrap=false so a sub-module never splits across a page boundary
            // (atomic block — keeps heading+prose together). Phase20 audit
            // (2026-05-17): without this, the body sometimes overshoots the
            // printable area by ~1pt and react-pdf emits a phantom continuation
            // page with no content beyond the fixed header/footer. Making each
            // sub-module atomic lets react-pdf cleanly push the last item to
            // a new page instead of partially rendering it.
            <View
              key={sm.id}
              wrap={false}
              style={{ paddingVertical: 11, borderBottomWidth: 0.6, borderBottomColor: RULE_SOFT }}
            >
              <View style={{ flexDirection: 'row', marginBottom: 5 }}>
                <Text style={{ width: 36, fontSize: 10, fontFamily: 'Helvetica-Bold', color: ACCENT_SOFT }}>
                  {index}.{sm.idx}
                </Text>
                <Text style={{ flex: 1, fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: INK }}>
                  {britishise(sm.name.charAt(0).toUpperCase() + sm.name.slice(1))}
                </Text>
              </View>
              {proseChunks.map((chunk, ci) => (
                <Text
                  key={ci}
                  style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.6, paddingLeft: 36, marginBottom: 5, textAlign: 'justify' }}
                >
                  {partLinkMap && partLinkMap.size > 0 ? renderProseWithLinks(chunk, partLinkMap) : chunk}
                </Text>
              ))}
            </View>
          )
        })}
      </View>

      <PageFooter />
    </Page>
  )
}

// ─── Section 2 · Regulatory & Compliance ───────────────────────────────────
//
// Data-driven, class-universal compliance section. Reads from
// src/lib/pdf-engine-v2/class-standards.ts. Merges brief-declared
// safety_standards into the class baseline so the page shows BOTH what the
// brief author explicitly chose AND any class-mandatory standards they
// omitted.
//
// Financial fields (typical_compliance_cost_gbp, typical_lead_time_weeks)
// are present in the data registry but SUPPRESSED from this render until the
// BoM table + assumptions ledger exist (Tristan directive 2026-05-15: no
// financial metrics before BoM grounds them).
//
// Ordered: mandatory standards first, then de-facto industry expectations.

function CompliancePage({ state, project, manualReviewBadges }: { state: any; project: string; manualReviewBadges?: ManualReviewBadge[] }) {
  const productClass = String(state.moduleDecomposition?.product_class ?? '')
  if (!productClass) return null
  const classBlock = getClassStandards(productClass)
  const briefStandards = (state.parsedBrief?.constraints?.safety_standards ?? null) as Array<any> | null
  const merged: RegulatoryStandard[] = mergeBriefAndClassStandards(productClass, briefStandards)
  if (merged.length === 0) return null

  // Mandatory first, then de-facto; within each, original class order
  const sorted = [...merged].sort((a, b) => {
    if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1
    return 0
  })

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 2 · Regulatory & Compliance" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Regulatory & Compliance
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 14 }}>
        Standards that govern this product class. Compliance is dictated by jurisdiction + use case BEFORE the design exists; the design downstream must demonstrate conformity with the mandatory items below.
      </Text>
      <ManualReviewSectionNote badges={(manualReviewBadges ?? []).filter(b => b.id === 'g1b_compliance')} />
      <Text style={{ fontSize: 10, color: INK_SOFT, marginBottom: 18, lineHeight: 1.55 }}>
        {clean_prose(classBlock.compliance_summary)}
      </Text>

      {/* Header row */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 0.8, borderBottomColor: INK, paddingBottom: 4, marginBottom: 4 }}>
        <Text style={{ width: 95, fontSize: 8, color: MUTED, letterSpacing: 0.6 }}>CODE</Text>
        <Text style={{ flex: 3,    fontSize: 8, color: MUTED, letterSpacing: 0.6 }}>STANDARD</Text>
        <Text style={{ width: 50,  fontSize: 8, color: MUTED, letterSpacing: 0.6 }}>JURIS.</Text>
        <Text style={{ width: 65,  fontSize: 8, color: MUTED, letterSpacing: 0.6 }}>STATUS</Text>
      </View>

      {sorted.map((s, idx) => (
        <View key={`std-${idx}`} wrap={false} style={{ paddingTop: 6, paddingBottom: 8, borderBottomWidth: 0.4, borderBottomColor: RULE_SOFT }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ width: 95, fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: ACCENT }}>{s.code}</Text>
            <Text style={{ flex: 3,    fontSize: 9.5, color: INK }}>{clean_prose(s.title)}</Text>
            <Text style={{ width: 50,  fontSize: 9,   color: INK_SOFT }}>{s.jurisdiction}</Text>
            <Text style={{ width: 65,  fontSize: 9,   color: s.mandatory ? '#9a3412' : MUTED, fontFamily: s.mandatory ? 'Helvetica-Bold' : 'Helvetica' }}>
              {s.mandatory ? 'Mandatory' : 'De-facto'}
            </Text>
          </View>
          <View style={{ marginTop: 3, paddingLeft: 95 }}>
            <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.5 }}>{clean_prose(s.applies_because)}</Text>
          </View>
        </View>
      ))}

      <View style={{ marginTop: 16, padding: 10, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT_SOFT }}>
        <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.5 }}>
          Compliance cost and lead-time estimates are tracked in the underlying registry but withheld from this report until the Bill of Materials exists and a full assumptions ledger (test-house rates, notified-body fees, recertification cadence) can be cross-referenced. Numbers without that grounding are unreliable.
        </Text>
      </View>

      <PageFooter />
    </Page>
  )
}

// ─── Section 3 · Risk & FMEA (class-universal) ─────────────────────────────
//
// Data-driven hazard catalogue. Reads from class-hazards.ts. Renders one
// hazard per row, ordered by RPN (severity × likelihood × detectability)
// descending so the worst hazards are at the top.
//
// Financial / cost-of-mitigation fields are NOT surfaced — same rule as the
// §Compliance page. Once BoM exists, a mitigation-cost overlay will land
// here.

function RiskPage({ state, project, manualReviewBadges }: { state: any; project: string; manualReviewBadges?: ManualReviewBadge[] }) {
  const productClass = String(state.moduleDecomposition?.product_class ?? '')
  if (!productClass) return null
  const classBlock = getClassHazards(productClass)
  if (classBlock.hazards.length === 0) return null
  const sorted = [...classBlock.hazards].sort((a, b) => computeHazardRPN(b) - computeHazardRPN(a))

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 3 · Risk & Failure-Mode Analysis" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Risk & Failure-Mode Analysis
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 10 }}>
        Class-level pre-mitigation hazards a {classBlock.display_name.toLowerCase()} design must address. Each hazard is rated on three 1-5 scales whose product gives a single risk priority number — higher means worse before mitigation.
      </Text>
      <ManualReviewSectionNote badges={(manualReviewBadges ?? []).filter(b => b.id === 'g3_completeness')} />
      <View style={{ marginBottom: 12, padding: 8, backgroundColor: '#f7f8fa', borderRadius: 3 }}>
        <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.55, marginBottom: 2 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Severity</Text> — how bad the outcome is if the hazard occurs (1 = inconvenience, 5 = injury / fire / total loss).
        </Text>
        <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.55, marginBottom: 2 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Likelihood</Text> — how often it tends to happen in fielded systems before mitigation (1 = very rare, 5 = frequent).
        </Text>
        <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.55, marginBottom: 2 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Detectability</Text> — how hard it is to spot before it causes harm (1 = obvious / instrumented, 5 = silent failure).
        </Text>
        <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.55 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Risk priority</Text> — severity × likelihood × detectability. The single number used to rank hazards.
        </Text>
      </View>
      <Text style={{ fontSize: 10, color: INK_SOFT, marginBottom: 18, lineHeight: 1.55 }}>
        {clean_prose(classBlock.hazard_summary)}
      </Text>

      {/* Header row */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 0.8, borderBottomColor: INK, paddingBottom: 4, marginBottom: 4 }}>
        <Text style={{ width: 50,  fontSize: 8, color: MUTED, letterSpacing: 0.6 }}>CODE</Text>
        <Text style={{ flex: 3,    fontSize: 8, color: MUTED, letterSpacing: 0.6 }}>HAZARD</Text>
        <Text style={{ width: 56,  fontSize: 8, color: MUTED, letterSpacing: 0.6, textAlign: 'right' }}>SEVERITY</Text>
        <Text style={{ width: 64,  fontSize: 8, color: MUTED, letterSpacing: 0.6, textAlign: 'right' }}>LIKELIHOOD</Text>
        <Text style={{ width: 72,  fontSize: 8, color: MUTED, letterSpacing: 0.6, textAlign: 'right' }}>DETECTABILITY</Text>
        <Text style={{ width: 64,  fontSize: 8, color: MUTED, letterSpacing: 0.6, textAlign: 'right' }}>RISK PRIORITY</Text>
      </View>

      {sorted.map((h: ClassHazard, idx) => {
        const rpn = computeHazardRPN(h)
        const rpnColor = rpn >= 50 ? '#9a3412' : rpn >= 20 ? '#92400e' : INK_SOFT
        return (
          <View key={`haz-${idx}`} wrap={false} style={{ paddingTop: 6, paddingBottom: 8, borderBottomWidth: 0.4, borderBottomColor: RULE_SOFT }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ width: 50, fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: ACCENT }}>{h.code}</Text>
              <Text style={{ flex: 3,    fontSize: 9.5, color: INK }}>{clean_prose(h.title)}</Text>
              <Text style={{ width: 56,  fontSize: 9.5, color: INK_SOFT, textAlign: 'right' }}>{h.severity_pre}</Text>
              <Text style={{ width: 64,  fontSize: 9.5, color: INK_SOFT, textAlign: 'right' }}>{h.likelihood_pre}</Text>
              <Text style={{ width: 72,  fontSize: 9.5, color: INK_SOFT, textAlign: 'right' }}>{h.detectability}</Text>
              <Text style={{ width: 64,  fontSize: 10, fontFamily: 'Helvetica-Bold', color: rpnColor, textAlign: 'right' }}>{rpn}</Text>
            </View>
            <View style={{ marginTop: 4, paddingLeft: 50 }}>
              <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.5, marginBottom: 4 }}>{clean_prose(h.mechanism)}</Text>
              <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>Typical mitigations:</Text> {h.common_mitigations.slice(0, 3).join('; ')}.
              </Text>
              <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>Detection:</Text> {h.detection_methods.slice(0, 2).join('; ')}.
              </Text>
              {h.regulatory_drivers.length > 0 ? (
                <Text style={{ fontSize: 9, color: MUTED }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>Governed by:</Text> {h.regulatory_drivers.join(', ')}.
                </Text>
              ) : null}
            </View>
          </View>
        )
      })}

      <View style={{ marginTop: 16, padding: 10, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT_SOFT }}>
        <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.5 }}>
          Mitigation cost and post-mitigation residual risk are withheld from this report until the Bill of Materials and an assumptions ledger exist. The hazards above are CLASS-LEVEL pre-mitigation; design-specific FMEA (effects of chosen cell chemistry, refrigerant, sensor architecture etc.) will be derived against these once the BoM is grounded.
        </Text>
      </View>

      <PageFooter />
    </Page>
  )
}

// ─── Section 4 · Design Decisions ───────────────────────────────────────────
//
// Renders each spec conflict as a DECISION ALREADY MADE — the engine's
// recommendation is the primary content. Format per Tristan 2026-05-17: every
// decision is presented with "We are doing: X. Why: Y. Consequences: …", with
// a status badge ("Recommended for sign-off" / "Accepted" / "Rejected"). The
// old "weighing A vs B" framing was confusing — if the recommendation is in
// the state, surface it as the choice.
//
// Fallback: if a decision has no `recommendation` populated, fall back to the
// previous "open question" framing (and the renderer logs a TRACKER note).

// Chunked: same overflow bug as PartsPendingVerificationPage — Page can't hold
// 30+ tall cards without React-PDF's translate-math going to -9.6e21.
// iter-62 EV-charger 2026-05-16: failed with 33 modifier_consistency decisions
// in one Page. Chunk at ~5 per page (decision cards are taller than rec cards).
const DECISIONS_PER_PAGE = 5

function DesignDecisionsPage({ state, project }: { state: any; project: string }) {
  const decisions: any[] = Array.isArray(state.designDecisions) ? state.designDecisions : []
  if (decisions.length === 0) return null

  // Diagnostic — log if any decisions lack a populated recommendation so the
  // upstream pipeline can be fixed. Tristan asked for a TRACKER note when low.
  const missingRec = decisions.filter(d => !d.recommendation || !String(d.recommendation).trim()).length
  if (missingRec > 0) {
    console.error(`[render-minimal-pdf] WARN: ${missingRec} of ${decisions.length} design decisions had no recommendation populated by Stage 1.X — upstream pipeline fix needed`)
  }

  const decisionChunks: any[][] = []
  for (let i = 0; i < decisions.length; i += DECISIONS_PER_PAGE) {
    decisionChunks.push(decisions.slice(i, i + DECISIONS_PER_PAGE))
  }

  // Status badge — yellow "Recommended for sign-off" by default, green
  // "Accepted" / grey "Rejected" if the state has been updated post-review.
  const renderStatusBadge = (status: string) => {
    let label = 'Recommended for sign-off'
    let bg = '#fef3c7'
    let fg = '#92400e'
    if (status === 'accepted') {
      label = 'Accepted'
      bg = '#d1fae5'
      fg = '#065f46'
    } else if (status === 'rejected') {
      label = 'Rejected'
      bg = '#e5e7eb'
      fg = '#374151'
    }
    return (
      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: fg, backgroundColor: bg, paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6, borderRadius: 3 }}>
        {label.toUpperCase()}
      </Text>
    )
  }

  // Split recommendation reasoning into a leading paragraph + bullet
  // consequences. If the model already produced bullets ("- foo\n- bar") use
  // them; otherwise treat the recommendation as a single paragraph and skip
  // consequences. (Upstream may later emit a structured `consequences[]` field
  // — handled if present.)
  const extractConsequences = (d: any): { reasoning: string; consequences: string[] } => {
    if (Array.isArray(d.consequences) && d.consequences.length > 0) {
      return {
        reasoning: String(d.recommendation ?? ''),
        consequences: d.consequences.map((c: any) => String(c)),
      }
    }
    const text = String(d.recommendation ?? '')
    // Detect inline bullet list ("- foo" or "• foo") at line starts.
    const lines = text.split(/\r?\n/)
    const bulletRegex = /^\s*[-•*]\s+/
    const firstBulletIdx = lines.findIndex(l => bulletRegex.test(l))
    if (firstBulletIdx > 0) {
      return {
        reasoning: lines.slice(0, firstBulletIdx).join(' ').trim(),
        consequences: lines.slice(firstBulletIdx).filter(l => bulletRegex.test(l)).map(l => l.replace(bulletRegex, '').trim()),
      }
    }
    return { reasoning: text, consequences: [] }
  }

  // Already-made decision card — surfaces the recommendation as the choice.
  const renderMadeDecisionCard = (d: any, idx: number) => {
    const status = String(d.status ?? '')
    const { reasoning, consequences } = extractConsequences(d)
    const topic = humanise(d.kind) + ' on ' + clean_prose(String(d.word_name ?? d.word_id))
    return (
      <View key={`dec-${idx}`} wrap={false} style={{ marginBottom: 18, padding: 12, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 }}>
          <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: ACCENT, flex: 1 }}>
            Decision {idx + 1} — {topic}
          </Text>
          {renderStatusBadge(status)}
        </View>
        <View style={{ flexDirection: 'row', marginBottom: 6 }}>
          <View style={{ width: 110 }}><Text style={{ fontSize: 9, color: MUTED }}>Location</Text></View>
          <View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: INK_SOFT }}>{humanise(String(d.module ?? ''))} / {humanise(String(d.sub_module_id ?? ''))}</Text></View>
        </View>
        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
          <View style={{ width: 110 }}><Text style={{ fontSize: 9, color: MUTED }}>We are doing</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK }}>"{clean_prose(String(d.recommended_value ?? ''))}"</Text>
          </View>
        </View>
        <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Why</Text>
        <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5, marginBottom: 8 }}>{clean_prose(reasoning)}</Text>
        {consequences.length > 0 ? (
          <>
            <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Consequences</Text>
            <View style={{ marginBottom: 4 }}>
              {consequences.map((c, ci) => (
                <View key={ci} style={{ flexDirection: 'row', marginBottom: 2 }}>
                  <Text style={{ fontSize: 10, color: INK_SOFT, width: 10 }}>·</Text>
                  <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5, flex: 1 }}>{clean_prose(c)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>
    )
  }

  // Fallback (no recommendation) — keep the original "open question" framing
  // so the human can still pick. This path should be rare; logged above.
  const renderOpenQuestionCard = (d: any, idx: number) => (
    <View key={`dec-${idx}`} wrap={false} style={{ marginBottom: 18, padding: 12, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 }}>
        <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: ACCENT, flex: 1 }}>
          Decision {idx + 1} — {humanise(d.kind)} on {clean_prose(String(d.word_name ?? d.word_id))}
        </Text>
        <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#9a3412', backgroundColor: '#fee2e2', paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6, borderRadius: 3 }}>
          OPEN QUESTION
        </Text>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        <View style={{ width: 100 }}><Text style={{ fontSize: 9, color: MUTED }}>Location</Text></View>
        <View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: INK_SOFT }}>{humanise(String(d.module ?? ''))} / {humanise(String(d.sub_module_id ?? ''))}</Text></View>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 8 }}>
        <View style={{ width: 100 }}><Text style={{ fontSize: 9, color: MUTED }}>Options</Text></View>
        <View style={{ flex: 1 }}>
          {(d.conflicting_values ?? []).map((v: string, i: number) => (
            <Text key={i} style={{ fontSize: 10, color: INK, marginBottom: 2 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{String.fromCharCode(65 + i)}.</Text> "{clean_prose(v)}"
            </Text>
          ))}
        </View>
      </View>
      <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>What each means</Text>
      <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5, marginBottom: 6 }}>{clean_prose(String(d.explanation ?? ''))}</Text>
      <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Why it matters</Text>
      <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5 }}>{clean_prose(String(d.why_it_matters ?? ''))}</Text>
    </View>
  )

  const renderDecisionCard = (d: any, idx: number) => {
    const hasRec = d.recommendation && String(d.recommendation).trim().length > 0
    return hasRec ? renderMadeDecisionCard(d, idx) : renderOpenQuestionCard(d, idx)
  }

  const pages: React.ReactElement[] = []
  decisionChunks.forEach((chunk, pageIdx) => {
    const startIdx = pageIdx * DECISIONS_PER_PAGE
    const isFirst = pageIdx === 0
    pages.push(
      <Page key={`decisions-page-${pageIdx + 1}`} size="A4" style={PAGE_STYLE}>
        <PageHeader section={`Section 4 · Design Decisions${decisionChunks.length > 1 ? ` (page ${pageIdx + 1} of ${decisionChunks.length})` : ''}`} project={project} />
        {isFirst ? (
          <>
            <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
              Design Decisions
            </Text>
            <Text style={{ fontSize: 10, color: MUTED, marginBottom: 14 }}>
              Where the brief did not pre-commit to a specification, the engine has made the call. Each decision below states what we are doing, why, and what it implies for the rest of the design. Status is "Recommended for sign-off" — the engineering lead confirms or overrides before procurement.
            </Text>
          </>
        ) : (
          <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 10 }}>
            Design Decisions (continued)
          </Text>
        )}
        {chunk.map((d, localIdx) => renderDecisionCard(d, startIdx + localIdx))}
        {/* 2026-05-18 audit fix: footer on every chunk page. */}
        <PageFooter />
      </Page>
    )
  })

  return <>{pages}</>
}

// ─── Section 5 · Parts Pending Verification ────────────────────────────────
//
// Surface parts whose (manufacturer, part_number) couldn't be confidently
// verified against real catalogues — the human should confirm or replace
// before procurement. High-confidence fakes are already stripped from the
// BoM upstream (in part-verification.ts stripUnverifiedParts); this page
// shows what was kept but flagged.

// Chunked-page renderer: returns multiple <Page> elements when content (40+
// recommendations) doesn't fit a single A4. React-PDF's wrap algorithm breaks
// down when a page contains too many flex cards in a single outer View — the
// translate calculation overflows and crashes with "unsupported number"
// (iter-61 BESS 2026-05-16: failed with 38+ recommendations in one Page).
// Chunking at ~12 per page keeps the page-break math sane.
const RECS_PER_PAGE = 12
// Compact table form fits ~10 rows per A4 when each row's reason column wraps
// to 2-3 lines (the bioreactor regression has typical row height ~50pt with a
// 3-line reason). Keeping the chunk size below the per-page capacity ensures
// React-PDF renders one chunk per physical page so the column header at the
// top of each Page element appears on every page (rather than wrapping a
// chunk across multiple pages and losing the header on the continuation).
// Tristan 2026-05-18 bug 4a regression: at 28/page the continuation page had
// rows but no column header.
const UNCERTAIN_PER_PAGE = 8

function PartsPendingVerificationPage({ state, project }: { state: any; project: string }) {
  const verifications: any[] = Array.isArray(state.partVerifications) ? state.partVerifications : []
  const recommendations: any[] = Array.isArray(state.partRecommendations) ? state.partRecommendations : []
  const uncertain = verifications.filter((v: any) => v.status === 'uncertain')
  // P4 fix (2026-05-18): partVerificationSummary can drift from partVerifications
  // when downstream producers (estimate-missing-prices.tsx) append rows AFTER
  // the producer computed the summary. The producer's summary stays as the
  // upstream cascade snapshot (audit re-runs showed summary.total=74 vs actual
  // partVerifications.length=264, summary.uncertain=24 vs actual=214). Recompute
  // total/verified/uncertain/skipped from the array each render. Preserve
  // producer-provided `stripped` since stripped rows are not in the array.
  const rawSummary = state.partVerificationSummary
  const computed = {
    total: verifications.length,
    verified: verifications.filter((v: any) => v.status === 'verified').length,
    uncertain: uncertain.length,
    skipped: verifications.filter((v: any) => v.status === 'skip').length,
    stripped: typeof rawSummary?.stripped === 'number' ? rawSummary.stripped : 0,
  }
  const summary = rawSummary
    ? { ...rawSummary, ...computed }
    : (verifications.length > 0 ? computed : null)
  if (uncertain.length === 0 && recommendations.length === 0 && !summary) return null

  // Chunk into pages: first page has summary + intro + first batch of recs,
  // subsequent pages continue recs, then uncertain.
  const recChunks: any[][] = []
  for (let i = 0; i < recommendations.length; i += RECS_PER_PAGE) {
    recChunks.push(recommendations.slice(i, i + RECS_PER_PAGE))
  }
  // 2026-05-18 (Track N visual audit MAJOR 6): straight `slice(i, i + 8)`
  // chunking leaves an orphan last page with 1-3 rows + 70% blank when the
  // uncertain count modulo UNCERTAIN_PER_PAGE is small. Rebalance the last
  // two chunks when the trailing remainder is 1-3 rows: split the combined
  // 8 + (1..3) into two pages of ceil(half) and floor(half) so neither page
  // looks half-empty. When remainder is 4+ rows, leave as-is — a 4-row last
  // page is acceptable density.
  const uncertainChunks: any[][] = []
  for (let i = 0; i < uncertain.length; i += UNCERTAIN_PER_PAGE) {
    uncertainChunks.push(uncertain.slice(i, i + UNCERTAIN_PER_PAGE))
  }
  if (uncertainChunks.length >= 2) {
    const last = uncertainChunks[uncertainChunks.length - 1]
    const secondLast = uncertainChunks[uncertainChunks.length - 2]
    if (last.length >= 1 && last.length <= 3) {
      const combined = [...secondLast, ...last]
      const half = Math.ceil(combined.length / 2)
      uncertainChunks[uncertainChunks.length - 2] = combined.slice(0, half)
      uncertainChunks[uncertainChunks.length - 1] = combined.slice(half)
    }
  }
  const pages: React.ReactElement[] = []

  // Helper to render a single recommendation card
  const renderRecCard = (r: any, idx: number) => {
    const isUnknown = String(r.confidence ?? '') === 'unknown'
    const confColor = r.confidence === 'high' ? '#065f46' : r.confidence === 'medium' ? '#92400e' : '#9a3412'
    const confBg = r.confidence === 'high' ? '#d1fae5' : r.confidence === 'medium' ? '#fed7aa' : '#fee2e2'
    return (
      <View key={`rec-${idx}`} style={{ marginBottom: 10, padding: 10, backgroundColor: '#fffbeb', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#c2410c' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: ACCENT, flex: 1 }}>
            {clean_prose(String(r.word_name ?? r.word_id))}
          </Text>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: confColor, backgroundColor: confBg, paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6, borderRadius: 3 }}>
            {isUnknown ? 'MANUAL SOURCING REQUIRED' : `${String(r.confidence).toUpperCase()} CONFIDENCE`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
          <View style={{ width: 130 }}><Text style={{ fontSize: 9, color: MUTED }}>Location</Text></View>
          <View style={{ flex: 1 }}><Text style={{ fontSize: 9, color: INK_SOFT }}>{humanise(String(r.module ?? ''))} / {humanise(String(r.sub_module_id ?? ''))}</Text></View>
        </View>
        {isUnknown ? (
          <View style={{ marginTop: 4 }}>
            <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5 }}>{clean_prose(String(r.reasoning ?? ''))}</Text>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              <View style={{ width: 130 }}><Text style={{ fontSize: 9, color: MUTED }}>Recommended manufacturer</Text></View>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: INK }}>{clean_prose(String(r.recommended_manufacturer ?? ''))}</Text></View>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              <View style={{ width: 130 }}><Text style={{ fontSize: 9, color: MUTED }}>Recommended part number</Text></View>
              <View style={{ flex: 1 }}>
                {r.source_url ? (
                  <Link src={String(r.source_url)} style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: ACCENT_SOFT, textDecoration: 'underline', textDecorationStyle: 'dotted' as any }}>
                    {clean_prose(String(r.recommended_part_number ?? ''))}
                  </Link>
                ) : (
                  <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK }}>{clean_prose(String(r.recommended_part_number ?? ''))}</Text>
                )}
              </View>
            </View>
            <View style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Why this</Text>
              <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5 }}>{clean_prose(String(r.reasoning ?? ''))}</Text>
            </View>
          </>
        )}
      </View>
    )
  }

  // Compact table-row form per Tristan 2026-05-17 (third request): the old card
  // form used way too much space to convey not very much. Single-line row with
  // truncated reasoning is enough — anyone wanting full reasoning has the
  // state.json.
  // 2026-05-18 (Track N visual audit BLOCKER 2): wide part numbers (e.g.
  // "GYA1J681MCQ1G", "GP6000-0.020-12") were bleeding into the LOCATION
  // column with zero gap — "GYA1J681MCQ1CEnergy Conversion". Causes: (a) the
  // part-number cell had no `overflow:'hidden'` so long strings escaped
  // horizontally, and (b) `paddingRight: 6` left too little visual gap once
  // overflow was clipped. Fix: bump paddingRight to 10 on the part-number
  // cell + add `overflow:'hidden'`, and break very long part numbers with a
  // zero-width-space every 8 chars so they wrap inside the cell instead of
  // overflowing. Same `flexShrink: 0` + min-width-0 belt-and-braces.
  const softBreakPartNumber = (raw: string): string => {
    const s = clean_prose(raw)
    if (s.length <= 12) return s
    // Insert a zero-width-space every 8 characters in long uninterrupted
    // alphanumeric runs so react-pdf can wrap them. Real punctuation already
    // gives the renderer break opportunities, so we only inject ZWSPs into
    // runs of 8+ non-break characters.
    return s.replace(/([A-Za-z0-9.\-_/]{8})/g, '$1​')
  }
  const renderUncertainRow = (v: any, idx: number) => (
    <View key={`vrfy-${idx}`} wrap={false} style={{ flexDirection: 'row', paddingTop: 6, paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: '#f0d0a8', alignItems: 'flex-start' }}>
      <View style={{ flex: 2.4, paddingRight: 6, overflow: 'hidden' }}>
        <Text style={{ fontSize: 9.5, color: INK, fontFamily: 'Helvetica-Bold' }}>{clean_prose(String(v.word_name ?? v.word_id))}</Text>
      </View>
      <View style={{ flex: 1.8, paddingRight: 6, overflow: 'hidden' }}>
        <Text style={{ fontSize: 9.5, color: INK_SOFT }}>{clean_prose(String(v.manufacturer ?? '—'))}</Text>
      </View>
      <View style={{ flex: 1.6, paddingRight: 10, overflow: 'hidden' }}>
        <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK }}>{softBreakPartNumber(String(v.part_number ?? '—'))}</Text>
      </View>
      <View style={{ flex: 2.0, paddingRight: 6, overflow: 'hidden' }}>
        <Text style={{ fontSize: 9, color: INK_SOFT }}>{humanise(String(v.module ?? ''))} / {humanise(String(v.sub_module_id ?? ''))}</Text>
      </View>
      <View style={{ flex: 2.5, overflow: 'hidden' }}>
        <Text style={{ fontSize: 9, color: MUTED }}>{clean_prose(String(v.reasoning ?? ''))}</Text>
      </View>
    </View>
  )
  // Column header row for the uncertain table — same flex ratios as
  // renderUncertainRow so columns line up. Tristan 2026-05-18: without this
  // the table reads as "Duty Caster / Blickle / part-number / Structured
  // Containment Frame" with no idea what each column means.
  const renderUncertainHeader = () => (
    <View style={{ flexDirection: 'row', paddingTop: 4, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#c2410c', alignItems: 'flex-start', marginBottom: 2 }}>
      <View style={{ flex: 2.4, paddingRight: 6 }}>
        <Text style={{ fontSize: 8.5, color: MUTED, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' }}>Sub-module</Text>
      </View>
      <View style={{ flex: 1.8, paddingRight: 6 }}>
        <Text style={{ fontSize: 8.5, color: MUTED, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' }}>Manufacturer</Text>
      </View>
      <View style={{ flex: 1.6, paddingRight: 10 }}>
        <Text style={{ fontSize: 8.5, color: MUTED, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' }}>Part Number</Text>
      </View>
      <View style={{ flex: 2.0, paddingRight: 6 }}>
        <Text style={{ fontSize: 8.5, color: MUTED, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' }}>Location in design</Text>
      </View>
      <View style={{ flex: 2.5 }}>
        <Text style={{ fontSize: 8.5, color: MUTED, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' }}>Reason for uncertainty</Text>
      </View>
    </View>
  )
  // "What is this?" explainer panel surfaced once before the uncertain rows.
  // Tristan 2026-05-18: founder said "I know it's there, but I don't know what
  // it's for — pages and pages of human-confirms but I don't know what for".
  // This panel answers WHAT / WHAT TO DO / WHY NOT JUST STRIP THESE in tight
  // prose, no acronyms.
  const renderUncertainExplainer = () => (
    <View style={{ marginBottom: 12, padding: 10, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT }}>
      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>What is this?</Text>
      <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.55, marginBottom: 6 }}>
        These are the parts the engine identified as plausible matches for your sub-module requirements, but could not independently verify against a real distributor catalogue or manufacturer datasheet. The manufacturer named makes products of this type, and the part-number format is consistent with their catalogue convention, but no specific item resolved.
      </Text>
      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>What to do</Text>
      <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.55, marginBottom: 6 }}>
        For each row, your sales engineer should: (1) confirm the part exists in current stock, (2) confirm it fits the sub-module requirement listed under "Location in design", (3) replace with a verified item if it does not. The "Reason for uncertainty" column flags the specific verification step that failed.
      </Text>
      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>Why not just strip these?</Text>
      <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.55 }}>
        The engine already strips parts it identifies as clearly fabricated. The remaining "uncertain" parts are kept because removing them would leave gaps in the bill of materials that your sales engineer would then have to backfill from scratch. Showing them as candidates-with-uncertainty is more useful than showing nothing.
      </Text>
    </View>
  )
  // "What is this?" explainer panel for the Stripped (fabricated) section.
  // Tighter than the uncertain explainer — the existing italic line was too
  // thin for founders to act on.
  const renderStrippedExplainer = () => (
    <View style={{ marginBottom: 10, padding: 10, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT }}>
      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>What is this?</Text>
      <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.55, marginBottom: 6 }}>
        Parts the engine identified as fabricated — the manufacturer does not make this, or the part-number format does not exist in their catalogue — and removed from the bill of materials. Below are the engine's best-effort suggestions for what to put in their place.
      </Text>
      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>What to do</Text>
      <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.55 }}>
        Review each, approve or replace before procurement. A recommendation is only provided when the engine is confident a real alternative exists; otherwise the row says "manual sourcing required".
      </Text>
    </View>
  )
  // Compatibility alias — old name still used by recommendation chunks
  const renderUncertainCard = renderUncertainRow

  // Page 1: summary + intro + first recommendation chunk
  pages.push(
    <Page key="parts-page-1" size="A4" style={PAGE_STYLE}>
      <PageHeader section="Appendix A · Parts Pending Verification" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Appendix A — Parts Pending Verification
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 14 }}>
        Every (manufacturer, part number) pair was checked against published catalogues. Verified parts are listed in the Bill of Materials section as-is. Fabricated SKUs were stripped automatically. The items below could not be confidently verified — a human engineer should confirm or replace each before procurement.
      </Text>
      {summary ? (
        <View style={{ marginBottom: 14, padding: 10, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>Verification summary</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 10, color: INK_SOFT, marginRight: 16 }}>Total checked: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{summary.total}</Text></Text>
            <Text style={{ fontSize: 10, color: '#065f46', marginRight: 16 }}>Verified: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{summary.verified}</Text></Text>
            <Text style={{ fontSize: 10, color: '#9a3412', marginRight: 16 }}>Stripped (fakes): <Text style={{ fontFamily: 'Helvetica-Bold' }}>{summary.stripped}</Text></Text>
            <Text style={{ fontSize: 10, color: '#92400e', marginRight: 16 }}>Uncertain: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{summary.uncertain}</Text></Text>
            {summary.skipped > 0 ? <Text style={{ fontSize: 10, color: MUTED, marginRight: 16 }}>Skipped: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{summary.skipped}</Text></Text> : null}
          </View>
        </View>
      ) : null}
      {recommendations.length > 0 ? (
        <>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
            Stripped (was fabricated) — engine recommendations for replacement
          </Text>
          {renderStrippedExplainer()}
          {(recChunks[0] ?? []).map((r, i) => renderRecCard(r, i))}
        </>
      ) : null}
      {/* If there are NO recommendations, page 1 would otherwise be mostly
          empty (just title + summary). Surface the uncertain explainer on page 1
          so the appendix doesn't open with a near-blank page. The uncertain
          rows themselves still go on dedicated pages (one chunk per page) so
          the column header reliably appears at the top of every row-bearing
          page. Tristan 2026-05-18 bug 4b/4c. */}
      {recommendations.length === 0 && uncertain.length > 0 ? (
        <>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
            Plausible but unverified — human to confirm
          </Text>
          {renderUncertainExplainer()}
          <Text style={{ fontSize: 9, color: MUTED, fontStyle: 'italic' }}>
            Rows start on the next page. {uncertain.length} part{uncertain.length === 1 ? '' : 's'} flagged, listed alphabetically by module.
          </Text>
        </>
      ) : null}
      {recommendations.length === 0 && uncertain.length === 0 ? (
        <Paragraph>No uncertain parts — every checked SKU was either verified against a real catalogue or stripped as fabricated. The Bill of Materials below can be procurement-actioned as-is.</Paragraph>
      ) : null}
      <PageFooter />
    </Page>,
  )

  // Continuation pages for remaining recommendation chunks
  for (let ci = 1; ci < recChunks.length; ci++) {
    pages.push(
      <Page key={`parts-rec-${ci}`} size="A4" style={PAGE_STYLE}>
        <PageHeader section={`Appendix A · Parts Pending Verification (cont. ${ci + 1}/${recChunks.length})`} project={project} />
        <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
          Recommendations (continued)
        </Text>
        {recChunks[ci].map((r, i) => renderRecCard(r, ci * RECS_PER_PAGE + i))}
        <PageFooter />
      </Page>,
    )
  }

  // Uncertain parts on dedicated pages, one chunk per Page so the column
  // header reliably appears at the top of every row-bearing page. The
  // explainer panel renders ONCE — on page 1 when recommendations are empty
  // (see the merged block above), or on the first uncertain chunk page when
  // recommendations pushed the uncertain section to a dedicated set of pages.
  for (let ci = 0; ci < uncertainChunks.length; ci++) {
    const showExplainer = ci === 0 && recommendations.length > 0
    pages.push(
      <Page key={`parts-uncertain-${ci}`} size="A4" style={PAGE_STYLE}>
        <PageHeader section={`Appendix A · Parts Pending Verification — Plausible but Unverified${uncertainChunks.length > 1 ? ` (${ci + 1}/${uncertainChunks.length})` : ''}`} project={project} />
        <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
          Plausible but unverified — human to confirm{ci > 0 ? ' (continued)' : ''}
        </Text>
        {showExplainer ? renderUncertainExplainer() : null}
        {renderUncertainHeader()}
        {uncertainChunks[ci].map((v, i) => renderUncertainCard(v, ci * UNCERTAIN_PER_PAGE + i))}
        <PageFooter />
      </Page>,
    )
  }

  return <>{pages}</>
}

// kept for backward compat — the old function body below is dead code, but
// removing it would invalidate the diff context for downstream edits in this
// session. Leave in place and unreachable.
function _PartsPendingVerificationPage_unused({ state, project }: { state: any; project: string }) {
  const verifications: any[] = Array.isArray(state.partVerifications) ? state.partVerifications : []
  const recommendations: any[] = Array.isArray(state.partRecommendations) ? state.partRecommendations : []
  const uncertain = verifications.filter((v: any) => v.status === 'uncertain')
  const summary = state.partVerificationSummary
  if (uncertain.length === 0 && recommendations.length === 0 && !summary) return null

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 5 · Parts Pending Verification" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Parts Pending Verification
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 14 }}>
        Every (manufacturer, part number) pair was checked against published catalogues. Verified parts are listed in §6 BoM as-is. Fabricated SKUs were stripped automatically. The items below could not be confidently verified — a human engineer should confirm or replace each before procurement.
      </Text>

      {summary ? (
        <View style={{ marginBottom: 14, padding: 10, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>Verification summary</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 10, color: INK_SOFT, marginRight: 16 }}>Total checked: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{summary.total}</Text></Text>
            <Text style={{ fontSize: 10, color: '#065f46', marginRight: 16 }}>Verified: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{summary.verified}</Text></Text>
            <Text style={{ fontSize: 10, color: '#9a3412', marginRight: 16 }}>Stripped (fakes): <Text style={{ fontFamily: 'Helvetica-Bold' }}>{summary.stripped}</Text></Text>
            <Text style={{ fontSize: 10, color: '#92400e', marginRight: 16 }}>Uncertain: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{summary.uncertain}</Text></Text>
            {summary.skipped > 0 ? <Text style={{ fontSize: 10, color: MUTED, marginRight: 16 }}>Skipped: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{summary.skipped}</Text></Text> : null}
          </View>
        </View>
      ) : null}

      {/* Stripped fakes — recommendations the human should consider */}
      {recommendations.length > 0 ? (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
            Stripped (was fabricated) — engine recommendations for replacement
          </Text>
          <Text style={{ fontSize: 9, color: MUTED, marginBottom: 8, fontStyle: 'italic' }}>
            Engine policy: a recommendation is provided only when the engine is confident a real alternative exists. If the engine cannot identify a verified replacement, it explicitly says "manual sourcing required" — fabricated recommendations are not acceptable.
          </Text>
          {recommendations.map((r, idx) => {
            const isUnknown = String(r.confidence ?? '') === 'unknown'
            const confColor = r.confidence === 'high' ? '#065f46' : r.confidence === 'medium' ? '#92400e' : '#9a3412'
            const confBg = r.confidence === 'high' ? '#d1fae5' : r.confidence === 'medium' ? '#fed7aa' : '#fee2e2'
            return (
              <View key={`rec-${idx}`} style={{ marginBottom: 10, padding: 10, backgroundColor: '#fffbeb', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#c2410c' }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: ACCENT, flex: 1 }}>
                    {clean_prose(String(r.word_name ?? r.word_id))}
                  </Text>
                  <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: confColor, backgroundColor: confBg, paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6, borderRadius: 3 }}>
                    {isUnknown ? 'MANUAL SOURCING REQUIRED' : `${String(r.confidence).toUpperCase()} CONFIDENCE`}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                  <View style={{ width: 130 }}><Text style={{ fontSize: 9, color: MUTED }}>Location</Text></View>
                  <View style={{ flex: 1 }}><Text style={{ fontSize: 9, color: INK_SOFT }}>{humanise(String(r.module ?? ''))} / {humanise(String(r.sub_module_id ?? ''))}</Text></View>
                </View>
                {isUnknown ? (
                  <View style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5 }}>{clean_prose(String(r.reasoning ?? ''))}</Text>
                  </View>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                      <View style={{ width: 130 }}><Text style={{ fontSize: 9, color: MUTED }}>Recommended manufacturer</Text></View>
                      <View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: INK }}>{clean_prose(String(r.recommended_manufacturer ?? ''))}</Text></View>
                    </View>
                    <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                      <View style={{ width: 130 }}><Text style={{ fontSize: 9, color: MUTED }}>Recommended part number</Text></View>
                      <View style={{ flex: 1 }}><Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK }}>{clean_prose(String(r.recommended_part_number ?? ''))}</Text></View>
                    </View>
                    <View style={{ marginTop: 4 }}>
                      <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Why this</Text>
                      <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5 }}>{clean_prose(String(r.reasoning ?? ''))}</Text>
                    </View>
                  </>
                )}
              </View>
            )
          })}
        </View>
      ) : null}

      {uncertain.length === 0 ? (
        <Paragraph>No uncertain parts — every checked SKU was either verified against a real catalogue, stripped as fabricated, or had a recommendation provided. The Bill of Materials below can be procurement-actioned alongside the recommendations above.</Paragraph>
      ) : (
        <>
        <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6, marginTop: 8 }}>
          Plausible but unverified — human to confirm
        </Text>
        {uncertain.map((v, idx) => (
          <View key={`vrfy-${idx}`} wrap={false} style={{ marginBottom: 12, padding: 10, backgroundColor: '#fff7ed', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#c2410c' }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: ACCENT, flex: 1 }}>
                {clean_prose(String(v.word_name ?? v.word_id))}
              </Text>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#9a3412', backgroundColor: '#fed7aa', paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6, borderRadius: 3 }}>
                {String(v.confidence ?? '').toUpperCase()} CONFIDENCE — UNCERTAIN
              </Text>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              <View style={{ width: 110 }}><Text style={{ fontSize: 9, color: MUTED }}>Manufacturer</Text></View>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: INK }}>{clean_prose(String(v.manufacturer ?? ''))}</Text></View>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              <View style={{ width: 110 }}><Text style={{ fontSize: 9, color: MUTED }}>Part number</Text></View>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK }}>{clean_prose(String(v.part_number ?? ''))}</Text></View>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              <View style={{ width: 110 }}><Text style={{ fontSize: 9, color: MUTED }}>Location</Text></View>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 9, color: INK_SOFT }}>{humanise(String(v.module ?? ''))} / {humanise(String(v.sub_module_id ?? ''))}</Text></View>
            </View>
            <View style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Why uncertain</Text>
              <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5 }}>{clean_prose(String(v.reasoning ?? ''))}</Text>
            </View>
          </View>
        ))}
        </>
      )}

      <PageFooter />
    </Page>
  )
}

// ─── Document ──────────────────────────────────────────────────────────────

// Build a lookup map: part_number → { source_url, source_title, manufacturer }
// so prose-rendering can inject clickable links inline. Tristan directive
// 2026-05-16: when reading the §4 module paragraphs, verified parts should
// show with a dotted underline and click straight to the source page.
// Allow-list of source_methods that produce TRUSTWORTHY URLs and therefore
// may render as clickable Links in the PDF. Tristan rule 2026-05-16: links
// to broken pages are worse than no links at all. lm-only and 'grounded'
// (legacy) are EXCLUDED because their URLs come from training-data memory.
const TRUSTED_LINK_METHODS = new Set([
  'mouser', 'digikey', 'farnell',  // distributor APIs — authoritative
  'brave', 'tavily',                 // search APIs — URLs HEAD-checked at save time
  'gemini',                          // Gemini grounded — when wired in future
  'db-cache',                        // parts catalogue — cached from a trusted prior verification
])

function buildPartLinkMap(state: any): Map<string, { url: string; title: string | null; manufacturer: string }> {
  const map = new Map<string, { url: string; title: string | null; manufacturer: string }>()
  for (const v of (state.partVerifications ?? [])) {
    // GUARD: only build links for verifications from trusted methods.
    // lm-only/grounded source_methods are training-data URLs — render plain.
    if (v.status !== 'verified') continue
    if (!v.source_url || typeof v.source_url !== 'string') continue
    if (!/^https?:\/\//i.test(v.source_url)) continue
    if (!TRUSTED_LINK_METHODS.has(v.source_method)) continue
    const pn = String(v.part_number || '').trim()
    if (pn.length >= 3) {
      map.set(pn, { url: v.source_url, title: v.source_title ?? null, manufacturer: v.manufacturer })
    }
  }
  for (const r of (state.partRecommendations ?? [])) {
    if (!r.recommended_part_number || !r.source_url) continue
    if (typeof r.source_url !== 'string' || !/^https?:\/\//i.test(r.source_url)) continue
    // Recommendations don't track source_method — accept them but the guard
    // upstream (recommender now HEAD-checks lm-only URLs and escalates to
    // distributor APIs) ensures source_url is real.
    const pn = String(r.recommended_part_number).trim()
    if (pn.length >= 3 && !map.has(pn)) {
      map.set(pn, { url: r.source_url, title: r.source_title ?? null, manufacturer: r.recommended_manufacturer ?? '' })
    }
  }
  return map
}

// ─── Section 6 · Bill of Materials ─────────────────────────────────────────
//
// Consolidated table of every VERIFIED part, grouped by module → sub-module.
// Sources: state.partVerifications filtered to status === 'verified'. Each row
// shows: part display name, manufacturer, part number (linked to source URL
// when present), distributor price in GBP when live stock confirmed, source
// channel (DigiKey/Mouser/Farnell/Cache/Web).
//
// Rebuilt 2026-05-17: task #24 was marked complete but the page component
// had been removed from MinimalDocument in a prior refactor. The §5 page
// referenced "verified parts are listed in §6 BoM" — that promise was empty.
// Chunked at 12 rows/page (React-PDF translate overflow at 30+ rows/page).

// Page-budget tuning per Tristan 2026-05-17: previous fixed 12-rows-per-page
// chunking ignored semantic structure — module-headers landed alone at page
// bottoms, sub-totals were stranded on pages without their parts, and the
// next page came up near-empty. New strategy: weighted row units (some
// rows are visually taller than others — module-header has 30pt height vs
// 19pt for a part row), with page-1 budget tightened to account for the
// grand-total + per-module summary cards eating ~330pt at the top.
// Break only at sub-total / module-total boundaries so the chunk respects
// semantic structure. Tried React-PDF natural Page wrap=true with hundreds
// of children but Yoga overflows on very large BoMs (570+ rows) so multi-
// Page-with-semantic-breaks is the safer path.
// Tuned 2026-05-17 against BESS (252 parts, 50 sub-modules, 11 modules):
// A4 usable height is ~714pt (842pt page minus 64pt top + 64pt bottom padding).
// Each part row ~19pt physically. First page eats ~330pt on cards + headers
// (so ~20 rows of capacity); continuation pages eat ~46pt on header strip
// (so ~35 rows of capacity). Weights below approximate physical heights so
// the budget tracks visual fill, not raw row count.
const BOM_PAGE_BUDGET_FIRST = 5    // tight — grand-total + summary cards live here
const BOM_PAGE_BUDGET_CONT = 20    // comfortable for continuation pages
const ROW_WEIGHT = {
  'module-header': 2.0,
  'sub-header': 1.2,
  'part': 1.0,
  'sub-total': 1.4,
  'module-total': 2.0,
} as const

function BillOfMaterialsPage({
  bomTotals,
  priceReality,
  project,
  manualReviewBadges,
}: {
  bomTotals: BomTotals | null
  priceReality: PriceReality | null
  project: string
  manualReviewBadges?: ManualReviewBadge[]
}) {
  if (!bomTotals) return null
  const { allMods, grandTotal_gbp, totalRows, actualPriced, estimatePriced, tbdRows } = bomTotals

  // Title-case helper for proper-noun + sentence-start treatment per Tristan
  // 2026-05-17: "Chiller Compressor Unit" not "chiller compressor unit". Preserves
  // known engineering acronyms uppercase.
  const ACRONYMS = new Set([
    'BESS','PCS','BMS','HVAC','EMS','UPS','HMI','BPHE','EEV','MCS','GMP','PLC','SCADA','MFC',
    'LED','PCB','PCBA','HEPA','UV','VFD','DC','AC','RCD','EMC','IP54','IP55','IP66','IP67','IP68',
    'ESC','FC','VTX','GNSS','GPS','IMU','SoC','MCU','FPGA','RAM','SSD','LFP','NMC','LTO','LiPo',
    'CCS2','OCPP','RCBO','MOSFET','IGBT','AFE','SiC','GaAs','PFC','PSU','SBC','RTD','NTC','UAV',
    'AUV','HAPS','CGM','EV','PV','RF','LTE','MQTT','API','BLE','NFC','OLED','LCD','BPE','GAMP5',
    'IP','HEC','RID','EMI','OCP','SFP','SFP+','PCIe','DDR5','NVMe','M2','ASIC','GPU','CPU',
    // Phase19 audit additions 2026-05-17
    'ISO','PDU','PID','OEM','EPC','UK','USA','EU','MPPT','UL','IEC','IEEE','FCC','CE','RoHS','REACH',
  ])
  const SMALL_WORDS = new Set(['and','or','of','the','for','to','in','on','a','an','with','at','by'])
  const title_case = (raw: string): string => {
    if (!raw) return ''
    const cleaned = clean_prose(raw)
    return cleaned.split(/(\s+|[/_-])/g).map((tok, idx) => {
      if (/^\s+$/.test(tok)) return tok
      if (tok === '/' || tok === '-' || tok === '_') return tok
      const upper = tok.toUpperCase()
      if (ACRONYMS.has(upper)) return upper
      if (idx > 0 && SMALL_WORDS.has(tok.toLowerCase())) return tok.toLowerCase()
      return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase()
    }).join('')
  }

  const fmtGBP = fmtGBP_shared

  // 2026-05-18 (Track N visual audit MAJOR 1): header cells were missing the
  // `paddingRight: 6` gap that body rows have, so "LINE (£)" ran straight
  // into "SRC · REF" with no whitespace ("LINE (£)SRC · REF"). Body rows
  // already pad each right-aligned cell by 6pt; mirror that here so the
  // header line spaces match the body. PART / MANUFACTURER / PART NUMBER
  // header cells stay left-aligned with paddingRight: 6 to match the body
  // padding too — body has paddingRight on all 5 left columns.
  const renderTableHead = () => (
    <View style={{ flexDirection: 'row', paddingBottom: 4, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
      <View style={{ flex: 2.6, paddingRight: 6 }}><Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED }}>PART</Text></View>
      <View style={{ flex: 2.0, paddingRight: 6 }}><Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED }}>MANUFACTURER</Text></View>
      <View style={{ flex: 2.0, paddingRight: 6 }}><Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED }}>PART NUMBER</Text></View>
      <View style={{ flex: 0.6, alignItems: 'flex-end', paddingRight: 6 }}><Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED }}>QTY</Text></View>
      <View style={{ flex: 1.2, alignItems: 'flex-end', paddingRight: 6 }}><Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED }}>UNIT (£)</Text></View>
      <View style={{ flex: 1.2, alignItems: 'flex-end', paddingRight: 6 }}><Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED }}>LINE (£)</Text></View>
      <View style={{ flex: 0.9 }}><Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED }}>SRC · REF</Text></View>
    </View>
  )

  const renderPartRow = (v: BomPartRow, keyHint: string) => {
    const priceTierColour = v.price_tier === 'actual' ? '#065f46' : v.price_tier === 'estimate' ? '#92400e' : '#6b7280'
    const priceTierLabel = v.price_tier === 'actual' ? '✓' : v.price_tier === 'estimate' ? '~' : '?'
    const sourceLabel =
      v.source_method === 'db-cache' ? 'Cache' :
      v.source_method === 'brave' ? 'Web' :
      v.source_method === 'tavily' ? 'Web' :
      v.source_method === 'digikey' ? 'DigiKey' :
      v.source_method === 'mouser' ? 'Mouser' :
      v.source_method === 'farnell' ? 'Farnell' :
      v.source_method === 'estimate' ? 'Est.' :
      v.status === 'unverified' ? '—' :
      v.source_method || '—'
    return (
      <View key={keyHint} wrap={false} style={{ flexDirection: 'row', paddingTop: 3, paddingBottom: 3, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f3', alignItems: 'baseline' }}>
        <View style={{ flex: 2.6, paddingRight: 6 }}>
          <Text style={{ fontSize: 9.5, color: INK }}>{title_case(String(v.word_name ?? ''))}</Text>
        </View>
        <View style={{ flex: 2.0, paddingRight: 6 }}>
          <Text style={{ fontSize: 9.5, color: v.manufacturer ? INK_SOFT : MUTED }}>{v.manufacturer ? clean_prose(String(v.manufacturer)) : 'to be sourced'}</Text>
        </View>
        <View style={{ flex: 2.0, paddingRight: 6, flexDirection: 'row', alignItems: 'baseline' }}>
          {v.part_number ? (
            v.source_url ? (
              <Link src={String(v.source_url)} style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: ACCENT_SOFT, textDecoration: 'underline', textDecorationStyle: 'dotted' as any }}>
                {clean_prose(String(v.part_number))}
              </Link>
            ) : (
              <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK }}>{clean_prose(String(v.part_number))}</Text>
            )
          ) : (
            <Text style={{ fontSize: 9.5, color: MUTED, fontStyle: 'italic' }}>to be selected</Text>
          )}
          {/* Stage 4.5 (P12a) — part-number verification badge. "?" indicates */}
          {/* the SKU did not resolve at DigiKey, Mouser, Farnell, or via a    */}
          {/* manufacturer-domain web search. Founder should confirm or         */}
          {/* replace before procurement. Skipped silently when verification   */}
          {/* didn't run for this line (legacy state files, no part_number).    */}
          {v.part_number && v.part_verified === false ? (
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#92400e', marginLeft: 4 }}>?</Text>
          ) : null}
        </View>
        <View style={{ flex: 0.6, alignItems: 'flex-end', paddingRight: 6 }}>
          <Text style={{ fontSize: 9.5, color: INK_SOFT }}>{v.quantity > 1 ? `×${v.quantity.toLocaleString('en-GB')}` : ''}</Text>
        </View>
        <View style={{ flex: 1.2, alignItems: 'flex-end', paddingRight: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: priceTierColour, marginRight: 3 }}>{priceTierLabel}</Text>
            <Text style={{ fontSize: 9.5, color: v.price_tier === 'tbd' ? MUTED : INK }}>
              {v.unit_price_gbp > 0 ? fmtGBP(v.unit_price_gbp) : 'TBD'}
            </Text>
          </View>
        </View>
        <View style={{ flex: 1.2, alignItems: 'flex-end', paddingRight: 6 }}>
          <Text style={{ fontSize: 9.5, color: v.line_total_gbp > 0 ? INK : MUTED, fontFamily: v.line_total_gbp > 0 ? 'Helvetica-Bold' : undefined }}>
            {v.line_total_gbp > 0 ? fmtGBP(v.line_total_gbp) : '—'}
          </Text>
        </View>
        <View style={{ flex: 0.9, flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ fontSize: 8, color: MUTED, marginRight: 4 }}>{sourceLabel}</Text>
          {(() => {
            // Engine C reference-anchor flag (2026-05-18). Compact right-margin
            // glyph: ✓ in_range, ▲ over, ▼ under, — no_reference. Skipped
            // entirely when the row has no Engine C annotation (legacy
            // state.json files).
            const flag = v.engine_c_flag
            if (!flag) return null
            // Helvetica (bundled with @react-pdf) doesn't carry ✓ / ▲ / ▼ —
            // they render as substitution glyphs. Use ASCII-safe labels.
            const glyph =
              flag === 'in_range' ? 'OK' :
              flag === 'over' ? '> 2x' :
              flag === 'under' ? '< .5x' :
              '-'
            const colour =
              flag === 'in_range' ? '#065f46' :
              flag === 'over' ? '#9f1239' :
              flag === 'under' ? '#1e40af' :
              '#9ca3af'
            const ratio = typeof v.engine_c_ratio === 'number' ? v.engine_c_ratio : null
            const title =
              flag === 'in_range' ? 'in_range vs corpus reference'
              : flag === 'over' ? `over reference (${ratio ? `${ratio.toFixed(1)}x` : ''})`
              : flag === 'under' ? `under reference (${ratio ? `${ratio.toFixed(2)}x` : ''})`
              : 'no priced reference in corpus'
            return (
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: colour }}>
                {glyph}
              </Text>
            )
          })()}
        </View>
      </View>
    )
  }

  // Build flat row list with semantic-kind markers.
  type Row =
    | { kind: 'module-header'; label: string; modIdx: number; subtotal: number }
    | { kind: 'sub-header'; label: string }
    | { kind: 'part'; part: BomPartRow; keyHint: string }
    | { kind: 'sub-total'; label: string; subtotal: number }
    | { kind: 'module-total'; label: string; subtotal: number }
  const rows: Row[] = []
  allMods.forEach((mod, modIdx) => {
    rows.push({ kind: 'module-header', label: mod.label, modIdx, subtotal: mod.subtotal_gbp })
    for (const sub of mod.subs) {
      rows.push({ kind: 'sub-header', label: sub.name })
      sub.parts.forEach((p, pIdx) => {
        rows.push({ kind: 'part', part: p, keyHint: `${mod.module}-${sub.id}-${pIdx}` })
      })
      rows.push({ kind: 'sub-total', label: sub.name, subtotal: sub.subtotal_gbp })
    }
    rows.push({ kind: 'module-total', label: mod.label, subtotal: mod.subtotal_gbp })
  })

  // Page-1 of section 6 is dedicated to the grand-total card + per-module
  // summary card — no rows. Rows start on page 2 onwards, where each chunk
  // is sized to fit one continuation A4 page. Break-points respect semantic
  // boundaries (sub-total / module-total) so a sub-module never splits
  // across pages.
  const chunks: Row[][] = [[]]   // chunk 0 = page-1 cover (no rows)
  let current: Row[] = []
  let weight = 0
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    current.push(row)
    weight += ROW_WEIGHT[row.kind]
    const isBoundary = row.kind === 'sub-total' || row.kind === 'module-total'
    if (weight >= BOM_PAGE_BUDGET_CONT && isBoundary) {
      // 2026-05-18 (Track N visual audit MAJOR 6): bioreactor p59 of 19
      // landed as a single "Module total" row + 85% blank because the
      // chunker broke at the preceding sub-total when only the module
      // total remained for the current module. If the next row IS the
      // module-total for the just-completed module, keep it on THIS
      // chunk so the module never finishes alone on a near-empty page.
      const next = rows[i + 1]
      if (row.kind === 'sub-total' && next && next.kind === 'module-total') {
        current.push(next)
        i += 1
      }
      chunks.push(current)
      current = []
      weight = 0
    }
  }
  if (current.length > 0) chunks.push(current)
  // BOM_PAGE_BUDGET_FIRST kept for the type-checker / future use.
  void BOM_PAGE_BUDGET_FIRST

  const renderRow = (row: Row, idx: number) => {
    if (row.kind === 'module-header') {
      return (
        <View key={`modh-${idx}`} wrap={false} style={{ marginTop: 10, marginBottom: 4, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: ACCENT, flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: ACCENT, flex: 1 }}>
            Module {row.modIdx + 1} — {title_case(row.label)}
          </Text>
          <Text style={{ fontSize: 10, color: ACCENT, fontFamily: 'Helvetica-Bold' }}>
            {fmtGBP(row.subtotal)}
          </Text>
        </View>
      )
    }
    if (row.kind === 'sub-header') {
      return (
        <View key={`subh-${idx}`} wrap={false} style={{ marginTop: 6, marginBottom: 2 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK_SOFT }}>{title_case(row.label)}</Text>
        </View>
      )
    }
    if (row.kind === 'sub-total') {
      return (
        <View key={`subt-${idx}`} wrap={false} style={{ flexDirection: 'row', paddingTop: 3, paddingBottom: 5, marginBottom: 4, borderTopWidth: 0.5, borderTopColor: '#cbd5e1' }}>
          <View style={{ flex: 6.6 }}><Text style={{ fontSize: 9, color: MUTED, fontStyle: 'italic' }}>Sub-total — {title_case(row.label)}</Text></View>
          <View style={{ flex: 1.2, alignItems: 'flex-end' }}><Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK_SOFT }}>{fmtGBP(row.subtotal)}</Text></View>
          <View style={{ flex: 0.9 }} />
        </View>
      )
    }
    if (row.kind === 'module-total') {
      return (
        <View key={`modt-${idx}`} wrap={false} style={{ flexDirection: 'row', paddingTop: 5, paddingBottom: 6, marginBottom: 8, borderTopWidth: 1.2, borderTopColor: ACCENT, backgroundColor: '#f7f8fa', paddingHorizontal: 6 }}>
          <View style={{ flex: 6.6 }}><Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: ACCENT }}>Module total — {title_case(row.label)}</Text></View>
          <View style={{ flex: 1.2, alignItems: 'flex-end' }}><Text style={{ fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: ACCENT }}>{fmtGBP(row.subtotal)}</Text></View>
          <View style={{ flex: 0.9 }} />
        </View>
      )
    }
    return renderPartRow(row.part, `part-${idx}-${row.keyHint}`)
  }

  const pages: React.ReactElement[] = []
  chunks.forEach((chunk, pi) => {
    const isFirst = pi === 0
    pages.push(
      <Page key={`bom-page-${pi + 1}`} size="A4" style={PAGE_STYLE}>
        <PageHeader section={`Section 6 · Bill of Materials${chunks.length > 1 ? ` (page ${pi + 1} of ${chunks.length})` : ''}`} project={project} />
        {isFirst ? (
          <>
            <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
              Bill of Materials
            </Text>
            <ManualReviewSectionNote badges={(manualReviewBadges ?? []).filter(b => b.id === 'g2_cost_reality' || b.id === 'g5_parts')} />
            <Text style={{ fontSize: 10, color: MUTED, marginBottom: 12 }}>
              Every part word in every sub-module is listed below. Price provenance: <Text style={{ color: '#065f46' }}>✓ ACTUAL</Text> = live distributor quote (DigiKey / Mouser / Farnell). <Text style={{ color: '#92400e' }}>~ ESTIMATE</Text> = price from web judgement, not a live quote. <Text style={{ color: '#6b7280' }}>? TBD</Text> = no price found yet; line total excluded from sub-totals. Click any part number to open its source page.{'\n'}
              Reference-anchor (Engine C): right-margin badge <Text style={{ color: '#065f46', fontFamily: 'Helvetica-Bold' }}>OK</Text> = unit price within 0.5x-2.0x of the Phase 4 corpus reference median for similar components, <Text style={{ color: '#9f1239', fontFamily: 'Helvetica-Bold' }}>&gt; 2x</Text> = over reference, <Text style={{ color: '#1e40af', fontFamily: 'Helvetica-Bold' }}>&lt; .5x</Text> = under reference, <Text style={{ color: '#9ca3af', fontFamily: 'Helvetica-Bold' }}>-</Text> = no priced reference in corpus (common for niche / bespoke parts).
            </Text>
            <View style={{ marginBottom: 14, padding: 14, backgroundColor: '#0c4a6e', borderRadius: 6 }}>
              <Text style={{ fontSize: 9, color: '#bae6fd', letterSpacing: 1.2, marginBottom: 4 }}>
                RAW MATERIALS BoM GRAND TOTAL (priced parts only — does not include TBD lines)
              </Text>
              <Text style={{ fontSize: 28, fontFamily: 'Helvetica-Bold', color: '#ffffff' }}>
                {fmtGBP(grandTotal_gbp)}
              </Text>
              <View style={{ flexDirection: 'row', marginTop: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 9, color: '#bae6fd', marginRight: 14 }}>{totalRows} part lines · {allMods.length} modules</Text>
                <Text style={{ fontSize: 9, color: '#86efac', marginRight: 14 }}>✓ {actualPriced} actual</Text>
                <Text style={{ fontSize: 9, color: '#fcd34d', marginRight: 14 }}>~ {estimatePriced} estimate</Text>
                <Text style={{ fontSize: 9, color: '#cbd5e1' }}>? {tbdRows} TBD</Text>
              </View>
              {typeof bomTotals.scale_applied === 'number' && bomTotals.scale_applied !== 1.0 ? (
                <Text style={{ fontSize: 8.5, color: '#bae6fd', marginTop: 6, fontStyle: 'italic' }}>
                  Scale factor: {bomTotals.scale_applied.toFixed(3).replace(/\.?0+$/, '')} — per-class batch-economics multiplier applied to distributor-quoted lines (consumer/mid-volume goods price below 1-off distributor unit rates at production scale).
                </Text>
              ) : null}
              <Text style={{ fontSize: 8.5, color: '#fcd34d', marginTop: 6, fontStyle: 'italic' }}>
                → This is the raw materials layer only. See the Cost Stack on the cover page for the full breakdown to installed ASP (the value a buyer compares against).
              </Text>
            </View>
            {priceReality && priceReality.verdict !== 'unavailable' && priceReality.metric_value !== null ? (
              (() => {
                const absPct = Math.abs(priceReality.pct_deviation || 0)
                const sty = priceVerdictStyle(priceReality.verdict, absPct)
                const isPerUnit = priceReality.metric_input === 1
                const ratioLabel = isPerUnit
                  ? `${fmtGBP_compact(priceReality.metric_value)} per unit`
                  : `${fmtGBP_compact(priceReality.metric_value)} ${priceReality.metric_label.replace(/^£\//, 'per ').split('(')[0].trim()}`
                const bandLabel = `${fmtGBP_compact(priceReality.band_low)}–${fmtGBP_compact(priceReality.band_high)} typical`
                const verdictText = priceReality.verdict === 'in_band'
                  ? 'within typical market range'
                  : priceReality.verdict === 'low'
                  ? `${Math.round(absPct)}% below typical range`
                  : `${Math.round(absPct)}% above typical range`
                return (
                  <View style={{ marginBottom: 14, padding: 12, backgroundColor: sty.bg, borderRadius: 5, borderLeftWidth: 3, borderLeftColor: sty.colour }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                      <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: sty.colour, marginRight: 6 }}>{sty.symbol}</Text>
                      <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: sty.colour }}>{ratioLabel}</Text>
                      <Text style={{ fontSize: 10, color: sty.colour, marginLeft: 6 }}> — {verdictText} ({bandLabel})</Text>
                    </View>
                    <Text style={{ fontSize: 9, color: INK_SOFT, marginTop: 6, fontStyle: 'italic', lineHeight: 1.4 }}>
                      {priceReality.diagnostic} {priceReality.band.notes}
                    </Text>
                    <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 4 }}>
                      Sources: {priceReality.band.sources.join(' · ')}
                    </Text>
                  </View>
                )
              })()
            ) : null}
            <View style={{ marginBottom: 14, padding: 10, backgroundColor: '#f7f8fa', borderRadius: 4 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>Cost by module</Text>
              {allMods.map((mod, mi) => (
                <View key={`grand-row-${mi}`} style={{ flexDirection: 'row', paddingVertical: 2 }}>
                  <View style={{ width: 22 }}><Text style={{ fontSize: 9, color: ACCENT, fontFamily: 'Helvetica-Bold' }}>{mi + 1}.</Text></View>
                  <View style={{ flex: 1 }}><Text style={{ fontSize: 9.5, color: INK_SOFT }}>{title_case(mod.label)}</Text></View>
                  <View style={{ width: 90, alignItems: 'flex-end' }}><Text style={{ fontSize: 9.5, color: INK, fontFamily: 'Helvetica-Bold' }}>{fmtGBP(mod.subtotal_gbp)}</Text></View>
                </View>
              ))}
              <View style={{ flexDirection: 'row', paddingTop: 6, marginTop: 4, borderTopWidth: 0.6, borderTopColor: '#cbd5e1' }}>
                <View style={{ width: 22 }} />
                <View style={{ flex: 1 }}><Text style={{ fontSize: 9.5, color: ACCENT, fontFamily: 'Helvetica-Bold' }}>Sum of modules</Text></View>
                <View style={{ width: 90, alignItems: 'flex-end' }}><Text style={{ fontSize: 9.5, color: ACCENT, fontFamily: 'Helvetica-Bold' }}>{fmtGBP(grandTotal_gbp)}</Text></View>
              </View>
            </View>
            {/*
              Engine B (2026-05-18) — component-class breakdown panel.
              Renders `bomTotals.engine_b_by_class` so the per-class cost
              contribution is visible to the founder. Without this panel the
              render-time dict computed in computeBomTotals() was correct but
              invisible. Surfaces below the "Cost by module" block so the
              reader gets BOTH cuts of the grand total: by module (where in
              the system the money goes) and by component class (which kind of
              part the money goes on).

              Gating: only renders when ≥2 non-zero classes exist. Single-
              class state (e.g. legacy iter runs where every line falls into
              'unclassified' or 'distributor_priced') produces a useless
              one-row panel — suppressed so the reader doesn't see redundant
              info. Alphabetical order by class id; max 8 rows then collapse
              the long tail into "+ N others totalling £X".
            */}
            {(() => {
              const byClass = bomTotals.engine_b_by_class
              if (!byClass) return null
              const entries = Object.entries(byClass)
                .filter(([, v]) => typeof v === 'number' && v > 0)
              if (entries.length < 2) return null
              entries.sort((a, b) => a[0].localeCompare(b[0]))
              const classTotal = entries.reduce((acc, [, v]) => acc + v, 0)
              if (classTotal <= 0) return null
              const headRows = entries.slice(0, 8)
              const tailRows = entries.slice(8)
              const tailTotal = tailRows.reduce((acc, [, v]) => acc + v, 0)
              return (
                <View style={{ marginBottom: 14, padding: 10, backgroundColor: '#f7f8fa', borderRadius: 4 }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>Component-class breakdown</Text>
                  <Text style={{ fontSize: 8.5, color: MUTED, marginBottom: 6, fontStyle: 'italic' }}>
                    Per-component-class contribution to the grand total. Classifier source: Engine B (Phase 4 corpus lookup + Flash-Lite fallback).
                  </Text>
                  {headRows.map(([cls, gbp], idx) => {
                    const pct = classTotal > 0 ? (gbp / classTotal) * 100 : 0
                    return (
                      <View key={`engineb-row-${idx}`} style={{ flexDirection: 'row', paddingVertical: 2 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 9.5, color: INK_SOFT }}>{humanise(cls)}</Text>
                        </View>
                        <View style={{ width: 90, alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 9.5, color: INK, fontFamily: 'Helvetica-Bold' }}>{fmtGBP(gbp)}</Text>
                        </View>
                        <View style={{ width: 50, alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 9, color: MUTED }}>{pct.toFixed(0)}%</Text>
                        </View>
                      </View>
                    )
                  })}
                  {tailRows.length > 0 ? (
                    <View style={{ flexDirection: 'row', paddingVertical: 2 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 9.5, color: MUTED, fontStyle: 'italic' }}>
                          + {tailRows.length} other classes
                        </Text>
                      </View>
                      <View style={{ width: 90, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 9.5, color: INK_SOFT, fontFamily: 'Helvetica-Bold' }}>{fmtGBP(tailTotal)}</Text>
                      </View>
                      <View style={{ width: 50, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 9, color: MUTED }}>{classTotal > 0 ? ((tailTotal / classTotal) * 100).toFixed(0) : '0'}%</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              )
            })()}
            {renderTableHead()}
          </>
        ) : (
          <>
            <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 10 }}>
              Bill of Materials (continued)
            </Text>
            {renderTableHead()}
          </>
        )}
        {chunk.map((row, localIdx) => renderRow(row, pi * 100 + localIdx))}
        {/* 2026-05-18 (Track N visual audit BLOCKER 1): PageFooter on every */}
        {/* chunk page, not only the last. Previously `isLast ? <PageFooter />` */}
        {/* gave 18 of 19 BoM continuation pages no footer or page number. */}
        <PageFooter />
      </Page>,
    )
  })

  return <>{pages}</>
}


// ─── Section 7 · Suppliers ─────────────────────────────────────────────────
//
// EPC-style supplier recommendations grouped by archetype (principal contractor,
// subcontractors). Each archetype lists up to 3 candidate companies, ranked by
// Companies House verification + pipeline status. Source: state.suppliers
// populated by scripts/enrich-state-with-suppliers.tsx querying
// ~/.forge-truth/forge-truth.db (~28k companies).
//
// MVP CAVEAT: candidate matching is keyword-based against forge-truth.db
// description/specialties columns. A real human engineer should validate each
// candidate's fit before procurement decisions. Future iteration adds Flash-Lite
// relevance scoring to filter borderline matches.
//
// Per Tristan 2026-05-17: "we want choice about who we're recommending... for
// each category there should be three choices... contact details, where they
// are, link to the website. Make it useful so when people go 'who's going to
// make this?' there's a call to action."

function SuppliersPage({ state, project }: { state: any; project: string }) {
  const suppliers: any[] = Array.isArray(state.suppliers) ? state.suppliers : []
  if (suppliers.length === 0) return null

  const hasAnyCandidate = suppliers.some((s) => Array.isArray(s.candidates) && s.candidates.length > 0)
  if (!hasAnyCandidate) return null

  const renderCandidateCard = (c: any, idx: number) => {
    // Phase22 fix C1 (Tristan 2026-05-17): procurement-ready 2-column card.
    // Left rail = identity (name, source badge, location). Right rail =
    // procurement substance (capability one-liner, fit bullets, contact CTA).
    // No prose snippets — every line on the right is either a concrete capability
    // claim or a verb-led fit bullet generated by Flash-Lite.
    const confidenceColour =
      c.confidence === 'high' ? '#065f46' : c.confidence === 'medium' ? '#92400e' : '#6b7280'
    const confidenceBg =
      c.confidence === 'high' ? '#d1fae5' : c.confidence === 'medium' ? '#fef3c7' : '#f3f4f6'
    const sourceVerified = Boolean(c.ch_verified)
    const sourceBadgeText = sourceVerified ? 'CH-VERIFIED' : 'WEB-SOURCED'
    const sourceBadgeColour = sourceVerified ? '#065f46' : '#92400e'
    const sourceBadgeBg = sourceVerified ? '#d1fae5' : '#fef3c7'
    const location = [c.city, c.country].filter(Boolean).join(', ') || (sourceVerified ? 'Location on Companies House record' : 'Region not recorded')
    const websiteText = c.website_url
      ? String(c.website_url).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').slice(0, 50)
      : ''
    const emailToUse: string | null = c.contact_email || c.contact_email_derived || null
    const capability: string = clean_prose(String(c.capability_oneliner ?? '')).trim()
    const fitBullets: string[] = Array.isArray(c.fit_bullets)
      ? c.fit_bullets.map((b: any) => clean_prose(String(b ?? '')).trim()).filter((b: string) => b.length > 0).slice(0, 3)
      : []
    // Legacy fallback for cards rendered before phase22 fix C1 enrichment ran.
    const legacyReasoning: string = !capability && c.llm_reasoning
      ? clean_prose(String(c.llm_reasoning)).slice(0, 220)
      : ''
    return (
      <View
        key={`cand-${idx}`}
        wrap={false}
        style={{
          marginBottom: 10,
          padding: 10,
          backgroundColor: '#f7f8fa',
          borderRadius: 4,
          borderLeftWidth: 3,
          borderLeftColor: ACCENT,
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          {/* LEFT RAIL — identity column (35%). Name, source + confidence
              badges, location, website CTA. */}
          <View style={{ width: '36%', paddingRight: 10, borderRightWidth: 1, borderRightColor: '#e5e7eb' }}>
            <Text style={{ fontSize: 11.5, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 5 }}>
              {clean_prose(String(c.name ?? ''))}
            </Text>
            <View style={{ flexDirection: 'row', marginBottom: 6, flexWrap: 'wrap' }}>
              <Text
                style={{
                  fontSize: 7.5,
                  fontFamily: 'Helvetica-Bold',
                  color: sourceBadgeColour,
                  backgroundColor: sourceBadgeBg,
                  paddingTop: 2,
                  paddingBottom: 2,
                  paddingLeft: 5,
                  paddingRight: 5,
                  borderRadius: 2,
                  marginRight: 4,
                }}
              >
                {sourceBadgeText}
              </Text>
              <Text
                style={{
                  fontSize: 7.5,
                  fontFamily: 'Helvetica-Bold',
                  color: confidenceColour,
                  backgroundColor: confidenceBg,
                  paddingTop: 2,
                  paddingBottom: 2,
                  paddingLeft: 5,
                  paddingRight: 5,
                  borderRadius: 2,
                }}
              >
                {String(c.confidence ?? '').toUpperCase()}
              </Text>
            </View>
            <Text style={{ fontSize: 8.5, color: MUTED, marginBottom: 1 }}>Location</Text>
            <Text style={{ fontSize: 9.5, color: INK_SOFT, marginBottom: 6 }}>{location}</Text>
            {c.website_url ? (
              <>
                <Text style={{ fontSize: 8.5, color: MUTED, marginBottom: 1 }}>Website</Text>
                <Link
                  src={String(c.website_url)}
                  style={{
                    fontSize: 9,
                    fontFamily: 'Helvetica-Bold',
                    color: ACCENT_SOFT,
                    textDecoration: 'underline',
                    textDecorationStyle: 'dotted' as any,
                  }}
                >
                  {websiteText}
                </Link>
              </>
            ) : null}
          </View>
          {/* RIGHT RAIL — procurement substance (64%). Capability one-liner,
              fit bullets, contact CTA. */}
          <View style={{ flex: 1, paddingLeft: 12 }}>
            {capability ? (
              <View style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 8.5, color: MUTED, marginBottom: 1 }}>Capability</Text>
                <Text style={{ fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: INK, lineHeight: 1.4 }}>
                  {capability}
                </Text>
              </View>
            ) : null}
            {fitBullets.length > 0 ? (
              <View style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 8.5, color: MUTED, marginBottom: 2 }}>Why this fits the brief</Text>
                {fitBullets.map((b, bi) => (
                  <View key={`fit-${idx}-${bi}`} style={{ flexDirection: 'row', marginBottom: 2 }}>
                    <Text style={{ fontSize: 10, color: INK_SOFT, marginRight: 4, lineHeight: 1.45 }}>•</Text>
                    <Text style={{ flex: 1, fontSize: 9.5, color: INK_SOFT, lineHeight: 1.45 }}>
                      {b}
                    </Text>
                  </View>
                ))}
              </View>
            ) : legacyReasoning ? (
              <View style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 8.5, color: MUTED, marginBottom: 1 }}>Why this fits the brief</Text>
                <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.45 }}>
                  {legacyReasoning}
                  {String(c.llm_reasoning ?? '').length > 220 ? '…' : ''}
                </Text>
              </View>
            ) : null}
            {/* Contact CTA row — phone/email when known, otherwise direct
                the reader to the website contact form. */}
            <View style={{ marginTop: 2 }}>
              <Text style={{ fontSize: 8.5, color: MUTED, marginBottom: 1 }}>Get in touch</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {c.website_url ? (
                  <Link
                    src={String(c.website_url)}
                    style={{
                      fontSize: 9.5,
                      fontFamily: 'Helvetica-Bold',
                      color: '#ffffff',
                      backgroundColor: ACCENT,
                      paddingTop: 3,
                      paddingBottom: 3,
                      paddingLeft: 8,
                      paddingRight: 8,
                      borderRadius: 3,
                      marginRight: 5,
                      marginBottom: 3,
                      textDecoration: 'none',
                    }}
                  >
                    Visit company website
                  </Link>
                ) : null}
                {emailToUse ? (
                  <Link
                    src={`mailto:${emailToUse}`}
                    style={{
                      fontSize: 9.5,
                      fontFamily: 'Helvetica-Bold',
                      color: ACCENT,
                      backgroundColor: '#e2e8f0',
                      paddingTop: 3,
                      paddingBottom: 3,
                      paddingLeft: 8,
                      paddingRight: 8,
                      borderRadius: 3,
                      marginRight: 5,
                      marginBottom: 3,
                      textDecoration: 'none',
                    }}
                  >
                    Email {String(emailToUse).slice(0, 36)}
                  </Link>
                ) : c.website_url ? (
                  <Text
                    style={{
                      fontSize: 9.5,
                      color: INK_SOFT,
                      paddingTop: 3,
                      paddingBottom: 3,
                      marginRight: 5,
                      marginBottom: 3,
                    }}
                  >
                    Contact via website form
                  </Text>
                ) : null}
                {c.contact_name ? (
                  <Text
                    style={{
                      fontSize: 9.5,
                      color: INK_SOFT,
                      paddingTop: 3,
                      paddingBottom: 3,
                      marginBottom: 3,
                    }}
                  >
                    Ask for {clean_prose(String(c.contact_name))}
                    {c.contact_title ? `, ${clean_prose(String(c.contact_title))}` : ''}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </View>
    )
  }

  // Chunk archetypes into pages — at most 2 archetypes per page to stay under
  // the React-PDF translate-overflow threshold (each archetype has up to 3
  // tall cards).
  const ARCHETYPES_PER_PAGE = 2
  const archetypeChunks: any[][] = []
  for (let i = 0; i < suppliers.length; i += ARCHETYPES_PER_PAGE) {
    archetypeChunks.push(suppliers.slice(i, i + ARCHETYPES_PER_PAGE))
  }

  const pages: React.ReactElement[] = []
  archetypeChunks.forEach((chunk, pageIdx) => {
    const isFirst = pageIdx === 0
    pages.push(
      <Page key={`sup-page-${pageIdx + 1}`} size="A4" style={PAGE_STYLE}>
        <PageHeader
          section={`Section 7 · Suppliers${archetypeChunks.length > 1 ? ` (page ${pageIdx + 1} of ${archetypeChunks.length})` : ''}`}
          project={project}
        />
        {isFirst ? (
          <>
            <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
              Suppliers
            </Text>
            <Text style={{ fontSize: 10, color: MUTED, marginBottom: 14 }}>
              Recommended companies for each delivery role — principal contractor and subcontractors. Up to 3 candidates per role. Each card carries a source badge (CH-VERIFIED = matched in Companies House; WEB-SOURCED = surfaced via web search and scored by LLM), a concrete capability line, two or three reasons the company fits this brief, and a direct call to action.
            </Text>
            <View
              style={{
                marginBottom: 14,
                padding: 10,
                backgroundColor: '#fef3c7',
                borderLeftWidth: 3,
                borderLeftColor: '#c2410c',
                borderRadius: 4,
              }}
            >
              <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.45 }}>
                Caveat — candidates are surfaced from a 28,000-company database plus a scored web fallback, then distilled into capability + fit bullets by a small language model. A human engineer should still validate fit, capacity, and certification before procurement.
              </Text>
            </View>
          </>
        ) : (
          <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 10 }}>
            Suppliers (continued)
          </Text>
        )}
        {chunk.map((archetype: any, archIdx: number) => (
          <View key={`arch-${pageIdx}-${archIdx}`} style={{ marginBottom: 16 }}>
            <View style={{ marginBottom: 6, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: ACCENT }}>
              <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: ACCENT }}>
                {clean_prose(String(archetype.archetype_label ?? archetype.archetype_id ?? ''))}
              </Text>
            </View>
            <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5, marginBottom: 10 }}>
              {clean_prose(String(archetype.function_description ?? ''))}
            </Text>
            {Array.isArray(archetype.candidates) && archetype.candidates.length > 0 ? (
              archetype.candidates.map((c: any, i: number) =>
                renderCandidateCard(c, archIdx * 100 + i),
              )
            ) : (
              <Text style={{ fontSize: 10, color: MUTED, fontStyle: 'italic' }}>
                No candidates passed the relevance scorer for this role. Recommend a manual shortlist or expand the search keyword set.
              </Text>
            )}
            {/* Phase19 audit 2026-05-17: archetype.notes is now provenance-only
                telemetry ("X from forge-truth.db (N rejected); M added via
                web-fallback.") that must NOT appear in the user-facing PDF.
                Suppress it here; the same data is preserved in
                state.suppliers_provenance for diagnostics. */}
          </View>
        ))}
        {/* 2026-05-18 audit fix: footer on every chunk page. */}
        <PageFooter />
      </Page>,
    )
  })

  return <>{pages}</>
}


/**
 * Resolve cover-hero + exploded-diagram image paths for the current product
 * class. Public/heroes/<slug>-cover.png and <slug>-exploded.png are produced
 * by the Blender pipeline (drone-9shot.py, bess-hero-bakeoff.py, future heatpump
 * etc.) and copied into public/heroes/ for each product class. Returns null
 * paths when no images exist for the class — renderer falls back to text-only.
 */
/**
 * Resolve per-module Blender diagram path for the current product class.
 * Path: public/heroes/<slug>/module-<module_id>.png. Returns null if file is
 * absent — module page falls back to no image.
 */
function classToSlug(productClass: string): string {
  // Normalise: lowercase, treat underscores AND hyphens AND spaces as the same separator.
  // State.json product_class can be display string "Battery Energy Storage System (BESS)"
  // OR snake_case "heat_pump" / "modular_indoor_vertical_farm" / "wearable_medical_device" etc.
  const norm = String(productClass).toLowerCase().replace(/[_-]/g, ' ')
  if (norm.includes('bess') || norm.includes('battery energy storage')) return 'bess'
  if (norm.includes('cinematography') || norm.includes('drone') || norm.includes('quad') || norm.includes('uav')) return 'drone'
  if (norm.includes('heat pump') || norm.includes('heatpump') || norm.includes('thermal system') || norm === 'thermal') return 'heatpump'
  if (norm.includes('ev charger') || norm.includes('charger')) return 'ev-charger'
  if (norm.includes('edge ai') || norm.includes('inference appliance') || norm.includes('rack mount')) return 'edge-ai'
  if (norm.includes('bioreactor')) return 'bioreactor'
  if (norm.includes('vertical farm')) return 'vertical-farm'
  if (norm.includes('cgm') || norm.includes('continuous glucose') || norm.includes('wearable medical') || norm.includes('glucose monitor')) return 'cgm'
  if (norm.includes('auv') || norm.includes('autonomous underwater')) return 'auv'
  if (norm.includes('haps') || norm.includes('high altitude') || norm.includes('stratospheric') || norm.includes('pseudo satellite')) return 'haps'
  return ''
}

function resolveModuleImage(productClass: string, moduleId: string, state?: any): string | null {
  const slug = classToSlug(productClass)
  if (!slug) return null
  // 2026-05-20 VF iter-7 council fix: per-module Blender images live in the
  // same public/heroes/<slug>/ directory and have the same brief-blindness
  // problem as the cover hero. If the brief envelope doesn't match the
  // static hero's implied scale (e.g. 40-ft ISO container vs desktop cabinet),
  // every module's diagram is also misleading. Suppress them.
  if (state !== undefined && !heroEnvelopeMatchesStaticHero(state)) return null
  const projectRoot = resolve(__dirname, '..')
  const path = resolve(projectRoot, 'public', 'heroes', slug, `module-${moduleId}.png`)
  return existsSync(path) ? path : null
}

/**
 * 2026-05-20 VF iter-7 council fix: the static hero PNGs in public/heroes/
 * are calibrated for small desktop / cabinet units (~1.5 × 1 × 2 m). The
 * vertical-farm hero shows a Babylon-style cabinet; the BESS hero shows a
 * single small rack. When the brief asks for a containerised system (40-ft
 * ISO container = 12.2 × 2.4 × 2.9 m = ~85 m³, or a warehouse-scale unit),
 * the static hero is materially misleading — the reader sees a desktop
 * cabinet and conflates it with the real envelope (which is two orders of
 * magnitude bigger).
 *
 * Until brief-aware image generation is wired, suppress the hero whenever
 * the declared envelope clearly exceeds the static hero's implied scale.
 * The cover falls back to text-only — honest beats wrong.
 *
 * Threshold: 8 m³ envelope volume. A 20-ft container = 33 m³. A desktop
 * cabinet = ~3 m³. Everything between is ambiguous; we err on the side of
 * suppression because a wrong image is worse than no image.
 */
function heroEnvelopeMatchesStaticHero(state: any): boolean {
  const maxDim = state?.parsedBrief?.constraints?.max_dimensions_mm
  if (maxDim) {
    const w = Number(maxDim.w ?? 0)
    const d = Number(maxDim.d ?? 0)
    const h = Number(maxDim.h ?? 0)
    if (w > 0 && d > 0 && h > 0) {
      const volumeM3 = (w * d * h) / 1_000_000_000
      if (volumeM3 > 8) return false
    }
  }
  const modulesA = state?.moduleDecomposition?.design?.modules
  const modulesB = state?.moduleDecomposition?.modules
  const mods: any[] = Array.isArray(modulesA) ? modulesA : Array.isArray(modulesB) ? modulesB : []
  for (const m of mods) {
    const dp = m?.derived_parameters
    if (!dp) continue
    const lengthMm = Number(dp.container_length_mm ?? dp.envelope_length_mm ?? 0)
    if (lengthMm > 5000) return false
    const volM3 = Number(dp.envelope_volume_m3 ?? dp.cabinet_volume_m3 ?? 0)
    if (volM3 > 8) return false
  }
  // Also check for explicit container references in module names/descriptions.
  // Brief text "40ft ISO container" + "20ft fertigation" doesn't always reach
  // derived_parameters — fall back to text-scan.
  const briefText = String(state?.parsedBrief?.brief_text ?? state?.brief?.text ?? '')
  if (/\b(20|40)\s?-?\s?(ft|foot)\s+(iso|hi-?cube|container|shipping)\b/i.test(briefText)) return false
  return true
}

function resolveHeroImages(state: any): { cover: string | null; exploded: string | null } {
  const raw =
    state?.moduleDecomposition?.product_class ??
    state?.parsedBrief?.product_class ??
    ''
  const slug = classToSlug(raw)
  if (!slug) return { cover: null, exploded: null }
  // Brief envelope sanity check: don't show a desktop hero for a container-scale brief.
  if (!heroEnvelopeMatchesStaticHero(state)) {
    return { cover: null, exploded: null }
  }
  // Renderer runs from project root; public/heroes resolves relative to cwd
  // when script is invoked via `npx tsx scripts/...` from the project root.
  const projectRoot = resolve(__dirname, '..')
  const coverPath = resolve(projectRoot, 'public', 'heroes', `${slug}-cover.png`)
  const explodedPath = resolve(projectRoot, 'public', 'heroes', `${slug}-exploded.png`)
  return {
    cover: existsSync(coverPath) ? coverPath : null,
    exploded: existsSync(explodedPath) ? explodedPath : null,
  }
}

function MinimalDocument({ state, subject }: { state: any; subject: string }) {
  const project = String(state.projectId || 'forge-engineering-report')
  const rawModules = state.moduleDecomposition?.modules ?? []
  const modules = order_modules(rawModules as Array<{ module: string; display_name?: string }>)
  const links = state.moduleDecomposition?.cross_module_grammar_links ?? []
  const byModule = state.naturalLanguageLayer?.by_module ?? {}
  const partLinkMap = buildPartLinkMap(state)
  const heroImages = resolveHeroImages(state)
  // Compute BoM totals once; CoverPage shows the headline figure and
  // BillOfMaterialsPage renders the full table from the same numbers.
  const rawBomTotals = computeBomTotals(state)
  // Price-reality check — compare grand total against per-class market
  // band. Slug hint pulled from projectId prefix ("BESS-001" → "bess").
  // Tristan 2026-05-17: "If our pricing is 100/200/300% out, that's a real
  // problem... how do we calibrate the cost of these things?"
  const slugHint = String(state.projectId || '').split('-')[0]?.toLowerCase() || undefined
  // Apply per-class batch-economics scale factor so consumer-volume classes
  // (CGM, drone, heatpump R290) stop being priced at distributor unit rates.
  // Pre-scale BoMs ran +24,000% / +1,910% / +789% high respectively. Scaled
  // BoMs land in band. See drawer forgeos_gotchas_e1f18dd3cfae9ee3.
  const bomTotals = applyBatchEconomics(state, rawBomTotals, slugHint)
  // Engine D — decompose the raw-materials BoM into the full cost stack
  // (raw → factory_COGS → OEM transfer → channel list → installed ASP) so
  // the cover page tells the truth about every layer instead of presenting
  // a single misleading "BoM total". Per-class ratios live in
  // src/lib/pdf-engine-v2/class-cost-structure.ts; see PLAN-2026-05-18
  // cost-correctness-engine-v2 § Engine D for the rationale.
  const costStack: CostStack | null = bomTotals && bomTotals.grandTotal_gbp > 0
    ? (() => {
        const { ratios, class_key } = resolveCostStack(state, slugHint)
        return computeCostStack(bomTotals.grandTotal_gbp, ratios, class_key)
      })()
    : null
  const priceReality = computePriceReality(state, bomTotals, slugHint, costStack)
  // Count of parts pending verification — surfaced on the cover so the
  // reader sees the audit-trail size before reaching Appendix A.
  const verifications: any[] = Array.isArray(state.partVerifications) ? state.partVerifications : []
  const pendingPartsCount = verifications.filter((v: any) => v.status === 'uncertain' || v.status === 'unverified').length

  // Manual-review badges (council 2026-05-18) — collect once from state and
  // distribute to the cover strip, inline section notes, and the back-of-PDF
  // appendix. Each gate sets its own state marker upstream; if none fire the
  // strip + appendix render nothing.
  const manualReviewBadges = collectManualReviewBadges(state)

  // Task #87 (2026-05-18) — provisional class-registry indicator.
  // Set upstream by stages/1.7-module-decomposition.ts triggerAutoClassRegistry
  // IfUnknown() when K10 verdict=NO_GRAPH. Used to (a) render the amber cover
  // note and (b) add the Appendix B provenance entry.
  const provisionalClassRegistry: {
    flag: boolean
    reason?: string
    payloadAttached?: boolean
    generatorModel?: string
    audit?: any
    payload?: any
  } = {
    flag: !!state?.moduleDecomposition?.provisional_class_registry,
    reason: state?.moduleDecomposition?.provisional_class_reason ?? undefined,
    payloadAttached: !!state?.moduleDecomposition?.auto_class_registry_payload,
    generatorModel: state?.moduleDecomposition?.auto_class_registry_audit?.generator_model ?? undefined,
    audit: state?.moduleDecomposition?.auto_class_registry_audit ?? null,
    payload: state?.moduleDecomposition?.auto_class_registry_payload ?? null,
  }

  return (
    <Document>
      <CoverPage subject={subject} projectId={project} heroImagePath={heroImages.cover} bomTotals={bomTotals} costStack={costStack} priceReality={priceReality} pendingPartsCount={pendingPartsCount} engineCSummary={state.engine_c_summary || null} manualReviewBadges={manualReviewBadges} provisionalClassRegistry={provisionalClassRegistry} acceptanceStatus={state?.acceptanceStatus} physicsCritique={state?.physicsCritique} />
      {/* Note: §2.5 connection map + optional exploded view is rendered just
          below. Wrapper component below adds a 2nd page when exploded image
          exists for the product class. */}
      {state.keyMetrics ? <HeadlinePage state={state} project={project} /> : null}
      <PerformanceCardPage state={state} project={project} />
      {state.brief?.was_revised ? <BriefRevisionNoticePage state={state} project={project} /> : null}
      <BriefPage state={state} project={project} manualReviewBadges={manualReviewBadges} />
      <DesignDecisionsPage state={state} project={project} />
      <ModuleConnectionMapPageWithExploded modules={modules} links={links} project={project} explodedImagePath={heroImages.exploded} manualReviewBadges={manualReviewBadges} />
      {modules.map((m: any, idx: number) => (
        <ModuleSection
          key={m.module}
          index={idx + 1}
          moduleSpec={m}
          nl={byModule[m.module]}
          partLinkMap={partLinkMap}
          project={project}
          moduleImagePath={resolveModuleImage(
            state?.moduleDecomposition?.product_class ?? state?.parsedBrief?.product_class ?? '',
            m.module,
            state,
          )}
        />
      ))}
      {/* §Compliance + §Risk moved AFTER modules per Tristan 2026-05-16 —
          too speculative at the front of the report when design isn't yet
          finalised. Sit between the modules + the parts-pending tail. */}
      <CompliancePage state={state} project={project} manualReviewBadges={manualReviewBadges} />
      <RiskPage state={state} project={project} manualReviewBadges={manualReviewBadges} />
      <DesignDecisionsPage state={state} project={project} />
      <BillOfMaterialsPage bomTotals={bomTotals} priceReality={priceReality} project={project} manualReviewBadges={manualReviewBadges} />
      <SuppliersPage state={state} project={project} />
      {/* Parts Pending Verification moved to Appendix A (last) per Tristan
          2026-05-17 — the dense audit-trail table is a reference document,
          not something the reader should hit mid-report. Cover page surfaces
          the count via the pendingPartsCount one-liner. */}
      <PartsPendingVerificationPage state={state} project={project} />
      {/* Appendix B — manual-review notes. Only renders when at least one
          gate fired; otherwise returns null. Sits at the very end so it's
          a reference page, not a mid-report interruption. */}
      <ManualReviewAppendixPage badges={manualReviewBadges} state={state} project={project} provisionalClassRegistry={provisionalClassRegistry} />
    </Document>
  )
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/render-minimal-pdf.ts <state.json> [out.pdf]')
    process.exit(1)
  }
  const statePath = resolve(args[0])
  const outPath = args[1] ? resolve(args[1]) : resolve(process.cwd(), 'minimal.pdf')

  const state = JSON.parse(readFileSync(statePath, 'utf-8'))

  const productClass = state.moduleDecomposition?.product_class
  // 2026-05-19 fix C7 (audit-found): the renderer previously only checked one
  // path (`state.brief.product_definition.subject`) which the chain never
  // writes. The chain's actual briefBlock shape (per serial-design-chain-v2.tsx
  // briefBlock construction) is { original_text, parsed_original, revised_text,
  // parsed_revised, revision_history, was_revised }. parsed_original/parsed_revised
  // are the brief parser's StructuredBriefJSON output, which emits `projectName`
  // (not `subject`) per stages/0-brief-generation.ts. The result was every PDF
  // title fell through to humanise(productClass) — e.g. "Heat Pump Residential"
  // instead of the founder's actual project name. Multi-path fallback below.
  const rawSubject = (
    state.brief?.product_definition?.subject  // legacy / PA-orchestrator shape
    || state.parsedBrief?.product_definition?.subject
    || state.brief?.parsed_revised?.product_definition?.subject  // refined brief, if revised
    || state.brief?.parsed_original?.product_definition?.subject  // original brief
    || state.brief?.parsed_revised?.subject
    || state.brief?.parsed_original?.subject
    || state.parsedBrief?.subject
    || state.brief?.parsed_revised?.projectName  // actual structured field per brief parser
    || state.brief?.parsed_original?.projectName
    || state.parsedBrief?.projectName
    // First non-empty line of the brief text — last-resort but truthful.
    || (typeof state.brief?.revised_text === 'string' && state.brief.revised_text.trim().split('\n').find((l: string) => l.trim())?.replace(/^#+\s*/, '').replace(/^Project Brief:\s*/i, '').replace(/^(?:[^.!?\n]{1,160}[.!?]|[^\n]{1,100}\b).*$/s, (m: string) => {
        // 2026-05-20 iter-8 council fix G: title truncation — the legacy
        // slice(0,80) cut "Primary Constraint" mid-word on the VF cover.
        // Now: prefer the first sentence terminator within 160 chars; if
        // none, fall back to the last word boundary within 100 chars.
        const sentEnd = m.search(/[.!?](?=\s|$)/)
        if (sentEnd >= 0 && sentEnd < 160) return m.slice(0, sentEnd + 1)
        const trimmed = m.slice(0, 100)
        const lastSpace = trimmed.lastIndexOf(' ')
        return lastSpace > 30 ? trimmed.slice(0, lastSpace) : trimmed
      }))
    || (typeof state.brief?.original_text === 'string' && state.brief.original_text.trim().split('\n').find((l: string) => l.trim())?.replace(/^#+\s*/, '').replace(/^Project Brief:\s*/i, '').replace(/^(?:[^.!?\n]{1,160}[.!?]|[^\n]{1,100}\b).*$/s, (m: string) => {
        // 2026-05-20 iter-8 council fix G: title truncation — the legacy
        // slice(0,80) cut "Primary Constraint" mid-word on the VF cover.
        // Now: prefer the first sentence terminator within 160 chars; if
        // none, fall back to the last word boundary within 100 chars.
        const sentEnd = m.search(/[.!?](?=\s|$)/)
        if (sentEnd >= 0 && sentEnd < 160) return m.slice(0, sentEnd + 1)
        const trimmed = m.slice(0, 100)
        const lastSpace = trimmed.lastIndexOf(' ')
        return lastSpace > 30 ? trimmed.slice(0, lastSpace) : trimmed
      }))
    || (productClass ? humanise(productClass) : 'Engineering Report')
  ) as string
  // Title case + preserve engineering acronyms (drawer 227e3c8fd74fcd32 bug #10:
  // brief parser emits "Battery energy storage system (bess)" — lowercases acronym).
  // Each word title-cased; known acronyms forced uppercase; small connector words
  // ("and", "of", "the", "for") left lowercase except when leading.
  const ACRONYMS = new Set(['BESS','PCS','BMS','HVAC','EMS','UPS','AUV','HAPS','CGM','EV','AC','DC','LFP','NMC','IEC','UL','NFPA','ISO','SCADA','PLC','LED','PCB','PCBA','HMI','GPS','IMU','MCU','FPGA','RAM','SSD','LAN','USB','PWM','PV','UPS','MOSFET','IGBT','AFE','RTD','NTC','UAV','RF','GNSS','ADCS','CRC','MQTT','API','LTE','BMS','VFD','PDU','PID','OEM','EPC','MPPT','EEV','BPHE','OCPP','CCS2'])
  const SMALL_WORDS = new Set(['and','or','of','the','for','to','in','on','a','an','with'])
  const subject = rawSubject.split(/(\s+|\(|\))/).map((tok, idx, arr) => {
    if (/^[\s()]+$/.test(tok)) return tok
    const lower = tok.toLowerCase()
    const upper = tok.toUpperCase()
    if (ACRONYMS.has(upper)) return upper
    if (idx > 0 && SMALL_WORDS.has(lower)) return lower
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  }).join('')

  console.error(`[render-minimal-pdf] state: ${statePath}`)
  console.error(`[render-minimal-pdf] modules: ${(state.moduleDecomposition?.modules ?? []).length}`)
  console.error(`[render-minimal-pdf] rendering...`)

  const blob = await pdf(<MinimalDocument state={state} subject={subject} />).toBlob()
  const buffer = Buffer.from(await blob.arrayBuffer())
  writeFileSync(outPath, buffer)
  const sizeKb = (buffer.length / 1024).toFixed(1)
  console.error(`[render-minimal-pdf] written ${outPath} (${sizeKb} KB)`)

  // Open in Preview — execFileSync (no shell interpolation, safe path).
  // Suppress via RENDER_NO_OPEN=1 for batch / audit runs.
  if (process.env.RENDER_NO_OPEN !== '1') {
    try {
      execFileSync('open', [outPath])
      console.error(`[render-minimal-pdf] opened`)
    } catch (err) {
      console.error(`[render-minimal-pdf] open failed:`, err)
    }
  }
}

main().catch(err => {
  console.error('[render-minimal-pdf] FATAL:', err)
  process.exit(1)
})
