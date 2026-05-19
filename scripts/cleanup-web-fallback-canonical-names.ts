/**
 * @file cleanup-web-fallback-canonical-names.ts
 *
 * @description Mop-up pass for `companies.name` values written by the
 * web_fallback_pdf_engine path that ended up as product lines / page titles
 * rather than canonical company names.
 *
 * Background: scripts/supplier-enrichment/persist-web-fallback.ts has a
 * defensive cleaner (defensivelyCleanName) which splits on " | ", " - ",
 * " – ", " — " and prefers the segment matching the apex host. That fails
 * when the page title contains NO separator — e.g. sigmaaldrich.com returns
 * "Bioprocessing Mobius® Single-Use Bioreactors" with no pipe, so the
 * cleaner leaves it untouched.
 *
 * This one-shot script:
 *   1. SELECTs all `source = 'web_fallback_pdf_engine'` rows.
 *   2. For each, applies a known-domain mapping (sigmaaldrich.com → MilliporeSigma,
 *      merckmillipore.com → MilliporeSigma, biorad.com → Bio-Rad Laboratories).
 *   3. For the rest, runs Flash-Lite (google/gemini-3.1-flash-lite-preview, the
 *      same model used by cleanCompanyName in enrich-state-with-suppliers.tsx)
 *      to decide whether the name is a product line or already canonical.
 *   4. UPDATEs offenders: name = parent_company, attributes_json gets
 *      original_page_title + name_cleaned_at audit fields.
 *
 * @usage npx tsx scripts/cleanup-web-fallback-canonical-names.ts [--apply]
 *        (default is dry-run; pass --apply to write changes)
 */
import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'

const FORGE_TRUTH_DB = '/Users/tristanfischer/.forge-truth/forge-truth.db'
const DRY_RUN = !process.argv.includes('--apply')

// ---- Secret loading: mirrors enrich-state-with-suppliers.tsx ----------------
const OPENROUTER_KEY = (() => {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  const candidates = [
    '/Users/tristanfischer/.claude/secrets/openrouter.env',
    '/Users/tristanfischer/secrets/openrouter.env',
    '/Users/tristanfischer/.openrouter',
  ]
  for (const f of candidates) {
    if (existsSync(f)) {
      const content = readFileSync(f, 'utf-8')
      const m = content.match(/OPENROUTER_API_KEY=([^\s]+)/)
      if (m) return m[1]
    }
  }
  try {
    return execFileSync('zsh', ['-ic', 'echo $OPENROUTER_API_KEY'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
})()

if (!OPENROUTER_KEY) {
  console.error('[cleanup] OPENROUTER_API_KEY not found — cannot run LLM checks')
  process.exit(1)
}

// ---- Known-domain mappings (skip the LLM call) ------------------------------
const KNOWN_MAPPINGS: Record<string, { canonical: string; parent: string | null }> = {
  'sigmaaldrich.com': { canonical: 'MilliporeSigma', parent: 'Merck KGaA' },
  'merckmillipore.com': { canonical: 'MilliporeSigma', parent: 'Merck KGaA' },
  'biorad.com': { canonical: 'Bio-Rad Laboratories', parent: null },
  // GE healthcare bioprocessing was sold to Danaher in 2020 — context-specific
  // mapping not encoded here because ge.com is ambiguous across product lines.
}

// ---- SQLite helpers ---------------------------------------------------------
function sqlEscape(s: string): string {
  return (s ?? '').replace(/'/g, "''")
}

interface CompanyRow {
  id: string
  name: string
  domain: string
  source: string
  attributes_json: string | null
}

function fetchWebFallbackRows(): CompanyRow[] {
  const sql = `SELECT id, name, COALESCE(domain, '') AS domain, source, attributes_json
               FROM companies WHERE source = 'web_fallback_pdf_engine'`
  const out = execFileSync('sqlite3', ['-cmd', '.mode json', FORGE_TRUTH_DB, sql], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (!out.trim()) return []
  return JSON.parse(out)
}

// ---- LLM canonical-name check -----------------------------------------------
interface CanonCheck {
  canonical_company_name: string
  is_product_line: boolean
  parent_company: string | null
  reasoning?: string
}

async function checkCanonicalName(
  currentName: string,
  domain: string,
): Promise<CanonCheck | null> {
  const prompt = `Given a company record from a supplier database, decide whether the persisted "name" is a canonical company name (the legal or colloquial name of the entity that owns the domain) OR a product line / page title that slipped through scraping.

Input:
- Persisted name: "${currentName}"
- Domain: "${domain}"

Rules:
- The canonical company name is the legal or colloquial name of the COMPANY that owns this domain, NOT a product line, brand sub-name, or page title.
- If the persisted name is already a clean company name (e.g. "Sartorius", "Fabdec", "Getinge", "Bio-Rad"), set is_product_line=false and echo the name as canonical_company_name. parent_company=null unless you have high confidence the company has a clearly different parent group.
- If the persisted name looks like a product line, technology category, or page title (e.g. "Bioprocessing Mobius® Single-Use Bioreactors", "Pressure Vessels Manufacturing", "Single-Use Solutions"), set is_product_line=true and return the canonical company that owns this domain in canonical_company_name. If that company is a subsidiary, also set parent_company.
- Be conservative: when uncertain, set is_product_line=false. False positives are worse than false negatives here.

Output ONLY a JSON object: {"canonical_company_name": "...", "is_product_line": <bool>, "parent_company": "..." | null, "reasoning": "one short sentence"}`

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS supplier name cleanup mop-up',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-lite-preview',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 250,
        temperature: 0.1,
      }),
    })
    if (!res.ok) {
      console.error(`[cleanup] HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`)
      return null
    }
    const j: any = await res.json()
    const text: string = j.choices?.[0]?.message?.content ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error(`[cleanup] no JSON in response: ${text.slice(0, 200)}`)
      return null
    }
    const parsed = JSON.parse(jsonMatch[0])
    return {
      canonical_company_name: String(parsed.canonical_company_name ?? '').trim(),
      is_product_line: Boolean(parsed.is_product_line),
      parent_company: parsed.parent_company ? String(parsed.parent_company).trim() : null,
      reasoning: parsed.reasoning ? String(parsed.reasoning) : undefined,
    }
  } catch (err: any) {
    console.error(`[cleanup] LLM call error: ${err.message}`)
    return null
  }
}

