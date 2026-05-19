/**
 * @file universal-repair.ts — Flash-Lite grounded repair, JSON-patch format.
 *
 * Reads a list of failed gate results (arithmetic + grammar) and asks
 * Gemini 3.1 Flash-Lite (thinking=high, Google-search grounded) to return a
 * structured JSON patch fixing the violations.
 *
 * Edit-policy guard rails:
 *   - patch MUST be a JSON array (max 8 entries)
 *   - each entry: { module, path, old_value, new_value, reason }
 *   - patches that would add/remove sub-modules are NOT allowed here — only
 *     value edits and grammar_link adjustments. (Adding sub-modules is a
 *     Phase-1 reviewer responsibility, not a Phase-2 repair.)
 *
 * Bail-out:
 *   - If repair LLM returns `{ unfixable: true, reason }`, surface to caller.
 *   - Max iterations enforced by caller (serial-design-chain-v2 uses 3).
 */
import type { ModuleSpec, CrossModuleGrammarLink } from '../types/module-decomposition'
import type { GateResult } from './universal-arithmetic-gates'
import { normaliseKind, normaliseModifierValue } from './universal-grammar-gates'

/**
 * In-place dedup of modifier_characters on a single word. Collapses entries
 * that have the same (normalised kind, normalised value) so the gate doesn't
 * fire on cosmetic-only duplicates (`600x800x250 mm` vs `600×800×250 mm`,
 * `IP65` vs `IP65 protection`).
 *
 * When two raw values collapse to the same normalised form, the SHORTER raw
 * value wins (more canonical). Genuine spec conflicts (`M20` vs `M20 × 1.5
 * mm cable`) produce different normalised forms, so both survive and the
 * gate continues to flag them for real reconciliation.
 *
 * Use both at applyPatches merge sites and once-up-front before Phase 2.
 */
export function dedupWordModifiers(word: any): { collapsed: number } {
  const mods = Array.isArray(word?.modifier_characters) ? word.modifier_characters : null
  if (!mods) return { collapsed: 0 }
  // Keep first-seen (kind,normValue); when a later one has a SHORTER raw value, swap in
  const seen = new Map<string, number>()  // key → index in survivors
  const survivors: any[] = []
  let collapsed = 0
  for (const mc of mods) {
    const k = normaliseKind(String(mc?.kind ?? ''))
    if (!k) { survivors.push(mc); continue }
    const norm = normaliseModifierValue(String(mc?.value ?? ''))
    const key = `${k}::${norm}`
    const existingIdx = seen.get(key)
    if (existingIdx == null) {
      seen.set(key, survivors.length)
      survivors.push(mc)
    } else {
      collapsed++
      const existing = survivors[existingIdx]
      const rawNew = String(mc?.value ?? '')
      const rawOld = String(existing?.value ?? '')
      // Prefer the shorter raw form (more canonical)
      if (rawNew.length > 0 && rawNew.length < rawOld.length) {
        survivors[existingIdx] = mc
      }
    }
  }
  if (collapsed > 0) word.modifier_characters = survivors
  return { collapsed }
}

/**
 * Walk every word in every sub-module of every module and dedup modifier
 * lists. Call before Phase 2 starts (after R4) so the modifier_consistency
 * gate sees pre-cleaned data and only fires on legitimate spec conflicts.
 */
export function dedupAllModifiers(modules: ModuleSpec[]): { components_cleaned: number; modifiers_collapsed: number } {
  let componentsCleaned = 0
  let modifiersCollapsed = 0
  // Defensive iteration: repair patches occasionally leave sub_modules / words in
  // a non-array state (object instead of array, or undefined). iter-60 BESS
  // crashed here when an LLM patch replaced a sub-module without its words array.
  // Treat any non-array as empty and skip; the gate run will flag the structural
  // damage separately.
  const safeModules = Array.isArray(modules) ? modules : []
  for (const m of safeModules) {
    const subs = Array.isArray((m as any)?.sub_modules) ? (m as any).sub_modules : []
    for (const sm of subs) {
      const words = Array.isArray(sm?.words) ? sm.words : []
      for (const w of words) {
        const r = dedupWordModifiers(w)
        if (r.collapsed > 0) { componentsCleaned++; modifiersCollapsed += r.collapsed }
      }
    }
  }
  return { components_cleaned: componentsCleaned, modifiers_collapsed: modifiersCollapsed }
}

