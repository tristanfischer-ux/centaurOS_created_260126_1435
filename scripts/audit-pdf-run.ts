/**
 * scripts/audit-pdf-run.ts
 *
 * UNIVERSAL PER-PDF AUDIT — runs after every chain produces a PDF, surfaces
 * regressions the operator would otherwise miss.
 *
 * Codifies the audit checks I should have been doing on every chain run
 * (instead of waiting for the user to spot regressions visually). Triggered
 * automatically by the chain at end-of-run, OR manually:
 *
 *   npx tsx scripts/audit-pdf-run.ts <outDir>
 *
 * Outputs an AUDIT.md file in the outDir + a one-line stdout summary with
 * a non-zero exit code if any HIGH-severity check fails.
 *
 * Checks (each maps to a known bug class — codified 2026-05-23 after the
 * user pointed out I was not self-correcting per-PDF):
 *
 *   D-1  Sub-module density vs reference (≥2.0 mean — splitter floor)
 *   D-2  Word density per sub-module (≥5 words — BoM grade)
 *   D-3  Word count vs median of past runs in same class (regression detector)
 *
 *   F-1  Physics Critic brief_to_design_fidelity ≥ 6/10 (gate)
 *   F-2  Physics Critic engineering_plausibility ≥ 6/10
 *   F-3  Physics Critic internal_coherence ≥ 6/10
 *   F-4  Physics Critic HIGH-severity issues = 0
 *
 *   B-1  contract.quantities scale-key value matches brief target (within 2×)
 *        — catches the kLa-as-volume bug class (10 L vessel vs 200 L brief)
 *
 *   G-1  G0-G4 deterministic gates all pass (chain-emitted)
 *   G-2  Orchestrator path ACTUALLY ran (not silent LLM fallback)
 *
 * Severity:
 *   HIGH  → exit code 1, blocks downstream use
 *   MED   → emit warning, no block
 *   LOW   → informational only
 */

import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, basename, dirname } from 'node:path'

// Industry-typical installed ASP per unit of rated capacity, GBP. Used to
// flag cost models that are >3× under or over benchmark.
// Sources: BNEF 2024, IEA 2023, Bioplan 2023, Wood Mackenzie 2024.
const INSTALLED_ASP_BENCHMARKS: Record<string, { unit: 'mw' | 'kwh' | 'l' | 'kw_thermal' | 'kw_charge'; gbp_per_unit_low: number; gbp_per_unit_high: number; capacity_key: string }> = {
  wind_turbine:         { unit: 'mw',         gbp_per_unit_low:    800_000, gbp_per_unit_high: 1_500_000, capacity_key: 'rated_power_kw' },
  solar_inverter:       { unit: 'kw_charge',  gbp_per_unit_low:         80, gbp_per_unit_high:       250, capacity_key: 'rated_power_kw' },
  h2_electrolyser:      { unit: 'kw_charge',  gbp_per_unit_low:        800, gbp_per_unit_high:     2_500, capacity_key: 'rated_power_kw' },
  bess:                 { unit: 'kwh',        gbp_per_unit_low:        200, gbp_per_unit_high:       400, capacity_key: 'nameplate_capacity_kwh' },
  bioreactor:           { unit: 'l',          gbp_per_unit_low:        500, gbp_per_unit_high:     2_000, capacity_key: 'working_volume_l' },
  heat_pump_residential:{ unit: 'kw_thermal', gbp_per_unit_low:        600, gbp_per_unit_high:     1_200, capacity_key: 'rated_thermal_kw' },
  ev_charger:           { unit: 'kw_charge',  gbp_per_unit_low:        300, gbp_per_unit_high:     1_000, capacity_key: 'rated_power_kw' },
  ups_inverter:         { unit: 'kw_charge',  gbp_per_unit_low:        400, gbp_per_unit_high:     1_200, capacity_key: 'rated_power_kw' },
  pemfc:                { unit: 'kw_charge',  gbp_per_unit_low:      1_500, gbp_per_unit_high:     4_000, capacity_key: 'rated_power_kw' },
  smr:                  { unit: 'mw',         gbp_per_unit_low:  4_000_000, gbp_per_unit_high: 8_000_000, capacity_key: 'rated_power_kw' },
}

