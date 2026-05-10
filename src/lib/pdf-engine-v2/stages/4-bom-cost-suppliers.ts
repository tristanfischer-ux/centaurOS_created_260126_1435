/**
 * @file stages/4-bom-cost-suppliers.ts — Integrated BOM / Cost / Suppliers stage (v2).
 *
 * Replaces the three-stage split (4-bom-cost → 8a Cost → 5-suppliers) with a
 * single coherent stage that:
 *   1. Generates BOM parts via structured LLM sub-tasks
 *   2. Classifies each part as Make or Buy
 *   3. Looks up Buy parts via the three-distributor aggregator (parallel)
 *   4. Estimates Make costs via LLM sub-task + corpus supplier search (parallel)
 *   5. Aggregates a CostWaterfall with real distributor prices + LLM Make estimates
 *   6. Emits three PDF section payloads (BOM, Cost, Suppliers)
 *
 * RL hygiene: the LLM call is structured into NAMED SUB-TASKS delimited by
 * <!-- SUBTASK: <name> --> markers so the RL framework can tune one sub-task
 * independently of the others.
 *
 * Feature flag: enabled when BOM_PIPELINE=v2 (default: v1 = old 3-stage flow).
 *
 * Migration: old stages/4-bom-cost.ts and stages/5-suppliers.ts remain
 * untouched. Cut-over happens via env flag only.
 */

import { calculateCost } from '../cost-model'
import {
  loadAllGroundingData,
  formatMaterialsForPrompt,
  formatProcessesForPrompt,
  type GroundingData,
  type MaterialProperty,
  type ProcessCapability,
} from '../db-queries'
import type {
  Module,
  Part,
  BomLine,
  CostBreakdown,
  DesignBrief,
  SupplierMatch,
  StageResult,
} from '../types'
import { DOMAIN_OVERHEAD as OVERHEAD_MAP } from '../types'
import { sanitiseLlmOutput } from '../sanitiser'
import { BOM_GENERATION_SYSTEM } from '../prompts'
import { STAGE_TEMPERATURES } from '../llm-temperature-config'
import { parseJsonFromLlm } from '../lib/llm-json'
import { buildDeterministicPhase, deduplicateBom } from '../lib/bom-builder'
import { deriveQuantities, applyOverrides } from '../lib/quantity-derivation'
import { findSkuForPart, type AggregateResult } from '../lib/distributors/index'
import {
  semanticSupplierSearch,
  isLocalCorpusAvailable,
  type LocalSupplier,
} from '../lib/local-corpus'
import {
  getPartSnippetFromSupplier,
  partKeywords,
  isPageChunksAvailable,
} from '../lib/page-chunks'
import {
  classifyDomain,
  productClassToDomainTags,
  tagIntersectionBoost,
  type DomainTag,
} from '../lib/domain-tags'
import {
  buildReverseIndexes,
  companiesByProcess,
  companiesByMaterial,
  isReverseIndexAvailable,
} from '../lib/reverse-indexes'
import type { ProductSpecs } from '../lib/spec-extraction'

// ── Constants ────────────────────────────────────────────────────────────────

const USD_TO_GBP = 0.8
const DEFAULT_BATCH_SIZE = 25

/** Corpus similarity threshold: tighten first, loosen if fewer than 3 matches. */
const CORPUS_THRESHOLD_DEFAULT = 0.25
const CORPUS_THRESHOLD_LOOSE = 0.15

/** Required supplier count per Make BOM line (hard requirement). */
const REQUIRED_SUPPLIERS_PER_MAKE_LINE = 3

// ── Public types ─────────────────────────────────────────────────────────────

/**
 * IntegratedBomLine — the unified unit of account for the integrated stage.
 *
 * Flat, costed BOM row — one per part in the product. Assembly hierarchy is
 * preserved in the existing BomLine parent/child schema (unchanged).
 */
export interface IntegratedBomLine {
  // ── Identity ──────────────────────────────────────────────────────────────
  id: string
  partNumber: string
  name: string
  sourceModuleId: string
  quantity: number

  // ── Make / Buy classification ─────────────────────────────────────────────
  /**
   * 'buy'  → off-the-shelf (buy_electronic, buy_mechanical_industrial,
   *           named_manufacturer_reseller). Distributor APIs called.
   * 'make' → custom-manufactured. Supplier corpus searched.
   * 'service' → certification / test service. Treated as 'make' for supplier matching.
   */
  partRegime: 'buy' | 'make' | 'service'
  regime: 'buy_electronic' | 'buy_mechanical_industrial' | 'named_manufacturer_reseller' | 'make_custom_fab' | 'service_certification'

  // ── Physical ──────────────────────────────────────────────────────────────
  massKg?: number
  process?: string
  material?: string

  // ── Costing ───────────────────────────────────────────────────────────────
  /**
   * costSource: how unitCostGbp was derived.
   * Grade D (per prompt_architecture) = 'estimated' (LLM / heuristic).
   */
  costSource: 'mouser' | 'farnell' | 'digikey' | 'lcsc' | 'supplier' | 'estimated' | 'database'
  unitCostGbp: number
  /**
   * LLM-estimated Make cost. Grade D — expert estimate.
   * Superseded if a supplier quote is later obtained via RFQ (out of scope).
   */
  makeCostEstimateGbp?: number

  // ── Buy-specific: distributor results ─────────────────────────────────────
  distributors?: Array<{
    source: 'mouser' | 'farnell' | 'digikey' | 'lcsc'
    mpn: string
    manufacturer: string
    description: string
    priceGBP: Array<{ qty: number; unitPriceGbp: number }>
    stockUK: number | null
    datasheetUrl: string | null
    productUrl: string
    fetchedAt: string
  }>
  bestDistributor?: {
    source: 'mouser' | 'farnell' | 'digikey' | 'lcsc'
    sku: string
    unitPriceGbp: number
    stockUK: number | null
    datasheetUrl: string | null
    productUrl: string
  }

  // ── Make-specific: supplier shortlist ─────────────────────────────────────
  /**
   * Present when partRegime === 'make'. Hard requirement: aim for 3 entries.
   * If corpus returns fewer than 3 after threshold-loosening, sets
   * needsSourcingReview: true and returns what's found (no sentinel padding).
   */
  suppliers?: Array<{
    name: string
    url: string
    reason: string
    score: number
    country?: string
    certifications?: string[]
    processes?: string[]
    companyId?: string
    domainTags?: string[]
    processMatch?: 'process+material' | 'process' | 'material' | 'unverified'
    datasheetSnippet?: {
      text: string
      sourceUrl: string
      relevance: number
    }
  }>
  /** True when corpus returned fewer than 3 suppliers even after threshold-loosening. */
  needsSourcingReview?: boolean

  // ── Two-tier BOM verification ─────────────────────────────────────────────
  /**
   * "verified"  → real distributor MPN + price returned from Mouser/Digi-Key/Farnell.
   * "estimated" → OEM estimate or LLM-only price; manufacturer hint surfaced in PDF.
   */
  verification_status: 'verified' | 'estimated'

  /**
   * 5-class part taxonomy (from MODULE_DECOMPOSITION_SYSTEM_PA expected_parts).
   * electronic_cots / mechanical_cots → distributor lookup → verified if found.
   * structural_fabricated / oem_subsystem / software_ip → always estimated.
   */
  part_class?: 'electronic_cots' | 'mechanical_cots' | 'structural_fabricated' | 'oem_subsystem' | 'software_ip' | null

  /**
   * Manufacturer hint from the LLM (e.g. "CATL", "Sungrow").
   * Shown in ESTIMATE rows as "Contact: <manufacturer>".
   */
  manufacturer_hint?: string | null

  /**
   * LLM-supplied MPN from MODULE_DECOMPOSITION_SYSTEM_PA expected_parts.
   * Used as the primary lookup key for distributor APIs when part_class is
   * electronic_cots or mechanical_cots.
   */
  llm_mpn?: string | null

  // ── RL sub-task attribution ───────────────────────────────────────────────
  llmSubTask: 'PROPOSE_PARTS' | 'CLASSIFY_MAKE_BUY' | 'ESTIMATE_MAKE_COST' | 'deterministic'

  // ── Audit ─────────────────────────────────────────────────────────────────
  priceSource?: string
  matchedMaterialCode?: string | null
  matchedProcessName?: string | null
  qtyDeterministic?: boolean
  qtyRule?: string

  /**
   * Verbatim formula the LLM used to derive quantity_per_assembly in the Module
   * Decomposition stage. Propagated here for procurement audit and PDF rendering.
   * Examples: "3,500 kWh / 0.8 DoD × 1000 / (3.2 V × 280 Ah) = 4,880 → 4,896 (16-string aligned)"
   * Null when the count is trivially obvious (e.g. 1 container).
   */
  quantity_calculation_basis?: string | null

  /**
   * Grade D lookup estimate basis string.
   * Non-null when the unit cost was filled by the GRADE_D_SUBSYSTEM_ESTIMATES_GBP
   * table (not from a distributor, not from an LLM ESTIMATE_MAKE_COST call).
   *
   * Hierarchy: VERIFIED > LLM ESTIMATE > GRADE D > DATA GAP
   *
   * The PDF renderer shows "~ EST D" (not "~ ESTIMATE") when this field is set.
   */
  gradeD_estimate_basis?: string | null
}

/**
 * CostWaterfall — structured cost output. Superset of CostBreakdown.
 * CostBreakdown is still populated at output for PDF renderer backwards-compat.
 */
export interface CostWaterfall {
  rawBomCostGbp: number
  buyLinesTotalGbp: number
  makeLinesTotalGbp: number
  overheadMultiplier: number
  assemblyCostGbp: number
  nreTotalGbp: number
  unitTotalGbp: number
  ceilingGbp: number | null
  waterfallSteps: Array<{
    label: string
    gbp: number
    pctOfTotal: number
    source: 'buy_distributor' | 'buy_estimated' | 'make_supplier' | 'make_estimated' | 'overhead' | 'nre'
  }>
  perModule: Array<{
    moduleId: string
    moduleName: string
    totalGbp: number
    buyGbp: number
    makeGbp: number
    lineCount: number
    // D FIX (2026-05-09): percentage of grand total for "% of BOM" column
    pctOfBom?: number
  }>
  narrativeMarkdown: string
  quotedCostFraction: number
  exceedsCeiling: boolean
  gapPct: number | null
}

