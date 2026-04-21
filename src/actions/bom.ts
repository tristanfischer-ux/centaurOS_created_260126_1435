"use server"

/**
 * @file bom.ts — Server actions for structured BOM generation and management.
 *
 * @description Expands unstructured keyParts[] from CAD Lab modules into
 * structured parts with specs, costs, and a hierarchical BOM. Uses Claude
 * to intelligently decompose parts and deduplicate shared components.
 *
 * @security All actions use withAuth for foundry-scoped access control.
 * RLS on parts/bom_lines provides defense-in-depth via cad_lab_projects
 * foundry_id subquery.
 */

import { withAuth } from "@/lib/server-action-utils"
import { withAIGate } from '@/lib/ai/with-ai-gate'
import { sanitizeErrorMessage } from "@/lib/security/sanitize"
import type {
  StructuredPart,
  BomLine,
  BomTreeNode,
  BomGenerationResult,
  CadLabModule,
  CadLabDesignBrief,
  ManufacturingProcessType,
} from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import { fetchCatalogueForPrompt, extractSearchKeywords } from "./component-library"
import { detectDomainFromKeyParts } from "@/lib/cad-lab/domain-prompts"

// ─── Constants ──────────────────────────────────────────────────────

const BOM_MODEL = "claude-opus-4-7"
const BOM_MAX_TOKENS = 8192
/** Max depth for BOM tree recursion to prevent infinite loops from cyclic data */
const MAX_BOM_DEPTH = 20
/** Max length for user-provided strings interpolated into prompts */
const MAX_PROMPT_FIELD_LENGTH = 500
/**
 * Max skeleton parts to expand in a single Claude call. A single expansion
 * response for N parts is roughly 400-800 tokens/part. At 15 parts, a worst
 * case response fits comfortably under BOM_MAX_TOKENS (8192). This was the
 * root cause of the 84s parse failures in production: a 9-module project
 * with 45+ skeleton parts would truncate the monolithic response at 8192
 * tokens and produce invalid JSON.
 */
const EXPAND_BATCH_SIZE = 15
/**
 * Max concurrent Anthropic requests for BOM expansion batches. Matches the
 * Max decomposition orchestrator's EXPAND_CONCURRENCY so we don't starve the
 * rate limiter when both pipelines run back-to-back. A 9-module project with
 * ~45 parts → 3 batches → wall-clock ~60-90s (vs 226s serial monolithic).
 */
const EXPAND_CONCURRENCY = 3

const VALID_PROCESSES = new Set<string>([
  "cnc", "injection_molding", "sheet_metal",
  "3d_print_fdm", "3d_print_sla", "3d_print_sls",
  "casting", "forging", "machining",
  "purchased_cots", "other",
])

// ─── Helpers ────────────────────────────────────────────────────────

/** Truncate a string to prevent prompt bloat from user input */
function truncate(s: string | undefined | null, maxLen: number): string {
  if (!s) return ""
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s
}

/**
 * Extract JSON from an AI response that may contain markdown fences or prose.
 * Finds the first { and last } to extract the JSON object.
 */
function extractJson(text: string): string {
  const trimmed = text.trim()
  // Try stripping markdown fences first
  if (trimmed.startsWith("```")) {
    const stripped = trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    if (stripped.startsWith("{")) return stripped
  }
  // Find the first { and last }
  const firstBrace = trimmed.indexOf("{")
  const lastBrace = trimmed.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }
  return trimmed
}

/** Validate a process value against the enum */
function validateProcess(p: unknown): ManufacturingProcessType | null {
  if (typeof p === "string" && VALID_PROCESSES.has(p)) return p as ManufacturingProcessType
  return null
}

/** Clamp a numeric value to a non-negative number, or null */
function clampPositive(n: unknown): number | null {
  if (typeof n !== "number" || isNaN(n)) return null
  return Math.max(0, n)
}

/**
 * Parse JSON with progressive repair for truncated Anthropic responses.
 *
 * @description When Claude hits max_tokens mid-response, the JSON is cut off
 * (often inside a string or array). This helper tries:
 *   1. JSON.parse on the extracted JSON (happy path)
 *   2. Trim trailing incomplete content and close open braces/brackets
 *   3. Return null if unrecoverable
 *
 * @returns parsed object or null if unrecoverable
 */
function tryParseJsonWithRepair<T = unknown>(jsonStr: string): T | null {
  // Happy path — valid JSON
  try {
    return JSON.parse(jsonStr) as T
  } catch {
    // fall through to repair
  }

  let repaired = jsonStr.trim()

  // Cut back to the last complete `}` or `]` before truncation. This handles
  // the common case where the response ends mid-property (e.g. `"material": "Alu`).
  const lastCompleteObjectEnd = repaired.lastIndexOf("}")
  const lastCompleteArrayEnd = repaired.lastIndexOf("]")
  const cutPoint = Math.max(lastCompleteObjectEnd, lastCompleteArrayEnd)
  if (cutPoint > 0 && cutPoint < repaired.length - 1) {
    repaired = repaired.slice(0, cutPoint + 1)
  }

  // Count unclosed braces/brackets and append closers in reverse order.
  // Walk the string respecting string literals so we don't count braces
  // inside a "description" value.
  const openStack: string[] = []
  let inString = false
  let escaped = false
  for (const ch of repaired) {
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === "\\") {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === "{" || ch === "[") openStack.push(ch)
    else if (ch === "}" && openStack[openStack.length - 1] === "{") openStack.pop()
    else if (ch === "]" && openStack[openStack.length - 1] === "[") openStack.pop()
  }

  // If we ended inside a string, close it first.
  if (inString) repaired += '"'

  // Trim trailing comma that now dangles.
  repaired = repaired.replace(/,\s*$/, "")

  // Close remaining open structures.
  while (openStack.length > 0) {
    const open = openStack.pop()
    repaired += open === "{" ? "}" : "]"
  }

  try {
    return JSON.parse(repaired) as T
  } catch {
    return null
  }
}

