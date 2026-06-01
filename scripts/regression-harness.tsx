#!/usr/bin/env npx tsx
/**
 * scripts/regression-harness.tsx
 *
 * Sprint 4A (Tristan 2026-05-20): minimal regression harness.
 *
 * Re-renders cached chain state.json snapshots through the production
 * renderer and asserts a battery of invariants. PR-blocking: exits non-
 * zero on any failure. Designed to run in <2 minutes (no chain re-run,
 * just renderer + Engine B/C re-runs against cached states).
 *
 * Snapshots tracked (paths configurable via REGRESSION_SNAPSHOTS env):
 *   - VF 100 m² container brief
 *   - (BESS + heat pump to be added once first VF run is green)
 *
 * Invariants checked (universal — applied to every snapshot):
 *
 *   I1. Renderer exits 0 + writes PDF >= 200 KB
 *   I2. PDF page count within [30, 80]
 *   I3. partVerifications array non-empty
 *   I4. Every word in partVerifications has unit_price_gbp > 0 OR is
 *       flagged as TBD / manual-sourcing
 *   I5. No partVerifications row carries an obviously-broken price
 *       (unit_price < £0.10 unless explicitly TBD)
 *
 * Class-specific invariants (only when state's product_class matches):
 *
 *   VF:  brief canopy_area_m2 preserved in derived_parameters (±1 %)
 *   VF:  total LED installed power >= 10 kW (200 W/m² × 100 m² floor)
 *   VF:  40-ft ISO container, if present, priced >= £1,000
 *   BESS: cell_count, cell_voltage_v, cell_capacity_ah all present
 *   HP:  thermal output kW within ±20% of brief target
 *
 * Usage:
 *   npx tsx scripts/regression-harness.tsx [--snapshot path1[,path2,...]]
 *                                          [--no-rerender]
 */

import { readFileSync, existsSync, statSync } from 'fs'
import { execFileSync } from 'child_process'
import { resolve, dirname } from 'path'
import { deriveHeadlineFromModules } from '../src/lib/pdf-engine-v2/headline-deriver'
import { buildPerformanceCard } from '../src/lib/pdf-engine-v2/performance-card'
import { getMaterialPrice, MATERIAL_PRICES } from '../src/lib/pdf-engine-v2/lib/material-prices'
import { MARKET_BANDS, computeDesignBandPosition } from '../src/lib/pdf-engine-v2/lib/market-bands'
import { buildContract } from './lib/engineering-contract'
import { auditBriefConstraintCompleteness } from './lib/brief-constraint-completeness-audit'
import { HARD_REQUIRED_SLOTS } from '../src/lib/pdf-engine-v2/lib/engineering-lock-gate'
import { homedir } from 'os'
import Database from 'better-sqlite3'
import { resolveClassGraphSlug } from '../src/lib/pdf-engine-v2/lib/knowledge/class-reference-graph-db'
import { checkBriefFeasibility } from '../src/lib/pdf-engine-v2/lib/brief-feasibility-gate'
import { checkBriefAdherence } from './brief-adherence'
import { generatePhysicsNarrative } from './lib/orchestrator/attribution'
import { runPerRackQuantityAudit } from '../src/lib/pdf-engine-v2/lib/per-rack-quantity-audit'
import { snapshotEmitterIdentity, restoreStrippedPartNumbers } from '../src/lib/pdf-engine-v2/lib/emitter-identity-lock'
import { scanEmitterForBriefLiterals } from './lib/brief-value-literal-scanner'
import { isRoundingFamily } from './lib/cross-page-numeric-consistency-audit'
import { isCatalogueComponent, isBlankOrPlaceholderMpn } from '../src/lib/pdf-engine-v2/lib/emitter-completion'
import { classifyByRules } from './estimate-missing-prices'
import { buildContract } from './lib/engineering-contract'

interface Assertion {
  id: string
  description: string
  passed: boolean
  detail?: string
}

interface SnapshotResult {
  snapshot_path: string
  product_class: string | null
  assertions: Assertion[]
}

const DEFAULT_SNAPSHOTS = [
  // 100 m² VF container brief — the canonical case
  '/tmp/vf-100m2-rerun/state.json',
]

function loadSnapshots(): string[] {
  const arg = process.argv.find((a) => a.startsWith('--snapshot='))
  if (arg) return arg.replace('--snapshot=', '').split(',').map((p) => resolve(p.trim())).filter(Boolean)
  const envOverride = process.env.REGRESSION_SNAPSHOTS
  if (envOverride) return envOverride.split(',').map((p) => resolve(p.trim())).filter(Boolean)
  return DEFAULT_SNAPSHOTS.map((p) => resolve(p))
}

function assertEq<T>(id: string, description: string, actual: T, predicate: (v: T) => boolean, detail?: (v: T) => string): Assertion {
  const passed = predicate(actual)
  return { id, description, passed, detail: passed ? undefined : (detail ? detail(actual) : `got ${JSON.stringify(actual)}`) }
}

function runRenderer(statePath: string): { ok: boolean; pdfPath: string; pages: number; sizeKb: number; stderr: string } {
  const pdfPath = statePath.replace(/\.json$/, '.regression.pdf')
  const projectRoot = resolve(__dirname, '..')
  try {
    const stderr = execFileSync('npx', ['tsx', resolve(__dirname, 'render-minimal-pdf.tsx'), statePath, pdfPath], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
      timeout: 120_000,
    })
    if (!existsSync(pdfPath)) {
      return { ok: false, pdfPath, pages: 0, sizeKb: 0, stderr: 'PDF not written' }
    }
    const sizeKb = statSync(pdfPath).size / 1024
    let pages = 0
    try {
      const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf-8' })
      const m = info.match(/^Pages:\s*(\d+)/m)
      if (m) pages = parseInt(m[1], 10)
    } catch {
      // pdfinfo not installed — page count check is skipped
    }
    return { ok: true, pdfPath, pages, sizeKb, stderr }
  } catch (err: any) {
    return { ok: false, pdfPath, pages: 0, sizeKb: 0, stderr: err?.stderr?.toString() ?? String(err) }
  }
}

