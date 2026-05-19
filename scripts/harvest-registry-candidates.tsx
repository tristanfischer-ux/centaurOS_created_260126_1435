#!/usr/bin/env npx tsx
/**
 * scripts/harvest-registry-candidates.tsx
 *
 * OFFLINE registry-admission harvester (Phase C alternative — coding council
 * 5/5 REVERT verdict 2026-05-15). Reads accepted Phase A state.json files,
 * extracts every WordSpec, strips common LLM-coinage prefixes/suffixes,
 * deduplicates by normalised key, cross-references against the existing
 * character_registry, and outputs:
 *
 *   <out>.json  — { existing_matches[], canonical_candidates[], stats }
 *
 * Tristan curates the canonical_candidates list and admits chosen entries
 * to the registry via the existing seed-character-registry.ts pipeline.
 *
 * Why this exists (vs the reverted in-prompt approach): LLMs emit
 * context-specific names (main_dc_contactor_word) rather than canonical
 * generic ones (dc_contactor). Letting the pipeline auto-admit those creates
 * registry pollution (Gemini 3.1 Pro: "garbage dump"). Instead, harvest
 * candidates offline, normalise, dedupe, and require human approval before
 * admission. Re-enable a clean Phase C pipeline integration once the registry
 * has 200-300 canonical-named entries.
 *
 * Usage:
 *   npx tsx scripts/harvest-registry-candidates.tsx \
 *     --states "/Users/.../iter-45-phaseA-bess/container/state.json,..." \
 *     [--product-class energy_storage] \
 *     [--out candidates.json] \
 *     [--registry-confidence 0.7]
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { getRegistryByProductClass, type CharacterRegistryRow } from '../src/lib/pdf-engine-v2/lib/character-registry'

// ─── Normalisation rules ────────────────────────────────────────────────────
//
// LLM-emitted IDs carry positional/instance prefixes (main_, primary_, aux_,
// upper_, lower_), structural suffixes (_word, _unit, _system, _assembly),
// and module-context noise. Strip them to expose the canonical kernel.

const PREFIX_STRIP = [
  'main_', 'primary_', 'secondary_', 'auxiliary_', 'aux_', 'backup_',
  'upper_', 'lower_', 'left_', 'right_', 'top_', 'bottom_', 'front_', 'rear_',
  'inner_', 'outer_', 'forward_', 'reverse_',
  'high_voltage_', 'low_voltage_', 'hv_', 'lv_', 'mv_',
] as const

const SUFFIX_STRIP = [
  '_word', '_unit', '_assembly', '_subassembly', '_module', '_set', '_kit',
  '_array', '_bank', '_string', '_stack', '_pack',
] as const

function normaliseId(rawId: string): string {
  let s = String(rawId ?? '').toLowerCase().trim()
  if (!s) return ''
  // Repeated strip in case the LLM stacked prefixes (e.g. "main_primary_x")
  let changed = true
  while (changed) {
    changed = false
    for (const p of PREFIX_STRIP) {
      if (s.startsWith(p)) { s = s.slice(p.length); changed = true; break }
    }
  }
  changed = true
  while (changed) {
    changed = false
    for (const sfx of SUFFIX_STRIP) {
      if (s.endsWith(sfx)) { s = s.slice(0, -sfx.length); changed = true; break }
    }
  }
  // Collapse repeated underscores
  s = s.replace(/__+/g, '_').replace(/^_+|_+$/g, '')
  return s
}

// ─── Candidate harvest ──────────────────────────────────────────────────────

interface HarvestedWord {
  raw_id: string
  normalised_id: string
  name_human: string
  manufacturer?: string
  part_number?: string
  material?: string
  rating?: string
  source_state: string
  source_module: string
  source_sub_module: string
}

interface CandidateGroup {
  normalised_id: string
  raw_id_variants: string[]
  name_human_variants: string[]
  manufacturer?: string
  part_number_hints: string[]
  occurrence_count: number
  product_classes: Set<string>
  registry_match?: { character_id: string; source_grade: string; confidence_score: number | null }
}

function pickMod(mods: any[], kinds: string[]): string | undefined {
  for (const k of kinds) {
    const found = (mods ?? []).find(m => m?.kind === k)
    if (found && typeof found.value === 'string' && found.value.trim()) return found.value.trim()
  }
  return undefined
}

function harvestStateFile(statePath: string): HarvestedWord[] {
  const raw = readFileSync(statePath, 'utf-8')
  const state = JSON.parse(raw)
  const out: HarvestedWord[] = []
  for (const m of (state.moduleDecomposition?.modules ?? [])) {
    for (const sm of (m.sub_modules ?? [])) {
      for (const w of (sm.words ?? [])) {
        const id: string = w.id ?? w.content_character?.character_id ?? ''
        if (!id) continue
        out.push({
          raw_id: id,
          normalised_id: normaliseId(id),
          name_human: w.name_human ?? w.content_character?.name_human ?? id,
          manufacturer: pickMod(w.modifier_characters, ['manufacturer']),
          part_number: pickMod(w.modifier_characters, ['part_number']),
          material: pickMod(w.modifier_characters, ['material']),
          rating: pickMod(w.modifier_characters, ['rating_primary', 'rating']),
          source_state: statePath,
          source_module: m.module,
          source_sub_module: sm.id,
        })
      }
    }
  }
  return out
}

function groupCandidates(words: HarvestedWord[]): Map<string, CandidateGroup> {
  const groups = new Map<string, CandidateGroup>()
  for (const w of words) {
    if (!w.normalised_id) continue
    const key = w.normalised_id
    const existing = groups.get(key) ?? {
      normalised_id: key,
      raw_id_variants: [],
      name_human_variants: [],
      part_number_hints: [],
      occurrence_count: 0,
      product_classes: new Set<string>(),
    } as CandidateGroup
    if (!existing.raw_id_variants.includes(w.raw_id)) existing.raw_id_variants.push(w.raw_id)
    if (w.name_human && !existing.name_human_variants.includes(w.name_human)) existing.name_human_variants.push(w.name_human)
    if (w.part_number && !existing.part_number_hints.includes(w.part_number)) existing.part_number_hints.push(w.part_number)
    if (w.manufacturer && !existing.manufacturer) existing.manufacturer = w.manufacturer
    existing.occurrence_count += 1
    groups.set(key, existing)
  }
  return groups
}

// ─── Registry cross-reference ───────────────────────────────────────────────

function matchAgainstRegistry(
  groups: Map<string, CandidateGroup>,
  registry: CharacterRegistryRow[],
  minConfidence: number,
): { matched: CandidateGroup[]; unmatched: CandidateGroup[] } {
  const matched: CandidateGroup[] = []
  const unmatched: CandidateGroup[] = []
  const regByNormalised = new Map<string, CharacterRegistryRow>()
  for (const r of registry) regByNormalised.set(normaliseId(r.character_id), r)
  for (const [, g] of groups) {
    const hit = regByNormalised.get(g.normalised_id)
    if (hit && (hit.confidence_score == null || hit.confidence_score >= minConfidence)) {
      g.registry_match = { character_id: hit.character_id, source_grade: hit.source_grade, confidence_score: hit.confidence_score }
      matched.push(g)
    } else {
      unmatched.push(g)
    }
  }
  return { matched, unmatched }
}

// ─── Main ───────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { states: string[]; productClass: string; outPath: string; minConfidence: number } {
  let states: string[] = []
  let productClass = 'energy_storage'
  let outPath = resolve(process.cwd(), 'candidates.json')
  let minConfidence = 0.7
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--states') { states = (argv[++i] ?? '').split(',').map(s => s.trim()).filter(Boolean) }
    else if (a === '--product-class') { productClass = argv[++i] ?? productClass }
    else if (a === '--out') { outPath = resolve(argv[++i] ?? outPath) }
    else if (a === '--registry-confidence') { minConfidence = Number(argv[++i] ?? minConfidence) }
  }
  return { states, productClass, outPath, minConfidence }
}

async function main() {
  const { states, productClass, outPath, minConfidence } = parseArgs(process.argv.slice(2))
  if (states.length === 0) {
    console.error('Usage: harvest-registry-candidates.tsx --states <state.json,...> [--product-class X] [--out candidates.json]')
    process.exit(1)
  }

  console.error(`[harvest] reading ${states.length} state file${states.length === 1 ? '' : 's'}, product_class=${productClass}`)
  const allWords: HarvestedWord[] = []
  for (const p of states) {
    try {
      const words = harvestStateFile(p)
      allWords.push(...words)
      console.error(`  ${p}: ${words.length} words`)
    } catch (err) {
      console.error(`  ${p}: SKIPPED (${(err as Error).message})`)
    }
  }
  console.error(`[harvest] ${allWords.length} words total across ${states.length} states`)

  const groups = groupCandidates(allWords)
  console.error(`[harvest] ${groups.size} distinct normalised IDs`)

  console.error(`[harvest] querying character_registry for product_class=${productClass} ...`)
  const registry = await getRegistryByProductClass(productClass, 500)
  console.error(`[harvest] registry has ${registry.length} entries for ${productClass}`)

  const { matched, unmatched } = matchAgainstRegistry(groups, registry, minConfidence)
  console.error(`[harvest] matched against registry: ${matched.length} / ${groups.size}`)
  console.error(`[harvest] CANDIDATE for admission (unmatched): ${unmatched.length}`)

  // Sort candidates by occurrence count (descending) so curator sees most-reused first
  unmatched.sort((a, b) => b.occurrence_count - a.occurrence_count)

  const report = {
    product_class: productClass,
    generated_at: new Date().toISOString(),
    sources: states,
    registry_size_for_class: registry.length,
    stats: {
      total_words: allWords.length,
      distinct_normalised_ids: groups.size,
      existing_matches: matched.length,
      admission_candidates: unmatched.length,
    },
    existing_matches: matched.map(g => ({
      normalised_id: g.normalised_id,
      registry_id: g.registry_match?.character_id,
      registry_grade: g.registry_match?.source_grade,
      occurrences: g.occurrence_count,
      raw_id_variants: g.raw_id_variants,
    })),
    admission_candidates: unmatched.map(g => ({
      normalised_id: g.normalised_id,
      occurrences: g.occurrence_count,
      manufacturer: g.manufacturer ?? null,
      part_number_hints: g.part_number_hints,
      name_human_variants: g.name_human_variants,
      raw_id_variants: g.raw_id_variants,
    })),
  }

  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.error(`\n[harvest] candidates report written to: ${outPath}`)
  console.error(`[harvest] NEXT: curate admission_candidates manually; admit chosen entries via scripts/seed-character-registry.ts`)
}

main().catch(err => { console.error('[harvest] FATAL:', err); process.exit(1) })
