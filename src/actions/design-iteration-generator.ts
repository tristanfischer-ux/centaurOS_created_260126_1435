/**
 * @file design-iteration-generator.ts — LLM actions that produce design alternatives.
 *
 * @description Phase II of the design-iteration system. One action per trigger
 * type. Each returns 1-3 concrete alternatives with the shape defined in
 * design-iterations.ts::DesignAlternative. Alternatives reference the
 * triggering concern verbatim, name labelled trade-offs, and one is marked
 * Recommended (per Round 1 of the red-team plan).
 *
 * Prior-rejected alternatives (from design_iterations history) are fed into
 * the prompt with a "do not re-propose unless new evidence" instruction —
 * Round 5 convergence requirement.
 *
 * @related
 * - Phase I: src/actions/design-iterations.ts
 * - Plan: tasks/DESIGN-ITERATION-PHASE-PLAN.md
 */

"use server"

import { withAIGate } from "@/lib/ai/with-ai-gate"
import { createClient } from "@/lib/supabase/server"
import { isValidUUID } from "@/lib/validations"
import type { DesignAlternative } from "@/actions/design-iterations"

// Use the latest Opus for reasoning quality on design trade-offs.
const GENERATOR_MODEL = "claude-opus-4-7"
const GENERATOR_MAX_TOKENS = 4096
const GENERATOR_TIMEOUT_MS = 240_000

// ─── Shared types ────────────────────────────────────────────────

export interface GenerateAlternativesResult {
  alternatives: DesignAlternative[]
  /** Returned when the LLM produced no valid alternatives after retry */
  error?: string
}

// ─── Infeasibility path ──────────────────────────────────────────

export interface InfeasibilityRequest {
  projectId: string
  /** The specialist concern that triggered this iteration */
  concernText: string
  /** Specialist IDs that flagged the infeasibility (e.g. ["vp-manufacturing"]) */
  flaggingSpecialists: string[]
}

/**
 * Generate 3 design-level alternatives addressing a specialist-flagged
 * infeasibility. Changes operate on the top-level project / research report,
 * not on individual module text.
 */
export async function generateInfeasibilityAlternatives(
  req: InfeasibilityRequest,
): Promise<GenerateAlternativesResult> {
  if (!isValidUUID(req.projectId)) return { alternatives: [], error: "Invalid project ID" }

  return withAIGate('cad_lab_review', async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) return { alternatives: [], error: "Anthropic API key not configured" }

    const supabase = await createClient()
    const [project, priorRejections] = await Promise.all([
      loadProjectContext(req.projectId, supabase),
      loadPriorRejections(req.projectId, supabase),
    ])
    if (!project) return { alternatives: [], error: "Project not found" }

    const systemPrompt = `You are a senior hardware design reviewer proposing concrete alternatives when a specialist has flagged that the current design cannot be built as specified.

Hard rules on what counts as a valid alternative:
- Each alternative must address the SPECIFIC concern quoted below — not the general problem space.
- Each alternative must name 3-5 labelled trade-off dimensions (mass, power, cost, complexity, schedule, risk).
- Changes must target top-level research fields (wingspan, mass budget, power budget, payload) OR structural decomposition (add/remove/split modules) — NOT module text re-wording.
- One alternative must be marked recommended=true. Pick the one that best balances engineering soundness + cost + schedule.
- Include a plain_english line: one sentence a non-engineer founder would understand.
- If an alternative changes export-control posture or removes features, set severity.exportControls / severity.featureDescope to true.

Output contract (STRICT):
- Respond with ONLY a single JSON object. No markdown fences. No preamble.
- Your first character MUST be { and your last character MUST be }.
- Shape: { alternatives: [{ headline, rationale, plainEnglish, changes, tradeOffs: [{dimension, delta}], confidence: "low"|"medium"|"high", severity: {exportControls?, featureDescope?, supplyCommitmentBreak?}, recommended }, ...] }
- 1 to 3 alternatives.`

    const priorRejectionsBlock = priorRejections.length > 0
      ? `\n\nPreviously rejected alternatives on this project (do NOT re-propose these unless you can cite new evidence from the concern below):\n${priorRejections.slice(0, 8).map((r) => `- ${r}`).join("\n")}`
      : ""

    const userPrompt = `Project: "${project.subject}"

Current research snapshot (first 2500 chars):
${project.research.slice(0, 2500)}

Current module decomposition (names only):
${project.moduleNames.join(", ")}

SPECIALIST CONCERN THAT TRIGGERED THIS ITERATION:
"${req.concernText}"

Flagged by: ${req.flaggingSpecialists.join(", ")}
${priorRejectionsBlock}

Propose up to 3 structural design alternatives that would make this project buildable. Return the JSON object now.`

    const parsed = await callGeneratorWithRetry(apiKey, systemPrompt, userPrompt)
    if (!parsed) return { alternatives: [], error: "Could not generate valid alternatives after retry. Try again or edit the research report manually." }
    return { alternatives: normaliseAlternatives(parsed) }
  })
}