/**
 * Runs an async mapper over an array with at most `limit` in flight at once.
 * Returns results in the same order as the input. Mirrors the helper in
 * `run-max-decomposition.ts` — kept private here so bom.ts stays a
 * self-contained `"use server"` module.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workerCount = Math.max(1, Math.min(limit, items.length))

  async function runOne(): Promise<void> {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) return
      results[idx] = await mapper(items[idx], idx)
    }
  }

  const workers: Array<Promise<void>> = []
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(runOne())
  }
  await Promise.all(workers)
  return results
}

/** Partition an array into chunks of at most `size` elements. */
function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

// ─── Types (internal to progressive BOM flow) ──────────────────────

export interface SkeletonPart {
  partNumber: string
  name: string
  sourceModuleId: string
  process: string
  isPurchased: boolean
  parentPartNumber: string | null
}

export interface BomSkeletonResult {
  success: boolean
  error?: string
  parts: SkeletonPart[]
  bomLines: Array<{ parentPartNumber: string | null; childPartNumber: string; quantity: number }>
}

export interface BomExpansionResult {
  success: boolean
  error?: string
  expansions: Record<string, {
    description: string
    material: string
    materialSpec: string
    finish: string
    tolerance: string
    massKg: number
    envelopeXMm: number
    envelopeYMm: number
    envelopeZMm: number
    estimatedUnitCostGbp: number
    aiConfidence: number
  }>
}

// ─── Progressive BOM: Phase 1 — Skeleton ────────────────────────────

/**
 * Phase 1 of progressive BOM generation: returns lightweight skeleton
 * with part names, hierarchy, process type, and isPurchased flag.
 *
 * @description Caller should display skeleton parts immediately (specs show
 * "—"), then call expandBomParts() for full specifications.
 *
 * TRIED max_tokens: 2048 on 2026-03-29 (original progressive-BOM commit).
 * Problem: truncates mid-JSON for projects with ≥7 modules. A 10-module
 * cubesat project with 62 key parts + 10 assemblies needs ~6k tokens of
 * skeleton JSON. tryParseJsonWithRepair salvaged the truncated array by
 * closing it at the 3rd module, so BOM silently succeeded with 3 of 10
 * modules covered and every downstream cost number was wrong.
 *
 * Evidence: project bb371c71 (2026-04-21) — parts table had only
 * primary_structure (13), avionics_stack (6), eps_battery (5). Modules
 * 4–10 silently missing; Finn's cost estimate off by ≥50%.
 *
 * Now 8192 to match expand batches — covers ~80 skeleton parts even for
 * content-heavy modules. Response time ~12–15s (vs ~8s at 2048) is
 * acceptable for a once-per-project call.
 */
export async function skeletonBom(
  projectId: string,
  modules: CadLabModule[],
  designBrief?: CadLabDesignBrief,
  diagnosticAnswers?: DiagnosticAnswers,
): Promise<BomSkeletonResult> {
  return withAIGate('bom', async ({ supabase }) => {
    if (!modules.length) {
      return { success: false, error: "No modules to generate BOM from", parts: [], bomLines: [] }
    }

    const { data: project, error: projErr } = await supabase
      .from("cad_lab_projects")
      .select("id, subject")
      .eq("id", projectId)
      .single()

    if (projErr || !project) {
      return { success: false, error: "Project not found", parts: [], bomLines: [] }
    }

    const moduleDescriptions = modules.map((m) => {
      const diagInfo = diagnosticAnswers?.[m.id]
        ? `\nDiagnostic answers: ${JSON.stringify(diagnosticAnswers[m.id])}`
        : ""
      return `## Module: ${truncate(m.name, 100)} (id: ${truncate(m.id, 50)})
Purpose: ${truncate(m.purpose, MAX_PROMPT_FIELD_LENGTH)}
Key Parts: ${m.keyParts.map((p) => truncate(p, 100)).join(", ")}
Description: ${truncate(m.description, MAX_PROMPT_FIELD_LENGTH)}${diagInfo}`
    }).join("\n\n")

    const briefContext = designBrief
      ? `\n\nDesign Brief:
- Use case: ${truncate(designBrief.useCase, 200) || "not specified"}
- Target process: ${truncate(designBrief.targetProcess, 100) || "not specified"}
- Target material: ${truncate(designBrief.targetMaterial, 100) || "not specified"}`
      : ""

    const systemPrompt = `You are a manufacturing engineer creating a Bill of Materials skeleton from product module decomposition data.

Your task (SKELETON ONLY — no detailed specs):
1. Expand each module's keyParts into named parts with a manufacturing process type
2. Create one assembly-level part per module (parent in hierarchy)
3. Deduplicate shared parts across modules (common fasteners, bearings, connectors)
4. Mark purchased/COTS parts
5. Assign part numbers: {MODULE_PREFIX}-{SEQ}, assemblies use -ASY, purchased use -PUR

Process types: cnc, injection_molding, sheet_metal, 3d_print_fdm, 3d_print_sla, 3d_print_sls, casting, forging, machining, purchased_cots, other

Respond with ONLY valid JSON:
{
  "parts": [
    {
      "partNumber": "string",
      "name": "string",
      "sourceModuleId": "string (module id)",
      "process": "enum value",
      "isPurchased": boolean,
      "parentPartNumber": "string | null (assembly this belongs to)"
    }
  ],
  "bomLines": [
    { "parentPartNumber": "string | null", "childPartNumber": "string", "quantity": number }
  ]
}`

    const userPrompt = `Generate a BOM skeleton for "${truncate(project.subject, 200)}":\n\n${moduleDescriptions}${briefContext}\n\nReturn part names, hierarchy, and process types only. No material specs, costs, or dimensions.`

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) {
      return { success: false, error: "Anthropic API key not configured", parts: [], bomLines: [] }
    }

    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 0 })

    const response = await client.messages.create({
      model: BOM_MODEL,
      max_tokens: BOM_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    })

    const textBlock = response.content.find((b) => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      return { success: false, error: "No text response from Claude", parts: [], bomLines: [] }
    }

    const jsonStr = extractJson(textBlock.text)
    const parsed = tryParseJsonWithRepair<{
      parts: Array<Record<string, unknown>>
      bomLines: Array<Record<string, unknown>>
    }>(jsonStr)

    if (!parsed) {
      console.error("[skeletonBom] Failed to parse AI response (even with repair):", jsonStr.slice(0, 200))
      return { success: false, error: "Failed to parse skeleton response", parts: [], bomLines: [] }
    }

    if (!Array.isArray(parsed.parts) || !parsed.parts.length) {
      return { success: false, error: "No parts in skeleton", parts: [], bomLines: [] }
    }

    // Validate skeleton parts
    const skeletonParts: SkeletonPart[] = parsed.parts.map((p) => ({
      partNumber: truncate(String(p.partNumber ?? ""), 50),
      name: truncate(String(p.name ?? ""), 200),
      sourceModuleId: truncate(String(p.sourceModuleId ?? ""), 50),
      process: validateProcess(p.process) ?? "other",
      isPurchased: Boolean(p.isPurchased),
      parentPartNumber: p.parentPartNumber ? truncate(String(p.parentPartNumber), 50) : null,
    }))

    // Check for duplicate part numbers
    const partNumbers = new Set<string>()
    for (const p of skeletonParts) {
      if (!p.partNumber) {
        return { success: false, error: "Skeleton part missing part number", parts: [], bomLines: [] }
      }
      if (partNumbers.has(p.partNumber)) {
        return { success: false, error: `Duplicate skeleton part: ${p.partNumber}`, parts: [], bomLines: [] }
      }
      partNumbers.add(p.partNumber)
    }

    const bomLines = (parsed.bomLines ?? []).map((bl) => ({
      parentPartNumber: bl.parentPartNumber ? truncate(String(bl.parentPartNumber), 50) : null,
      childPartNumber: truncate(String(bl.childPartNumber ?? ""), 50),
      quantity: typeof bl.quantity === "number" && bl.quantity > 0 ? Math.round(bl.quantity) : 1,
    }))

    return { success: true, parts: skeletonParts, bomLines }
  })
}

