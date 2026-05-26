/**
 * @file allowlist-builder.ts
 *
 * Builds the verified-parts allowlist used by Phase 2 repair to hard-reject
 * hallucinated MPNs before they enter state.json.
 *
 * THREE SOURCES (per drawer forgeos_gotchas_1c9b53af5c9aaf32):
 *
 *   1. KNOWN_PART_AUTHORITATIVE — curated manufacturer-datasheet entries.
 *      Each entry carries a part_number_pattern (RegExp). We synthesise a
 *      canonical part_number string from the pattern for allowlist purposes
 *      by using the pattern source stripped of regex metacharacters.
 *      Matching at applyPatches time uses case-insensitive test against the
 *      original RegExp — not string equality — so "EV200HAANA" passes even
 *      though the allowlist entry was built from the pattern.
 *
 *   2. Stage 17.6 RAG library candidates — real parts from the
 *      pretraining_extracted_parts SQLite library that were surfaced as
 *      advisory candidates for this chain run. Loaded from the
 *      4-library-candidates.json file written by the chain.
 *
 *   3. Deterministic-emitter emitted parts — MPNs that the deterministic
 *      emitter already pinned into this chain's modules[] before Phase 2
 *      runs. Extracted by walking modules[] and collecting every
 *      modifier_characters[kind=part_number].value.
 *
 * USAGE IN THE CHAIN:
 *
 *   const allowlist = await buildVerifiedPartsAllowlist({
 *     modules: design.modules,
 *     libCandidatesPath: resolve(outDir, '4-library-candidates.json'),
 *   })
 *
 *   // Pass to repair() and applyPatches():
 *   const rep = await repair({ ..., verifiedPartsAllowlist: allowlist })
 *   const applied = applyPatches(modules, crossLinks, rep.patches, { verifiedPartsAllowlist: allowlist })
 *
 * WHY THIS IS IN src/ NOT scripts/:
 *   applyPatches lives in universal-repair.ts (src/). The allowlist type and
 *   builder live alongside it so the import is within the same package
 *   boundary. The chain (scripts/) imports from here.
 *
 * Codified 2026-05-26 per handover 2026-05-26T05-34-4dd3f4a39.md Shift B item 1.
 * Pre-change mempalace search: "Phase 2 repair LLM allowlist hallucinate
 * part_number EBS-500" + "applyPatches universal-repair structural validator"
 * → 2 drawers loaded (forgeos_gotchas_1c9b53af5c9aaf32 + fixes/part-verification).
 */

import { existsSync, readFileSync } from 'node:fs'
import { KNOWN_PART_AUTHORITATIVE } from '../../../../scripts/lib/parts-spec-validator'
import type { ModuleSpec } from '../types/module-decomposition'

// ── PUBLIC TYPES ────────────────────────────────────────────────────────────

/**
 * One entry in the verified-parts allowlist. The allowlist consumer in
 * applyPatches checks:
 *   - part_number_pattern.test(candidate_mpn)  — case-insensitive
 *   - manufacturer_norm matches (substring, case-insensitive)
 *
 * Either match alone is sufficient to pass: a part with the right MPN but
 * an unrecognised manufacturer_norm still passes (we trust the MPN as the
 * authoritative identifier). Only MPNs with ZERO matching entries across
 * all three sources are rejected.
 */
export interface AllowlistEntry {
  /** Original human-readable manufacturer name (for logging). */
  manufacturer: string
  /** Canonical part number string (for logging). May be a pattern description. */
  part_number: string
  /** RegExp used for matching at validate time. */
  part_number_pattern: RegExp
  /** Normalised manufacturer (lowercase, trimmed) for fuzzy match. */
  manufacturer_norm: string
  /** Where this entry came from — for diagnostics. */
  source: 'KNOWN_PART_AUTHORITATIVE' | 'rag_library' | 'deterministic_emitter'
}

export interface VerifiedPartsAllowlist {
  entries: AllowlistEntry[]
  /** Total count per source. */
  source_counts: Record<AllowlistEntry['source'], number>
  /** ISO timestamp when the allowlist was built. */
  built_at: string
}

// ── PRIVATE HELPERS ─────────────────────────────────────────────────────────