// ─── Cost-reduction path ─────────────────────────────────────────

export interface CostReductionRequest {
  projectId: string
  /** Current estimated unit cost in GBP (or null if unknown) */
  currentUnitCostGbp: number | null
  /** Founder-set target */
  targetUnitCostGbp: number
  /** Cost breakdown per module (optional; helps the generator target the biggest items) */
  moduleCostBreakdown?: Array<{ moduleId: string; moduleName: string; costGbp: number }>
  /** Founder-picked path ("material" | "process" | "volume" | "spec" | "all") */
  pathFilter?: "material" | "process" | "volume" | "spec" | "all"
}

/**
 * Generate cost-reduction alternatives grouped by path type. Each alternative
 * states which module(s) it affects, delta per unit, tooling NRE delta, and
 * break-even volume.
 */
export async function generateCostReductionAlternatives(
  req: CostReductionRequest,
): Promise<GenerateAlternativesResult> {
  if (!isValidUUID(req.projectId)) return { alternatives: [], error: "Invalid project ID" }
  if (!(req.targetUnitCostGbp > 0)) return { alternatives: [], error: "Target unit cost must be > 0" }

  return withAIGate('cad_lab_review', async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) return { alternatives: [], error: "Anthropic API key not configured" }

    const supabase = await createClient()
    const [project, priorRejections] = await Promise.all([
      loadProjectContext(req.projectId, supabase),
      loadPriorRejections(req.projectId, supabase),
    ])
    if (!project) return { alternatives: [], error: "Project not found" }

    const pathFilter = req.pathFilter ?? "all"
    const costWaterfall = (req.moduleCostBreakdown ?? [])
      .slice()
      .sort((a, b) => b.costGbp - a.costGbp)
      .slice(0, 8)
      .map((m) => `- ${m.moduleName}: £${m.costGbp.toFixed(0)}`)
      .join("\n")

    const systemPrompt = `You are a cost-engineering reviewer proposing ways to reduce per-unit cost on a hardware project while preserving product features.

Hard rules:
- Alternatives MUST preserve feature scope unless severity.featureDescope is explicitly set (requires founder opt-in).
- Cost paths: material_substitution, process_change, volume_aggregation, spec_relaxation. ${pathFilter === "all" ? "Mix freely." : `Restrict to: ${pathFilter}.`}
- Each alternative changes object MUST include: unit_cost_delta_gbp (negative = reduction), tooling_nre_delta_gbp, moq_at_new_path, break_even_units, affected_module_ids (array).
- trade_offs MUST include dimensions: cost, complexity, schedule, risk, plus any other relevant (e.g. "sustainability" if changing material).
- Do NOT propose a cost-down that requires a supplier with a higher MOQ than the founder's pilot volume unless you flag severity.supplyCommitmentBreak or the alternative explicitly increases volume.
- One alternative recommended=true — the best balance of savings + NRE + risk.

Output contract (STRICT): single JSON object, first char { last char }. Shape:
{ alternatives: [{ headline, rationale, plainEnglish, changes: { unit_cost_delta_gbp, tooling_nre_delta_gbp, moq_at_new_path, break_even_units, affected_module_ids, path_type, details }, tradeOffs, confidence, severity, recommended }] }`

    const priorRejectionsBlock = priorRejections.length > 0
      ? `\n\nPrior rejected alternatives (do not repeat unless new evidence):\n${priorRejections.slice(0, 8).map((r) => `- ${r}`).join("\n")}`
      : ""

    const userPrompt = `Project: "${project.subject}"

Current unit cost (GBP): ${req.currentUnitCostGbp ?? "unknown"}
Target unit cost (GBP): ${req.targetUnitCostGbp}
Gap to close: ${req.currentUnitCostGbp != null ? `£${(req.currentUnitCostGbp - req.targetUnitCostGbp).toFixed(0)}` : "unknown — propose the highest-impact paths"}

Cost waterfall (top modules by cost):
${costWaterfall || "(not provided)"}

Research snapshot (first 1500 chars):
${project.research.slice(0, 1500)}

Module decomposition: ${project.moduleNames.join(", ")}
${priorRejectionsBlock}

Propose up to 3 cost-reduction alternatives. Return the JSON object now.`

    const parsed = await callGeneratorWithRetry(apiKey, systemPrompt, userPrompt)
    if (!parsed) return { alternatives: [], error: "Could not generate valid cost alternatives after retry." }
    return { alternatives: normaliseAlternatives(parsed) }
  })
}

