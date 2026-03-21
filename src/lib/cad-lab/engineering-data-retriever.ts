/**
 * @file engineering-data-retriever.ts — Retrieves material properties, hardware specs,
 * and process capabilities from Supabase for injection into CAD generation prompts.
 *
 * INTENT: Eliminates hallucinated material properties, bolt sizes, and process tolerances
 * by injecting verified engineering handbook data into the 1M context window.
 */

import { createAdminClient } from "@/lib/supabase/admin"

export interface EngineeringDataPromptResult {
  content: string
  materialsCount: number
  hardwareCount: number
  processesCount: number
}

/**
 * Retrieves relevant engineering data and formats it for prompt injection.
 *
 * @param description - Product description
 * @param materials - Materials mentioned (e.g. ["aluminum", "stainless steel"])
 * @param processes - Processes mentioned (e.g. ["cnc", "3d printing"])
 * @returns Formatted prompt section with material properties, hardware specs, and process capabilities
 */
export async function retrieveEngineeringDataForPrompt(
  description: string,
  materials: string[] = [],
  processes: string[] = [],
): Promise<EngineeringDataPromptResult> {
  const supabase = createAdminClient()
  const lower = description.toLowerCase()
  const sections: string[] = []

  // 1. Material Properties — fetch matching materials
  const materialFamilies = detectMaterialFamilies(lower, materials)
  let materialsCount = 0

  if (materialFamilies.length > 0) {
    const { data: matData } = await supabase
      .from("material_properties")
      .select("*")
      .in("material_family", materialFamilies)
      .order("material_code")

    if (matData && matData.length > 0) {
      materialsCount = matData.length
      const matSection = matData.map(m =>
        `- **${m.material_code}** (${m.material_name}): ` +
        `ρ=${m.density_kg_m3} kg/m³, σy=${m.yield_strength_mpa ?? "N/A"} MPa, ` +
        `σu=${m.ultimate_strength_mpa ?? "N/A"} MPa, E=${m.elastic_modulus_gpa ?? "N/A"} GPa, ` +
        `k=${m.thermal_conductivity_w_mk ?? "N/A"} W/(m·K), ` +
        `Tm=${m.melting_point_c ?? "N/A"}°C, CTE=${m.coefficient_of_thermal_expansion ?? "N/A"} µm/(m·K), ` +
        `~$${m.cost_per_kg_usd ?? "?"}/kg` +
        (m.common_processes?.length ? `, processes: ${(m.common_processes as string[]).join(", ")}` : "")
      ).join("\n")

      sections.push(
        `=== MATERIAL PROPERTIES (verified engineering data — use these values, do NOT guess) ===\n${matSection}`
      )
    }
  }

  // 2. Standard Hardware — always inject bolt/nut clearance holes
  let hardwareCount = 0
  const { data: hwData } = await supabase
    .from("standard_hardware")
    .select("*")
    .in("hardware_type", ["bolt", "nut", "washer"])
    .order("designation")

  if (hwData && hwData.length > 0) {
    hardwareCount = hwData.length
    const boltSection = hwData
      .filter(h => h.hardware_type === "bolt")
      .map(h => {
        const d = h.dimensions as Record<string, number>
        return `- ${h.designation}: pitch=${d.thread_pitch_mm}mm, head_ø=${d.head_diameter_mm}mm, ` +
          `clearance_hole=${d.clearance_hole_mm}mm, tapping_drill=${d.tapping_drill_mm}mm, ` +
          `key=${d.key_size_mm}mm`
      }).join("\n")

    sections.push(
      `=== ISO METRIC FASTENERS (use these exact dimensions for bolt holes) ===\n` +
      `Socket Head Cap Screws (ISO 4762):\n${boltSection}\n\n` +
      `CRITICAL: When creating a bolt hole, use the CLEARANCE HOLE diameter from this table, NOT the bolt diameter.\n` +
      `Example: M8 bolt → 9.0mm clearance hole (NOT 8mm). M6 bolt → 6.6mm clearance hole (NOT 6mm).`
    )
  }

  // 3. Process Capabilities — fetch relevant processes
  const detectedProcesses = detectProcesses(lower, processes)
  let processesCount = 0

  if (detectedProcesses.length > 0) {
    const { data: procData } = await supabase
      .from("process_capabilities")
      .select("*")
      .in("process_name", detectedProcesses)

    if (procData && procData.length > 0) {
      processesCount = procData.length
      const procSection = procData.map(p => {
        let line = `- **${p.display_name}**: tolerance ±${p.tolerance_typical_mm}mm (best: ±${p.tolerance_min_mm}mm), ` +
          `min wall: ${p.min_wall_thickness_mm ?? "N/A"}mm`
        if (p.min_feature_size_mm) line += `, min feature: ${p.min_feature_size_mm}mm`
        if (p.min_hole_diameter_mm) line += `, min hole: ${p.min_hole_diameter_mm}mm`

        // Process-specific rules
        const rules = p.process_rules as Record<string, unknown> | null
        if (rules) {
          if (rules.draft_angle_deg_min) line += `, draft angle ≥ ${rules.draft_angle_deg_min}°`
          if (rules.layer_height_mm_typical) line += `, layer: ${rules.layer_height_mm_typical}mm`
          if (rules.support_angle_deg) line += `, supports needed above ${rules.support_angle_deg}° overhang`
          if (rules.min_bend_radius_multiplier) line += `, min bend radius = ${rules.min_bend_radius_multiplier}× thickness`
        }
        return line
      }).join("\n")

      sections.push(
        `=== MANUFACTURING PROCESS CONSTRAINTS (design within these limits) ===\n${procSection}`
      )
    }
  }

  if (sections.length === 0) {
    return { content: "", materialsCount: 0, hardwareCount: 0, processesCount: 0 }
  }

  return {
    content: sections.join("\n\n"),
    materialsCount,
    hardwareCount,
    processesCount,
  }
}

