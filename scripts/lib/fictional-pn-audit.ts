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
 * through gate 13 silently. Gate 20 closes that gap: any BoM line whose MPN
 * is not in the DB (distributor_cascade_cache or pretraining_extracted_parts)
 * AND is not in the curated table is flagged as potentially fictional.
 *
 * DB-ONLY ARCHITECTURE (codified 2026-05-25, drawer_forgeos_decisions_e30f5e00a59dc3ff):
 * This gate now reads ONLY from ~/.forge-truth/forge-truth.db via
 * db-only-cascade.ts. No live distributor API calls happen here.
 * Live discovery is exclusively the responsibility of scripts/ingest/* jobs.
 * This prevents chain runs from burning Mouser/Digi-Key/Nexar free-tier
 * quotas (~200 calls/chain × N chains/day = quota exhausted in hours).
 *
 * Severity ladder:
 *   HIGH — MPN matches a structured part-number pattern (e.g. "ABCD1234-5X")
 *          AND source='cache_miss_confirmed' (ingest confirmed it does not exist).
 *          These are confirmed-fictional hallucinations.
 *   MED  — source='unknown' (not yet ingested) AND structured PN pattern.
 *          Needs ingest, NOT confirmed fictional — do NOT block the chain.
 *          The part may be real but not yet in the DB.
 *   MED  — source='cache_miss_confirmed' AND non-structured PN.
 *          Possibly a valid but obscure OEM part or a low-confidence hallucination.
 *   LOW  — source='unknown' AND non-structured PN. Informational only.
 *
 * EXIT CODE: 20 on any HIGH-severity finding (source='cache_miss_confirmed'
 * AND structured PN). 'unknown' findings are MED/LOW only and do NOT block.
 * This prevents the chain from blocking on parts that simply haven't been
 * ingested yet.
 *
 * Concurrency: a semaphore limits fan-out to 3 parallel DB checks at a time.
 * DB reads are fast but we preserve the semaphore for consistency with
 * future live-API path.
 *
 * Distinct from gate 13 (parts-spec validator): gate 13 checks curated-table
 * entries for SPEC CLAIM CORRECTNESS (claimed 1500 A, real 500 A). Gate 20
 * checks EXISTENCE in the forge-truth.db corpus. The two are orthogonal.
 *
 * Pre-change mempalace search: fictional part number distributor hallucination
 * BESS L22 gate 13 curated table → 1 drawer loaded (BESS L22 council
 * 2026-05-25 identified this as universal-fix #3 from the 6-seat council).
 *
 * CHAIN-AS-DB-CONSUMER (2026-05-25): this file MUST NOT import from
 * src/lib/pdf-engine-v2/lib/distributors/{mouser,digikey,farnell,lcsc,nexar}.ts
 * Regression test: src/__tests__/chain-must-be-db-only.test.ts enforces this.
 */

import { readFileSync, writeFileSync } from 'node:fs'

// ── DB-ONLY LOOKUP ────────────────────────────────────────────────────────────
// Chain reads ONLY from forge-truth.db. No live API calls in this file.
import { lookupCached, type DbCascadeSource } from '../../src/lib/pdf-engine-v2/lib/distributors/db-only-cascade'

// ── CURATED-TABLE SKIP ───────────────────────────────────────────────────────
// Parts already in KNOWN_PART_AUTHORITATIVE are validated by gate 13. We
// don't re-check them here — gate 13 already covers their existence claim.
import { KNOWN_PART_AUTHORITATIVE } from './parts-spec-validator'

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

// ── EXISTENCE CHECK (DB-ONLY) ────────────────────────────────────────────────
//
// CHAIN-AS-DB-CONSUMER: reads only from forge-truth.db via lookupCached().
// No live API calls happen here. Live discovery is handled by scripts/ingest/*.
//
// DbCascadeSource semantics for gate 20:
//   'cache_hit'            → part exists → PASS (not fictional)
//   'library_only'         → part in curated corpus → PASS
//   'cache_miss_confirmed' → ingest confirmed non-existent → classify as HIGH/MED
//   'unknown'              → not yet ingested → MED only (needs ingest, not confirmed fictional)

interface ExistenceResult {
  real: boolean
  source: DbCascadeSource
  dbSource: string
}