// ─── Manual reconsideration path ─────────────────────────────────

export interface ManualReconsiderRequest {
  projectId: string
  /** Founder's free-text description of what they want to reconsider */
  concernText: string
}

export async function generateManualAlternatives(
  req: ManualReconsiderRequest,
): Promise<GenerateAlternativesResult> {
  if (!isValidUUID(req.projectId)) return { alternatives: [], error: "Invalid project ID" }
  if (!req.concernText?.trim() || req.concernText.length < 20) {
    return { alternatives: [], error: "Tell us what you want to reconsider (at least 20 chars)" }
  }

  return withAIGate('cad_lab_review', async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) return { alternatives: [], error: "Anthropic API key not configured" }

    const supabase = await createClient()
    const [project, priorRejections] = await Promise.all([
      loadProjectContext(req.projectId, supabase),
      loadPriorRejections(req.projectId, supabase),
    ])
    if (!project) return { alternatives: [], error: "Project not found" }

    const systemPrompt = `You are helping a hardware founder consider alternatives to a design decision they want to revisit. Propose 1-3 concrete, actionable alternatives addressing their question.

Hard rules:
- Alternatives must be concrete — not "consider X" but "do X by changing Y to Z".
- Each references the founder's question explicitly.
- plainEnglish mandatory — one sentence a non-engineer would understand.
- Trade-offs labelled (3-5 dimensions).
- One recommended=true.

Output contract (STRICT): single JSON object { alternatives: [...] }. First char {, last char }.`

    const priorRejectionsBlock = priorRejections.length > 0
      ? `\n\nPrior rejected alternatives: ${priorRejections.slice(0, 6).join("; ")}`
      : ""

    const userPrompt = `Project: "${project.subject}"
Research (first 1500 chars): ${project.research.slice(0, 1500)}
Module decomposition: ${project.moduleNames.join(", ")}

Founder wants to reconsider: "${req.concernText}"
${priorRejectionsBlock}

Return the JSON object now.`

    const parsed = await callGeneratorWithRetry(apiKey, systemPrompt, userPrompt)
    if (!parsed) return { alternatives: [], error: "Could not generate alternatives — try rephrasing the question." }
    return { alternatives: normaliseAlternatives(parsed) }
  })
}

// ─── Shared generator shell ──────────────────────────────────────

interface RawParsed {
  alternatives?: Array<Record<string, unknown>>
}

/**
 * Call Claude once, retry once with a sharper nudge if the response doesn't
 * parse or doesn't match shape.
 */
