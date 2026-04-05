/**
 * @file cfd-generator.ts — AI-powered flow condition generation + CFD orchestration
 *
 * @description Two-stage pipeline for aerodynamic analysis:
 * 1. AI infers realistic flow conditions from module spec (product-agnostic)
 * 2. Sends STEP geometry + flow config to Modal CFD worker for OpenFOAM solving
 *
 * The AI determines appropriate flow conditions based on what the module IS:
 * a "wing" gets high-speed airflow, a "housing" gets natural convection or
 * slow-speed cooling flow, etc.
 *
 * @security
 * - OPENAI_API_KEY for flow condition generation
 * - MODAL_CFD_ENDPOINT_URL for CFD execution
 *
 * @related
 * - CAD generator: ./cad-generator.ts (generates the geometry)
 * - CFD worker: /modal_cfd_worker.py (runs OpenFOAM)
 * - Schema: ./xray-schema.ts (CfdAnalysis type)
 * - FEA generator: ./fea-generator.ts (structural analysis counterpart)
 */

import OpenAI from "openai"

import { createAdminClient } from "@/lib/supabase/admin"

import type { ModuleSpec, CfdAnalysis } from "./xray-schema"

// ─── Constants ───────────────────────────────────────────────────────

const STORAGE_BUCKET = "xray-images"
const CFD_TIMEOUT_MS = 600_000 // 10 minutes for CFD

// ─── Types ───────────────────────────────────────────────────────────

/** Flow conditions sent to the CFD worker */
export interface FlowConfig {
  velocity_m_s: number
  direction: [number, number, number]
  density_kg_m3: number
  kinematic_viscosity_m2_s: number
  reference_area_m2?: number
  reference_length_m?: number
  medium: string // "air", "water", etc.
  description: string
}

/** Raw response from the Modal CFD worker */
interface CfdWorkerResult {
  error: string | null
  module_id: string
  drag_coefficient: number | null
  lift_coefficient: number | null
  side_force_coefficient: number | null
  drag_force_N: number | null
  lift_force_N: number | null
  reynolds_number: number | null
  flow_velocity_m_s: number | null
  reference_area_m2: number | null
  convergence: {
    converged: boolean
    final_residuals: Record<string, number>
    iterations: number
  } | null
  residual_plot_b64: string | null
  mesh_cell_count: number | null
}

// ─── AI Flow Condition Generation ────────────────────────────────────

const FLOW_CONDITION_SYSTEM_PROMPT = `You are an aerodynamics engineer. Given a product module description,
determine realistic flow conditions for CFD analysis. Consider:
- What medium surrounds this component? (air, water, other fluid)
- What is a realistic operating velocity?
- What direction does the flow come from relative to the component?
- What is the fluid density and viscosity?

Return JSON with this exact structure:
{
  "velocity_m_s": <number>,
  "direction": [<x>, <y>, <z>],
  "density_kg_m3": <number>,
  "kinematic_viscosity_m2_s": <number>,
  "medium": "<string>",
  "description": "<brief description of the flow scenario>"
}

Examples:
- Quadcopter frame → air at 15 m/s cruise speed, flow from front
- Underwater housing → water at 2 m/s, flow from front
- Electronics enclosure → air at 1 m/s (natural convection)
- Car body panel → air at 30 m/s (highway speed)
- Propeller → air at 20 m/s (propwash)

Always use SI units. Direction should be a unit vector.`

/**
 * Uses AI to generate realistic flow conditions for CFD analysis.
 *
 * @param module - The module specification to analyze
 * @returns Flow configuration for the CFD worker
 */