function normaliseMfr(mfr: string): string {
  return mfr.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Build a loose display string from a RegExp source.
 * Strips anchors and common regex metacharacters to get something human-readable.
 */
function regexToDisplay(re: RegExp): string {
  return re.source
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replace(/\(\?:[^)]*\)\?/g, '[...]')
    .replace(/\[.*?\]/g, '[...]')
    .slice(0, 64)
}

/**
 * Walk a modules[] tree and extract every (manufacturer, part_number) pair
 * already pinned by the deterministic emitter (i.e. present in the design
 * BEFORE Phase 2 repair runs).
 */
function extractEmittedParts(modules: ModuleSpec[]): Array<{ manufacturer: string; part_number: string }> {
  const results: Array<{ manufacturer: string; part_number: string }> = []
  const safeModules = Array.isArray(modules) ? modules : []
  for (const m of safeModules) {
    const subs = Array.isArray((m as any)?.sub_modules) ? (m as any).sub_modules : []
    for (const sm of subs) {
      const words = Array.isArray(sm?.words) ? sm.words : []
      for (const w of words) {
        const mods: Array<{ kind: string; value: string }> = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
        const mfrMod = mods.find(mc => mc.kind === 'manufacturer')
        const pnMod = mods.find(mc => mc.kind === 'part_number')
        if (mfrMod && pnMod) {
          const mfr = String(mfrMod.value ?? '').trim()
          const pn = String(pnMod.value ?? '').trim()
          if (mfr && pn) results.push({ manufacturer: mfr, part_number: pn })
        }
      }
    }
  }
  return results
}

/**
 * Load the Stage 17.6 library candidates from the JSON file written by the
 * chain's queryLibraryCandidates call. Returns empty array if file missing
 * or unparseable (graceful — library is advisory only).
 */
function loadRagCandidates(libCandidatesPath: string): Array<{ manufacturer: string | null; part_number: string | null }> {
  if (!existsSync(libCandidatesPath)) return []
  try {
    const raw = readFileSync(libCandidatesPath, 'utf-8')
    const parsed = JSON.parse(raw)
    // File format: { queries: [{ candidates: [{ manufacturer, part_number }] }] }
    // OR direct array of candidates — handle both.
    let candidates: any[] = []
    if (Array.isArray(parsed)) {
      candidates = parsed
    } else if (parsed?.queries && Array.isArray(parsed.queries)) {
      for (const q of parsed.queries) {
        const cands = Array.isArray(q?.candidates) ? q.candidates : (Array.isArray(q?.result?.candidates) ? q.result.candidates : [])
        candidates = candidates.concat(cands)
      }
    } else if (parsed?.candidates && Array.isArray(parsed.candidates)) {
      candidates = parsed.candidates
    }
    return candidates
      .filter(c => c && typeof c === 'object')
      .map(c => ({ manufacturer: c.manufacturer ?? null, part_number: c.part_number ?? null }))
      .filter(c => c.part_number && String(c.part_number).trim().length >= 3)
  } catch {
    return []
  }
}

// ── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Build the verified-parts allowlist for a chain run.
 *
 * @param opts.modules — design.modules BEFORE Phase 2 repair patches are
 *   applied. Used to extract deterministic-emitter MPNs.
 * @param opts.libCandidatesPath — absolute path to the chain's
 *   4-library-candidates.json file (written by Stage 17.6).
 */