const FLASH_LITE = 'google/gemini-3.1-flash-lite'

export interface RepairPatch {
  module: string
  path: string             // dot.path or grammar_links[index] or grammar_links[+] for add
  old_value?: unknown
  new_value?: unknown
  reason: string
}

export interface RepairResult {
  unfixable?: boolean
  reason?: string
  patches: RepairPatch[]
  raw?: string
}

const SYSTEM = `You are Gemini 3.1 Flash-Lite with Google Search grounding ON. Your job: repair specific gate failures by emitting a TARGETED JSON patch.

You will receive:
  - The current design (moduleDecomposition.modules + cross_module_grammar_links)
  - A list of failed gates, each with: name, reason, affected modules

GRAMMAR_LINK FIELD FORMATS (CRITICAL — common source of repair regressions):

  An INTRA-module grammar_link connects two sub-modules WITHIN THE SAME module:
    { "from_sub_module": "<bare sub_module id>", "to_sub_module": "<bare sub_module id>", "mechanism": "...", "type": "directional" | "mutual", "detail": "..." }
    Both ids are BARE — just the sub_module id. NEVER use "module::sub_module" format.
    Only valid when BOTH sub-modules exist in the SAME module's sub_modules[] array.

  A CROSS-module grammar_link goes between MODULES (declared in cross_module_grammar_links at the top level):
    { "from_module": "<module id>", "to_module": "<module id>", "mechanism": "...", "type": "...", "detail": "..." }
    Both endpoints are MODULE ids (one of the 12 universal modules).
    Use this when the relationship spans modules — e.g. a sensor in sensing_instrumentation connecting to a controller in control_compute_communication.

If you find yourself wanting to write { "from_sub_module": "X", "to_sub_module": "control_compute_communication::ems_controller" } STOP — that's a cross-module connection. Use a cross_module_grammar_link instead, OR use the bare sub_module id IF it actually exists in the same module.

CROSS-MODULE CROSS-LINK PATCH SHAPE:
  { "module": "cross_module_grammar_links", "path": "[+]", "new_value": { "from_module": "...", "to_module": "...", "mechanism": "...", "type": "...", "detail": "..." }, "reason": "..." }

INTRA-MODULE LINK PATCH SHAPE:
  { "module": "<module id>", "path": "grammar_links[+]", "new_value": { "from_sub_module": "<bare id>", "to_sub_module": "<bare id>", "mechanism": "...", "type": "...", "detail": "..." }, "reason": "..." }

For each failure, identify the MINIMAL edit that resolves it. Common patterns:

ARITHMETIC FAILURE — edit ONE number to make math close. Use Google grounding to anchor real-world spec values.

GRAMMAR — orphan sub-module — add a grammar_link from it to a sensible peer. Determine first whether peer is intra-module (use intra grammar_link) or cross-module (use cross_module_grammar_link).

GRAMMAR — dangling reference — change the referenced id to one that exists. Check whether the intended target is in the same module (intra link) or a different module (cross link). Most "X::Y" style references are bugs and should be converted to proper cross_module_grammar_links.

GRAMMAR — heat-source without thermal_path — add a grammar_link with mechanism="thermal_path" or "cooling" from the heat source to a cooling sub-module. If the cooling sub-module is in a DIFFERENT module (most commonly environmental_interface or mass_fluid_transport_process), use a cross_module_grammar_link.

OUTPUT FORMAT (JSON only, no preamble, no markdown fences):
{
  "patches": [
    {
      "module": "<module id> OR 'cross_module_grammar_links'",
      "path": "<dotpath OR grammar_links[N] OR grammar_links[+] OR [+]>",
      "new_value": <new value>,
      "reason": "<one-line why>"
    }
  ]
}

BULK FIXES for density failures (the failure class with many affected words):

For \`word_modifier_richness\` failures (many words need 5+ modifiers each), prefer the BULK pattern: emit one patch per WORD that adds many modifiers at once via the chain's merge logic. Use this exact shape:

  {
    "module": "<module_id>",
    "path": "sub_modules[<sub_module index>].words[+]",
    "new_value": {
      "id": "<the EXACT existing word.id>",
      "modifier_characters": [
        { "kind": "manufacturer", "value": "..." },
        { "kind": "part_number", "value": "..." },
        { "kind": "material", "value": "..." },
        { "kind": "dimensions", "value": "..." },
        { "kind": "regulatory", "value": "..." },
        { "kind": "lead_time", "value": "..." }
      ]
    },
    "reason": "merge 6 modifiers into existing word"
  }

The chain's applyReviewerPatches sees an add_word_to_sub_module-like patch with the SAME id → merges new modifier_characters into the existing word (skipping kind+value dupes). One patch enriches one word with 5-10 modifiers in a single move.

For \`sub_module_word_density\` failures (sub-modules with <5 words), emit add_word_to_sub_module patches with NEW words and full modifier sets.

If you genuinely cannot fix all failures within 30 patches, return:
{ "unfixable": true, "reason": "...", "patches": [] }

Cap: 30 patches maximum. Cap: total response <60 KB. Output ONLY JSON.`

