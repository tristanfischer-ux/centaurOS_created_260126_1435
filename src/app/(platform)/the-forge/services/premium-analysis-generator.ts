/**
 * @file premium-analysis-generator.ts — Premium tier specialized analyses
 *
 * @description Orchestrates premium analysis types:
 * 1. EMI/EMC shielding effectiveness (frequency-dependent)
 * 2. Fatigue life estimation (Basquin-Coffin-Manson with Goodman correction)
 * 3. Impact/crash resistance (energy-based method)
 *
 * These analyses use analytical/empirical methods rather than full simulation,
 * providing rapid engineering insight at reasonable compute cost.
 *
 * @security
 * - MODAL_PREMIUM_ENDPOINT_URL for premium analysis execution
 *
 * @related
 * - Premium worker: /modal_premium_worker.py
 * - Schema: ./xray-schema.ts (ModuleAnalysis.emiShielding, fatigue, impact)
 */

import { createAdminClient } from "@/lib/supabase/admin"

import type { ModuleSpec, EmiShielding, Fatigue, Impact } from "./xray-schema"

// ─── Constants ───────────────────────────────────────────────────────

const STORAGE_BUCKET = "xray-images"
const PREMIUM_TIMEOUT_MS = 180_000 // 3 minutes

// ─── Typed Worker Response ───────────────────────────────────────────

/** Raw response shape from the Modal premium worker */
interface PremiumWorkerResponse {
  error?: string
  // EMI fields
  is_conductive?: boolean
  se_at_1GHz_dB?: number
  overall_rating?: string
  recommendation?: string
  wall_thickness_mm?: number
  shielding_data?: Array<{
    frequency_Hz: number
    frequency_label: string
    se_total_dB: number
  }>
  visualization_b64?: string
  // Fatigue fields
  cycles_to_failure?: number
  cycles_to_failure_label?: string
  life_category?: string
  description?: string
  safety_factor?: number
  endurance_limit_MPa?: number
  stress_amplitude_MPa?: number
  mean_stress_MPa?: number
  // Impact fields
  impact_velocity_m_s?: number
  kinetic_energy_J?: number
  energy_absorption_capacity_J?: number
  rating?: string
}

// ─── Material Inference ──────────────────────────────────────────────

function inferMaterialKey(module: ModuleSpec): string {
  const desc = `${module.name} ${module.purpose} ${module.detail?.whatItIs ?? ""}`.toLowerCase()
  if (desc.includes("aluminum") || desc.includes("aluminium")) return "aluminum_6061"
  if (desc.includes("steel")) return "steel_mild"
  if (desc.includes("titanium")) return "titanium"
  if (desc.includes("carbon fiber") || desc.includes("cfrp")) return "carbon_fiber"
  if (desc.includes("copper")) return "copper"
  if (desc.includes("nylon") || desc.includes("pa6")) return "nylon"
  if (desc.includes("abs")) return "abs"
  if (desc.includes("petg")) return "petg"
  return "pla"
}

// ─── EMI Analysis ────────────────────────────────────────────────────

/**
 * Runs EMI/EMC shielding effectiveness analysis.
 *
 * @param scanId - Scan identifier for file storage
 * @param module - Module specification
 * @returns EMI shielding result
 */
export async function runEmiAnalysis(
  scanId: string,
  module: ModuleSpec,
): Promise<EmiShielding> {
  const endpoint = process.env.MODAL_PREMIUM_ENDPOINT_URL
  if (!endpoint) {
    throw new Error("[XRayPremium] MODAL_PREMIUM_ENDPOINT_URL is not configured")
  }

  const materialKey = inferMaterialKey(module)

  // Get wall thickness from mass properties if available
  const wallThickness = module.cadModel?.analysis?.massProperties?.boundingBox
    ? estimateWallThickness(module)
    : undefined

  const result = await callPremiumWorker(endpoint, {
    analysis_type: "emi",
    module_id: module.id,
    material_key: materialKey,
    params: {
      wall_thickness_mm: wallThickness,
    },
  })

  if (result.error) {
    return { status: "failed", computedAt: new Date().toISOString() }
  }

  // Upload visualization if available
  let visualizationUrl: string | undefined
  if (result.visualization_b64) {
    try {
      visualizationUrl = await uploadAnalysisFile(
        scanId,
        `module-${module.id}/emi-shielding.png`,
        result.visualization_b64,
        "image/png",
      )
    } catch {
      // Non-critical, continue
    }
  }

  return {
    status: "complete",
    isConductive: result.is_conductive ?? false,
    seAt1GHz_dB: result.se_at_1GHz_dB,
    overallRating: result.overall_rating,
    recommendation: result.recommendation,
    wallThickness_mm: result.wall_thickness_mm,
    visualizationUrl,
    computedAt: new Date().toISOString(),
  }
}