// ─── Progressive BOM: Phase 2 — Expand Specs ───────────────────────

/**
 * Phase 2 of progressive BOM generation: expands skeleton parts with
 * full specifications (material, finish, tolerance, mass, dimensions, cost).
 *
 * @description Takes the full skeleton for context and returns expanded spec
 * fields keyed by partNumber. One call for all parts since BOM parts are
 * interdependent (shared fasteners, deduplication).
 */
export async function expandBomParts(
  skeletonParts: SkeletonPart[],
  modules: CadLabModule[],
  designBrief?: CadLabDesignBrief,
  diagnosticAnswers?: DiagnosticAnswers,
): Promise<BomExpansionResult> {
  return withAIGate('bom', async () => {
    if (!skeletonParts.length) {
      return { success: false, error: "No skeleton parts to expand", expansions: {} }
    }

    const briefContext = designBrief
      ? `\nDesign Brief: use case="${truncate(designBrief.useCase, 200)}", process="${truncate(designBrief.targetProcess, 100)}", material="${truncate(designBrief.targetMaterial, 100)}", tolerance="${truncate(designBrief.toleranceTarget, 100)}", quantity="${truncate(designBrief.quantityTarget, 100)}"`
      : ""

    // Include module context for material/process reasoning
    const moduleContext = modules.map((m) => {
      const diagInfo = diagnosticAnswers?.[m.id]
        ? ` | Diagnostics: ${JSON.stringify(diagnosticAnswers[m.id])}`
        : ""
      return `- ${truncate(m.name, 100)}: ${truncate(m.purpose, 200)}${diagInfo}`
    }).join("\n")

    // INTENT: Fetch real catalogue for purchased part cost grounding
    const allKeyParts = modules.flatMap((m) => m.keyParts)
    const domain = detectDomainFromKeyParts(allKeyParts)
    const keywords = await extractSearchKeywords(modules)
    const catalogueRef = await fetchCatalogueForPrompt(domain, keywords)

    const skeletonSummary = skeletonParts.map((p) =>
      `- ${p.partNumber}: "${p.name}" (${p.process}, ${p.isPurchased ? "purchased" : "manufactured"}, module: ${p.sourceModuleId})`
    ).join("\n")

    const systemPrompt = `You are a manufacturing engineer adding detailed specifications to a BOM skeleton.
${catalogueRef ? `
REAL COMPONENT CATALOGUE — USE FOR PURCHASED PARTS:
${catalogueRef}

For purchased/COTS parts: use exact manufacturer, MPN, and catalogue price if match exists.
` : ""}
For each part number in the skeleton, provide:
- description: 1-2 sentence functional description
- material: material name (e.g. "6061 Aluminium", "PLA", "304 Stainless Steel")
- materialSpec: material specification (e.g. "6061-T6", "ABS CF", "AISI 304")
- finish: surface finish (e.g. "Anodized", "As-printed", "Zinc plated")
- tolerance: dimensional tolerance (e.g. "±0.1mm", "±0.5mm")
- massKg: estimated mass in kg (>= 0)
- envelopeXMm, envelopeYMm, envelopeZMm: bounding envelope in mm (>= 0)
- estimatedUnitCostGbp: unit cost in GBP (>= 0)
- aiConfidence: 0-1 confidence in estimates

Respond with ONLY valid JSON:
{
  "expansions": {
    "PART-NUMBER": {
      "description": "...", "material": "...", "materialSpec": "...",
      "finish": "...", "tolerance": "...", "massKg": 0.0,
      "envelopeXMm": 0, "envelopeYMm": 0, "envelopeZMm": 0,
      "estimatedUnitCostGbp": 0.0, "aiConfidence": 0.0
    }
  }
}`

    const userPrompt = `Expand these skeleton parts with full manufacturing specifications:

${skeletonSummary}

Module context:
${moduleContext}${briefContext}

Add material, specs, dimensions, mass, cost, and confidence for every part.`

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) {
      return { success: false, error: "Anthropic API key not configured", expansions: {} }
    }

    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey, timeout: 240_000, maxRetries: 0 })

    const response = await client.messages.create({
      model: BOM_MODEL,
      max_tokens: BOM_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    })

    const textBlock = response.content.find((b) => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      return { success: false, error: "No text response from Claude", expansions: {} }
    }

    const jsonStr = extractJson(textBlock.text)
    const parsed = tryParseJsonWithRepair<{
      expansions: Record<string, Record<string, unknown>>
    }>(jsonStr)

    if (!parsed) {
      console.error("[expandBomParts] Failed to parse AI response (even with repair):", jsonStr.slice(0, 200))
      return { success: false, error: "Failed to parse expansion response", expansions: {} }
    }

    if (!parsed.expansions || typeof parsed.expansions !== "object") {
      return { success: false, error: "No expansions in response", expansions: {} }
    }

    // Validate and sanitize each expansion
    const expansions: BomExpansionResult["expansions"] = {}
    for (const [partNumber, raw] of Object.entries(parsed.expansions)) {
      expansions[partNumber] = {
        description: truncate(String(raw.description ?? ""), 500),
        material: truncate(String(raw.material ?? ""), 200),
        materialSpec: truncate(String(raw.materialSpec ?? ""), 200),
        finish: truncate(String(raw.finish ?? ""), 200),
        tolerance: truncate(String(raw.tolerance ?? ""), 100),
        massKg: clampPositive(raw.massKg) ?? 0,
        envelopeXMm: clampPositive(raw.envelopeXMm) ?? 0,
        envelopeYMm: clampPositive(raw.envelopeYMm) ?? 0,
        envelopeZMm: clampPositive(raw.envelopeZMm) ?? 0,
        estimatedUnitCostGbp: clampPositive(raw.estimatedUnitCostGbp) ?? 0,
        aiConfidence: typeof raw.aiConfidence === "number"
          ? Math.max(0, Math.min(1, raw.aiConfidence))
          : 0.5,
      }
    }

    return { success: true, expansions }
  })
}

