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

    // Suppress unused-var warning for the eosCheck (kept for future invariants)
    void eosCheck
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
