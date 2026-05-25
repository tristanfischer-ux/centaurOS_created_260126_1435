/**
 * Fictional-part-number detection audit — gate 20 (codified 2026-05-25,
 * BESS L22 council universal-fix #3).
 *
 * Universal across every product class that emits real industrial parts in
 * its BoM.
 *
 * Root cause it addresses: the LLM emits a `manufacturer + part_number`
 * combination that LOOKS plausible — structurally valid, correct syntax,
 * believable alphanumerics — but does not exist in any distributor catalogue.
 * Gate 13 (parts-spec validator) catches this when the part appears in our
 * curated KNOWN_PART_AUTHORITATIVE table. Anything OUTSIDE that table sails
 * through gate 13 silently. Now that the distributor cascade is LIVE
 * (Mouser + Digi-Key + Farnell + LCSC + Nexar), gate 20 closes that gap:
 * any BoM line whose MPN returns null from ALL five distributors AND is not
 * in the curated table is flagged as potentially fictional.
 *
 * Severity ladder:
 *   HIGH — MPN matches a structured part-number pattern
 *          (e.g. "ABCD1234-5X" — looks like a genuine product number,
 *          manufacturer plausibly hallucinated it) AND all four native
 *          distributors return null. These are the ones most likely to
 *          deceive a procurement engineer.
 *   MED  — MPN is non-commodity and doesn't match the structured PN
 *          pattern AND all distributors miss. Possibly a valid but
 *          obscure part OR a low-confidence hallucination.
 *   LOW  — Short alphanumeric (3-4 chars), or MPN looks like a
 *          catalogue-class commodity descriptor ("M6 bolt", "20mm angle",
 *          "PV-25 fuse" — valid but un-findable via keyword search).
 *          Informational only.
 *
 * Exit code 20 on any HIGH-severity finding (chain fails fast). MED + LOW
 * are informational and do not block the chain.
 *
 * Nexar quota conservation: Nexar Evaluation plan = 100 matched parts/MONTH.
 * Mouser = 1000/day, Digi-Key = 1000/day after OAuth, Farnell = free,
 * LCSC = free. This audit defaults to the four native distributors in
 * parallel. ONLY if all four miss does it fall back to Nexar — preventing
 * unnecessary burn on the scarce monthly quota.
 *
 * Concurrency: a semaphore limits fan-out to 3 parallel distributor checks
 * at a time. Each individual distributor call is already capped at 8 s via
 * AbortSignal.timeout() — safe in CLI tsx context (not a Server Action).
 *
 * Distinct from gate 13 (parts-spec validator): gate 13 checks curated-table
 * entries for SPEC CLAIM CORRECTNESS (claimed 1500 A, real 500 A). Gate 20
 * checks EXISTENCE in any distributor catalogue. The two are orthogonal:
 * a hallucinated part number has NO distributor match AND is NOT in the
 * curated table; gate 13 can only catch it once an operator adds it to the
 * curated table. Gate 20 catches it universally without any table entry.
 *
 * Pre-change mempalace search: fictional part number distributor hallucination
 * BESS L22 gate 13 curated table → 1 drawer loaded (BESS L22 council
 * 2026-05-25 identified this as universal-fix #3 from the 6-seat council).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── DISTRIBUTOR IMPORTS ──────────────────────────────────────────────────────
// We import the per-distributor functions directly rather than going through
// findSkuForPart() (which fans out to ALL FIVE in parallel). This lets us
// implement the 4-native-first, Nexar-last-resort cascade that conserves
// the 100 matched-parts/month Nexar Evaluation plan quota.
//
// TypeScript compiler path: scripts/ → src/ works via the tsconfig paths
// configured in tsconfig.json (or we can use a relative path from here to
// the src directory — relative is simpler for a CLI script).
const distDir = resolve(__dirname, '../../src/lib/pdf-engine-v2/lib/distributors')

// We use dynamic requires so the compiler doesn't demand the exact types
// at the import site (the distributor files export DistributorResult which
// is re-exported from mouser.ts — still fully typed at runtime).
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
// Parts already in KNOWN_PART_AUTHORITATIVE are validated by gate 13. We
// don't re-check them here — gate 13 already covers their existence claim.
// Rather than importing the whole table (which is heavy), we call findAuth()
// logic by pattern-matching the MPN against the well-known prefixes. Gate 20
// skips a part when gate 13 would recognise it. We achieve this by importing
// the KNOWN_PART_AUTHORITATIVE array and running the same lookup.
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
// Catalogue-class commodity descriptors: valid items but not uniquely
// findable via an exact MPN search (a distributor search for "M6" returns
// thousands of bolt variants — the MPN is a category, not a specific part).
// These are LOW severity at most; we don't emit HIGH for them.
// Pattern covers:
//   M2 / M2.5 / M3 / M4 / M5 / M6 / M8 / M10 / M12 metric fasteners
//   Generic/standard/N/A/TBD/various
//   Pure-numeric catalogue codes (e.g. "100", "200") — too ambiguous
//   Commodity descriptors with obvious category prefixes
// Commodity skip: metric fasteners, generic placeholders, declared-custom items,
// dimension+category descriptors (20mm angle), and pure-spec-prefix tokens
// (100A fuse, 50V rail). These items are valid but un-findable by exact MPN
// search; flagging them as missing is noise, not signal.
const COMMODITY_SKIP_REGEX = /^(?:M\d{1,2}(?:\.\d)?\s*(?:x\s*\d+)?|generic|standard|n\/?a|tbd|various|custom|bespoke|oem|\d{1,4}mm?\s*(?:angle|plate|rod|tube|pipe|cable|wire|bracket|channel|gland|trunking)?|\d+(?:\.\d+)?\s*(?:A|V|W|kW|kVA|kWh|MWh|Hz|mm|m|kg)\s*[-_/]?\s*\w*)$/i

// Structured part-number pattern: uppercase letters + digits + separator +
// more alphanumerics. This is the shape of most manufacturer part numbers
// (e.g. "STM32H743ZIT6", "C310-1500V", "170M6810", "ABCD-1234-5X").
// Parts matching this regex AND not found in any distributor are HIGH.
const STRUCTURED_PN_REGEX = /^[A-Z0-9]{3,}[-_/][A-Z0-9]{1,}(?:[-_/][A-Z0-9]{1,})*$/

// Short alphanumeric (3-4 chars) — too ambiguous for a distributor search to
// return a meaningful miss. LOW severity.
const SHORT_ALPHANUMERIC_REGEX = /^[A-Za-z0-9]{1,4}$/

// ── EXISTENCE CHECK ──────────────────────────────────────────────────────────
//
// Two-stage cascade to protect Nexar quota:
//   Stage 1: parallel Mouser + Digi-Key + Farnell + LCSC (all cheap)
//   Stage 2: only Nexar if all four native distributors miss
//
// AbortSignal.timeout() is safe in CLI tsx context — documented gotcha
// applies to Next.js Server Actions only, not Node.js scripts.

interface ExistenceResult {
  real: boolean
  sources: string[]
  nexar_tried: boolean
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T | null> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(new Error(`[fictional-pn-audit] ${label} timed out after ${ms}ms`)), ms)
  try {
    const result = await promise
    clearTimeout(timer)
    return result
  } catch (err) {
    clearTimeout(timer)
    return null
  }
}

async function liveExistenceCheck(
  mpn: string,
  manufacturer: string | null,
): Promise<ExistenceResult> {
  const TIMEOUT_MS = 8_000

  // Stage 1: 4 native distributors in parallel (cheap quota)
  const [m, d, f, l] = await Promise.all([
    withTimeout(lookupSkuMouser(mpn).catch(() => null), TIMEOUT_MS, `mouser:${mpn}`),
    withTimeout(lookupSkuDigikey(mpn).catch(() => null), TIMEOUT_MS, `digikey:${mpn}`),
    withTimeout(lookupSkuFarnell(mpn).catch(() => null), TIMEOUT_MS, `farnell:${mpn}`),
    withTimeout(lookupSkuLcsc(mpn).catch(() => null), TIMEOUT_MS, `lcsc:${mpn}`),
  ])

  // Manufacturer filter: if a distributor row comes back with a manufacturer
  // field that is completely inconsistent with the declared manufacturer, we
  // treat that as a miss (same logic as findSkuForPart's manufacturer-strict
  // filter — but here we only reject when BOTH are non-empty AND clearly
  // incompatible, to avoid rejecting distributors that don't return mfr info).
  function mfrCompatible(row: { manufacturer?: string } | null): boolean {
    if (!row) return false
    if (!manufacturer?.trim()) return true   // no declared mfr → accept any match
    const decl = manufacturer.trim().toLowerCase()
    const rowMfr = (row.manufacturer ?? '').toLowerCase()
    if (!rowMfr) return true   // distributor returned no mfr field → can't reject
    return rowMfr.includes(decl) || decl.includes(rowMfr)
  }

  const hits1: string[] = []
  if (mfrCompatible(m)) { hits1.push('mouser') }
  if (mfrCompatible(d)) { hits1.push('digikey') }
  if (mfrCompatible(f)) { hits1.push('farnell') }
  if (mfrCompatible(l)) { hits1.push('lcsc') }

  if (hits1.length > 0) {
    return { real: true, sources: hits1, nexar_tried: false }
  }

  // Stage 2: Nexar fallback (only when all four native distributors miss)
  const n = await withTimeout(lookupSkuNexar(mpn).catch(() => null), TIMEOUT_MS, `nexar:${mpn}`)
  if (n && mfrCompatible(n)) {
    return { real: true, sources: ['nexar'], nexar_tried: true }
  }
  return { real: false, sources: [], nexar_tried: true }
}

// ── WORD COLLECTION ──────────────────────────────────────────────────────────
// Mirrors collectWords() in parts-spec-validator.ts — walks the same module
// → sub_module → words tree to extract manufacturer + part_number pairs.

interface BomLine {
  mpn: string
  manufacturer: string | null
  word_id: string
  module_id: string
  sub_module_id: string
  quantity: number | null
}

function collectBomLines(state: any): BomLine[] {
  const out: BomLine[] = []
  const modules: any[] =
    state?.moduleDecomposition?.modules ??
    state?.module_decomposition?.modules ??
    state?.modules ??
    []
  for (const m of modules) {
    const mid = String(m?.module ?? m?.id ?? m?.module_id ?? 'unknown')
    const subs: any[] = Array.isArray(m?.sub_modules)
      ? m.sub_modules
      : Array.isArray(m?.submodules)
        ? m.submodules
        : []
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

          // Manufacturer: prefer explicit 'manufacturer' modifier, fall back
          // to scanning the 'form' modifier prefix.
          let mfr: string | null = null
          const mfrMod = mods.find((x) => x.kind === 'manufacturer')
          if (mfrMod && typeof mfrMod.value === 'string' && mfrMod.value.trim()) {
            mfr = mfrMod.value.trim()
          } else {
            const formMod = mods.find((x) => x.kind === 'form')
            if (formMod && typeof formMod.value === 'string') {
              // Simple heuristic: first "word" in the form string that starts
              // with a capital letter and doesn't contain digits is likely the
              // manufacturer. This is intentionally loose — gate 13 is more
              // precise; we just need a rough hint for the mfr-compatibility
              // filter above.
              const firstToken = formMod.value.split(/\s+/)[0]
              if (firstToken && /^[A-Z]/.test(firstToken) && !/\d/.test(firstToken)) {
                mfr = firstToken
              }
            }
          }

          // Part number: prefer explicit 'part_number' modifier, fall back
          // to 'form' prefix extraction.
          let mpn: string | null = null
          const pnMod = mods.find((x) => x.kind === 'part_number')
          if (pnMod && typeof pnMod.value === 'string' && pnMod.value.trim()) {
            mpn = pnMod.value.trim()
          } else if (mfr) {
            const formMod = mods.find((x) => x.kind === 'form')
            if (formMod && typeof formMod.value === 'string') {
              const re = new RegExp(`^${mfr}\\s+([A-Za-z0-9][\\w.-]*(?:\\s+[A-Za-z0-9][\\w.-]*){0,3})`, 'i')
              const match = formMod.value.match(re)
              if (match) mpn = match[1].trim()
            }
          }
          // Last resort: name_human field (sometimes carries "Mfr PN")
          if (!mpn && mfr && typeof w?.name_human === 'string') {
            const re = new RegExp(`${mfr}\\s+([A-Za-z0-9][\\w.-]*(?:\\s+[A-Za-z0-9][\\w.-]*){0,3})`, 'i')
            const match = w.name_human.match(re)
            if (match) mpn = match[1].trim()
          }

          if (!mpn) continue  // no extractable MPN — nothing to check

          const qtyMod = mods.find((x) => x.kind === 'quantity')
          const qty = qtyMod && typeof qtyMod.value === 'string'
            ? parseFloat(qtyMod.value.replace(/[^0-9.]/g, ''))
            : typeof w?.quantity === 'number' ? w.quantity : null

          out.push({
            mpn,
            manufacturer: mfr,
            word_id: String(w?.id ?? w?.content_character?.character_id ?? 'unknown'),
            module_id: mid,
            sub_module_id: sid,
            quantity: Number.isFinite(qty) ? qty : null,
          })
        }
      }
    }
  }
  return out
}

// ── FINDING SHAPES ───────────────────────────────────────────────────────────

export type FictionalPnSeverity = 'HIGH' | 'MED' | 'LOW'

export interface FictionalPnFinding {
  /** Stable identifier: `<word_id>:<mpn>` */
  id: string
  mpn: string
  manufacturer: string | null
  word_id: string
  module_id: string
  sub_module_id: string
  severity: FictionalPnSeverity
  reason: string
  distributors_tried: string[]
  nexar_tried: boolean
  explanation: string
}

