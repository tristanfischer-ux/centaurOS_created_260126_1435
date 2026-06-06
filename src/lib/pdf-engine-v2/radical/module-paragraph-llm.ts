// src/lib/pdf-engine-v2/radical/module-paragraph-llm.ts
//
// Piece 1F (REVIVED 2026-06-06) — LLM-augmented MODULE overview paragraph.
//
// FIX 1 of the "design_modules/grammar universal-fix" plan. The deterministic-
// emitter chain path produces ZERO LLM narrative prose: every module's
// `overview_paragraph_en` is left empty, so the renderer falls back to a
// MECHANICAL CONCAT of the module's sub-module sentences (summary sentence +
// each sub-module's deterministic-template sentence joined). The multimodal
// scorer reads that as robotic / repetitive / false-precision / word-salad and
// drops design_modules (~7.0-7.3) and grammar_language (~7.0-7.5) below the 8.0
// floor. This is UNIVERSAL — any class on the deterministic-emitter path.
//
// THE CURE: have a real LLM write each module a single flowing overview
// paragraph, GROUNDED in the FROZEN orchestrator-contract quantities (so the
// numbers are the engine's own audited values, never invented), mentioning each
// sub-module exactly once, with NO BoM-dump fragments ("(additional: £…)",
// "(part …)"), NO false precision (round to ≤3 significant figures), NO
// repetition, British spelling, and no unexpanded acronyms.
//
// Call/parse/fallback pattern modelled on the LIVE siblings that already work
// in this chain: brief-overview-llm.ts (Piece 1G), regulatory-prose-llm.ts
// (Piece 1H), fmea-risk-llm.ts (Piece 1I). Same raw-fetch shape, same
// JSON-object output + brace-extraction tolerance, same finish_reason guard,
// same 150k token budget, same non-Anthropic model (x-ai/grok-4.3), same
// graceful per-item fallback so a single failed module never aborts the run.
//
// Cost: ~£0.04 per module call × ~10-13 modules ≈ £0.40-£0.55 per pipeline run.
// Temperature 0.3 (prose is creative content; low enough to stay grounded,
// high enough to avoid the stilted single-pattern output of temperature 0).

import type { ModuleSpec, SubModuleSpec, WordSpec } from '../types/module-decomposition'

// ─── Public result shape ───────────────────────────────────────────────────

export interface ModuleParagraphResult {
  /** Which module this paragraph belongs to (ModuleSpec.module). */
  module: string
  /** The LLM-written overview paragraph (already cleaned of fragments). */
  overview_paragraph_en: string
  /** True when this came from the LLM; false when the deterministic fallback was kept. */
  from_llm: boolean
}

export interface ModuleParagraphLayer {
  /** keyed by module id (ModuleSpec.module) */
  by_module: Record<string, ModuleParagraphResult>
  generated_at: string
  model_used: string
  module_count: number
  llm_success_count: number
}

const MODEL = 'x-ai/grok-4.3'

// ─── System prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior engineering writer drafting the per-module "overview paragraph" of an investment-grade hardware engineering report. For ONE module you are given: the module's name, a short brief, its list of sub-modules (each with its constituent components), and a block of FROZEN ENGINEERING QUANTITIES computed by the engine's verified tools. Write ONE flowing overview paragraph.

Output ONLY a single JSON object — no preamble, no markdown fences, no commentary. The first character of your response must be the opening brace.

Required JSON shape:
{
  "overview_paragraph_en": "<one flowing paragraph, 110-180 words>"
}

STYLE REQUIREMENTS:
1. ONE paragraph. 110-180 words. No bullet lists. No section headings. No sub-headings.
2. Engineering report tone: specific, factual, no marketing voice. British spelling throughout ("organised", "characterise", "behaviour", "colour", "optimised", "minimised").
3. Mention EACH sub-module exactly ONCE, by its plain-English name, woven into the signal/process flow. Do NOT enumerate them as a list ("This module contains the following sub-modules: …"). Narrate how they work together.
4. Follow the natural flow of the engineering domain (for a process plant: feed → reaction → separation → product handling → utilities/control; for an electrical system: source → conversion → distribution → switching → sensing → control). Close with ONE short sentence summarising the module's role.