// ─── AI BOM Generation (progressive two-phase with batched expansion) ─────

/**
 * Internal: expand a single batch of skeleton parts into full specs.
 *
 * @description Identical prompt structure to `expandBomParts` but operates on
 * a subset. Used by `generateBomFromModules` to fan out expansion with
 * concurrency so a 45-part BOM is split into 3 parallel 15-part calls rather
 * than one 45-part call that truncates at 8192 tokens.
 *
 * Takes pre-built prompt context so callers can share catalogue/brief across
 * batches (fetching the catalogue 3× would be wasteful and non-deterministic).
 */
async function expandBomPartsBatchInternal(params: {
  apiKey: string
  batchParts: SkeletonPart[]
  moduleContext: string
  briefContext: string
  catalogueRef: string
}): Promise<{
  success: boolean
  error?: string
  expansions: BomExpansionResult["expansions"]
}> {
  const { apiKey, batchParts, moduleContext, briefContext, catalogueRef } = params

  const skeletonSummary = batchParts.map((p) =>
    `- ${p.partNumber}: "${p.name}" (${p.process}, ${p.isPurchased ? "purchased" : "manufactured"}, module: ${p.sourceModuleId})`
  ).join("\n")

  const systemPrompt = `You are a manufacturing engineer adding detailed specifications to a BOM skeleton.
${catalogueRef ? `
REAL COMPONENT CATALOGUE — USE FOR PURCHASED PARTS:
${catalogueRef}

For purchased/COTS parts: use exact manufacturer, MPN, and catalogue price if match exists.
` : ""}
For each part number in the skeleton, provide:
- description: 1-2 sentence functional description
- material: material name (e.g. "6061 Aluminium", "PLA", "304 Stainless Steel")
- materialSpec: material specification (e.g. "6061-T6", "ABS CF", "AISI 304")
- finish: surface finish (e.g. "Anodized", "As-printed", "Zinc plated")
- tolerance: dimensional tolerance (e.g. "±0.1mm", "±0.5mm")
- massKg: estimated mass in kg (>= 0)
- envelopeXMm, envelopeYMm, envelopeZMm: bounding envelope in mm (>= 0)
- estimatedUnitCostGbp: unit cost in GBP (>= 0)
- aiConfidence: 0-1 confidence in estimates

Respond with ONLY valid JSON:
{
  "expansions": {
    "PART-NUMBER": {
      "description": "...", "material": "...", "materialSpec": "...",
      "finish": "...", "tolerance": "...", "massKg": 0.0,
      "envelopeXMm": 0, "envelopeYMm": 0, "envelopeZMm": 0,
      "estimatedUnitCostGbp": 0.0, "aiConfidence": 0.0
    }
  }
}`

  const userPrompt = `Expand these skeleton parts with full manufacturing specifications:

${skeletonSummary}

Module context:
${moduleContext}${briefContext}

Add material, specs, dimensions, mass, cost, and confidence for every part.`

  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 0 })

  let response
  try {
    response = await client.messages.create({
      model: BOM_MODEL,
      max_tokens: BOM_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    })
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Anthropic request failed",
      expansions: {},
    }
  }

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    return { success: false, error: "No text response from Claude", expansions: {} }
  }

  const jsonStr = extractJson(textBlock.text)
  const parsed = tryParseJsonWithRepair<{
    expansions: Record<string, Record<string, unknown>>
  }>(jsonStr)

  if (!parsed || !parsed.expansions || typeof parsed.expansions !== "object") {
    console.error(
      "[expandBomPartsBatchInternal] Failed to parse (even with repair):",
      jsonStr.slice(0, 200),
    )
    return { success: false, error: "Failed to parse expansion response", expansions: {} }
  }

  // Validate + sanitize each expansion identically to expandBomParts.
  const expansions: BomExpansionResult["expansions"] = {}
  for (const [partNumber, raw] of Object.entries(parsed.expansions)) {
    expansions[partNumber] = {
      description: truncate(String(raw.description ?? ""), 500),
      material: truncate(String(raw.material ?? ""), 200),
      materialSpec: truncate(String(raw.materialSpec ?? ""), 200),
      finish: truncate(String(raw.finish ?? ""), 200),
      tolerance: truncate(String(raw.tolerance ?? ""), 100),
      massKg: clampPositive(raw.massKg) ?? 0,
      envelopeXMm: clampPositive(raw.envelopeXMm) ?? 0,
      envelopeYMm: clampPositive(raw.envelopeYMm) ?? 0,
      envelopeZMm: clampPositive(raw.envelopeZMm) ?? 0,
      estimatedUnitCostGbp: clampPositive(raw.estimatedUnitCostGbp) ?? 0,
      aiConfidence: typeof raw.aiConfidence === "number"
        ? Math.max(0, Math.min(1, raw.aiConfidence))
        : 0.5,
    }
  }

  return { success: true, expansions }
}