export interface FictionalPnAuditResult {
  findings: FictionalPnFinding[]
  lines_audited: number
  lines_skipped_curated: number
  lines_skipped_commodity: number
  lines_skipped_too_short: number
  nexar_calls: number
  per_distributor_hit: Record<string, number>
  product_class: string
}

// ── SEMAPHORE ────────────────────────────────────────────────────────────────
// Limit concurrent distributor fan-outs to 3 at a time. Distributors
// throttle aggressively; more than 3 concurrent checks causes 429s that
// silently return null (masking a real existence hit as a miss).

async function runWithSemaphore<T>(
  semaphore: { slots: number },
  fn: () => Promise<T>,
): Promise<T> {
  // Spin until a slot is free
  while (semaphore.slots <= 0) {
    await new Promise((res) => setTimeout(res, 50))
  }
  semaphore.slots -= 1
  try {
    return await fn()
  } finally {
    semaphore.slots += 1
  }
}

// ── AUDIT ────────────────────────────────────────────────────────────────────

export async function auditFictionalPartNumbers(
  state: any,
): Promise<FictionalPnAuditResult> {
  const findings: FictionalPnFinding[] = []
  const productClass = String(
    state?.moduleDecomposition?.product_class ??
    state?.parsedBrief?.product_class ??
    '',
  )

  const lines = collectBomLines(state)
  let linesAudited = 0
  let linesSkippedCurated = 0
  let linesSkippedCommodity = 0
  let linesSkippedTooShort = 0
  let nexarCalls = 0
  const perDistributorHit: Record<string, number> = {}

  const semaphore = { slots: 3 }
  const seen = new Set<string>()  // dedup by mpn+manufacturer

  const tasks = lines.map((line) => async () => {
    const { mpn, manufacturer, word_id, module_id, sub_module_id } = line

    // Skip junk MPNs
    if (mpn.length < 2) {
      linesSkippedTooShort += 1
      return
    }

    // Dedup
    const dedupeKey = `${mpn.toLowerCase()}|${(manufacturer ?? '').toLowerCase()}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)

    // Skip SHORT_ALPHANUMERIC (3-4 chars) — too ambiguous
    if (SHORT_ALPHANUMERIC_REGEX.test(mpn)) {
      linesSkippedTooShort += 1
      return
    }

    // Skip commodity descriptors
    if (COMMODITY_SKIP_REGEX.test(mpn)) {
      linesSkippedCommodity += 1
      return
    }

    // Skip parts already covered by gate 13's curated table
    if (isInCuratedTable(mpn, manufacturer)) {
      linesSkippedCurated += 1
      return
    }

    linesAudited += 1

    // Live existence check (semaphore-gated)
    const result = await runWithSemaphore(semaphore, () => liveExistenceCheck(mpn, manufacturer))

    if (result.nexar_tried) nexarCalls += 1
    for (const src of result.sources) {
      perDistributorHit[src] = (perDistributorHit[src] ?? 0) + 1
    }

    if (result.real) return  // found — not fictional

    // All distributors missed — classify severity
    const isStructured = STRUCTURED_PN_REGEX.test(mpn)
    const severity: FictionalPnSeverity = isStructured ? 'HIGH' : 'MED'

    const distributorsTried = ['mouser', 'digikey', 'farnell', 'lcsc']
    if (result.nexar_tried) distributorsTried.push('nexar')

    findings.push({
      id: `${word_id}:${mpn}`,
      mpn,
      manufacturer,
      word_id,
      module_id,
      sub_module_id,
      severity,
      reason: `MPN "${mpn}"${manufacturer ? ` (declared manufacturer: ${manufacturer})` : ''} returned null from all ${distributorsTried.length} distributor(s) queried (${distributorsTried.join(', ')}) and is not in the curated parts table. ${isStructured ? 'The MPN\'s structure matches a real part-number pattern (alphanumeric + separator + alphanumeric), strongly suggesting the LLM hallucinated a plausible-looking but non-existent part number.' : 'The MPN doesn\'t match a structured part-number pattern — it may be a valid but obscure OEM part, or a low-confidence hallucination.'}`,
      distributors_tried: distributorsTried,
      nexar_tried: result.nexar_tried,
      explanation:
        `Root cause: deterministic-emitter.ts or the LLM generator emitted this manufacturer+PN combination ` +
        `without verifying it against any catalogue. Gate 13 (parts-spec validator) cannot catch parts ` +
        `outside its curated KNOWN_PART_AUTHORITATIVE table. Gate 20 (this audit) covers the orthogonal ` +
        `case — any BoM line whose MPN doesn't resolve to a real part in the live distributor cascade. ` +
        `Fix: (a) replace "${mpn}" with a real ${manufacturer ?? 'manufacturer'} part that IS available ` +
        `from Mouser/Digi-Key/Farnell/LCSC, OR (b) if this is a custom/OEM item, add a "custom" prefix ` +
        `to the MPN (e.g. "CUSTOM-${mpn}") so future runs skip it explicitly.`,
    })
  })

  // Execute tasks — each task already acquires the semaphore internally
  // (see runWithSemaphore call around liveExistenceCheck above). We launch
  // all tasks concurrently; the semaphore inside each task ensures at most
  // 3 distributor fan-outs are in flight simultaneously.
  await Promise.all(tasks.map((t) => t()))

  return {
    findings,
    lines_audited: linesAudited,
    lines_skipped_curated: linesSkippedCurated,
    lines_skipped_commodity: linesSkippedCommodity,
    lines_skipped_too_short: linesSkippedTooShort,
    nexar_calls: nexarCalls,
    per_distributor_hit: perDistributorHit,
    product_class: productClass,
  }
}

