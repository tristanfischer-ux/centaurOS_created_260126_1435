/**
 * @file topo-generator.ts — Topology optimization orchestration
 *
 * @description Orchestrates topology optimization by sending STEP geometry
 * to the Modal topology worker, which uses a simplified SIMP approach to
 * identify material removal regions for weight reduction.
 *
 * @security
 * - MODAL_TOPO_ENDPOINT_URL for optimization execution
 *
 * @related
 * - Topo worker: /modal_topo_worker.py (runs SIMP analysis)
 * - CAD generator: ./cad-generator.ts (generates the geometry)
 * - Schema: ./xray-schema.ts (TopologyOptimization type)
 */

import { createAdminClient } from "@/lib/supabase/admin"

import type { ModuleSpec, TopologyOptimization } from "./xray-schema"

// ─── Constants ───────────────────────────────────────────────────────

const STORAGE_BUCKET = "xray-images"
const TOPO_TIMEOUT_MS = 360_000 // 6 minutes

// ─── Types ───────────────────────────────────────────────────────────

/** Raw response from the Modal topology worker */
interface TopoWorkerResult {
  error: string | null
  original_volume_mm3?: number
  optimized_volume_mm3?: number
  volume_fraction?: number
  weight_savings_pct?: number
  original_mass_kg?: number
  optimized_mass_kg?: number
  total_elements?: number
  removable_elements?: number
  kept_elements?: number
  removable_regions?: Array<{
    name: string
    centroid: [number, number, number]
    element_count: number
    volume_pct: number
  }>
  penalty_factor?: number
  target_volume_fraction?: number
  visualization_b64?: string | null
  mesh_info?: { node_count: number; element_count: number }
  material_key?: string
}

// ─── Material Inference ──────────────────────────────────────────────

/** Map module descriptions to material keys for the topo worker */
function inferMaterialKey(module: ModuleSpec): string {
  const desc = `${module.name} ${module.purpose} ${module.detail?.whatItIs ?? ""}`.toLowerCase()

  if (desc.includes("aluminum") || desc.includes("aluminium") || desc.includes("alloy")) {
    return "aluminum_6061"
  }
  if (desc.includes("steel") || desc.includes("iron")) {
    return "steel_mild"
  }
  if (desc.includes("titanium")) {
    return "titanium"
  }
  if (desc.includes("carbon fiber") || desc.includes("carbon fibre") || desc.includes("cfrp")) {
    return "carbon_fiber"
  }
  if (desc.includes("nylon") || desc.includes("pa6") || desc.includes("polyamide")) {
    return "nylon"
  }
  if (desc.includes("petg")) {
    return "petg"
  }
  if (desc.includes("abs")) {
    return "abs"
  }
  // Default to PLA for 3D-printed parts
  return "pla"
}

// ─── Topology Optimization Orchestration ─────────────────────────────

/**
 * Runs topology optimization on a module's STEP geometry.
 *
 * @param scanId - Scan identifier for storage paths
 * @param module - Module specification with CAD data
 * @param volumeFraction - Target volume fraction (default 0.5 = 50% material)
 * @returns TopologyOptimization result conforming to schema
 *
 * @throws Error if topo endpoint is not configured
 */
export async function runTopologyOptimization(
  scanId: string,
  module: ModuleSpec,
  volumeFraction: number = 0.5,
): Promise<TopologyOptimization> {
  // VALIDATION: Ensure module has CAD data
  if (!module.cadModel?.stepUrl) {
    return {
      status: "failed",
      computedAt: new Date().toISOString(),
    }
  }

  const topoEndpoint = process.env.MODAL_TOPO_ENDPOINT_URL
  if (!topoEndpoint) {
    throw new Error("[XRayTopo] MODAL_TOPO_ENDPOINT_URL is not configured")
  }

  const materialKey = inferMaterialKey(module)

  // Download STEP file
  const stepB64 = await downloadAsBase64(module.cadModel.stepUrl)

  console.info("[XRayTopo] Sending to topology worker:", {
    moduleId: module.id,
    material: materialKey,
    targetVF: volumeFraction,
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TOPO_TIMEOUT_MS)

  let topoResult: TopoWorkerResult
  try {
    const response = await fetch(topoEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step_data_b64: stepB64,
        module_id: module.id,
        material_key: materialKey,
        volume_fraction: volumeFraction,
        mesh_size: 5.0,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Topo API error (${response.status}): ${errText.slice(0, 300)}`)
    }

    topoResult = (await response.json()) as TopoWorkerResult
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Topology optimization timed out after ${TOPO_TIMEOUT_MS / 1000}s`)
    }
    throw error
  }

  if (topoResult.error) {
    return {
      status: "failed",
      computedAt: new Date().toISOString(),
    }
  }

  // Upload visualization if available
  let visualizationUrl: string | undefined
  if (topoResult.visualization_b64) {
    try {
      visualizationUrl = await uploadAnalysisFile(
        scanId,
        `module-${module.id}/topo-viz.png`,
        topoResult.visualization_b64,
        "image/png",
      )
    } catch (error) {
      console.warn("[XRayTopo] Failed to upload visualization:", {
        error: error instanceof Error ? error.message : "Unknown",
      })
    }
  }

  // Convert regions
  const removableRegions = (topoResult.removable_regions ?? []).map((r) => ({
    name: r.name,
    centroid: r.centroid as [number, number, number],
    volumePercent: r.volume_pct,
  }))

  console.info("[XRayTopo] Topology optimization complete:", {
    moduleId: module.id,
    weightSavings: `${topoResult.weight_savings_pct ?? 0}%`,
    volumeFraction: topoResult.volume_fraction,
  })

  return {
    status: "complete",
    originalMass_kg: topoResult.original_mass_kg,
    optimizedMass_kg: topoResult.optimized_mass_kg,
    massReduction_pct: topoResult.weight_savings_pct,
    volumeFraction: topoResult.volume_fraction,
    targetVolumeFraction: topoResult.target_volume_fraction,
    removableRegions,
    visualizationUrl,
    computedAt: new Date().toISOString(),
  }
}

// ─── Storage Helpers ─────────────────────────────────────────────────

async function downloadAsBase64(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`[XRayTopo] Failed to download file: ${response.status}`)
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
    throw new Error(`[XRayTopo] Storage upload failed: ${error.message}`)
  }

  // SECURITY: Use signed URL — topology optimization results are confidential
  const { data: urlData } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 3600)

  return urlData?.signedUrl ?? ''
}