interface AuditFinding {
  severity: 'HIGH' | 'MED' | 'LOW'
  check_id: string
  detail: string
}

interface AuditReport {
  outDir: string
  class_id: string | null
  scale_tier: string | null
  findings: AuditFinding[]
  density: { mods: number; subs: number; words: number; mean_subs_per_mod: number; mean_words_per_sub: number }
  physics_scores: Record<string, number>
  passed: boolean
}

const args = process.argv.slice(2)
if (args.length < 1) {
  console.error('Usage: audit-pdf-run.ts <outDir>')
  process.exit(2)
}
const outDir = args[0]

function readJsonSafe(path: string): any {
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return null }
}

function densityOf(state: any) {
  const mods = (state?.moduleDecomposition?.modules ?? []) as Array<{ sub_modules?: Array<{ words?: unknown[] }> }>
  let subs = 0
  let words = 0
  for (const m of mods) {
    const ss = m.sub_modules ?? []
    subs += ss.length
    for (const s of ss) words += (s.words ?? []).length
  }
  return {
    mods: mods.length,
    subs,
    words,
    mean_subs_per_mod: mods.length > 0 ? subs / mods.length : 0,
    mean_words_per_sub: subs > 0 ? words / subs : 0,
  }
}

function siblingMedianDensity(classId: string | null, currentOut: string): { mods: number; subs: number; words: number } | null {
  if (!classId) return null
  // Look in /tmp/test-*/state.json for past runs of same class
  const tmp = '/tmp'
  const dirs: string[] = []
  for (const d of readdirSync(tmp)) {
    if (!d.startsWith('test-') || join(tmp, d) === currentOut) continue
    const full = join(tmp, d)
    try { if (statSync(full).isDirectory() && existsSync(join(full, 'state.json'))) dirs.push(full) } catch {}
  }
  // Filter to same class via the state.json's product_class
  const matchedDensities: Array<{ mods: number; subs: number; words: number }> = []
  for (const d of dirs) {
    const s = readJsonSafe(join(d, 'state.json'))
    const pc = s?.moduleDecomposition?.product_class
    if (pc === classId) {
      const dx = densityOf(s)
      matchedDensities.push({ mods: dx.mods, subs: dx.subs, words: dx.words })
    }
  }
  if (matchedDensities.length === 0) return null
  // Return median
  const med = (vs: number[]) => { const sorted = [...vs].sort((a,b)=>a-b); return sorted[Math.floor(sorted.length/2)] }
  return {
    mods: med(matchedDensities.map(x => x.mods)),
    subs: med(matchedDensities.map(x => x.subs)),
    words: med(matchedDensities.map(x => x.words)),
  }
}

function detectBriefVolumeFromText(text: string): number | null {
  // Look for "X L working volume", "X litre", "X-litre", "working volume: X L" patterns
  const patterns = [
    /(?:nominal|working|design|rated)\s+volume[\s:]{0,8}(\d{1,4}(?:,\d{3})*|\d{1,5})\s*(?:l|litre|liter)/i,
    /(\d{1,4}(?:,\d{3})*|\d{1,5})\s*-?\s*(?:l|litre|liter)\s+(?:bioreactor|reactor|vessel|working)/i,
    /(\d{1,4}(?:,\d{3})*|\d{1,5})\s*l\s+(?:single[\s-]?use|stainless|reusable)/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return parseFloat(m[1].replace(/,/g, ''))
  }
  return null
}

