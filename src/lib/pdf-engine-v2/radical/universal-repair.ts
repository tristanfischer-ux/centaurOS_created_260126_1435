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
import type { VerifiedPartsAllowlist } from './allowlist-builder'
import { allowlistContainsMpn, renderAllowlistForPrompt } from './allowlist-builder'

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

// ---------------------------------------------------------------------------
// Jurisdiction-aware guardrail builder
// ---------------------------------------------------------------------------
// Infers the brief's jurisdiction from parsedBrief fields (same priority order
// as scripts/lib/jurisdictional-standards-audit.ts::inferJurisdiction).
function inferJurisdictionFromBrief(parsedBrief: any): string {
  if (!parsedBrief) return 'UNKNOWN'
  const country = (parsedBrief.country ?? '').toString().trim().toUpperCase()
  if (/\b(UK|UNITED KINGDOM|GB|GREAT BRITAIN|ENGLAND|SCOTLAND|WALES)\b/.test(country)) return 'UK'
  if (/\b(US|USA|UNITED STATES|AMERICA)\b/.test(country)) return 'US'
  if (/\b(EU|EUROPE|EUROPEAN UNION)\b/.test(country)) return 'EU'
  if (/\b(CA|CANADA|CANADIAN)\b/.test(country)) return 'CA'
  const region = (
    parsedBrief?.constraints?.target_market_region
    ?? parsedBrief?.target_market_region
    ?? ''
  ).toString().trim().toUpperCase()
  if (/\b(UK|UNITED KINGDOM|GB|GREAT BRITAIN)\b/.test(region)) return 'UK'
  if (/\b(US|USA|UNITED STATES)\b/.test(region)) return 'US'
  if (/\b(EU|EUROPE|EUROPEAN UNION)\b/.test(region)) return 'EU'
  if (/\b(CA|CANADA)\b/.test(region)) return 'CA'
  const customers = (parsedBrief?.target_customers ?? '').toString()
  if (/\b(UK|British|United Kingdom|GB|grid.?scale UK|UK grid|BESS UK)\b/i.test(customers)) return 'UK'
  if (/\b(US|United States|American|US grid|utility US)\b/i.test(customers)) return 'US'
  if (/\b(EU|European|Europe)\b/i.test(customers)) return 'EU'
  if (/\b(Canada|Canadian)\b/i.test(customers)) return 'CA'
  return 'UNKNOWN'
}