export async function repair(opts: {
  modules: ModuleSpec[]
  crossLinks: CrossModuleGrammarLink[]
  failedGates: Array<GateResult & { name: string }>
  apiKey: string
  timeoutMs?: number
  extraContext?: string
}): Promise<RepairResult> {
  const userContent = `CURRENT DESIGN:
${JSON.stringify({ modules: opts.modules, cross_module_grammar_links: opts.crossLinks }, null, 2)}

FAILED GATES (must all be resolved):
${opts.failedGates.map(g => `  [${g.name}] affected=${g.affected.join(',') || '-'} | ${g.reasons.join(' | ')}`).join('\n')}
${opts.extraContext ? '\n' + opts.extraContext + '\n' : ''}
Return the JSON patch. Emit as many patches as needed (up to 30) — DO NOT stop at 5-8; the failure list above shows the FULL set of items to fix, not just examples.`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 600_000)
  let response: Response
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: FLASH_LITE,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userContent },
        ],
        temperature: 0,
        max_tokens: 30_000,
        thinking_level: 'high',
        google_search_grounding: { enabled: true },
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) {
    throw new Error(`OpenRouter ${response.status} during repair`)
  }
  const json = await response.json() as any
  const raw = (json.choices?.[0]?.message?.content ?? '').trim()
  return parseRepairResponse(raw)
}

function parseRepairResponse(raw: string): RepairResult {
  let s = raw.trim()
  s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
  let parsed: any
  try { parsed = JSON.parse(s) } catch {
    const first = s.indexOf('{')
    const last = s.lastIndexOf('}')
    if (first !== -1 && last > first) {
      try { parsed = JSON.parse(s.slice(first, last + 1)) } catch {
        return { patches: [], unfixable: true, reason: 'parse failure', raw }
      }
    } else {
      return { patches: [], unfixable: true, reason: 'no JSON found', raw }
    }
  }
  if (parsed.unfixable) {
    return { unfixable: true, reason: parsed.reason ?? '?', patches: [], raw }
  }
  const patches = Array.isArray(parsed.patches) ? parsed.patches.slice(0, 30) : []
  return { patches, raw }
}

