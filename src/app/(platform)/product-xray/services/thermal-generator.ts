/**
 * @file thermal-generator.ts — AI-powered heat source inference + thermal analysis
 *
 * @description Two-stage pipeline for thermal analysis:
 * 1. AI infers heat sources and boundary conditions from module spec
 * 2. Sends STEP geometry + thermal config to Modal thermal worker (CalculiX)
 *
 * @security
 * - OPENAI_API_KEY for heat source inference
 * - MODAL_THERMAL_ENDPOINT_URL for thermal analysis execution
 *
 * @related
 * - Thermal worker: /modal_thermal_worker.py (runs CalculiX heat transfer)
 * - Schema: ./xray-schema.ts (ThermalAnalysis type)
 */

import OpenAI from "openai"

import { createAdminClient } from "@/lib/supabase/admin"

import type { ModuleSpec, ThermalAnalysis } from "./xray-schema"

// ─── Constants ───────────────────────────────────────────────────────

const STORAGE_BUCKET = "xray-images"
const THERMAL_TIMEOUT_MS = 360_000 // 6 minutes

// ─── Types ───────────────────────────────────────────────────────────

interface HeatSourceConfig {
  power_W: number
  description: string
}

interface ThermalConfig {
  heat_sources: HeatSourceConfig[]
  ambient_temp_C: number
  material_key: string
  description: string
}

interface ThermalWorkerResult {
  error: string | null
  module_id: string
  max_temp_C: number | null
  min_temp_C: number | null
  avg_temp_C: number | null
  max_safe_temp_C: number | null
  thermal_margin_pct: number | null
  within_limits: boolean | null
  ambient_temp_C: number | null
  heat_sources: HeatSourceConfig[] | null
  material_key: string | null
  mesh_elements: number | null
  visualization_b64: string | null
}

// ─── AI Heat Source Inference ────────────────────────────────────────

const THERMAL_SYSTEM_PROMPT = `You are a thermal engineer. Given a product module description,
determine realistic thermal boundary conditions. Consider:
- What heat sources are present? (electronics, motors, friction, solar, etc.)
- What is the ambient operating temperature?
- What material is this made from?

Return JSON with this exact structure:
{
  "heat_sources": [
    {"power_W": <number>, "description": "<source description>"}
  ],
  "ambient_temp_C": <number>,
  "material_key": "<one of: pla, abs, petg, nylon, aluminum_6061, steel_mild, titanium, carbon_fiber, copper>",
  "description": "<brief description of the thermal scenario>"
}

Examples:
- Motor mount → heat from motor (5W), ambient 30°C, aluminum
- Electronics enclosure → heat from PCB (10W), ambient 25°C, abs
- Outdoor housing → solar heating (3W), ambient 35°C, petg
- Heatsink → chip heat (15W), ambient 40°C, aluminum_6061`

/**
 * Uses AI to infer thermal boundary conditions for a module.
 *
 * @param module - Module specification
 * @returns Thermal configuration for the worker
 */
async function inferThermalConfig(module: ModuleSpec): Promise<ThermalConfig> {
  const openai = new OpenAI()

  const moduleContext = [
    `Module name: ${module.name}`,
    `Purpose: ${module.purpose}`,
    module.keyParts?.length ? `Key parts: ${JSON.stringify(module.keyParts)}` : "",
    module.detail?.whatItIs
      ? `Technical description: ${module.detail.whatItIs}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: THERMAL_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Determine thermal boundary conditions for:\n\n${moduleContext}`,
      },
    ],
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    return {
      heat_sources: [{ power_W: 1.0, description: "Default 1W heat load" }],
      ambient_temp_C: 25.0,
      material_key: "pla",
      description: "Default thermal conditions",
    }
  }

  try {
    const parsed = JSON.parse(content)
    return {
      heat_sources: parsed.heat_sources ?? [{ power_W: 1.0, description: "Default" }],
      ambient_temp_C: parsed.ambient_temp_C ?? 25.0,
      material_key: parsed.material_key ?? "pla",
      description: parsed.description ?? "AI-inferred thermal conditions",
    }
  } catch {
    return {
      heat_sources: [{ power_W: 1.0, description: "Default 1W heat load" }],
      ambient_temp_C: 25.0,
      material_key: "pla",
      description: "Default thermal conditions (AI parse failed)",
    }
  }
}