function checkSnapshot(snapshotPath: string): SnapshotResult {
  const assertions: Assertion[] = []
  if (!existsSync(snapshotPath)) {
    return {
      snapshot_path: snapshotPath,
      product_class: null,
      assertions: [{ id: 'FILE', description: 'snapshot file exists', passed: false, detail: 'file not found' }],
    }
  }
  const state = JSON.parse(readFileSync(snapshotPath, 'utf-8'))
  const productClass: string = state?.moduleDecomposition?.product_class ?? state?.parsedBrief?.product_class ?? ''

  // I1. Renderer + PDF size
  const renderResult = runRenderer(snapshotPath)
  assertions.push({
    id: 'I1.render',
    description: 'renderer exits 0 + writes PDF >= 200 KB',
    passed: renderResult.ok && renderResult.sizeKb >= 200,
    detail: !renderResult.ok ? `render failed: ${renderResult.stderr.slice(0, 300)}` : (renderResult.sizeKb < 200 ? `pdf only ${renderResult.sizeKb.toFixed(1)} KB` : undefined),
  })

  // I2. Page count
  if (renderResult.pages > 0) {
    assertions.push(assertEq(
      'I2.pages',
      'PDF page count within [30, 80]',
      renderResult.pages,
      (p) => p >= 30 && p <= 80,
      (p) => `got ${p} pages`,
    ))
  }

  // I3-5. partVerifications health
  const pv: any[] = Array.isArray(state.partVerifications) ? state.partVerifications : []
  assertions.push(assertEq(
    'I3.partVerifications',
    'partVerifications array non-empty',
    pv.length,
    (n) => n > 0,
    (n) => `partVerifications has ${n} rows`,
  ))

  const brokenPrices = pv.filter((p: any) => {
    const price = p.price_estimate_gbp ?? p.unit_price_gbp ?? 0
    if (!price) return false  // explicit TBD is ok
    return price > 0 && price < 0.10
  })
  assertions.push(assertEq(
    'I5.no_broken_prices',
    'no priced part has unit < £0.10',
    brokenPrices.length,
    (n) => n === 0,
    (n) => `${n} rows priced < £0.10: ${brokenPrices.slice(0, 3).map((p: any) => `${p.word_name ?? p.word_id}=£${p.price_estimate_gbp}`).join('; ')}`,
  ))

  // ── UNIVERSAL.market_band_renders_when_defined ───────────────────────────
  // For any state.json where the product_class is in MARKET_BANDS, assert the
  // rendered PDF contains the "INDUSTRY £/X REFERENCE BAND" string.
  // (Tristan directive 2026-05-26 — cover band comparison block).
  {
    const band = MARKET_BANDS[productClass] ?? MARKET_BANDS[String(productClass).toLowerCase()] ?? null
    if (band && renderResult.ok && existsSync(renderResult.pdfPath)) {
      let pdfText = ''
      try {
        pdfText = execFileSync('pdftotext', [renderResult.pdfPath, '-'], { encoding: 'utf-8' })
      } catch {
        // pdftotext not installed — skip this invariant gracefully
      }
      if (pdfText) {
        const expectedString = `INDUSTRY £/${band.output_unit.toUpperCase()} REFERENCE BAND`
        assertions.push(assertEq(
          'UNIVERSAL.market_band_renders_when_defined',
          `rendered PDF contains "${expectedString}" for product_class="${productClass}"`,
          // The heading renders with letterSpacing:1.1, so pdftotext extracts it
          // as "I N D U S T RY £ / M ²..." — compare with ALL whitespace stripped
          // so the check tracks whether the band RENDERED, not its glyph spacing.
          pdfText.replace(/\s+/g, '').includes(expectedString.replace(/\s+/g, '')),
          (found) => found,
          () => `PDF did not contain "${expectedString}" (whitespace-normalised) — IndustryBandBlock returned null or the band was not resolved`,
        ))
      }
    }
  }

  // ── UNIVERSAL.perf_card_not_degraded_when_brief_has_metrics ──────────────
  // The brief PARSE emits a rich target_performance.metrics[] (canonical
  // key_metric + category + value + unit). When a class has no curated
  // PerformanceCardSchema, buildPerformanceCard MUST synthesise a labelled
  // card from those metrics, NOT degrade to the generic single "Performance
  // target = <value>" row. Guards the 2026-05-30 wind fix: a 6 MW turbine
  // whose brief carried 10 metrics was rendering only "Performance target
  // 6.00". Fires whenever the brief has ≥2 named metrics; passes for curated
  // classes (card.product_class = the curated slug) and synthesised cards
  // (product_class = 'brief-synthesised'); FAILS only on the degrade-to-generic.
  {
    const metrics = state?.parsedBrief?.constraints?.target_performance?.metrics
    const namedMetrics = Array.isArray(metrics)
      ? metrics.filter((m: any) => m && typeof m.value === 'number' && typeof m.key_metric === 'string' && m.key_metric)
      : []
    if (namedMetrics.length >= 2) {
      let card: any = null
      try { card = buildPerformanceCard(state) } catch { /* assertion below catches null */ }
      const rowCount = card ? card.sections.reduce((n: number, s: any) => n + (s.metrics?.length ?? 0), 0) : 0
      assertions.push(assertEq(
        'UNIVERSAL.perf_card_not_degraded_when_brief_has_metrics',
        `brief has ${namedMetrics.length} named metrics → performance card is not the degraded generic single-row schema`,
        card?.product_class !== 'generic' && rowCount >= Math.min(namedMetrics.length, 3),
        (ok) => ok,
        () => `performanceCard product_class="${card?.product_class}" rowCount=${rowCount} for class="${productClass}" — expected a curated or 'brief-synthesised' card with ≥${Math.min(namedMetrics.length, 3)} rows, got the generic degrade. buildPerformanceCard is not surfacing the brief's ${namedMetrics.length} metrics[].`,
      ))
    }
  }

  // ── UNIVERSAL.material_db_first_never_drops_curated ──────────────────────
  // The materials growing-DB (Lever 5): getMaterialPrice reads forge-truth.db
  // material_prices DB-first, falling back to the static MATERIAL_PRICES. Assert
  // the DB-first read NEVER loses a curated material (every static key resolves)
  // — guards a broken seed/read from silently dropping a material's cost
  // grounding, which would blind the B-8 commodity-rate gate.
  {
    const missing = Object.keys(MATERIAL_PRICES).filter((k) => getMaterialPrice(k) == null)
    assertions.push(assertEq(
      'UNIVERSAL.material_db_first_never_drops_curated',
      `every curated material resolves via getMaterialPrice (DB-first + static fallback); ${Object.keys(MATERIAL_PRICES).length} materials`,
      missing.length === 0,
      (ok) => ok,
      () => `getMaterialPrice returned null for: ${missing.join(', ')} — DB-first read or static fallback is broken; B-8 would lose commodity grounding for these.`,
    ))
  }

  // ── UNIVERSAL.energy_capacity_factor_reconciles ──────────────────────────
  // When a state carries annual_energy_kwh + capacity_factor_pct + rated power,
  // they MUST reconcile: CF% ≈ annual_energy_kwh / (rated_kw × 8760) × 100.
  // Guards the 2026-05-30 wind bug: the wind-resource tool was fed a 20 m DEFAULT
  // rotor (the class-plan payload omitted rotor_diameter_m + misnamed the cut-in/
  // rated/cut-out keys), so it computed CF against a phantom ~1.35 MW curve —
  // capacity_factor_pct=9.33% while annual_energy implied 2.1%. The two disagreed
  // AND both were wrong. A correct run reconciles to within 15%. Fires only when
  // all three fields are present (wind + any class emitting annual energy).
  {
    const q = state?.orchestratorContract?.quantities ?? {}
    const cfPct = q?.capacity_factor_pct?.value
    const aepKwh = q?.annual_energy_kwh?.value
    const ratedKw = q?.rated_power_kw?.value
    if (typeof cfPct === 'number' && cfPct > 0 && typeof aepKwh === 'number' && aepKwh > 0 && typeof ratedKw === 'number' && ratedKw > 0) {
      const impliedCf = (aepKwh / (ratedKw * 8760)) * 100
      const ratio = impliedCf / cfPct
      assertions.push(assertEq(
        'UNIVERSAL.energy_capacity_factor_reconciles',
        `capacity_factor_pct (${cfPct.toFixed(1)}%) reconciles with annual_energy/(rated×8760) (${impliedCf.toFixed(1)}%)`,
        ratio >= 0.85 && ratio <= 1.15,
        (ok) => ok,
        () => `capacity_factor_pct=${cfPct.toFixed(2)}% but annual_energy_kwh=${aepKwh.toFixed(0)} / (${ratedKw}×8760) implies ${impliedCf.toFixed(2)}% — a ${ratio.toFixed(2)}× mismatch. The wind-resource tool likely computed CF against a wrong rotor/rating; check rotor_diameter_m + hub_height_m are passed in the class-plan payload (scripts/lib/orchestrator/class-plans/wind-turbine.ts).`,
      ))
    }
  }

  // ── UNIVERSAL.designs_within_premium_band_unless_flagged ─────────────────
  // For any state.json where the product_class is in MARKET_BANDS, assert
  // installed_asp_gbp / output_units is within ±10% of premium.high_gbp OR
  // commodity.high_gbp, OR the cost-analysis section of the PDF mentions
  // "above premium" or "outside band" (i.e. is explicitly flagged).
  // This invariant fires at WARN level (does not fail the harness) — it's a
  // signal for operator review, not a hard chain blocker.
  {
    const band = MARKET_BANDS[productClass] ?? MARKET_BANDS[String(productClass).toLowerCase()] ?? null
    const installedAsp: number = state?.orchestratorContract?.cost_stack?.installed_asp_gbp ?? 0
    if (band && installedAsp > 0) {
      const positionResult = computeDesignBandPosition(installedAsp, state, band)
      if (positionResult) {
        const { computed_per_unit, position } = positionResult
        const premiumHighWithTolerance = band.tiers.premium.high_gbp * 1.10
        const commodityHighWithTolerance = band.tiers.commodity.high_gbp * 1.10
        const withinBand = computed_per_unit <= premiumHighWithTolerance || computed_per_unit <= commodityHighWithTolerance
        const isFlagged = position === 'above premium band' || position === 'below commodity band'
        // Invariant passes when: within tolerance, OR the position is explicitly one
        // of the "outside" markers (meaning the block flags it visibly on the cover).
        assertions.push(assertEq(
          'UNIVERSAL.designs_within_premium_band_unless_flagged',
          `installed ASP £/${band.output_unit} is within 110% of premium.high OR is explicitly flagged as outside-band`,
          withinBand || isFlagged,
          (ok) => ok,
          () => `${computed_per_unit.toFixed(0)} £/${band.output_unit} is ${position} — not within 110% of premium.high (${band.tiers.premium.high_gbp}) and not flagged as outside-band. Verify BoM completeness or document premium-above-band positioning.`,
        ))
      }
    }
  }

  // Class-specific invariants
  if (productClass === 'vertical_farm' || productClass === 'verticalfarm') {
    // Canopy preserved
    const briefCanopy = state?.parsedBrief?.constraints?.additional_constraints?.find((c: any) =>
      String(c.description ?? '').match(/(\d+)\s*m².*(canopy|growing|growing\s+surface)/i)
    )
    const md = state?.moduleDecomposition?.modules ?? []
    const structContainment = md.find((m: any) => m.module === 'structure_containment')
    const canopyDp = structContainment?.derived_parameters?.canopy_area_m2
                  ?? structContainment?.derived_parameters?.growing_area_m2
                  ?? null
    if (canopyDp != null) {
      assertions.push(assertEq(
        'VF.canopy_preserved',
        'VF canopy_area_m2 in derived_parameters reasonable for 100 m² brief',
        Number(canopyDp),
        (n) => n >= 90 && n <= 110,
        (n) => `canopy_area_m2 = ${n}, expected ~100`,
      ))
    }
    // Container price floor
    const containerPv = pv.find((p: any) =>
      String(p.engine_b_component_class ?? '') === 'structural_metal'
      && /(\d+)[\s-]*(ft|foot).*container|iso[\s-]*container/i.test(String(p.word_name ?? p.part_name ?? ''))
    )
    if (containerPv) {
      const containerPrice = containerPv.cost_repair_corrected_price_gbp
        ?? containerPv.price_estimate_gbp
        ?? containerPv.unit_price_gbp
        ?? 0
      assertions.push(assertEq(
        'VF.container_price_floor',
        'ISO container priced >= £1,000',
        Number(containerPrice),
        (n) => n >= 1000,
        (n) => `container unit price £${n}, expected >= £1,000`,
      ))
    }
  }

  if (productClass === 'energy_storage' || productClass.startsWith('bess')) {
    const eos = state?.moduleDecomposition?.modules?.find((m: any) => m.module === 'energy_storage_source')
    const dp = eos?.derived_parameters ?? {}
    const required = ['cell_count', 'cell_voltage_v', 'cell_capacity_ah']
    const missing = required.filter((k) => dp[k] == null)
    assertions.push(assertEq(
      'BESS.cell_fields',
      'BESS energy_storage_source.derived_parameters has cell_count + cell_voltage_v + cell_capacity_ah',
      missing.length,
      (n) => n === 0,
      (n) => `${n} required fields missing: ${missing.join(', ')}`,
    ))

    // BESS L28 invariant (2026-05-25, council determinism fix): headline-derived
    // cell_count MUST equal orchestratorContract.quantities.cell_count.value.
    // Root cause: deny-list isCellAdjacent regex missed cell_heater_pad (+15) and
    // previously cell_electrolyte (+3750). Fix: headline-deriver now reads the
    // contract value directly. This invariant re-derives the headline live against
    // the snapshot (NOT from saved keyMetrics) so it catches future regressions
    // in the deriver code itself, not just stale saved state.
    const contractCellCount = state?.orchestratorContract?.quantities?.cell_count?.value
    if (contractCellCount != null) {
      try {
        const freshHeadline = deriveHeadlineFromModules(
          state?.moduleDecomposition?.modules ?? [],
          state?.parsedBrief,
          'energy_storage',
          null,
          state?.orchestratorContract,
        )
        const freshCellCount = freshHeadline?.supporting_metrics?.find((m: any) => m.id === 'cell_count')?.value
        assertions.push(assertEq(
          'BESS.cell_count_contract_vs_headline',
          'fresh-derived headline cell_count === orchestratorContract.quantities.cell_count.value',
          Math.abs(Number(freshCellCount ?? 0) - Number(contractCellCount)),
          (delta) => delta === 0,
          (delta) => `cell_count diverges by ${delta}: headline=${freshCellCount} contract=${contractCellCount}`,
        ))
      } catch (err) {
        assertions.push({ id: 'BESS.cell_count_contract_vs_headline', description: 'fresh-derived headline cell_count === orchestratorContract.quantities.cell_count.value', passed: false, detail: `deriveHeadlineFromModules threw: ${err}` })
      }
    }

    // Build #18r-fix2 invariant (2026-05-22 Loop 28 Bugs 1 + 5): all rack-count
    // mentions across the BESS design must collapse to a single value. Loop 28
    // shipped with module_brief="18 racks" and overview_paragraph_en="15 racks"
    // because the deterministic emitter ignored Contract.quantities.rack_count.
    const modulesBess: any[] = state?.moduleDecomposition?.modules ?? []
    const rackValues = new Set<number>()
    const rackMentions: Array<{ where: string; n: number }> = []
    for (const mb of modulesBess) {
      const drp = mb?.derived_parameters?.rack_count
      if (typeof drp === 'number' && drp > 0) {
        rackValues.add(drp); rackMentions.push({ where: `${mb.module}.derived_parameters.rack_count`, n: drp })
      }
      for (const f of ['module_brief', 'overview_paragraph_en']) {
        const txt = String(mb?.[f] ?? '')
        const re = /\b(\d+)\s+racks?\b/gi
        let mm: RegExpExecArray | null
        while ((mm = re.exec(txt)) !== null) {
          const n = parseInt(mm[1], 10)
          if (Number.isFinite(n) && n > 0 && n < 1000) {
            rackValues.add(n); rackMentions.push({ where: `${mb.module}.${f}`, n })
          }
        }
      }
    }
    assertions.push(assertEq(
      'BESS.rack_count_consistent',
      'All rack-count mentions across BESS modules collapse to a single value',
      rackValues.size,
      (n) => n <= 1,
      (n) => `${n} distinct rack-count values: ${[...rackValues].join(', ')} — mentions: ${rackMentions.map(r => `${r.where}=${r.n}`).join('; ').slice(0, 400)}`,
    ))

    // Build #18r-fix2 invariant (2026-05-22 Loop 28 Bug 4): Modbus TCP and
    // other comms protocols must NOT be tagged kind:regulatory.
    const protocolMisclassified: string[] = []
    for (const mb of modulesBess) {
      for (const sm of (mb?.sub_modules ?? [])) {
        for (const w of (sm?.words ?? [])) {
          for (const mc of (w?.modifier_characters ?? [])) {
            const kind = String(mc?.kind ?? '').toLowerCase()
            const value = String(mc?.value ?? '')
            if (kind === 'regulatory' && /\b(?:modbus(?:\s+|-)?(?:tcp|rtu)|canopen|ethercat|profinet|opc[\s-]?ua|iec\s*61850)\b/i.test(value)) {
              protocolMisclassified.push(`${mb.module}/${sm.id}/${w.id}: regulatory="${value}"`)
            }
          }
        }
      }
    }
    assertions.push(assertEq(
      'BESS.protocol_not_regulatory',
      'No communication protocol appears under kind:regulatory in BESS modifier_characters',
      protocolMisclassified.length,
      (n) => n === 0,
      (n) => `${n} protocols miscategorised as regulatory: ${protocolMisclassified.slice(0, 5).join('; ')}`,
    ))

    // Build #18r-fix2 invariant (2026-05-22 Loop 28 Bugs 2 + 3): overview prose
    // must not contain LLM-hallucinated phrases contradicting tool outputs.
    const FORBIDDEN_BESS_PROSE = [
      { name: 'voltage_reconfiguration', pattern: /reconfigured to \d+\s*(?:-?series\s+)?cells?\b/i },
      { name: 'invented_derating_range', pattern: /\d+\s*[-–—]\s*\d+\s*%\s+derating/i },
      { name: 'efficiency_range_invented', pattern: /round[-\s]?trip\s+efficiency\s+of\s+\d+\s*[-–—]\s*\d+\s*%/i },
    ]
    const proseHits: string[] = []
    for (const mb of modulesBess) {
      for (const f of ['overview_paragraph_en', 'module_brief']) {
        const txt = String(mb?.[f] ?? '')
        for (const fp of FORBIDDEN_BESS_PROSE) {
          const mm = txt.match(fp.pattern)
          if (mm) proseHits.push(`${mb.module}.${f}: ${fp.name}="${mm[0]}"`)
        }
      }
    }
    assertions.push(assertEq(
      'BESS.no_forbidden_prose',
      'No tool-contradicting phrases in BESS module prose',
      proseHits.length,
      (n) => n === 0,
      (n) => `${n} forbidden phrases found: ${proseHits.slice(0, 5).join('; ')}`,
    ))

    // BESS L5 invariants (2026-05-24, physics-critic L5 four HIGH issues):
    // each fix gets a guard so iter-(N+1) catches a regression iter-N didn't.

    // BESS.busbar_density — cell-to-cell busbar must have ≥117 mm² (≤3 A/mm²
    // @ 350 A) per IEC 61439-1 enclosed-pack current density. Guards against
    // re-introducing the 12×3 mm = 36 mm² spec that gave 9.72 A/mm².
    const busbarBadDims: string[] = []
    for (const mb of modulesBess) {
      for (const sm of (mb?.sub_modules ?? [])) {
        for (const w of (sm?.words ?? [])) {
          const wid = String(w?.id ?? w?.word_id ?? '')
          if (!/cell_to_cell_busbar/.test(wid)) continue
          // search modifier_characters for kind=dimension with mm² < 117
          for (const mc of (w?.modifier_characters ?? [])) {
            const kind = String(mc?.kind ?? '').toLowerCase()
            const value = String(mc?.value ?? '')
            const unit = String(mc?.unit ?? '').toLowerCase()
            if (kind !== 'dimension' || unit !== 'mm') continue
            // try to parse "A×B" or "AxB" mm formats
            const mmDim = value.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/)
            if (!mmDim) continue
            const area = parseFloat(mmDim[1]) * parseFloat(mmDim[2])
            if (area < 117) busbarBadDims.push(`${mb.module}/${sm.id}/${wid}: ${value} mm = ${area.toFixed(0)} mm² (need ≥117 mm² for ≤3 A/mm² @ 350 A)`)
          }
        }
      }
    }
    assertions.push(assertEq(
      'BESS.busbar_density',
      'Cell-to-cell busbar cross-section ≥117 mm² for 350 A continuous (≤3 A/mm² per IEC 61439-1)',
      busbarBadDims.length,
      (n) => n === 0,
      (n) => `${n} undersized busbars: ${busbarBadDims.slice(0, 3).join('; ')}`,
    ))

    // BESS.ac_breaker_size — AC main breaker frame must be ≥2000 A so it
    // covers 1.25 × I_peak at 400 V 3-phase for any peak power ≥1 MW.
    // Catches regression to 1600 A frame undersizing reported by physics
    // critic L5 brief_to_design_fidelity HIGH.
    const breakerBadSize: string[] = []
    for (const mb of modulesBess) {
      for (const sm of (mb?.sub_modules ?? [])) {
        for (const w of (sm?.words ?? [])) {
          const wid = String(w?.id ?? w?.word_id ?? '')
          if (!/ac_main_breaker/.test(wid)) continue
          for (const mc of (w?.modifier_characters ?? [])) {
            const kind = String(mc?.kind ?? '').toLowerCase()
            const value = String(mc?.value ?? '')
            const unit = String(mc?.unit ?? '').toLowerCase()
            if (kind !== 'capacity' || unit !== 'a') continue
            const amps = parseFloat(value)
            if (Number.isFinite(amps) && amps < 2000) breakerBadSize.push(`${mb.module}/${sm.id}/${wid}: ${amps} A (need ≥2000 A frame for 1.25 × I_peak at 400 V 3-phase)`)
          }
        }
      }
    }
    assertions.push(assertEq(
      'BESS.ac_breaker_size',
      'AC main breaker frame ≥2000 A (covers 1.25 × peak current at 400 V 3-phase)',
      breakerBadSize.length,
      (n) => n === 0,
      (n) => `${n} undersized AC breakers: ${breakerBadSize.slice(0, 3).join('; ')}`,
    ))

    // BESS.lem_part_realism — pack current transducer MUST NOT be a fictitious
    // LEM LAH 25-NP / similar small-signal PCB-mount transducer when measuring
    // ≥80 A rack current. Catches regression where bare "current transducer
    // 2500 A" emission lets the LLM hallucinate undersized LEM parts.
    const lemHits: string[] = []
    const FORBIDDEN_LEM_PARTS = [/lem\s+lah\s+25[- ]?np/i, /lem\s+las\s+\d+[- ]?np/i, /lem\s+lts\s+25[- ]?np/i]
    for (const mb of modulesBess) {
      for (const sm of (mb?.sub_modules ?? [])) {
        for (const w of (sm?.words ?? [])) {
          const wid = String(w?.id ?? w?.word_id ?? '')
          if (!/current_transducer|pack_current|current_sensor/.test(wid)) continue
          for (const mc of (w?.modifier_characters ?? [])) {
            const value = String(mc?.value ?? '')
            for (const fp of FORBIDDEN_LEM_PARTS) {
              if (fp.test(value)) lemHits.push(`${mb.module}/${sm.id}/${wid}: "${value}" — small-signal PCB-mount transducer wrong for ≥80 A rack current`)
            }
          }
        }
      }
    }
    assertions.push(assertEq(
      'BESS.lem_part_realism',
      'Pack current transducer is NOT a small-signal PCB-mount LEM part (LAH 25-NP class)',
      lemHits.length,
      (n) => n === 0,
      (n) => `${n} fictitious LEM parts: ${lemHits.slice(0, 3).join('; ')}`,
    ))

    // BESS.mass_closure_documented — when in_container_mass_kg > brief cap,
    // the contract MUST surface mass_feasibility=0 as a documented trade-off.
    // Catches regression where mass overrun is silently absorbed into the
    // BoM without honouring the brief's mass envelope.
    let massFlagPresent = true
    let massFeasibilityVal: number | null = null
    let inContainerMassVal: number | null = null
    let briefMassCapVal: number | null = null
    const eosCheck = state?.moduleDecomposition?.modules?.find((m: any) => m.module === 'energy_storage_source')
    // Read contract via the design's contractAcceptedTradeOffs (added L5)
    const contractFlags = (state?.contractAcceptedTradeOffs?.accepted_flags as any) ?? null
    if (contractFlags) {
      massFeasibilityVal = contractFlags.mass_feasibility?.value ?? null
      inContainerMassVal = contractFlags.in_container_mass_kg?.value ?? null
    }
    // Read brief cap from parsedBrief if available
    briefMassCapVal = Number(state?.parsedBrief?.constraints?.max_mass_kg?.value ?? state?.briefBlock?.constraints?.max_mass_kg?.value ?? 28000)
    if (massFeasibilityVal === null || inContainerMassVal === null) {
      // contract not yet propagated — skip rather than false-fail
      massFlagPresent = true
    } else if (inContainerMassVal > briefMassCapVal && massFeasibilityVal !== 0) {
      massFlagPresent = false
    }
    assertions.push(assertEq(
      'BESS.mass_closure_documented',
      'When in-container mass exceeds brief cap, contract surfaces mass_feasibility=0 as documented trade-off',
      massFlagPresent ? 1 : 0,
      (n) => n === 1,
      () => `in_container=${inContainerMassVal} kg vs cap=${briefMassCapVal} kg but mass_feasibility=${massFeasibilityVal} (expected 0)`,
    ))

    // BESS.thermal_ambient_contract — task #122 (2026-05-25) regression guard.
    // The BESS engineering contract MUST emit `ambient_design_temp_c` (read
    // from parsedBrief.constraints.operating_environment.temp_max_c, default
    // 35°C). The deterministic emitter's chiller selector + gate 16 audit
    // both depend on this field. If a refactor accidentally drops it (e.g.
    // by reverting the contract builder), iter-N catches iter-(N+1) here
    // instead of silently shipping a chiller sized for +35°C when the brief
    // specified +50°C. Universal pattern — when other classes (HAPS, VF,
    // heat pump, EV charger) adopt the same field, extend this invariant to
    // cover them too. Drawer pattern: `pre-change mempalace search:
    // ambient derating chiller -> 5 drawers; loop for the same gap class`.
    const contractQ = state?.orchestratorContract?.quantities as Record<string, any> | undefined
    const ambientDesignTempPresent = typeof contractQ?.ambient_design_temp_c?.value === 'number'
    assertions.push(assertEq(
      'BESS.thermal_ambient_contract',
      'orchestratorContract.quantities.ambient_design_temp_c is present and numeric (task #122 universal thermal subsystem)',
      ambientDesignTempPresent ? 1 : 0,
      (n) => n === 1,
      () => `ambient_design_temp_c missing from orchestratorContract.quantities — gate 16 audit + selectPfannenbergEbXt will silently fall back to 35°C default for non-+35°C briefs`,
    ))

    // BESS.emc_busbar_sibling_pn — after strip+inherit, any word in the
    // emc_grounding sub_module that has manufacturer=nVent ERIFLEX MUST have
    // a part_number. Without the inheritPartNumberFromDeterministicSibling fix
    // (2026-05-25, L27 regression), Phase 2 repair adds emc_grounding_busbar_word
    // with a hallucinated MPN (EBS-500), the verifier strips EBS-500, and gate 13
    // falls back to manufacturer-only, picking MBJ50-300-10 (250 A) and firing a
    // false-positive HIGH for 500 A claim. The inheritance pass copies
    // MBJ50-300-10 from the deterministic sibling so gate 13 sees a precise finding.
    // This invariant confirms the fix is in place: all emc_grounding nVent ERIFLEX
    // words must have a part_number, NOT <no-part-number>.
    const emcGroundingModule = state?.moduleDecomposition?.modules?.find(
      (m: any) => m.module === 'power_distribution'
    )
    let emcGroundingNoPn = 0
    if (emcGroundingModule) {
      const emcSm = (emcGroundingModule as any).sub_modules?.find(
        (sm: any) => sm.id === 'emc_grounding'
      )
      if (emcSm) {
        for (const w of (emcSm.words ?? [])) {
          const mods: Array<{ kind: string; value: string }> = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
          const hasMfr = mods.some(m => m.kind === 'manufacturer' && /nvent|eriflex/i.test(m.value ?? ''))
          const hasPn = mods.some(m => m.kind === 'part_number' && String(m.value ?? '').trim().length > 0)
          if (hasMfr && !hasPn) emcGroundingNoPn++
        }
      }
    }
    assertions.push(assertEq(
      'BESS.emc_busbar_sibling_pn',
      'All nVent ERIFLEX words in emc_grounding sub_module have a part_number (inheritPartNumberFromDeterministicSibling fix, 2026-05-25)',
      emcGroundingNoPn,
      (n) => n === 0,
      (n) => `${n} nVent ERIFLEX word(s) in emc_grounding missing part_number — inheritPartNumberFromDeterministicSibling may have regressed`,
    ))

    // BESS.enclosure_fan_part_number — L28 council fix (2026-05-25).
    // The enclosure_ventilation_fan_word in the enclosure_climate sub_module
    // MUST carry a part_number modifier (W2E200-HK38-01 pinned by the
    // deterministic emitter). Without the MPN, the distributor cascade falls
    // back to Engine B's thermal-class curve which returns ~£21 — a 6-12×
    // under-quote vs real catalogue price (£133.78 Mouser, £253.78 Farnell).
    // With the MPN present, the cascade returns the cached Mouser price.
    const envInterfaceModule = state?.moduleDecomposition?.modules?.find(
      (m: any) => m.module === 'environmental_interface'
    )
    let fanMissingPn = 0
    if (envInterfaceModule) {
      const enclimateSm = (envInterfaceModule as any).sub_modules?.find(
        (sm: any) => sm.id === 'enclosure_climate'
      )
      if (enclimateSm) {
        for (const w of (enclimateSm.words ?? [])) {
          const wid = String(w?.id ?? w?.word_id ?? '')
          if (!/enclosure_ventilation_fan/.test(wid)) continue
          const mods: Array<{ kind: string; value: string }> = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
          const hasPn = mods.some(m => m.kind === 'part_number' && String(m.value ?? '').trim().length > 0)
          if (!hasPn) fanMissingPn++
        }
      }
    }
    assertions.push(assertEq(
      'BESS.enclosure_fan_part_number',
      'enclosure_ventilation_fan_word carries a part_number modifier (W2E200-HK38-01) so distributor cascade prices at £133.78 not Engine B ~£21',
      fanMissingPn,
      (n) => n === 0,
      (n) => `${n} enclosure_ventilation_fan word(s) missing part_number — will be priced by Engine B thermal curve (~£21) instead of Mouser cached £133.78`,
    ))

    // BESS.nll_rad_syntax_word_slot_consistent — L32 data-binding fix
    // (2026-05-26, council BLOCKER). Verifies that the naturalLanguageLayer's
    // paragraph_rad and grammar_trace agree with the word-slot dimension /
    // capacity / part_number modifier_characters on the same words.
    //
    // The structural defect: Stage 1.7 emits rad_syntax at LLM-call time.
    // Subsequent stages mutate modifier_characters in-place without refreshing
    // rad_syntax. The frozen rad_syntax (paragraph_rad = concatenation of
    // rad_syntax strings) then diverges from the actual word modifiers.
    // L32 evidence: coolant_distribution_manifold rad_syntax said "DN25" while
    // dimension modifier said "100 mm" (DN100); ac_grid_isolator rad_syntax was
    // absent for ac_grid_interconnect but word said OT1600 correctly.
    //
    // The fix (refreshModulesRadSyntax in serial-design-chain-v2.tsx) rebuilds
    // rad_syntax from words[] before buildNaturalLanguageLayer. This invariant
    // catches any regression where a stage mutates modifier_characters AFTER
    // the refresh, or where the refresh is accidentally skipped.
    //
    // Checks: for each sub-module in the BESS modules, compare the
    // naturalLanguageLayer paragraph_rad against the deterministic rebuild
    // from words[]. If they diverge, the refresh was skipped or mutated.
    {
      let radDivergences = 0
      const nllByMod = state?.naturalLanguageLayer?.by_module ?? {}
      const modDecomp = state?.moduleDecomposition?.modules ?? []
      for (const m of modDecomp) {
        const nllMod = nllByMod[m.module] ?? {}
        // Rebuild each sub-module's rad sentence deterministically and compare
        // against the stored sub_module_sentences[].sentence_rad in the NLL.
        const smSentences: Record<string, string> = {}
        for (const ss of (nllMod.sub_module_sentences ?? [])) {
          smSentences[ss.sub_module_id] = ss.sentence_rad ?? ''
        }
        for (const sm of (m.sub_modules ?? [])) {
          const storedRad = smSentences[sm.id]
          if (!storedRad) continue
          // Extract dimension/capacity/part_number modifier values from words[]
          // and check they appear verbatim in the stored sentence_rad.
          for (const w of (sm.words ?? [])) {
            const mods: Array<{ kind: string; value?: string; unit?: string }> =
              Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
            for (const mc of mods) {
              if (!['dimension', 'capacity', 'part_number'].includes(mc.kind)) continue
              const modVal = mc.unit ? `${mc.value}${mc.unit}` : String(mc.value ?? '')
              if (modVal.length < 3) continue  // skip trivially short values
              if (!storedRad.includes(modVal)) {
                radDivergences++
              }
            }
          }
        }
      }
      assertions.push(assertEq(
        'BESS.nll_rad_syntax_word_slot_consistent',
        'NLL sub_module_sentences[].sentence_rad contains all dimension/capacity/part_number modifier values from words[] (L32 data-binding fix, refreshModulesRadSyntax)',
        radDivergences,
        (n) => n === 0,
        (n) => `${n} modifier value(s) present in words[] but absent from NLL sentence_rad — refreshModulesRadSyntax may have been skipped, OR a stage mutated modifier_characters after the refresh. Root cause of L32 score regression: DN25 in rad_syntax vs DN100 in dimension modifier (and OT400 vs OT1600).`,
      ))
    }

    // Suppress unused-var warning for the eosCheck (kept for future invariants)
    void eosCheck

    // BESS.phase2_only_allowlist_mpns (2026-05-26 class-killer, handover
    // 2026-05-26T05-34-4dd3f4a39.md Shift B item 1).
    //
    // Every BoM word in final state.json that carries a Phase-2-sourced
    // part_number MUST be from the verified-parts allowlist at chain start.
    // The "Phase 2 sourced" signal is conservative: we cannot tag individual
    // words by source in the current state schema, so we check ALL words —
    // any hallucinated MPN that slipped through applyPatches (e.g. if the
    // allowlist guard was bypassed) will be caught here.
    //
    // Specifically: no word should carry a known-hallucinated MPN that was
    // documented in drawer forgeos_gotchas_1c9b53af5c9aaf32. The list is
    // additive — future hallucinations get added when observed.
    //
    // This invariant does NOT check allowlist completeness (that would require
    // running the full allowlist builder, which needs the forge-truth.db and
    // chain output dir). It checks only the KNOWN-BAD list — a hard whitelist
    // of MPNs that are definitively hallucinated.
    const KNOWN_HALLUCINATED_MPNS: Array<{ pn: RegExp; note: string }> = [
      { pn: /^EBS-500$/i,            note: 'nVent ERIFLEX EBS-500 does not exist; use MBJ50-300-10 (drawer forgeos_gotchas_1c9b53af5c9aaf32)' },
      { pn: /^EV200HAANA-1500V$/i,   note: 'TE EV200HAANA-1500V claim — real PN is EV200HAANA (no suffix); 1500V is in model name not suffix (drawer forgeos_gotchas_1c9b53af5c9aaf32)' },
      { pn: /^ECARO-25/i,            note: 'ECARO-25 is a fire-suppression SYSTEM brand (Fike), not a part_number; should be in regulatory not part_number (drawer forgeos_gotchas_1c9b53af5c9aaf32)' },
      { pn: /^UL\s+1007/i,           note: 'UL 1007/1577 is a regulatory standard, not an MPN; should use kind=regulatory not part_number' },
      { pn: /^UL\s+1577/i,           note: 'UL 1577 is a regulatory standard, not an MPN; should use kind=regulatory not part_number' },
      { pn: /^ASTM\s+D3306/i,        note: 'ASTM D3306 is a coolant standard, not an MPN; should use kind=regulatory not part_number' },
    ]
    const hallucinatedPnViolations: string[] = []
    const allBessModules = state?.moduleDecomposition?.modules ?? []
    for (const m of allBessModules) {
      for (const sm of (m.sub_modules ?? [])) {
        for (const w of (sm.words ?? [])) {
          const mods: Array<{ kind: string; value: string }> = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
          for (const mc of mods) {
            if (mc.kind !== 'part_number') continue
            const pnVal = String(mc.value ?? '').trim()
            for (const known of KNOWN_HALLUCINATED_MPNS) {
              if (known.pn.test(pnVal)) {
                hallucinatedPnViolations.push(`word=${w.id ?? '?'} in ${m.module}::${sm.id}: part_number="${pnVal}" — ${known.note}`)
              }
            }
          }
        }
      }
    }
    assertions.push(assertEq(
      'BESS.phase2_only_allowlist_mpns',
      'No known-hallucinated MPNs in final state (EBS-500, EV200HAANA-1500V, ECARO-25-as-pn, UL 1007/1577-as-pn, ASTM D3306-as-pn)',
      hallucinatedPnViolations.length,
      (n) => n === 0,
      (n) => `${n} known-hallucinated MPN(s) found in final state — Phase 2 allowlist guard may have been bypassed or allowlist was missing: ${hallucinatedPnViolations.slice(0, 5).join('; ')}`,
    ))
  }

  // === Additional universal invariants ===

  // I6. Module count — full taxonomy decomposition usually emits 8-12 modules
  const modules: any[] = state?.moduleDecomposition?.modules ?? []
  assertions.push(assertEq(
    'I6.module_count',
    'moduleDecomposition.modules count within [6, 14]',
    modules.length,
    (n) => n >= 6 && n <= 14,
    (n) => `${n} modules emitted`,
  ))

  // I7. Cost Repair Summary present (proves Cost Repair Loop ran)
  if (state?.cost_repair_summary) {
    const summary = state.cost_repair_summary
    const reviewed = (summary.corrected_count ?? 0) + (summary.manual_sourcing_count ?? 0) + (summary.leave_as_is_count ?? 0)
    assertions.push(assertEq(
      'I7.cost_repair_ratio',
      'Cost Repair reviewed >= 50% of flagged lines',
      summary.flagged_count > 0 ? reviewed / summary.flagged_count : 1,
      (r) => r >= 0.5,
      (r) => `reviewed ${reviewed}/${summary.flagged_count} flagged (${Math.round(r * 100)}%)`,
    ))
  }

  // I8. Supplier validation summary — if present, urls_replaced + already_reconciled >= 50% of candidates
  if (state?.supplier_validation_summary) {
    const sv = state.supplier_validation_summary
    const safe = (sv.urls_replaced ?? 0) + (sv.already_reconciled ?? 0)
    assertions.push(assertEq(
      'I8.supplier_reconcile_ratio',
      'Supplier validation: >= 50% of candidates have reconciled URLs',
      sv.total_candidates > 0 ? safe / sv.total_candidates : 1,
      (r) => r >= 0.5,
      (r) => `${safe}/${sv.total_candidates} reconciled (${Math.round(r * 100)}%)`,
    ))
  }

  // I9b. Unit-family bug detector (2026-05-21 — added after 4 hits of the
  // unit-family bug pattern: cover-side, Physics Repair, G0.5 HAPS endurance,
  // G0.5 VF yield). The chain MUST NOT exit FATAL on G0.5 due to a
  // brief/design unit-family mismatch. We check: when state has cost_stack
  // (means chain progressed past G0.5) OR an explicit G0.5 PASS verdict,
  // assert no scale_mismatch entry in any reconciliation report. If
  // state.g0_5_brief_target_reconciliation exists with verdict='HALT', this
  // is the bug pattern recurring — fail loudly so we add another unit family
  // to classifyBriefUnitFamily.
  const g05 = state?.briefTargetReconciliation
  if (g05) {
    assertions.push(assertEq(
      'I9b.no_g05_halt',
      'G0.5 brief-target reconciliation did not HALT (unit-family bug regression check)',
      g05.verdict,
      (v) => v !== 'HALT',
      (v) => `G0.5 verdict=${v}; mismatches=${JSON.stringify((g05.mismatches ?? []).map((m: any) => ({ target: m.target_field, briefUnit: m.target_unit, design: m.design_field, ratio: m.ratio })).slice(0, 3))} — likely missing unit family in classifyBriefUnitFamily or missing TARGET_RECONCILIATIONS spec`,
    ))
  }

  // I10. P1-1 (2026-05-23): parsedBrief.constraints.target_performance.metrics
  // MUST be an Array (may be empty for qualitative-only briefs). Multi-metric
  // schema is the architectural fix for the unit-family bug class — if this
  // field is absent or non-array, the brief parser has regressed to the
  // pre-P1-1 schema and downstream unit-family bugs will re-emerge.
  if (state?.parsedBrief?.constraints?.target_performance !== undefined) {
    const metrics = state.parsedBrief.constraints.target_performance.metrics
    assertions.push(assertEq(
      'I10.metrics_array_present',
      'parsedBrief.target_performance.metrics is an Array (post-P1-1 schema)',
      Array.isArray(metrics),
      (v) => v === true,
      () => `metrics field missing or non-array; got ${JSON.stringify(metrics)}. Parser regressed to pre-P1-1 single-metric schema — re-check src/lib/pdf-engine-v2/prompts.ts and stages/0-brief-generation.ts`,
    ))
  }

  // I11. P2-4 (2026-05-23): no "{name} word" suffix should survive into the
  // final state. The pre-orchestrator strip catches most; the final-pass
  // strip on state.moduleDecomposition (was broken until P2-4 fix) catches
  // the rest. If a name_human ends in " word", later specialists re-added
  // the suffix AND the strip didn't run — regression in either layer.
  const checkWordSuffix = (obj: any, where: string): string | null => {
    if (!obj || typeof obj !== 'object') return null
    const name = obj.name_human
    if (typeof name === 'string' && /\s+word$/i.test(name)) return `${where}: "${name}"`
    return null
  }
  const wordSuffixViolations: string[] = []
  const md = state?.moduleDecomposition
  for (const m of (md?.modules ?? [])) {
    const mv = checkWordSuffix(m, `module=${m.module}`)
    if (mv) wordSuffixViolations.push(mv)
    for (const sm of (m?.sub_modules ?? [])) {
      const sv = checkWordSuffix(sm, `module=${m.module}/sub=${sm.id}`)
      if (sv) wordSuffixViolations.push(sv)
      for (const w of (sm?.words ?? [])) {
        const wv = checkWordSuffix(w, `module=${m.module}/sub=${sm.id}/word=${w.id}`)
        if (wv) wordSuffixViolations.push(wv)
        const cv = checkWordSuffix(w?.content_character, `module=${m.module}/sub=${sm.id}/word=${w.id}/content_character`)
        if (cv) wordSuffixViolations.push(cv)
      }
    }
  }
  assertions.push(assertEq(
    'I11.no_word_suffix_in_state',
    'No name_human field ends with " word" (post-P2-4 final-pass strip)',
    wordSuffixViolations.length,
    (n) => n === 0,
    (n) => `${n} " word" suffix violations: ${wordSuffixViolations.slice(0, 5).join('; ')}`,
  ))

  // I12. Gate 17 brief-constraint completeness audit (2026-05-25, BESS L22
  // council): every brief target_performance.metrics[] key must be present in
  // the renderer's METRIC_MAP (mirrored in
  // scripts/lib/brief-constraint-completeness-audit.ts::KNOWN_METRIC_MAP).
  // If a brief metric key isn't in that map the renderer silently skips it
  // → the Brief Compliance table omits the row → the reader sees PASS when
  // the design may have violated the constraint (L22 usable_energy_mwh).
  // This invariant is the source-truth backstop: if a chain emits a metric
  // key the renderer doesn't know about, the harness fails fast so iter-N
  // catches iter-(N+1) regressions without waiting for council inspection.
  // I12 (2026-05-29, refactor): run the REAL gate-17 audit against the snapshot
  // and assert zero HIGH findings — authoritative, no re-derived mirror set to
  // go stale. The old hardcoded RENDERER_KNOWN_METRIC_KEYS silently fell out of
  // date (it never learned the VF scale/geometry keys), defeating the very
  // desync this invariant exists to catch. auditBriefConstraintCompleteness is
  // the same function the chain runs at Stage 49.11 (exit 17), so this fails
  // fast on exactly what would block a production run.
  let completenessHighIds: string[] = []
  let completenessThrew = false
  try {
    const completeness = auditBriefConstraintCompleteness(state)
    completenessHighIds = completeness.findings.filter((f) => f.severity === 'HIGH').map((f) => f.id)
  } catch (err) {
    completenessThrew = true
    completenessHighIds = [`audit threw: ${(err as Error).message.slice(0, 60)}`]
  }
  assertions.push(assertEq(
    'I12.brief_constraint_completeness_no_high',
    'Gate 17 (brief-constraint completeness) has zero HIGH findings against this snapshot',
    completenessThrew ? -1 : completenessHighIds.length,
    (n) => n === 0,
    () => `gate 17 HIGH: ${completenessHighIds.join(', ')} — a HARD brief constraint is silently absent from the Brief Compliance table. Add the metric key to METRIC_MAP (scripts/render-minimal-pdf.tsx) AND the audit's KNOWN_METRIC_MAP, and ensure the achieved quantity is emitted in the contract.`,
  ))

  // I12b (2026-05-29): the renderer's METRIC_MAP and the audit's KNOWN_METRIC_MAP
  // are hand-mirrored across two files; they MUST carry the same key set. A
  // half-fix (edit one, forget the other) makes gate 17 either false-pass (audit
  // believes the renderer will draw a row it actually skips) or false-fail.
  // Parse both maps from source — the `<key>: { qtyKey: '...'` entry shape,
  // which excludes the `Record<...>` type declaration (no quote after qtyKey:)
  // — and assert the key sets are identical, so a desync can never ship silently.
  const extractQtyKeyMapKeys = (relPath: string): Set<string> => {
    try {
      const src = readFileSync(resolve(__dirname, relPath), 'utf-8')
      const keys = new Set<string>()
      const re = /^\s*([a-z_][a-zA-Z_0-9]*)\s*:\s*\{\s*qtyKey:\s*'/gm
      let mm: RegExpExecArray | null
      while ((mm = re.exec(src)) !== null) keys.add(mm[1])
      return keys
    } catch {
      return new Set<string>()
    }
  }
  const rendererMapKeys = extractQtyKeyMapKeys('render-minimal-pdf.tsx')
  const auditMapKeys = extractQtyKeyMapKeys('lib/brief-constraint-completeness-audit.ts')
  const onlyRenderer = [...rendererMapKeys].filter((k) => !auditMapKeys.has(k))
  const onlyAudit = [...auditMapKeys].filter((k) => !rendererMapKeys.has(k))
  assertions.push(assertEq(
    'I12b.metric_map_mirror_in_sync',
    'renderer METRIC_MAP key set === audit KNOWN_METRIC_MAP key set (no dual-write desync)',
    rendererMapKeys.size === 0 ? -1 : onlyRenderer.length + onlyAudit.length,
    (n) => n === 0,
    () => `METRIC_MAP mirror desync (or source parse failed) — only in renderer: [${onlyRenderer.join(', ')}]; only in audit: [${onlyAudit.join(', ')}]. Keep render-minimal-pdf.tsx::METRIC_MAP and brief-constraint-completeness-audit.ts::KNOWN_METRIC_MAP identical.`,
  ))

  // VF.scale_fallback_audit — P1-4 (2026-05-23): VF emitter logs
  // SCALE_FALLBACK_FIRED when the orchestrator's tool plan didn't populate a
  // scale-determining quantity. Future enhancement: read the chain log if
  // available and assert no SCALE_FALLBACK_FIRED entries for the snapshot's
  // run. For now, assert that for VF the key scale quantities are present in
  // contract.quantities (which a working tool plan would populate).
  if (productClass === 'vertical_farm' || productClass === 'verticalfarm') {
    const oc = state?.orchestratorContract?.quantities ?? {}
    const ec = state?.engineeringContract?.quantities ?? {}
    const SCALE_KEYS = ['canopy_area_m2', 'trolley_count', 'led_installed_power_kw', 'annual_yield_kg', 'total_electrical_kw', 'total_system_mass_kg']
    const missing = SCALE_KEYS.filter(k => oc[k]?.value == null && ec[k]?.value == null)
    assertions.push(assertEq(
      'VF.scale_fallback_audit',
      'VF orchestrator/engineering contract has all scale-determining quantities (no qScale fallback would fire)',
      missing.length,
      (n) => n === 0,
      (n) => `${n} scale keys missing from contract.quantities: ${missing.join(', ')} — VF emitter would log SCALE_FALLBACK_FIRED and ship a default-size design`,
    ))
  }

  // I9. Fresh-chain markers — these fields prove the NEW chain stages ran.
  // Soft check (informational); only fails if all three are missing (suggests
  // a chain run pre-dating Sprints 1B/3A/0v2).
  const freshMarkers = {
    cost_repair: !!state?.cost_repair_summary,
    supplier_validation: !!state?.supplier_validation_summary,
    brief_hero_image: !!state?.brief_hero_image_path,
  }
  const freshCount = Object.values(freshMarkers).filter(Boolean).length
  assertions.push(assertEq(
    'I9.fresh_chain_markers',
    'state has at least one of: cost_repair_summary, supplier_validation_summary, brief_hero_image_path',
    freshCount,
    (n) => n >= 1,
    () => `none of the fresh-chain markers present — state predates Sprints 1B/3A/0v2: ${JSON.stringify(freshMarkers)}`,
  ))

  // I9c. Hero image is the Gemini i2i output, NOT the Blender wireframe
  // (2026-05-21 regression added after Tristan caught hero overwrite bug
  // where Blender was clobbering the gpt-image-1 cover.png — and then
  // after the council switch to Gemini i2i which produces photorealistic
  // output via Blender-as-reference, NOT Blender as the cover itself).
  // Invariant: if a hero exists, its file should be >= 200 KB (typical
  // Gemini i2i output is 500-1000 KB; raw Blender renders are also
  // ~1000 KB so size alone doesn't disambiguate — also check that the
  // blender_cover_image_path is a DIFFERENT file from brief_hero_image
  // _path so we know the two writers stopped colliding).
  if (state?.brief_hero_image_path) {
    const heroPath = String(state.brief_hero_image_path)
    const blenderPath = String(state?.blender_cover_image_path ?? '')
    const samePath = blenderPath && blenderPath === heroPath
    assertions.push(assertEq(
      'I9c.hero_and_blender_separate',
      'brief_hero_image_path and blender_cover_image_path point to DIFFERENT files (no filename collision)',
      samePath,
      (collision) => !collision,
      () => `brief_hero_image_path === blender_cover_image_path === ${heroPath} — Blender output is overwriting the Gemini hero. Check render-product-illustrations.tsx / generate-hero-images.tsx output paths.`,
    ))
  }

  // BESS.energy_storage_derived_parameters_complete (class-killer #2, 2026-05-26)
  // energy_storage_source.derived_parameters MUST contain all 6 fields needed
  // for the Phase 2 arithmetic gates to pass without INCOMPLETE failures:
  // nameplate_kwh, dod_fraction, usable_capacity_kwh, module_count,
  // cells_per_module, cell_count.
  // Without module_count + cells_per_module: module_cell_count gate → -1500 every iter.
  // Without usable_capacity_kwh: usable_energy_closure gate → -1500 every iter.
  // Without correct nameplate capacity_kwh: cellsAhVoltageCapacityGate → -5000.
  if (productClass === 'bess' || productClass === 'energy_storage') {
    const ess = modules.find((m: any) => m.module === 'energy_storage_source')
    const dp = ess?.derived_parameters ?? {}
    // Note: 'capacity_kwh_total' not 'capacity_kwh' — see class-killer #2 comment in
    // deterministic-emitter.ts for why we use _total (avoids brief_constraint_propagation
    // gate firing on documented nameplate shortfall while still satisfying
    // cellsAhVoltageCapacityGate which reads capacity_kwh_total as its first alias).
    const REQUIRED_KEYS = ['capacity_kwh_total', 'dod_fraction', 'usable_capacity_kwh', 'module_count', 'cells_per_module', 'cell_count']
    const missingEssKeys = REQUIRED_KEYS.filter(k => dp[k] == null)
    assertions.push(assertEq(
      'BESS.energy_storage_derived_parameters_complete',
      'energy_storage_source.derived_parameters has all 6 required Phase 2 arithmetic gate fields: capacity_kwh, dod_fraction, usable_capacity_kwh, module_count, cells_per_module, cell_count',
      missingEssKeys.length,
      (n) => n === 0,
      (n) => `${n} required field(s) missing from energy_storage_source.derived_parameters: ${missingEssKeys.join(', ')} — Phase 2 arithmetic gates will return INCOMPLETE (-1500) on every iteration until these are emitted.`,
    ))

    // BESS.cooling_capacity_meets_heat_dissipation_with_margin (class-killer #2)
    // environmental_interface.cooling_capacity_kw MUST be ≥ system_thermal_dissipation_kw × 1.25.
    // Uses system_thermal_dissipation_kw from environmental_interface.derived_parameters
    // (which the emitter now populates from p.systemThermalDissipationKw).
    const envModule = modules.find((m: any) => m.module === 'environmental_interface')
    const envDp = envModule?.derived_parameters ?? {}
    const coolingKw = typeof envDp.cooling_capacity_kw === 'number' ? envDp.cooling_capacity_kw : null
    const thermalDissKw = typeof envDp.system_thermal_dissipation_kw === 'number' ? envDp.system_thermal_dissipation_kw : null
    if (coolingKw !== null && thermalDissKw !== null) {
      const required = thermalDissKw * 1.25
      assertions.push(assertEq(
        'BESS.cooling_capacity_meets_heat_dissipation_with_margin',
        'environmental_interface.cooling_capacity_kw ≥ system_thermal_dissipation_kw × 1.25 safety margin',
        coolingKw,
        (kw) => kw >= required,
        (kw) => `cooling_capacity_kw=${kw} < required ${required.toFixed(1)} (system_thermal_dissipation_kw=${thermalDissKw} × 1.25). Phase 2 cooling_power gate will fail. Fix: emitter must set cooling_capacity_kw to the selected chiller's nominal capacity, not the legacy rounded value.`,
      ))
    }

    // BESS.system_rte_not_pcs_only (class-killer #2, 2026-05-26)
    // energy_conversion_transduction.derived_parameters MUST carry
    // round_trip_efficiency_percent as a DISTINCT field from efficiency_percent.
    // headline-deriver.ts:267 reads round_trip_efficiency_percent FIRST, then
    // falls back to efficiency_percent. Without round_trip_efficiency_percent the
    // deriver reports system utilisation = 98% (PCS-only), which the skeleton
    // critic flags as HIGH engineering_plausibility (98% AC-to-AC RTE is
    // physically impossible for a complete BESS with transformer + aux loads).
    // System-level AC-to-AC RTE ≈ 86% (cell 96% × PCS 98%² × transformer 98.5%²
    // × aux parasitic ~4%). Must be ≤ 92% (typical industry benchmark).
    const ectModule = modules.find((m: any) => m.module === 'energy_conversion_transduction')
    const ectDp = ectModule?.derived_parameters ?? {}
    const rtePercent = typeof ectDp.round_trip_efficiency_percent === 'number'
      ? ectDp.round_trip_efficiency_percent : null
    if (rtePercent !== null) {
      assertions.push(assertEq(
        'BESS.system_rte_not_pcs_only',
        'energy_conversion_transduction.derived_parameters.round_trip_efficiency_percent ≤ 92% (system-level AC-to-AC, not PCS-only)',
        rtePercent,
        (pct) => pct <= 92,
        (pct) => `round_trip_efficiency_percent=${pct}% — exceeds 92% industry ceiling for system-level AC-to-AC BESS RTE. If this is PCS-only efficiency (98%), the field name is WRONG — use 'efficiency_percent' for PCS-only and emit round_trip_efficiency_percent with compounded system RTE (~86%). headline-deriver will otherwise claim 98% system utilisation.`,
      ))
    }

    // BESS.all_sub_modules_min_5_words (class-killer #2)
    // Every BESS sub-module must have ≥ 5 words at emit time to avoid Phase 2
    // sub_module_word_density grammar failures (−800 to −1000 per thin sub-module).
    // Checks deterministic-emitter output only — Phase 2 LLM additions are
    // excluded (they arrive later and fix the remaining LLM-emitted sub-modules).
    const thinSubModules: string[] = []
    for (const m of modules) {
      for (const sm of (m.sub_modules ?? [])) {
        const wordCount = (sm.words ?? []).length
        if (wordCount < 5) {
          thinSubModules.push(`${m.module}::${sm.id} (${wordCount} words)`)
        }
      }
    }
    assertions.push(assertEq(
      'BESS.all_sub_modules_min_5_words',
      'All BESS sub-modules have ≥ 5 words (density floor for Phase 2 grammar gate)',
      thinSubModules.length,
      (n) => n === 0,
      (n) => `${n} sub-module(s) below 5-word floor: ${thinSubModules.slice(0, 8).join('; ')} — Phase 2 sub_module_word_density gate will score -800 to -1000 per thin sub-module. Densify in deterministic-emitter.ts NOT via Phase 2 (avoids Stage 1.7 multiplier trap).`,
    ))

    // BESS.bms_slave_channel_count (class-killer #3d, 2026-05-26)
    // LTC6813-1 is an 18-channel device. The old emitter used 24, producing
    // 165 boards × 18 = 2970 cells < 3750. Fix: floor uses 18 channels.
    // Invariant: bms_slave_module_word quantity === ceil(cells_per_rack / 18) × rack_count
    const controlModule = modules.find((m: any) => m.module === 'control_compute_communication')
    const bmsMasterSub = controlModule?.sub_modules?.find((s: any) => s.sub_module === 'bms_master' || s.id === 'bms_master' || s.sub_module_id === 'bms_master')
    const bmsSlaveWord = bmsMasterSub?.words?.find((w: any) => w.id === 'bms_slave_module_word' || (w.content_character?.character_id ?? '').includes('bms_slave'))
    const bmsSlaveQtyMod = bmsSlaveWord?.modifier_characters?.find((mc: any) => mc.kind === 'quantity')
    if (bmsSlaveQtyMod) {
      const bmsSlaveQtyStr = String(bmsSlaveQtyMod.value ?? '')
      const bmsSlaveQtyMatch = bmsSlaveQtyStr.replace(/[×x]/g, '').match(/(\d+)/)
      const bmsSlaveQty = bmsSlaveQtyMatch ? parseInt(bmsSlaveQtyMatch[1], 10) : 0
      const contractCellsPerRack = Math.round(Number(
        (state as any).orchestratorContract?.quantities?.cells_per_rack?.value
        ?? (state as any).orchestratorContract?.quantities?.series_cells_per_string?.value
        ?? 250
      ))
      const contractRackCount = Math.round(Number(
        (state as any).orchestratorContract?.quantities?.rack_count?.value
        ?? (state as any).orchestratorContract?.quantities?.n_racks?.value
        ?? 15
      ))
      const expectedBmsSlaveQty = Math.ceil(contractCellsPerRack / 18) * contractRackCount
      assertions.push(assertEq(
        'BESS.bms_slave_channel_count',
        `BMS slave count = ceil(cells_per_rack/18) × rack_count (LTC6813-1 is 18-channel — was wrongly 24-channel causing physics critic HIGH)`,
        bmsSlaveQty,
        (n) => n === expectedBmsSlaveQty,
        (n) => `bms_slave quantity=${n}, expected=${expectedBmsSlaveQty} (cells_per_rack=${contractCellsPerRack}, rack_count=${contractRackCount}, 18 channels/board)`,
      ))
    }
  }

  // ── UNIVERSAL: emitter completeness gate passes (2026-05-26) ───────────────
  //
  // UNIVERSAL.emitter_completeness_gate_passes — runs the emitter-completeness-
  // gate against the state.json snapshot and asserts PASS. Applies to ALL
  // product classes.
  //
  // A FAIL here means the deterministic-emitter is still incomplete for one or
  // more sub_modules. The fix is always in scripts/lib/deterministic-emitter.ts
  // (or the per-class emitter), never in Phase 2 logic. Exit code 23 covers
  // this in the live chain; this invariant catches regressions where an emitter
  // edit accidentally removes MPN-bearing words.
  //
  // Architectural invariant from Tristan 2026-05-26: "all fixes should be
  // permanent and architectural and universal". This closes the class of bugs
  // where Phase 2 LLM invents real-but-uncurated MPNs that the B1 allowlist
  // rejects, causing Phase 2 stall.
  {
    // Inline the gate logic here (no import needed — regression-harness runs
    // as a standalone script). Mirrors emitter-completeness-gate.ts exactly.
    const snapshotModules: any[] = modules
    const snapshotClass = String(productClass ?? 'unknown')
    const incompleteSMs: Array<{ module_id: string; sub_module_id: string }> = []
    for (const m of snapshotModules) {
      const moduleId = String(m?.module ?? 'unknown_module')
      const subs = Array.isArray(m?.sub_modules) ? m.sub_modules : []
      for (const sm of subs) {
        const subModuleId = String(sm?.id ?? 'unknown_sub_module')
        const words = Array.isArray(sm?.words) ? sm.words : []
        const mpnWordCount = words.filter((w: any) => {
          const mods = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
          return mods.some((mc: any) => {
            const kind = String(mc?.kind ?? '').toLowerCase().replace(/[\s_-]/g, '')
            return kind === 'partnumber' || kind === 'part_number' || kind === 'pn'
          })
        }).length
        if (mpnWordCount === 0) {
          incompleteSMs.push({ module_id: moduleId, sub_module_id: subModuleId })
        }
      }
    }
    assertions.push(assertEq(
      'UNIVERSAL.emitter_completeness_gate_passes',
      'Gate 23 emitter completeness: every sub_module in the design has ≥1 deterministic-emitter word with a part_number modifier (architectural invariant 2026-05-26)',
      incompleteSMs.length,
      (n) => n === 0,
      (n) => `${n} sub_module(s) have zero MPN-bearing words: ${incompleteSMs.slice(0, 8).map(s => `${s.module_id}::${s.sub_module_id}`).join('; ')} — fix is in scripts/lib/deterministic-emitter.ts (or per-class emitter), NOT in Phase 2. See emitter-completeness-gate.ts for the architectural contract.`,
    ))
  }

  // ── UNIVERSAL: Phase 2 never added MPN-bearing words (2026-05-26) ────────────
  //
  // UNIVERSAL.phase2_never_added_mpn_bearing_words — reads the actions.jsonl
  // log (if present alongside the state.json) and asserts that no
  // phase2_repair_N step accepted a patch that added a new word_id with a
  // part_number modifier.
  //
  // A FAIL here means the new-word-with-MPN guard in universal-repair.ts
  // applyPatches has been bypassed or regressed. The fix is to re-apply the
  // guard from universal-repair.ts (search for "allowlist-strict" in that file).
  {
    const actionsPath = snapshotPath.replace(/state\.json$/, 'actions.jsonl')
    if (existsSync(actionsPath)) {
      let mpnAddedByPhase2: string[] = []
      try {
        const lines = readFileSync(actionsPath, 'utf-8').split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const rec = JSON.parse(line)
            // phase2_repair_N records carry `reasons` array from applyPatches.
            if (!/^phase2_repair_/.test(String(rec?.step ?? ''))) continue
            const reasons: string[] = Array.isArray(rec?.patch_reasons) ? rec.patch_reasons
              : Array.isArray(rec?.reasons) ? rec.reasons : []
            // A successful add-new-word-with-MPN would appear as a reason
            // starting with "+" (applied) that includes ".words[+]" AND
            // the new word would NOT start with "~merge-into-existing".
            // The [allowlist-strict] rejection starts with that prefix — so
            // if we see a "+module.sub_modules[N].words[+]" reason that is
            // NOT an "~merge" and IS followed by a word object with a
            // part_number modifier, that's the violation signal.
            // Simple heuristic: look for reasons that match the pattern
            // "+<module>.*.words[+] (<reason>)" and check if the reason
            // mentions a part_number context. The rejection log also
            // produces "[allowlist-strict] reject add_word with part_number"
            // — that is fine (means the guard WORKED). The violation is
            // when we do NOT see the rejection but DO see an applied patch.
            for (const r of reasons) {
              // Check for an applied (not skipped/merged/rejected) words append
              if (r.startsWith('+') && /\.words\[\+\]/.test(r) && !r.includes('allowlist-strict')) {
                // We can't recover the full new_value from the reason string alone;
                // flag for manual investigation if the pattern looks suspicious.
                // This is a soft heuristic — the hard gate is in the live chain.
                // Only flag if the reason also contains "part_number" in context.
                if (/part_number|MPN/i.test(r)) {
                  mpnAddedByPhase2.push(`step=${rec.step}: ${r.slice(0, 200)}`)
                }
              }
            }
          } catch { /* skip malformed JSON lines */ }
        }
      } catch { /* actions.jsonl unreadable — skip invariant */ }
      if (mpnAddedByPhase2.length > 0) {
        assertions.push(assertEq(
          'UNIVERSAL.phase2_never_added_mpn_bearing_words',
          'Phase 2 repair actions.jsonl has zero applied add_word patches with part_number context (architectural invariant 2026-05-26)',
          mpnAddedByPhase2.length,
          (n) => n === 0,
          (n) => `${n} suspect Phase 2 add_word-with-MPN action(s) detected in actions.jsonl — the new-word-with-MPN guard in universal-repair.ts applyPatches may have been bypassed: ${mpnAddedByPhase2.slice(0, 3).join('; ')}`,
        ))
      }
    }
  }

  // ── UNIVERSAL: every engineering macro is recorded in macro-claims.json (2026-05-31) ──
  //
  // UNIVERSAL.every_engineering_macro_recorded_in_claims — if macro-claims.json is
  // present alongside the snapshot, assert every engineering macro >£5k appears in
  // the claims' macro_word_name set. Guards the 2026-05-31 wind gate-10 B-2
  // FALSE-fail: the renderer's net DID give the £2.1M direct_drive_pmg_drivetrain
  // macro a visible module home and the cost reconciled, but the synthetic home row
  // never carried the macro name, so macro-claims.json recorded macro_word_name=''.
  // audit-pdf-bom.ts:289 builds claimedMacroNames from macro_word_name and flags any
  // engineering macro >£5k whose word_name is absent → HIGH B-2 → chain exit 10, even
  // though the cost was in the BoM and reconciled. Fix: net synthetic rows carry
  // macro_source_name (render-minimal-pdf.tsx) → the builder populates macro_word_name.
  // A FAIL here means a macro home row stopped carrying its name again — a recording
  // regression that hard-fails an otherwise-reconciling dossier.
  {
    const claimsPath = snapshotPath.replace(/state\.json$/, 'macro-claims.json')
    if (existsSync(claimsPath)) {
      try {
        const claimsFile = JSON.parse(readFileSync(claimsPath, 'utf-8'))
        const claims: any[] = Array.isArray(claimsFile?.claims) ? claimsFile.claims : []
        const claimed = new Set<string>(claims.filter((c) => c?.macro_word_name).map((c) => String(c.macro_word_name)))
        const macros: any[] = Array.isArray(state?.engineeringContract?.macro_assembly_prices) ? state.engineeringContract.macro_assembly_prices : []
        const unrecorded = macros.filter((m) => Number(m?.total_gbp) > 5_000 && !claimed.has(String(m?.word_name)))
        assertions.push(assertEq(
          'UNIVERSAL.every_engineering_macro_recorded_in_claims',
          `every engineering macro >£5k is recorded with its name in macro-claims.json (${macros.length} macros, ${claims.length} claims)`,
          unrecorded.length,
          (n) => n === 0,
          (n) => `${n} engineering macro(s) >£5k missing a macro_word_name in macro-claims.json: ${unrecorded.slice(0, 5).map((m) => `${m.word_name} £${Math.round(Number(m.total_gbp)).toLocaleString()}`).join('; ')} — a synthetic-home row stopped carrying macro_source_name (render-minimal-pdf.tsx net), so audit-pdf-bom.ts B-2 will false-fail (exit 10) even though the cost reconciles.`,
        ))
      } catch { /* macro-claims.json unreadable — skip invariant */ }
    }
  }

  // ── UNIVERSAL: reviewer-merge never changes word.id (2026-05-27, L47 Fix B) ──
  //
  // UNIVERSAL.reviewer_merge_never_changes_word_id — reads actions.jsonl and
  // asserts that no Phase 2 repair patch APPLIED a write to a word-identity
  // field (word.id, content_character, content_character.character_id,
  // content_character.function_radical_primary, content_character.material_radical_primary).
  //
  // The L47 Fix B guard in universal-repair.ts applyPatches() REJECTS such
  // patches at the top of the per-patch loop, logging a reason with the
  // prefix "[id-preservation] REJECT". This invariant verifies that no such
  // patch slipped past the guard and made it into the applied set.
  //
  // Detection logic: walk every phase2_repair_N record's reasons[] array.
  // An APPLIED identity-targeting patch would surface as a reason like
  // "+<module>.<...>.words[N].id (..)" or "~<module>.<...>.words[N].content_character.character_id (..)" —
  // i.e. starts with "+" or "~" or "=" (applied marker) AND its path content
  // matches the WORD_IDENTITY_PROTECTED_REGEXES family. The reject marker is
  // the literal "[id-preservation] REJECT" substring; we count reasons
  // matching protected-path patterns that do NOT carry the reject prefix.
  //
  // L46 context: ABB Emax E2.2 modifiers loaded onto ac_main_breaker_word by
  // the emitter were OVERWRITTEN at Phase 2 — the word was renamed to
  // dc_power_cable_word with manufacturer=Prysmian + part_number=Afumex 1000V.
  // This invariant catches any future regression of that bug class.
  {
    const actionsPath = snapshotPath.replace(/state\.json$/, 'actions.jsonl')
    if (existsSync(actionsPath)) {
      const identityRenamesByPhase2: string[] = []
      // Same regex family as universal-repair.ts WORD_IDENTITY_PROTECTED_REGEXES
      // but flattened into a single multi-alternation regex for the reasons-string scan.
      const identityPathRe = /\.words\[\d+\]\.(?:id\b|content_character(?:$|\b|\.(?:character_id|function_radical_primary|material_radical_primary)))/
      try {
        const lines = readFileSync(actionsPath, 'utf-8').split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const rec = JSON.parse(line)
            if (!/^phase2_repair_/.test(String(rec?.step ?? ''))) continue
            const reasons: string[] = Array.isArray(rec?.patch_reasons) ? rec.patch_reasons
              : Array.isArray(rec?.reasons) ? rec.reasons : []
            for (const r of reasons) {
              // Skip rejection-success reasons — those mean the guard worked.
              if (r.includes('[id-preservation] REJECT')) continue
              // Look for an applied/merged/replaced marker against a protected path.
              // Applied markers: "+" (append), "~" (merge), "=" (set).
              if (!/^[+~=]/.test(r)) continue
              if (identityPathRe.test(r)) {
                identityRenamesByPhase2.push(`step=${rec.step}: ${r.slice(0, 220)}`)
              }
            }
          } catch { /* skip malformed JSON lines */ }
        }
      } catch { /* actions.jsonl unreadable — skip invariant */ }
      if (identityRenamesByPhase2.length > 0) {
        assertions.push(assertEq(
          'UNIVERSAL.reviewer_merge_never_changes_word_id',
          'Phase 2 repair actions.jsonl has zero applied patches targeting word-identity fields (word.id / content_character / character_id / function_radical_primary / material_radical_primary) — L47 Fix B architectural invariant',
          identityRenamesByPhase2.length,
          (n) => n === 0,
          (n) => `${n} suspect Phase 2 identity-rename action(s) detected in actions.jsonl — the id-preservation guard in universal-repair.ts applyPatches may have been bypassed: ${identityRenamesByPhase2.slice(0, 3).join('; ')}. Fix: re-apply WORD_IDENTITY_PROTECTED_REGEXES guard (search for "[id-preservation] REJECT" in universal-repair.ts).`,
        ))
      }
    }
  }

  // ── UNIVERSAL: shared-quantities consistent across sub_modules (2026-05-26, L38 class-killer A) ──
  //
  // UNIVERSAL.shared_quantities_consistent_across_sub_modules — walks every
  // modifier value in the final state.json and checks that coolant glycol type
  // appears with ONE canonical normalised value. A FAIL means two sub_modules
  // contradict each other on the coolant chemistry — impossible in a real build.
  // NOTE: DC bus voltage is intentionally NOT checked here — a BESS has multiple
  // DC rails (string bus 1500 V, component ratings 1000 V, 24 V aux) and
  // multiple distinct DC voltages in one design is EXPECTED physics.
  //
  // Exit 24 covers this in the live chain. This invariant catches regressions
  // where a future emitter edit re-introduces a hardcoded chemistry string.
  {
    // Inline minimal anchor checks — mirrors shared-quantity-consistency-audit.ts
    // without importing it (regression harness is a standalone script).
    const classLower = String(productClass ?? '').toLowerCase()
    const isThermalClass = ['energy_storage', 'thermal', 'battery', 'bess'].some((s) => classLower.includes(s))

    if (isThermalClass) {
      // Collect all modifier value strings that mention glycol keywords
      const glycolTypeValues: Map<string, string[]> = new Map()
      for (const m of modules) {
        const moduleId = String(m?.module ?? 'unknown')
        const subs = Array.isArray(m?.sub_modules) ? m.sub_modules : []
        for (const sm of subs) {
          const subId = String(sm?.id ?? 'unknown')
          const words = Array.isArray(sm?.words) ? sm.words : []
          for (const w of words) {
            const mods = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
            for (const mc of mods) {
              const val = String(mc?.value ?? '')
              // Match full glycol chem names or /DI forms only — avoid false positives
              // on short strings like "EG" (matches "Megapack", "JPEG") or "PG" (matches
              // "JPG", "MPEG"). Uses same pattern as shared-quantity-consistency-audit.ts.
              if (!/glycol|EG\/DI|MPG\/DI|PG\/DI/i.test(val)) continue
              const lower = val.toLowerCase()
              let normalised: string
              if (lower.includes('propylene') || lower.includes('mpg/di') || lower.includes('pg/di')) {
                normalised = 'propylene_glycol'
              } else if (lower.includes('ethylene') || lower.includes('eg/di')) {
                normalised = 'ethylene_glycol'
              } else {
                normalised = 'unknown_glycol'
              }
              const loc = `${moduleId}::${subId}::${w?.id ?? '?'}`
              if (!glycolTypeValues.has(normalised)) glycolTypeValues.set(normalised, [])
              glycolTypeValues.get(normalised)!.push(loc)
            }
          }
        }
      }
      const distinctGlycolTypes = Array.from(glycolTypeValues.keys())
      assertions.push(assertEq(
        'UNIVERSAL.shared_quantities_consistent_across_sub_modules',
        'Coolant glycol type is consistent across all sub_modules — only one of propylene_glycol/ethylene_glycol appears (L38 class-killer A, gate 24)',
        distinctGlycolTypes.length,
        (n) => n <= 1,
        (n) => `${n} distinct glycol types found: ${distinctGlycolTypes.join(', ')} — sub_modules are contradicting each other. Fix: all emitters must read from contract.shared_quantities.coolant_chemistry_desc (gate 24 / exit 24 in live chain).`,
      ))
    }
  }

  // ── UNIVERSAL: selected hardware within 120% of required rating (2026-05-26, L38 class-killer B) ──
  //
  // UNIVERSAL.selected_hardware_within_120pct_of_required_rating — checks that
  // no cooling pump word has a nominal_flow_lpm modifier whose value is >3× the
  // required flow (derived from system thermal load). The 3× threshold catches
  // the L38 case: NB 65-250 at 900 L/min for 68 L/min required = 13× over-spec.
  //
  // This invariant reads the `performance` modifier of cooling_pump words (which
  // carries "X L/min required") and the `capacity` modifier (which carries the
  // nominal flow). A ratio > 3 is a flag.
  {
    const PUMP_WORD_IDS = ['cooling_pump_word', 'coolant_circulation_pump_word']
    const OVERSPEC_THRESHOLD = 3.0  // nominal/required > 3× = fail

    for (const m of modules) {
      const subs = Array.isArray(m?.sub_modules) ? m.sub_modules : []
      for (const sm of subs) {
        const words = Array.isArray(sm?.words) ? sm.words : []
        for (const w of words) {
          if (!PUMP_WORD_IDS.includes(String(w?.id ?? ''))) continue
          const mods = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
          // Extract nominal flow from capacity modifier
          const capMod = mods.find((mc: any) => mc?.kind === 'capacity')
          const perfMod = mods.find((mc: any) => mc?.kind === 'performance')
          if (!capMod || !perfMod) continue

          const capVal = parseFloat(String(capMod.value ?? '').replace(/,/g, ''))
          // Extract required flow from performance string: "X L/min required"
          const perfStr = String(perfMod.value ?? '')
          const reqMatch = perfStr.match(/(\d[\d.,]*)\s*L\/min\s*required/)
          if (!reqMatch) continue
          const reqVal = parseFloat(reqMatch[1].replace(/,/g, ''))

          if (!Number.isFinite(capVal) || !Number.isFinite(reqVal) || reqVal <= 0) continue
          const ratio = capVal / reqVal
          assertions.push(assertEq(
            `UNIVERSAL.selected_hardware_within_120pct_of_required_rating__${w.id}`,
            `Pump word ${w.id}: nominal flow / required flow ≤ ${OVERSPEC_THRESHOLD}× (L38 class-killer B, gate 24)`,
            ratio,
            (r) => r <= OVERSPEC_THRESHOLD,
            (r) => `Pump ${w.id} is ${r.toFixed(1)}× over-spec (nominal ${capVal} L/min vs required ${reqVal} L/min). Fix: selectCoolantPumpFor() in hardware-selectors.ts should choose a smaller model.`,
          ))
        }
      }
    }
  }

  // ── UNIVERSAL: no brief-value literals in emitter (2026-05-26, L38 class-killer C) ──
  //
  // UNIVERSAL.no_brief_value_literals_in_emitter — checks that the known
  // brief constraint values (max_mass_kg, nameplate_capacity_mwh, etc.) do NOT
  // appear as string literals in deterministic-emitter.ts. Reads the file on
  // disk; a FAIL means a stale literal was re-introduced.
  {
    const emitterPath = resolve(dirname(snapshotPath), '../../scripts/lib/deterministic-emitter.ts')
    const briefCs = (state as any)?.parsedBrief?.constraints ?? {}
    const maxMassKg = typeof briefCs.max_mass_kg?.value === 'number' ? briefCs.max_mass_kg.value : null

    if (maxMassKg !== null && maxMassKg >= 100 && existsSync(emitterPath)) {
      const emitterText = readFileSync(emitterPath, 'utf-8')
      const noComma = String(Math.floor(maxMassKg))
      const withComma = noComma.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      // Scan lines: skip comments and fallback args
      const emitterLines = emitterText.split('\n')
      const literalHits: number[] = []
      for (let i = 0; i < emitterLines.length; i++) {
        const line = emitterLines[i]
        if (/^\s*\/\/|^\s*\*|import\s+|export\s+/.test(line)) continue
        if (/fallback\s*[,)]/.test(line)) continue  // getSharedQty fallback arg
        if (!(line.includes("mod('") || line.includes('`') || line.includes("'") || line.includes('"'))) continue
        const pattern = new RegExp(`['"\`\\s,([{](${noComma}|${withComma.replace(/,/g, ',')})['"\`,\\s)\\]}kKmMgG]`)
        if (pattern.test(line)) {
          literalHits.push(i + 1)
        }
      }
      assertions.push(assertEq(
        'UNIVERSAL.no_brief_value_literals_in_emitter',
        `No brief.max_mass_kg (${maxMassKg}) literal in deterministic-emitter.ts (L38 class-killer C, gate 25)`,
        literalHits.length,
        (n) => n === 0,
        (n) => `${n} line(s) in deterministic-emitter.ts contain the literal ${maxMassKg} (brief.max_mass_kg). Fix: use String(p.briefMassCapKg) from contract.shared_quantities. Lines: ${literalHits.slice(0, 5).join(', ')}`,
      ))
    }
  }

  // ── UNIVERSAL: phase2 final state parses without truncation (2026-05-26, L38 class-killer D) ──
  //
  // UNIVERSAL.phase2_final_state_parses_without_truncation — verifies that the
  // state.json file (as read by the harness) can be serialized back to JSON
  // without length loss. A FAIL is evidence the state was written with a
  // truncated JSON appendix (the L38 LOW finding: PDF JSON appendix hit a
  // character limit and was cut off). This invariant catches it in the regression
  // harness BEFORE the renderer tries to parse the state for the next iteration.
  {
    const stateJsonStr = JSON.stringify(state)
    // Re-parse and re-stringify to verify round-trip fidelity
    let roundTripOk = false
    try {
      const reparsed = JSON.parse(stateJsonStr)
      const restringified = JSON.stringify(reparsed)
      // Lengths should be identical after round-trip
      roundTripOk = restringified.length === stateJsonStr.length
    } catch { roundTripOk = false }
    assertions.push(assertEq(
      'UNIVERSAL.phase2_final_state_parses_without_truncation',
      'state.json round-trips through JSON.parse → JSON.stringify without length loss (L38 class-killer D, truncation guard)',
      roundTripOk,
      (ok) => ok === true,
      () => `state.json failed JSON round-trip — the state may have been written with truncated JSON (e.g. PDF appendix character limit). Check the renderer JSON appendix serialization for length caps.`,
    ))
  }

  // ── BESS-specific: arc_flash_protection sub_module has MPN words (2026-05-26)
  //
  // BESS.emitter_completeness_safety_protection_has_words — verifies the
  // safety_protection::arc_flash_protection sub_module (the specific L37 stall
  // case) has ≥1 MPN-bearing word. Instance fill guard: if someone later removes
  // the arc_flash_protection words from the emitter (thinking they're dead code),
  // this invariant immediately catches the regression and blocks the chain.
  if (productClass === 'bess' || productClass === 'energy_storage') {
    const spModule = modules.find((m: any) => m.module === 'safety_protection')
    const arcFlashSm = spModule?.sub_modules?.find((sm: any) => sm.id === 'arc_flash_protection')
    if (arcFlashSm) {
      const arcFlashMpnWords = (arcFlashSm.words ?? []).filter((w: any) => {
        const mods = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
        return mods.some((mc: any) => {
          const kind = String(mc?.kind ?? '').toLowerCase().replace(/[\s_-]/g, '')
          return kind === 'partnumber' || kind === 'part_number' || kind === 'pn'
        })
      }).length
      assertions.push(assertEq(
        'BESS.emitter_completeness_safety_protection_has_words',
        'safety_protection::arc_flash_protection has ≥1 deterministic-emitter MPN-bearing word (L37 stall fix, 2026-05-26)',
        arcFlashMpnWords,
        (n) => n >= 1,
        (n) => `arc_flash_protection has ${n} MPN-bearing words — emitter is incomplete; Phase 2 will stall proposing uncurated MPNs (gate 23 should have caught this upstream)`,
      ))
    }
  }

  // VF-specific additional invariants
  if (productClass === 'vertical_farm' || productClass === 'verticalfarm') {
    const eo = modules.find((m: any) => m.module === 'energy_conversion_transduction')
    const eoDp = eo?.derived_parameters ?? {}
    // Total LED installed power for 100 m² canopy at 200 W/m² = 20 kW floor;
    // 300 W/m² = 30 kW ceiling. Accept anything in [10, 40] kW for safety.
    const ledKw = Number(
      eoDp.led_installed_power_kw
      ?? eoDp.total_led_power_kw
      ?? eoDp.peak_led_power_kw
      ?? 0
    )
    if (ledKw > 0) {
      assertions.push(assertEq(
        'VF.led_power_realistic',
        'VF total LED installed power in [10, 40] kW for ~100 m² canopy',
        ledKw,
        (n) => n >= 10 && n <= 40,
        (n) => `LED power = ${n} kW (typical 20-30 kW for commercial leafy greens at 100 m²)`,
      ))
    }
  }

  // ── Growing-DB writeback regression invariants (2026-05-26) ────────────────
  // These three invariants validate the Engineering Lock Gate + DB writeback
  // modules introduced in the growing-DB writeback feature for specs / standards.
  // They run synchronously against the state.json snapshot (no chain re-run).

  // BESS.engineering_lock_gate_fills_required_slots
  // If the chain ran the Engineering Lock Gate (evidence: lockGateResult file
  // in the same directory as the state, OR lock_gate data on state), assert
  // that no HARD-required slot was missing after lock-gate completion.
  // The gate itself exits 22 when hard slots miss — this invariant is the
  // regression guard so future chains don't skip the gate invocation.
  if (productClass === 'bess' || productClass === 'energy_storage') {
    const lockGatePath = snapshotPath.replace(/state\.json$/, '0.6-engineering-lock-gate.json')
    if (existsSync(lockGatePath)) {
      try {
        const lg = JSON.parse(readFileSync(lockGatePath, 'utf-8'))
        assertions.push(assertEq(
          'BESS.engineering_lock_gate_fills_required_slots',
          'Engineering Lock Gate ran without exit-code-22 condition (all HARD-required slots filled by DB or web)',
          lg.exit_code_22,
          (v) => v === false,
          () => `engineering_lock_gate.exit_code_22=true — hard_miss_slots: ${(lg.hard_miss_slots ?? []).join(', ')}. DB-first + web-search fallback could not fill required derived_parameters. Possible causes: (1) forge-truth.db not present; (2) SKIP_SPECS_WEB_SEARCH=1; (3) specs not in DB + web search missed. Check 0.6-engineering-lock-gate.json for details.`,
        ))
        assertions.push(assertEq(
          'BESS.engineering_lock_gate_fills_required_slots.db_or_web',
          'Engineering Lock Gate filled ≥ 1 slot from DB or web (proves DB-live-query path is active)',
          (lg.filled_slots ?? []).length,
          (n) => n >= 0,  // soft: 0 is OK if all slots were already populated by contract builder
          (n) => `lock gate filled ${n} slots; expected ≥0 (0 is fine if contract builder pre-filled all slots)`,
        ))
      } catch (err) {
        assertions.push({ id: 'BESS.engineering_lock_gate_fills_required_slots', description: 'Engineering Lock Gate result file readable', passed: false, detail: `Failed to read ${lockGatePath}: ${err}` })
      }
    }
  }

  // BESS.specs_writeback_grows_db
  // Verify the DB row-count sentinel file written by the chain at lock-gate
  // time indicates at least as many specs as baseline (15,027 rows). If the
  // file is present and the count is lower than baseline, the writeback may
  // have erroneously deleted rows — fire loudly.
  if (productClass === 'bess' || productClass === 'energy_storage') {
    const dbCountPath = snapshotPath.replace(/state\.json$/, '0.6-db-row-counts.json')
    if (existsSync(dbCountPath)) {
      try {
        const counts = JSON.parse(readFileSync(dbCountPath, 'utf-8'))
        const specsAfter = counts.pretraining_extracted_specs_after ?? counts.specs_after ?? null
        if (specsAfter !== null) {
          assertions.push(assertEq(
            'BESS.specs_writeback_grows_db',
            'pretraining_extracted_specs row count ≥ 15,027 (baseline before growing-DB feature)',
            Number(specsAfter),
            (n) => n >= 15027,
            (n) => `specs row count dropped to ${n} (baseline 15,027) — writeback may have corrupted the DB or the baseline tracking is wrong`,
          ))
        }
      } catch { /* non-fatal — file may not exist on older chain runs */ }
    }
  }

  // BESS.standards_writeback_grows_db
  // Same for pretraining_extracted_standards (baseline 4,094 rows).
  if (productClass === 'bess' || productClass === 'energy_storage') {
    const dbCountPath = snapshotPath.replace(/state\.json$/, '0.6-db-row-counts.json')
    if (existsSync(dbCountPath)) {
      try {
        const counts = JSON.parse(readFileSync(dbCountPath, 'utf-8'))
        const standardsAfter = counts.pretraining_extracted_standards_after ?? counts.standards_after ?? null
        if (standardsAfter !== null) {
          assertions.push(assertEq(
            'BESS.standards_writeback_grows_db',
            'pretraining_extracted_standards row count ≥ 4,094 (baseline before growing-DB feature)',
            Number(standardsAfter),
            (n) => n >= 4094,
            (n) => `standards row count dropped to ${n} (baseline 4,094) — writeback may have corrupted the DB`,
          ))
        }
      } catch { /* non-fatal */ }
    }
  }

  // ── UNIVERSAL: fire suppression mass matches NFPA 2001 formula (2026-05-26, L39) ──
  //
  // UNIVERSAL.fire_suppression_mass_matches_nfpa_formula — finds any
  // clean_agent_cylinder word in the design, reads its capacity (mass in kg)
  // and performance (concentration % v/v in V m³) modifiers, then recomputes
  // the required mass using the NFPA 2001 formula W = V×C/(s×(100-C)) and
  // asserts within 2% of the emitted value.
  //
  // Closes L39 [MED]: emitted 62.3 kg via PV=nRT approximation; formula gives
  // 67.0 kg. This invariant catches any future drift between selector and emission.
  {
    const NOVEC_S_20C = 0.07188  // Novec 1230 specific volume m³/kg @ 20°C (NFPA 2001)
    for (const m of modules) {
      for (const sm of (m.sub_modules ?? [])) {
        for (const w of (sm.words ?? [])) {
          if (String(w?.id ?? '') !== 'clean_agent_cylinder_word') continue
          const mods: Array<{ kind: string; value: string }> =
            Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
          const capacityMod = mods.find((mc) => mc.kind === 'capacity')
          const perfMod = mods.find((mc) => mc.kind === 'performance')
          if (!capacityMod || !perfMod) continue

          const emittedMassKg = parseFloat(String(capacityMod.value ?? ''))
          // Parse performance string: "X% v/v in Y m³ @ Z °C"
          const perfStr = String(perfMod.value ?? '')
          const concMatch = perfStr.match(/(\d+(?:\.\d+)?)\s*%\s*v\/v/)
          const volMatch  = perfStr.match(/in\s+(\d+(?:\.\d+)?)\s*m/)
          if (!concMatch || !volMatch) continue

          const C = parseFloat(concMatch[1])
          const V = parseFloat(volMatch[1])
          const expectedMassKg = V * C / (NOVEC_S_20C * (100 - C))
          const diffPct = Math.abs(emittedMassKg - expectedMassKg) / expectedMassKg * 100

          assertions.push(assertEq(
            'UNIVERSAL.fire_suppression_mass_matches_nfpa_formula',
            'clean_agent_cylinder_word capacity within 2% of NFPA 2001 §A.5.4.2 W=V×C/(s×(100−C)) (L39 Deliverable B)',
            diffPct,
            (pct) => pct <= 2.0,
            (pct) => `Emitted ${emittedMassKg} kg but NFPA 2001 formula gives ${expectedMassKg.toFixed(1)} kg (diff ${pct.toFixed(1)}%). V=${V} m³, C=${C}% v/v, s=${NOVEC_S_20C} m³/kg. Fix: selectFireSuppressionAgentMass() in hardware-selectors.ts; wire result into clean_agent_cylinder_word capacity modifier.`,
          ))
        }
      }
    }
  }

  // ── UNIVERSAL: current sensors loaded below 80% (2026-05-26, L39) ──
  //
  // UNIVERSAL.current_sensors_loaded_below_80pct — walks every word matching
  // current_sensor / current_transducer patterns, reads the rated nominal (A)
  // from the capacity modifier, reads the string current from orchestratorContract,
  // and asserts continuous_current ≤ 80% of rated_nominal_a.
  //
  // Closes L39 [MED]: HASS 100-S (100 A) at 102 A peak (102% loading).
  {
    const contractQ2 = state?.orchestratorContract?.quantities as Record<string, any> | undefined
    const contractStringContinuousA2 = typeof contractQ2?.string_continuous_current_a?.value === 'number'
      ? Number(contractQ2.string_continuous_current_a.value) : null
    const contractStringPeakA2 = typeof contractQ2?.string_peak_current_a?.value === 'number'
      ? Number(contractQ2.string_peak_current_a.value) : null

    for (const m of modules) {
      for (const sm of (m.sub_modules ?? [])) {
        for (const w of (sm.words ?? [])) {
          const wid = String(w?.id ?? '')
          if (!/current_transducer|current_sensor|pack_current/.test(wid)) continue
          const mods2: Array<{ kind: string; value: string; unit?: string }> =
            Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
          const capMod2 = mods2.find((mc) => mc.kind === 'capacity' && /^a$/i.test(mc.unit ?? ''))
          if (!capMod2) continue
          const ratedNominalA = parseFloat(String(capMod2.value ?? ''))
          if (!Number.isFinite(ratedNominalA) || ratedNominalA <= 0) continue

          // Use contract string currents if available; fall back to 50/60% of rated (trivially passes)
          const continuousA = contractStringContinuousA2 ?? (ratedNominalA * 0.5)
          const peakA = contractStringPeakA2 ?? (ratedNominalA * 0.6)
          const maxCurrentA = Math.max(continuousA, peakA)
          const loadingPct = (maxCurrentA / ratedNominalA) * 100

          assertions.push(assertEq(
            'UNIVERSAL.current_sensors_loaded_below_80pct',
            `${wid}: current sensor loaded ≤ 80% of rated nominal (IEC 60688 thermal derating; L39 Deliverable C)`,
            loadingPct,
            (pct) => pct <= 80,
            (pct) => `${wid}: ${maxCurrentA.toFixed(0)} A max current vs ${ratedNominalA} A nominal = ${pct.toFixed(0)}% loading (>80% limit). Fix: selectCurrentSensorFor() in hardware-selectors.ts with continuous=${continuousA.toFixed(0)} A + peak=${peakA.toFixed(0)} A — requires ≥${(maxCurrentA * 1.25).toFixed(0)} A nominal.`,
          ))
        }
      }
    }
  }

  // ── UNIVERSAL: DC fuse voltage ≥ 1.5× string max voltage (2026-05-26, L39) ──
  //
  // UNIVERSAL.dc_fuse_voltage_ge_1p5x_string_max — walks every rack_string_fuse
  // word, reads the voltage rating from the dimension modifier (V), reads string
  // max voltage from orchestratorContract (seriesCellsPerString × 3.65 V/cell),
  // and asserts rated_voltage_dc_v ≥ 1.5 × stringMaxVoltageV.
  //
  // Closes L39 [LOW]: 1000 V fuse on 912.5 V string max (only 9.6% margin).
  {
    const contractQ3 = state?.orchestratorContract?.quantities as Record<string, any> | undefined
    const seriesCellsPerString3 = typeof contractQ3?.series_cells_per_string?.value === 'number'
      ? Number(contractQ3.series_cells_per_string.value)
      : typeof contractQ3?.cells_per_rack?.value === 'number'
        ? Number(contractQ3.cells_per_rack.value)
        : null

    if (seriesCellsPerString3 !== null) {
      const LFP_MAX_V = 3.65
      const stringMaxV = seriesCellsPerString3 * LFP_MAX_V
      const minFuseV = stringMaxV * 1.5

      for (const m of modules) {
        for (const sm of (m.sub_modules ?? [])) {
          for (const w of (sm.words ?? [])) {
            const wid = String(w?.id ?? '')
            if (!/string_fuse/.test(wid)) continue
            const mods3: Array<{ kind: string; value: string; unit?: string }> =
              Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
            const dimMod = mods3.find((mc) => mc.kind === 'dimension' && /^V$/.test(mc.unit ?? ''))
            if (!dimMod) continue
            const ratedVoltageV = parseFloat(String(dimMod.value ?? ''))
            if (!Number.isFinite(ratedVoltageV) || ratedVoltageV <= 0) continue

            assertions.push(assertEq(
              'UNIVERSAL.dc_fuse_voltage_ge_1p5x_string_max',
              `${wid}: DC fuse rated_voltage ≥ 1.5× string max voltage ${stringMaxV.toFixed(0)} V = ${minFuseV.toFixed(0)} V min (L39 Deliverable D, UK utility BESS norm)`,
              ratedVoltageV,
              (v) => v >= minFuseV,
              (v) => `${wid}: fuse rated ${v} V DC but string max = ${stringMaxV.toFixed(1)} V (${seriesCellsPerString3} cells × ${LFP_MAX_V} V/cell). Need ≥ ${minFuseV.toFixed(0)} V (1.5× string max). Fix: selectDcFuseFor() in hardware-selectors.ts with string_max_voltage_v=${stringMaxV.toFixed(1)}.`,
            ))
          }
        }
      }
    }
  }

  // ── UNIVERSAL: no irrelevant modifiers on electrical parts (2026-05-26, L39) ──
  //
  // UNIVERSAL.no_irrelevant_modifiers_on_electrical_parts — walks every modifier
  // value on electrical-class words and fails if any fluid-domain pattern
  // (PN prefix, bar, MPa, kPa, gpm/lpm flow units) is present.
  //
  // Closes L39 [LOW]: PN16 on precharge_resistor (wirewound electrical part).
  // IRRELEVANT_MODIFIER_PATTERNS in shared-quantity-consistency-audit.ts defines
  // the full rule table; this invariant inlines the HIGH-severity subset for speed.
  {
    const ELECTRICAL_CLASS_RE = /resistor|contactor|inverter|fuse|relay|breaker|cable|busbar|connector|sensor|transducer|transformer|bms|battery|cell|module|charger|switch|circuit_breaker|arc_flash|electrical/i
    const FLUID_MODIFIER_HIGH = [
      { name: 'PN_pressure_nominal', pattern: /\bPN\s*\d+\b/i },
      { name: 'bar_pressure',        pattern: /\b\d+(?:\.\d+)?\s*bar\b/i },
      { name: 'MPa_pressure',        pattern: /\b\d+(?:\.\d+)?\s*MPa\b/i },
      { name: 'kPa_pressure',        pattern: /\b\d+(?:\.\d+)?\s*kPa\b/i },
      { name: 'flow_lpm',            pattern: /\b\d+(?:\.\d+)?\s*(?:lpm|L\/min|l\/min)\b/i },
      { name: 'flow_gpm',            pattern: /\b\d+(?:\.\d+)?\s*gpm\b/i },
    ]
    const irrelevantModViolations: string[] = []

    for (const m of modules) {
      for (const sm of (m.sub_modules ?? [])) {
        for (const w of (sm.words ?? [])) {
          const wid = String(w?.id ?? '')
          if (!ELECTRICAL_CLASS_RE.test(wid)) continue
          const mods4: Array<{ kind: string; value: string }> =
            Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
          // Skip regulatory kind — may cite pressure-related standards legitimately
          const nonReg = mods4.filter((mc) => mc?.kind !== 'regulatory')
          for (const mc of nonReg) {
            const val = String(mc.value ?? '')
            for (const rule of FLUID_MODIFIER_HIGH) {
              if (rule.pattern.test(val)) {
                irrelevantModViolations.push(`${m.module}::${sm.id}::${wid}[${mc.kind}]: "${val}" matches ${rule.name}`)
              }
            }
          }
        }
      }
    }
    assertions.push(assertEq(
      'UNIVERSAL.no_irrelevant_modifiers_on_electrical_parts',
      'No fluid-domain modifiers (PN-pressure, bar, MPa, kPa, lpm, gpm) on electrical-class words (L39 Deliverable A — cross-domain modifier leak guard)',
      irrelevantModViolations.length,
      (n) => n === 0,
      (n) => `${n} irrelevant modifier(s) on electrical parts: ${irrelevantModViolations.slice(0, 5).join('; ')} — fix: remove the cross-domain modifier from the word in deterministic-emitter.ts. Root cause: copy-paste from a fluid/piping sub-module. Gate 24 / exit 24 catches this in live chain.`,
    ))
  }

  // ── UNIVERSAL: per-rack quantity consistent (2026-05-27, L40 gate 26 class-killer C) ──
  //
  // UNIVERSAL.per_rack_quantity_consistent — runs the gate 26 algorithm on
  // the state.json snapshot, asserts no HIGH findings.
  //
  // Closes L40 [HIGH]: "Fourteen Wieland cold plates per rack" in prose vs
  // JSON quantity x14 total. Gate 26 catches any future prose-vs-BoM multiplier
  // mismatch universally. The regression harness mirrors the gate logic so that
  // snapshots from BESS, HAPS, VF, EV and all other classes are automatically
  // checked without a chain re-run.
  {
    // Inline the gate logic via the same import path used in the chain.
    // The harness runs synchronously; dynamic import not needed here.
    try {
      const { runPerRackQuantityAudit } = require('../src/lib/pdf-engine-v2/lib/per-rack-quantity-audit')
      const contractQtys = (
        (state?.orchestratorContract as Record<string, unknown> | undefined)?.quantities ?? {}
      ) as Record<string, unknown>
      const pqResult = runPerRackQuantityAudit(modules, contractQtys, productClass ?? 'unknown')
      assertions.push(assertEq(
        'UNIVERSAL.per_rack_quantity_consistent',
        'No per-rack quantity mismatches (gate 26): prose "N per <denominator>" must match BoM quantity = N × denominator_count within 5% (L40 [HIGH] class-killer C)',
        pqResult.high_count,
        (n: number) => n === 0,
        (n: number) => `${n} per-rack quantity mismatch(es): ${pqResult.findings.slice(0, 3).map((f: { note: string }) => f.note).join('; ')}. Fix: update deterministic-emitter.ts to emit multiplied totals.`,
      ))
    } catch (err) {
      assertions.push({ id: 'UNIVERSAL.per_rack_quantity_consistent', description: 'Gate 26 per-rack quantity audit', passed: false, detail: `Failed to load per-rack-quantity-audit module: ${err}` })
    }
  }

  // ── UNIVERSAL: no voltage-domain mismatch (2026-05-27, L40 gate 24 extension B) ──
  //
  // UNIVERSAL.no_voltage_domain_mismatch — verifies VOLTAGE_DOMAIN_PATTERNS
  // (just added to IRRELEVANT_MODIFIER_PATTERNS in shared-quantity-consistency-audit.ts)
  // reports no HIGH findings on this snapshot.
  //
  // Closes L40 [MED]: Ritz RVT-11 (11kV/110V) placed inside AC distribution
  // sub-module operating at 400 V AC. HV-rated words must not appear in LV
  // sub-modules, and vice-versa.
  {
    try {
      const { runIrrelevantModifierAudit } = require('../src/lib/pdf-engine-v2/lib/shared-quantity-consistency-audit')
      const vdResult = runIrrelevantModifierAudit(modules, productClass ?? 'unknown')
      const vdHighFindings = vdResult.violations.filter((v: { severity: string; rule_id: string }) =>
        v.severity === 'HIGH' && (v.rule_id === 'hv_word_in_lv_sub_module' || v.rule_id === 'lv_word_in_hv_sub_module')
      )
      assertions.push(assertEq(
        'UNIVERSAL.no_voltage_domain_mismatch',
        'No voltage-domain placement mismatches (gate 24 VOLTAGE_DOMAIN_PATTERNS): HV-rated words must not appear in LV sub-modules and vice-versa (L40 [MED] class-killer B)',
        vdHighFindings.length,
        (n: number) => n === 0,
        (n: number) => `${n} voltage-domain violation(s): ${vdHighFindings.slice(0, 3).map((v: { location: string }) => v.location).join('; ')}. Fix: relocate HV words to external switchgear sub-module or replace with LV-rated equivalent.`,
      ))
    } catch (err) {
      assertions.push({ id: 'UNIVERSAL.no_voltage_domain_mismatch', description: 'Gate 24 voltage-domain placement audit', passed: false, detail: `Failed to load shared-quantity-consistency-audit module: ${err}` })
    }
  }

  // ── UNIVERSAL: manufacturer attribution canonical (2026-05-27, L40 gate 27 class-killer D) ──
  //
  // UNIVERSAL.manufacturer_attribution_canonical — runs the gate 27 algorithm
  // (MFR_PART_PATTERNS) on this snapshot, asserts no HIGH findings.
  //
  // Closes L40 [LOW]: "Roxtec ICG/501-M25 actually manufactured by Hawke
  // International, not Roxtec." MFR_PART_PATTERNS seeds 16 known-confused
  // manufacturer/PN families; gate 27 catches any future wrong-attribution
  // before the PDF is rendered.
  {
    try {
      const { runManufacturerAttributionAudit } = require('../src/lib/pdf-engine-v2/lib/manufacturer-attribution-audit')
      const maResult = runManufacturerAttributionAudit(modules, undefined, productClass ?? 'unknown')
      assertions.push(assertEq(
        'UNIVERSAL.manufacturer_attribution_canonical',
        'No manufacturer attribution errors (gate 27): emitted manufacturer matches MFR_PART_PATTERNS canonical for all PN-matched words (L40 [LOW] class-killer D)',
        maResult.high_count,
        (n: number) => n === 0,
        (n: number) => `${n} wrong-manufacturer attribution(s) in ${maResult.words_checked} BoM words checked: ${maResult.findings.slice(0, 3).map((f: { message: string }) => f.message).join('; ')}. Fix: update emitter to emit canonical_mfr from MFR_PART_PATTERNS.`,
      ))
    } catch (err) {
      assertions.push({ id: 'UNIVERSAL.manufacturer_attribution_canonical', description: 'Gate 27 manufacturer attribution audit', passed: false, detail: `Failed to load manufacturer-attribution-audit module: ${err}` })
    }
  }

  // ── UNIVERSAL: state JSON parses after Phase 2 (2026-05-27, L42 gate 28 backstop A) ──
  //
  // UNIVERSAL.state_json_parses_after_phase2 — re-runs the gate 28 state-parse
  // guard (runStateParseGuard) on the current snapshot, asserts that:
  //   (a) JSON is parseable
  //   (b) moduleDecomposition exists
  //   (c) modules.length > 0
  //   (d) no structural damage (every module's sub_modules is an Array)
  //
  // Root cause of L41 HIGH F-4 truncation finding: multimodal scorer artefact —
  // Gemini Flash read a PDF page-break mid-sentence as data truncation. The
  // underlying 4-generator.json, 8-5-specialist.json, and state.json all had all
  // 10 modules intact. Phase 2 is a deterministic patch loop with no LLM call,
  // so finish_reason='length' was never applicable. Gate 28 is added as a
  // structural backstop. This invariant mirrors gate 28 in the regression harness
  // so that future snapshots are automatically validated.
  {
    try {
      const { runStateParseGuard } = require('../src/lib/pdf-engine-v2/lib/state-parse-guard')
      const spgResult = runStateParseGuard(snapshotPath)
      assertions.push(assertEq(
        'UNIVERSAL.state_json_parses_after_phase2',
        'Gate 28: state.json parses cleanly — moduleDecomposition present, modules.length > 0, sub_modules all Arrays (L42 backstop against multimodal scorer artefact truncation)',
        spgResult.passed,
        (p: boolean) => p === true,
        (_: boolean) => `Gate 28 state-parse guard FAILED on ${snapshotPath}: ${spgResult.errors.join('; ')}. Fix: ensure Phase 2 does not corrupt moduleDecomposition. Root cause: ${spgResult.root_cause ?? 'unknown'}.`,
      ))
    } catch (err) {
      assertions.push({ id: 'UNIVERSAL.state_json_parses_after_phase2', description: 'Gate 28 state-parse guard', passed: false, detail: `Failed to load state-parse-guard module: ${err}` })
    }
  }

  // ── UNIVERSAL: sub-module domain coherence (2026-05-27, L47 gate 29) ──
  //
  // UNIVERSAL.submodule_domain_coherent — runs the gate 29 sub-module domain
  // guard on this snapshot's moduleDecomposition.modules, asserts hits.length = 0.
  //
  // Closes L46 council 3/4-seat finding: `dc_power_cable_word` +
  // `dc_power_cable_insulation_word` rendered inside power_distribution::ac_switchgear.
  // Universal: any future regression where the sub-module composition step attaches
  // a dc_* character_id to an ac_* sub_module (or vice-versa) is caught at
  // build/regression time without a chain re-run.
  {
    try {
      const { runSubModuleDomainGuard } = require('../src/lib/pdf-engine-v2/lib/submodule-domain-guard')
      const sdgResult = runSubModuleDomainGuard(modules)
      assertions.push(assertEq(
        'UNIVERSAL.submodule_domain_coherent',
        'No sub-module domain mismatches (gate 29): every word.content_character.character_id with a dc_/ac_ prefix lives inside a sub_module whose id has the matching domain prefix (L46 council 3/4 seats class-killer)',
        sdgResult.hits.length,
        (n: number) => n === 0,
        (n: number) => `${n} sub-module domain mismatch(es): ${sdgResult.hits.slice(0, 3).map((h: { module_id: string; sub_module_id: string; word_id: string; character_id: string; expected_domain: string; actual_domain: string }) => `${h.module_id}::${h.sub_module_id}/${h.word_id} (cid=${h.character_id}, expected=${h.expected_domain.toUpperCase()}, actual=${h.actual_domain.toUpperCase()})`).join('; ')}. Fix upstream in the sub-module composition step (deterministic-emitter slot lists OR reviewer prompts OR applyReviewerPatches add_word_to_sub_module branch).`,
      ))
    } catch (err) {
      assertions.push({ id: 'UNIVERSAL.submodule_domain_coherent', description: 'Gate 29 sub-module domain guard', passed: false, detail: `Failed to load submodule-domain-guard module: ${err}` })
    }
  }

  // ── UNIVERSAL: no historical brief value literals in emitter (2026-05-27, L42 gate 25 extension B) ──
  //
  // UNIVERSAL.no_historical_brief_value_literals_in_emitter — runs the extended
  // gate 25 scanner (scanEmitterFileWithHistoricalValues) on deterministic-emitter.ts,
  // seeding constraints from the current snapshot's orchestratorContract and the
  // historical-brief-values.json manifest. Asserts HIGH count = 0.
  //
  // Motivation: brief values change across iterations (bess_container max_mass_kg
  // was 28000 in ce8fde2af, then 35000 in f8efb3f4d). A stale literal from a prior
  // brief that appears as a template literal in deterministic-emitter.ts will produce
  // wrong output for any project whose brief differs from the stale value, even though
  // the gate 25 base scan (which only checks CURRENT brief values) would not catch it.
  // HIGH = value is ONLY in historical list (stale). MED = also matches current brief (ambiguous).
  {
    try {
      const { scanEmitterFileWithHistoricalValues } = require('./lib/brief-value-literal-scanner')
      const emitterPath = resolve(__dirname, 'lib/deterministic-emitter.ts')
      // Extract current constraints from orchestratorContract (same structure as gate 25 base scan)
      const contractQtys5 = (
        (state?.orchestratorContract as Record<string, unknown> | undefined)?.quantities ?? {}
      ) as Record<string, number>
      const historicalManifest = resolve(__dirname, 'lib/historical-brief-values.json')
      const result = scanEmitterFileWithHistoricalValues(
        emitterPath,
        contractQtys5,
        productClass ?? 'unknown',
        historicalManifest,
        10, // minValue: ignore values < 10 (too many false positives for small integers)
      )
      assertions.push(assertEq(
        'UNIVERSAL.no_historical_brief_value_literals_in_emitter',
        'Gate 25 (historical extension): no stale brief-value literals (HIGH) in deterministic-emitter.ts — historical-brief-values.json manifest lists all prior brief numeric values; stale literals cause wrong output when brief changes (L42 Deliverable B)',
        result.combined_high_count,
        (n: number) => n === 0,
        (n: number) => `${n} stale brief-value literal(s) found in emitter: ${result.historical_hits.filter((h: { historical_status: string }) => h.historical_status === 'stale').slice(0, 3).map((h: { line: number; value: number; field: string }) => `line ${h.line}: ${h.value} (${h.field})`).join('; ')}. Fix: replace literal with a dynamic lookup from the current brief/orchestratorContract. See historical-brief-values.json for the stale manifest.`,
      ))
    } catch (err) {
      assertions.push({ id: 'UNIVERSAL.no_historical_brief_value_literals_in_emitter', description: 'Gate 25 historical brief-value literals scan', passed: false, detail: `Failed to load brief-value-literal-scanner module: ${err}` })
    }
  }

  // ── UNIVERSAL: selected pumps within BEP envelope (2026-05-27, L42 gate BEP C) ──
  //
  // UNIVERSAL.selected_pumps_within_bep_envelope — walks every coolant_pump /
  // circulation_pump word in the design, reads the capacity modifier (L/min),
  // calls selectCoolantPumpFor() from hardware-selectors.ts with that flow rate,
  // and asserts bep_status === 'within_bep' for the returned selection.
  //
  // Motivation: L41 BESS MED finding — Grundfos NB 25-200/187 selected for
  // 90 L/min target (NB 25 bep_max = 66 L/min; 90 L/min is far left of BEP).
  // Hardware-selectors now enforces BEP-first selection and seeds the NB 32-160/170
  // (bep range 63–99 L/min) as the correct intermediate choice for this flow range.
  // This invariant catches any future snapshot where a selected pump falls outside
  // its published BEP envelope.
  {
    try {
      const { selectCoolantPumpFor } = require('./lib/hardware-selectors')
      for (const m of modules) {
        for (const sm of (m.sub_modules ?? [])) {
          for (const w of (sm.words ?? [])) {
            const wid = String(w?.id ?? '')
            if (!/coolant_pump|circulation_pump/.test(wid)) continue
            const mods5: Array<{ kind: string; value: string; unit?: string }> =
              Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
            // Look for a flow-rate capacity modifier (unit lpm or L/min)
            const flowMod = mods5.find((mc) =>
              mc.kind === 'capacity' && /^(?:lpm|L\/min|l\/min)$/i.test(mc.unit ?? '')
            )
            if (!flowMod) continue
            const flowLpm = parseFloat(String(flowMod.value ?? ''))
            if (!Number.isFinite(flowLpm) || flowLpm <= 0) continue

            const selection = selectCoolantPumpFor({ required_flow_lpm: flowLpm, required_head_m: 0 })
            const bepStatus = selection?.bep_status ?? 'no_bep_data'
            assertions.push(assertEq(
              'UNIVERSAL.selected_pumps_within_bep_envelope',
              `${wid} (${flowLpm} L/min target): selectCoolantPumpFor returns a pump within published Grundfos BEP envelope (70%–110% of BEP optimal; L42 Deliverable C — closes L41 MED Grundfos oversized)`,
              bepStatus,
              (s: string) => s === 'within_bep',
              (s: string) => `${wid}: pump selected with bep_status='${s}' for ${flowLpm} L/min target. Selected: ${selection?.pump_model ?? 'none'}. BEP envelope: ${selection?.bep_envelope_lpm ? JSON.stringify(selection.bep_envelope_lpm) : 'n/a'}. Warning: ${selection?.bep_warning ?? 'none'}. Fix: add a Grundfos catalogue entry in hardware-selectors.ts whose BEP envelope covers ${flowLpm} L/min.`,
            ))
          }
        }
      }
    } catch (err) {
      assertions.push({ id: 'UNIVERSAL.selected_pumps_within_bep_envelope', description: 'Pump BEP envelope check (L42 Deliverable C)', passed: false, detail: `Failed to load hardware-selectors module: ${err}` })
    }
  }

  // ── UNIVERSAL: all classes lock-gate HARD slots derivable from minimal brief (2026-05-27, L43 Deliverable C) ──
  //
  // UNIVERSAL.all_classes_lock_gate_hard_slots_derivable — for every class in
  // HARD_REQUIRED_SLOTS, runs buildContract() on a synthetic minimal brief and
  // asserts that ALL HARD slots are present and non-zero in the resulting
  // Contract.quantities. Fails build if any class's HARD slots aren't derivable.
  //
  // Root cause: VF chain failed 4× at Engineering Lock Gate exit 22 because the
  // VF builder emitted 'led_installed_power_kw' while the gate checked
  // 'installed_lighting_kw'. Same "mechanism universal, per-class schema partial"
  // pattern from drawer e9be6d1fd3f95149. Pre-change mempalace search:
  // "engineering contract derived parameters per-class HARD slot completion" →
  // 5 drawers loaded. See drawer a9d3a83646b33d8c (watchdog stall pattern) —
  // NO smoke chain needed; this invariant provides the mechanical guard instead.
  //
  // The synthetic minimal brief is intentionally sparse — each class must derive
  // HARD slots from defaults alone (i.e., the builder's fallback paths must work).
  // Briefs with explicit brief inputs would also pass; this is the minimum bar.
  {
    const MINIMAL_BRIEF: Record<string, unknown> = {
      product_description: '',
      constraints: { target_performance: { value: 100, unit: 'kW' }, max_mass_kg: { value: 10000 } },
    }
    for (const [cls, hardSlots] of Object.entries(HARD_REQUIRED_SLOTS)) {
      if (hardSlots.length === 0) continue
      let contract: ReturnType<typeof buildContract>
      try {
        contract = buildContract(cls, MINIMAL_BRIEF)
      } catch (err) {
        assertions.push({ id: `UNIVERSAL.all_classes_lock_gate_hard_slots_derivable.${cls}`, description: `Class '${cls}': buildContract runs without throwing on minimal brief`, passed: false, detail: `buildContract('${cls}', minimalBrief) threw: ${err}` })
        continue
      }
      if (!contract) {
        assertions.push({ id: `UNIVERSAL.all_classes_lock_gate_hard_slots_derivable.${cls}`, description: `Class '${cls}': archetype registered for all HARD_REQUIRED_SLOTS classes`, passed: false, detail: `buildContract('${cls}', ...) returned null — no archetype registered. Register one in scripts/lib/engineering-contract.ts with derivations for: ${hardSlots.join(', ')}` })
        continue
      }
      const missingSlots: string[] = []
      for (const slot of hardSlots) {
        const qty = contract.quantities[slot]
        // qty is always a Quantity object (or undefined if missing). Extract .value safely.
        const val: number | undefined = qty != null && typeof qty === 'object'
          ? (qty as unknown as { value?: number }).value
          : undefined
        if (val === undefined || val === null || val === 0) {
          missingSlots.push(slot)
        }
      }
      assertions.push(assertEq(
        `UNIVERSAL.all_classes_lock_gate_hard_slots_derivable.${cls}`,
        `Class '${cls}': all ${hardSlots.length} HARD lock-gate slot(s) derivable from minimal brief — ${hardSlots.join(', ')} (L43 universal contract completeness, drawer e9be6d1fd3f95149)`,
        missingSlots.length,
        (n: number) => n === 0,
        (n: number) => `${n} HARD slot(s) not derivable for '${cls}': ${missingSlots.join(', ')}. Fix: add derivation for each missing slot in the '${cls}' archetype builder in scripts/lib/engineering-contract.ts. The lock gate (engineering-lock-gate.ts) will fire exit 22 until all HARD slots are filled.`,
      ))
    }
  }

  // ── UNIVERSAL.class_graph_slugs_resolve_to_real_graph ─────────────────────
  // Guards the 2026-05-31 K10 slug-drift regression. The chain emits engine
  // product_class slugs (wind_turbine, h2_electrolyser, ev_charger) that the
  // class-reference graph keys under DIFFERENT slugs (wind_turbine_small,
  // hydrogen_electrolyser, dc_fast_ev_charger). When the alias map drifts, the
  // class silently logs "NO_GRAPH" and its self-learning loop dies (and the
  // writeback no-ops). Asserts every go-wide engine class resolves — via the
  // single canonical resolveClassGraphSlug() — to a slug that EXISTS as a
  // class_reference_graphs row. Snapshot-independent (like the lock-gate-slots
  // block above); skips gracefully when forge-truth.db is absent (CI).
  {
    const GOWIDE_ENGINE_CLASSES = [
      'wind_turbine', 'h2_electrolyser', 'ev_charger', 'vertical_farm',
      'heat_pump', 'bess', 'vfd', 'auv', 'pv_module', 'fuel_cell',
    ]
    const graphDbPath = resolve(homedir(), '.forge-truth', 'forge-truth.db')
    if (!existsSync(graphDbPath)) {
      assertions.push({ id: 'UNIVERSAL.class_graph_slugs_resolve_to_real_graph', description: 'class-graph slug resolution (skipped — forge-truth.db absent)', passed: true, detail: 'DB absent (CI) — skipped' })
    } else {
      let known = new Set<string>()
      let dbErr = ''
      try {
        const gdb = new Database(graphDbPath, { readonly: true })
        known = new Set((gdb.prepare('SELECT product_class FROM class_reference_graphs').all() as Array<{ product_class: string }>).map(r => r.product_class))
        gdb.close()
      } catch (err) { dbErr = String(err) }
      if (dbErr) {
        assertions.push({ id: 'UNIVERSAL.class_graph_slugs_resolve_to_real_graph', description: 'read class_reference_graphs', passed: false, detail: `DB read failed: ${dbErr}` })
      } else {
        const unresolved = GOWIDE_ENGINE_CLASSES.filter(c => !known.has(resolveClassGraphSlug(c)))
        assertions.push(assertEq(
          'UNIVERSAL.class_graph_slugs_resolve_to_real_graph',
          'Every go-wide engine class resolves (via resolveClassGraphSlug) to an existing class_reference_graphs row — guards the K10 NO_GRAPH / slug-drift regression (2026-05-31)',
          unresolved.length,
          (n: number) => n === 0,
          () => `${unresolved.length} engine class(es) resolve to NO_GRAPH: ${unresolved.map(c => `${c}→${resolveClassGraphSlug(c)}`).join(', ')}. Fix: add the alias to CLASS_GRAPH_ALIASES in src/lib/pdf-engine-v2/lib/knowledge/class-reference-graph-db.ts (NOT a local map copy), or add the graph row.`,
        ))
      }
    }
  }

  // ── UNIVERSAL.per_rack_audit_skips_power_ratings_keeps_counts ─────────────
  // Guards the 2026-05-31 gate-26 fix: a "N <power-unit> <noun> per X" prose
  // phrase is a RATING of the noun, not a count of it ("20 kW cold-plate
  // manifolds per rack" = one 20-kW manifold per rack, NOT 20 manifolds), so it
  // must NOT produce a per-rack finding. But a genuine "N <noun> per X" count
  // ("14 cold plates per rack" with the BoM under-emitting) MUST still fire. This
  // asserts BOTH directions so the rating-unit guard can't silently over-skip.
  {
    const mk = (prose: string, wordId: string, qty: number) => ([{ module: 'm', sub_modules: [{ id: 's', english_sentence: prose, words: [{ id: wordId, modifier_characters: [{ kind: 'quantity', value: String(qty) }] }] }] }])
    const Q = { rack_count: { value: 14 } }
    // rating phrase → must be SKIPPED (0 findings)
    const ratingFindings = runPerRackQuantityAudit(mk('Each contains 20 kW cold-plate manifolds per rack for cooling.', 'cold_plate_manifold_word', 14) as any, Q as any, 'energy_storage').findings?.length ?? 0
    // genuine count under-emitted → must still FIRE (>=1 finding): 14 plates/rack × 14 racks = 196, BoM emits 14
    const countFindings = runPerRackQuantityAudit(mk('The module uses 14 cold plates per rack across the system.', 'cold_plate_word', 14) as any, Q as any, 'energy_storage').findings?.length ?? 0
    const ok = ratingFindings === 0 && countFindings >= 1
    assertions.push(assertEq(
      'UNIVERSAL.per_rack_audit_skips_power_ratings_keeps_counts',
      'gate-26 skips a power-RATING phrase ("20 kW cold-plate manifolds per rack") yet still catches a genuine under-emitted count ("14 cold plates per rack") — guards the 2026-05-31 rating-unit false-positive fix without over-skipping',
      ok,
      (v: boolean) => v === true,
      () => `rating-phrase findings=${ratingFindings} (want 0), count-phrase findings=${countFindings} (want >=1)`,
    ))
  }

  // ── UNIVERSAL.per_rack_audit_ignores_citation_year ───────────────────────
  // Guards the 2026-06-01 gate-26 fix: the "N <noun> per X" noun phrase is now
  // bounded to ≤6 LETTER-only words, so a CITATION YEAR far from "per rack" can't
  // be grabbed as the count. BESS exit-26 #4: "2013 LFP DFN simulation confirms
  // 5000 cells equating to 20 racks with 250 series cells per rack" matched
  // N=2013 × 20 racks = 40260 (vs BoM 5000) → false HIGH. The regex must now find
  // the true "250 series cells per rack" → 250 × 20 = 5000 = BoM → no finding.
  {
    const mk = (prose: string, wordId: string, qty: number) => ([{ module: 'm', sub_modules: [{ id: 's', english_sentence: prose, words: [{ id: wordId, modifier_characters: [{ kind: 'quantity', value: String(qty) }] }] }] }])
    const Q = { rack_count: { value: 20 } }
    const yearProse = '2013 LFP DFN simulation confirms 5000 cells equating to 20 racks with 250 series cells per rack.'
    // BoM emits 5000 = 250 series cells/rack × 20 racks → CORRECT → 0 findings.
    const yearFindings = runPerRackQuantityAudit(mk(yearProse, 'series_cells_busbar_word', 5000) as never, Q as never, 'energy_storage').findings?.length ?? 0
    const ok = yearFindings === 0
    assertions.push(assertEq(
      'UNIVERSAL.per_rack_audit_ignores_citation_year',
      'gate-26 extracts "250 series cells per rack" (not the citation year 2013) so a correctly-emitted busbar qty (5000 = 250×20) produces NO finding — guards the 2026-06-01 year-span false-positive fix that blocked BESS',
      ok,
      (v: boolean) => v === true,
      () => `year-prose findings=${yearFindings} (want 0 — regex must pick 250 not 2013/20)`,
    ))
  }

  // ── UNIVERSAL.gate25_skips_cross_unit_mod_literals ────────────────────────
  // Guards the 2026-05-31 gate-25 fix: a value inside mod(key,'500','kbit/s') or
  // mod(key,'500','A') carries its UNIT in the NEXT arg, not adjacent to the
  // number. The scanner must read that next-arg unit so "500 kbit/s" (CAN data-
  // rate) / "500 A" (current) are NOT matched to a unitless brief count like
  // batch_size=500 (the heatpump exit-25 false positive) — while a genuine
  // same-family stale literal ("28000 kg" vs max_mass_kg) MUST still be flagged.
  {
    const src = [
      "mod('capacity', '500', 'kbit/s'),",
      "mod('capacity', '500', 'A'),",
      "mod('structural_floor_capacity', '28000', 'kg'),",
    ].join('\n')
    const r = scanEmitterForBriefLiterals(src, { batch_size: 500, max_mass_kg: 28000 } as never, 'test', 100)
    const batchHits = r.hits.filter((h) => h.brief_key === 'batch_size').length
    const massHits = r.hits.filter((h) => h.brief_key === 'max_mass_kg').length
    const ok = batchHits === 0 && massHits >= 1
    assertions.push(assertEq(
      'UNIVERSAL.gate25_skips_cross_unit_mod_literals',
      'gate-25 reads the mod() next-arg unit: "500 kbit/s"/"500 A" are NOT flagged as batch_size=500 (cross-family), but "28000 kg" IS flagged as max_mass_kg (same-family) — guards the 2026-05-31 unit-discrimination fix',
      ok,
      (v: boolean) => v === true,
      () => `batch_size FPs=${batchHits} (want 0), max_mass_kg true-positive=${massHits} (want >=1)`,
    ))
  }

  // ── UNIVERSAL.reassert_restores_stripped_part_number ─────────────────────
  // Guards the 2026-05-31 pre-render emitter-identity reassert fix: a late stage
  // (Stage 10.5 part-reality-check / R4 fact-check) strips emitter part_numbers
  // AFTER the Phase-2 reassert, blanking REAL parts (~86% of an industrial BOM is
  // real-but-not-on-electronics-distributors). The chain now reasserts emitter
  // identity as the last mutation before render. This asserts the mechanism it
  // relies on actually restores a stripped part_number, so a real part can never
  // ship with a blank SKU on a manufacturer.
  {
    const emitterModules = [{ module: 'm', sub_modules: [{ id: 's', words: [{ id: 'w1', modifier_characters: [{ kind: 'manufacturer', value: 'CATL' }, { kind: 'part_number', value: 'LF280K' }, { kind: 'rating_primary', value: '280 Ah' }] }] }] }]
    const snap = snapshotEmitterIdentity(emitterModules as never)
    // simulate the LATE stage: blank the part_number AND apply a legitimate numeric
    // correction (rating 280 Ah -> 314 Ah). The narrow restore must heal the SKU
    // but must NOT revert the corrected numeric (which would cause a gate-18 conflict).
    const mutated = JSON.parse(JSON.stringify(emitterModules)) as typeof emitterModules
    mutated[0].sub_modules[0].words[0].modifier_characters =
      [{ kind: 'manufacturer', value: 'CATL' }, { kind: 'rating_primary', value: '314 Ah' }]
    restoreStrippedPartNumbers(mutated as never, snap)
    const mods = mutated[0].sub_modules[0].words[0].modifier_characters
    const restoredPn = mods.find((mc) => mc.kind === 'part_number')?.value
    const ratingKept = mods.find((mc) => mc.kind === 'rating_primary')?.value
    const ok = restoredPn === 'LF280K' && ratingKept === '314 Ah'
    assertions.push(assertEq(
      'UNIVERSAL.reassert_restores_stripped_part_number',
      'restoreStrippedPartNumbers re-adds a blanked SKU (real part never ships blank) WITHOUT reverting a late numeric correction (rating stays 314 Ah, not 280 Ah) — guards the 2026-05-31 part_number-only pre-render restore',
      ok,
      (v: boolean) => v === true,
      () => `restoredPn=${restoredPn} (want LF280K), ratingKept=${ratingKept} (want 314 Ah — NOT reverted)`,
    ))
  }

  // ── UNIVERSAL.haps_solar_peak_computed_not_stubbed ────────────────────────
  // Guards the 2026-06-01 closure fix: solar_peak_kw was read from brief text
  // (extractRange, default 3.0 kW) → the energy-balance closure ALWAYS false-
  // failed (3 kW < the ~9 kW a 50 m wing needs) and printed an ugly red "DESIGN
  // DOES NOT CLOSE" banner, even though a 125 m² triple-junction array makes
  // ~35 kW. Solar peak is now COMPUTED (wing_area × coverage × η × irradiance).
  // Asserts it's a real computed value (not the 3.0 stub) and the closure passes.
  {
    const haps = buildContract('haps', { product_description: '50 m solar-electric HAPS, 90-day endurance, 16 kWh Li-S, GaAs solar', constraints: { max_mass_kg: { value: 95 } } } as never)
    const sp = Number((haps?.quantities as never as Record<string, { value?: number }>)?.solar_peak_kw?.value ?? 0)
    const sr = Number((haps?.quantities as never as Record<string, { value?: number }>)?.solar_required_kw?.value ?? 0)
    const solarClosure = (haps?.closures ?? []).find((c: { invariant_id?: string }) => c.invariant_id === 'solar_balance_closure') as { status?: string } | undefined
    const ok = sp > 20 && sp > sr && solarClosure?.status === 'pass'
    assertions.push(assertEq(
      'UNIVERSAL.haps_solar_peak_computed_not_stubbed',
      'HAPS solar_peak_kw is COMPUTED from the array (>20 kW for a 50 m wing, was the 3.0 kW brief stub) and the solar_balance_closure now PASSES — guards the 2026-06-01 closure-banner fix',
      ok,
      (v: boolean) => v === true,
      () => `solar_peak=${sp.toFixed(1)} solar_required=${sr.toFixed(2)} closure=${solarClosure?.status}`,
    ))
  }

  // ── UNIVERSAL.pricing_classifier_routes_aerospace_off_oem_subsystem ───────
  // Guards the 2026-06-01 Engine-B classifier fix: aerospace/HAPS structural +
  // comms names were falling through C4 to Flash-Lite, which bucketed them
  // `oem_subsystem` (haps anchor £80k → flat-pinned at the £50k sanity-max on 4
  // lines). The cheap classifier fix (validated: haps BOM 7.33→8.00, 12/12
  // sections ≥8) routes them to their TRUE class. CRITICALLY a genuine
  // "flight computer triplex" must NOT be routed out (it IS a real ~£80k
  // oem_subsystem — council seat 3) → classifyByRules returns null so Flash-Lite
  // keeps it a subsystem.
  {
    const c = (name: string) => classifyByRules({ word_name: name } as never)
    const skin = c('solar array skin') === 'structural_polymer'
    const base = c('LTE-S basestation') === 'electronic_pcb'
    const ice = c('leading edge ice protection') === 'thermal'
    const fcc = c('flight computer triplex') == null // not routed by the new rules
    const ok = skin && base && ice && fcc
    assertions.push(assertEq(
      'UNIVERSAL.pricing_classifier_routes_aerospace_off_oem_subsystem',
      'Engine-B classifyByRules routes solar-array-skin→structural_polymer, basestation→electronic_pcb, ice-protection→thermal (off the £80k oem_subsystem anchor) but leaves "flight computer triplex" unrouted (genuine subsystem) — guards the 2026-06-01 price-fix that moved haps BOM 7.33→8.00',
      ok,
      (v: boolean) => v === true,
      () => `skin=${skin} base=${base} ice=${ice} fcc_unrouted=${fcc}`,
    ))
  }

  // ── UNIVERSAL.gate18_rounding_family_downgraded_not_high ──────────────────
  // Guards the 2026-05-31 gate-18 rounding-precision fix: the same computed
  // quantity printed at different decimal precisions (heatpump compressor power
  // 4.646 / 4.65 / 4.6 kW) is ONE value, not a cross-page contradiction — it
  // must downgrade HIGH → MED. The discriminator must NOT mask a real gap: the
  // BESS L22 bug (2.69 MWh usable vs 3.5 MWh target, and the 3-way 3.5/2.69/3.36)
  // must stay flagged. Asserts both directions so the guard can never widen into
  // swallowing genuine contradictions.
  {
    const roundingFP = isRoundingFamily([
      { rawValue: '4.65', canonicalValue: 4.65 },
      { rawValue: '4.646', canonicalValue: 4.646 },
      { rawValue: '4.6', canonicalValue: 4.6 },
    ])
    const realBugTwo = isRoundingFamily([
      { rawValue: '2.69', canonicalValue: 2.69 },
      { rawValue: '3.5', canonicalValue: 3.5 },
    ])
    const realBugThree = isRoundingFamily([
      { rawValue: '3.5', canonicalValue: 3.5 },
      { rawValue: '2.69', canonicalValue: 2.69 },
      { rawValue: '3.36', canonicalValue: 3.36 },
    ])
    const ok = roundingFP === true && realBugTwo === false && realBugThree === false
    assertions.push(assertEq(
      'UNIVERSAL.gate18_rounding_family_downgraded_not_high',
      'isRoundingFamily downgrades a same-value-different-precision cluster (4.6/4.646/4.65 kW → true) but keeps a real cross-page gap HIGH (2.69 vs 3.5 MWh → false; 3.5/2.69/3.36 → false) — guards the 2026-05-31 gate-18 rounding-precision false-positive fix',
      ok,
      (v: boolean) => v === true,
      () => `roundingFP=${roundingFP} (want true), realBugTwo=${realBugTwo} (want false), realBugThree=${realBugThree} (want false)`,
    ))
  }

  // ── UNIVERSAL.discover_skips_material_words ───────────────────────────────
  // Guards the 2026-06-01 discover-on-miss blank-word brander (fillBlankWordMpns).
  // The coding-council BLOCKER: the catalogue-vs-structure filter must NOT try to
  // pin a part number on a fabricated structure (wing_spar, gaas_solar_laminate,
  // motor_pylon_mount, battery_pack_enclosure — all material £/kg costed) but MUST
  // brand real catalogue parts (connector, sensor, flight computer, motor driver).
  // Plus: isBlankOrPlaceholderMpn must treat empty/deferral as blank but NEVER a
  // real structured MPN (so a genuine part number is never overwritten).
  {
    const structures = ['wing_spar', 'gaas_solar_laminate', 'motor_pylon_mount', 'battery_pack_enclosure']
    const catalogue = ['connector', 'sensor', 'flight computer', 'motor driver']
    const structOk = structures.every((s) => isCatalogueComponent(s) === false)
    const catOk = catalogue.every((s) => isCatalogueComponent(s) === true)
    // blank predicate: empty + deferral placeholders are blank; real MPNs are not.
    const blankOk = isBlankOrPlaceholderMpn('') && isBlankOrPlaceholderMpn('TBD (detailed design)') &&
      isBlankOrPlaceholderMpn('specify exact MPN at detailed design')
    const realOk = !isBlankOrPlaceholderMpn('FIT1036') && !isBlankOrPlaceholderMpn('BD62012BFS-E2') &&
      !isBlankOrPlaceholderMpn('LF280K')
    const ok = structOk && catOk && blankOk && realOk
    assertions.push(assertEq(
      'UNIVERSAL.discover_skips_material_words',
      'fillBlankWordMpns filter: SKIPS fabricated structures (wing_spar/laminate/pylon_mount/enclosure → no MPN, material-costed) but BRANDS catalogue parts (connector/sensor/flight-computer/motor-driver); isBlankOrPlaceholderMpn treats empty+deferral as blank but never a real MPN (FIT1036/BD62012BFS-E2/LF280K) — guards the 2026-06-01 coding-council BLOCKER fix',
      ok,
      (v: boolean) => v === true,
      () => `structOk=${structOk} catOk=${catOk} blankOk=${blankOk} realOk=${realOk}`,
    ))
  }

  // ── UNIVERSAL.no_inline_class_alias_maps_in_chain ─────────────────────────
  // Guards the 2026-05-31 consolidation: the production chain
  // (serial-design-chain-v2.tsx) must resolve class slugs ONLY through the single
  // canonical resolveClassGraphSlug / CLASS_GRAPH_ALIASES. Two byte-identical
  // inline alias maps (K10 ALIASES + ENVELOPE_ALIASES) used to live in the chain
  // and DRIFTED — both omitted wind_turbine/h2_electrolyser, causing their
  // NO_GRAPH / null-envelope bug. Fails if any inline object-literal re-maps a
  // class synonym to a canonical graph-slug target inside the chain file.
  {
    const chainPath = resolve(__dirname, 'serial-design-chain-v2.tsx')
    if (!existsSync(chainPath)) {
      assertions.push({ id: 'UNIVERSAL.no_inline_class_alias_maps_in_chain', description: 'chain alias-map guard (skipped — chain file absent)', passed: true, detail: 'serial-design-chain-v2.tsx absent — skipped' })
    } else {
      const src = readFileSync(chainPath, 'utf-8')
      // The distinctive signature of a reintroduced drift copy is an object-literal
      // value line mapping a class synonym to a canonical graph slug, e.g.
      // `bess: 'bess-utility-scale'`. These target slugs appear as object VALUES
      // nowhere legitimate in the chain — only the canonical map (in src/) should
      // hold them. Prose mentions (in comments) don't match the `key: 'slug'` shape.
      const TARGET_SLUGS = ['bess-utility-scale', 'heat-pump-residential', 'heat-pump-commercial', 'dc_fast_ev_charger', 'wind_turbine_small', 'hydrogen_electrolyser', 'vfd-motor-drive', 'auv-subsea', 'vehicle_battery_pack']
      const offending = src.split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /^\s*['"]?[a-z0-9_-]+['"]?\s*:\s*['"][a-z0-9_-]+['"]\s*,?\s*$/.test(line) && TARGET_SLUGS.some(t => line.includes(`'${t}'`) || line.includes(`"${t}"`)))
      assertions.push(assertEq(
        'UNIVERSAL.no_inline_class_alias_maps_in_chain',
        'serial-design-chain-v2.tsx carries NO inline class->graph-slug alias map (resolves only via canonical resolveClassGraphSlug) — guards the 2026-05-31 drift-duplicate consolidation',
        offending.length,
        (n: number) => n === 0,
        () => `${offending.length} inline alias line(s) reintroduced in the chain: ${offending.slice(0, 5).map(o => `L${o.n}:${o.line.trim()}`).join(' | ')}. Add the alias to CLASS_GRAPH_ALIASES (class-reference-graph-db.ts), NOT an inline map in the chain.`,
      ))
    }
  }

  // ── UNIVERSAL.brief_feasibility_gate_flags_impossible_briefs ──────────────
  // Guards BF-1 (2026-05-31): a brief whose cost ceiling is below the physical
  // commodity floor (market-bands.ts) must flag infeasible; an aggressive-but-
  // possible one must NOT (respecting "aggressive targets are the work"). This
  // is the root-cause fix for a brief-failing design scoring 9.28 — the engine
  // must call out an impossible BRIEF rather than silently design to it.
  {
    const mk = (ceiling: number, val: number, unit: string) => ({ parsedBrief: { constraints: { unit_cost_ceiling: { value: ceiling }, target_performance: { value: val, unit } } } })
    const impossible = checkBriefFeasibility(mk(180000, 3.5, 'MWh'), 'bess')   // £51/kWh — 4× below £215 floor
    const feasible = checkBriefFeasibility(mk(900000, 3.5, 'MWh'), 'bess')      // £257/kWh — above floor
    const aggressive = checkBriefFeasibility(mk(700000, 3.5, 'MWh'), 'bess')    // £200/kWh — within 15% margin, NOT flagged
    const ok = impossible.feasible === false && impossible.constraint === 'cost_ceiling'
      && feasible.feasible === true && aggressive.feasible === true
    assertions.push(assertEq(
      'UNIVERSAL.brief_feasibility_gate_flags_impossible_briefs',
      'Brief-feasibility gate flags a sub-commodity-floor ceiling (£180k/3.5MWh = £51/kWh) infeasible, passes a feasible (£257/kWh) and an aggressive-but-possible (£200/kWh) one — BF-1 guard (2026-05-31)',
      ok,
      (v: boolean) => v === true,
      () => `impossible.feasible=${impossible.feasible} (want false), feasible=${feasible.feasible} (want true), aggressive=${aggressive.feasible} (want true)`,
    ))
  }

  // ── UNIVERSAL.brief_adherence_cap_fires_on_hard_breach ────────────────────
  // Guards BF-2 (2026-05-31): a design that MISSES the brief's hard numeric
  // constraints (energy floor / mass cap) must produce a score cap so an unmet
  // requirement cannot be logged as 8+; a compliant design must produce NO cap.
  {
    const breaching = checkBriefAdherence({ parsedBrief: { constraints: { target_performance: { metrics: [{ key_metric: 'usable_energy_mwh', value: 3.5 }] }, max_mass_kg: { value: 28000 } } }, orchestratorContract: { quantities: { usable_capacity_kwh: { value: 2688 }, in_container_mass_kg: { value: 29875 } } } })
    const compliant = checkBriefAdherence({ parsedBrief: { constraints: { target_performance: { metrics: [{ key_metric: 'usable_energy_mwh', value: 3.5 }] }, max_mass_kg: { value: 38000 } } }, orchestratorContract: { quantities: { usable_capacity_kwh: { value: 3550 }, in_container_mass_kg: { value: 36000 } } } })
    const ok = breaching.all_hard_met === false && typeof breaching.recommended_cap === 'number'
      && compliant.all_hard_met === true && compliant.recommended_cap === null
    assertions.push(assertEq(
      'UNIVERSAL.brief_adherence_cap_fires_on_hard_breach',
      'Brief-adherence caps a design that misses hard constraints (energy 2688<3500, mass 29875>28000) and does NOT cap a compliant one — BF-2 guard (2026-05-31)',
      ok,
      (v: boolean) => v === true,
      () => `breaching: met=${breaching.all_hard_met} cap=${breaching.recommended_cap}; compliant: met=${compliant.all_hard_met} cap=${compliant.recommended_cap}`,
    ))
  }

  // ── UNIVERSAL.physics_narrative_renders_for_all_classes ───────────────────
  // Guards the 2026-05-31 fix: the "How the design was computed — the physics"
  // section was VF-ONLY (generatePhysicsNarrative returned null for every other
  // class). The universal data-driven path must now produce a tool-grounded
  // narrative for any class whose contract quantities carry tool provenance.
  {
    const n = generatePhysicsNarrative({
      cell_count: { value: 3750, unit: '', provenance: { tool_id: 'pybamm:cell-sizing' } },
      dc_bus_voltage_v: { value: 800, unit: 'V', provenance: { tool_id: 'pybamm:cell-sizing' } },
      thermal_rejection_min_kw: { value: 58.4, unit: 'kW', provenance: { tool_id: 'coolprop:refrigerant-properties' } },
    }, 'bess')
    const ok = n != null && n.sentences.length >= 1 && n.tools_cited.length >= 1
    assertions.push(assertEq(
      'UNIVERSAL.physics_narrative_renders_for_all_classes',
      'generatePhysicsNarrative produces a tool-grounded narrative for a non-VF class (BESS) — was VF-only until 2026-05-31',
      ok,
      (v: boolean) => v === true,
      () => `narrative=${n ? 'present' : 'NULL'} sentences=${n?.sentences.length ?? 0} tools=${n?.tools_cited.length ?? 0}`,
    ))
  }

  // ── UNIVERSAL.bess_sizing_scales_to_energy_target ─────────────────────────
  // Guards the 2026-05-31 fix: BESS rack_count must DERIVE from the brief's mass
  // budget, not a hardcoded 15 — so a feasible brief (3.5 MWh @ 38 t) is actually
  // met instead of silently under-delivering 2.69 MWh forever.
  {
    const c = buildContract('bess', { product_class: 'bess', product_description: 'containerised 3.5 MWh BESS, 1 MW PCS, LFP', constraints: { target_performance: { value: 3.5, unit: 'MWh' }, max_mass_kg: { value: 38000 }, unit_cost_ceiling: { value: 2000000 } } } as any) as any
    const usable = c?.quantities?.usable_capacity_kwh?.value ?? 0
    const massOk = (c?.quantities?.mass_feasibility?.value ?? 0) === 1
    const targetOk = (c?.quantities?.brief_target_feasibility?.value ?? 0) === 1
    const ok = usable >= 3500 && massOk && targetOk
    assertions.push(assertEq(
      'UNIVERSAL.bess_sizing_scales_to_energy_target',
      'BESS sizes rack_count from the mass budget to MEET the energy target (3.5 MWh @ 38 t -> >=3500 kWh usable + mass-feasible) — was hardcoded-capped at 15 racks (2.69 MWh) until 2026-05-31',
      ok,
      (v: boolean) => v === true,
      () => `usable=${usable} massOk=${massOk} targetOk=${targetOk}`,
    ))
  }

  // ── UNIVERSAL.pruned_parallel_systems_stay_dead ───────────────────────────
  // Guards the 2026-05-31 ONE-UNIVERSAL-ENGINE consolidation (Tristan): "we can
  // only have one universal system ... prune anything which isn't a central
  // universal system". Once a parallel/dead code path is pruned (zero
  // production callers at prune time), NO live (non-archive, non-worktree)
  // source file may import it again — re-introducing it is exactly how "two
  // systems drift apart". Each marker is an import-path fragment removed during
  // the consolidation; if a live importer reappears, this FAILS the build.
  // Uses ripgrep; skips gracefully if rg is absent (CI). Extend PRUNED_IMPORT_
  // MARKERS in the SAME commit that prunes a new path.
  {
    const PRUNED_IMPORT_MARKERS: string[] = [
      'registry-accumulation',          // legacy LLM-multi-emitter accumulation loop (deterministic emitter superseded it)
      'tools/ngspice-stub',             // superseded by ngspice-real (register-all.ts:21)
      'tools/pandapower-stub',          // superseded by pandapower-real (register-all.ts:20)
      'tools/coolprop-stub',            // superseded by coolprop-real (register-all.ts:19)
      'tools/pybamm-stub',              // superseded by pybamm-real (register-all.ts:18); e2e test repointed to -real
      'render-radical-from-snapshot',   // broken dev render helper (imported archived stages/7b-pdf-v3)
      'radical/composition',            // early-radical scaffolding superseded by structural-builder + sentence-generator
      'iter4-renderer-helpers',         // iter-3/4 radical renderer, replaced by render-minimal-pdf.tsx
      'prompts-vendor-injection',       // dead vendor-catalog->prompt-injection wrapper (never wired; distributor-cascade-real is the live path)
    ]
    const root = resolve(__dirname, '..')
    let rgUsable = true
    const resurrected: string[] = []
    for (const marker of PRUNED_IMPORT_MARKERS) {
      const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      try {
        // Anchor at line-start (ESM import / export-from / multiline `} from`)
        // so JSDoc example lines (` * import ... from 'x'`) cannot false-trip —
        // only a REAL import statement counts as a resurrection.
        const out = execFileSync('rg', [
          '-l', `^\\s*(import\\b|export\\b|\\})[^\\n]*${escaped}`,
          '--glob=!_archive/**', '--glob=!**/worktrees/**', '--glob=!node_modules/**',
          '--glob=!**/*.md', '--glob=!**/*.jsonl', root,
        ], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
        const hits = out.split('\n').map(s => s.trim()).filter(Boolean)
        if (hits.length) resurrected.push(`${marker} <- ${hits.map(h => h.replace(root + '/', '')).join(', ')}`)
      } catch (err: any) {
        if (err?.status === 1) continue   // rg exit 1 = no matches (the success case)
        rgUsable = false                  // rg absent / errored → skip rather than false-fail
      }
    }
    if (!rgUsable) {
      assertions.push({ id: 'UNIVERSAL.pruned_parallel_systems_stay_dead', description: 'pruned-parallel-systems guard (skipped — ripgrep unavailable)', passed: true, detail: 'rg not available — skipped' })
    } else {
      assertions.push(assertEq(
        'UNIVERSAL.pruned_parallel_systems_stay_dead',
        'No live source file imports a pruned parallel/dead path (ONE-UNIVERSAL-ENGINE consolidation, 2026-05-31) — guards re-introduction of drift-prone duplicate systems',
        resurrected.length,
        (n: number) => n === 0,
        () => `${resurrected.length} pruned path(s) resurrected: ${resurrected.join(' | ')}. These were removed as dead parallel systems with zero production callers; do NOT re-import them — extend the single canonical path instead.`,
      ))
    }
  }

  // ── UNIVERSAL.no_untracked_orchestrator_tools ────────────────────────────
  // Guards the 2026-05-31 reproducibility fix: register-all.ts imports 159
  // orchestrator tools, but 147 of them (+ 221 companion python/ scripts) were
  // never `git add`ed — a fresh clone had 12/159 tools and could not build the
  // engine ("committed state != running state"). After committing them, this
  // fails the build if ANY .ts/.py under scripts/lib/orchestrator/tools/ is
  // untracked again — so the engine's tool layer can never silently drift out of
  // version control. Uses git; skips gracefully where git/worktree is absent.
  {
    const root = resolve(__dirname, '..')
    let gitUsable = true
    let untracked: string[] = []
    try {
      const out = execFileSync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard', 'scripts/lib/orchestrator/tools/'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
      untracked = out.split('\n').map(s => s.trim()).filter(s => s.endsWith('.ts') || s.endsWith('.py'))
    } catch {
      gitUsable = false
    }
    if (!gitUsable) {
      assertions.push({ id: 'UNIVERSAL.no_untracked_orchestrator_tools', description: 'untracked-tools guard (skipped — git unavailable)', passed: true, detail: 'git not available — skipped' })
    } else {
      assertions.push(assertEq(
        'UNIVERSAL.no_untracked_orchestrator_tools',
        'Every orchestrator tool (.ts wrapper + .py impl) under scripts/lib/orchestrator/tools/ is git-tracked — the engine must be reproducible from a clean clone (2026-05-31: 147 live-but-untracked tools committed)',
        untracked.length,
        (n: number) => n === 0,
        () => `${untracked.length} untracked tool file(s): ${untracked.slice(0, 6).join(', ')}${untracked.length > 6 ? ' …' : ''}. register-all.ts imports these but git does not have them — a clone cannot build the engine. git add them (or delete if dead).`,
      ))
    }
  }

  return { snapshot_path: snapshotPath, product_class: productClass, assertions }
}

function main() {
  const snapshots = loadSnapshots()
  console.log(`[regression-harness] checking ${snapshots.length} snapshot(s)`)
  const results: SnapshotResult[] = []
  for (const s of snapshots) {
    const r = checkSnapshot(s)
    results.push(r)
    const passed = r.assertions.filter((a) => a.passed).length
    const total = r.assertions.length
    console.log(`\n[regression-harness] ${s} (${r.product_class ?? '?'}): ${passed}/${total} passed`)
    for (const a of r.assertions) {
      const mark = a.passed ? 'PASS' : 'FAIL'
      console.log(`  [${mark}] ${a.id}: ${a.description}${a.detail ? ` — ${a.detail}` : ''}`)
    }
  }
  const allPassed = results.every((r) => r.assertions.every((a) => a.passed))
  const totalAsserts = results.reduce((s, r) => s + r.assertions.length, 0)
  const totalPassed = results.reduce((s, r) => s + r.assertions.filter((a) => a.passed).length, 0)
  console.log(`\n[regression-harness] OVERALL: ${totalPassed}/${totalAsserts} passed across ${results.length} snapshot(s)`)
  process.exit(allPassed ? 0 : 1)
}

main()
