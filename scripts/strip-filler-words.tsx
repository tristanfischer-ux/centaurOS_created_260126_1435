#!/usr/bin/env npx tsx
/**
 * strip-filler-words.tsx — one-off STATE-STRIP (approach A) to remove the 36
 * placeholder "Filler word N" / "Filler N" line items that a Phase-2 density-gate
 * repair pass injected into the CO₂ dossier to satisfy `sub_module_word_density`
 * (≥5 words/sub-module). These are NOT real engineering parts; they inflate the
 * BoM sub-totals + grand total.
 *
 * What it does (deterministic, no LLM, no chain):
 *   1. Removes every word matching PLACEHOLDER_LABEL_RE from
 *      moduleDecomposition.modules[].sub_modules[].words[] (label resolved via
 *      name_human / content_character.name_human / content_character.character_id —
 *      the same RESOLVED-label rule the advisor gather path uses).
 *   2. Removes the matching entries from state.partVerifications (by word_id +
 *      word_name).
 *   3. Scrubs the placeholder clauses out of each affected sub-module's
 *      english_sentence + rad_syntax (they render in the BoM/module prose body, so
 *      a leftover "a Filler 9 (part Standard)" clause would still show "Filler"
 *      text even after the line is gone). Real-part clauses are untouched.
 *   4. RECOMPUTES the cached cost totals (cost_reality.bom_total_gbp /
 *      priced_lines / unpriced_lines AND the full costStack) from the REMAINING
 *      real parts using the renderer's OWN computeBomTotals + computeCostStack so
 *      state-level consumers stay consistent with what the PDF now renders. (The
 *      renderer re-derives costStack from computeBomTotals at render time, so the
 *      table + cover already drop on their own; this step keeps the cached state
 *      fields from lying to any non-render consumer.)
 *
 * Usage: npx tsx scripts/strip-filler-words.tsx <in-state.json> <out-state.json>
 */
import * as fs from 'node:fs'
import { computeBomTotals } from './render-minimal-pdf'
import { resolveCostStack, computeCostStack } from '../src/lib/pdf-engine-v2/class-cost-structure'

// The EXACT regex exported from advisor-engagement.ts (PLACEHOLDER_LABEL_RE),
// inlined so this throwaway script has zero import side-effects from that module.
const PLACEHOLDER_LABEL_RE = /^(?:filler(?:\s+word)?|component|word|item|part|sub[\s-]?module|placeholder|slot|tbd|tba|n\/a)\s*\d*$/i
function isPlaceholderLabel(s: unknown): boolean {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return !t ? false : PLACEHOLDER_LABEL_RE.test(t)
  // NB: empty-string is NOT treated as a filler here (a word with a blank
  // name_human but a real content_character is a real part); the live
  // isPlaceholderLabel returns true on empty, but for STRIPPING we only remove
  // words that POSITIVELY resolve to a placeholder label on at least one field.
}

/** A word is a filler iff ANY of its resolved labels matches the placeholder RE. */
function wordIsFiller(w: any): boolean {
  const cc = w?.content_character ?? {}
  return (
    isPlaceholderLabel(w?.name_human) ||
    isPlaceholderLabel(cc?.name_human) ||
    isPlaceholderLabel(cc?.character_id)
  )
}

/**
 * Scrub filler clauses out of a single prose / rad-syntax string. Handles three
 * concrete forms seen in the CO₂ state's cached prose:
 *   (a) English enumeration clauses ".. and a Filler 11." / "A Filler 9 (part Standard). "
 *   (b) "An Internal Standard filler 11, certified to IEC 60034 (additional: list price gbp: 0). "
 *   (c) rad-syntax bracket groups "⊕ [filler_9 ⊕ ×1 ⊕ Standard ⊕ Internal ⊕ 0 ⊕ IEC 60034]"
 * Real-part clauses are never touched (each pattern is anchored on a filler token).
 * Returns the scrubbed string (unchanged if it carried no filler text).
 */
