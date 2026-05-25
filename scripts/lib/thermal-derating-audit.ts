/**
 * Thermal-derating audit — gate 16 (codified 2026-05-25, task #122).
 *
 * Universal across every product class that pins a liquid / packaged chiller.
 *
 * Root cause it addresses: the deterministic emitter previously hardcoded
 * chiller capacity at +35°C ambient (EN 14511 / AHRI 550/590 nominal) even
 * when the brief's `operating_environment.temp_max_c` was +50°C utility BESS
 * or +60°C HAPS gondola. Real chillers DERATE at higher ambient — Pfannenberg's
 * published curve shows ~40% capacity loss at +50°C vs +35°C. A 47 kW chiller
 * sized for +35°C delivers only 28 kW at +50°C; if the design load is 30 kW
 * the chiller cannot reject heat fast enough and the BESS thermal-runaway
 * protection trips out at peak load.
 *
 * Engineering contract addition (task #122): `ambient_design_temp_c` quantity
 * on every class contract (BESS today, others as the pattern propagates) +
 * deterministic emitter pulls it into the chiller-selection function (already
 * shipped in deterministic-emitter.ts: `selectPfannenbergEbXt`).
 *
 * Gate 16 audit (this file): for every chiller word in the BoM, looks up
 * the part's authoritative cooling_curve from parts-spec-validator's
 * KNOWN_PART_AUTHORITATIVE table, interpolates capacity at the design
 * ambient, compares against the design's system_thermal_dissipation_kw ×
 * safety factor. HIGH if derated capacity < design load × safety; exit 16.
 *
 * Distinct from gate 13 (parts-spec validator): gate 13 verifies the chain's
 * CLAIM about the chiller matches the datasheet (e.g. claimed 50 kW on a
 * 9 kW CC 90.000 fails gate 13). Gate 16 verifies the chiller's REAL
 * DATASHEET CAPACITY at the brief's ambient is enough for the design load.
 *
 *   gate 13 → "did the chain LIE about this part's spec?"
 *   gate 16 → "is the truth about this part's spec ENOUGH at this ambient?"
 *
 * Universal: every class that pins a chiller benefits. Adding a new chiller
 * model to KNOWN_PART_AUTHORITATIVE (with its cooling_curve) automatically
 * extends gate 16 coverage. Models WITHOUT a cooling_curve are skipped
 * (parts_unknown_ambient_curve) rather than false-flagged.
 *
 * Exit 16 on HIGH-severity finding (derated capacity × safety < design load).
 * MED / LOW findings are informational and do not block the chain.
 */

import { readFileSync } from 'node:fs'
import { KNOWN_PART_AUTHORITATIVE, type AuthSpec } from './parts-spec-validator'

// ── DERATING INTERPOLATION ──────────────────────────────────────────────────
// Interpolate a chiller's capacity at an arbitrary ambient from its published
// cooling_curve anchors. Linear interpolation between adjacent anchors;
// clamp below the lowest anchor (no over-performance) and above the highest
// (no extrapolation outside the published envelope).

export function interpolateCoolingCurveKw(
  curve: Array<{ ambient_c: number; capacity_kw: number }>,
  ambientC: number,
): number | null {
  if (!Array.isArray(curve) || curve.length === 0) return null
  if (!Number.isFinite(ambientC)) return null
  const sorted = [...curve].sort((a, b) => a.ambient_c - b.ambient_c)
  if (ambientC <= sorted[0].ambient_c) return sorted[0].capacity_kw
  if (ambientC >= sorted[sorted.length - 1].ambient_c) return sorted[sorted.length - 1].capacity_kw
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (ambientC >= a.ambient_c && ambientC <= b.ambient_c) {
      const t = (ambientC - a.ambient_c) / (b.ambient_c - a.ambient_c)
      return a.capacity_kw + t * (b.capacity_kw - a.capacity_kw)
    }
  }
  return sorted[sorted.length - 1].capacity_kw
}

// ── COLLECTORS ──────────────────────────────────────────────────────────────