function dbExistenceCheck(
  mpn: string,
  manufacturer: string | null,
): ExistenceResult {
  const dbResult = lookupCached(manufacturer, mpn)
  const real = dbResult.found
  const dbSourceLabel = dbResult.result?.source ?? 'none'
  return { real, source: dbResult.source, dbSource: dbSourceLabel }
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
  /** DB source: 'cache_miss_confirmed' | 'unknown' (never 'cache_hit' or 'library_only' — those pass). */
  db_source: DbCascadeSource
  explanation: string
}

export interface FictionalPnAuditResult {
  findings: FictionalPnFinding[]
  lines_audited: number
  lines_skipped_curated: number
  lines_skipped_commodity: number
  lines_skipped_too_short: number
  /** Always 0 in DB-only mode — retained for interface compatibility. */
  nexar_calls: number
  /** DB source hit counts for cache_hit + library_only (confirmed real). */
  per_distributor_hit: Record<string, number>
  product_class: string
}

// ── AUDIT ─────────────────────────────────────────────────────────────────────

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
  const perDbSourceHit: Record<string, number> = {}

  const seen = new Set<string>()  // dedup by mpn+manufacturer

  // DB reads are synchronous (better-sqlite3), but we keep async interface
  // for drop-in compatibility with callers that await this function.
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

    // DB-only existence check (synchronous, no live API)
    const result = dbExistenceCheck(mpn, manufacturer)

    // Track confirmed-real DB source hits
    if (result.real && result.dbSource !== 'none') {
      const key = `db:${result.source}`
      perDbSourceHit[key] = (perDbSourceHit[key] ?? 0) + 1
    }

    if (result.real) return  // found — not fictional

    // Not found. Classify severity based on DB source + PN structure.
    const isStructured = STRUCTURED_PN_REGEX.test(mpn)

    // Severity matrix:
    //   cache_miss_confirmed + structured PN  → HIGH (confirmed fictional)
    //   cache_miss_confirmed + unstructured   → MED  (confirmed absent, but may be OEM-direct)
    //   unknown + structured PN               → MED  (needs ingest, NOT confirmed fictional)
    //   unknown + unstructured                → LOW  (informational)
    let severity: FictionalPnSeverity
    if (result.source === 'cache_miss_confirmed') {
      severity = isStructured ? 'HIGH' : 'MED'
    } else {
      // source === 'unknown'
      severity = isStructured ? 'MED' : 'LOW'
    }

    const confirmedAbsent = result.source === 'cache_miss_confirmed'
    const reasonPrefix = confirmedAbsent
      ? `MPN "${mpn}"${manufacturer ? ` (${manufacturer})` : ''} is confirmed absent from all distributor catalogues in forge-truth.db (ingest previously checked and found nothing). `
      : `MPN "${mpn}"${manufacturer ? ` (${manufacturer})` : ''} is not yet in forge-truth.db (has not been ingested). `
    const structuredNote = isStructured
      ? 'The MPN matches a structured part-number pattern (alphanumeric+separator+alphanumeric), suggesting a plausible-looking but potentially hallucinated part number.'
      : 'The MPN does not match a structured part-number pattern — may be a valid OEM-direct or custom part.'
    const severityNote = severity === 'HIGH'
      ? 'HIGH: confirmed absent AND structured PN — likely hallucinated.'
      : severity === 'MED'
        ? confirmedAbsent
          ? 'MED: confirmed absent but unstructured PN — possibly valid OEM-direct.'
          : 'MED: not yet ingested AND structured PN — run ingest to confirm.'
        : 'LOW: not yet ingested AND unstructured PN — informational only.'

    findings.push({
      id: `${word_id}:${mpn}`,
      mpn,
      manufacturer,
      word_id,
      module_id,
      sub_module_id,
      severity,
      reason: `${reasonPrefix}${structuredNote} ${severityNote}`,
      db_source: result.source,
      explanation:
        confirmedAbsent
          ? `Gate 20 DB-only check: "${mpn}" is in distributor_cascade_cache with miss=1 ` +
            `(ingest confirmed non-existent). Fix: (a) replace with a real ${manufacturer ?? 'manufacturer'} ` +
            `MPN from Mouser/Digi-Key/Farnell/LCSC, OR (b) add a "custom" prefix if OEM-direct.`
          : `Gate 20 DB-only check: "${mpn}" has no row in distributor_cascade_cache or ` +
            `pretraining_extracted_parts. This is NOT confirmed fictional — it may be real but not ` +
            `yet ingested. Run scripts/ingest/run-weekly-component-sweep.sh to populate the DB ` +
            `for this part class. If you need immediate confirmation, add it to KNOWN_PART_AUTHORITATIVE ` +
            `in parts-spec-validator.ts.`,
    })
  })

  // DB reads are synchronous but tasks are async-compatible
  await Promise.all(tasks.map((t) => t()))

  return {
    findings,
    lines_audited: linesAudited,
    lines_skipped_curated: linesSkippedCurated,
    lines_skipped_commodity: linesSkippedCommodity,
    lines_skipped_too_short: linesSkippedTooShort,
    nexar_calls: 0,  // DB-only mode: no live API calls ever
    per_distributor_hit: perDbSourceHit,
    product_class: productClass,
  }
}