async function audit(): Promise<AuditReport> {
  const findings: AuditFinding[] = []
  const state = readJsonSafe(join(outDir, 'state.json'))
  const crit = readJsonSafe(join(outDir, '7-5-physics-critique.json'))
  const briefText = existsSync(join(outDir, '0-original-brief.md'))
    ? readFileSync(join(outDir, '0-original-brief.md'), 'utf-8')
    : ''

  if (!state) {
    findings.push({ severity: 'HIGH', check_id: 'INPUT', detail: 'state.json missing' })
    return { outDir, class_id: null, scale_tier: null, findings, density: { mods:0,subs:0,words:0,mean_subs_per_mod:0,mean_words_per_sub:0 }, physics_scores: {}, passed: false }
  }

  const classId = state?.moduleDecomposition?.product_class ?? null
  const scaleTier = state?.engineeringContract?.envelope?.scale_tier
    ?? state?.orchestratorContract?.envelope?.scale_tier
    ?? null
  const d = densityOf(state)

  // ── D-1 sub-module density ──
  if (d.mean_subs_per_mod < 2.0) {
    findings.push({
      severity: 'HIGH',
      check_id: 'D-1',
      detail: `Sub-module density ${d.mean_subs_per_mod.toFixed(2)} per module — below floor 2.0. Splitter should have raised this. Investigate scripts/lib/orchestrator/submodule-splitter.ts.`,
    })
  }

  // ── D-2 word density per sub-module ──
  if (d.mean_words_per_sub < 5.0 && d.subs > 0) {
    findings.push({
      severity: 'MED',
      check_id: 'D-2',
      detail: `Mean words per sub-module ${d.mean_words_per_sub.toFixed(2)} — below BoM floor of 5. Each sub-module needs 5-7 parts for procurement-grade BoM. Reviewer LLM should add words; if it didn't, prompt may need strengthening.`,
    })
  }

  // ── D-3 regression vs siblings ──
  const sibMed = siblingMedianDensity(classId, outDir)
  if (sibMed) {
    const wordsDelta = (d.words - sibMed.words) / Math.max(sibMed.words, 1)
    if (wordsDelta < -0.30) {
      findings.push({
        severity: 'HIGH',
        check_id: 'D-3',
        detail: `Words ${d.words} vs sibling median ${sibMed.words} — ${(wordsDelta*100).toFixed(0)}% regression. Check for upstream regression.`,
      })
    } else if (wordsDelta < -0.10) {
      findings.push({
        severity: 'MED',
        check_id: 'D-3',
        detail: `Words ${d.words} vs sibling median ${sibMed.words} — ${(wordsDelta*100).toFixed(0)}% below historical norm.`,
      })
    }
  }

  // ── F-1..F-4 physics critic ──
  const scores: Record<string, number> = (crit?.scores ?? {}) as Record<string, number>
  const fidelity = Number(scores.brief_to_design_fidelity ?? 0)
  const plausibility = Number(scores.engineering_plausibility ?? 0)
  const coherence = Number(scores.internal_coherence ?? 0)
  if (crit) {
    if (fidelity < 6) findings.push({ severity: 'HIGH', check_id: 'F-1', detail: `Physics Critic brief_to_design_fidelity=${fidelity}/10 — emitter/contract is not honouring brief values. Likely a contract-builder bug (engineering-contract.ts) or emitter hardcoded constants. See PHYSICS CRITIC ISSUES section below.` })
    if (plausibility < 6) findings.push({ severity: 'MED', check_id: 'F-2', detail: `Physics Critic engineering_plausibility=${plausibility}/10.` })
    if (coherence < 6) findings.push({ severity: 'MED', check_id: 'F-3', detail: `Physics Critic internal_coherence=${coherence}/10.` })
    const issues = (crit?.issues ?? []) as Array<{ severity?: string }>
    const highIssues = issues.filter(i => i?.severity === 'high').length
    if (highIssues > 0) {
      findings.push({ severity: 'HIGH', check_id: 'F-4', detail: `Physics Critic flagged ${highIssues} HIGH-severity engineering issues. See full list in 7-5-physics-critique.json.` })
    }
  } else {
    findings.push({ severity: 'MED', check_id: 'F-0', detail: 'Physics Critic verdict file missing — could not assess fidelity.' })
  }

  // ── B-1 brief-to-contract scale match (bioreactor-specific for now; extend per-class) ──
  if (classId === 'bioreactor' && briefText) {
    const briefVolL = detectBriefVolumeFromText(briefText)
    const contractWorkingVolL = state?.engineeringContract?.quantities?.working_volume_l?.value
      ?? state?.orchestratorContract?.quantities?.working_volume_l?.value
    if (briefVolL && contractWorkingVolL) {
      const ratio = contractWorkingVolL / briefVolL
      if (ratio < 0.5 || ratio > 2.0) {
        findings.push({
          severity: 'HIGH',
          check_id: 'B-1',
          detail: `Brief says ${briefVolL} L working volume but contract.quantities.working_volume_l = ${contractWorkingVolL} L (ratio ${ratio.toFixed(2)}×). Contract builder in scripts/lib/engineering-contract.ts:1773-1796 likely reading target_performance with wrong unit semantics (e.g. kLa hr⁻¹ misinterpreted as L). Fix: route through Normaliser.`,
        })
      }
    }
  }

  // ── G-2 orchestrator actually ran ──
  const orchRan = !!state?.orchestratorContract
  if (!orchRan) {
    findings.push({ severity: 'HIGH', check_id: 'G-2', detail: 'Orchestrator did NOT run (no state.orchestratorContract). Chain fell back to LLM Generator path silently. Set ORCHESTRATOR=1 and ensure ALLOW_LLM_FALLBACK is not set.' })
  }

  // ── C-1 cost benchmark vs industry £/unit-capacity ──
  // Catches the wind-turbine bug class: 6 MW reported as £73k installed (60-90× too low).
  if (classId && INSTALLED_ASP_BENCHMARKS[classId]) {
    const benchmark = INSTALLED_ASP_BENCHMARKS[classId]
    const capQ = state?.orchestratorContract?.quantities?.[benchmark.capacity_key]
      ?? state?.engineeringContract?.quantities?.[benchmark.capacity_key]
    const capacityRaw = Number(capQ?.value)
    let capacityInBenchmarkUnit = capacityRaw
    if (benchmark.unit === 'mw' && benchmark.capacity_key.endsWith('_kw')) capacityInBenchmarkUnit = capacityRaw / 1000
    const installedAsp = Number(state?.headlineDerived?.installedAsp ?? state?.performanceCard?.installed_asp_gbp ?? 0)
    if (Number.isFinite(capacityInBenchmarkUnit) && capacityInBenchmarkUnit > 0 && installedAsp > 0) {
      const aspPerUnit = installedAsp / capacityInBenchmarkUnit
      const tooLow = aspPerUnit < benchmark.gbp_per_unit_low / 3
      const tooHigh = aspPerUnit > benchmark.gbp_per_unit_high * 3
      if (tooLow || tooHigh) {
        const ratio = tooLow ? (benchmark.gbp_per_unit_low / aspPerUnit) : (aspPerUnit / benchmark.gbp_per_unit_high)
        findings.push({
          severity: 'HIGH',
          check_id: 'C-1',
          detail: `Installed ASP £${installedAsp.toLocaleString()} for ${capacityInBenchmarkUnit.toFixed(2)} ${benchmark.unit} = £${Math.round(aspPerUnit).toLocaleString()}/${benchmark.unit}. Industry benchmark £${benchmark.gbp_per_unit_low.toLocaleString()}-${benchmark.gbp_per_unit_high.toLocaleString()}/${benchmark.unit}. Off by ${ratio.toFixed(1)}× (${tooLow ? 'under' : 'over'}). Likely: emitter uses buildMinimalContract (empty macro_assembly_prices) so cost-stack only sums word-level part prices, missing big-ticket items. Fix: have emitter create words mirroring macros, OR include unmatched macros in BoM total.`,
        })
      }
    }
  }

  // ── V-1 visual PDF text-overlap check via pdftotext ──
  // 2026-05-23: refined to filter known table patterns. Previous version
  // flagged 136 false-positives on wind L13 — all legitimate BoM/compliance
  // rows. The real wrap={false} overlap bug surfaces as REPEATED tokens on
  // a single Y position (two text blocks stacked → same word visible twice)
  // OR mixed prose + table on the same line. Strict filter list below.
  const pdfPath = join(outDir, 'chain-v2.pdf')
  if (existsSync(pdfPath)) {
    try {
      const txt = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }).toString()
      const lines = txt.split('\n')

      // Known table-row patterns that flatten to 4+ fragments under pdftotext -layout.
      // Adding a table here when a new table type appears is cheaper than blacklisting
      // individual columns. Each pattern MUST be specific to a header or unambiguous
      // data-row signature.
      const KNOWN_TABLE_PATTERNS: Array<{ name: string; test: (s: string) => boolean }> = [
        { name: 'bom_header',         test: s => /PART NUMBER|MANUFAC-|LINE \(£\)|UNIT \(£\)/i.test(s) },
        { name: 'bom_data',           test: s => /×\d+\s+~?£|Est\.\s+(OK|<\.5x|>2x|-)\s*$|\sgrade_[a-d]\s/i.test(s) },
        { name: 'compliance_header',  test: s => /\bCODE\b.*\bSTANDARD\b.*\b(JURIS|STATUS)\b/i.test(s) },
        { name: 'compliance_data',    test: s => /\b(IEC|ISO|EN|DNV|ANSI|ASTM|UL|IEEE)\s+[0-9-]+:\d{4}/i.test(s) && /(Mandatory|Recommended|industry|optional)/i.test(s) },
        { name: 'fmea_header',        test: s => /SEVERITY.*LIKELIHOOD|RISK PRIORITY/i.test(s) },
        { name: 'pending_parts_card', test: s => /LOW CONFIDENCE|UNCERTAIN|Plausible but Unverified/i.test(s) },
        { name: 'tools_used',         test: s => /reference_paper|underlying_math|results_interpretation/i.test(s) },
      ]
      const matchesKnownTable = (line: string): string | null => {
        for (const p of KNOWN_TABLE_PATTERNS) if (p.test(line)) return p.name
        return null
      }

      // Real overlap signal: 4+ disparate fragments AND either (a) a token
      // appears 2+ times on the same line (indicates two text blocks landed
      // at the same Y with overlapping content) OR (b) the line mixes
      // lowercase prose words with all-caps table headers.
      const hasRepeatedToken = (line: string): boolean => {
        const tokens = line.trim().split(/\s+/).filter(t => t.length >= 4 && /^[A-Za-z]+$/.test(t))
        const seen = new Map<string, number>()
        for (const t of tokens) seen.set(t.toLowerCase(), (seen.get(t.toLowerCase()) ?? 0) + 1)
        for (const [tok, n] of seen) {
          // Words like 'and' 'the' 'for' under length-4 filter, so any repeat is suspect
          if (n >= 2) return true
        }
        return false
      }
      const hasMixedProseAndCaps = (line: string): boolean => {
        const tokens = line.trim().split(/\s+/).filter(t => t.length >= 4)
        if (tokens.length < 5) return false
        const allCaps = tokens.filter(t => /^[A-Z]+$/.test(t)).length
        const lower = tokens.filter(t => /^[a-z]/.test(t) && t.length > 4).length
        return allCaps >= 2 && lower >= 3
      }

      let overlapLines = 0
      let tableLines = 0
      const overlapSamples: string[] = []
      const tablesByType = new Map<string, number>()
      for (const line of lines) {
        const fragments = line.split(/\s{4,}/).filter(s => /[A-Za-z]{3,}/.test(s) && s.length > 3)
        if (fragments.length < 4) continue
        const tableName = matchesKnownTable(line)
        if (tableName) {
          tableLines++
          tablesByType.set(tableName, (tablesByType.get(tableName) ?? 0) + 1)
          continue
        }
        // Apply positive-overlap signal
        if (hasRepeatedToken(line) || hasMixedProseAndCaps(line)) {
          overlapLines++
          if (overlapSamples.length < 3) overlapSamples.push(line.trim().slice(0, 200))
        }
      }
      if (overlapLines > 5) {
        findings.push({
          severity: 'HIGH',
          check_id: 'V-1',
          detail: `Detected ${overlapLines} lines with TRUE overlap signal (repeated token or mixed prose+caps on same Y). Excluded ${tableLines} known-table rows. React-pdf wrap={false} blocks exceeding page-remaining height stack on existing content. First sample: "${overlapSamples[0]?.slice(0, 150)}". Fix area: scripts/render-minimal-pdf.tsx sub-module render block.`,
        })
      } else if (overlapLines > 0) {
        findings.push({
          severity: 'MED',
          check_id: 'V-1',
          detail: `${overlapLines} suspect overlap line(s) (under HIGH threshold). Excluded ${tableLines} table rows. First: "${overlapSamples[0]?.slice(0, 120)}".`,
        })
      } else if (tableLines > 0) {
        findings.push({
          severity: 'LOW',
          check_id: 'V-1',
          detail: `No overlap detected. Skipped ${tableLines} table rows (BoM/compliance/FMEA/pending).`,
        })
      }
    } catch (err) {
      findings.push({ severity: 'LOW', check_id: 'V-1', detail: `pdftotext failed: ${(err as Error).message.slice(0, 80)}` })
    }
  }

  const passed = !findings.some(f => f.severity === 'HIGH')

  return {
    outDir,
    class_id: classId,
    scale_tier: scaleTier,
    findings,
    density: d,
    physics_scores: scores,
    passed,
  }
}