interface EmittedChiller {
  word_id: string
  word_name_human: string
  module_id: string
  sub_module_id: string
  manufacturer: string | null
  part_number: string | null
  claimed_capacity_kw: number | null
  /** Optional derated-capacity claim from the `performance` modifier
   * ("derated to N kW @ Tc°C ambient"). Used as a sanity check against the
   * authoritative-curve interpolation but not as the primary input. */
  claimed_derated_capacity_kw: number | null
  claimed_derated_ambient_c: number | null
}

/** Parse a `capacity` modifier value like "47" / "47 kW" / "50,000 W". Returns kW. */
function parseCapacityKw(value: string): number | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/,/g, '').trim()
  // "47" or "47 kW"
  let m = cleaned.match(/^(\d+(?:\.\d+)?)\s*kW\b/i)
  if (m) return parseFloat(m[1])
  // Pure number (assume kW when emitted on a capacity modifier)
  m = cleaned.match(/^(\d+(?:\.\d+)?)$/)
  if (m) return parseFloat(m[1])
  return null
}

/** Parse a `performance` modifier of shape "derated to N kW @ Tc°C ambient". */
function parseDeratedClaim(value: string): { kw: number; ambient_c: number } | null {
  if (typeof value !== 'string') return null
  const m = value.match(/derated\s+to\s+(\d+(?:\.\d+)?)\s*kW\s*@\s*(\d+(?:\.\d+)?)\s*°?\s*C/i)
  if (!m) return null
  return { kw: parseFloat(m[1]), ambient_c: parseFloat(m[2]) }
}

/** Pull the manufacturer + part_number from a chiller word.
 *
 * Strategy (most-specific first):
 *   1. Explicit `manufacturer` + `part_number` modifiers (always preferred).
 *   2. Search the `form` modifier (and name_human) for ANY (manufacturer,
 *      part_number_pattern) pair from KNOWN_PART_AUTHORITATIVE that has a
 *      cooling_curve. Iterating through known chiller models guarantees the
 *      audit succeeds even when the chain emits all the part data inline in
 *      the form string (the common deterministic-emitter case for chillers).
 *      This is more permissive than parts-spec-validator's regex because
 *      chillers tend to have multi-word part numbers like "EB XT 500 WT"
 *      that don't pass a generic prefix-match heuristic.
 *   3. Generic two-token prefix regex (fallback for unknown manufacturers).
 */