NUMBERS — THE HARD RULES (this is the most important section):
5. You may state a numerical value ONLY if it appears in the FROZEN ENGINEERING QUANTITIES block provided to you. Do NOT invent, estimate, paraphrase, recompute, or "round up" any other number. If a quantity you would like to cite is not in the block, describe the attribute qualitatively instead (e.g. "sized for the design throughput") — never fabricate a figure.
6. Round every number you cite to AT MOST 3 significant figures. Never write 4 or more decimal places. Write "0.235 m", not "0.2346 m"; "4.80 m³", not "4.8035 m³"; "397 W/m³", not "396.62 W/m³". Never write giant raw equilibrium constants or 16-digit solver outputs — if the frozen block contains one, refer to it qualitatively ("at chemical equilibrium") rather than quoting the raw figure.
7. FORBIDDEN FRAGMENTS — never emit any of these in your prose: "(additional: …)", "(additional £…)", "(part …)", "(part number …)", "qty ×N", "×N (qty)". These are bill-of-materials dump artefacts, not prose. Write naturally: "three carbonation reactors", not "carbonation reactor (part CR-101) (additional: £4,200)".
8. NO REPETITION: do not repeat the same sentence, clause, or "…N components" opener. Each sentence must carry new information. Never copy a sub-module's component sentence verbatim — synthesise.

CHEMISTRY / FORMULAE:
9. Render chemical formulae with correct capitalisation and subscripts in unicode where natural: CO₂ (not co2), CaCO₃ (not caco3), K₂SO₄ (not k2so4), H₂O, MEA. Never leave a formula all-lowercase.

ACRONYMS:
10. Spell out any acronym on first use within the paragraph, e.g. "monoethanolamine (MEA)", "continuous stirred-tank reactor (CSTR)", "battery management system (BMS)". Proper-noun product names and standards numbers are exempt.

11. CRITICAL — match the SHAPE of the example below, NOT its domain vocabulary. The example is a battery energy-storage module; you may receive a carbon-mineralisation reactor train, a heat-pump compressor, an electrolyser stack. Do NOT import the example's vocabulary ("cells", "busbars", "rack") into a different domain. Use the INPUT module's own sub-module and component names. The example shows you the SHAPE (signal/process-flow narrative → numbers drawn only from the frozen block → one-sentence role summary); fill that shape with the input's actual content.