export async function generateFlowConditions(
  module: ModuleSpec,
): Promise<FlowConfig> {
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
    model: "gpt-5.4",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: FLOW_CONDITION_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Determine CFD flow conditions for this module:\n\n${moduleContext}`,
      },
    ],
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    // Fallback: standard air at moderate speed
    return {
      velocity_m_s: 10.0,
      direction: [1, 0, 0],
      density_kg_m3: 1.225,
      kinematic_viscosity_m2_s: 1.5e-5,
      medium: "air",
      description: "Default air flow at 10 m/s",
    }
  }

  try {
    const parsed = JSON.parse(content)
    // Sanity-check AI-inferred flow values
    // SECURITY: Cap at 100 m/s (Mach 0.3) — incompressible solver diverges at supersonic speeds
    const rawVelocity = parsed.velocity_m_s ?? 10.0
    const velocity = Math.max(0, Math.min(rawVelocity, 100))
    if (velocity !== rawVelocity) {
      console.warn(`[XRayCFD] Clamped velocity from ${rawVelocity} to ${velocity} m/s`)
    }
    const rawDensity = parsed.density_kg_m3 ?? 1.225
    const density = Math.max(0.01, Math.min(rawDensity, 13_600))
    if (density !== rawDensity) {
      console.warn(`[XRayCFD] Clamped density from ${rawDensity} to ${density} kg/m³`)
    }
    const rawViscosity = parsed.kinematic_viscosity_m2_s ?? 1.5e-5
    const viscosity = Math.max(1e-7, Math.min(rawViscosity, 0.1))
    if (viscosity !== rawViscosity) {
      console.warn(`[XRayCFD] Clamped viscosity from ${rawViscosity} to ${viscosity} m²/s`)
    }
    // Normalize direction to unit vector (with Infinity/NaN guard)
    const rawDir: [number, number, number] = parsed.direction ?? [1, 0, 0]
    const dirValid = rawDir.every((v: number) => typeof v === 'number' && isFinite(v))
    let direction: [number, number, number] = [1, 0, 0]
    if (dirValid) {
      const mag = Math.sqrt(rawDir[0] ** 2 + rawDir[1] ** 2 + rawDir[2] ** 2)
      if (isFinite(mag) && mag > 0) {
        direction = [rawDir[0] / mag, rawDir[1] / mag, rawDir[2] / mag]
      } else {
        console.warn("[XRayCFD] Zero-length direction vector, defaulting to [1,0,0]")
      }
    } else {
      console.warn(`[XRayCFD] Invalid direction vector, defaulting to [1,0,0]`)
    }
    return {
      velocity_m_s: velocity,
      direction,
      density_kg_m3: density,
      kinematic_viscosity_m2_s: viscosity,
      medium: parsed.medium ?? "air",
      description: parsed.description ?? "AI-generated flow conditions",
    }
  } catch {
    return {
      velocity_m_s: 10.0,
      direction: [1, 0, 0],
      density_kg_m3: 1.225,
      kinematic_viscosity_m2_s: 1.5e-5,
      medium: "air",
      description: "Default air flow (AI parse failed)",
    }
  }
}

// ─── CFD Worker Orchestration ────────────────────────────────────────

/**
 * Runs CFD analysis on a module's STEP geometry.
 *
 * @description Two-stage pipeline:
 * 1. AI generates realistic flow conditions from module spec
 * 2. Sends STEP + flow config to Modal CFD worker (OpenFOAM)
 *
 * @param scanId - Scan identifier for storage paths
 * @param module - Module specification with CAD data
 * @returns CfdAnalysis result conforming to schema
 *
 * @throws Error if CFD endpoint is not configured
 */
export async function runCfdAnalysis(
  scanId: string,
  module: ModuleSpec,
): Promise<CfdAnalysis> {
  // VALIDATION: Ensure module has CAD data
  if (!module.cadModel?.stepUrl) {
    return {
      status: "failed",
      computedAt: new Date().toISOString(),
    }
  }

  const cfdEndpoint = process.env.MODAL_CFD_ENDPOINT_URL
  if (!cfdEndpoint) {
    throw new Error("[XRayCFD] MODAL_CFD_ENDPOINT_URL is not configured")
  }

  // Stage 1: AI generates flow conditions
  const flowConfig = await generateFlowConditions(module)

  // Stage 2: Download STEP file from storage and encode as base64
  const stepB64 = await downloadAsBase64(module.cadModel.stepUrl)

  // Stage 3: Send to CFD worker
  console.info("[XRayCFD] Sending to CFD worker:", {
    moduleId: module.id,
    medium: flowConfig.medium,
    velocity: flowConfig.velocity_m_s,
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CFD_TIMEOUT_MS)

  let cfdResult: CfdWorkerResult
  try {
    const response = await fetch(cfdEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step_data_b64: stepB64,
        module_id: module.id,
        flow_config: {
          velocity_m_s: flowConfig.velocity_m_s,
          direction: flowConfig.direction,
          density_kg_m3: flowConfig.density_kg_m3,
          kinematic_viscosity_m2_s: flowConfig.kinematic_viscosity_m2_s,
        },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(
        `CFD API error (${response.status}): ${errText.slice(0, 300)}`,
      )
    }

    cfdResult = (await response.json()) as CfdWorkerResult
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`CFD execution timed out after ${CFD_TIMEOUT_MS / 1000}s`)
    }
    throw error
  }

  if (cfdResult.error) {
    return {
      status: "failed",
      flowDescription: flowConfig.description,
      computedAt: new Date().toISOString(),
    }
  }

  // Stage 4: Upload residual plot if available
  let convergencePlotUrl: string | undefined
  if (cfdResult.residual_plot_b64) {
    try {
      convergencePlotUrl = await uploadAnalysisFile(
        scanId,
        `module-${module.id}/cfd-residuals.png`,
        cfdResult.residual_plot_b64,
        "image/png",
      )
    } catch (error) {
      console.warn("[XRayCFD] Failed to upload residual plot:", {
        error: error instanceof Error ? error.message : "Unknown",
      })
    }
  }

  console.info("[XRayCFD] CFD analysis complete:", {
    moduleId: module.id,
    Cd: cfdResult.drag_coefficient,
    Cl: cfdResult.lift_coefficient,
    Re: cfdResult.reynolds_number,
    converged: cfdResult.convergence?.converged,
  })

  return {
    status: "complete",
    dragCoefficient: cfdResult.drag_coefficient ?? undefined,
    liftCoefficient: cfdResult.lift_coefficient ?? undefined,
    dragForce_N: cfdResult.drag_force_N ?? undefined,
    liftForce_N: cfdResult.lift_force_N ?? undefined,
    reynoldsNumber: cfdResult.reynolds_number ?? undefined,
    flowVelocity_m_s: cfdResult.flow_velocity_m_s ?? undefined,
    flowDescription: flowConfig.description,
    convergencePlotUrl,
    computedAt: new Date().toISOString(),
  }
}

// ─── Storage Helpers ─────────────────────────────────────────────────

/**
 * Downloads a file from a URL and returns it as a base64 string.
 */
async function downloadAsBase64(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`[XRayCFD] Failed to download file: ${response.status}`)
  }
  const buffer = await response.arrayBuffer()
  return Buffer.from(buffer).toString("base64")
}

/**
 * Uploads an analysis file to Supabase storage.
 *
 * @returns Public URL of the uploaded file
 */
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
    throw new Error(`[XRayCFD] Storage upload failed: ${error.message}`)
  }

  // SECURITY: Use signed URL — CFD analysis results are confidential
  const { data: urlData } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 3600)

  return urlData?.signedUrl ?? ''
}