// ─── Detection Helpers ──────────────────────────────────────────────

function detectMaterialFamilies(text: string, materials: string[]): string[] {
  const combined = text + " " + materials.join(" ").toLowerCase()
  const families: string[] = []
  const MATERIAL_KEYWORDS: Record<string, string[]> = {
    aluminum: ["aluminum", "aluminium", "6061", "7075", "5083", "2024", "alu"],
    steel: ["steel", "1018", "4140", "a36", "carbon steel", "mild steel"],
    stainless_steel: ["stainless", "304", "316", "17-4", "inox"],
    titanium: ["titanium", "ti-6al", "ti64", "grade 5"],
    copper: ["copper", "brass", "bronze", "c110", "c360"],
    polymer: ["plastic", "abs", "pla", "petg", "nylon", "polycarbonate", "pc", "peek", "hdpe", "pp", "pom", "delrin", "acetal", "polymer"],
    elastomer: ["rubber", "silicone", "tpu", "nbr", "elastomer", "gasket", "seal", "o-ring"],
    composite: ["carbon fiber", "cfrp", "fiberglass", "gfrp", "composite", "kevlar", "aramid", "laminate"],
    ceramic: ["ceramic", "alumina", "zirconia"],
    wood: ["wood", "plywood", "timber", "mdf", "birch"],
  }

  for (const [family, keywords] of Object.entries(MATERIAL_KEYWORDS)) {
    if (keywords.some(kw => combined.includes(kw))) {
      families.push(family)
    }
  }

  return families
}

function detectProcesses(text: string, processes: string[]): string[] {
  const combined = text + " " + processes.join(" ").toLowerCase()
  const detected: string[] = []
  const PROCESS_KEYWORDS: Record<string, string[]> = {
    cnc_milling: ["cnc", "milling", "machined", "machining"],
    cnc_turning: ["turning", "lathe", "turned"],
    sheet_metal_bending: ["sheet metal", "bent", "bending", "folded", "bracket"],
    laser_cutting: ["laser cut", "laser cutting"],
    waterjet_cutting: ["waterjet", "water jet"],
    fdm: ["fdm", "3d print", "3d-print", "filament", "fff"],
    sla: ["sla", "resin print", "stereolithography"],
    sls: ["sls", "powder bed", "nylon print"],
    dmls: ["dmls", "slm", "metal print", "metal 3d"],
    injection_molding: ["injection mold", "injection mould", "molded", "moulded"],
    die_casting: ["die cast", "diecast"],
    investment_casting: ["investment cast", "lost wax"],
    sand_casting: ["sand cast"],
    mig_welding: ["mig weld", "gmaw"],
    tig_welding: ["tig weld", "gtaw"],
  }

  for (const [process, keywords] of Object.entries(PROCESS_KEYWORDS)) {
    if (keywords.some(kw => combined.includes(kw))) {
      detected.push(process)
    }
  }

  return detected
}