/**
 * Generate a structured BOM from CAD Lab modules using Claude.
 *
 * @description Progressive two-phase flow with batched expansion:
 *   Phase 1: `skeletonBom` — fast ~10s call returning part names + hierarchy
 *            (max_tokens 2048, cheap to retry, unlikely to truncate).
 *   Phase 2: Split skeleton parts into batches of up to EXPAND_BATCH_SIZE (15)
 *            and fan out up to EXPAND_CONCURRENCY (3) in parallel. Each batch
 *            returns full specs for its subset.
 *   Phase 3: Merge skeleton + expansions into validated parts; save to DB.
 *
 * ROOT CAUSE this replaces: the prior monolithic implementation made ONE
 * Claude call to expand all modules' keyParts into structured parts with
 * full specs. For a 9-module project with ~45 parts, the response exceeded
 * the 8192 max_tokens cap and truncated mid-JSON, producing
 * `"Failed to parse BOM generation response"` at 84s. Concurrent-serial
 * generation on Opus also wall-clocked 226s+, which burns Vercel's 300s cap.
 *
 * Partial-success recovery: if SOME batches fail expansion, parts for those
 * batches are still saved with skeleton-only data (process + isPurchased
 * known; specs blank with aiConfidence=0). The run reports success; the UI
 * shows the expanded parts normally and the unexpanded parts as
 * "specs pending" — same pattern as `run-max-decomposition.ts`.
 *
 * SECURITY: AI response is parsed and validated BEFORE any existing data is
 * deleted, preventing data loss from malformed responses. Delete errors are
 * checked explicitly. If the insert fails after delete, old data is already
 * gone (accepted trade-off vs. transaction complexity).
 *
 * @param projectId - The cad_lab_project ID
 * @param modules - Array of CAD Lab modules with keyParts
 * @param designBrief - Optional design brief for material/process context
 * @param diagnosticAnswers - Optional diagnostic answers for spec refinement
 * @returns BomGenerationResult with parts and BOM lines
 */