// ─── Fatigue Analysis ────────────────────────────────────────────────

/**
 * Runs fatigue life estimation.
 *
 * @param module - Module specification (uses FEA results for stress data)
 * @returns Fatigue life result
 */
export async function runFatigueAnalysis(
  module: ModuleSpec,
): Promise<Fatigue> {
  const endpoint = process.env.MODAL_PREMIUM_ENDPOINT_URL
  if (!endpoint) {
    throw new Error("[XRayPremium] MODAL_PREMIUM_ENDPOINT_URL is not configured")
  }

  const materialKey = inferMaterialKey(module)

  // Get max stress from FEA results if available
  const maxStress = module.cadModel?.analysis?.structural?.maxVonMisesStress_MPa ?? 20.0

  const result = await callPremiumWorker(endpoint, {
    analysis_type: "fatigue",
    module_id: module.id,
    material_key: materialKey,
    params: {
      max_stress_MPa: maxStress,
      min_stress_MPa: 0, // Zero-to-max loading assumption
      Kt: 1.5, // Default stress concentration factor
    },
  })

  if (result.error) {
    return { status: "failed", computedAt: new Date().toISOString() }
  }

  return {
    status: "complete",
    cyclesToFailure: result.cycles_to_failure,
    cyclesToFailureLabel: result.cycles_to_failure_label,
    lifeCategory: result.life_category,
    description: result.description,
    safetyFactor: result.safety_factor,
    enduranceLimit_MPa: result.endurance_limit_MPa,
    stressAmplitude_MPa: result.stress_amplitude_MPa,
    meanStress_MPa: result.mean_stress_MPa,
    computedAt: new Date().toISOString(),
  }
}

// ─── Impact Analysis ─────────────────────────────────────────────────

/**
 * Runs impact/crash resistance estimation.
 *
 * @param module - Module specification (uses mass properties for mass/volume)
 * @returns Impact resistance result
 */
export async function runImpactAnalysis(
  module: ModuleSpec,
): Promise<Impact> {
  const endpoint = process.env.MODAL_PREMIUM_ENDPOINT_URL
  if (!endpoint) {
    throw new Error("[XRayPremium] MODAL_PREMIUM_ENDPOINT_URL is not configured")
  }

  const materialKey = inferMaterialKey(module)
  const mass = module.cadModel?.analysis?.massProperties?.mass_kg ?? 0.1
  const volume = module.cadModel?.analysis?.massProperties?.volume_mm3 ?? 50000

  const result = await callPremiumWorker(endpoint, {
    analysis_type: "impact",
    module_id: module.id,
    material_key: materialKey,
    params: {
      mass_kg: mass,
      volume_mm3: volume,
      impact_velocity_m_s: 5.0, // ~1m drop height
    },
  })

  if (result.error) {
    return { status: "failed", computedAt: new Date().toISOString() }
  }

  return {
    status: "complete",
    impactVelocity_m_s: result.impact_velocity_m_s,
    kineticEnergy_J: result.kinetic_energy_J,
    energyAbsorptionCapacity_J: result.energy_absorption_capacity_J,
    safetyFactor: result.safety_factor,
    rating: result.rating,
    description: result.description,
    computedAt: new Date().toISOString(),
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Estimate wall thickness from bounding box and volume */
function estimateWallThickness(module: ModuleSpec): number {
  const bb = module.cadModel?.analysis?.massProperties?.boundingBox
  if (!bb) return 2.0

  // Rough estimate: wall thickness ~ volume / surface area
  const dx = bb.xLen
  const dy = bb.yLen
  const dz = bb.zLen
  const surfaceArea = 2 * (dx * dy + dy * dz + dx * dz)
  const volume = module.cadModel?.analysis?.massProperties?.volume_mm3 ?? (dx * dy * dz * 0.3)

  const thickness = volume / surfaceArea
  return Math.max(0.5, Math.min(thickness, 10)) // Clamp between 0.5mm and 10mm
}

/** Call the premium analysis Modal endpoint */
async function callPremiumWorker(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<PremiumWorkerResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PREMIUM_TIMEOUT_MS)

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text()
      return { error: `API error (${response.status}): ${errText.slice(0, 300)}` }
    }

    return (await response.json()) as PremiumWorkerResponse
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof DOMException && error.name === "AbortError") {
      return { error: `Premium analysis timed out` }
    }
    return { error: error instanceof Error ? error.message : "Unknown error" }
  }
}

/** Upload analysis file to Supabase storage */
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
    throw new Error(`[XRayPremium] Storage upload failed: ${error.message}`)
  }

  // SECURITY: Use signed URL — premium analysis results are confidential
  const { data: urlData } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 3600)

  return urlData?.signedUrl ?? ''
}