function resolveManufacturerAndPart(
  word: any,
): { manufacturer: string | null; part_number: string | null } {
  const mods: Array<{ kind: string; value: string }> = Array.isArray(word?.modifier_characters)
    ? word.modifier_characters
    : []
  let manufacturer: string | null = null
  let part_number: string | null = null
  // 1. Explicit modifiers (deterministic emitter L22 onward sets these for
  // new chiller emissions; legacy state files won't have them).
  const mfrMod = mods.find((m) => m.kind === 'manufacturer')
  if (mfrMod && typeof mfrMod.value === 'string') manufacturer = mfrMod.value.trim()
  const pnMod = mods.find((m) => m.kind === 'part_number')
  if (pnMod && typeof pnMod.value === 'string') part_number = pnMod.value.trim()
  if (manufacturer && part_number) return { manufacturer, part_number }
  // 2. Search form / name_human for any known chiller pattern.
  const formMod = mods.find((m) => m.kind === 'form')
  const formText = typeof formMod?.value === 'string' ? formMod.value : ''
  const nameHuman = typeof word?.name_human === 'string' ? word.name_human : ''
  const searchSpace = `${formText} ${nameHuman}`
  for (const auth of KNOWN_PART_AUTHORITATIVE) {
    if (!Array.isArray(auth.cooling_curve) || auth.cooling_curve.length === 0) continue
    // Case-insensitive manufacturer-name search inside the text.
    const mfrRe = new RegExp(`\\b${auth.manufacturer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (!mfrRe.test(searchSpace)) continue
    // Walk the text after each manufacturer hit and try to match the part
    // pattern on the immediate trailing token sequence.
    const mfrMatch = searchSpace.match(mfrRe)
    if (!mfrMatch || mfrMatch.index === undefined) continue
    const tail = searchSpace.slice(mfrMatch.index + mfrMatch[0].length).trimStart()
    // Try matching the part pattern on progressively longer token spans
    // (up to 6 tokens — covers multi-word PNs like "EB XT 500 WT").
    const tokens = tail.split(/[\s,]+/).filter(Boolean).slice(0, 6)
    for (let i = tokens.length; i >= 1; i--) {
      const candidate = tokens.slice(0, i).join(' ').trim().replace(/[.,]$/, '')
      if (auth.part_number_pattern.test(candidate)) {
        return { manufacturer: auth.manufacturer, part_number: candidate }
      }
    }
  }
  // 3. Generic two-token prefix fallback.
  if (!manufacturer || !part_number) {
    const re = /^([A-Z][a-zA-Z0-9]{2,}(?:\s+[A-Z][a-zA-Z0-9]+)?)\s+([A-Za-z0-9][\w.-]*(?:\s+[A-Za-z0-9][\w.-]*){0,4})/
    const m = formText.match(re)
    if (m) {
      if (!manufacturer) manufacturer = m[1].trim()
      if (!part_number) part_number = m[2].trim()
    }
  }
  return { manufacturer, part_number }
}

/** Walk the design and collect every word whose content_character.character_id
 * is a chiller (liquid_chiller / liquid_cooling_chiller / enclosure_cooler /
 * packaged_chiller / etc.) OR whose word_id matches the same pattern. */
function collectChillerWords(state: any): EmittedChiller[] {
  const out: EmittedChiller[] = []
  const CHILLER_PATTERN = /chiller|cooling_unit|enclosure_cooler|packaged_cooler|cooling_module/i
  const modules: any[] = state?.moduleDecomposition?.modules ?? []
  for (const m of modules) {
    const moduleId = String(m?.module ?? m?.id ?? 'unknown')
    const subs: any[] = Array.isArray(m?.sub_modules) ? m.sub_modules : []
    for (const sm of subs) {
      const subId = String(sm?.id ?? sm?.sub_module_id ?? 'unknown')
      const words: any[] = Array.isArray(sm?.words) ? sm.words : []
      for (const w of words) {
        const wordId = String(w?.id ?? '')
        const charId = String(w?.content_character?.character_id ?? '')
        const nameHuman = String(w?.name_human ?? w?.content_character?.name_human ?? wordId)
        if (!CHILLER_PATTERN.test(wordId) && !CHILLER_PATTERN.test(charId)) continue
        const mods: Array<{ kind: string; value: string }> = Array.isArray(w?.modifier_characters)
          ? w.modifier_characters
          : []
        const { manufacturer, part_number } = resolveManufacturerAndPart(w)
        const capMod = mods.find((mc) => mc.kind === 'capacity')
        const claimedKw = capMod ? parseCapacityKw(String(capMod.value)) : null
        // Optional derated-capacity claim (emitted by deterministic emitter as
        // of task #122).
        const perfMod = mods.find((mc) => mc.kind === 'performance')
        const derated = perfMod ? parseDeratedClaim(String(perfMod.value)) : null
        out.push({
          word_id: wordId,
          word_name_human: nameHuman,
          module_id: moduleId,
          sub_module_id: subId,
          manufacturer,
          part_number,
          claimed_capacity_kw: claimedKw,
          claimed_derated_capacity_kw: derated?.kw ?? null,
          claimed_derated_ambient_c: derated?.ambient_c ?? null,
        })
      }
    }
  }
  return out
}

/** Find the authoritative cooling curve for a (manufacturer, part_number)
 * pair. Returns null if either is missing or the part isn't in the
 * authoritative table (handled as parts_unknown_ambient_curve by the audit). */
function findAuthCoolingCurve(
  manufacturer: string | null,
  part_number: string | null,
): { auth: AuthSpec; curve: Array<{ ambient_c: number; capacity_kw: number }> } | null {
  if (!manufacturer || !part_number) return null
  for (const auth of KNOWN_PART_AUTHORITATIVE) {
    if (auth.manufacturer.toLowerCase() !== manufacturer.toLowerCase()) continue
    if (!auth.part_number_pattern.test(part_number)) continue
    if (!Array.isArray(auth.cooling_curve) || auth.cooling_curve.length === 0) continue
    return { auth, curve: auth.cooling_curve }
  }
  return null
}

// ── DESIGN-LOAD CONTEXT ─────────────────────────────────────────────────────

interface ThermalContext {
  product_class: string
  ambient_design_temp_c: number
  /** The design's actual thermal-rejection load. Prefer pybamm-computed
   * system_thermal_dissipation_kw; fall back to thermal_rejection_min_kw /
   * 1.5 (the legacy field bakes in a 1.5× margin that's already accounted
   * for separately below). Otherwise inverter_dissipated_kw / 0.98 inverse
   * (rough estimate from continuous_power_kw × 2% loss). */
  system_thermal_dissipation_kw: number
  source_of_load: string
}

function buildThermalContext(state: any): ThermalContext {
  const product_class = String(
    state?.moduleDecomposition?.product_class ??
      state?.parsedBrief?.product_class ??
      state?.classify?.product_class ??
      'unknown',
  )
  const q = state?.orchestratorContract?.quantities ?? {}
  const briefMaxC = Number(
    state?.parsedBrief?.constraints?.operating_environment?.temp_max_c ??
      state?.briefBlock?.constraints?.operating_environment?.temp_max_c ??
      35,
  )
  const ambient =
    typeof q?.ambient_design_temp_c?.value === 'number'
      ? q.ambient_design_temp_c.value
      : briefMaxC
  let load: number
  let sourceOfLoad: string
  if (typeof q?.system_thermal_dissipation_kw?.value === 'number') {
    load = q.system_thermal_dissipation_kw.value
    sourceOfLoad = 'orchestratorContract.quantities.system_thermal_dissipation_kw'
  } else if (typeof q?.thermal_rejection_min_kw?.value === 'number') {
    // legacy field already baked in a 1.5× safety factor; reverse it for the
    // raw load comparison so we don't double-count when applying our own
    // safety factor below.
    load = q.thermal_rejection_min_kw.value / 1.5
    sourceOfLoad =
      'orchestratorContract.quantities.thermal_rejection_min_kw / 1.5 (legacy contract)'
  } else if (typeof q?.inverter_dissipated_kw?.value === 'number') {
    load = q.inverter_dissipated_kw.value
    sourceOfLoad = 'orchestratorContract.quantities.inverter_dissipated_kw'
  } else if (typeof q?.continuous_power_kw?.value === 'number') {
    load = q.continuous_power_kw.value * 0.02
    sourceOfLoad =
      'orchestratorContract.quantities.continuous_power_kw × 2% (rough PCS-loss estimate)'
  } else {
    load = 0
    sourceOfLoad = 'no thermal-load quantity present — audit cannot evaluate'
  }
  return {
    product_class,
    ambient_design_temp_c: ambient,
    system_thermal_dissipation_kw: load,
    source_of_load: sourceOfLoad,
  }
}

// ── AUDIT ───────────────────────────────────────────────────────────────────

export interface ThermalDeratingFinding {
  word_id: string
  word_name_human: string
  module_id: string
  sub_module_id: string
  manufacturer: string
  part_number: string
  ambient_design_temp_c: number
  nominal_capacity_kw: number
  derated_capacity_kw: number
  system_thermal_dissipation_kw: number
  safety_factor: number
  required_kw_at_ambient: number
  ratio: number
  severity: 'HIGH' | 'MED' | 'LOW'
  explanation: string
}

export interface ThermalDeratingAuditResult {
  findings: ThermalDeratingFinding[]
  chillers_checked: number
  chillers_unknown_part: number
  chillers_known_no_curve: number
  ambient_design_temp_c: number
  system_thermal_dissipation_kw: number
  source_of_load: string
  product_class: string
}

/** Engineering-margin factor — chiller must deliver ≥ design load × 1.20 at
 * the design ambient. Matches the universal sizing rule applied in the
 * deterministic emitter's `selectPfannenbergEbXt` and the order-of-magnitude
 * margin Pfannenberg's BESS application notes recommend (typically 15-25%
 * over instantaneous load for thermal headroom during peak charge / discharge
 * transients + chiller cycling losses). */
const THERMAL_MARGIN_FACTOR = 1.20

export function auditThermalDerating(state: any): ThermalDeratingAuditResult {
  const ctx = buildThermalContext(state)
  const chillers = collectChillerWords(state)
  const findings: ThermalDeratingFinding[] = []
  let chillers_checked = 0
  let chillers_unknown_part = 0
  let chillers_known_no_curve = 0

  for (const c of chillers) {
    const lookup = findAuthCoolingCurve(c.manufacturer, c.part_number)
    if (!lookup) {
      // Either no PN extracted OR PN doesn't match an authoritative entry
      // with a cooling_curve. Treat as parts_unknown rather than false-flag.
      if (c.manufacturer && c.part_number) {
        // Known PN format but no cooling_curve — entry exists but lacks the
        // ambient-derating data (treat as 'known but no check').
        const isInTableAtAll = KNOWN_PART_AUTHORITATIVE.some(
          (a) =>
            a.manufacturer.toLowerCase() === c.manufacturer!.toLowerCase() &&
            a.part_number_pattern.test(c.part_number!),
        )
        if (isInTableAtAll) {
          chillers_known_no_curve += 1
        } else {
          chillers_unknown_part += 1
        }
      } else {
        chillers_unknown_part += 1
      }
      continue
    }
    chillers_checked += 1
    const nominalKw = lookup.auth.cooling_curve![0].capacity_kw  // first anchor = nominal (lowest ambient)
    const deratedKw = interpolateCoolingCurveKw(lookup.curve, ctx.ambient_design_temp_c) ?? 0
    const requiredKw = ctx.system_thermal_dissipation_kw * THERMAL_MARGIN_FACTOR
    if (requiredKw <= 0) continue  // nothing to compare against
    const ratio = deratedKw / requiredKw
    if (ratio >= 1.0) continue  // chiller is adequately sized — no finding
    let severity: 'HIGH' | 'MED' | 'LOW'
    if (ratio < 0.6) severity = 'HIGH'
    else if (ratio < 0.85) severity = 'MED'
    else severity = 'LOW'
    findings.push({
      word_id: c.word_id,
      word_name_human: c.word_name_human,
      module_id: c.module_id,
      sub_module_id: c.sub_module_id,
      manufacturer: lookup.auth.manufacturer,
      part_number: c.part_number ?? '<no-part-number>',
      ambient_design_temp_c: ctx.ambient_design_temp_c,
      nominal_capacity_kw: nominalKw,
      derated_capacity_kw: deratedKw,
      system_thermal_dissipation_kw: ctx.system_thermal_dissipation_kw,
      safety_factor: THERMAL_MARGIN_FACTOR,
      required_kw_at_ambient: requiredKw,
      ratio,
      severity,
      explanation:
        `${lookup.auth.manufacturer} ${c.part_number} delivers ${deratedKw.toFixed(1)} kW at the brief's ` +
        `${ctx.ambient_design_temp_c}°C design ambient (nominal ${nominalKw} kW @ 35°C, derated ` +
        `per published cooling_curve). Design thermal-rejection load is ` +
        `${ctx.system_thermal_dissipation_kw.toFixed(1)} kW (${ctx.source_of_load}); with the ` +
        `${THERMAL_MARGIN_FACTOR}× engineering margin the required capacity at ambient is ` +
        `${requiredKw.toFixed(1)} kW. Chiller delivers ${(ratio * 100).toFixed(0)}% of required ` +
        `(${(1 / ratio).toFixed(2)}× undersized at design ambient). ` +
        `Fix: pick a larger Pfannenberg EB XT model (selectPfannenbergEbXt in deterministic-emitter.ts) ` +
        `or accept multiple chillers in parallel for redundancy.`,
    })
  }
  return {
    findings,
    chillers_checked,
    chillers_unknown_part,
    chillers_known_no_curve,
    ambient_design_temp_c: ctx.ambient_design_temp_c,
    system_thermal_dissipation_kw: ctx.system_thermal_dissipation_kw,
    source_of_load: ctx.source_of_load,
    product_class: ctx.product_class,
  }
}