export async function generateBomFromModules(
  projectId: string,
  modules: CadLabModule[],
  designBrief?: CadLabDesignBrief,
  diagnosticAnswers?: DiagnosticAnswers,
): Promise<BomGenerationResult | { error: string }> {
  // NOTE: skeletonBom + the internal batch expansion calls already wrap
  // themselves in withAIGate. We use withAIGate here only for the
  // orchestration shell to ensure limit enforcement and obtain the shared
  // supabase client for the delete + insert persistence phase.
  return withAIGate('bom', async ({ supabase }) => {
    const start = Date.now()

    if (!modules.length) {
      return { success: false, error: "No modules to generate BOM from" }
    }

    // INTENT: Verify the project exists and belongs to this foundry (RLS handles this)
    const { data: project, error: projErr } = await supabase
      .from("cad_lab_projects")
      .select("id, subject")
      .eq("id", projectId)
      .single()

    if (projErr || !project) {
      return { success: false, error: "Project not found" }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) {
      return { success: false, error: "Anthropic API key not configured" }
    }

    // ── Phase 1: Skeleton ──
    // Fast call (~10s) returning part names, hierarchy, process, isPurchased.
    // If skeleton itself fails the whole run fails — there's no useful fallback.
    const skeleton = await skeletonBom(projectId, modules, designBrief, diagnosticAnswers)
    if (!skeleton.success || !skeleton.parts.length) {
      return {
        success: false,
        error: skeleton.error ?? "Failed to generate BOM skeleton",
      }
    }

    // ── Phase 2: Batched expansion ──
    // Build shared prompt context once (catalogue fetch is expensive and
    // deterministic across batches).
    const briefContext = designBrief
      ? `\nDesign Brief: use case="${truncate(designBrief.useCase, 200)}", process="${truncate(designBrief.targetProcess, 100)}", material="${truncate(designBrief.targetMaterial, 100)}", tolerance="${truncate(designBrief.toleranceTarget, 100)}", quantity="${truncate(designBrief.quantityTarget, 100)}"`
      : ""

    const moduleContext = modules.map((m) => {
      const diagInfo = diagnosticAnswers?.[m.id]
        ? ` | Diagnostics: ${JSON.stringify(diagnosticAnswers[m.id])}`
        : ""
      return `- ${truncate(m.name, 100)}: ${truncate(m.purpose, 200)}${diagInfo}`
    }).join("\n")

    const allKeyParts = modules.flatMap((m) => m.keyParts)
    const domain = detectDomainFromKeyParts(allKeyParts)
    const keywords = await extractSearchKeywords(modules)
    const catalogueRef = await fetchCatalogueForPrompt(domain, keywords)

    const batches = chunkArray(skeleton.parts, EXPAND_BATCH_SIZE)
    const batchResults = await runWithConcurrency(
      batches,
      EXPAND_CONCURRENCY,
      (batch) => expandBomPartsBatchInternal({
        apiKey,
        batchParts: batch,
        moduleContext,
        briefContext,
        catalogueRef,
      }),
    )

    // Merge all successful expansions. Failed batches leave their parts
    // without expansions — filled with skeleton-only defaults below.
    const mergedExpansions: BomExpansionResult["expansions"] = {}
    let failedBatchCount = 0
    for (const result of batchResults) {
      if (result.success) {
        Object.assign(mergedExpansions, result.expansions)
      } else {
        failedBatchCount += 1
      }
    }

    // If EVERY batch failed, the run isn't recoverable. Return the first
    // error so the pipeline_run gets a useful message.
    if (failedBatchCount === batchResults.length && batchResults.length > 0) {
      const firstErr = batchResults.find((r) => !r.success)?.error
      return {
        success: false,
        error: firstErr ?? "Failed to parse BOM generation response",
      }
    }

    // ── Phase 3: Merge skeleton + expansions → validated parts ──
    // Every skeleton part gets a row. If its expansion is missing (batch
    // failed), we save with skeleton-only fields and aiConfidence=0 so the
    // UI can show a "specs pending" hint.
    const validatedParts = skeleton.parts.map((s) => {
      const exp = mergedExpansions[s.partNumber]
      return {
        partNumber: s.partNumber,
        name: s.name,
        description: exp?.description ? truncate(exp.description, 500) : null,
        sourceModuleId: s.sourceModuleId || null,
        process: validateProcess(s.process),
        material: exp?.material ? truncate(exp.material, 200) : null,
        materialSpec: exp?.materialSpec ? truncate(exp.materialSpec, 200) : null,
        finish: exp?.finish ? truncate(exp.finish, 200) : null,
        tolerance: exp?.tolerance ? truncate(exp.tolerance, 100) : null,
        massKg: exp?.massKg ?? null,
        envelopeXMm: exp?.envelopeXMm ?? null,
        envelopeYMm: exp?.envelopeYMm ?? null,
        envelopeZMm: exp?.envelopeZMm ?? null,
        estimatedUnitCostGbp: exp?.estimatedUnitCostGbp ?? null,
        isPurchased: s.isPurchased,
        // If no expansion: aiConfidence=0 tells the UI "this part is
        // skeleton-only, needs a spec pass".
        aiConfidence: exp?.aiConfidence ?? 0,
      }
    })

    // Duplicate check — skeleton already guards this, but defence in depth.
    const partNumbers = new Set<string>()
    for (const p of validatedParts) {
      if (!p.partNumber) {
        return { success: false, error: "Skeleton returned a part without a part number" }
      }
      if (partNumbers.has(p.partNumber)) {
        return { success: false, error: `Duplicate part number: ${p.partNumber}` }
      }
      partNumbers.add(p.partNumber)
    }

    // ── NOW safe to delete existing data (response validated) ──

    const { error: bomDelErr } = await supabase
      .from("bom_lines")
      .delete()
      .eq("cad_lab_project_id", projectId)

    if (bomDelErr) {
      console.error("[generateBomFromModules] Failed to delete existing BOM lines:", bomDelErr)
      return { success: false, error: "Failed to clear existing BOM data" }
    }

    const { error: partsDelErr } = await supabase
      .from("parts")
      .delete()
      .eq("cad_lab_project_id", projectId)

    if (partsDelErr) {
      console.error("[generateBomFromModules] Failed to delete existing parts:", partsDelErr)
      return { success: false, error: "Failed to clear existing parts data" }
    }

    // ── Insert parts ──

    const partsToInsert = validatedParts.map((p) => ({
      cad_lab_project_id: projectId,
      part_number: p.partNumber,
      name: p.name,
      description: p.description,
      source_module_id: p.sourceModuleId,
      process: p.process,
      material: p.material,
      material_spec: p.materialSpec,
      finish: p.finish,
      tolerance: p.tolerance,
      mass_kg: p.massKg,
      envelope_x_mm: p.envelopeXMm,
      envelope_y_mm: p.envelopeYMm,
      envelope_z_mm: p.envelopeZMm,
      estimated_unit_cost_gbp: p.estimatedUnitCostGbp,
      ai_generated: true,
      ai_confidence: p.aiConfidence,
      is_purchased: p.isPurchased,
    }))

    const { data: insertedParts, error: insertErr } = await supabase
      .from("parts")
      .insert(partsToInsert)
      .select("id, part_number")

    if (insertErr || !insertedParts) {
      console.error("[generateBomFromModules] Failed to insert parts:", insertErr)
      return { success: false, error: "Failed to save parts to database" }
    }

    // Build part_number → id lookup
    const partNumberToId = new Map<string, string>()
    for (const p of insertedParts) {
      partNumberToId.set(p.part_number, p.id)
    }

    // ── Insert BOM lines (from skeleton hierarchy) ──

    let droppedLineCount = 0
    const bomLinesToInsert = skeleton.bomLines
      .map((bl, idx) => {
        const childPartNumber = bl.childPartNumber
        const parentPartNumber = bl.parentPartNumber
        const childId = partNumberToId.get(childPartNumber)
        const parentId = parentPartNumber ? partNumberToId.get(parentPartNumber) : null

        if (!childId) {
          droppedLineCount++
          console.warn(`[generateBomFromModules] Unknown child part: ${childPartNumber}`)
          return null
        }

        // SECURITY: Prevent self-referencing BOM lines
        if (parentId && parentId === childId) {
          droppedLineCount++
          console.warn(`[generateBomFromModules] Self-referencing BOM line dropped: ${childPartNumber}`)
          return null
        }

        return {
          cad_lab_project_id: projectId,
          parent_part_id: parentId ?? null,
          child_part_id: childId,
          quantity: bl.quantity,
          reference_designator: null as string | null,
          notes: null as string | null,
          sort_order: idx,
        }
      })
      .filter((bl): bl is NonNullable<typeof bl> => bl !== null)

    if (droppedLineCount > 0) {
      console.warn(`[generateBomFromModules] Dropped ${droppedLineCount} invalid BOM lines`)
    }

    if (bomLinesToInsert.length > 0) {
      const { error: bomInsertErr } = await supabase
        .from("bom_lines")
        .insert(bomLinesToInsert)

      if (bomInsertErr) {
        console.error("[generateBomFromModules] Failed to insert BOM lines:", bomInsertErr)
        // DECISION: Parts are already inserted. Return partial success rather
        // than leaving the user with parts but no hierarchy + a confusing error.
        return { success: false, error: "Parts saved but BOM hierarchy failed. Try regenerating." }
      }
    }

    // ── Return structured result ──

    const structuredParts: StructuredPart[] = validatedParts.map((p) => ({
      id: partNumberToId.get(p.partNumber),
      partNumber: p.partNumber,
      name: p.name,
      description: p.description ?? undefined,
      sourceModuleId: p.sourceModuleId ?? undefined,
      process: p.process ?? undefined,
      material: p.material ?? undefined,
      materialSpec: p.materialSpec ?? undefined,
      finish: p.finish ?? undefined,
      tolerance: p.tolerance ?? undefined,
      massKg: p.massKg ?? undefined,
      envelopeXMm: p.envelopeXMm ?? undefined,
      envelopeYMm: p.envelopeYMm ?? undefined,
      envelopeZMm: p.envelopeZMm ?? undefined,
      estimatedUnitCostGbp: p.estimatedUnitCostGbp ?? undefined,
      aiGenerated: true,
      aiConfidence: p.aiConfidence ?? undefined,
      isPurchased: p.isPurchased,
    }))

    return {
      success: true,
      parts: structuredParts,
      bomLines: bomLinesToInsert.map((bl) => ({
        cadLabProjectId: projectId,
        parentPartId: bl.parent_part_id,
        childPartId: bl.child_part_id,
        quantity: bl.quantity,
        referenceDesignator: bl.reference_designator ?? undefined,
        notes: bl.notes ?? undefined,
        sortOrder: bl.sort_order,
      })),
      generationTimeMs: Date.now() - start,
    } satisfies BomGenerationResult
  })
}