function scrubFillerProse(input: string): string {
  if (typeof input !== 'string' || !/filler/i.test(input)) return input
  let s = input
  // (c) rad-syntax / grammar-trace bracket groups whose head is filler_N.
  //     Also remove a leading "⊕"/"+"/"," and the bracket together.
  s = s.replace(/\s*[⊕+,]?\s*\[\s*filler_[^[\]]*\]/gi, '')
  // (b) "An Internal Standard filler 11, certified to ... (additional: ...)."
  //     The clause runs to the first sentence-terminating period after the paren.
  s = s.replace(/\b[Aa]n?\s+Internal\s+Standard\s+filler\s*\d*\s*,\s*certified\s+to[^.]*?\([^)]*\)\s*\.?/gi, '')
  // (b-bare) "An Internal Standard filler 11" without the certified tail.
  s = s.replace(/\b[Aa]n?\s+Internal\s+Standard\s+filler\s*\d*\b\.?/gi, '')
  // (a) "..., and a Filler 11 (part Standard)." / "..., and a Filler 11."
  s = s.replace(/,?\s*and\s+an?\s+Filler(?:\s+word)?\s*\d*\s*(?:\([^)]*\))?\s*\.?/gi, '')
  // (a) standalone "A Filler 9 (part Standard). " / "A Filler 9."
  s = s.replace(/\b[Aa]n?\s+Filler(?:\s+word)?\s*\d*\s*(?:\([^)]*\))?\s*\.?/g, '')
  // Tidy artefacts left by clause removal.
  s = s
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;])/g, '$1')
    .replace(/,\s*\./g, '.')
    .replace(/,\s*and\s*\./gi, '.')
    .replace(/[⊕+]\s*$/g, '')
    .replace(/^\s*[⊕+,]\s*/g, '')
    .replace(/\s*[⊕+]\s*[⊕+]\s*/g, ' ⊕ ')
    .replace(/→\s*$/g, '')
    .trim()
  return s
}

