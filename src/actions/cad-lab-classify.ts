"use server"

/**
 * @file cad-lab-classify.ts — AI batch classification for low-confidence parts.
 *
 * @description Calls Claude Haiku to classify parts as buy/make with process,
 * material, and brief reasoning. Used by the Auto-Classify button in
 * ClassificationReviewPanel to pre-fill overrides for parts the deterministic
 * classifier couldn't resolve.
 *
 * @security Requires ANTHROPIC_API_KEY environment variable.
 */

import { classifyPart, KNOWN_PROCESSES, KNOWN_MATERIALS } from "@/lib/part-classification"
import { withAIGate } from '@/lib/ai/with-ai-gate'

// ─── Types ────────────────────────────────────────────────────────────

export interface PartToClassify {
  partKey: string       // "${moduleId}::${partName}"
  partName: string
  moduleName: string
  modulePurpose: string
  currentProcess: string
  currentMaterial: string
}

export interface AiPartClassification {
  partKey: string
  type: "buy" | "make"
  process: string
  material: string
  reasoning: string
}

interface ClassifySuccess {
  success: true
  classifications: AiPartClassification[]
}

interface ClassifyError {
  success: false
  error: string
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Case-insensitive match against known values, then substring match, then fallback. */
function fuzzyMatchKnown(value: string, knownValues: readonly string[], fallback: string): string {
  const lower = value.toLowerCase().trim()
  // Exact case-insensitive match
  const exact = knownValues.find((k) => k.toLowerCase() === lower)
  if (exact) return exact
  // Substring match (AI said "CNC" → "CNC Machining")
  const sub = knownValues.find((k) => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase()))
  if (sub) return sub
  return fallback
}

// ─── Main Action ──────────────────────────────────────────────────────

/**
 * Batch-classify parts using Claude Haiku.
 *
 * @description Sends all low-confidence parts in a single API call. Returns
 * per-part type/process/material/reasoning. Post-processes with fuzzy matching
 * and classifyPart() safety net.
 *
 * @param parts - Parts needing classification with module context
 * @returns Classifications array or error
 */
export async function classifyPartsAi(
  parts: PartToClassify[],
): Promise<ClassifySuccess | ClassifyError> {
  return withAIGate('cad_lab_classify', async () => {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) {
    return { success: false, error: "DEEPSEEK_API_KEY not configured" }
  }

  if (parts.length === 0) {
    return { success: false, error: "No parts to classify" }
  }

  const systemPrompt = `You are a UK manufacturing parts classifier. For each part, determine:
1. type: "buy" (off-the-shelf) or "make" (custom manufactured)
2. process: manufacturing process for "make" parts, or "Buy" for buy parts
3. material: material for "make" parts, or "Off-the-shelf" for buy parts
4. reasoning: ≤20 words explaining why

VALID PROCESSES (use exactly): ${KNOWN_PROCESSES.join(", ")}
VALID MATERIALS (use exactly): ${KNOWN_MATERIALS.join(", ")}

For "buy" parts: process="Buy", material="Off-the-shelf"
For "make" parts: pick from the valid lists above.

Classification guide:
- buy: motors, sensors, switches, batteries, microcontrollers, PCBs, cables, connectors, bearings, fasteners (bolts/screws/nuts/washers), seals, O-rings, springs, fans, pumps, valves, displays, LEDs, encoders, drivers, ESCs, standard electronics
- make: machined housings, welded frames, sheet metal brackets, cast parts, moulded plastics, custom enclosures, fabricated structures, custom mechanical parts

CRITICAL: Return ONLY valid JSON array, no markdown fences.
[{"partKey":"<key>","type":"buy"|"make","process":"<process>","material":"<material>","reasoning":"<brief>"}]`

  const partsInput = parts.map((p) => ({
    partKey: p.partKey,
    partName: p.partName,
    module: p.moduleName,
    purpose: p.modulePurpose,
    fallbackProcess: p.currentProcess,
    fallbackMaterial: p.currentMaterial,
  }))

  const userPrompt = `Classify these ${parts.length} parts. Return ONLY a JSON array.

${JSON.stringify(partsInput, null, 2)}`

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    })

    if (!response.ok) {
      return { success: false, error: `DeepSeek API error: ${response.status}` }
    }

    const responseData = await response.json()
    const text: string = responseData.choices?.[0]?.message?.content ?? ""
    if (!text) {
      return { success: false, error: "Empty response from DeepSeek" }
    }

    // Parse JSON — strip markdown fences if present
    let jsonStr = text.trim()
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, "")
    jsonStr = jsonStr.replace(/\s*```\s*$/i, "")
    jsonStr = jsonStr.trim()

    let parsed: unknown[]
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      console.error("[CAD-CLASSIFY] JSON parse failed. Raw (first 500):", text.slice(0, 500))
      return { success: false, error: "Failed to parse AI response as JSON" }
    }

    if (!Array.isArray(parsed)) {
      return { success: false, error: "AI response is not an array" }
    }

    // INTENT: Build a set of valid partKeys so we only process parts we asked about
    const validKeys = new Set(parts.map((p) => p.partKey))

    const classifications: AiPartClassification[] = []

    for (const item of parsed) {
      const raw = item as Record<string, unknown>
      if (!raw.partKey || typeof raw.partKey !== "string") continue
      if (!validKeys.has(raw.partKey)) continue

      // Validate type
      let type: "buy" | "make" = raw.type === "buy" ? "buy" : "make"

      // Fuzzy-match process and material against known values
      const partInfo = parts.find((p) => p.partKey === raw.partKey)!
      let process: string
      let material: string

      if (type === "buy") {
        process = "Buy"
        material = "Off-the-shelf"
      } else {
        process = typeof raw.process === "string"
          ? fuzzyMatchKnown(raw.process, KNOWN_PROCESSES, partInfo.currentProcess)
          : partInfo.currentProcess
        material = typeof raw.material === "string"
          ? fuzzyMatchKnown(raw.material, KNOWN_MATERIALS, partInfo.currentMaterial)
          : partInfo.currentMaterial
      }

      // INTENT: Safety net — deterministic classifyPart() overrides AI when explicit keyword match found.
      // Same pattern as cad-lab-cost.ts:224-235
      const cls = classifyPart(partInfo.partName, partInfo.currentProcess, partInfo.currentMaterial)
      if (cls.explicit) {
        type = cls.type
        if (type === "buy") {
          process = "Buy"
          material = "Off-the-shelf"
        } else {
          process = cls.processDetected ? cls.process : process
          material = cls.materialDetected ? cls.material : material
        }
      }

      // Truncate reasoning to 60 chars
      const reasoning = typeof raw.reasoning === "string"
        ? raw.reasoning.slice(0, 60)
        : ""

      classifications.push({ partKey: raw.partKey, type, process, material, reasoning })
    }

    console.info(
      `[CAD-CLASSIFY] AI classified ${classifications.length}/${parts.length} parts`,
      `(${responseData.usage?.prompt_tokens ?? 0} in / ${responseData.usage?.completion_tokens ?? 0} out)`,
    )

    return { success: true, classifications }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("[CAD-CLASSIFY] AI classification failed:", msg)
    return { success: false, error: msg }
  }
  })
}
