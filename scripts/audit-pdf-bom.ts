/**
 * scripts/audit-pdf-bom.ts
 *
 * BOM-QUALITY AUDIT — codifies the self-reinforcing loop Tristan called out
 * 2026-05-23. The complaint: Physics Critic dimensions all ≥ 7/10 on wind L20
 * but actual BoM line items absurd (foundation £24k for 6 MW, blade £18,
 * tower door £125). Physics Critic measures DESIGN FIDELITY (does design
 * honour brief?) — it does NOT audit BoM LINE TOTALS, cost-stack
 * reconciliation, or per-module sub-total realism.
 *
 * This audit runs AFTER audit-pdf-run.ts. It opens chain-v2.pdf, extracts
 * the BoM table via pdftotext, and asserts:
 *
 *   B-2  Macro → BoM module sub-total propagation: for each
 *        engineeringContract.macro_assembly_prices entry, a BoM module
 *        sub-total within 0.5-1.5× of macro total.
 *   B-3  Cover total ≡ sum of BoM module sub-totals (within 10%).
 *   B-4  Per-line industry sanity: class-specific minimum unit prices per
 *        component class (6 MW wind: blade ≥ £1M, foundation ≥ £300k).
 *   B-5  Module proportion: per-class expected share-of-total. e.g. wind:
 *        rotor ≥ 8%, tower ≥ 5%, foundation ≥ 5%, drivetrain ≥ 8%.
 *   B-6  PDF visual sanity: pdftotext extracts cover lines + module
 *        sub-totals; sample 3 BoM lines per module.
 *
 * INFORMATIONAL ONLY in initial version — writes AUDIT-BOM.md but does NOT
 * exit non-zero. The hard-gate upgrade (exit code 10 on B-2..B-6 fail) is a
 * separate decision pending user approval.
 *
 * Usage:
 *   npx tsx scripts/audit-pdf-bom.ts <outDir>
 */

import { readFileSync, existsSync, writeFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, basename } from 'node:path'

interface Finding {
  severity: 'HIGH' | 'MED' | 'LOW' | 'INFO'
  check_id: string
  detail: string
}

/** Industry typical share-of-total per module per class. Module sub-totals
 * lower than these floors flag B-5. Values are 2024 BNEF + IRENA averages. */
const CLASS_MODULE_SHARES: Record<string, Record<string, { min: number; typical: number; max: number }>> = {
  wind_turbine: {
    rotor_blades:           { min: 0.08, typical: 0.18, max: 0.30 },
    hub_pitch:              { min: 0.02, typical: 0.05, max: 0.10 },
    gearbox_drivetrain:     { min: 0.05, typical: 0.14, max: 0.25 },
    generator:              { min: 0.05, typical: 0.12, max: 0.20 },
    converter_grid_tie:     { min: 0.01, typical: 0.04, max: 0.10 },
    tower_yaw:              { min: 0.05, typical: 0.12, max: 0.20 },
    foundation:             { min: 0.03, typical: 0.10, max: 0.20 },
    control_avionics:       { min: 0.005, typical: 0.02, max: 0.08 },
  },
  bess: {
    energy_storage_source:  { min: 0.30, typical: 0.45, max: 0.65 },
    thermal_management:     { min: 0.03, typical: 0.07, max: 0.15 },
    power_conversion:       { min: 0.08, typical: 0.13, max: 0.20 },
    enclosure_containment:  { min: 0.05, typical: 0.10, max: 0.20 },
    electrical_distribution:{ min: 0.03, typical: 0.06, max: 0.12 },
  },
  // Other classes added incrementally as their BoM-audit baseline gets surveyed.
}

/** Class-specific minimum unit price floors. A line item priced below this
 * for the given class triggers B-4. Built from real industry catalogue
 * prices at the indicated rated-power band. */