// ---- UPDATE row -------------------------------------------------------------
function applyUpdate(row: CompanyRow, newName: string): void {
  let attrs: any = {}
  if (row.attributes_json) {
    try {
      attrs = JSON.parse(row.attributes_json)
      if (!attrs || typeof attrs !== 'object') attrs = {}
    } catch {
      attrs = {}
    }
  }
  attrs.original_page_title = row.name
  attrs.name_cleaned_at = new Date().toISOString()
  attrs.name_cleaned_by = 'cleanup-web-fallback-canonical-names'

  const attrsJson = sqlEscape(JSON.stringify(attrs))
  const nameEsc = sqlEscape(newName)
  const idEsc = sqlEscape(row.id)
  const sql = `UPDATE companies SET name = '${nameEsc}', attributes_json = '${attrsJson}', updated_at = datetime('now') WHERE id = '${idEsc}'`
  execFileSync('sqlite3', [FORGE_TRUTH_DB, sql], { encoding: 'utf8' })
}

// ---- Main -------------------------------------------------------------------
async function main() {
  console.log(`[cleanup] mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'APPLY (will UPDATE rows)'}`)
  const rows = fetchWebFallbackRows()
  console.log(`[cleanup] scanned ${rows.length} rows with source='web_fallback_pdf_engine'`)

  let flagged = 0
  let updated = 0
  let unsure: { id: string; name: string; domain: string; reason: string }[] = []
  const decisions: {
    id: string
    domain: string
    before: string
    after: string | null
    source: 'known_mapping' | 'llm' | 'skipped_clean'
    reasoning?: string
  }[] = []

  for (const row of rows) {
    const known = KNOWN_MAPPINGS[row.domain]
    if (known) {
      // Known-domain shortcut: trust the mapping, no LLM call.
      flagged += 1
      decisions.push({
        id: row.id,
        domain: row.domain,
        before: row.name,
        after: known.canonical,
        source: 'known_mapping',
        reasoning: known.parent ? `parent group: ${known.parent}` : undefined,
      })
      if (!DRY_RUN) {
        applyUpdate(row, known.canonical)
        updated += 1
      }
      continue
    }

    const check = await checkCanonicalName(row.name, row.domain)
    if (!check) {
      unsure.push({ id: row.id, name: row.name, domain: row.domain, reason: 'LLM call failed' })
      decisions.push({ id: row.id, domain: row.domain, before: row.name, after: null, source: 'llm', reasoning: 'LLM call failed' })
      continue
    }
    if (!check.is_product_line) {
      decisions.push({
        id: row.id,
        domain: row.domain,
        before: row.name,
        after: row.name,
        source: 'skipped_clean',
        reasoning: check.reasoning,
      })
      continue
    }
    // is_product_line === true → flag for update
    const newName = check.canonical_company_name || check.parent_company || ''
    if (!newName) {
      unsure.push({
        id: row.id,
        name: row.name,
        domain: row.domain,
        reason: 'LLM said product-line but returned no canonical/parent name',
      })
      decisions.push({
        id: row.id,
        domain: row.domain,
        before: row.name,
        after: null,
        source: 'llm',
        reasoning: 'product-line but no canonical name returned',
      })
      continue
    }
    flagged += 1
    decisions.push({
      id: row.id,
      domain: row.domain,
      before: row.name,
      after: newName,
      source: 'llm',
      reasoning: check.reasoning,
    })
    if (!DRY_RUN) {
      applyUpdate(row, newName)
      updated += 1
    }
  }

  // Report -------------------------------------------------------------------
  console.log('')
  console.log('=== DECISIONS ===')
  for (const d of decisions) {
    if (d.source === 'skipped_clean') {
      console.log(`[skip clean] ${d.id} (${d.domain}): "${d.before}" — ${d.reasoning ?? 'already clean'}`)
    } else if (d.source === 'known_mapping') {
      console.log(`[known map ] ${d.id} (${d.domain}): "${d.before}" → "${d.after}"${d.reasoning ? ` (${d.reasoning})` : ''}`)
    } else {
      if (d.after && d.after !== d.before) {
        console.log(`[llm flag  ] ${d.id} (${d.domain}): "${d.before}" → "${d.after}" — ${d.reasoning ?? ''}`)
      } else {
        console.log(`[llm unsure] ${d.id} (${d.domain}): "${d.before}" — ${d.reasoning ?? ''}`)
      }
    }
  }
  console.log('')
  console.log(`=== SUMMARY ===`)
  console.log(`scanned: ${rows.length}`)
  console.log(`flagged as product-line: ${flagged}`)
  console.log(`updated: ${updated} ${DRY_RUN ? '(DRY-RUN — no DB writes)' : ''}`)
  console.log(`unsure (audit manually): ${unsure.length}`)
  if (unsure.length > 0) {
    console.log('--- unsure rows ---')
    for (const u of unsure) {
      console.log(`  ${u.id} (${u.domain}): "${u.name}" — ${u.reason}`)
    }
  }
}

main().catch((err) => {
  console.error('[cleanup] fatal:', err)
  process.exit(1)
})