// ─── Thermal Analysis Orchestration ──────────────────────────────────

/**
 * Runs thermal analysis on a module's STEP geometry.
 *
 * @param scanId - Scan identifier for storage paths
 * @param module - Module specification with CAD data
 * @returns ThermalAnalysis result conforming to schema
 */
export async function runThermalAnalysis(
  scanId: string,
  module: ModuleSpec,
): Promise<ThermalAnalysis> {
  if (!module.cadModel?.stepUrl) {
    return {
      status: "failed",
      computedAt: new Date().toISOString(),
    }
  }

  const thermalEndpoint = process.env.MODAL_THERMAL_ENDPOINT_URL
  if (!thermalEndpoint) {
    throw new Error("[XRayThermal] MODAL_THERMAL_ENDPOINT_URL is not configured")
  }

  // Stage 1: AI infers thermal conditions
  const thermalConfig = await inferThermalConfig(module)

  // Stage 2: Download STEP
  const stepB64 = await downloadAsBase64(module.cadModel.stepUrl)

  console.info("[XRayThermal] Sending to thermal worker:", {
    moduleId: module.id,
    material: thermalConfig.material_key,
    heatSources: thermalConfig.heat_sources.length,
    ambient: thermalConfig.ambient_temp_C,
  })

  // Stage 3: Send to worker
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), THERMAL_TIMEOUT_MS)

  let result: ThermalWorkerResult
  try {
    const response = await fetch(thermalEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step_data_b64: stepB64,
        module_id: module.id,
        material_key: thermalConfig.material_key,
        heat_sources: thermalConfig.heat_sources,
        ambient_temp_C: thermalConfig.ambient_temp_C,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Thermal API error (${response.status}): ${errText.slice(0, 300)}`)
    }

    result = (await response.json()) as ThermalWorkerResult
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Thermal analysis timed out after ${THERMAL_TIMEOUT_MS / 1000}s`)
    }
    throw error
  }

  if (result.error) {
    return {
      status: "failed",
      computedAt: new Date().toISOString(),
    }
  }

  // Upload visualization
  let visualizationUrl: string | undefined
  if (result.visualization_b64) {
    try {
      visualizationUrl = await uploadAnalysisFile(
        scanId,
        `module-${module.id}/thermal-viz.png`,
        result.visualization_b64,
        "image/png",
      )
    } catch (error) {
      console.warn("[XRayThermal] Failed to upload visualization:", {
        error: error instanceof Error ? error.message : "Unknown",
      })
    }
  }

  console.info("[XRayThermal] Thermal analysis complete:", {
    moduleId: module.id,
    maxTemp: result.max_temp_C,
    withinLimits: result.within_limits,
    margin: result.thermal_margin_pct,
  })

  return {
    status: "complete",
    maxTemp_C: result.max_temp_C ?? undefined,
    minTemp_C: result.min_temp_C ?? undefined,
    avgTemp_C: result.avg_temp_C ?? undefined,
    materialLimit_C: result.max_safe_temp_C ?? undefined,
    thermalMargin_pct: result.thermal_margin_pct ?? undefined,
    withinLimits: result.within_limits ?? undefined,
    ambientTemp_C: result.ambient_temp_C ?? undefined,
    visualizationUrl,
    computedAt: new Date().toISOString(),
  }
}

// ─── Storage Helpers ─────────────────────────────────────────────────

async function downloadAsBase64(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`[XRayThermal] Failed to download file: ${response.status}`)
  }
  const buffer = await response.arrayBuffer()
  return Buffer.from(buffer).toString("base64")
}

async function uploadAnalysisFile(
  scanId: string,
  filename: string,
  base64Data: string,
  mimeType: string,
): Promise<string> {
  const supabase = createAdminClient()
  const path = `scans/${scanId}/analysis/${filename}`
  const buffer = Buffer.from(base64Data, "base64")

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
    })

  if (error) {
    throw new Error(`[XRayThermal] Storage upload failed: ${error.message}`)
  }

  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path)

  return urlData.publicUrl
}