/**
 * Apply a patch array to the modules array in-place.
 *
 * Supports paths like:
 *   derived_parameters.cell_count                 (dotted-key)
 *   sub_modules[3].grammar_links[+]              (array index + append)
 *   sub_modules[3].grammar_links[1].mechanism    (nested array indexes)
 *   sub_modules[+]                                (append sub_module)
 *   grammar_links[+]                             (top-level module append)
 *
 * Returns delta + reasons + state_changed (compares stringified snapshot).
 * Iter-17 bug: the previous impl counted patches as "applied" that hadn't
 * actually persisted, because array-index paths weren't parsed.
 */

function pathTokens(path: string): Array<{ key: string; isAppend: boolean; isIndex: boolean }> {
  const out: Array<{ key: string; isAppend: boolean; isIndex: boolean }> = []
  const re = /([a-zA-Z0-9_]+)|\[(\+|\d+)\]/g
  let match
  while ((match = re.exec(path)) !== null) {
    if (match[1] !== undefined) {
      out.push({ key: match[1], isAppend: false, isIndex: false })
    } else if (match[2] === '+') {
      out.push({ key: '+', isAppend: true, isIndex: false })
    } else {
      out.push({ key: match[2], isAppend: false, isIndex: true })
    }
  }
  return out
}

function shortHash(obj: unknown): string {
  // 16-char hash of the stringified shape. Not crypto-strong, just for diff detection.
  const s = JSON.stringify(obj)
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return `${s.length}:${h.toString(16)}`
}

function validateNoDanglingLink(modules: ModuleSpec[], patch: RepairPatch): string | null {
  // If this patch ADDS a grammar_link / cross_module_grammar_link, check
  // that its endpoints reference real sub-modules / modules. Returns
  // null if OK, or a "skip reason" string if dangling.
  const v = patch.new_value as any
  if (!v || typeof v !== 'object') return null
  // Intra-module grammar_link
  if (patch.module !== 'cross_module_grammar_links' && patch.path.includes('grammar_links') && (v.from_sub_module || v.to_sub_module)) {
    const m = modules.find(x => x.module === patch.module)
    if (!m) return `module ${patch.module} not found`
    const ids = new Set((m.sub_modules ?? []).map(s => s.id))
    if (v.from_sub_module && !ids.has(v.from_sub_module)) return `dangling from_sub_module="${v.from_sub_module}" not in ${patch.module}`
    if (v.to_sub_module && !ids.has(v.to_sub_module)) return `dangling to_sub_module="${v.to_sub_module}" not in ${patch.module}`
  }
  // Cross-module link
  if (patch.module === 'cross_module_grammar_links' && (v.from_module || v.to_module)) {
    const mods = new Set(modules.map(m => m.module))
    if (v.from_module && !mods.has(v.from_module)) return `dangling from_module="${v.from_module}"`
    if (v.to_module && !mods.has(v.to_module)) return `dangling to_module="${v.to_module}"`
  }
  return null
}