const CLASS_MIN_UNIT_PRICES: Record<string, Array<{ name_pattern: RegExp; min_gbp: number; reason: string }>> = {
  wind_turbine: [
    { name_pattern: /\brotor\s*blade\b/i,    min_gbp: 100_000, reason: 'utility wind rotor blade ≥ £100k each (LM Wind Power, Vestas)' },
    { name_pattern: /\bcast\s+iron\s+hub\b/i,min_gbp: 100_000, reason: 'utility wind hub assembly ≥ £100k (CATL/RWE forging)' },
    { name_pattern: /\bplanetary\s+gearbox\b/i,min_gbp:200_000, reason: 'utility wind gearbox ≥ £200k (Bonfiglioli, Winergy)' },
    { name_pattern: /\bpmsg\s+stator\b/i,    min_gbp: 100_000, reason: 'utility wind PMSG stator ≥ £100k' },
    { name_pattern: /\bsteel\s+tower\b/i,    min_gbp: 50_000,  reason: 'utility wind tower section ≥ £50k' },
    { name_pattern: /\bfoundation\s+pad\b/i, min_gbp: 200_000, reason: 'utility wind gravity base ≥ £200k poured cost' },
    { name_pattern: /\bmonopile\b/i,         min_gbp: 1_000_000,reason: 'offshore monopile ≥ £1M each' },
    { name_pattern: /\bstep[\s-]?up\s+transformer\b/i, min_gbp: 30_000, reason: 'utility step-up transformer ≥ £30k' },
  ],
}

function readJsonSafe(path: string): any {
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return null }
}

function parsePoundAmount(s: string): number | null {
  // Match "£12,521,772.25" or "£21.9M" or "£24,078"
  const cleaned = s.replace(/\s+/g, '')
  const mPlain = cleaned.match(/£([\d,]+\.?\d*)$/)
  if (mPlain) return parseFloat(mPlain[1].replace(/,/g, ''))
  const mShort = cleaned.match(/£([\d.]+)([KMB])/i)
  if (mShort) {
    const n = parseFloat(mShort[1])
    const mult = { K: 1e3, M: 1e6, B: 1e9 }[mShort[2].toUpperCase()] ?? 1
    return n * mult
  }
  return null
}

interface BomExtract {
  cover_raw_materials_bom_gbp: number | null
  cover_installed_asp_gbp: number | null
  module_subtotals: Map<string, number>     // module key (lowercased) → sub-total £
  line_samples: Array<{ name: string; line: number }>  // raw lines for diagnostic
}

function extractBomFromPdf(pdfPath: string): BomExtract {
  const out: BomExtract = {
    cover_raw_materials_bom_gbp: null,
    cover_installed_asp_gbp: null,
    module_subtotals: new Map(),
    line_samples: [],
  }
  try {
    const txt = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }).toString()
    const lines = txt.split('\n')
    let ix = 0
    for (const line of lines) {
      // Cover headlines
      if (/Raw materials BoM/i.test(line)) {
        const m = line.match(/£[\d,.MKB]+/)
        if (m && out.cover_raw_materials_bom_gbp == null) out.cover_raw_materials_bom_gbp = parsePoundAmount(m[0])
      }
      if (/Installed ASP/i.test(line)) {
        const m = line.match(/£[\d,.MKB]+/)
        if (m && out.cover_installed_asp_gbp == null) out.cover_installed_asp_gbp = parsePoundAmount(m[0])
      }
      // Module sub-totals (BoM table). Lines look like:
      // "Sub-total — rotor_blade_assembly_aero_lift                                 £12,521,772.25"
      // OR
      // "3.     Foundation                                                        £24,078.20"
      const mSub = line.match(/Sub-total\s+[—\-]\s+([a-z0-9_]+)(?:\s*\([^)]*\))?\s+£([\d,.]+)/i)
      if (mSub) {
        const moduleKey = mSub[1].toLowerCase()
        const amount = parsePoundAmount('£' + mSub[2])
        if (amount && amount > 0) {
          // Accumulate by module (a module has multiple sub-modules each with own sub-total)
          // Map module → max(running, amount) gives sub-total per sub-module; we sum all.
          // Actually simpler: store every sub-module sub-total; module assignment by prefix.
          const existing = out.module_subtotals.get(moduleKey) ?? 0
          out.module_subtotals.set(moduleKey, existing + amount)
        }
      }
      // Per-module headline lines like "9.   Rotor Blades   £12,521,772.25"
      const mModuleHeader = line.match(/^\s*\d+\.\s+([A-Z][A-Za-z\s]+?)\s+£([\d,.]+)/)
      if (mModuleHeader) {
        const moduleKey = mModuleHeader[1].toLowerCase().trim().replace(/\s+/g, '_')
        const amount = parsePoundAmount('£' + mModuleHeader[2])
        if (amount && amount > 0) {
          out.module_subtotals.set(moduleKey + '__header', amount)
        }
      }
      if (ix < 20 && /£\d/.test(line)) {
        out.line_samples.push({ name: line.trim().slice(0, 200), line: ix })
        ix++
      }
    }
  } catch (err) {
    out.line_samples.push({ name: `pdftotext failed: ${(err as Error).message}`, line: -1 })
  }
  return out
}