// ── CLI ENTRYPOINT ──────────────────────────────────────────────────────────
// Usage: npx tsx scripts/lib/thermal-derating-audit.ts <statePath> [outMdPath]
// Exit code 16 on any HIGH-severity finding.

function renderMarkdown(result: ThermalDeratingAuditResult, statePath: string): string {
  const lines: string[] = []
  lines.push(`# Thermal-Derating Audit (gate 16) — ${statePath}`)
  lines.push('')
  lines.push(
    `**${result.chillers_checked} chiller(s) checked** at +${result.ambient_design_temp_c}°C design ambient ` +
      `vs ${result.system_thermal_dissipation_kw.toFixed(1)} kW design thermal load ` +
      `(source: ${result.source_of_load}). ` +
      `${result.chillers_unknown_part} chiller(s) not in authoritative table (no validation). ` +
      `${result.chillers_known_no_curve} chiller(s) known but lacking a cooling_curve.`,
  )
  lines.push('')
  lines.push(`Product class: \`${result.product_class}\`.`)
  lines.push('')
  if (result.findings.length === 0) {
    lines.push(`PASS — every pinned chiller delivers >= design load x ${THERMAL_MARGIN_FACTOR} safety at +${result.ambient_design_temp_c}C ambient.`)
    return lines.join('\n')
  }
  const high = result.findings.filter((f) => f.severity === 'HIGH')
  const med = result.findings.filter((f) => f.severity === 'MED')
  const low = result.findings.filter((f) => f.severity === 'LOW')
  lines.push(`FAIL — ${result.findings.length} finding(s): ${high.length} HIGH, ${med.length} MED, ${low.length} LOW.`)
  lines.push('')
  const sorted = [...result.findings].sort((a, b) => {
    const order = { HIGH: 0, MED: 1, LOW: 2 }
    return order[a.severity] - order[b.severity]
  })
  for (const f of sorted) {
    lines.push(`## [${f.severity}] ${f.manufacturer} ${f.part_number} — undersized ${(1 / f.ratio).toFixed(2)}x at +${f.ambient_design_temp_c}C`)
    lines.push(`- **Module:** ${f.module_id} -> ${f.sub_module_id}`)
    lines.push(`- **Word ID:** ${f.word_id} (${f.word_name_human})`)
    lines.push(`- **Nominal capacity (+35C):** ${f.nominal_capacity_kw} kW`)
    lines.push(`- **Derated capacity (+${f.ambient_design_temp_c}C):** ${f.derated_capacity_kw.toFixed(1)} kW`)
    lines.push(`- **Design thermal load:** ${f.system_thermal_dissipation_kw.toFixed(1)} kW`)
    lines.push(`- **Required (load x ${f.safety_factor} safety):** ${f.required_kw_at_ambient.toFixed(1)} kW`)
    lines.push(`- **Ratio:** ${(f.ratio * 100).toFixed(0)}% of required`)
    lines.push(`- **Reason:** ${f.explanation}`)
    lines.push('')
  }
  return lines.join('\n')
}