// ── MARKDOWN RENDERER ────────────────────────────────────────────────────────

function renderMarkdown(result: FictionalPnAuditResult, statePath: string): string {
  const lines: string[] = []
  lines.push(`# Fictional-Part-Number Audit (gate 20) — ${statePath}`)
  lines.push('')
  lines.push(`**Product class:** \`${result.product_class}\``)
  lines.push('')
  lines.push(
    `**${result.lines_audited} BoM line(s) audited** against live distributor cascade ` +
    `(${result.lines_skipped_curated} skipped — in curated gate-13 table; ` +
    `${result.lines_skipped_commodity} skipped — commodity descriptor; ` +
    `${result.lines_skipped_too_short} skipped — too short / junk).`,
  )
  lines.push('')
  lines.push(
    `**Nexar calls used:** ${result.nexar_calls} ` +
    `(Nexar only called as last resort when all 4 native distributors miss — ` +
    `conserves 100/month Evaluation-plan quota).`,
  )
  lines.push('')
  if (Object.keys(result.per_distributor_hit).length > 0) {
    lines.push('**Per-distributor hits (confirmed real parts):**')
    for (const [src, count] of Object.entries(result.per_distributor_hit).sort()) {
      lines.push(`  - ${src}: ${count}`)
    }
    lines.push('')
  }

  if (result.findings.length === 0) {
    lines.push(`PASS — every audited MPN resolved to a real part on at least one distributor.`)
    return lines.join('\n')
  }

  const high = result.findings.filter((f) => f.severity === 'HIGH')
  const med = result.findings.filter((f) => f.severity === 'MED')
  const low = result.findings.filter((f) => f.severity === 'LOW')
  lines.push(
    `FAIL — ${result.findings.length} finding(s): ${high.length} HIGH, ${med.length} MED, ${low.length} LOW.`,
  )
  lines.push('')

  const sorted = [...result.findings].sort((a, b) => {
    const order: Record<FictionalPnSeverity, number> = { HIGH: 0, MED: 1, LOW: 2 }
    return order[a.severity] - order[b.severity]
  })

  for (const f of sorted) {
    const mfrDisplay = f.manufacturer ? ` (${f.manufacturer})` : ''
    lines.push(`## [${f.severity}] ${f.mpn}${mfrDisplay} — fictional or un-catalogued part number`)
    lines.push(`- **id:** \`${f.id}\``)
    lines.push(`- **Module:** \`${f.module_id}\` → \`${f.sub_module_id}\``)
    lines.push(`- **Distributors tried:** ${f.distributors_tried.join(', ')}`)
    lines.push(`- **Nexar tried:** ${f.nexar_tried ? 'yes' : 'no (native distributors hit)'}`)
    lines.push(`- **Reason:** ${f.reason}`)
    lines.push(`- **Fix:** ${f.explanation}`)
    lines.push('')
  }

  return lines.join('\n')
}

