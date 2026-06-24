/**
 * web-extraction-verify.ts — VERIFY-BEFORE-WRITEBACK guard for the LLM-web knowledge writebacks
 * (Tristan 2026-06-24). The specs / standards / products writebacks were persisting a grounded-LLM
 * value + a cited URL straight into forge-truth.db with only a "value is non-empty" check — so a
 * hallucinated value (the LLM says 1500 A when the part is 500 A) became a confident DB hit on the
 * next run. Parts have a real verify (a distributor catalogue must actually return the MPN); these
 * three did not. The growing-DB principle's own guard ("VERIFY exists before writeback") was unmet.
 *
 * The strong, universal check is EVIDENCE COHERENCE: an LLM can fabricate a value, but it cannot
 * easily also (a) cite a real authoritative source URL AND (b) supply a verbatim excerpt that
 * actually CONTAINS the value it claims. So a writeback is accepted only when value + URL + a
 * supporting excerpt agree. This is class-agnostic (no per-spec table) and fully synchronous.
 */

const URL_RE = /^https?:\/\/[^\s/]+\.[a-z]{2,}(?:[:/?#]|$)/i
const GENERIC_EXCERPT_RE = /^(not found|n\/?a|none|unknown|see\s+(the\s+)?datasheet|refer\s+to|tbd|tbc)\b/i

/** digits-and-dots normalisation for value-in-excerpt matching ("1,500 A" → "1500"). */
function numToken(s: string): string | null {
  const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return m ? m[0] : null
}
function alnum(s: string): string { return String(s ?? '').toLowerCase().replace(/[^a-z0-9.]/g, '') }

export interface WebExtractionCheck {
  value?: string          // the claimed value (spec value, standard_name, product_name)
  source_url?: string
  raw_excerpt?: string
  requireValueInExcerpt?: boolean   // true for specs (numeric) — the excerpt MUST support the value
  requireExcerpt?: boolean          // default true; false for structured products (URL is the evidence)
}

/**
 * Returns {ok,reason}. ok=true only when there is real evidence the writeback is trustworthy:
 *   1. a value is present,
 *   2. a real authoritative-looking source URL is present,
 *   3. a substantive verbatim excerpt is present (not "not found"/generic),
 *   4. (requireValueInExcerpt) the excerpt actually CONTAINS the claimed value — the check that
 *      catches a hallucinated spec (the value the LLM returns is not in the sentence it cites).
 */
export function isVerifiedWebExtraction(x: WebExtractionCheck): { ok: boolean; reason: string } {
  const value = String(x?.value ?? '').trim()
  const url = String(x?.source_url ?? '').trim()
  const ex = String(x?.raw_excerpt ?? '').trim()
  if (!value || /^not found$/i.test(value)) return { ok: false, reason: 'no value' }
  if (!URL_RE.test(url)) return { ok: false, reason: `no authoritative source URL (got "${url.slice(0, 48)}")` }
  const needExcerpt = x?.requireExcerpt !== false
  if (needExcerpt && (ex.length < 12 || GENERIC_EXCERPT_RE.test(ex))) return { ok: false, reason: 'no substantive verbatim excerpt (no evidence)' }
  if (x?.requireValueInExcerpt) {
    const exA = alnum(ex)
    const vNum = numToken(value)
    if (vNum) {
      // the claimed NUMBER must appear in the cited sentence; otherwise the value is unsupported
      if (!alnum(ex).includes(alnum(vNum))) return { ok: false, reason: `excerpt does not contain the claimed value "${value}" — unsupported (likely hallucinated)` }
    } else {
      // non-numeric value (e.g. a material/grade): its first token must appear in the excerpt
      const vTok = alnum(value).slice(0, 6)
      if (vTok && !exA.includes(vTok)) return { ok: false, reason: `excerpt does not reference the claimed value "${value}"` }
    }
  }
  return { ok: true, reason: 'verified: authoritative URL + supporting excerpt' }
}

function _selftest() {
  let bad = 0
  const ok = (x: WebExtractionCheck, want: boolean, msg: string) => {
    const r = isVerifiedWebExtraction(x)
    if (r.ok !== want) { console.log(`  FAIL: ${msg} — got ok=${r.ok} (${r.reason})`); bad++ }
  }
  // a real, supported spec → accepted
  ok({ value: '500', source_url: 'https://schaltbau.com/datasheets/c310.pdf', raw_excerpt: 'C310 rated current 500 A continuous at 24 V DC', requireValueInExcerpt: true }, true, 'supported 500A spec')
  // the hallucinated value (1500) NOT in the excerpt (says 500) → REJECTED (the headline fix)
  ok({ value: '1500', source_url: 'https://schaltbau.com/datasheets/c310.pdf', raw_excerpt: 'C310 rated current 500 A continuous at 24 V DC', requireValueInExcerpt: true }, false, 'hallucinated 1500A against a 500A excerpt')
  // no URL → rejected
  ok({ value: '500', source_url: '', raw_excerpt: 'rated current 500 A', requireValueInExcerpt: true }, false, 'missing URL')
  // generic/empty excerpt → rejected
  ok({ value: '500', source_url: 'https://x.com/a', raw_excerpt: 'not found', requireValueInExcerpt: true }, false, 'generic excerpt')
  // a standard scope (no value-in-excerpt requirement) → accepted on URL + excerpt
  ok({ value: 'IEC 62619', source_url: 'https://webstore.iec.ch/publication/64073', raw_excerpt: 'IEC 62619:2022 specifies requirements for the safe operation of secondary lithium cells and batteries used in industrial applications' }, true, 'standard scope with evidence')
  // not-a-URL string → rejected
  ok({ value: '500', source_url: 'datasheet', raw_excerpt: 'rated current 500 A continuous', requireValueInExcerpt: true }, false, 'non-URL source')
  console.log(bad === 0 ? 'web-extraction-verify selftest: OK' : `web-extraction-verify selftest: ${bad} FAIL`)
  if (bad) process.exit(1)
}

if (process.argv.includes('--selftest')) _selftest()