export interface BomCostSuppliersInput {
  modules: Module[]
  designBrief?: DesignBrief | null
  classification: {
    productClass: string
    technologyDomains: string[]
    hazardDomains: string[]
    manufacturingArchetype: string
  }
  grounding?: GroundingData
  productSpecs?: ProductSpecs
  domain?: string
  ceilingGbp?: number
  trainingDataDossier?: string
  batchSize?: number
}

export interface BomCostSuppliersOutput {
  bomLines: IntegratedBomLine[]
  costWaterfall: CostWaterfall
  /** Canonical cost source of truth — stored on PipelineState.costSummary. */
  costSummary: import('../types').CostSummary
  sectionBom: string
  sectionCost: string
  sectionSuppliers: string
  // Backwards-compat for PDF renderer
  parts: Part[]
  costBreakdown: CostBreakdown
  supplierMatches: SupplierMatch[]
}

// ── LLM helpers ─────────────────────────────────────────────────────────────

async function callOpenRouterJson(systemPrompt: string, userContent: string): Promise<any> {
  const models = [
    'google/gemini-3.1-pro-preview',
    'xiaomi/mimo-v2.5-pro',
    'openai/gpt-4.1-mini',
  ]
  let lastErr: any = null

  for (const model of models) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300_000)
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: STAGE_TEMPERATURES.bom,
          max_tokens: 16384,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) throw new Error(`OpenRouter ${model} returned ${response.status}`)

      const json = await response.json()
      const msg = json.choices?.[0]?.message
      let raw = msg?.content || msg?.reasoning || ''
      if (!raw && msg?.reasoning_details?.length) {
        raw = msg.reasoning_details
          .filter((d: any) => d.type === 'reasoning.text')
          .map((d: any) => d.text)
          .join('\n')
      }
      if (!raw) throw new Error(`${model}: empty content`)

      console.log(`[bom-v2] ${model} responded: ${raw.length} chars`)
      return parseJsonFromLlm(raw, { stage: 'bom_integrated', model })
    } catch (err) {
      clearTimeout(timeout)
      lastErr = err
      console.warn(`[bom-v2] ${model} failed: ${(err as Error).message}. Trying next model...`)
      continue
    }
  }
  throw lastErr || new Error('All BOM v2 models failed')
}

// ── Grounding helpers (copied from 4-bom-cost.ts, unchanged) ────────────────

function findMaterial(materialField: string | undefined, catalogue: MaterialProperty[]): MaterialProperty | null {
  if (!materialField || catalogue.length === 0) return null
  const needle = materialField.trim().toLowerCase()
  if (!needle || needle === 'varies' || needle === 'cots' || needle === 'n/a') return null

  const byCode = catalogue.find(m => m.material_code.toLowerCase() === needle)
  if (byCode) return byCode

  const byName = catalogue.find(m => m.material_name.toLowerCase() === needle)
  if (byName) return byName

  const bySubCode = catalogue.find(m =>
    m.material_code.toLowerCase().includes(needle) ||
    needle.includes(m.material_code.toLowerCase()),
  )
  if (bySubCode) return bySubCode

  const family = catalogue
    .filter(m => needle.includes(m.material_family.toLowerCase()))
    .sort((a, b) => (a.cost_per_kg_usd ?? Infinity) - (b.cost_per_kg_usd ?? Infinity))
  if (family.length > 0) return family[0]

  return null
}

function findProcess(processField: string | undefined, catalogue: ProcessCapability[]): ProcessCapability | null {
  if (!processField || catalogue.length === 0) return null
  const needle = processField.trim().toLowerCase()
  if (!needle || needle === 'purchased_cots' || needle === 'cots') return null

  const byName = catalogue.find(p => p.process_name.toLowerCase() === needle)
  if (byName) return byName

  const byDisplay = catalogue.find(p => p.display_name.toLowerCase() === needle)
  if (byDisplay) return byDisplay

  const bySub = catalogue.find(p =>
    p.process_name.toLowerCase().includes(needle) ||
    needle.includes(p.process_name.toLowerCase()),
  )
  if (bySub) return bySub

  return null
}

function computeFabricatedCost(
  massKg: number | undefined,
  material: MaterialProperty | null,
  process: ProcessCapability | null,
  batchSize: number,
): { cost: number; breakdown: string } | null {
  if (!massKg || massKg <= 0) return null
  if (!material || material.cost_per_kg_usd == null) return null

  const materialCostUsd = massKg * material.cost_per_kg_usd
  const materialCostGbp = materialCostUsd * USD_TO_GBP

  if (!process) {
    return {
      cost: materialCostGbp,
      breakdown: `material only: ${massKg.toFixed(2)}kg × $${material.cost_per_kg_usd}/kg = £${materialCostGbp.toFixed(2)}`,
    }
  }

  const setupPerPartUsd = (process.setup_cost_usd_typical ?? 0) / Math.max(1, batchSize)
  const mult = process.per_part_cost_multiplier ?? 1
  const processLabourUsd = materialCostUsd * Math.max(0, mult - 1) + setupPerPartUsd
  const processLabourGbp = processLabourUsd * USD_TO_GBP
  const total = materialCostGbp + processLabourGbp

  return {
    cost: total,
    breakdown: `${massKg.toFixed(2)}kg ${material.material_code} @ $${material.cost_per_kg_usd}/kg + ${process.display_name} (${mult}× mult) = £${total.toFixed(2)}`,
  }
}

// ── Supplier helpers ─────────────────────────────────────────────────────────

/**
 * Build a scored, ranked supplier list for a single Make part.
 * Applies threshold-loosening logic:
 *   1. Try at CORPUS_THRESHOLD_DEFAULT (0.25), topK=8
 *   2. If < REQUIRED_SUPPLIERS_PER_MAKE_LINE, loosen to CORPUS_THRESHOLD_LOOSE (0.15)
 *   3. Return whatever's found + set needsSourcingReview=true if still < 3
 *
 * Does NOT pad with sentinels (per Tristan's decision). Does NOT call Brave Search.
 */
async function findMakeSuppliers(
  embedding: number[],
  part: { process?: string; material?: string; name?: string; id?: string },
  requiredTags: string[],
): Promise<{ suppliers: IntegratedBomLine['suppliers']; needsSourcingReview: boolean }> {
  if (!isLocalCorpusAvailable()) {
    return { suppliers: [], needsSourcingReview: true }
  }

  const verifyEnabled = isReverseIndexAvailable()
  const processMatchIds = verifyEnabled && part.process
    ? new Set(companiesByProcess(part.process, 2000))
    : new Set<string>()
  const materialMatchIds = verifyEnabled && part.material
    ? new Set(companiesByMaterial(part.material, 2000))
    : new Set<string>()

  const snippetEnabled = isPageChunksAvailable()
  const keywords = partKeywords(part as any)

  const UK_EU_COUNTRIES = new Set(['GB', 'IE', 'DE', 'NL', 'FR', 'SE'])

  function scoreAndRank(hits: LocalSupplier[]): LocalSupplier[] {
    return hits
      .map(h => {
        const tags = classifyDomain(h.description)
        const tagBoost = tagIntersectionBoost(tags, requiredTags as any)

        const procOk = h.companyId ? processMatchIds.has(h.companyId) : false
        const matOk = h.companyId ? materialMatchIds.has(h.companyId) : false
        const procMatBoost = procOk || matOk ? 1.02 : 1.0

        const ukBoost = h.country && UK_EU_COUNTRIES.has(h.country.toUpperCase()) ? 1.05 : 1.0

        return {
          hit: h,
          tags,
          adjusted: h.similarity * tagBoost * procMatBoost * ukBoost,
        }
      })
      .sort((a, b) => b.adjusted - a.adjusted)
      .map(r => r.hit)
  }

  function toSupplierEntry(h: LocalSupplier, idx: number): NonNullable<IntegratedBomLine['suppliers']>[number] {
    const procOk = h.companyId ? processMatchIds.has(h.companyId) : false
    const matOk = h.companyId ? materialMatchIds.has(h.companyId) : false
    let verification: 'process+material' | 'process' | 'material' | 'unverified' = 'unverified'
    if (verifyEnabled && h.companyId) {
      if (procOk && matOk) verification = 'process+material'
      else if (procOk) verification = 'process'
      else if (matOk) verification = 'material'
    }

    const snippet = (snippetEnabled && idx === 0 && h.companyId)
      ? getPartSnippetFromSupplier(h.companyId, keywords)
      : null

    const reason = buildSupplierReason(h)
    const tags = classifyDomain(h.description)

    return {
      name: h.name,
      url: h.website || '',
      reason,
      score: h.similarity,
      country: h.country ?? undefined,
      certifications: h.certifications,
      processes: h.processCapabilities.map(p => p.processName).filter(Boolean),
      companyId: h.companyId,
      domainTags: tags,
      processMatch: verification,
      datasheetSnippet: snippet
        ? { text: snippet.text, sourceUrl: snippet.sourceUrl, relevance: snippet.relevance }
        : undefined,
    }
  }

  // Phase 1: default threshold
  let hits = semanticSupplierSearch(embedding, 8, CORPUS_THRESHOLD_DEFAULT) ?? []
  hits = scoreAndRank(hits)

  if (hits.length < REQUIRED_SUPPLIERS_PER_MAKE_LINE) {
    // Phase 2: loosen threshold
    console.log(`[bom-v2] <3 corpus hits at default threshold for "${part.name}" — loosening to ${CORPUS_THRESHOLD_LOOSE}`)
    const looseHits = semanticSupplierSearch(embedding, 8, CORPUS_THRESHOLD_LOOSE) ?? []
    hits = scoreAndRank(looseHits)
  }

  const selected = hits.slice(0, REQUIRED_SUPPLIERS_PER_MAKE_LINE)
  const needsSourcingReview = selected.length < REQUIRED_SUPPLIERS_PER_MAKE_LINE

  if (needsSourcingReview) {
    console.warn(`[bom-v2] Only ${selected.length} suppliers found for "${part.name}" — needsSourcingReview=true`)
  }

  return {
    suppliers: selected.map((h, idx) => toSupplierEntry(h, idx)),
    needsSourcingReview,
  }
}

function buildSupplierReason(h: LocalSupplier): string {
  const bits: string[] = []
  if (h.description) bits.push(h.description.slice(0, 200))
  if (h.processCapabilities.length > 0) {
    const procs = h.processCapabilities.slice(0, 3).map(p => p.processName).filter(Boolean).join(', ')
    if (procs) bits.push(`Processes: ${procs}`)
  }
  if (h.certifications.length > 0) bits.push(`Certs: ${h.certifications.slice(0, 3).join(', ')}`)
  if (h.city || h.country) bits.push(`Location: ${[h.city, h.country].filter(Boolean).join(', ')}`)
  return bits.join(' · ').slice(0, 400) || 'Matched local supplier corpus.'
}