function buildJurisdictionGuardrail(parsedBrief: any): string {
  const jurisdiction = inferJurisdictionFromBrief(parsedBrief)

  const byJurisdiction: Record<string, string> = {
    UK: `JURISDICTION CONSTRAINT: The brief's target market is UK.
You MUST NOT emit any modifier_characters[kind=regulatory] or prose containing standards from non-accepted families.
For UK briefs:
  Accepted families: BS, BS EN, CENELEC, DIN, DNV, EN, ENA, ETSI, G99, IEC, IEEE, IPC, ISO, NFPA.
  Banned families: UL (except UL 9540A, UL 9540, NFPA 855, NFPA 68, NFPA 70E, UL 94), NEC, ASTM, ANSI, FCC, CSA.
  If you need to cite a standard for a UK brief, use the IEC/BS/EN equivalent. Examples:
    UL 489 → IEC 60947-2 | UL 1973 → IEC 62619 | UL 467 → BS 7430 | NEC 706.10 → IEC 62933-5-2 §6.4
    UL 248 → IEC 60269 | UL 1577 → IEC 60044-1 | ASTM A312 → BS EN 10216-5`,
    US: `JURISDICTION CONSTRAINT: The brief's target market is US.
You MUST NOT emit standards from EU-only or UK-only families (BS, G99, ENA) unless explicitly appropriate.
For US briefs, preferred families: NEC, UL, NFPA, ANSI, IEEE, ISO, IEC, ASTM, ASME, FCC, IPC, DNV.`,
    EU: `JURISDICTION CONSTRAINT: The brief's target market is EU.
You MUST NOT emit standards from US-only families (NEC, UL, ANSI, ASTM, FCC, CSA) or UK-specific (G99, ENA).
For EU briefs, preferred families: EN, IEC, ISO, CENELEC, ETSI, DIN, VDE, IPC, DNV, NFPA, IEEE.`,
    CA: `JURISDICTION CONSTRAINT: The brief's target market is Canada.
For CA briefs, preferred families: CSA, NEC, UL, NFPA, ANSI, IEEE, ISO, IEC, IPC, DNV.`,
    UNKNOWN: `JURISDICTION CONSTRAINT: Brief jurisdiction unknown.
Use IEC/ISO standards as the default where possible. Avoid jurisdiction-specific families (UL, NEC, BS, G99, CSA) unless the design context clearly mandates them.`,
  }

  const base = byJurisdiction[jurisdiction] ?? byJurisdiction['UNKNOWN']

  return `
${base}

INCOMPATIBLE COMBINATIONS — NEVER EMIT THESE REGARDLESS OF JURISDICTION:
- ECARO-25 + Novec 1230: ECARO-25 is FE-25 (HFC-125) hardware — it is INCOMPATIBLE with Novec 1230 clean agent. For Novec 1230 systems use Kidde ECS (or equivalent Novec-certified hardware). Do not emit ECARO-25 in any design that references Novec 1230.
- Sungrow SC1000UD-MV: never claim >1500 V DC input or >1100 kW peak — the datasheet caps are 1500 V / 1100 kW. If the design needs more power, emit multiple units.
- nVent ERIFLEX EBS-500: this part number does not exist. For grounding braids in the nVent ERIFLEX family use MBJ50-300-10 (or another real MBJ-series part). Do not emit EBS-500 under any circumstances.

If you are tempted to emit a regulatory citation or brand-product combination you are not certain about, OMIT IT rather than hallucinate. An absent citation is always safer than a fabricated one.
`
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

ARCHITECTURAL CONSTRAINT (2026-05-26 — do not violate):
You may NOT add new BoM words with part numbers (part_number modifier) — those must come from the deterministic-emitter. The chain HARD REJECTS any patch adding a new word_id with a part_number modifier (exit path via applyPatches allowlist guard). You may only modify existing words' modifiers and add prose-only words (description / commentary / english_sentence updates). When a sub_module is missing BoM coverage, that is an emitter gap to be fixed in deterministic-emitter.ts, not a Phase 2 repair task.

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
  /** parsedBrief from the chain — used to build the jurisdiction guardrail.
   *  Optional for backwards-compatibility; when absent falls back to UNKNOWN. */
  parsedBrief?: any
  /**
   * Verified-parts allowlist built at chain start from KNOWN_PART_AUTHORITATIVE
   * + Stage 17.6 RAG candidates + deterministic-emitter emissions.
   *
   * When provided, the allowlist summary is injected into the system prompt so
   * the repair LLM knows which MPNs are approved. The HARD REJECTION happens
   * in applyPatches — this injection is the soft signal; applyPatches is the
   * hard gate.
   *
   * Optional for backwards-compatibility (old callers that don't pass it still
   * work; they just lose the prompt-level signal). Without it, applyPatches
   * also skips MPN validation (allowlist guard only fires when passed).
   *
   * Codified 2026-05-26 per handover 2026-05-26T05-34-4dd3f4a39.md Shift B
   * item 1: Phase 2 verified-parts allowlist class-killer fix.
   */
  verifiedPartsAllowlist?: VerifiedPartsAllowlist
}): Promise<RepairResult> {
  // Build a jurisdiction-aware system message that adds the guardrail block
  // after the core SYSTEM template. This prevents the repair LLM from emitting
  // foreign-jurisdiction standards (e.g. UL/NEC/ASTM for UK briefs) or known
  // incompatible brand-product combinations (ECARO-25 + Novec 1230, EBS-500).
  const jurisdictionGuardrail = buildJurisdictionGuardrail(opts.parsedBrief ?? null)

  // Allowlist prompt injection: tell the LLM which MPNs are approved so it
  // prefers them and avoids inventing new ones. The hard rejection happens in
  // applyPatches; this is the soft "please don't" signal that reduces the
  // number of patches that reach the hard gate.
  const allowlistBlock = opts.verifiedPartsAllowlist
    ? '\n' + renderAllowlistForPrompt(opts.verifiedPartsAllowlist) + '\n'
    : ''

  const systemWithGuardrail = SYSTEM + '\n' + jurisdictionGuardrail + allowlistBlock

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
          { role: 'system', content: systemWithGuardrail },
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

/**
 * isWordIdentityProtectedPath — returns true when the patch path targets a
 * field that defines a word's IDENTITY or STRUCTURAL radicals; such fields
 * are owned by the deterministic-emitter and must not be mutated by Phase 2.
 *
 * Protected (rejected when matched against `patch.path`):
 *   - <...>.words[N].id                                         (word rename)
 *   - <...>.words[N].content_character                          (whole-object swap)
 *   - <...>.words[N].content_character.character_id             (character rename)
 *   - <...>.words[N].content_character.function_radical_primary (structural)
 *   - <...>.words[N].content_character.material_radical_primary (structural)
 *
 * NOT protected (Phase 2 may freely write these):
 *   - <...>.words[N].name_human                       (display label)
 *   - <...>.words[N].content_character.name_human     (display label)
 *   - <...>.words[N].modifier_characters[+]           (enrichment merge branch)
 *   - <...>.words[N].content_character.function_radical_secondary
 *   - <...>.words[N].content_character.material_radical_secondary
 *
 * Matches operate on the raw patch.path string (e.g. "sub_modules[2].words[5].id"
 * or "modules[0].sub_modules[2].words[5].content_character.character_id"). The
 * helper does NOT walk the runtime tokens — that walk happens later in
 * applyPatches, and we want to fail fast (before the walk) on identity-protected
 * paths. Patches whose paths look like a `words[+]` append are NOT identity
 * patches (they go through the dedicated merge branch which handles existing-id
 * matching), so the regex specifically requires a numeric index `[N]`.
 *
 * Codified 2026-05-27 L47 fix B (reviewer-merge ID-preservation guard).
 */
const WORD_IDENTITY_PROTECTED_REGEXES = [
  // word.id rename — must end EXACTLY with `.id` at the leaf (not `.<thing>.id`)
  /\.words\[\d+\]\.id$/,
  // whole content_character swap (no further path tokens)
  /\.words\[\d+\]\.content_character$/,
  // identity fields nested under content_character
  /\.words\[\d+\]\.content_character\.character_id($|\.)/,
  /\.words\[\d+\]\.content_character\.function_radical_primary($|\.)/,
  /\.words\[\d+\]\.content_character\.material_radical_primary($|\.)/,
]

export function isWordIdentityProtectedPath(path: string | null | undefined): boolean {
  if (!path) return false
  const s = String(path)
  for (const re of WORD_IDENTITY_PROTECTED_REGEXES) {
    if (re.test(s)) return true
  }
  return false
}

/**
 * Options for applyPatches.
 *
 * verifiedPartsAllowlist: when provided, every patch that introduces or
 * modifies a modifier_characters[kind=part_number] value MUST match an
 * allowlist entry. Patches introducing non-allowlist MPNs are HARD REJECTED
 * (dropped, logged) — the chain continues without them.
 *
 * This is the structural enforcement counterpart to the soft prompt-level
 * signal sent via repair(opts.verifiedPartsAllowlist). Both together kill
 * the EBS-500 / EV200HAANA-1500V-claim / ECARO-25 hallucination family.
 *
 * Codified 2026-05-26 per handover 2026-05-26T05-34-4dd3f4a39.md Shift B.
 */
export interface ApplyPatchesOptions {
  verifiedPartsAllowlist?: VerifiedPartsAllowlist
}

export function applyPatches(
  modules: ModuleSpec[],
  crossLinks: CrossModuleGrammarLink[],
  patches: RepairPatch[],
  opts: ApplyPatchesOptions = {},
): {
  applied: number
  skipped: number
  allowlist_rejected: number
  reasons: string[]
  hash_before: string
  hash_after: string
  state_changed: boolean
} {
  const hashBefore = shortHash({ modules, crossLinks })
  let applied = 0
  let skipped = 0
  let allowlistRejected = 0
  const reasons: string[] = []

  for (const p of patches) {
    // ── ALLOWLIST CHECK (2026-05-26 Phase 2 class-killer fix) ────────────
    // When a verifiedPartsAllowlist is provided, inspect every patch whose
    // path targets a modifier_characters[kind=part_number] field OR whose
    // new_value contains a modifier with kind=part_number. If the MPN is
    // NOT in the allowlist → HARD REJECT the entire patch, log the rejection
    // reason (MPN + allowlist size + path), and continue to the next patch.
    //
    // Why reject the whole patch rather than just stripping the MPN:
    //   A Phase 2 patch that adds a word with a hallucinated MPN is not
    //   salvageable by removing the MPN — the word itself was invented to
    //   carry that MPN. Dropping the patch leaves the design unchanged
    //   (safer than an orphan word with no part identity) and forces the
    //   repair LLM to pick an allowlist MPN in the next iteration instead.
    //
    // Coverage: catches (a) direct edits to part_number modifier values,
    // (b) add-word patches that carry a part_number in modifier_characters.
    // Does NOT catch patches that add a part_number modifier to an already-
    // existing word via a partial object merge — those are caught by the
    // word-enrichment merge branch below which also runs the same check.
    if (opts.verifiedPartsAllowlist) {
      const allownlist = opts.verifiedPartsAllowlist
      const newVal: any = p.new_value

      // Case A: patch directly sets a part_number value (path ends in part_number
      // OR the last path token is a modifier_characters entry whose kind=part_number).
      const directPnEdit =
        p.path.includes('part_number') ||
        (typeof newVal === 'string' && p.path.endsWith('.value') && p.path.includes('part_number'))
      if (directPnEdit && typeof newVal === 'string' && newVal.trim().length >= 3) {
        const match = allowlistContainsMpn(allownlist, newVal)
        if (!match) {
          allowlistRejected++
          reasons.push(
            `ALLOWLIST_REJECT ${p.module}.${p.path}: MPN="${newVal}" not in verified-parts allowlist ` +
            `(${allownlist.entries.length} entries; sources: ` +
            `KPA=${allownlist.source_counts.KNOWN_PART_AUTHORITATIVE}, ` +
            `emitter=${allownlist.source_counts.deterministic_emitter}, ` +
            `rag=${allownlist.source_counts.rag_library}). ` +
            `Patch dropped. (${p.reason})`
          )
          skipped++
          continue
        }
      }

      // Case B: patch adds/replaces a word (new_value is object with modifier_characters).
      // Extract any part_number modifier from the new word and validate it.
      if (newVal && typeof newVal === 'object' && !Array.isArray(newVal)) {
        const mods: any[] = Array.isArray(newVal.modifier_characters) ? newVal.modifier_characters : []
        for (const mc of mods) {
          if (mc?.kind === 'part_number') {
            const pnVal = String(mc.value ?? '').trim()
            if (pnVal.length >= 3) {
              const match = allowlistContainsMpn(allownlist, pnVal)
              if (!match) {
                allowlistRejected++
                reasons.push(
                  `ALLOWLIST_REJECT ${p.module}.${p.path}: word patch contains MPN="${pnVal}" ` +
                  `not in verified-parts allowlist (${allownlist.entries.length} entries). ` +
                  `Patch dropped. (${p.reason})`
                )
                skipped++
                break  // break inner loop; continue will skip this patch via outer flag
              }
            }
          }
        }
        // If we pushed a rejection reason in the mods loop, skipped was already incremented.
        // The break above exits the mods loop but we're still in the outer for loop.
        // Use the reasons array as signal: last reason starts with ALLOWLIST_REJECT → continue.
        if (reasons.length > 0 && reasons[reasons.length - 1].startsWith('ALLOWLIST_REJECT')) {
          continue
        }
      }
    }
    // ── END ALLOWLIST CHECK ──────────────────────────────────────────────

    // ── WORD-IDENTITY PRESERVATION GUARD (2026-05-27 L47 architectural fix) ──
    // L46 council found that ABB Emax E2.2 modifiers loaded onto
    // ac_main_breaker_word by deterministic-emitter.ts had been OVERWRITTEN at
    // Phase 2 — the word's id was renamed to dc_power_cable_word with
    // manufacturer=Prysmian + part_number=Afumex 1000V. The L33 X fix
    // (preserve-modifiers-when-LLM-renames-words) closed the modifier-loss
    // hole; this Fix B closes the ORTHOGONAL id-rename hole.
    //
    // Phase 2 LLM (repair LLM) MAY NEVER:
    //   - Change a word's `id` field via a path like `<...>.words[N].id`.
    //   - Change a word's `content_character.character_id` via
    //     `<...>.words[N].content_character.character_id`.
    //   - Change a word's `content_character.function_radical_primary` or
    //     `material_radical_primary` (structural radicals).
    //   - Replace the entire `content_character` object via
    //     `<...>.words[N].content_character`.
    //
    // Phase 2 LLM MAY:
    //   - Change `word.name_human` (display label only).
    //   - Change `word.content_character.name_human` (display label only).
    //   - ADD `modifier_characters` via the words[+] merge branch (which has
    //     its own SAFETY_PROTECTED_KINDS guard) or via a direct append.
    //
    // Rejected patches are logged via reasons[] (persisted to actions.jsonl
    // by the chain's phase2_repair_N log step). A regression invariant
    // UNIVERSAL.reviewer_merge_never_changes_word_id walks the final state.json
    // and asserts no Phase-2-introduced id renames slipped past the guard.
    if (isWordIdentityProtectedPath(p.path)) {
      skipped++
      reasons.push(
        `[id-preservation] REJECT ${p.module}.${p.path}: patch targets a word-identity field ` +
        `(word.id / content_character.character_id / function_radical_primary / ` +
        `material_radical_primary). Phase 2 may not rename words or alter their ` +
        `structural radicals; the deterministic-emitter owns these. ` +
        `If the word's name needs an update for display, edit word.name_human instead. ` +
        `(${p.reason})`
      )
      continue
    }
    // ── END WORD-IDENTITY PRESERVATION GUARD ─────────────────────────────

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
      // ── NEW-WORD-WITH-MPN GUARD (2026-05-26 architectural invariant) ────────
      // Phase 2 LLM may NEVER add a genuinely new word_id that carries a
      // part_number modifier. The deterministic-emitter owns every MPN-bearing
      // word; Phase 2 may only ENRICH existing words or add prose-only words.
      //
      // Gate 23 (emitter-completeness-gate.ts) enforces upstream that every
      // sub_module has emitter MPN words. This guard is the downstream enforcement
      // that keeps Phase 2 from bypassing gate 23's intent by inventing new MPNs.
      //
      // REJECT: add_word (words[+]) where the word_id is NEW (not in cursor) AND
      //   the word carries a part_number modifier.
      // ALLOW: add_word with same id as existing word (merge path, handled above).
      // ALLOW: add_word with no part_number modifier (prose-only enrichment).
      if (isWordEnrichment) {
        // We already handled the existing-word merge case above. If we're here,
        // the word_id is genuinely new (no existing match).
        const newValForMpnCheck: any = p.new_value
        const modsForMpnCheck: any[] = Array.isArray(newValForMpnCheck?.modifier_characters)
          ? newValForMpnCheck.modifier_characters
          : []
        const hasPnModifier = modsForMpnCheck.some((mc: any) => {
          const kind = String(mc?.kind ?? '').toLowerCase().replace(/[\s_-]/g, '')
          return (kind === 'partnumber' || kind === 'part_number' || kind === 'pn') &&
            String(mc?.value ?? '').trim().length >= 3
        })
        if (hasPnModifier) {
          const newWordId = String(newValForMpnCheck?.id ?? 'unknown')
          const mpn = modsForMpnCheck.find((mc: any) => {
            const kind = String(mc?.kind ?? '').toLowerCase().replace(/[\s_-]/g, '')
            return kind === 'partnumber' || kind === 'part_number' || kind === 'pn'
          })?.value ?? 'unknown'
          // Find sub_module path for log context.
          const pathStr = `${p.module}.${p.path}`
          skipped++
          allowlistRejected++
          reasons.push(
            `[allowlist-strict] reject add_word with part_number — Phase 2 LLM may not invent ` +
            `MPN-bearing words; word_id=${newWordId} mpn=${mpn} sub_module=${pathStr}. ` +
            `The deterministic-emitter must own all MPN-bearing words. Gate 23 enforces this ` +
            `upstream. If the emitter is complete for this sub_module, the Phase 2 LLM should ` +
            `enrich the EXISTING emitter word instead of adding a new one. (${p.reason})`
          )
          continue
        }
      }
      // ── END NEW-WORD-WITH-MPN GUARD ──────────────────────────────────────────

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
    allowlist_rejected: allowlistRejected,
    reasons,
    hash_before: hashBefore,
    hash_after: hashAfter,
    state_changed: hashBefore !== hashAfter,
  }
}