const argv1 = process.argv[1] ?? ''
const isMain = /thermal-derating-audit\.(?:ts|js|mjs|cjs)$/.test(argv1)

if (isMain) {
  const statePath = process.argv[2]
  const outMdPath = process.argv[3]
  if (!statePath) {
    console.error('Usage: thermal-derating-audit <statePath> [outMdPath]')
    process.exit(1)
  }
  let state: any
  try {
    state = JSON.parse(readFileSync(statePath, 'utf-8'))
  } catch (err) {
    console.error(`[thermal-derating-audit] failed to read ${statePath}: ${(err as Error).message}`)
    process.exit(1)
  }
  const result = auditThermalDerating(state)
  const md = renderMarkdown(result, statePath)
  if (outMdPath) {
    const fs = require('node:fs') as typeof import('node:fs')
    fs.writeFileSync(outMdPath, md, 'utf-8')
    console.log(`[thermal-derating-audit] wrote ${outMdPath}`)
  } else {
    console.log(md)
  }
  const high = result.findings.filter((f) => f.severity === 'HIGH')
  if (high.length > 0) {
    console.error(`[thermal-derating-audit] FAIL: ${high.length} HIGH-severity finding(s)`)
    process.exit(16)
  }
  console.log(
    `[thermal-derating-audit] PASS: ${result.chillers_checked} chiller(s) checked, ${result.findings.length} findings ` +
      `(${result.findings.filter((f) => f.severity === 'MED').length} MED, ${result.findings.filter((f) => f.severity === 'LOW').length} LOW)`,
  )
}