async function main() {
  const report = await audit()
  const highCount = report.findings.filter(f => f.severity === 'HIGH').length
  const medCount = report.findings.filter(f => f.severity === 'MED').length

  const lines: string[] = []
  lines.push(`# AUDIT — ${basename(report.outDir)}`)
  lines.push('')
  lines.push(`Class: ${report.class_id ?? '?'} / ${report.scale_tier ?? '?'}`)
  lines.push(`Passed: ${report.passed ? '✓' : '✗'}   HIGH: ${highCount}   MED: ${medCount}`)
  lines.push('')
  lines.push('## Density')
  lines.push(`- modules: ${report.density.mods}`)
  lines.push(`- sub_modules: ${report.density.subs}  (mean ${report.density.mean_subs_per_mod.toFixed(2)} per module)`)
  lines.push(`- words: ${report.density.words}  (mean ${report.density.mean_words_per_sub.toFixed(2)} per sub-module)`)
  lines.push('')
  lines.push('## Physics Critic')
  for (const [k, v] of Object.entries(report.physics_scores)) lines.push(`- ${k}: ${v}/10`)
  lines.push('')
  lines.push('## Findings')
  if (report.findings.length === 0) {
    lines.push('No findings — all checks passed.')
  } else {
    for (const f of report.findings) {
      lines.push(`### [${f.severity}] ${f.check_id}`)
      lines.push(f.detail)
      lines.push('')
    }
  }
  const auditPath = join(report.outDir, 'AUDIT.md')
  writeFileSync(auditPath, lines.join('\n'))

  const oneLine = `AUDIT: ${report.class_id}/${report.scale_tier} ${report.passed ? 'PASS' : 'FAIL'} (HIGH=${highCount} MED=${medCount}) — ${auditPath}`
  console.log(oneLine)
  // Print HIGH findings to stdout so the chain operator sees them without opening AUDIT.md
  for (const f of report.findings.filter(x => x.severity === 'HIGH')) {
    console.log(`  ✗ [${f.check_id}] ${f.detail.slice(0, 220)}`)
  }
  process.exit(report.passed ? 0 : 1)
}

main()