// ── Embed helper (reused from 5-suppliers.ts) ────────────────────────────────

async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: texts,
      dimensions: 1536,
    }),
  })
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return (data.data as Array<{ embedding: number[] }>).map(d => d.embedding)
}

// ── Section text generators ───────────────────────────────────────────────────

function buildSectionBom(lines: IntegratedBomLine[]): string {
  const verified = lines.filter(l => l.verification_status === 'verified')
  const estimated = lines.filter(l => l.verification_status === 'estimated')

  const formatRows = (bLines: IntegratedBomLine[]) => bLines.map(l => {
    const regime = l.partRegime === 'buy' ? 'Buy' : 'Make'
    const cost = l.unitCostGbp != null ? `£${l.unitCostGbp.toFixed(2)}` : '—'
    const total = l.unitCostGbp != null ? `£${(l.unitCostGbp * l.quantity).toFixed(2)}` : '—'
    const mpn = l.bestDistributor?.sku || l.llm_mpn || '—'
    const source = l.verification_status === 'verified' ? l.costSource : (l.manufacturer_hint ? `Estimate — ${l.manufacturer_hint}` : 'OEM estimate')
    return `| ${l.partNumber} | ${l.name} | ${l.quantity} | ${regime} | ${mpn} | ${cost} | ${total} | ${source} |`
  })

  const header = '| Part # | Name | Qty | Regime | MPN | Unit Cost | Line Total | Source |'
  const divider = '|--------|------|-----|--------|-----|-----------|------------|--------|'

  const sections: string[] = []
  if (verified.length > 0) {
    sections.push('### ✓ VERIFIED — Real Mouser/Digi-Key/Farnell data')
    sections.push(header)
    sections.push(divider)
    sections.push(...formatRows(verified))
  }
  if (estimated.length > 0) {
    sections.push('')
    sections.push('### ~ OEM ESTIMATE — Manufacturer hint only, pending RFQ')
    sections.push(header)
    sections.push(divider)
    sections.push(...formatRows(estimated))
  }
  return sections.join('\n')
}

function buildSectionCost(waterfall: CostWaterfall): string {
  const steps = waterfall.waterfallSteps
    .map(s => `| ${s.label} | £${s.gbp.toFixed(2)} | ${s.pctOfTotal.toFixed(1)}% |`)
    .join('\n')

  const lines: string[] = [
    '## Cost Waterfall',
    '',
    `**Total per-unit cost:** £${waterfall.unitTotalGbp.toFixed(2)}`,
    waterfall.ceilingGbp
      ? `**Target ceiling:** £${waterfall.ceilingGbp.toFixed(2)} — ${waterfall.exceedsCeiling ? `EXCEEDS by ${waterfall.gapPct?.toFixed(1)}%` : 'within budget'}`
      : '',
    `**Quoted cost fraction:** ${(waterfall.quotedCostFraction * 100).toFixed(0)}% (distributor-quoted)`,
    '',
    '| Step | £ | % of Total |',
    '|------|---|------------|',
    steps,
    '',
    waterfall.narrativeMarkdown,
  ]
  return lines.filter(l => l !== '').join('\n')
}

function buildSectionSuppliers(lines: IntegratedBomLine[]): string {
  const makeLines = lines.filter(l => l.partRegime === 'make' || l.partRegime === 'service')
  if (makeLines.length === 0) {
    return '_No Make parts — all parts sourced from distributors._'
  }

  const parts: string[] = []
  for (const line of makeLines) {
    parts.push(`### ${line.name} (${line.partNumber})`)
    if (line.needsSourcingReview) {
      parts.push('> **Fewer than three suppliers matched — needs sourcing review**')
    }
    if (!line.suppliers || line.suppliers.length === 0) {
      parts.push('_No suppliers found in corpus._')
    } else {
      for (const s of line.suppliers) {
        parts.push(
          `- **${s.name}** (score: ${s.score.toFixed(3)}) — ${s.url || 'no URL'}` +
          (s.country ? ` · ${s.country}` : '') +
          (s.processMatch && s.processMatch !== 'unverified' ? ` · verified: ${s.processMatch}` : '')
        )
        if (s.reason) parts.push(`  ${s.reason.slice(0, 200)}`)
      }
    }
    parts.push('')
  }
  return parts.join('\n')
}

// ── Backwards-compat converters ───────────────────────────────────────────────

function toCorePart(line: IntegratedBomLine): Part {
  return {
    id: line.id,
    partNumber: line.partNumber,
    name: line.name,
    sourceModuleId: line.sourceModuleId,
    process: line.process,
    material: line.material,
    massKg: line.massKg,
    estimatedUnitCostGbp: line.unitCostGbp,
    isPurchased: line.partRegime === 'buy',
    regime: line.regime,
    regimeRouterResult: line.bestDistributor
      ? {
          regime: line.regime,
          source: 'distributor',
          sku: line.bestDistributor.sku,
          priceGbp: line.bestDistributor.unitPriceGbp,
          datasheetUrl: line.bestDistributor.datasheetUrl ?? undefined,
          stockQty: line.bestDistributor.stockUK ?? undefined,
          confidence: 'HIGH' as const,
          notes: `Best distributor: ${line.bestDistributor.source}`,
        }
      : undefined,
  }
}

function toCoreBomLine(line: IntegratedBomLine): BomLine {
  return {
    childPartId: line.partNumber,
    quantity: line.quantity,
  }
}

function toSupplierMatch(line: IntegratedBomLine): SupplierMatch {
  return {
    partId: line.id || line.partNumber,
    partName: line.name,
    suppliers: (line.suppliers ?? []).map(s => ({
      name: s.name,
      url: s.url,
      reason: s.reason,
      score: s.score,
      country: s.country,
      certifications: s.certifications,
      processes: s.processes,
      companyId: s.companyId,
      domainTags: s.domainTags,
      processMatch: s.processMatch,
      datasheetSnippet: s.datasheetSnippet,
    })),
  }
}

// ── Structured LLM prompt ──────────────────────────────────────────────────────

const INTEGRATED_BOM_SYSTEM = `You are a manufacturing engineer generating an integrated Bill of Materials for a hardware product.

Your response MUST be a single JSON object with exactly these four top-level keys, each corresponding to a named sub-task:

{
  "PROPOSE_PARTS": { "parts": [ ...array of part objects... ] },
  "CLASSIFY_MAKE_BUY": { "classifications": [ ...array of classification objects... ] },
  "ESTIMATE_MAKE_COST": { "estimates": [ ...array of cost estimate objects... ] },
  "WRITE_COST_NARRATIVE": { "narrativeMarkdown": "..." }
}

<!-- SUBTASK: PROPOSE_PARTS -->
Generate a complete BOM for the product modules below.
For each part provide ALL of these fields:
  - partNumber (unique, e.g., "batt-cell-001")
  - name (human display name)
  - sourceModuleId (one of the module IDs provided)
  - process (from the process catalogue — exact process_name)
  - material (from the materials catalogue — exact material_code)
  - massKg (number, positive)
  - isPurchased (boolean: true = off-the-shelf COTS, false = custom-fabricated)
  - estimatedUnitCostGbp (number — your best estimate; will be verified against distributor APIs)
Output this as the "parts" array inside PROPOSE_PARTS.
Do NOT include parts already listed in deterministicParts.
<!-- END SUBTASK: PROPOSE_PARTS -->

<!-- SUBTASK: CLASSIFY_MAKE_BUY -->
For EACH part from PROPOSE_PARTS, classify it as 'buy' or 'make'.
Rules:
  - ICs, passives, connectors, sensors (COTS), standard fasteners, named-brand modules → buy
  - Custom housings, machined brackets, formed sheet metal, welded frames, custom PCB layouts,
    wiring harnesses, moulded overmoulds, adhesive die-cut parts → make
  - Named manufacturer products (CATL, Danfoss, Sungrow, Nordic Semi…) → buy
Output as the "classifications" array inside CLASSIFY_MAKE_BUY.
Each entry: { "partNumber": "...", "partRegime": "buy"|"make", "regimeReason": "one sentence" }
<!-- END SUBTASK: CLASSIFY_MAKE_BUY -->

<!-- SUBTASK: ESTIMATE_MAKE_COST -->
For EACH part classified as 'make' in CLASSIFY_MAKE_BUY, estimate the per-unit cost in GBP
at the given batch size. Base the estimate on:
  - material cost from the catalogue (mass × cost_per_kg)
  - process setup amortised over batch size
  - typical labour rate for the process
This estimate is Grade D (expert estimate) — it will be shown in the Cost section labelled
as an estimate, pending supplier RFQ confirmation.
Output as the "estimates" array inside ESTIMATE_MAKE_COST.
Each entry: { "partNumber": "...", "makeCostEstimateGbp": number, "estimateConfidence": "high"|"medium"|"low", "estimateReasoning": "one sentence" }
<!-- END SUBTASK: ESTIMATE_MAKE_COST -->

<!-- SUBTASK: WRITE_COST_NARRATIVE -->
Write prose for the Cost Waterfall section of the engineering report.
You will see the resolved cost waterfall data in the user message.
The narrative MUST:
  - State the total per-unit cost and whether it is within the target ceiling
  - Break down Buy vs Make vs overhead contributions in GBP terms
  - Name the single highest-cost line and its source
  - Note the quotedCostFraction (fraction of BOM cost that is distributor-quoted)
  - Identify the top cost-reduction opportunity
Output: narrativeMarkdown — 3 to 5 paragraphs, no section headers, British English spelling.
<!-- END SUBTASK: WRITE_COST_NARRATIVE -->`

// ── Grade D subsystem estimate table ─────────────────────────────────────────
//
// Indicative Grade D estimates for common subsystems (UK 2025 market).
// These are deliberately wide ranges; sourced from public catalogue averages.
// Marked clearly as Grade D = "rough order of magnitude, ±50%"
// Used only when verification_status === 'estimated' AND unitCostGbp === 0.
//
// Hierarchy: VERIFIED > LLM ESTIMATE > GRADE D > DATA GAP