12. Bad output (DO NOT do this):
 - "This module contains the following sub-modules: cell_string, rack_structure, bms_slave."
 - "The cell_string has 3920 cells with a quantity modifier of ×3920 (additional: £18,400)."
 - "The reactor (part CR-101) processes 4.8035 m³ at 396.62 W/m³."`

// ─── Few-shot example (BESS energy_storage_source) ──────────────────────────

const FEW_SHOT_INPUT = [
  'MODULE: energy_storage_source',
  'MODULE BRIEF: Stores 3.5 MWh of usable energy and delivers 1 MW continuous discharge for grid-balancing duty.',
  'SUB-MODULES (each: name — components):',
  '  - cell string — lithium iron phosphate prismatic cell; cell-to-cell busbar',
  '  - rack structure — steel rack frame; compression plate',
  '  - battery management slave — slave monitoring board; cell temperature sensor',
  'FROZEN ENGINEERING QUANTITIES (the ONLY numbers you may cite):',
  '  cell_count = 3920',
  '  nameplate_capacity_mwh = 3.5',
  '  continuous_power_mw = 1',
  '  rack_count = 112',
  '  series_cells_per_string = 35',
].join('\n')

const FEW_SHOT_OUTPUT = JSON.stringify({
  overview_paragraph_en:
    'The energy storage source holds 3.5 MWh of usable capacity and sustains 1 MW of continuous discharge for grid-balancing duty. Energy is stored in a cell string of 3,920 lithium iron phosphate prismatic cells, joined by cell-to-cell busbars and grouped 35 cells in series so the string voltage sits within the converter window. The cells are clamped inside a steel rack structure of 112 frames, each frame carrying compression plates that hold the stack to the manufacturer-specified clamping force across charge and discharge. A battery management slave on every frame reads each cell through its monitoring board and dedicated temperature sensor, then reports to the pack controller so over-voltage and over-temperature limits are enforced before any cell is stressed. Together the three sub-modules give the module its function: the cell string generates the current, the rack structure carries and constrains it, and the management slaves characterise and protect it.',
})

// ─── Quantity formatting (≤3 significant figures for display) ────────────────

/**
 * Round a numeric value to <=3 significant figures for the FROZEN block we hand
 * the model, so the model never even SEES the 4+-decimal raw solver output. We
 * still pass the model the value as a display string; the model is instructed to
 * cite only what is in the block, so giving it pre-rounded values is the
 * belt-and-braces guard against false precision leaking into prose.
 */
export function roundToSigFigs(value: number, sig = 3): number {
  if (!Number.isFinite(value) || value === 0) return value
  const digits = Math.ceil(Math.log10(Math.abs(value)))
  const power = sig - digits
  const factor = Math.pow(10, power)
  return Math.round(value * factor) / factor
}

/**
 * Format one frozen quantity value for the prompt block. Numbers are rounded to
 * <=3 sig figs; absurdly large numbers (raw equilibrium constants, 10+ digit
 * solver outputs) are summarised rather than quoted so the model can never echo
 * a 16-digit constant.
 */
function formatQuantityValue(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    if (Math.abs(raw) >= 1e7) return '(large value — describe qualitatively, do not quote)'
    const r = roundToSigFigs(raw, 3)
    // Trim trailing zeros from the display form.
    return String(r)
  }
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return null
    if (t.length > 60) return null // skip prose-y / sentence-shaped values
    return t
  }
  if (typeof raw === 'boolean') return String(raw)
  return null
}

/**
 * Build the FROZEN ENGINEERING QUANTITIES block from the orchestrator contract.
 * Only scalar (number/short-string/boolean) entries are included — nested
 * objects, arrays, and prose are skipped (they are not citable scalars). The
 * key is humanised lightly (underscores → spaces) but kept recognisable.
 */
export function buildFrozenQuantitiesBlock(
  quantities: Record<string, unknown> | null | undefined,
): { text: string; count: number } {
  if (!quantities || typeof quantities !== 'object') {
    return { text: '(no frozen quantities available — describe attributes qualitatively, cite NO numbers)', count: 0 }
  }
  const lines: string[] = []
  for (const [key, val] of Object.entries(quantities)) {
    // The contract sometimes stores { value, unit, ... } objects; handle that.
    let scalar: unknown = val
    let unit = ''
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const o = val as Record<string, unknown>
      if ('value' in o) {
        scalar = o.value
        if (typeof o.unit === 'string') unit = o.unit
      } else {
        continue // a nested object with no .value is not a citable scalar
      }
    }
    const formatted = formatQuantityValue(scalar)
    if (formatted == null) continue
    lines.push(`  ${key} = ${formatted}${unit ? ' ' + unit : ''}`)
  }
  if (lines.length === 0) {
    return { text: '(no scalar frozen quantities available — describe attributes qualitatively, cite NO numbers)', count: 0 }
  }
  return { text: lines.join('\n'), count: lines.length }
}

// ─── Compact module description for the prompt ──────────────────────────────

/** Pull the most useful human label for a word (name, then content character). */
function wordLabel(w: WordSpec): string {
  const anyW = w as any
  const name = String(anyW?.name_human ?? anyW?.content_character?.name_human ?? anyW?.id ?? '').trim()
  // Humanise a snake_case fallback id so the model never sees raw ids.
  return name.replace(/_word$/i, '').replace(/_/g, ' ').trim()
}

/** One line per sub-module: "name — component, component, …". */
function describeSubModule(sm: SubModuleSpec): string {
  const name = String(sm.name_human ?? sm.id ?? '').replace(/_/g, ' ').trim()
  const words = Array.isArray(sm.words) ? sm.words : []
  const compNames = Array.from(
    new Set(words.map(wordLabel).filter((s) => s.length > 0)),
  ).slice(0, 8)
  const topology = typeof sm.topology_clause === 'string' ? sm.topology_clause.trim() : ''
  const comps = compNames.length > 0 ? compNames.join(', ') : 'unspecified components'
  return `  - ${name} — ${comps}${topology ? ` [arrangement: ${topology.slice(0, 120)}]` : ''}`
}

function buildModuleDescription(moduleSpec: ModuleSpec): string {
  const subs = Array.isArray(moduleSpec.sub_modules) ? moduleSpec.sub_modules : []
  const moduleName = String(moduleSpec.module ?? '').replace(/_/g, ' ').trim()
  const brief = String(moduleSpec.module_brief ?? '').trim()
  const lines = [
    `MODULE: ${moduleName}`,
    brief ? `MODULE BRIEF: ${brief}` : 'MODULE BRIEF: (none provided)',
    'SUB-MODULES (each: name — components):',
    ...subs.map(describeSubModule),
  ]
  return lines.join('\n')
}

// ─── Post-LLM safety scrub (belt-and-braces) ────────────────────────────────

/**
 * Strip the forbidden BoM-dump fragments from the LLM prose as a final guard,
 * in case the model slips one through despite the instruction. Removes
 * "(additional: …)" and "(part …)" parenthetical fragments and collapses the
 * resulting double spaces. Does NOT touch numbers (the model is instructed +
 * fed pre-rounded values; the renderer's clean_prose also rounds downstream).
 */
export function scrubModuleParagraph(text: string): string {
  return text
    .replace(/\s*\((?:additional|part)\b[^)]*\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;])/g, '$1')
    .trim()
}

// ─── Single-module call ─────────────────────────────────────────────────────

async function generateOneModuleParagraph(
  moduleSpec: ModuleSpec,
  frozenBlock: string,
): Promise<string> {
  const moduleDescription = buildModuleDescription(moduleSpec)
  const userContent = [
    '=== FEW-SHOT EXAMPLE (target prose SHAPE, not vocabulary) ===',
    'INPUT:',
    FEW_SHOT_INPUT,
    'OUTPUT:',
    FEW_SHOT_OUTPUT,
    '',
    '=== YOUR TASK ===',
    'INPUT:',
    moduleDescription,
    'FROZEN ENGINEERING QUANTITIES (the ONLY numbers you may cite — round each to <=3 significant figures):',
    frozenBlock,
    '',
    'OUTPUT YOUR JSON OBJECT (one flowing overview paragraph, 110-180 words, each sub-module mentioned once, numbers ONLY from the frozen block rounded to <=3 sig figs, NO "(additional:" or "(part " fragments, British spelling, acronyms expanded on first use, formulae correctly capitalised):',
  ].join('\n')

  // 45s ceiling per module (matches brief-overview-llm.ts). AbortController +
  // setTimeout — AbortSignal.timeout() is unreliable in serverless per MEMORY.md.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)
  let response: Response
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        // 150k token budget — chain-wide standard (MEMORY.md: truncation is
        // more expensive than unused tokens).
        max_tokens: 150_000,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new Error(`OpenRouter status ${response.status} for module=${moduleSpec.module}`)
  }
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
  }
  const choice = json.choices?.[0]
  if (choice?.finish_reason && choice.finish_reason !== 'stop') {
    throw new Error(
      `LLM finish_reason='${choice.finish_reason}' for module=${moduleSpec.module} (likely max_tokens truncation)`,
    )
  }
  const raw = choice?.message?.content?.trim() ?? ''

  // Tolerate code fences and preamble — same pattern as the live siblings.
  let cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }

  const parsed = JSON.parse(cleaned) as { overview_paragraph_en?: string }
  const paragraph = (parsed.overview_paragraph_en ?? '').trim()
  if (paragraph.length < 80) {
    throw new Error(
      `Empty/short module paragraph for module=${moduleSpec.module} (got ${paragraph.length} chars)`,
    )
  }
  return scrubModuleParagraph(paragraph)
}

// ─── Main export ────────────────────────────────────────────────────────────

/**
 * Generate an LLM-written overview paragraph for EVERY module in the design,
 * grounded in the frozen orchestrator-contract quantities. Mutates each
 * ModuleSpec's `overview_paragraph_en` IN PLACE on success.
 *
 * Graceful: a single module's failure (transport, parse, truncation, empty)
 * leaves THAT module's existing `overview_paragraph_en` untouched (the
 * deterministic fallback survives) and never aborts the whole run. The function
 * always returns a layer describing what happened.
 *
 * Bounded concurrency (3) to avoid OpenRouter 429 cascades, matching
 * regulatory-prose-llm.ts / fmea-risk-llm.ts.
 */
export async function generateModuleParagraphs(
  modules: ModuleSpec[],
  quantities: Record<string, unknown> | null | undefined,
): Promise<ModuleParagraphLayer> {
  const mods = Array.isArray(modules) ? modules : []
  const { text: frozenBlock, count: qtyCount } = buildFrozenQuantitiesBlock(quantities)

  const by_module: Record<string, ModuleParagraphResult> = {}
  let llmSuccess = 0

  const MAX_CONCURRENT = 3
  for (let batchStart = 0; batchStart < mods.length; batchStart += MAX_CONCURRENT) {
    const batch = mods.slice(batchStart, batchStart + MAX_CONCURRENT)
    const batchResults = await Promise.all(
      batch.map(async (moduleSpec): Promise<ModuleParagraphResult> => {
        // Skip modules with no sub-modules — there is nothing to narrate, and
        // the deterministic module_brief is the right fallback there.
        const subs = Array.isArray(moduleSpec.sub_modules) ? moduleSpec.sub_modules : []
        if (subs.length === 0) {
          return { module: String(moduleSpec.module), overview_paragraph_en: (moduleSpec.overview_paragraph_en ?? '').trim(), from_llm: false }
        }
        try {
          const paragraph = await generateOneModuleParagraph(moduleSpec, frozenBlock)
          // Mutate in place — this is the field the renderer prefers and the
          // chain copies into nl.by_module[*].paragraph_en_llm.
          ;(moduleSpec as any).overview_paragraph_en = paragraph
          return { module: String(moduleSpec.module), overview_paragraph_en: paragraph, from_llm: true }
        } catch (err) {
          const message = (err as Error).message
          console.warn(`[module-paragraph-llm] ${moduleSpec.module}: kept deterministic fallback (${message})`)
          return { module: String(moduleSpec.module), overview_paragraph_en: (moduleSpec.overview_paragraph_en ?? '').trim(), from_llm: false }
        }
      }),
    )
    for (const r of batchResults) {
      by_module[r.module] = r
      if (r.from_llm) llmSuccess++
    }
  }

  return {
    by_module,
    generated_at: new Date().toISOString(),
    model_used: MODEL,
    module_count: mods.length,
    llm_success_count: llmSuccess,
  }
}