function main() {
  const [, , inPath, outPath] = process.argv
  if (!inPath || !outPath) {
    console.error('usage: npx tsx scripts/strip-filler-words.tsx <in-state.json> <out-state.json>')
    process.exit(1)
  }

  const state: any = JSON.parse(fs.readFileSync(inPath, 'utf8'))

  // ── (1) Collect the filler word ids + remove the words from the tree ──────────
  const removedWordIds = new Set<string>()
  const removedLabels: string[] = []
  let removedPerSub: Array<{ module: string; sub: string; before: number; after: number; removed: number }> = []

  const mods: any[] = state?.moduleDecomposition?.modules ?? []
  for (const m of mods) {
    for (const sm of (m?.sub_modules ?? [])) {
      const words: any[] = Array.isArray(sm?.words) ? sm.words : []
      const before = words.length
      const kept: any[] = []
      for (const w of words) {
        if (wordIsFiller(w)) {
          if (w?.id) removedWordIds.add(String(w.id))
          removedLabels.push(String(w?.name_human ?? w?.content_character?.character_id ?? w?.id ?? '?'))
        } else {
          kept.push(w)
        }
      }
      if (kept.length !== before) {
        sm.words = kept
        removedPerSub.push({
          module: String(m?.module ?? ''),
          sub: String(sm?.id ?? ''),
          before,
          after: kept.length,
          removed: before - kept.length,
        })
      }
    }
  }

  // ── (2) Remove the filler partVerifications ──────────────────────────────────
  // Match by word_id (the authoritative key the renderer prices on) OR by a
  // word_name that resolves to a placeholder label (defensive — catches any PV
  // whose word_id was de-duped away in the tree but still carries a filler name).
  const pvBefore: any[] = Array.isArray(state?.partVerifications) ? state.partVerifications : []
  let pvRemoved = 0
  state.partVerifications = pvBefore.filter((v: any) => {
    const wid = String(v?.word_id ?? '')
    const isFillerPv =
      (wid && removedWordIds.has(wid)) ||
      isPlaceholderLabel(v?.word_name) ||
      /^(?:filler_\d+(?:_word)?|extra_word_\d+)$/i.test(wid)
    if (isFillerPv) pvRemoved++
    return !isFillerPv
  })

  // ── (3) Scrub placeholder clauses from sub-module prose ───────────────────────
  // Each sub-module's english_sentence / rad_syntax / topology_clause re-enumerate
  // every emitted word as prose — including the fillers ("A Filler 9 (part
  // Standard).", "An Internal Standard filler 11, certified to IEC 60034 ...",
  // "[filler_3 ⊕ ×1 ⊕ Standard ...]"). The renderer's "Sub-modules" detail block
  // prints these, so the filler text survives the word-tree strip unless the prose
  // is scrubbed too. scrubFillerProse() handles every observed clause form. We also
  // re-point the leading "<verb> N components" count to the surviving real count so
  // the prose total matches the BoM. Run on EVERY sub-module (a sentence can name a
  // sibling's filler even where no word was removed from that exact sub).
  let sentencesScrubbed = 0
  let radScrubbed = 0
  for (const m of mods) {
    // Module-level prose (module_brief / overview_paragraph_en / paragraph_* may
    // also enumerate fillers).
    for (const fk of ['module_brief', 'overview_paragraph_en', 'paragraph_en', 'paragraph_rad'] as const) {
      if (typeof m?.[fk] === 'string' && /filler/i.test(m[fk])) {
        const next = scrubFillerProse(m[fk])
        if (next !== m[fk]) { m[fk] = next; sentencesScrubbed++ }
      }
    }
    for (const sm of (m?.sub_modules ?? [])) {
      const realWordCount = Array.isArray(sm?.words) ? sm.words.length : 0
      // re-point "<verb> N components" → real count (applied to the prose field only).
      const repointCount = (s: string): string =>
        s.replace(/\b(reacts|absorbs|contains|comprises|includes|integrates|distributes|protects|packages|organises|organizes|supply|supplies|drives|drive|provides|delivers|moves|transfers|senses|controls|monitors)\s+\d+\s+components\b/gi,
          (_mm, verb) => `${verb} ${realWordCount} components`)

      if (typeof sm?.english_sentence === 'string' && /filler/i.test(sm.english_sentence)) {
        let s = scrubFillerProse(sm.english_sentence)
        s = repointCount(s)
        if (s !== sm.english_sentence) { sm.english_sentence = s; sentencesScrubbed++ }
      }
      if (typeof sm?.topology_clause === 'string' && /filler/i.test(sm.topology_clause)) {
        const t = scrubFillerProse(sm.topology_clause)
        if (t !== sm.topology_clause) { sm.topology_clause = t; sentencesScrubbed++ }
      }
      if (typeof sm?.rad_syntax === 'string' && /filler/i.test(sm.rad_syntax)) {
        const r = scrubFillerProse(sm.rad_syntax)
        if (r !== sm.rad_syntax) { sm.rad_syntax = r; radScrubbed++ }
      }
    }
  }

  // ── (3b) Scrub naturalLanguageLayer prose (cached module narratives) ──────────
  // The renderer reads naturalLanguageLayer.by_module[mid].paragraph_en +
  // sub_module_sentences[].{sentence_en, sentence_rad, paragraph_en} for the module
  // narrative body — a SEPARATE cached prose layer from moduleDecomposition. It
  // re-enumerates every emitted word, fillers included, so it must be scrubbed too.
  let nllFieldsScrubbed = 0
  const byModule = state?.naturalLanguageLayer?.by_module
  if (byModule && typeof byModule === 'object') {
    for (const mid of Object.keys(byModule)) {
      const blk: any = byModule[mid]
      if (!blk || typeof blk !== 'object') continue
      for (const fk of ['paragraph_en', 'paragraph_rad', 'grammar_trace'] as const) {
        if (typeof blk[fk] === 'string' && /filler/i.test(blk[fk])) {
          const next = scrubFillerProse(blk[fk])
          if (next !== blk[fk]) { blk[fk] = next; nllFieldsScrubbed++ }
        }
      }
      if (Array.isArray(blk.sub_module_sentences)) {
        for (const sent of blk.sub_module_sentences) {
          if (!sent || typeof sent !== 'object') continue
          for (const fk of ['sentence_en', 'sentence_rad', 'paragraph_en'] as const) {
            if (typeof sent[fk] === 'string' && /filler/i.test(sent[fk])) {
              const next = scrubFillerProse(sent[fk])
              if (next !== sent[fk]) { sent[fk] = next; nllFieldsScrubbed++ }
            }
          }
        }
      }
    }
  }

  // ── (3c) Drop cached costBasis so the renderer recomputes it filler-free ──────
  // The renderer does `state.costBasis ?? buildCostBasis(state)` (render-minimal-
  // pdf.tsx ~3546); buildCostBasis derives its lines + purchased/installed rollup
  // PURELY from state.partVerifications (build-cost-basis.ts:213), which is now
  // filler-free. Deleting the cached structure (which still carries 36 filler
  // lines + a filler-inflated rollup) forces a clean recompute — more reliable
  // than surgically editing the cached lines + re-deriving the rollup by hand.
  const hadCostBasis = state?.costBasis != null
  const costBasisFillerLines = Array.isArray(state?.costBasis?.lines)
    ? state.costBasis.lines.filter((l: any) => /filler/i.test(JSON.stringify(l))).length
    : 0
  if (hadCostBasis) delete state.costBasis

  // ── (4) Recompute cached cost totals from the cleaned word list ───────────────
  // computeBomTotals walks the now-filler-free tree + the now-filler-free
  // partVerifications, so its grandTotal already excludes filler cost. The
  // renderer derives costStack from THIS same number, so recomputing the cached
  // state.costStack / state.cost_reality the identical way keeps cached == rendered.
  const bom = computeBomTotals(state)
  const slugHint = String(state?.projectId || '').split('-')[0]?.toLowerCase() || undefined
  const beforeBom = state?.cost_reality?.bom_total_gbp
  const beforeRaw = state?.costStack?.raw_materials_bom_gbp

  if (bom && bom.grandTotal_gbp > 0) {
    const grand = bom.grandTotal_gbp
    const { ratios, class_key } = resolveCostStack(state, slugHint)
    const newStack = computeCostStack(grand, ratios, class_key)
    state.costStack = newStack
    if (state.cost_reality && typeof state.cost_reality === 'object') {
      state.cost_reality.bom_total_gbp = Math.round(grand)
      state.cost_reality.priced_lines = bom.actualPriced + bom.estimatePriced
      state.cost_reality.unpriced_lines = bom.tbdRows
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(state, null, 2))

  // ── Report ────────────────────────────────────────────────────────────────────
  console.log('=== strip-filler-words report ===')
  console.log(`words removed from tree:      ${removedWordIds.size} unique ids (${removedLabels.length} word slots)`)
  console.log(`partVerifications removed:    ${pvRemoved} (${pvBefore.length} → ${state.partVerifications.length})`)
  console.log(`english_sentence scrubbed:    ${sentencesScrubbed} sub-modules`)
  console.log(`rad_syntax scrubbed:          ${radScrubbed} sub-modules`)
  console.log(`naturalLanguageLayer scrubbed:${nllFieldsScrubbed} prose fields`)
  console.log(`costBasis dropped:            ${hadCostBasis ? `yes (had ${costBasisFillerLines} filler lines) → renderer recomputes via buildCostBasis` : 'no (absent)'}`)
  console.log('')
  console.log('per-sub-module word counts (module / sub : before → after, removed):')
  for (const r of removedPerSub) {
    console.log(`  ${r.module} / ${r.sub}: ${r.before} → ${r.after} (-${r.removed})`)
  }
  console.log('')
  console.log(`cost_reality.bom_total_gbp:   ${beforeBom} → ${state?.cost_reality?.bom_total_gbp}`)
  console.log(`costStack.raw_materials_bom:  ${beforeRaw} → ${state?.costStack?.raw_materials_bom_gbp}`)
  console.log(`costStack.installed_asp_gbp:  → ${state?.costStack?.installed_asp_gbp}`)
  console.log(`recomputed BoM grandTotal:    ${bom?.grandTotal_gbp}  priced_lines=${(bom?.actualPriced ?? 0) + (bom?.estimatePriced ?? 0)} tbd=${bom?.tbdRows}`)
  console.log('')
  console.log(`wrote: ${outPath}`)
}

main()