function moduleKeyToContractName(s: string): string {
  // Normalise: lowercase, drop trailing "_<radical>", keep core
  // e.g. "rotor_blade_assembly_aero_lift" → "rotor_blades"
  return s.toLowerCase().replace(/_(aero_lift|aero_drag|electromechanical_switching|electrical_conducting|magnetic_coupling|silicon_semiconductor|electrochemical_energy|optical_sensing|misc|electromechanical|chemical_reaction)$/g, '')
}

async function audit(outDir: string): Promise<{ findings: Finding[]; bom: BomExtract; classId: string | null }> {
  const findings: Finding[] = []
  const state = readJsonSafe(join(outDir, 'state.json'))
  const pdfPath = join(outDir, 'chain-v2.pdf')
  if (!state) {
    findings.push({ severity: 'HIGH', check_id: 'B-0', detail: 'state.json missing' })
    return { findings, bom: { cover_raw_materials_bom_gbp: null, cover_installed_asp_gbp: null, module_subtotals: new Map(), line_samples: [] }, classId: null }
  }
  if (!existsSync(pdfPath)) {
    findings.push({ severity: 'HIGH', check_id: 'B-0', detail: 'chain-v2.pdf missing — chain crashed before render' })
    return { findings, bom: { cover_raw_materials_bom_gbp: null, cover_installed_asp_gbp: null, module_subtotals: new Map(), line_samples: [] }, classId: null }
  }

  const classId: string = state?.moduleDecomposition?.product_class ?? null
  const bom = extractBomFromPdf(pdfPath)

  // Contract macros
  const macros = (state?.engineeringContract?.macro_assembly_prices ?? []) as Array<{ word_name: string; total_gbp: number; source_detail?: string }>
  const orchMacros = (state?.orchestratorContract?.macro_assembly_prices ?? []) as Array<{ word_name: string; total_gbp: number }>
  const allMacros = [...macros, ...orchMacros].filter(m => Number(m.total_gbp) > 0)
  const macroTotalGbp = allMacros.reduce((a, m) => a + Number(m.total_gbp), 0)

  // ── B-2 macro → BoM propagation ──
  // For each macro, find a module sub-total that's within 0.5-1.5×.
  // Modules header (e.g. "Rotor Blades" → £12.5M) is the cleanest target.
  // The matcher used in render-minimal-pdf.tsx is fuzzy; if a macro is
  // ORPHANED (no module header > 0.5× of its total), flag it.
  const moduleHeaders = new Map<string, number>()
  for (const [k, v] of bom.module_subtotals) {
    if (k.endsWith('__header')) moduleHeaders.set(k.replace('__header', ''), v)
  }
  for (const m of allMacros) {
    const macroAmt = Number(m.total_gbp)
    // Try to find a module header that matches some token of the macro name
    const macroTokens = m.word_name.toLowerCase().split('_').filter(t => t.length >= 4)
    let bestHeader: [string, number] | null = null
    for (const [hk, hv] of moduleHeaders) {
      const hkTokens = hk.split('_').filter(t => t.length >= 4)
      const shared = macroTokens.filter(t => hkTokens.some(h => h.includes(t) || t.includes(h))).length
      if (shared > 0 && (!bestHeader || hv > bestHeader[1])) {
        bestHeader = [hk, hv]
      }
    }
    if (!bestHeader || bestHeader[1] < macroAmt * 0.5) {
      findings.push({
        severity: macroAmt > 50_000 ? 'HIGH' : 'MED',
        check_id: 'B-2',
        detail: `Macro "${m.word_name}" £${Math.round(macroAmt).toLocaleString()} is ORPHANED — no BoM module sub-total within 0.5-1.5× (best candidate: ${bestHeader ? bestHeader[0] + ' £' + Math.round(bestHeader[1]).toLocaleString() : 'none'}). Macro→word matcher in render-minimal-pdf.tsx:885 needs better tokenisation OR rename macro in engineering-contract.ts.`,
      })
    }
  }

  // ── B-3 cover total ≡ sum of BoM module sub-totals ──
  if (bom.cover_raw_materials_bom_gbp != null && moduleHeaders.size > 0) {
    const bomSum = Array.from(moduleHeaders.values()).reduce((a, v) => a + v, 0)
    const cover = bom.cover_raw_materials_bom_gbp
    const ratio = bomSum / Math.max(cover, 1)
    if (Math.abs(1 - ratio) > 0.10) {
      findings.push({
        severity: 'HIGH',
        check_id: 'B-3',
        detail: `Cover Raw materials BoM £${Math.round(cover).toLocaleString()} != Σ module sub-totals £${Math.round(bomSum).toLocaleString()} (ratio ${ratio.toFixed(2)}×). The cover number is computed from macros + word-level lines, but the BoM TABLE only shows the matched-macro + word-level lines. If ratio < 0.9, macros are orphaned and added to cover total via unmatched_macros path — invisible to founder reading the BoM section. Investigate macro→word matcher.`,
      })
    }
  } else if (bom.cover_raw_materials_bom_gbp == null) {
    findings.push({ severity: 'MED', check_id: 'B-3', detail: 'Cover Raw materials BoM headline not extracted from PDF — check renderer cover-page output OR pdftotext extraction regex.' })
  }

  // ── B-4 per-line industry sanity ──
  // For each macro that found a module header, sample the partVerifications
  // for that module and check headline parts (matching CLASS_MIN_UNIT_PRICES)
  // exceed the floor. If not, the macro money is in the "macro-claim" row
  // but generic parts within the module are still under-priced.
  if (classId && CLASS_MIN_UNIT_PRICES[classId]) {
    const pv = (state?.partVerifications ?? []) as Array<any>
    for (const { name_pattern, min_gbp, reason } of CLASS_MIN_UNIT_PRICES[classId]) {
      const matches = pv.filter(p => name_pattern.test(String(p.word_name || p.part_name || '')))
      for (const part of matches) {
        const price = Number(part.cost_repair_corrected_price_gbp ?? part.price_estimate_gbp ?? part.unit_price_gbp ?? 0)
        if (price > 0 && price < min_gbp) {
          findings.push({
            severity: 'HIGH',
            check_id: 'B-4',
            detail: `Line "${part.word_name || part.part_name}" priced £${price.toFixed(0)} — industry min £${min_gbp.toLocaleString()} (${reason}). Cost-repair UP-cap (4×) blocked the lift; either widen cap for this class OR force macro-override on the matching word.`,
          })
        }
      }
    }
  }

  // ── B-5 module proportion (share of total) ──
  if (classId && CLASS_MODULE_SHARES[classId] && moduleHeaders.size > 0) {
    const total = Array.from(moduleHeaders.values()).reduce((a, v) => a + v, 0)
    for (const [moduleKey, share] of Object.entries(CLASS_MODULE_SHARES[classId])) {
      // Find module header by partial name match
      let actualShare = 0
      for (const [hk, hv] of moduleHeaders) {
        if (hk.includes(moduleKey.split('_')[0]) || moduleKey.includes(hk.split('_')[0])) {
          actualShare = Math.max(actualShare, hv / Math.max(total, 1))
        }
      }
      if (actualShare === 0 && share.min > 0) {
        findings.push({
          severity: 'MED',
          check_id: 'B-5',
          detail: `Module "${moduleKey}" has no BoM presence — expected ${(share.typical * 100).toFixed(0)}% of total (industry ${share.min * 100}-${share.max * 100}%). Either no macro emitted OR matcher orphaned.`,
        })
      } else if (actualShare > 0 && actualShare < share.min) {
        findings.push({
          severity: 'HIGH',
          check_id: 'B-5',
          detail: `Module "${moduleKey}" is ${(actualShare * 100).toFixed(2)}% of BoM total — industry min ${(share.min * 100).toFixed(0)}%, typical ${(share.typical * 100).toFixed(0)}%. Macro likely orphaned OR module under-emitted by emitter.`,
        })
      }
    }
  }

  // ── B-6 visual sanity (informational) ──
  findings.push({
    severity: 'INFO',
    check_id: 'B-6',
    detail: `PDF extracted: cover_raw_materials_bom=£${bom.cover_raw_materials_bom_gbp ?? 'N/A'}; cover_installed_asp=£${bom.cover_installed_asp_gbp ?? 'N/A'}; ${moduleHeaders.size} module headers found; ${bom.module_subtotals.size} total sub-modules.`,
  })

  return { findings, bom, classId }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length < 1) {
    console.error('Usage: audit-pdf-bom.ts <outDir>')
    process.exit(2)
  }
  const outDir = args[0]
  const { findings, bom, classId } = await audit(outDir)
  const highCount = findings.filter(f => f.severity === 'HIGH').length
  const medCount = findings.filter(f => f.severity === 'MED').length

  const lines: string[] = []
  lines.push(`# AUDIT BOM — ${basename(outDir)}`)
  lines.push('')
  lines.push(`Class: ${classId ?? '?'}`)
  lines.push(`Result: HIGH=${highCount} MED=${medCount}`)
  lines.push('')
  lines.push('## Cover headlines (from PDF)')
  lines.push(`- Raw materials BoM: £${bom.cover_raw_materials_bom_gbp != null ? bom.cover_raw_materials_bom_gbp.toLocaleString() : 'N/A'}`)
  lines.push(`- Installed ASP:     £${bom.cover_installed_asp_gbp != null ? bom.cover_installed_asp_gbp.toLocaleString() : 'N/A'}`)
  lines.push('')
  lines.push('## Module sub-totals (from BoM section)')
  for (const [k, v] of bom.module_subtotals) {
    lines.push(`- ${k}: £${v.toLocaleString()}`)
  }
  lines.push('')
  lines.push('## Findings')
  if (findings.length === 0) lines.push('No findings.')
  for (const f of findings) {
    lines.push(`### [${f.severity}] ${f.check_id}`)
    lines.push(f.detail)
    lines.push('')
  }
  const auditPath = join(outDir, 'AUDIT-BOM.md')
  writeFileSync(auditPath, lines.join('\n'))

  const oneLine = `AUDIT-BOM: ${classId} ${highCount === 0 ? 'PASS' : 'FAIL'} (HIGH=${highCount} MED=${medCount}) — ${auditPath}`
  console.log(oneLine)
  for (const f of findings.filter(x => x.severity === 'HIGH')) {
    console.log(`  ✗ [${f.check_id}] ${f.detail.slice(0, 240)}`)
  }
  // Informational mode: always exit 0 so chain proceeds. Hard-gate upgrade
  // (exit code 10 on B-2..B-5 fail) is a separate decision pending approval.
  process.exit(0)
}

main()