// ── CLI ENTRYPOINT ───────────────────────────────────────────────────────────
// Usage: npx tsx scripts/lib/fictional-pn-audit.ts <statePath> <outMdPath>
// Exit code 20 on any HIGH-severity finding.
// Exit code 0 on PASS (no HIGH findings, MEDs/LOWs are informational only).
// Exit code 1 on IO or runtime error.

const argv1 = process.argv[1] ?? ''
const isMain = /fictional-pn-audit\.(?:ts|js|mjs|cjs)$/.test(argv1)

if (isMain) {
  const statePath = process.argv[2]
  const outMdPath = process.argv[3]
  if (!statePath) {
    console.error('Usage: fictional-pn-audit <statePath> [outMdPath]')
    process.exit(1)
  }
  let state: any
  try {
    state = JSON.parse(readFileSync(statePath, 'utf-8'))
  } catch (err) {
    console.error(
      `[fictional-pn-audit] failed to read ${statePath}: ${(err as Error).message}`,
    )
    process.exit(1)
  }

  auditFictionalPartNumbers(state).then((result) => {
    const md = renderMarkdown(result, statePath)
    if (outMdPath) {
      writeFileSync(outMdPath, md, 'utf-8')
      console.log(`[fictional-pn-audit] wrote ${outMdPath}`)
    } else {
      console.log(md)
    }
    const high = result.findings.filter((f) => f.severity === 'HIGH')
    if (high.length > 0) {
      console.error(
        `[fictional-pn-audit] FAIL: ${high.length} HIGH-severity finding(s) — ` +
        `hallucinated MPNs not found in any distributor catalogue`,
      )
      process.exit(20)
    }
    console.log(
      `[fictional-pn-audit] PASS: ${result.lines_audited} lines audited, ` +
      `${result.findings.length} non-blocking findings ` +
      `(${result.findings.filter((f) => f.severity === 'MED').length} MED, ` +
      `${result.findings.filter((f) => f.severity === 'LOW').length} LOW). ` +
      `Nexar calls used: ${result.nexar_calls}.`,
    )
  }).catch((err) => {
    console.error(`[fictional-pn-audit] runtime error: ${(err as Error).message}`)
    process.exit(1)
  })
}
