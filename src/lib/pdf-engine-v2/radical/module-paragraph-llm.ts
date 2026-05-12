// src/lib/pdf-engine-v2/radical/module-paragraph-llm.ts
//
// Piece 1F (2026-05-12) — LLM-augmented module paragraph generation.
// Takes a fully-populated ModuleSpec + the deterministic paragraph_en as
// anchor + the worked-example BESS energy_storage_source paragraph as
// few-shot, returns a rich worked-example-style narrative paragraph.
//
// Returns the LLM string on success; throws on transport/parse failure.
// Caller (orchestrator) wraps in try/catch and falls back to the
// deterministic paragraph_en when this throws.
//
// Model: x-ai/grok-4.3 primary (per drawer forgeos_decisions_905cc6faa0f9ee4f).
// Cost: ~£0.05 per call × ~8 active modules per product = ~£0.40 per pipeline.
// Temperature 0.3 (slight variation OK — prose is creative content, not
// strict JSON; lower than typical but higher than 0 to avoid the same
// stilted patterns).
// Max tokens: 1024 (paragraphs are 300-500 tokens; 1024 leaves headroom).

import type { ModuleSpec } from '../types/module-decomposition'

const SYSTEM_PROMPT = `You are a senior engineering writer drafting the "module paragraph" section of a hardware engineering report. You translate a structured module specification (sub-modules, content characters with their radicals, modifier characters with their numerical quantities, intra-module grammar links) into ONE flowing English paragraph in the style of a published engineering report.

Style requirements:
1. ONE paragraph. 250-450 words. No bullet lists. No section headers.
2. EVERY specific number from the modifier characters must appear in your prose. If the module specifies qty ×3920 LFP cells, your paragraph must say "3,920 cells" verbatim (with thousands comma). If it specifies 280 Ah, say "280 Ah". Numbers are the engineering evidence — don't paraphrase them away.
3. Weave the numbers into PROSE — not "qty ×3920" or "3920 (qty)". Write naturally: "3,920 prismatic cells (CATL 280 Ah, 3.2 V nominal) arranged in 112 modules of 35-cells-series".
4. Explain cross-sub-module relationships in flowing English using the grammar_links data. If sub_module A has a mechanical_mount link to sub_module B, write something like "The cells sit inside steel rack frames clamped by compression plates — the rack-structure provides the mechanical mount and clamp force the cell vendor specifies." Don't say "A has a mechanical_mount link to B".
5. Follow physical signal flow where possible (energy source → conversion → distribution → switching → sensing → control). For non-electrical modules, follow the natural flow of the engineering domain.
6. END with a summary sentence using semicolons to chain the role each sub-module plays. Example: "Together: cells generate current; rack holds them; slaves measure them; master commands switching; distribution carries the current; instrumentation closes the feedback loop."
7. Tone: engineering report. Specific, factual, no marketing voice. Brit English where idiomatic ("organised", "characterise").
8. CRITICAL: match the STRUCTURE of the few-shot example below, not its domain vocabulary. The example is a BESS energy_storage_source; you may receive a CGM patch, an AUV thruster, a heat-pump compressor, a satellite ground station dish. Do NOT import BESS metaphors ("cells", "busbars", "rack") into a CGM glucose-sensing module. Use the vocabulary from the INPUT module's own sub_modules + characters + radicals. The example shows you the SHAPE (signal-flow narrative → cross-sub-module relationships in prose → semicolon summary); fill that shape with the input's actual content.

Bad output (DO NOT do this):
- "This module contains the following sub-modules: cell_string, rack_structure, bms_slave..."
- "The cell_string sub-module has 3920 LFP prismatic cells with a quantity modifier of ×3920."
- "Grammar link: cell_string ↔ rack_structure via mechanical_mount."

Good output (DO this — note the natural prose flow):
- "The energy_storage_source module is a 3.5 MWh containerised LFP battery: 3,920 prismatic cells (CATL 280 Ah, 3.2 V nominal) arranged in 112 modules of 35-cells-series..."

OUTPUT FORMAT: respond with ONLY the paragraph text — no preamble, no headers, no markdown, no "Here is the paragraph:". The first character of your response must be the first character of the paragraph itself.`