// ── MARKDOWN RENDERER ────────────────────────────────────────────────────────

function renderMarkdown(result: FictionalPnAuditResult, statePath: string): string {
  const lines: string[] = []
  lines.push(`# Fictional-Part-Number Audit (gate 20, DB-only) — ${statePath}`)
  lines.push('')
  lines.push(`**Product class:** \`${result.product_class}\``)
  lines.push('')
  lines.push(
    `**${result.lines_audited} BoM line(s) audited** against forge-truth.db ` +
    `(${result.lines_skipped_curated} skipped — in curated gate-13 table; ` +
    `${result.lines_skipped_commodity} skipped — commodity descriptor; ` +
    `${result.lines_skipped_too_short} skipped — too short / junk).`,
  )
  lines.push('')
  lines.push(
    `**Architecture:** DB-only reads from \`~/.forge-truth/forge-truth.db\`. ` +
    `No live distributor API calls. Zero quota consumed. ` +
    `Live discovery handled by \`scripts/ingest/run-weekly-component-sweep.sh\`.`,
  )
  lines.push('')
  if (Object.keys(result.per_distributor_hit).length > 0) {
    lines.push('**DB source hits (confirmed real parts):**')
    for (const [src, count] of Object.entries(result.per_distributor_hit).sort()) {
      lines.push(`  - ${src}: ${count}`)
    }
    lines.push('')
  }

  if (result.findings.length === 0) {
    lines.push(`PASS — every audited MPN found in forge-truth.db (cache_hit or library_only).`)
    return lines.join('\n')
  }

  const high = result.findings.filter((f) => f.severity === 'HIGH')
  const med = result.findings.filter((f) => f.severity === 'MED')
  const low = result.findings.filter((f) => f.severity === 'LOW')
  lines.push(
    `FAIL — ${result.findings.length} finding(s): ${high.length} HIGH, ${med.length} MED, ${low.length} LOW.`,
  )
  lines.push('')
  lines.push(
    `> HIGH = confirmed absent (cache_miss_confirmed) + structured PN → chain fails. ` +
    `MED/LOW = needs ingest OR confirmed absent + unstructured PN → informational only.`,
  )
  lines.push('')

  const sorted = [...result.findings].sort((a, b) => {
    const order: Record<FictionalPnSeverity, number> = { HIGH: 0, MED: 1, LOW: 2 }
    return order[a.severity] - order[b.severity]
  })

  for (const f of sorted) {
    const mfrDisplay = f.manufacturer ? ` (${f.manufacturer})` : ''
    lines.push(`## [${f.severity}] ${f.mpn}${mfrDisplay} — fictional or un-ingested part number`)
    lines.push(`- **id:** \`${f.id}\``)
    lines.push(`- **Module:** \`${f.module_id}\` → \`${f.sub_module_id}\``)
    lines.push(`- **DB source:** \`${f.db_source}\``)
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
      `[fictional-pn-audit] PASS: ${result.lines_audited} lines audited (DB-only, zero quota consumed), ` +
      `${result.findings.length} non-blocking findings ` +
      `(${result.findings.filter((f) => f.severity === 'MED').length} MED, ` +
      `${result.findings.filter((f) => f.severity === 'LOW').length} LOW).`,
    )
  }).catch((err) => {
    console.error(`[fictional-pn-audit] runtime error: ${(err as Error).message}`)
    process.exit(1)
  })
}