// ─── Load BOM ───────────────────────────────────────────────────────

/**
 * Load parts and BOM lines for a project and build the tree structure.
 *
 * @param projectId - The cad_lab_project ID
 * @returns Tree of BomTreeNode[] with rolled-up costs and mass
 */
export async function loadBom(
  projectId: string,
): Promise<{ tree: BomTreeNode[]; parts: StructuredPart[] } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    // Load parts
    const { data: rawParts, error: partsErr } = await supabase
      .from("parts")
      .select("*")
      .eq("cad_lab_project_id", projectId)
      .order("part_number")

    if (partsErr) {
      return { error: "Failed to load parts" }
    }

    if (!rawParts?.length) {
      return { tree: [], parts: [] }
    }

    // Load BOM lines
    const { data: rawLines, error: linesErr } = await supabase
      .from("bom_lines")
      .select("*")
      .eq("cad_lab_project_id", projectId)
      .order("sort_order")

    if (linesErr) {
      return { error: "Failed to load BOM lines" }
    }

    // Map DB rows to StructuredPart
    const parts: StructuredPart[] = rawParts.map((r) => ({
      id: r.id,
      partNumber: r.part_number,
      name: r.name,
      description: r.description ?? undefined,
      sourceModuleId: r.source_module_id ?? undefined,
      process: r.process ?? undefined,
      material: r.material ?? undefined,
      materialSpec: r.material_spec ?? undefined,
      finish: r.finish ?? undefined,
      tolerance: r.tolerance ?? undefined,
      massKg: r.mass_kg ?? undefined,
      envelopeXMm: r.envelope_x_mm ?? undefined,
      envelopeYMm: r.envelope_y_mm ?? undefined,
      envelopeZMm: r.envelope_z_mm ?? undefined,
      estimatedUnitCostGbp: r.estimated_unit_cost_gbp ?? undefined,
      stepUrl: r.step_url ?? undefined,
      stlUrl: r.stl_url ?? undefined,
      drawingUrl: r.drawing_url ?? undefined,
      aiGenerated: r.ai_generated,
      aiConfidence: r.ai_confidence ?? undefined,
      isPurchased: r.is_purchased,
    }))

    const partMap = new Map<string, StructuredPart>()
    for (const p of parts) {
      if (p.id) partMap.set(p.id, p)
    }

    // Map BOM lines
    const bomLines: BomLine[] = (rawLines ?? []).map((l) => ({
      id: l.id,
      cadLabProjectId: l.cad_lab_project_id,
      parentPartId: l.parent_part_id,
      childPartId: l.child_part_id,
      quantity: l.quantity,
      referenceDesignator: l.reference_designator ?? undefined,
      notes: l.notes ?? undefined,
      sortOrder: l.sort_order,
    }))

    // Build tree (with cycle protection)
    const tree = buildBomTree(parts, bomLines, partMap)

    return { tree, parts }
  })
}

/**
 * Build a hierarchical BomTreeNode[] from flat parts and BOM lines.
 * Includes cycle detection to prevent infinite recursion from corrupted data.
 */
function buildBomTree(
  parts: StructuredPart[],
  bomLines: BomLine[],
  partMap: Map<string, StructuredPart>,
): BomTreeNode[] {
  // Group lines by parent
  const childrenByParent = new Map<string | null, BomLine[]>()
  for (const line of bomLines) {
    const key = line.parentPartId ?? null
    const existing = childrenByParent.get(key) ?? []
    existing.push(line)
    childrenByParent.set(key, existing)
  }

  // Find all part IDs that appear as children
  const childIds = new Set(bomLines.map((l) => l.childPartId))

  // Root nodes: parts that have children but are never children themselves,
  // or parts referenced as parents in BOM lines
  const parentIds = new Set(bomLines.filter((l) => l.parentPartId).map((l) => l.parentPartId!))
  const rootParts = parts.filter((p) => p.id && parentIds.has(p.id) && !childIds.has(p.id))

  // If no hierarchy detected, treat top-level BOM lines (null parent) as roots
  if (rootParts.length === 0) {
    const topLines = childrenByParent.get(null) ?? []
    return topLines.map((line) => {
      const part = partMap.get(line.childPartId)
      if (!part) return null
      return buildNode(part, line, 0, childrenByParent, partMap, new Set())
    }).filter((n): n is BomTreeNode => n !== null)
  }

  return rootParts.map((part) =>
    buildNode(part, undefined, 0, childrenByParent, partMap, new Set())
  )
}

