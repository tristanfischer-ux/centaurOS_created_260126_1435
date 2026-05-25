/**
 * scripts/lib/part-reality-check.ts — Stage 10.5: Part Reality Check
 *
 * Council item #2 from BESS L23 verdict (2026-05-25). Blocks hallucinated MPNs
 * AT EMISSION TIME (pre-render), rather than catching them post-render via gate
 * 20 (fictional-pn-audit.ts).
 *
 * Root cause it addresses: BESS L23 emitted Sungrow SC1000UD-MV — the CORE
 * subsystem of the design (1 MW PCS inverter). The part does not exist in any
 * distributor catalogue. Gate 20 caught it post-render after 137 Nexar calls
 * had already been burned and the PDF had already been rendered. This stage
 * intercepts the same check PRE-render, and attempts substitution from the
 * Stage 17.6 library candidates when a real alternative exists.
 *
 * Behaviour for each BoM word:
 *   1. PASS   — MPN found in at least one distributor cascade hit → do nothing.
 *   2. SUBSTITUTE — MPN fictional + library candidates for this component class
 *                   contain a candidate whose own MPN is confirmed real in the
 *                   cascade → swap the word's modifier_characters (manufacturer +
 *                   part_number) with the library candidate. Log action_type=
 *                   'part_substitution' to actions.jsonl.
 *   3. WARN   — MPN fictional + no real library candidate exists for this class
 *                → log action_type='part_reality_warning' with severity HIGH.
 *                Gate 20 remains as the post-render safety net.
 *
 * Differences from gate 20 (fictional-pn-audit.ts):
 *   - Part Reality Check is PRE-render and SUBSTITUTES when possible.
 *   - Gate 20 is POST-render and BLOCKS (exit 20) on any HIGH finding.
 *   - They are complementary: Reality Check reduces the gate 20 HIGH count
 *     before the render. Gate 20 still runs as the hard backstop on anything
 *     this stage couldn't fix.
 *
 * CLI usage:
 *   npx tsx scripts/lib/part-reality-check.ts <statePath> <libCandidatesPath> [--write-back]
 *
 * Exit codes:
 *   0  — completed (substitutions and/or warnings logged; no fatal error)
 *   1  — IO or runtime error
 *
 * --write-back: patch state.json in-place (the chain passes this flag). Without
 *   the flag the patched state is written to <statePath>.reality-checked.json.
 *
 * Quota conservation: same 4-native-first, Nexar-last-resort cascade as gate 20.
 *   All distributor calls go through the cascade-cache (dd51b9383) so repeated
 *   runs on the same BoM incur zero additional quota cost.
 *
 * Semaphore: max 3 concurrent distributor fan-outs (same as gate 20).
 *
 * Pre-change mempalace search: "reviewer R1 R4 specialist library override part
 * picking" → 3 drawers loaded. "stage 17.6 RAG library candidates BESS" →
 * 5 drawers loaded. "deterministic-emitter hardcoded MPN claim" → 5 drawers.
 * "fictional part number gate 20 hallucination" → 5 drawers.
 *
 * British spelling throughout.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── DISTRIBUTOR IMPORTS ──────────────────────────────────────────────────────
// Mirror fictional-pn-audit.ts: dynamic require so the compiler doesn't demand
// exact types at the import site. These are the same cached distributor wrappers
// wired in dd51b9383.

const distDir = resolve(__dirname, '../../src/lib/pdf-engine-v2/lib/distributors')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { lookupSkuMouser } = require(resolve(distDir, 'mouser')) as typeof import('../../src/lib/pdf-engine-v2/lib/distributors/mouser')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { lookupSkuDigikey } = require(resolve(distDir, 'digikey')) as typeof import('../../src/lib/pdf-engine-v2/lib/distributors/digikey')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { lookupSkuFarnell } = require(resolve(distDir, 'farnell')) as typeof import('../../src/lib/pdf-engine-v2/lib/distributors/farnell')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { lookupSkuLcsc } = require(resolve(distDir, 'lcsc')) as typeof import('../../src/lib/pdf-engine-v2/lib/distributors/lcsc')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { lookupSkuNexar } = require(resolve(distDir, 'nexar')) as typeof import('../../src/lib/pdf-engine-v2/lib/distributors/nexar')

// ── CURATED-TABLE SKIP ───────────────────────────────────────────────────────
// Parts in KNOWN_PART_AUTHORITATIVE are gate 13's domain. Reality Check skips
// them (gate 13 validates their spec claims; the part is known to exist).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { KNOWN_PART_AUTHORITATIVE } = require('./parts-spec-validator') as typeof import('./parts-spec-validator')

function isInCuratedTable(mpn: string, manufacturer: string | null): boolean {
  if (!mpn) return false
  const mpnNorm = mpn.trim()
  const mfrNorm = manufacturer?.trim().toLowerCase() ?? ''
  return KNOWN_PART_AUTHORITATIVE.some(
    (entry: { manufacturer: string; part_number_pattern: RegExp }) => {
      const mfrOk = !mfrNorm ||
        entry.manufacturer.toLowerCase().includes(mfrNorm) ||
        mfrNorm.includes(entry.manufacturer.toLowerCase())
      return mfrOk && entry.part_number_pattern.test(mpnNorm)
    },
  )
}

// ── COMMODITY / SKIP PATTERNS ────────────────────────────────────────────────
// Copied from fictional-pn-audit.ts — commodity descriptors that are valid but
// not findable via exact MPN search. Substituting these would be noise.
const COMMODITY_SKIP_REGEX = /^(?:M\d{1,2}(?:\.\d)?\s*(?:x\s*\d+)?|generic|standard|n\/?a|tbd|various|custom|bespoke|oem|\d{1,4}mm?\s*(?:angle|plate|rod|tube|pipe|cable|wire|bracket|channel|gland|trunking)?|\d+(?:\.\d+)?\s*(?:A|V|W|kW|kVA|kWh|MWh|Hz|mm|m|kg)\s*[-_/]?\s*\w*)$/i
const SHORT_ALPHANUMERIC_REGEX = /^[A-Za-z0-9]{1,4}$/

// ── EXISTENCE CHECK ──────────────────────────────────────────────────────────
// 4 native distributors in parallel, Nexar only as last resort.

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T | null> {
  const abort = new AbortController()
  const timer = setTimeout(
    () => abort.abort(new Error(`[part-reality-check] ${label} timed out after ${ms}ms`)),
    ms,
  )
  try {
    const result = await promise
    clearTimeout(timer)
    return result
  } catch {
    clearTimeout(timer)
    return null
  }
}

interface ExistenceResult {
  real: boolean
  sources: string[]
  nexar_tried: boolean
}

async function checkExists(
  mpn: string,
  manufacturer: string | null,
): Promise<ExistenceResult> {
  const TIMEOUT_MS = 8_000

  const [m, d, f, l] = await Promise.all([
    withTimeout(lookupSkuMouser(mpn).catch(() => null), TIMEOUT_MS, `mouser:${mpn}`),
    withTimeout(lookupSkuDigikey(mpn).catch(() => null), TIMEOUT_MS, `digikey:${mpn}`),
    withTimeout(lookupSkuFarnell(mpn).catch(() => null), TIMEOUT_MS, `farnell:${mpn}`),
    withTimeout(lookupSkuLcsc(mpn).catch(() => null), TIMEOUT_MS, `lcsc:${mpn}`),
  ])

  function mfrCompatible(row: { manufacturer?: string } | null): boolean {
    if (!row) return false
    if (!manufacturer?.trim()) return true
    const decl = manufacturer.trim().toLowerCase()
    const rowMfr = (row.manufacturer ?? '').toLowerCase()
    if (!rowMfr) return true
    return rowMfr.includes(decl) || decl.includes(rowMfr)
  }

  const hits1: string[] = []
  if (mfrCompatible(m)) hits1.push('mouser')
  if (mfrCompatible(d)) hits1.push('digikey')
  if (mfrCompatible(f)) hits1.push('farnell')
  if (mfrCompatible(l)) hits1.push('lcsc')

  if (hits1.length > 0) {
    return { real: true, sources: hits1, nexar_tried: false }
  }

  const n = await withTimeout(lookupSkuNexar(mpn).catch(() => null), TIMEOUT_MS, `nexar:${mpn}`)
  if (n && mfrCompatible(n)) {
    return { real: true, sources: ['nexar'], nexar_tried: true }
  }
  return { real: false, sources: [], nexar_tried: true }
}

// ── SEMAPHORE ────────────────────────────────────────────────────────────────

async function withSemaphore<T>(
  sem: { slots: number },
  fn: () => Promise<T>,
): Promise<T> {
  while (sem.slots <= 0) {
    await new Promise((res) => setTimeout(res, 50))
  }
  sem.slots -= 1
  try {
    return await fn()
  } finally {
    sem.slots += 1
  }
}

// ── WORD COLLECTION ──────────────────────────────────────────────────────────
// Mirror collectBomLines() from fictional-pn-audit.ts, but track the full
// path so we can mutate the word in-place.

interface WordRef {
  word: any          // direct object reference (mutable)
  mpn: string
  manufacturer: string | null
  word_id: string
  module_id: string
  sub_module_id: string
  component_class: string | null   // content_character.function_radical_primary → class hint
}

function collectWordRefs(state: any): WordRef[] {
  const out: WordRef[] = []
  const modules: any[] =
    state?.moduleDecomposition?.modules ??
    state?.module_decomposition?.modules ??
    state?.modules ??
    []
  for (const m of modules) {
    const mid = String(m?.module ?? m?.id ?? m?.module_id ?? 'unknown')
    const subs: any[] = Array.isArray(m?.sub_modules)
      ? m.sub_modules
      : Array.isArray(m?.submodules) ? m.submodules : []
    for (const sm of subs) {
      const sid = String(sm?.id ?? sm?.sub_module_id ?? sm?.name ?? 'unknown')
      const wordArrays: any[][] = [sm?.words, sm?.components, sm?.parts, sm?.items]
      for (const wa of wordArrays) {
        if (!Array.isArray(wa)) continue
        for (const w of wa) {
          if (!w || typeof w !== 'object') continue
          const mods: Array<{ kind: string; value: string }> = Array.isArray(w?.modifier_characters)
            ? w.modifier_characters
            : []

          let mfr: string | null = null
          const mfrMod = mods.find((x) => x.kind === 'manufacturer')
          if (mfrMod?.value?.trim()) {
            mfr = mfrMod.value.trim()
          }

          let mpn: string | null = null
          const pnMod = mods.find((x) => x.kind === 'part_number')
          if (pnMod?.value?.trim()) {
            mpn = pnMod.value.trim()
          }

          if (!mpn) continue

          // Derive component class hint from content_character
          const cc = w?.content_character
          const componentClass: string | null = cc?.function_radical_primary ?? null

          out.push({
            word: w,
            mpn,
            manufacturer: mfr,
            word_id: String(w?.id ?? cc?.character_id ?? 'unknown'),
            module_id: mid,
            sub_module_id: sid,
            component_class: componentClass,
          })
        }
      }
    }
  }
  return out
}

// ── LIBRARY CANDIDATE LOOKUP ─────────────────────────────────────────────────
// Given a component_class from content_character.function_radical_primary,
// map it to a library class and return the candidates list.
//
// The Stage 17.6 library uses different class names than the radical
// function_radical_primary values. The mapping is approximate — we pick
// the best available class. Unknown mappings return [].

function mapFunctionRadicalToLibraryClass(functionRadical: string | null): string | null {
  if (!functionRadical) return null
  const f = functionRadical.toLowerCase()

  // Direct matches
  if (f.includes('battery_cell') || f.includes('electrochemical')) return 'battery_cell'
  if (f.includes('silicon_semiconductor') || f.includes('power_module')) return 'electronic_power_module'
  if (f.includes('motor') || f.includes('actuator')) return 'motor_actuator'
  if (f.includes('thermal') || f.includes('heat')) return 'thermal'
  if (f.includes('sensor') || f.includes('sensing')) return 'sensor'
  if (f.includes('magnetic') || f.includes('transformer') || f.includes('inductor')) return 'magnetic'
  if (f.includes('connector') || f.includes('terminal') || f.includes('plug')) return 'electronic_connector'
  if (f.includes('cable') || f.includes('wire') || f.includes('harness')) return 'electronic_cable'
  if (f.includes('passive') || f.includes('capacitor') || f.includes('resistor')) return 'electronic_passive'
  if (f.includes('structural') || f.includes('metal') || f.includes('aluminium') || f.includes('steel')) return 'structural_metal'
  if (f.includes('polymer') || f.includes('plastic') || f.includes('enclosure')) return 'structural_polymer'
  if (f.includes('fluid') || f.includes('pump') || f.includes('valve') || f.includes('cooling')) return 'fluid_path'
  if (f.includes('optical') || f.includes('fibre') || f.includes('led')) return 'optical'
  if (f.includes('safety') || f.includes('fuse') || f.includes('breaker')) return 'safety_consumable'
  if (f.includes('fastener') || f.includes('bolt') || f.includes('screw')) return 'mechanical_fastener'
  if (f.includes('assembly') || f.includes('mechanical')) return 'mechanical_assembly'
  if (f.includes('oem') || f.includes('subsystem') || f.includes('inverter') || f.includes('converter')) return 'oem_subsystem'

  return null
}

// ── RESULT TYPES ─────────────────────────────────────────────────────────────

export interface PartRealityCheckResult {
  words_checked: number
  words_real: number
  words_substituted: number
  words_warned: number
  words_skipped_curated: number
  words_skipped_commodity: number
  substitutions: Array<{
    word_id: string
    module_id: string
    sub_module_id: string
    original_manufacturer: string | null
    original_mpn: string
    substitute_manufacturer: string | null
    substitute_mpn: string
    substitute_part_name: string
    library_class: string
    distributors_confirmed: string[]
  }>
  warnings: Array<{
    word_id: string
    module_id: string
    sub_module_id: string
    manufacturer: string | null
    mpn: string
    component_class: string | null
    library_class: string | null
    reason: string
  }>
  nexar_calls: number
}

// ── CORE AUDIT ────────────────────────────────────────────────────────────────

export async function runPartRealityCheck(
  state: any,
  libraryCandidates: any,
): Promise<PartRealityCheckResult> {
  const result: PartRealityCheckResult = {
    words_checked: 0,
    words_real: 0,
    words_substituted: 0,
    words_warned: 0,
    words_skipped_curated: 0,
    words_skipped_commodity: 0,
    substitutions: [],
    warnings: [],
    nexar_calls: 0,
  }

  const candidatesByClass: Record<string, any[]> = libraryCandidates?.candidates_by_class ?? {}
  const wordRefs = collectWordRefs(state)
  const sem = { slots: 3 }
  const seen = new Set<string>()

  const tasks = wordRefs.map((ref) => async () => {
    const { word, mpn, manufacturer, word_id, module_id, sub_module_id, component_class } = ref

    // Skip junk
    if (mpn.length < 2) return
    if (SHORT_ALPHANUMERIC_REGEX.test(mpn)) return

    // Skip commodity descriptors
    if (COMMODITY_SKIP_REGEX.test(mpn)) {
      result.words_skipped_commodity += 1
      return
    }

    // Skip curated-table parts (gate 13's domain)
    if (isInCuratedTable(mpn, manufacturer)) {
      result.words_skipped_curated += 1
      return
    }

    // Dedup
    const dedupeKey = `${mpn.toLowerCase()}|${(manufacturer ?? '').toLowerCase()}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)

    result.words_checked += 1

    // Step 1: check if the part is real
    const existResult = await withSemaphore(sem, () => checkExists(mpn, manufacturer))
    if (existResult.nexar_tried) result.nexar_calls += 1

    if (existResult.real) {
      result.words_real += 1
      return
    }

    // Step 2: part is fictional — look for a library substitute
    const libraryClass = mapFunctionRadicalToLibraryClass(component_class)
    const candidates: any[] = libraryClass ? (candidatesByClass[libraryClass] ?? []) : []

    // Filter to candidates that have both manufacturer AND part_number AND a
    // strong similarity score (>= 0.60). The Stage 17.6 query returns
    // candidates sorted by cosine similarity; low-similarity candidates are
    // from different or adjacent classes (e.g. electronic_power_module IGBT
    // modules at similarity 0.55-0.68 are plausible COMPONENTS but NOT a
    // valid substitute for a system-level 1 MW PCS inverter — substituting
    // those would confuse a procurement engineer). The 0.60 threshold
    // preserves only high-confidence matches (e.g. CATL M20280-E at
    // 0.62 for a battery_cell slot). When no candidate clears 0.60, the WARN
    // path fires and gate 20 remains the backstop — that is the correct
    // behaviour for unique industrial subsystems not in the corpus.
    const MIN_SIMILARITY = 0.60
    const realCandidates = candidates.filter(
      (c: any) => c.part_number && c.manufacturer &&
        (typeof c.similarity !== 'number' || c.similarity >= MIN_SIMILARITY),
    )

    // Walk candidates in order (already sorted by similarity from Stage 17.6)
    let substituted = false
    for (const candidate of realCandidates) {
      const candidateMpn = String(candidate.part_number).trim()
      const candidateMfr = String(candidate.manufacturer).trim()

      // Verify the candidate itself is real via the cascade
      const candidateCheck = await withSemaphore(sem, () => checkExists(candidateMpn, candidateMfr))
      if (candidateCheck.nexar_tried) result.nexar_calls += 1

      if (!candidateCheck.real) continue

      // Found a real substitute — patch the word in-place
      const mods: Array<{ kind: string; value: string }> = word.modifier_characters ?? []

      // Update manufacturer modifier
      const mfrIdx = mods.findIndex((x: any) => x.kind === 'manufacturer')
      if (mfrIdx >= 0) {
        mods[mfrIdx] = { kind: 'manufacturer', value: candidateMfr }
      } else {
        mods.push({ kind: 'manufacturer', value: candidateMfr })
      }

      // Update part_number modifier
      const pnIdx = mods.findIndex((x: any) => x.kind === 'part_number')
      if (pnIdx >= 0) {
        mods[pnIdx] = { kind: 'part_number', value: candidateMpn }
      } else {
        mods.push({ kind: 'part_number', value: candidateMpn })
      }

      // Mark the source so the renderer/audit trail knows this was an auto-substitution
      const sdIdx = mods.findIndex((x: any) => x.kind === 'source_detail')
      const sdValue = `Part Reality Check: substituted fictional "${manufacturer ?? '?'} ${mpn}" → library candidate "${candidateMfr} ${candidateMpn}" (${candidate.part_name ?? ''}, library_class=${libraryClass}, confirmed via ${candidateCheck.sources.join('+')})`
      if (sdIdx >= 0) {
        mods[sdIdx] = { kind: 'source_detail', value: sdValue }
      } else {
        mods.push({ kind: 'source_detail', value: sdValue })
      }

      word.modifier_characters = mods

      result.words_substituted += 1
      result.substitutions.push({
        word_id,
        module_id,
        sub_module_id,
        original_manufacturer: manufacturer,
        original_mpn: mpn,
        substitute_manufacturer: candidateMfr,
        substitute_mpn: candidateMpn,
        substitute_part_name: candidate.part_name ?? '',
        library_class: libraryClass ?? '',
        distributors_confirmed: candidateCheck.sources,
      })
      substituted = true
      break
    }

    if (!substituted) {
      // No real library candidate found — log a HIGH warning
      result.words_warned += 1
      result.warnings.push({
        word_id,
        module_id,
        sub_module_id,
        manufacturer,
        mpn,
        component_class,
        library_class: libraryClass,
        reason:
          `MPN "${mpn}"${manufacturer ? ` (${manufacturer})` : ''} not found in any distributor ` +
          `cascade. No real substitute found in the Stage 17.6 library for ` +
          `component_class "${component_class ?? 'unknown'}" ` +
          `(mapped library_class="${libraryClass ?? 'none'}"). ` +
          `Gate 20 (fictional-pn-audit.ts) will catch this post-render.`,
      })
    }
  })

  await Promise.all(tasks.map((t) => t()))
  return result
}

// ── ACTIONS.JSONL LOGGER ─────────────────────────────────────────────────────

function appendToActionsLog(outDir: string, records: object[]): void {
  const actionsPath = resolve(outDir, 'actions.jsonl')
  if (!existsSync(actionsPath)) return   // only append if the file exists (in-chain context)
  const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n'
  try {
    appendFileSync(actionsPath, lines, 'utf-8')
  } catch {
    // Swallow — actions.jsonl is diagnostic, not load-bearing
  }
}

// ── MARKDOWN RENDERER ────────────────────────────────────────────────────────

function renderMarkdown(result: PartRealityCheckResult, statePath: string): string {
  const lines: string[] = []
  lines.push(`# Part Reality Check (Stage 10.5) — ${statePath}`)
  lines.push('')
  lines.push(
    `**${result.words_checked} words audited** (${result.words_skipped_curated} skipped — in curated gate-13 table; ` +
    `${result.words_skipped_commodity} skipped — commodity descriptor).`,
  )
  lines.push('')
  lines.push(
    `**Real:** ${result.words_real} | **Substituted:** ${result.words_substituted} | ` +
    `**Warned (no substitute):** ${result.words_warned} | **Nexar calls used:** ${result.nexar_calls}`,
  )
  lines.push('')

  if (result.substitutions.length > 0) {
    lines.push('## Substitutions applied')
    for (const s of result.substitutions) {
      lines.push(
        `- **${s.module_id} → ${s.sub_module_id} → ${s.word_id}**: ` +
        `\`${s.original_manufacturer ?? '?'} ${s.original_mpn}\` → ` +
        `\`${s.substitute_manufacturer} ${s.substitute_mpn}\` ` +
        `(${s.substitute_part_name}, library_class=${s.library_class}, ` +
        `confirmed: ${s.distributors_confirmed.join('+')})`,
      )
    }
    lines.push('')
  }

  if (result.warnings.length > 0) {
    lines.push('## HIGH warnings — no substitute available (gate 20 backstop applies)')
    for (const w of result.warnings) {
      lines.push(
        `- **[HIGH]** \`${w.manufacturer ?? '?'} ${w.mpn}\` ` +
        `(${w.module_id} → ${w.sub_module_id}) — ${w.reason}`,
      )
    }
    lines.push('')
    lines.push(
      `> These ${result.warnings.length} part(s) will be caught by gate 20 post-render. ` +
      `To resolve: either ingest a real PCS/industrial-subsystem catalogue into ` +
      `pretraining_extracted_parts (forge-truth.db) for the relevant component class, ` +
      `OR replace the fictional MPN in deterministic-emitter.ts with a verified real part.`,
    )
  } else if (result.words_checked > 0) {
    lines.push('All audited fictional MPNs were either real or successfully substituted from the library.')
  }

  return lines.join('\n')
}

// ── CLI ENTRYPOINT ───────────────────────────────────────────────────────────

const argv1 = process.argv[1] ?? ''
const isMain = /part-reality-check\.(?:ts|js|mjs|cjs)$/.test(argv1)

if (isMain) {
  const args = process.argv.slice(2)
  const writeBack = args.includes('--write-back')
  const positional = args.filter((a) => !a.startsWith('--'))
  const statePath = positional[0]
  const libPath = positional[1]

  if (!statePath || !libPath) {
    console.error('Usage: part-reality-check <statePath> <libCandidatesPath> [--write-back]')
    process.exit(1)
  }

  let state: any
  let libCandidates: any
  try {
    state = JSON.parse(readFileSync(statePath, 'utf-8'))
  } catch (err) {
    console.error(`[part-reality-check] failed to read state.json: ${(err as Error).message}`)
    process.exit(1)
  }
  try {
    libCandidates = JSON.parse(readFileSync(libPath, 'utf-8'))
  } catch (err) {
    console.error(`[part-reality-check] failed to read library-candidates.json: ${(err as Error).message}`)
    process.exit(1)
  }

  const outDir = require('node:path').dirname(statePath)
  const ts = new Date().toISOString()

  runPartRealityCheck(state, libCandidates).then((result) => {
    // Write markdown report
    const mdPath = resolve(outDir, 'PART-REALITY-CHECK.md')
    const md = renderMarkdown(result, statePath)
    writeFileSync(mdPath, md, 'utf-8')

    // Append to actions.jsonl
    const actionRecords: object[] = [
      {
        ts,
        step: 'part_reality_check',
        action_type: 'stage_summary',
        words_checked: result.words_checked,
        words_real: result.words_real,
        words_substituted: result.words_substituted,
        words_warned: result.words_warned,
        nexar_calls: result.nexar_calls,
      },
      ...result.substitutions.map((s) => ({
        ts,
        step: 'part_reality_check',
        action_type: 'part_substitution',
        word_id: s.word_id,
        module_id: s.module_id,
        sub_module_id: s.sub_module_id,
        original_manufacturer: s.original_manufacturer,
        original_mpn: s.original_mpn,
        substitute_manufacturer: s.substitute_manufacturer,
        substitute_mpn: s.substitute_mpn,
        substitute_part_name: s.substitute_part_name,
        library_class: s.library_class,
        distributors_confirmed: s.distributors_confirmed,
      })),
      ...result.warnings.map((w) => ({
        ts,
        step: 'part_reality_check',
        action_type: 'part_reality_warning',
        severity: 'HIGH',
        word_id: w.word_id,
        module_id: w.module_id,
        sub_module_id: w.sub_module_id,
        manufacturer: w.manufacturer,
        mpn: w.mpn,
        component_class: w.component_class,
        library_class: w.library_class,
        reason: w.reason,
      })),
    ]
    appendToActionsLog(outDir, actionRecords)

    // Write patched state
    if (writeBack) {
      writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8')
      console.error(
        `[part-reality-check] wrote patched state back to ${statePath} ` +
        `(${result.words_substituted} substitution(s), ${result.words_warned} warning(s))`,
      )
    } else {
      const outPath = resolve(outDir, 'state.reality-checked.json')
      writeFileSync(outPath, JSON.stringify(state, null, 2), 'utf-8')
      console.error(`[part-reality-check] wrote patched state to ${outPath} (no --write-back flag)`)
    }

    console.error(`[part-reality-check] wrote ${mdPath}`)
    console.log(md)

    // Summary for chain stderr
    console.error(
      `[part-reality-check] DONE: ${result.words_checked} checked, ` +
      `${result.words_real} real, ${result.words_substituted} substituted, ` +
      `${result.words_warned} warned (no substitute). ` +
      `Nexar calls used: ${result.nexar_calls}.`,
    )
    process.exit(0)
  }).catch((err) => {
    console.error(`[part-reality-check] runtime error: ${(err as Error).message}`)
    process.exit(1)
  })
}