const FEW_SHOT_BESS_ENERGY_STORAGE_SOURCE_OUTPUT = `The energy_storage_source module is a 3.5 MWh containerised LFP battery: 3,920 prismatic cells (CATL 280 Ah, 3.2 V nominal) arranged in 112 modules of 35-cells-series, interconnected by 3,808 copper busbars rated 350 A. The cells sit inside 112 steel rack frames clamped by 112 compression plates at 3.5 kN per stack — the rack-structure provides the mechanical mount and clamp force the cell vendor specifies. One BMS slave PCB per frame (112 total, 14 channels each, ±5 mV) reads cell voltages and 8 NTC thermistors per module (896 total), then daisy-chains over CAN at 500 kbit/s into a single pack-level BMS master controller (1500 V isolated, IEC 62619). The master commands the dc-distribution chain — copper busbars, a 300 A main contactor, a pre-charge contactor, and a 200 kA HRC DC fuse, all in series on the negative rail — and reads back analogue feedback from pack instrumentation (1500 A shunt, voltage divider, and insulation monitor) which sits in series with that same negative busbar. Together: cells generate current; rack holds them; slaves measure them; master commands switching; distribution carries the current; instrumentation closes the feedback loop.`

/**
 * Generate an LLM-augmented module paragraph. Throws on any failure
 * (transport, JSON parse, empty response, model returns garbage). Caller
 * wraps in try/catch and falls back to the deterministic paragraph_en.
 */
export async function generateLlmModuleParagraph(
  moduleSpec: ModuleSpec,
  deterministicParagraphEn: string,
): Promise<string> {
  // Build the user content: stringify the module spec compactly (no whitespace)
  // + the deterministic anchor paragraph + a one-line product context hint.
  const moduleSpecJson = JSON.stringify({
    module: moduleSpec.module,
    module_brief: moduleSpec.module_brief,
    derived_parameters: moduleSpec.derived_parameters,
    sub_modules: moduleSpec.sub_modules,
    grammar_links: moduleSpec.grammar_links,
  })

  const userContent = [
    `=== FEW-SHOT EXAMPLE (target prose quality) ===`,
    `INPUT MODULE: energy_storage_source on a 3.5 MWh containerised BESS`,
    `OUTPUT PARAGRAPH:`,
    FEW_SHOT_BESS_ENERGY_STORAGE_SOURCE_OUTPUT,
    ``,
    `=== YOUR TASK ===`,
    `INPUT MODULE: ${moduleSpec.module}`,
    ``,
    `Module specification (use ALL the numbers from modifier_characters in your prose):`,
    moduleSpecJson,
    ``,
    `For reference, here is a stilted template-generated paragraph for this module — use it ONLY to confirm you have the right facts, NOT to copy the style:`,
    deterministicParagraphEn,
    ``,
    `OUTPUT YOUR PARAGRAPH (one paragraph, 250-450 words, engineering-report style, all specific numbers woven into prose, closing summary sentence with semicolons):`,
  ].join('\n')

  // Council 2026-05-12 F2 fix: Promise.race timeout. `AbortSignal.timeout()`
  // is unreliable in Vercel serverless contexts per MEMORY.md; use Promise.race.
  // 30s ceiling per module; a hung Grok inference must not stall the
  // sequential 8-module loop indefinitely.
  const fetchPromise = fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'x-ai/grok-4.3',
      temperature: 0.3,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    }),
  })
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout (30s) for module=${moduleSpec.module}`)), 30_000),
  )
  const response = await Promise.race([fetchPromise, timeoutPromise])
  if (!response.ok) {
    throw new Error(`OpenRouter status ${response.status} for module=${moduleSpec.module}`)
  }
  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
  }
  const choice = json.choices?.[0]
  // Council 2026-05-12 F3 fix: check finish_reason. A paragraph truncated at
  // max_tokens=1024 still passes the length>=100 guard but is a degraded
  // result. Treat anything other than 'stop' as failure → falls back to
  // deterministic paragraph in the caller.
  if (choice?.finish_reason && choice.finish_reason !== 'stop') {
    throw new Error(`LLM finish_reason='${choice.finish_reason}' for module=${moduleSpec.module} (likely max_tokens truncation)`)
  }
  const raw = choice?.message?.content?.trim()
  if (!raw || raw.length < 100) {
    throw new Error(`Empty/short LLM response for module=${moduleSpec.module} (got ${raw?.length ?? 0} chars)`)
  }
  return raw
}