const GRADE_D_SUBSYSTEM_ESTIMATES_GBP: Record<string, {
  min: number
  typical: number
  max: number
  basis: string
}> = {
  bms_master_controller: { min: 2000, typical: 4500, max: 8000, basis: 'BMS master with cell monitoring up to 256 cells' },
  bms_slave_board: { min: 200, typical: 400, max: 700, basis: '16-cell slave board with thermistor inputs' },
  fire_suppression_system: { min: 8000, typical: 18000, max: 35000, basis: 'Aerosol or clean-agent panel for ~30 m³ container' },
  fire_detection_heads: { min: 500, typical: 1200, max: 3000, basis: 'Multi-point smoke/heat detection heads for container enclosure' },
  thermal_management_liquid: { min: 15000, typical: 35000, max: 60000, basis: 'Liquid cooling loop with chiller for 1 MW heat load' },
  thermal_management_air: { min: 5000, typical: 12000, max: 25000, basis: 'Forced-air ventilation with redundant fans' },
  ems_controller: { min: 8000, typical: 18000, max: 35000, basis: 'Energy management system with grid-tie SCADA' },
  pcs_inverter_1mw: { min: 60000, typical: 95000, max: 150000, basis: '1 MW grid-tie PCS, IEC 62920 / G99 certified' },
  step_up_transformer_lv_to_hv: { min: 12000, typical: 22000, max: 40000, basis: '1 MVA cast-resin or oil-filled, ONAN' },
  main_dc_contactor_2000a: { min: 600, typical: 1200, max: 2500, basis: '1500 V DC, 2000 A continuous' },
  switchgear_acb_3200a: { min: 3500, typical: 6500, max: 12000, basis: 'Air circuit breaker, 3200 A, draw-out, IEC 61439' },
  heat_pump_compressor: { min: 3000, typical: 7000, max: 15000, basis: 'Scroll or rotary compressor for commercial heat pump' },
  drone_motor_esc: { min: 200, typical: 600, max: 1500, basis: 'Brushless motor + ESC pair for commercial drone' },
  auv_thruster: { min: 1500, typical: 4000, max: 9000, basis: 'Brushless DC thruster, 100–500 W for AUV' },
  thermal_insulation_panel: { min: 200, typical: 600, max: 1500, basis: 'Mineral wool or PIR insulation panel set for container' },
  cooling_loop_pump: { min: 500, typical: 1200, max: 3000, basis: 'Circulating pump for liquid cooling loop' },
  // LFP prismatic cells — per-cell unit cost. CATL/EVE/BYD market rate 2025.
  // These are per-cell prices; the Grade D fallback is applied per-line (unit × qty).
  lfp_prismatic_cell_280ah: { min: 45, typical: 60, max: 80, basis: 'CATL/EVE/BYD LFP prismatic 280 Ah, 3.2 V — OEM spot price 2025' },
  lfp_prismatic_cell_generic: { min: 40, typical: 55, max: 75, basis: 'LFP prismatic cell (any capacity), OEM channel 2025 — fallback when Ah not specified' },
  // UNIVERSAL-ROBUSTNESS FIX (2026-05-10): safety-critical parts that slipped
  // through at £1 because the Grade D table had no entry for them.
  arc_flash_detection_sensor: { min: 350, typical: 650, max: 1200, basis: 'Arc flash detection sensor (Littelfuse LFGR / Arcteq class), IEC 62606 compliant — per-zone unit' },
  hv_contactor_dc_isolator: { min: 180, typical: 350, max: 800, basis: 'High-voltage DC contactor / isolator for BESS/EV charger (Gigavac / Sensata class)' },
  led_grow_light_panel: { min: 400, typical: 800, max: 2000, basis: 'Full-spectrum LED grow light panel (Fluence / Signify Agro class) per 1.2×0.6 m panel' },
  hvac_fan_coil_unit: { min: 800, typical: 1800, max: 4500, basis: 'HVAC fan coil unit / dehumidifier for CEA (Munters / Carel class) per zone' },
  fertigation_controller: { min: 1200, typical: 3000, max: 8000, basis: 'Fertigation controller / dosing system (Priva / Netafim class) per zone' },
  flight_controller_autopilot: { min: 200, typical: 500, max: 2000, basis: 'Drone flight controller / autopilot (Pixhawk 6X / Cube Orange class)' },
  dvl_acoustic_navigation: { min: 8000, typical: 20000, max: 45000, basis: 'Doppler velocity log / acoustic navigation (Teledyne Wayfinder / WL Navigator class)' },
  gpu_compute_module: { min: 300, typical: 1200, max: 5000, basis: 'Industrial GPU / NPU compute module (NVIDIA Jetson AGX Orin / Hailo-8 class)' },
  parachute_recovery_haps: { min: 4000, typical: 8000, max: 20000, basis: 'HAPS emergency parachute recovery system (Airborne Systems class) stratospheric deployment' },
  pressure_hull_penetrator: { min: 200, typical: 350, max: 800, basis: 'Subsea pressure hull penetrator (Blue Robotics / SubConn class) per cable entry' },
  sterility_filter_bioreactor: { min: 120, typical: 220, max: 500, basis: '0.2 µm sterility filter for bioreactor SIP (Millipore Durapore / Sartorius Sartopore class)' },
  co2_dosing_system: { min: 800, typical: 2000, max: 5000, basis: 'CO2 enrichment dosing system for CEA grow room (Priva / Ridder class) per zone' },
}

/**
 * Fuzzy-classify a BOM line name to a GRADE_D_SUBSYSTEM_ESTIMATES_GBP key.
 * Returns null if no match is confident enough (score < 2 keyword hits).
 */
function classifySubsystemForGradeD(name: string): string | null {
  const n = name.toLowerCase()

  // BMS
  if ((n.includes('bms') || n.includes('battery management')) && n.includes('master')) return 'bms_master_controller'
  if ((n.includes('bms') || n.includes('battery management')) && (n.includes('slave') || n.includes('board'))) return 'bms_slave_board'
  if (n.includes('bms') || n.includes('battery management system')) return 'bms_master_controller'

  // Fire detection and suppression
  if (n.includes('fire') && (n.includes('suppression') || n.includes('extinguish') || n.includes('aerosol') || n.includes('agent'))) return 'fire_suppression_system'
  if (n.includes('fire') && (n.includes('detection') || n.includes('detect') || n.includes('sensor') || n.includes('smoke') || n.includes('heat detector'))) return 'fire_detection_heads'
  if (n.includes('fds') && (n.includes('fire') || n.includes('detect') || n.includes('suppress'))) return 'fire_suppression_system'
  if (n.includes('fire detection') || n.includes('fire suppression')) return 'fire_suppression_system'

  // Thermal management
  if ((n.includes('thermal') || n.includes('cooling')) && (n.includes('liquid') || n.includes('water') || n.includes('glycol') || n.includes('chiller'))) return 'thermal_management_liquid'
  if ((n.includes('thermal') || n.includes('cooling')) && (n.includes('air') || n.includes('fan') || n.includes('ventil'))) return 'thermal_management_air'
  if (n.includes('tms') && (n.includes('thermal') || n.includes('cooling'))) return 'thermal_management_liquid'
  if (n.includes('thermal management') || n.includes('cooling loop') || n.includes('cooling system')) return 'thermal_management_liquid'
  if (n.includes('thermal insulation') || n.includes('insulation panel')) return 'thermal_insulation_panel'

  // EMS
  if (n.includes('ems') || n.includes('energy management system')) return 'ems_controller'

  // PCS / inverter
  if (n.includes('pcs') || (n.includes('power conversion') && n.includes('system'))) return 'pcs_inverter_1mw'
  if (n.includes('inverter') && (n.includes('grid') || n.includes('pcs') || n.includes('1 mw') || n.includes('1mw'))) return 'pcs_inverter_1mw'

  // Transformer
  if (n.includes('transformer') && (n.includes('step') || n.includes('lv') || n.includes('hv') || n.includes('mva') || n.includes('kva'))) return 'step_up_transformer_lv_to_hv'

  // Contactors
  if (n.includes('contactor') && (n.includes('dc') || n.includes('2000') || n.includes('main'))) return 'main_dc_contactor_2000a'

  // Switchgear / breaker
  if (n.includes('switchgear') || (n.includes('circuit breaker') && (n.includes('air') || n.includes('acb')))) return 'switchgear_acb_3200a'

  // Heat pump
  if (n.includes('compressor') && (n.includes('heat pump') || n.includes('scroll') || n.includes('rotary'))) return 'heat_pump_compressor'

  // Drone / AUV
  if ((n.includes('esc') || n.includes('electronic speed control')) && n.includes('motor')) return 'drone_motor_esc'
  if (n.includes('thruster') && (n.includes('auv') || n.includes('rov') || n.includes('underwater'))) return 'auv_thruster'

  // Cooling loop pump
  if (n.includes('cooling') && n.includes('pump')) return 'cooling_loop_pump'

  // LFP prismatic cells — must match BEFORE generic battery/cell checks to avoid false-positives
  // on pack-level items. Pattern requires "lfp" or ("lithium" + "iron" / "ferrophosphate") + "cell".
  if ((n.includes('lfp') || n.includes('lifepo') || n.includes('lithium iron') || n.includes('lithium ferrophosphate')) && n.includes('cell')) {
    if (n.includes('280') || n.includes('280ah')) return 'lfp_prismatic_cell_280ah'
    return 'lfp_prismatic_cell_generic'
  }
  if (n.includes('lfp') && n.includes('prismatic')) return 'lfp_prismatic_cell_280ah'

  // UNIVERSAL-ROBUSTNESS FIX (2026-05-10): safety-critical and class-specific
  // parts that previously slipped through at £1 (no Grade D key).

  // Arc flash detection
  if (n.includes('arc flash') || (n.includes('arc') && n.includes('detect'))) return 'arc_flash_detection_sensor'

  // HV contactor / DC isolator
  if ((n.includes('contactor') || n.includes('isolator')) && (n.includes('hv') || n.includes('high voltage') || n.includes('high-voltage') || n.includes('dc'))) return 'hv_contactor_dc_isolator'

  // CEA / vertical farm
  if (n.includes('led') && (n.includes('grow') || n.includes('horticultural') || n.includes('ppfd') || n.includes('light'))) return 'led_grow_light_panel'
  if (n.includes('hvac') || n.includes('fan coil') || (n.includes('dehumidif') && !n.includes('pump'))) return 'hvac_fan_coil_unit'
  if (n.includes('fertigation') || (n.includes('dosing') && (n.includes('nutrient') || n.includes('controller') || n.includes('system')))) return 'fertigation_controller'
  if (n.includes('co2') && (n.includes('dosing') || n.includes('enrichment') || n.includes('inject') || n.includes('system'))) return 'co2_dosing_system'

  // Drone flight controller
  if (n.includes('flight controller') || n.includes('autopilot') || n.includes('pixhawk') || n.includes('cube orange')) return 'flight_controller_autopilot'

  // AUV navigation
  if (n.includes('dvl') || n.includes('doppler velocity') || (n.includes('acoustic') && n.includes('navigation'))) return 'dvl_acoustic_navigation'

  // Edge AI GPU
  if ((n.includes('gpu') || n.includes('npu') || n.includes('jetson') || n.includes('hailo')) && (n.includes('module') || n.includes('compute') || n.includes('card'))) return 'gpu_compute_module'

  // HAPS recovery
  if (n.includes('parachute') || (n.includes('recovery') && (n.includes('system') || n.includes('chute') || n.includes('haps')))) return 'parachute_recovery_haps'

  // AUV pressure hull penetrator
  if (n.includes('penetrator') || (n.includes('pressure hull') && n.includes('penetrat'))) return 'pressure_hull_penetrator'

  // Bioreactor sterility filter
  if ((n.includes('sterility filter') || n.includes('0.2') || n.includes('0.2 micron') || n.includes('membrane filter')) && (n.includes('filter') || n.includes('membrane'))) return 'sterility_filter_bioreactor'

  return null
}