export function buildVerifiedPartsAllowlist(opts: {
  modules: ModuleSpec[]
  libCandidatesPath: string
}): VerifiedPartsAllowlist {
  const entries: AllowlistEntry[] = []
  const sourceCounts: Record<AllowlistEntry['source'], number> = {
    KNOWN_PART_AUTHORITATIVE: 0,
    rag_library: 0,
    deterministic_emitter: 0,
  }

  // ── Source 1: KNOWN_PART_AUTHORITATIVE ────────────────────────────────────
  for (const spec of KNOWN_PART_AUTHORITATIVE) {
    entries.push({
      manufacturer: spec.manufacturer,
      part_number: regexToDisplay(spec.part_number_pattern),
      part_number_pattern: spec.part_number_pattern,
      manufacturer_norm: normaliseMfr(spec.manufacturer),
      source: 'KNOWN_PART_AUTHORITATIVE',
    })
    sourceCounts.KNOWN_PART_AUTHORITATIVE++
  }

  // ── Source 2: RAG library candidates ─────────────────────────────────────
  const ragCandidates = loadRagCandidates(opts.libCandidatesPath)
  for (const c of ragCandidates) {
    const pn = String(c.part_number ?? '').trim()
    const mfr = String(c.manufacturer ?? 'unknown').trim()
    if (!pn) continue
    // Build a case-insensitive literal pattern for exact MPN match.
    // Escape regex special chars so "NB 65-250/245 BQQE" doesn't break.
    const escaped = pn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    entries.push({
      manufacturer: mfr,
      part_number: pn,
      part_number_pattern: new RegExp(`^${escaped}$`, 'i'),
      manufacturer_norm: normaliseMfr(mfr),
      source: 'rag_library',
    })
    sourceCounts.rag_library++
  }

  // ── Source 3: Deterministic-emitter emitted parts ─────────────────────────
  const emittedParts = extractEmittedParts(opts.modules)
  for (const ep of emittedParts) {
    const escaped = ep.part_number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    entries.push({
      manufacturer: ep.manufacturer,
      part_number: ep.part_number,
      part_number_pattern: new RegExp(`^${escaped}$`, 'i'),
      manufacturer_norm: normaliseMfr(ep.manufacturer),
      source: 'deterministic_emitter',
    })
    sourceCounts.deterministic_emitter++
  }

  return {
    entries,
    source_counts: sourceCounts,
    built_at: new Date().toISOString(),
  }
}

/**
 * Check whether a candidate MPN is in the allowlist.
 *
 * Returns the matching entry (for logging) or null if not found.
 * Matching is case-insensitive and uses the entry's part_number_pattern RegExp.
 */
export function allowlistContainsMpn(
  allowlist: VerifiedPartsAllowlist,
  candidateMpn: string,
): AllowlistEntry | null {
  if (!candidateMpn || candidateMpn.trim().length === 0) return null
  const trimmed = candidateMpn.trim()
  for (const entry of allowlist.entries) {
    if (entry.part_number_pattern.test(trimmed)) return entry
  }
  return null
}

/**
 * Render a compact summary of the allowlist for injection into the Phase 2
 * LLM system prompt. Lists MPNs grouped by source so the LLM can reference
 * them without needing to parse JSON.
 *
 * Format:
 *   VERIFIED PARTS ALLOWLIST (N entries) — Phase 2 MUST ONLY emit MPNs from this list.
 *   Source: KNOWN_PART_AUTHORITATIVE (N)
 *     - Schaltbau C310 | Schaltbau C330 | ...
 *   Source: deterministic_emitter (N)
 *     - EV200HAANA (TE Connectivity) | MBJ50-300-10 (nVent ERIFLEX) | ...
 *   Source: rag_library (N)
 *     - NB 65-250/245 BQQE (Grundfos) | ...
 */
export function renderAllowlistForPrompt(allowlist: VerifiedPartsAllowlist): string {
  const bySource = new Map<AllowlistEntry['source'], AllowlistEntry[]>()
  for (const e of allowlist.entries) {
    if (!bySource.has(e.source)) bySource.set(e.source, [])
    bySource.get(e.source)!.push(e)
  }

  const total = allowlist.entries.length
  const lines: string[] = [
    `VERIFIED PARTS ALLOWLIST (${total} entries — chain-start snapshot ${allowlist.built_at}):`,
    `You may ONLY emit part_numbers from this allowlist. ANY MPN not in this list WILL BE HARD-REJECTED by the chain's applyPatches validator — the patch will be silently dropped. Do NOT invent MPNs.`,
    `If you need a part not in this list, emit the manufacturer name only (no part_number) — the validator cannot reject a modifier that omits part_number entirely.`,
    ``,
  ]

  const sourceOrder: AllowlistEntry['source'][] = ['KNOWN_PART_AUTHORITATIVE', 'deterministic_emitter', 'rag_library']
  for (const src of sourceOrder) {
    const entries = bySource.get(src) ?? []
    if (entries.length === 0) continue
    lines.push(`Source: ${src} (${entries.length})`)
    // Group into rows of 6 for readability
    const row: string[] = []
    for (const e of entries) {
      row.push(`${e.part_number} (${e.manufacturer})`)
      if (row.length === 6) { lines.push('  ' + row.join(' | ')); row.length = 0 }
    }
    if (row.length > 0) lines.push('  ' + row.join(' | '))
    lines.push('')
  }

  return lines.join('\n')
}