/**
 * Recursively build a tree node. Uses a visited set to detect cycles
 * and a max depth guard to prevent stack overflow.
 */
function buildNode(
  part: StructuredPart,
  bomLine: BomLine | undefined,
  depth: number,
  childrenByParent: Map<string | null, BomLine[]>,
  partMap: Map<string, StructuredPart>,
  visited: Set<string>,
): BomTreeNode {
  // SECURITY: Cycle detection — if we've already visited this part, stop recursing
  if (part.id && visited.has(part.id)) {
    console.warn(`[buildBomTree] Cycle detected at part ${part.partNumber} (${part.id}), stopping recursion`)
    return { part, bomLine, children: [], depth, totalCost: 0, totalMass: 0 }
  }

  // SECURITY: Depth guard — prevent stack overflow from deeply nested BOMs
  if (depth > MAX_BOM_DEPTH) {
    console.warn(`[buildBomTree] Max depth (${MAX_BOM_DEPTH}) exceeded at part ${part.partNumber}`)
    return { part, bomLine, children: [], depth, totalCost: 0, totalMass: 0 }
  }

  // Track this part as visited for this branch
  const branchVisited = new Set(visited)
  if (part.id) branchVisited.add(part.id)

  const childLines = part.id ? (childrenByParent.get(part.id) ?? []) : []
  const children = childLines
    .map((line) => {
      const childPart = partMap.get(line.childPartId)
      if (!childPart) return null
      return buildNode(childPart, line, depth + 1, childrenByParent, partMap, branchVisited)
    })
    .filter((n): n is BomTreeNode => n !== null)

  const qty = bomLine?.quantity ?? 1
  const ownCost = (part.estimatedUnitCostGbp ?? 0) * qty
  const ownMass = (part.massKg ?? 0) * qty
  const childCost = children.reduce((s, c) => s + c.totalCost, 0)
  const childMass = children.reduce((s, c) => s + c.totalMass, 0)

  return {
    part,
    bomLine,
    children,
    depth,
    totalCost: ownCost + childCost,
    totalMass: ownMass + childMass,
  }
}

// ─── CRUD Operations ────────────────────────────────────────────────

/**
 * Upsert a single part (create or update).
 *
 * @param projectId - The cad_lab_project ID
 * @param part - The part to save
 */
export async function savePart(
  projectId: string,
  part: StructuredPart,
): Promise<{ part: StructuredPart } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    const row = {
      cad_lab_project_id: projectId,
      part_number: part.partNumber,
      name: part.name,
      description: part.description || null,
      source_module_id: part.sourceModuleId || null,
      process: part.process || null,
      material: part.material || null,
      material_spec: part.materialSpec || null,
      finish: part.finish || null,
      tolerance: part.tolerance || null,
      mass_kg: part.massKg ?? null,
      envelope_x_mm: part.envelopeXMm ?? null,
      envelope_y_mm: part.envelopeYMm ?? null,
      envelope_z_mm: part.envelopeZMm ?? null,
      estimated_unit_cost_gbp: part.estimatedUnitCostGbp ?? null,
      step_url: part.stepUrl || null,
      stl_url: part.stlUrl || null,
      drawing_url: part.drawingUrl || null,
      ai_generated: part.aiGenerated ?? false,
      ai_confidence: part.aiConfidence ?? null,
      is_purchased: part.isPurchased ?? false,
    }

    if (part.id) {
      // SECURITY: Filter by both id AND cad_lab_project_id to prevent
      // cross-project part reassignment within the same foundry
      const { data, error } = await supabase
        .from("parts")
        .update(row)
        .eq("id", part.id)
        .eq("cad_lab_project_id", projectId)
        .select("id")
        .single()

      if (error) return { error: sanitizeErrorMessage(error) }
      return { part: { ...part, id: data.id } }
    } else {
      // Insert new part
      const { data, error } = await supabase
        .from("parts")
        .insert(row)
        .select("id")
        .single()

      if (error) return { error: sanitizeErrorMessage(error) }
      return { part: { ...part, id: data.id } }
    }
  })
}

/**
 * Upsert a single BOM line.
 *
 * @param projectId - The cad_lab_project ID
 * @param line - The BOM line to save
 */
export async function saveBomLine(
  projectId: string,
  line: BomLine,
): Promise<{ bomLine: BomLine } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    // SECURITY: Prevent self-referencing BOM lines
    if (line.parentPartId && line.parentPartId === line.childPartId) {
      return { error: "A part cannot be its own parent" }
    }

    const row = {
      cad_lab_project_id: projectId,
      parent_part_id: line.parentPartId ?? null,
      child_part_id: line.childPartId,
      quantity: line.quantity,
      reference_designator: line.referenceDesignator || null,
      notes: line.notes || null,
      sort_order: line.sortOrder ?? 0,
    }

    if (line.id) {
      const { data, error } = await supabase
        .from("bom_lines")
        .update(row)
        .eq("id", line.id)
        .eq("cad_lab_project_id", projectId)
        .select("id")
        .single()

      if (error) return { error: sanitizeErrorMessage(error) }
      return { bomLine: { ...line, id: data.id } }
    } else {
      const { data, error } = await supabase
        .from("bom_lines")
        .insert(row)
        .select("id")
        .single()

      if (error) return { error: sanitizeErrorMessage(error) }
      return { bomLine: { ...line, id: data.id } }
    }
  })
}

/**
 * Delete a part and its associated BOM lines (cascade).
 *
 * @param partId - The part ID to delete
 */
export async function deletePart(
  partId: string,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase
      .from("parts")
      .delete()
      .eq("id", partId)

    if (error) return { error: sanitizeErrorMessage(error) }
    return { success: true }
  })
}

/**
 * Delete a single BOM line.
 *
 * @param bomLineId - The BOM line ID to delete
 */
export async function deleteBomLine(
  bomLineId: string,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase
      .from("bom_lines")
      .delete()
      .eq("id", bomLineId)

    if (error) return { error: sanitizeErrorMessage(error) }
    return { success: true }
  })
}