// ── Main stage ────────────────────────────────────────────────────────────────

export async function runBomCostSuppliers(
  input: BomCostSuppliersInput,
): Promise<StageResult<BomCostSuppliersOutput>> {
  const startTime = Date.now()

  try {
    const {
      modules,
      designBrief,
      classification,
      grounding: groundingIn,
      productSpecs,
      domain,
      ceilingGbp: ceilingIn,
      trainingDataDossier,
      batchSize: batchIn,
    } = input

    const batchSizeFromBrief = designBrief?.constraints?.batchSize ? Number(designBrief.constraints.batchSize) : DEFAULT_BATCH_SIZE
    const batchSize = (batchIn ?? batchSizeFromBrief) || DEFAULT_BATCH_SIZE
    const ceilingGbp = ceilingIn ?? designBrief?.constraints?.unitCostCeilingGbp ?? null

    // ── Load grounding ────────────────────────────────────────────────────
    console.log('[bom-v2] Loading grounding data...')
    const grounding = groundingIn ?? await loadAllGroundingData(domain)
    console.log(`[bom-v2] Grounding: ${grounding.materials.length} materials, ${grounding.processes.length} processes`)

    // ── Phase 1+2: Deterministic BOM ────────────────────────────────────
    const { deterministicParts, deterministicBomLines } = await buildDeterministicPhase(
      classification.productClass,
      modules,
    )
    console.log(`[bom-v2] ${deterministicParts.length} deterministic parts`)

    // ── Build prompt user content ────────────────────────────────────────
    const moduleDescriptions = modules.map(m =>
      `## Module: ${m.name} (id: ${m.id})\nPurpose: ${m.purpose}\nKey Parts: ${(m.keyParts || []).join(', ')}\nDescription: ${m.description}\nTotal mass budget: ${m.estimatedMassKg ?? 0} kg`
    ).join('\n\n')

    const groundingBlock = `
You have access to the following grounding catalogues. USE THESE material codes and process names in your BOM.

## Materials catalogue (${grounding.materials.length} entries)
${formatMaterialsForPrompt(grounding.materials)}

## Process catalogue (${grounding.processes.length} entries)
${formatProcessesForPrompt(grounding.processes)}
`

    const deterministicExclusion = deterministicParts.length > 0
      ? `\n\nCRITICAL: These parts are already sourced — do NOT regenerate them: ${deterministicParts.map(p => p.name).join(', ')}.`
      : ''

    const context = trainingDataDossier
      ? `\n\n## Training data dossier\n${trainingDataDossier.slice(0, 4000)}`
      : ''

    const costWaterfallPlaceholder = `(Cost waterfall will be populated after Buy/Make cost resolution and provided to WRITE_COST_NARRATIVE.)`

    const userContent = `Generate an integrated BOM for the modules below.

Batch size: ${batchSize} units
Cost ceiling: ${ceilingGbp ? `£${ceilingGbp}` : 'not specified'}
${deterministicExclusion}

## Product Modules
${moduleDescriptions}
${groundingBlock}
${context}

## For WRITE_COST_NARRATIVE
${costWaterfallPlaceholder}

Return ALL four sub-task results in the JSON structure specified in the system prompt.`

    // ── LLM call ─────────────────────────────────────────────────────────
    console.log('[bom-v2] Generating integrated BOM via OpenRouter (structured sub-tasks)...')
    const llmResult = await callOpenRouterJson(INTEGRATED_BOM_SYSTEM, userContent)

    const proposedParts: any[] = Array.isArray(llmResult?.PROPOSE_PARTS?.parts)
      ? llmResult.PROPOSE_PARTS.parts
      : []

    const classifications: any[] = Array.isArray(llmResult?.CLASSIFY_MAKE_BUY?.classifications)
      ? llmResult.CLASSIFY_MAKE_BUY.classifications
      : []

    const makeEstimates: any[] = Array.isArray(llmResult?.ESTIMATE_MAKE_COST?.estimates)
      ? llmResult.ESTIMATE_MAKE_COST.estimates
      : []

    const llmNarrative: string = llmResult?.WRITE_COST_NARRATIVE?.narrativeMarkdown ?? ''

    console.log(`[bom-v2] LLM returned: ${proposedParts.length} parts, ${classifications.length} classifications, ${makeEstimates.length} make estimates`)

    if (proposedParts.length === 0) {
      throw new Error('[bom-v2] No parts generated by LLM')
    }

    // ── Build regime lookup maps ──────────────────────────────────────────
    const classificationMap = new Map<string, { partRegime: 'buy' | 'make' | 'service'; regimeReason: string }>()
    for (const c of classifications) {
      const regime = c.partRegime === 'make' ? 'make'
        : c.partRegime === 'service' ? 'service'
        : 'buy'
      classificationMap.set(String(c.partNumber || ''), { partRegime: regime, regimeReason: c.regimeReason || '' })
    }

    const makeEstimateMap = new Map<string, number>()
    for (const e of makeEstimates) {
      if (typeof e.makeCostEstimateGbp === 'number') {
        makeEstimateMap.set(String(e.partNumber || ''), e.makeCostEstimateGbp)
      }
    }

    // ── Build expected_parts lookup from MODULE_DECOMPOSITION_SYSTEM_PA output ──
    // Keyed by normalised part name (lowercase) → { part_class, mpn, manufacturer, confidence }
    // This allows the BOM stage to inherit part_class and mpn hints from the
    // decompose stage without a separate LLM call.
    interface ExpectedPartMeta {
      part_class: string | null
      mpn: string | null
      manufacturer: string | null
      confidence: string | null
      quantity_per_assembly: number | null
      quantity_calculation_basis: string | null
      estimated_unit_price_gbp: number | null
    }
    const expectedPartsMeta = new Map<string, ExpectedPartMeta>()
    for (const mod of modules) {
      const ep = (mod as any).expected_parts
      if (Array.isArray(ep)) {
        for (const p of ep) {
          if (p.name) {
            // Support both new field (quantity_per_assembly: number) and legacy (quantity: string)
            const qpa: number | null =
              typeof p.quantity_per_assembly === 'number' ? p.quantity_per_assembly
              : typeof p.quantity === 'string' && /^\d+$/.test(p.quantity.trim()) ? parseInt(p.quantity.trim(), 10)
              : null
            expectedPartsMeta.set(String(p.name).toLowerCase(), {
              part_class: p.part_class ?? null,
              mpn: p.mpn ?? null,
              manufacturer: p.manufacturer ?? null,
              confidence: p.confidence ?? null,
              quantity_per_assembly: qpa,
              quantity_calculation_basis: p.quantity_calculation_basis ?? null,
              estimated_unit_price_gbp: typeof p.estimated_unit_price_gbp === 'number' ? p.estimated_unit_price_gbp : null,
            })
          }
        }
      }
    }
    console.log(`[bom-v2] Loaded ${expectedPartsMeta.size} expected_parts meta entries from modules`)

    // ── Merge deterministic + LLM parts ──────────────────────────────────
    const MASS_LOOKUP: Record<string, number> = {
      compressor: 25, scroll: 25, evaporator: 15, condenser: 12, bphe: 8,
      'heat exchanger': 10, fan: 5, motor: 8, inverter: 12, drive: 12,
      enclosure: 20, chassis: 30, frame: 25, pump: 8, valve: 2, eev: 1,
      sensor: 0.2, pcb: 0.5, controller: 1, hmi: 2, display: 1,
      wiring: 3, harness: 2, cable: 1, insulation: 2, bracket: 1.5, panel: 5,
    }

    const llmParts: Part[] = proposedParts.map((sp: any): Part => {
      const name = sanitiseLlmOutput(sp.name || '')
      const material = sanitiseLlmOutput(sp.material || '')
      const process = sanitiseLlmOutput(sp.process || '')
      const isPurchased = Boolean(sp.isPurchased)

      let massKg: number = typeof sp.massKg === 'number' && sp.massKg > 0 ? sp.massKg : 0
      if (massKg === 0) {
        const nl = name.toLowerCase()
        for (const [kw, m] of Object.entries(MASS_LOOKUP)) {
          if (nl.includes(kw)) { massKg = m; break }
        }
        if (massKg === 0) massKg = 0.5
      }

      return {
        id: sanitiseLlmOutput(sp.partNumber || ''),
        partNumber: sanitiseLlmOutput(sp.partNumber || ''),
        name,
        sourceModuleId: sanitiseLlmOutput(sp.sourceModuleId || ''),
        process,
        isPurchased,
        material: material || (isPurchased ? 'cots' : 'varies'),
        massKg,
        estimatedUnitCostGbp: typeof sp.estimatedUnitCostGbp === 'number' ? sp.estimatedUnitCostGbp : undefined,
      }
    })

    const merged = deduplicateBom(
      deterministicParts,
      deterministicBomLines,
      llmParts,
      [],
      classification.productClass,
    )

    const mergedParts = merged.finalParts
    let mergedBomLines = merged.finalBomLines

    // ── Quantity realism overrides ────────────────────────────────────────
    if (productSpecs && classification.productClass) {
      const overrides = deriveQuantities(productSpecs, classification.productClass, mergedParts, mergedBomLines)
      if (overrides.length > 0) {
        mergedBomLines = applyOverrides(mergedBomLines, overrides) as BomLine[]
        for (const ov of overrides) {
          const part = mergedParts.find(p => p.partNumber === ov.partNumber || p.id === ov.partId)
          if (part) {
            ;(part as any).qtyDeterministic = true
            ;(part as any).qtyRule = ov.rule
          }
        }
        console.log(`[bom-v2] Applied ${overrides.length} qty overrides`)
      }
    }

    // ── Ground Make parts against catalogue ───────────────────────────────
    for (const part of mergedParts) {
      if ((part as any).priceSource === 'distributor') continue
      const material = findMaterial(part.material, grounding.materials)
      const process = findProcess(part.process, grounding.processes)
      ;(part as any).matchedMaterialCode = material?.material_code ?? null
      ;(part as any).matchedProcessName = process?.process_name ?? null

      if (!part.isPurchased) {
        const computed = computeFabricatedCost(part.massKg, material, process, batchSize)
        if (computed) {
          part.estimatedUnitCostGbp = computed.cost
          ;(part as any).priceSource = 'database'
          ;(part as any).priceBreakdown = computed.breakdown
        }
      }
    }

    // ── Build initial IntegratedBomLine array ─────────────────────────────
    function resolveQty(partNumber: string): number {
      let total = 0
      for (const bl of mergedBomLines) {
        if (bl.childPartId === partNumber) total += bl.quantity || 0
      }
      return total > 0 ? total : 1
    }

    const integratedLines: IntegratedBomLine[] = mergedParts.map((p): IntegratedBomLine => {
      const pn = p.partNumber || p.id || ''
      const clsEntry = classificationMap.get(pn)

      // ── Look up expected_parts meta by part name ──────────────────────
      const epMeta = expectedPartsMeta.get(p.name.toLowerCase())
        ?? expectedPartsMeta.get(pn.toLowerCase())
        ?? null

      const partClass = epMeta?.part_class ?? null
      const llmMpn = epMeta?.mpn ?? null
      const manufacturerHint = epMeta?.manufacturer ?? null
      const quantityCalculationBasis = epMeta?.quantity_calculation_basis ?? null
      const llmUnitPriceGbp = epMeta?.estimated_unit_price_gbp ?? null

      // Determine regime
      const isDeterministic = (p as any).priceSource === 'distributor'
      let partRegime: 'buy' | 'make' | 'service' = p.isPurchased ? 'buy' : 'make'
      if (clsEntry) partRegime = clsEntry.partRegime

      // 5-class taxonomy overrides: structural_fabricated/oem_subsystem/software_ip
      // are always estimated regardless of isPurchased flag.
      if (partClass === 'structural_fabricated' || partClass === 'oem_subsystem' || partClass === 'software_ip') {
        partRegime = partClass === 'oem_subsystem' ? 'buy' : 'make'
      }

      // Determine detailed regime
      let regime: IntegratedBomLine['regime'] = partRegime === 'buy' ? 'buy_electronic' : 'make_custom_fab'
      if (partRegime === 'service') regime = 'service_certification'
      if (partClass === 'mechanical_cots') regime = 'buy_mechanical_industrial'
      if (partClass === 'oem_subsystem') regime = 'named_manufacturer_reseller'

      // Initial cost (will be overwritten by distributor or estimate below)
      // Bug B fix: use LLM-estimated unit price from expected_parts as fallback when
      // the part has no catalogue cost (OEM-direct parts like CATL cells).
      const rawUnitCost = p.estimatedUnitCostGbp ?? 0
      const unitCostGbp = rawUnitCost > 0 ? rawUnitCost : (llmUnitPriceGbp ?? 0)
      let costSource: IntegratedBomLine['costSource'] = 'estimated'
      if ((p as any).priceSource === 'database') costSource = 'database'
      else if ((p as any).priceSource === 'distributor') costSource = 'mouser'
      else if ((p as any).priceSource === 'llm') costSource = 'estimated'

      const makeCostEstimate = makeEstimateMap.get(pn)

      // Initial verification_status — will be upgraded to 'verified' if distributor returns a match
      const needsDistributorLookup = partClass === 'electronic_cots' || partClass === 'mechanical_cots'
        || (partClass === null && partRegime === 'buy')
      const initVerificationStatus: 'verified' | 'estimated' =
        (isDeterministic && (p as any).priceSource === 'distributor') ? 'verified' : 'estimated'

      // Bug A fix: quantity priority order:
      // 1. epMeta.quantity_per_assembly (authoritative LLM derivation from brief)
      // 2. BOM line quantity from mergedBomLines (includes deterministic overrides)
      // 3. Default 1
      const epQty = epMeta?.quantity_per_assembly ?? null
      const resolvedQty = epQty != null && epQty > 0 ? epQty : resolveQty(pn)

      return {
        id: p.id || pn,
        partNumber: pn,
        name: p.name,
        sourceModuleId: p.sourceModuleId || '',
        quantity: resolvedQty,
        partRegime,
        regime,
        massKg: p.massKg,
        process: p.process,
        material: p.material,
        costSource,
        unitCostGbp,
        makeCostEstimateGbp: makeCostEstimate,
        verification_status: initVerificationStatus,
        part_class: partClass as IntegratedBomLine['part_class'],
        manufacturer_hint: manufacturerHint,
        llm_mpn: llmMpn,
        llmSubTask: isDeterministic ? 'deterministic' : 'PROPOSE_PARTS',
        priceSource: (p as any).priceSource,
        matchedMaterialCode: (p as any).matchedMaterialCode,
        matchedProcessName: (p as any).matchedProcessName,
        qtyDeterministic: (p as any).qtyDeterministic,
        qtyRule: (p as any).qtyRule,
        quantity_calculation_basis: quantityCalculationBasis,
        // Internal-only: LLM unit price for Bug C fallback in distributor rejection path.
        // Stored as a plain property on the line object; cast via any to avoid polluting
        // the IntegratedBomLine interface with an internal field.
        ...(llmUnitPriceGbp != null ? { _llmUnitPriceGbp: llmUnitPriceGbp } as any : {}),
      }
    })

    // ── Phase 4a: Distributor lookups for Buy parts (parallel) ────────────
    // Eligible: electronic_cots, mechanical_cots, and legacy buy parts with no part_class.
    // Excluded: oem_subsystem and software_ip (no distributor SKU exists).
    // structural_fabricated also excluded (custom parts, no distributor SKU).
    const buyLines = integratedLines.filter(l => {
      if (l.costSource === 'mouser') return false  // already resolved
      const pc = l.part_class
      if (pc === 'structural_fabricated' || pc === 'oem_subsystem' || pc === 'software_ip') return false
      return l.partRegime === 'buy' || pc === 'electronic_cots' || pc === 'mechanical_cots'
    })
    console.log(`[bom-v2] Distributor lookup for ${buyLines.length} Buy parts (parallel, 5-class routed)...`)

    await Promise.all(
      buyLines.map(async (line) => {
        try {
          // Prefer the LLM-supplied MPN from MODULE_DECOMPOSITION_SYSTEM_PA.
          // Fall back to the part number generated by the BOM LLM (rarely a real MPN).
          const lookupKey = line.llm_mpn || line.partNumber
          console.log(`[bom-v2] Distributor lookup: "${line.name}" → key="${lookupKey}"${line.llm_mpn ? ' (llm_mpn)' : ' (partNumber fallback)'}`)
          const result: AggregateResult | null = await findSkuForPart(lookupKey)
          if (!result) return

          const best = result.best
          const qty1 = result.qty1GBP

          // Map distributor results
          line.distributors = [best, ...result.alternates].map(r => ({
            source: r.source as 'mouser' | 'farnell' | 'digikey' | 'lcsc',
            mpn: r.mpn,
            manufacturer: r.manufacturer,
            description: r.description,
            priceGBP: r.priceGBP,
            stockUK: r.stockUK,
            datasheetUrl: r.datasheetUrl,
            productUrl: r.productUrl,
            fetchedAt: r.fetchedAt,
          }))

          line.bestDistributor = {
            source: best.source as 'mouser' | 'farnell' | 'digikey' | 'lcsc',
            sku: best.mpn,
            unitPriceGbp: qty1 ?? 0,
            stockUK: best.stockUK,
            datasheetUrl: best.datasheetUrl,
            productUrl: best.productUrl,
          }

          line.unitCostGbp = qty1 ?? line.unitCostGbp
          line.costSource = best.source as 'mouser' | 'farnell' | 'digikey' | 'lcsc'
          line.llmSubTask = 'CLASSIFY_MAKE_BUY'
          // Bug C fix: only accept distributor matches as VERIFIED when the part class
          // is electronic_cots or mechanical_cots. OEM subsystems, structural fabricated,
          // and software IP cannot be stocked by distributors — any match is a false positive
          // (e.g. Mouser fuzzy-matching "LF280K" to a passive component package code).
          const canBeVerified = line.part_class === 'electronic_cots' || line.part_class === 'mechanical_cots' || line.part_class == null
          line.verification_status = canBeVerified ? 'verified' : 'estimated'
          if (!canBeVerified) {
            // Reject the distributor match — revert to LLM unit price if available
            const llmPrice = (line as any)._llmUnitPriceGbp as number | null | undefined
            if (llmPrice != null && llmPrice > 0) {
              line.unitCostGbp = llmPrice
              line.costSource = 'estimated'
            }
            line.bestDistributor = undefined
            line.distributors = undefined
            console.log(`[bom-v2] Rejected distributor match for "${line.name}" (part_class=${line.part_class}) — kept as ESTIMATE`)
          }
        } catch (err) {
          console.warn(`[bom-v2] Distributor lookup failed for ${line.partNumber}: ${(err as Error).message}`)
        }
      })
    )

    // ── Phase 4b: Supplier search for Make parts (parallel) ──────────────
    const makeLines = integratedLines.filter(l => l.partRegime === 'make' || l.partRegime === 'service')
    console.log(`[bom-v2] Corpus supplier search for ${makeLines.length} Make parts...`)

    const requiredTags = productClassToDomainTags(classification.productClass)

    if (makeLines.length > 0 && isLocalCorpusAvailable()) {
      // Batch embed all Make part descriptions
      const makeDescriptions = makeLines.map(l =>
        [l.name, l.material, l.process, domain].filter(Boolean).join(' — ')
      )

      let makeEmbeddings: number[][] | null = null
      try {
        makeEmbeddings = await embedBatch(makeDescriptions)
      } catch (err) {
        console.warn('[bom-v2] Make part embed failed:', (err as Error).message)
      }

      if (makeEmbeddings && makeEmbeddings.length === makeLines.length) {
        // Build reverse indexes once for all Make parts
        if (isReverseIndexAvailable()) buildReverseIndexes()

        await Promise.all(
          makeLines.map(async (line, idx) => {
            try {
              const result = await findMakeSuppliers(makeEmbeddings![idx], {
                process: line.process,
                material: line.material,
                name: line.name,
                id: line.id,
              }, requiredTags)

              line.suppliers = result.suppliers
              line.needsSourcingReview = result.needsSourcingReview

              // Apply LLM Make estimate if available, else use catalogue
              const llmEst = makeEstimateMap.get(line.partNumber)
              if (llmEst && llmEst > 0) {
                line.unitCostGbp = llmEst
                line.makeCostEstimateGbp = llmEst
                // Grade D — expert estimate (LLM sub-task ESTIMATE_MAKE_COST)
                line.costSource = 'estimated'
                line.llmSubTask = 'ESTIMATE_MAKE_COST'
              }
            } catch (err) {
              console.warn(`[bom-v2] Supplier search failed for ${line.name}: ${(err as Error).message}`)
              line.needsSourcingReview = true
            }
          })
        )
      }
    } else if (makeLines.length > 0) {
      // No corpus — apply LLM estimates only
      for (const line of makeLines) {
        const llmEst = makeEstimateMap.get(line.partNumber)
        if (llmEst && llmEst > 0) {
          line.unitCostGbp = llmEst
          line.makeCostEstimateGbp = llmEst
          line.costSource = 'estimated'
          line.llmSubTask = 'ESTIMATE_MAKE_COST'
        }
        line.needsSourcingReview = true
      }
    }

    // ── Phase 4c: Grade D fallback for zero-cost / placeholder-cost lines ───
    // After distributor lookup (4a) and supplier search (4b), any line that
    // renders as £0 in the PDF (unitCostGbp < 1.0) is a DATA GAP — whether
    // VERIFIED or ESTIMATED. A VERIFIED sub-£1 line is a false-positive
    // distributor match (e.g. Mouser fuzzy-matching "Battery Management System"
    // to a passive part with a tiny catalogue price of £0.001).
    //
    // Guard: use < 1.0 (not === 0) to catch near-zero distributor prices that
    // Intl.NumberFormat rounds to "£0" in the rendered PDF.
    //
    // UNIVERSAL-ROBUSTNESS FIX (2026-05-10): Extended to catch safety-critical
    // parts priced at £1 (a common LLM placeholder value). The fix:
    // - If a line has a Grade D key AND its current price is < that key's minimum
    //   floor → apply Grade D regardless of whether it's ≥ £1.0. This catches
    //   "BMS Master Controller at £1" and "Arc Flash Sensor at £1" without
    //   touching legitimate sub-£10 commodity parts (screws, passives).
    // - The CGM / miniature-class false-positive problem: Grade D keys for CGM
    //   parts don't exist (no key → no upgrade), so small coins/passives are safe.
    //
    // Hierarchy applied: VERIFIED (non-zero, ≥£1) > LLM ESTIMATE (≥£1) > GRADE D > LLM price hint > DATA GAP
    //
    // CRITICAL: a sub-£1 line that has no Grade D key MUST still be sanitised.
    // If left at e.g. £0.319, the renderer displays "£0" as unit cost but the
    // cost aggregator multiplies the raw float — producing arithmetically
    // impossible totals (e.g. 4,882 × £0 shown, £1,556 actual). Fix: when no
    // Grade D key matches, fall back to the LLM unit price hint (_llmUnitPriceGbp)
    // if it is ≥£1, else zero out the line cleanly so both unit and total show £0.
    {
      let gradeDApplied = 0
      let llmFallbackApplied = 0
      let zeroSanitised = 0
      for (const line of integratedLines) {
        // UNIVERSAL-ROBUSTNESS FIX (2026-05-10): check if this line has a Grade D
        // key FIRST, before the ≥ £1.0 guard. If the key's minimum floor is higher
        // than the current price, apply Grade D even for lines priced ≥ £1.0
        // (e.g. BMS Master at £1, Arc Flash Sensor at £1).
        const subsystemKeyEarly = classifySubsystemForGradeD(line.name)
        const entryEarly = subsystemKeyEarly ? GRADE_D_SUBSYSTEM_ESTIMATES_GBP[subsystemKeyEarly] : null
        if (entryEarly && line.unitCostGbp < entryEarly.min) {
          // Current price is below the known minimum for this subsystem class.
          // Apply Grade D regardless of whether unitCostGbp ≥ 1.0.
          const previousPrice = line.unitCostGbp
          line.unitCostGbp = entryEarly.typical
          line.gradeD_estimate_basis = `${entryEarly.basis} (Grade D ±50%, typical of range £${entryEarly.min.toLocaleString()}–£${entryEarly.max.toLocaleString()}). Previous price £${previousPrice.toFixed(0)} was below minimum floor.`
          line.costSource = 'estimated'
          line.verification_status = 'estimated'
          line.bestDistributor = undefined
          line.distributors = undefined
          gradeDApplied++
          console.log(`[bom-v2] Grade D floor fix for "${line.name}" → ${subsystemKeyEarly}: £${entryEarly.typical.toLocaleString()} (was £${previousPrice} < min £${entryEarly.min})`)
          continue
        }

        if (line.unitCostGbp >= 1.0) continue  // already meaningfully costed — leave alone

        // ── Tier 1: Grade D table ─────────────────────────────────────────
        const subsystemKey = classifySubsystemForGradeD(line.name)
        const entry = subsystemKey ? GRADE_D_SUBSYSTEM_ESTIMATES_GBP[subsystemKey] : null

        if (entry) {
          line.unitCostGbp = entry.typical
          line.gradeD_estimate_basis = `${entry.basis} (Grade D ±50%, typical of range £${entry.min.toLocaleString()}–£${entry.max.toLocaleString()})`
          line.costSource = 'estimated'
          // Demote verification_status: a Grade D is NOT VERIFIED, even if a
          // distributor returned a match with qty1=0 (false-positive lookup).
          line.verification_status = 'estimated'
          // Clear any false-positive distributor data so the renderer shows Grade D table, not distributor name
          line.bestDistributor = undefined
          line.distributors = undefined
          gradeDApplied++
          console.log(`[bom-v2] Grade D fallback for "${line.name}" → ${subsystemKey}: £${entry.typical.toLocaleString()} (${entry.basis})`)
          continue
        }

        // ── Tier 2: LLM unit price hint (from MODULE_DECOMPOSITION expected_parts) ──
        // Used when Grade D has no key for this part but the decompose-stage LLM
        // provided an estimated_unit_price_gbp that is ≥£1 (meaningful).
        const llmPrice = (line as any)._llmUnitPriceGbp as number | null | undefined
        if (llmPrice != null && llmPrice >= 1.0) {
          line.unitCostGbp = llmPrice
          line.costSource = 'estimated'
          line.verification_status = 'estimated'
          line.bestDistributor = undefined
          line.distributors = undefined
          llmFallbackApplied++
          console.log(`[bom-v2] LLM price hint fallback for "${line.name}": £${llmPrice} (sub-£1 distributor price stripped)`)
          continue
        }

        // ── Tier 3: hard zero — sanitise to prevent unit/total mismatch ──
        // The line has no Grade D key and no LLM price hint. Zero it cleanly
        // so the renderer shows £0 unit AND £0 total (not a phantom float total).
        if (line.unitCostGbp > 0) {
          console.warn(`[bom-v2] Sub-£1 line "${line.name}" has no Grade D key and no LLM price — zeroing to prevent unit/total mismatch (was £${line.unitCostGbp.toFixed(4)})`)
          line.unitCostGbp = 0
          line.verification_status = 'estimated'
          line.bestDistributor = undefined
          line.distributors = undefined
          zeroSanitised++
        }
      }
      if (gradeDApplied > 0) {
        console.log(`[bom-v2] Grade D fallback applied to ${gradeDApplied} zero-cost lines`)
      }
      if (llmFallbackApplied > 0) {
        console.log(`[bom-v2] LLM price hint fallback applied to ${llmFallbackApplied} lines`)
      }
      if (zeroSanitised > 0) {
        console.log(`[bom-v2] ${zeroSanitised} sub-£1 lines zeroed cleanly (no Grade D key, no LLM hint)`)
      }
    }

    // ── Phase 5: Build CostWaterfall ─────────────────────────────────────
    const domainKey = (OVERHEAD_MAP as any)[domain ?? 'default'] ? (domain ?? 'default') : 'default'
    const overhead = (OVERHEAD_MAP as any)[domainKey] ?? (OVERHEAD_MAP as any).default ?? { multiplier: 1.5, nreRate: 0.12 }

    let buyDistributorGbp = 0
    let buyEstimatedGbp = 0
    let makeEstimatedGbp = 0
    const moduleMap = new Map<string, { buyGbp: number; makeGbp: number; lineCount: number; moduleName: string }>()

    for (const line of integratedLines) {
      const lineTotal = line.unitCostGbp * line.quantity
      const modId = line.sourceModuleId || 'unassigned'

      if (!moduleMap.has(modId)) {
        const mod = modules.find(m => m.id === modId)
        moduleMap.set(modId, { buyGbp: 0, makeGbp: 0, lineCount: 0, moduleName: mod?.name || modId })
      }
      const modEntry = moduleMap.get(modId)!
      modEntry.lineCount++

      if (line.partRegime === 'buy') {
        if (['mouser', 'farnell', 'digikey', 'lcsc'].includes(line.costSource)) {
          buyDistributorGbp += lineTotal
        } else {
          buyEstimatedGbp += lineTotal
        }
        modEntry.buyGbp += lineTotal
      } else {
        makeEstimatedGbp += lineTotal
        modEntry.makeGbp += lineTotal
      }
    }

    const rawBomCostGbp = buyDistributorGbp + buyEstimatedGbp + makeEstimatedGbp
    const assemblyCostGbp = rawBomCostGbp * (overhead.multiplier - 1)
    const nreTotalGbp = modules.length * (
      (OVERHEAD_MAP as any)[domainKey]?.nreRate
        ? rawBomCostGbp * (OVERHEAD_MAP as any)[domainKey].nreRate
        : 5000
    )
    const unitTotalGbp = rawBomCostGbp * overhead.multiplier

    const quotedTotal = buyDistributorGbp
    const quotedCostFraction = rawBomCostGbp > 0 ? quotedTotal / rawBomCostGbp : 0

    const exceedsCeiling = ceilingGbp !== null && unitTotalGbp > ceilingGbp
    const gapPct = ceilingGbp ? ((unitTotalGbp - ceilingGbp) / ceilingGbp) * 100 : null

    const waterfallSteps: CostWaterfall['waterfallSteps'] = []
    if (buyDistributorGbp > 0) {
      waterfallSteps.push({
        label: 'Buy parts (distributor-quoted)',
        gbp: buyDistributorGbp,
        pctOfTotal: unitTotalGbp > 0 ? (buyDistributorGbp / unitTotalGbp) * 100 : 0,
        source: 'buy_distributor',
      })
    }
    if (buyEstimatedGbp > 0) {
      waterfallSteps.push({
        label: 'Buy parts (estimated)',
        gbp: buyEstimatedGbp,
        pctOfTotal: unitTotalGbp > 0 ? (buyEstimatedGbp / unitTotalGbp) * 100 : 0,
        source: 'buy_estimated',
      })
    }
    if (makeEstimatedGbp > 0) {
      waterfallSteps.push({
        label: 'Make parts (LLM estimate — Grade D)',
        gbp: makeEstimatedGbp,
        pctOfTotal: unitTotalGbp > 0 ? (makeEstimatedGbp / unitTotalGbp) * 100 : 0,
        source: 'make_estimated',
      })
    }
    if (assemblyCostGbp > 0) {
      waterfallSteps.push({
        label: `Overhead & assembly (${overhead.multiplier}× multiplier)`,
        gbp: assemblyCostGbp,
        pctOfTotal: unitTotalGbp > 0 ? (assemblyCostGbp / unitTotalGbp) * 100 : 0,
        source: 'overhead',
      })
    }

    // D FIX (2026-05-09): compute pctOfBom for each module so the CostSection
    // "% of BOM" column is populated instead of always showing "—".
    // grandTotalGbp is the sum of all per-module loaded costs (overhead applied).
    const _perModuleRaw = Array.from(moduleMap.entries()).map(([moduleId, m]) => ({
      moduleId,
      moduleName: m.moduleName,
      totalGbp: (m.buyGbp + m.makeGbp) * overhead.multiplier,
      buyGbp: m.buyGbp,
      makeGbp: m.makeGbp,
      lineCount: m.lineCount,
    }))
    const _grandTotalModuleGbp = _perModuleRaw.reduce((sum, m) => sum + m.totalGbp, 0)
    const perModule: CostWaterfall['perModule'] = _perModuleRaw.map(m => ({
      ...m,
      pctOfBom: _grandTotalModuleGbp > 0 ? (m.totalGbp / _grandTotalModuleGbp) * 100 : 0,
    }))

    // ── Phase 6: Deterministic cost narrative from real computed figures ─────
    // The LLM narrative (llmNarrative) was generated BEFORE Buy/Make cost
    // resolution, so it contains the LLM's imagined cost figures — not the
    // real distributor-quoted prices. We ALWAYS generate the narrative
    // deterministically from the resolved costWaterfall numbers. This eliminates
    // the class of bug where the narrative says "£142,500 within budget" while
    // the waterfall shows £587k over budget.
    const highestLine = [...integratedLines].sort((a, b) => (b.unitCostGbp * b.quantity) - (a.unitCostGbp * a.quantity))[0]
    const narrativeMarkdown = [
      `The estimated per-unit cost is £${unitTotalGbp.toFixed(2)} at a batch size of ${batchSize} units, ` +
      (ceilingGbp
        ? `against a target ceiling of £${ceilingGbp.toFixed(2)} — ${exceedsCeiling ? `exceeding the ceiling by ${Math.abs(gapPct ?? 0).toFixed(1)}% (£${(unitTotalGbp - ceilingGbp).toFixed(2)} over).` : `within budget (headroom: £${(ceilingGbp - unitTotalGbp).toFixed(2)}).`}`
        : 'with no cost ceiling specified.'),
      '',
      `Buy parts (distributor-quoted) account for £${buyDistributorGbp.toFixed(2)} ` +
      `(${(quotedCostFraction * 100).toFixed(0)}% of raw BOM cost). ` +
      `Buy parts estimated without a distributor match contribute a further £${buyEstimatedGbp.toFixed(2)}. ` +
      `Make (custom-fabricated) parts are estimated at £${makeEstimatedGbp.toFixed(2)} — ` +
      `these are Grade D expert estimates pending supplier request for quotation.`,
      '',
      highestLine
        ? `The highest-cost line is **${highestLine.name}** at £${(highestLine.unitCostGbp * highestLine.quantity).toFixed(2)} ` +
          `(${highestLine.costSource} source). ` +
          `The primary cost-reduction opportunity is to obtain supplier quotes for Make parts and ` +
          `evaluate alternative distributor sources for the highest-cost Buy lines.`
        : '',
    ].filter(Boolean).join('\n')

    const costWaterfall: CostWaterfall = {
      rawBomCostGbp,
      buyLinesTotalGbp: buyDistributorGbp + buyEstimatedGbp,
      makeLinesTotalGbp: makeEstimatedGbp,
      overheadMultiplier: overhead.multiplier,
      assemblyCostGbp,
      nreTotalGbp,
      unitTotalGbp,
      ceilingGbp: ceilingGbp ?? null,
      waterfallSteps,
      perModule,
      narrativeMarkdown,
      quotedCostFraction,
      exceedsCeiling,
      gapPct,
    }

    // ── Phase 7: Build section payloads ───────────────────────────────────
    const sectionBom = buildSectionBom(integratedLines)
    const sectionCost = buildSectionCost(costWaterfall)
    const sectionSuppliers = buildSectionSuppliers(integratedLines)

    // ── Build backwards-compat outputs ───────────────────────────────────
    const parts = integratedLines.map(toCorePart)
    const bomLines: BomLine[] = integratedLines.map(toCoreBomLine)
    const supplierMatches: SupplierMatch[] = integratedLines
      .filter(l => l.partRegime === 'make' || l.partRegime === 'service')
      .map(toSupplierMatch)

    // CostBreakdown backwards-compat
    const costBreakdown: CostBreakdown = {
      unitTotalGbp: costWaterfall.unitTotalGbp,
      rawBomCostGbp: costWaterfall.rawBomCostGbp,
      ceilingGbp: costWaterfall.ceilingGbp,
      overheadMultiplier: costWaterfall.overheadMultiplier,
      nreTotalGbp: costWaterfall.nreTotalGbp,
      perModule: costWaterfall.perModule.map(m => ({
        moduleName: m.moduleName,
        totalGbp: m.totalGbp,
        // D FIX (2026-05-09): pass through pctOfBom so CostSection renders "% of BOM" column
        pctOfBom: m.pctOfBom,
      })),
    }

    // ── Canonical CostSummary — computed ONCE, read by all downstream consumers ──
    // All cost numbers (cover page, overhead table, cost narrative, module subtotals)
    // MUST be derived from this object. Never recompute BOM totals downstream.
    const _isOverBudget = ceilingGbp !== null && unitTotalGbp > ceilingGbp
    const _varianceVsCeiling = ceilingGbp !== null ? unitTotalGbp - ceilingGbp : null
    const _overBudgetPct = (_isOverBudget && ceilingGbp) ? ((unitTotalGbp - ceilingGbp) / ceilingGbp) * 100 : null

    // Top cost drivers: top 5 BOM lines by extended cost, descending
    const _linesSorted = [...integratedLines]
      .map(l => ({ name: l.name, total: l.unitCostGbp * l.quantity, src: l.costSource }))
      .sort((a, b) => b.total - a.total)
    const _topDrivers = _linesSorted.slice(0, 5).map(l => ({
      partName: l.name,
      totalGbp: l.total,
      pct: rawBomCostGbp > 0 ? (l.total / rawBomCostGbp) * 100 : 0,
      costSource: l.src,
    }))

    // Per-module raw BOM subtotals (pre-overhead, matching the BOM line items)
    const _byModule: import('../types').CostSummary['byModule'] = {}
    for (const m of costWaterfall.perModule) {
      // perModule.totalGbp has overhead applied — strip it back to get raw BOM cost per module
      const rawModGbp = overhead.multiplier > 0 ? m.totalGbp / overhead.multiplier : m.totalGbp
      _byModule[m.moduleId] = {
        moduleName: m.moduleName,
        rawGbp: rawModGbp,
        pctOfBom: rawBomCostGbp > 0 ? (rawModGbp / rawBomCostGbp) * 100 : 0,
      }
    }

    const costSummary: import('../types').CostSummary = {
      bomTotal: rawBomCostGbp,
      assemblyCost: assemblyCostGbp,
      finalUnitCost: unitTotalGbp,
      overheadMultiplier: overhead.multiplier,
      nreTotal: nreTotalGbp,
      ceilingCost: ceilingGbp ?? null,
      varianceVsCeiling: _varianceVsCeiling,
      isOverBudget: _isOverBudget,
      byModule: _byModule,
      topDrivers: _topDrivers,
      buyDistributorGbp,
      buyEstimatedGbp,
      makeEstimatedGbp,
      quotedCostFraction,
      overBudgetPct: _overBudgetPct,
    }

    const verifiedCount = integratedLines.filter(l => l.verification_status === 'verified').length
    const estimatedCount = integratedLines.filter(l => l.verification_status === 'estimated').length
    console.log(
      `[bom-v2] Complete: ${integratedLines.length} lines, ` +
      `${verifiedCount} VERIFIED + ${estimatedCount} ESTIMATED, ` +
      `${buyLines.length} Buy (${buyDistributorGbp > 0 ? 'some distributor-quoted' : 'all estimated'}), ` +
      `${makeLines.length} Make, ` +
      `£${unitTotalGbp.toFixed(2)} total (bomTotal: £${rawBomCostGbp.toFixed(2)})`
    )

    return {
      ok: true,
      data: {
        bomLines: integratedLines,
        costWaterfall,
        costSummary,
        sectionBom,
        sectionCost,
        sectionSuppliers,
        parts,
        costBreakdown,
        supplierMatches,
      },
      durationMs: Date.now() - startTime,
    }
  } catch (error: any) {
    console.error('[bom-v2] Stage failed:', error)
    return {
      ok: false,
      error: error.message || 'Unknown error during integrated BOM/Cost/Suppliers stage',
      durationMs: Date.now() - startTime,
    }
  }
}