async function callGeneratorWithRetry(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<RawParsed | null> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey, timeout: GENERATOR_TIMEOUT_MS, maxRetries: 0 })

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const hint = attempt === 0
        ? ""
        : "\n\nIMPORTANT: Your previous response was not valid JSON matching the required shape. Return ONLY the JSON object this time, starting with { and ending with }. No prose."
      const response = await client.messages.create({
        model: GENERATOR_MODEL,
        max_tokens: GENERATOR_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt + hint }],
      })

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")

      const parsed = extractAndParseJson(text)
      if (parsed && Array.isArray(parsed.alternatives) && parsed.alternatives.length > 0) {
        return parsed
      }
      console.warn(`[design-iteration-generator] Attempt ${attempt + 1}: invalid/empty alternatives`)
    } catch (err) {
      console.warn(`[design-iteration-generator] Attempt ${attempt + 1} errored:`, err instanceof Error ? err.message : err)
    }
  }
  return null
}

function extractAndParseJson(text: string): RawParsed | null {
  const start = text.indexOf("{")
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escaped) { escaped = false; continue }
    if (ch === "\\") { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === "{") depth++
    if (ch === "}") {
      depth--
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)) as RawParsed }
        catch { return null }
      }
    }
  }
  return null
}

/** Coerce/default fields + cap at 3 + ensure exactly one recommended. */
function normaliseAlternatives(raw: RawParsed): DesignAlternative[] {
  const arr = (raw.alternatives ?? []).slice(0, 3)
  const normalised: DesignAlternative[] = arr.map((a) => ({
    headline: String(a.headline ?? "Alternative"),
    rationale: String(a.rationale ?? ""),
    plainEnglish: String(a.plainEnglish ?? a.plain_english ?? ""),
    changes: (a.changes as Record<string, unknown>) ?? {},
    tradeOffs: Array.isArray(a.tradeOffs)
      ? (a.tradeOffs as unknown[]).map((t) => ({
          dimension: String((t as Record<string, unknown>).dimension ?? "misc"),
          delta: String((t as Record<string, unknown>).delta ?? ""),
        }))
      : Array.isArray(a.trade_offs)
        ? (a.trade_offs as unknown[]).map((t) => ({
            dimension: String((t as Record<string, unknown>).dimension ?? "misc"),
            delta: String((t as Record<string, unknown>).delta ?? ""),
          }))
        : [],
    confidence: (["low", "medium", "high"].includes(String(a.confidence)) ? a.confidence : "medium") as "low" | "medium" | "high",
    severity: (a.severity as DesignAlternative["severity"]) ?? {},
    recommended: Boolean(a.recommended),
  }))

  // Ensure exactly one recommended
  if (normalised.length > 0 && !normalised.some((a) => a.recommended)) {
    normalised[0].recommended = true
  } else if (normalised.filter((a) => a.recommended).length > 1) {
    let seen = false
    for (const a of normalised) {
      if (a.recommended && seen) a.recommended = false
      if (a.recommended) seen = true
    }
  }
  return normalised
}

// ─── Project-context loaders ─────────────────────────────────────

interface ProjectContext {
  subject: string
  research: string
  moduleNames: string[]
}

async function loadProjectContext(
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<ProjectContext | null> {
  const { data } = await supabase
    .from("cad_lab_projects")
    .select("subject, research, modules")
    .eq("id", projectId)
    .maybeSingle()
  if (!data) return null
  const research = typeof data.research === "string"
    ? data.research
    : JSON.stringify(data.research ?? {})
  const modules = Array.isArray(data.modules) ? (data.modules as Array<{ name?: string }>) : []
  return {
    subject: data.subject ?? "",
    research,
    moduleNames: modules.map((m) => m.name ?? "").filter(Boolean),
  }
}

async function loadPriorRejections(
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string[]> {
  const { data } = await supabase
    .from("design_iterations")
    .select("alternatives_presented, chosen_option_index")
    .eq("project_id", projectId)
    .eq("chosen_option_index", -1)
    .order("created_at", { ascending: false })
    .limit(10)

  const rejected: string[] = []
  for (const row of data ?? []) {
    const alts = Array.isArray(row.alternatives_presented) ? (row.alternatives_presented as Array<Record<string, unknown>>) : []
    for (const alt of alts) {
      if (alt.headline) rejected.push(String(alt.headline))
    }
  }
  return rejected.slice(0, 20)
}