export function applyPatches(modules: ModuleSpec[], crossLinks: CrossModuleGrammarLink[], patches: RepairPatch[]): {
  applied: number
  skipped: number
  reasons: string[]
  hash_before: string
  hash_after: string
  state_changed: boolean
} {
  const hashBefore = shortHash({ modules, crossLinks })
  let applied = 0
  let skipped = 0
  const reasons: string[] = []

  for (const p of patches) {
    // Validate against dangling links BEFORE applying — iter-22 bug: repair
    // LLM kept "fixing" dangling refs by adding more links to non-existent
    // sub-modules, creating infinite cycle.
    const danglingReason = validateNoDanglingLink(modules, p)
    if (danglingReason) {
      skipped++
      reasons.push(`skip ${p.module}.${p.path}: ${danglingReason} (${p.reason})`)
      continue
    }
    let scope: any
    let pathForWalk = p.path
    if (p.module === 'cross_module_grammar_links') {
      scope = { wrapper: crossLinks }
      pathForWalk = `wrapper.${p.path}`
    } else {
      const m = modules.find(x => x.module === p.module)
      if (!m) { skipped++; reasons.push(`skip module-not-found: ${p.module}.${p.path}`); continue }
      scope = m
    }

    const tokens = pathTokens(pathForWalk)
    if (tokens.length === 0) { skipped++; reasons.push(`skip empty-path: ${p.module}.${p.path}`); continue }

    let cursor: any = scope
    let ok = true
    for (let i = 0; i < tokens.length - 1; i++) {
      const t = tokens[i]
      if (t.isAppend) { ok = false; reasons.push(`skip mid-append: ${p.module}.${p.path}`); break }
      if (t.isIndex) {
        const idx = parseInt(t.key, 10)
        if (!Array.isArray(cursor) || idx >= cursor.length) { ok = false; reasons.push(`skip out-of-range [${idx}]: ${p.module}.${p.path}`); break }
        cursor = cursor[idx]
      } else {
        if (cursor[t.key] === undefined) cursor[t.key] = {}
        cursor = cursor[t.key]
      }
    }
    if (!ok) { skipped++; continue }

    const last = tokens[tokens.length - 1]
    if (last.isAppend) {
      if (!Array.isArray(cursor)) { skipped++; reasons.push(`skip append-to-non-array: ${p.module}.${p.path}`); continue }
      // WORD ENRICHMENT MERGE: if appending to a `words` array and the new_value's id
      // matches an existing word, MERGE the new modifier_characters into the existing
      // word instead of duplicating. Mirrors `applyReviewerPatches` Phase 1 behaviour.
      // Without this, repair LLM patches like `sub_modules[N].words[+]` with the same
      // word.id create duplicate words and never push the original past the 5-modifier
      // gate threshold (iter-34 heat pump plateau bug).
      const newVal: any = p.new_value
      const isWordEnrichment = p.path.includes('.words[+]') && newVal && typeof newVal === 'object' && newVal.id
      if (isWordEnrichment) {
        const existing = (cursor as any[]).find((w: any) => w && w.id === newVal.id)
        if (existing) {
          // Merge modifier_characters using NORMALISED (kind,value) dedup so
          // cosmetic dupes (× vs x, "IP65" vs "IP65 protection") collapse at
          // write time. Run dedupWordModifiers at the end to clean any
          // pre-existing dupes on the existing word too.
          const existingMods: any[] = Array.isArray(existing.modifier_characters) ? existing.modifier_characters : (existing.modifier_characters = [])
          const seen = new Set(existingMods.map((mc: any) => `${normaliseKind(String(mc?.kind ?? ''))}::${normaliseModifierValue(String(mc?.value ?? ''))}`))
          let added = 0
          for (const mc of (newVal.modifier_characters ?? [])) {
            const key = `${normaliseKind(String(mc?.kind ?? ''))}::${normaliseModifierValue(String(mc?.value ?? ''))}`
            if (!seen.has(key)) { existingMods.push(mc); seen.add(key); added++ }
          }
          const { collapsed } = dedupWordModifiers(existing)
          applied++
          reasons.push(`~merge-into-existing-word ${p.module}.${p.path} (+${added} modifiers, ${collapsed} cosmetic dupes collapsed; ${p.reason})`)
          continue
        }
      }
      // Cross-module link validation (2026-05-19 fix): reject undefined or
      // malformed appends to cross_module_grammar_links. The Phase 2 repair LLM
      // sometimes emits patches with only `op` + `reason`, no `link` payload.
      // Before this guard, that pushed `undefined` into the crossLinks array
      // and crashed downstream gates reading `.from_module` of undefined.
      if (p.module === 'cross_module_grammar_links') {
        const link: any = p.new_value
        if (link == null || typeof link !== 'object') {
          skipped++
          reasons.push(`skip cross_link append: new_value is ${link} (need object with from_module/to_module/mechanism)`)
          continue
        }
        if (!link.from_module || !link.to_module || !link.mechanism) {
          skipped++
          reasons.push(`skip cross_link append: missing required fields (from=${link.from_module} to=${link.to_module} mech=${link.mechanism})`)
          continue
        }
      }
      ;(cursor as any[]).push(p.new_value)
      applied++
      reasons.push(`+${p.module}.${p.path} (${p.reason})`)
    } else if (last.isIndex) {
      const idx = parseInt(last.key, 10)
      if (!Array.isArray(cursor) || idx >= cursor.length) { skipped++; reasons.push(`skip set-idx-out-of-range: ${p.module}.${p.path}`); continue }
      if (p.new_value === null || p.new_value === undefined) {
        cursor.splice(idx, 1)
        reasons.push(`-${p.module}.${p.path} (${p.reason})`)
      } else {
        // Sub-module / word merge-on-replace (iter-60 BESS bug 2026-05-16):
        // a repair patch with path "sub_modules[N]" or "sub_modules[N].words[M]"
        // and new_value that's a partial object (only english_sentence / only
        // paragraph_en) wipes the existing object's other fields — losing
        // words[], grammar_links[], modifier_characters[] etc. and crashing
        // downstream gates that expect arrays. When the new_value is a partial
        // object AND the existing slot is also an object, MERGE rather than
        // REPLACE: existing fields preserved, new fields override.
        const SECOND_LAST = tokens[tokens.length - 2]
        const parentIsContainer = SECOND_LAST && (SECOND_LAST.key === 'sub_modules' || SECOND_LAST.key === 'words' || SECOND_LAST.key === 'modules')
        const existingItem = cursor[idx]
        const newIsObject = p.new_value && typeof p.new_value === 'object' && !Array.isArray(p.new_value)
        const existingIsObject = existingItem && typeof existingItem === 'object' && !Array.isArray(existingItem)
        if (parentIsContainer && newIsObject && existingIsObject) {
          // Merge: preserve existing keys absent from new_value
          const merged: any = { ...existingItem, ...(p.new_value as any) }
          // Critical: never let a merge ZERO an array field that was previously populated.
          // If the merged result has a non-array where the existing had an array, restore.
          for (const arrKey of ['words', 'grammar_links', 'modifier_characters', 'sub_modules']) {
            const wasArr = Array.isArray(existingItem[arrKey])
            const nowArr = Array.isArray(merged[arrKey])
            if (wasArr && !nowArr) merged[arrKey] = existingItem[arrKey]
          }
          cursor[idx] = merged
          reasons.push(`~merge-into-existing ${p.module}.${p.path} (${p.reason})`)
        } else {
          cursor[idx] = p.new_value
          reasons.push(`~${p.module}.${p.path} (${p.reason})`)
        }
      }
      applied++
    } else {
      // Defensive: when the patch writes to a known array-shaped field
      // (modifier_characters, words, grammar_links, sub_modules), the repair
      // LLM occasionally emits a single object where an array is required.
      // Coerce to array to prevent downstream gates from crashing on .find().
      const ARRAY_KEYS = new Set(['modifier_characters', 'words', 'grammar_links', 'sub_modules', 'cross_module_grammar_links'])
      let value = p.new_value
      if (ARRAY_KEYS.has(last.key) && value !== null && !Array.isArray(value)) {
        value = [value]
        reasons.push(`coerce ${p.module}.${p.path} to array (LLM emitted ${typeof value})`)
      }
      cursor[last.key] = value
      applied++
      reasons.push(`=${p.module}.${p.path} (${p.reason})`)
    }
  }

  // Final pass: walk every word's modifier_characters and collapse
  // cosmetic-only dupes. Catches patch paths that don't go through the
  // word-enrichment merge branch (raw set/append on modifier_characters arrays).
  const dedup = dedupAllModifiers(modules)
  if (dedup.modifiers_collapsed > 0) {
    reasons.push(`dedup pass: collapsed ${dedup.modifiers_collapsed} cosmetic-dupe modifier(s) across ${dedup.components_cleaned} component(s)`)
  }

  const hashAfter = shortHash({ modules, crossLinks })
  return {
    applied,
    skipped,
    reasons,
    hash_before: hashBefore,
    hash_after: hashAfter,
    state_changed: hashBefore !== hashAfter,
  }
}
