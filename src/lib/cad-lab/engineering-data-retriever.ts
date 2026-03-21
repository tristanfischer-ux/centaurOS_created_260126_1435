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
  /** Material codes applied (e.g. ["6061-T6", "GRP"]) — for UI display */
  materialCodes: string[]
  /** Material family names detected (e.g. ["aluminum", "composite"]) */
  materialFamilies: string[]
  /** Process display names applied (e.g. ["CNC Milling", "FDM"]) */
  processNames: string[]
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

  // Track metadata for UI display
  let appliedMaterialCodes: string[] = []
  let appliedProcessNames: string[] = []

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
      appliedMaterialCodes = matData.map(m => m.material_code as string)
      const fmt = (v: unknown, unit: string) => v != null ? `${v} ${unit}` : "N/A"
      const matSection = matData.map(m =>
        `- **${m.material_code}** (${m.material_name}): ` +
        `ρ=${fmt(m.density_kg_m3, "kg/m³")}, σy=${fmt(m.yield_strength_mpa, "MPa")}, ` +
        `σu=${fmt(m.ultimate_strength_mpa, "MPa")}, E=${fmt(m.elastic_modulus_gpa, "GPa")}, ` +
        `k=${fmt(m.thermal_conductivity_w_mk, "W/(m·K)")}, ` +
        `Tm=${fmt(m.melting_point_c, "°C")}, CTE=${fmt(m.coefficient_of_thermal_expansion, "µm/(m·K)")}, ` +
        `~$${m.cost_per_kg_usd ?? "?"}/kg` +
        (m.common_processes?.length ? `, processes: ${(m.common_processes as string[]).join(", ")}` : "")
      ).join("\n")

      sections.push(
        `=== MATERIAL PROPERTIES (verified engineering data — use these values, do NOT guess) ===\n${matSection}`
      )
    }
  }

  // 2. Standard Hardware — inject bolt/nut clearance holes when fasteners are likely relevant
  const FASTENER_SIGNALS = /\b(bolt|screw|nut|washer|fastener|mount|bracket|flange|clamp|assembly|enclosure|frame|chassis)\b/i
  let hardwareCount = 0
  const combinedForFasteners = lower + " " + materials.join(" ").toLowerCase() + " " + processes.join(" ").toLowerCase()
  const needsFasteners = FASTENER_SIGNALS.test(combinedForFasteners)

  const { data: hwData } = needsFasteners ? await supabase
    .from("standard_hardware")
    .select("*")
    .in("hardware_type", ["bolt", "nut", "washer"])
    .order("designation") : { data: null }

  if (hwData && hwData.length > 0) {
    hardwareCount = hwData.length
    const boltSection = hwData
      .filter(h => h.hardware_type === "bolt")
      .map(h => {
        const d = h.dimensions as Record<string, unknown>
        const n = (key: string) => typeof d[key] === "number" ? d[key] : Number(d[key]) || 0
        return `- ${h.designation}: pitch=${n("thread_pitch_mm")}mm, head_ø=${n("head_diameter_mm")}mm, ` +
          `clearance_hole=${n("clearance_hole_mm")}mm, tapping_drill=${n("tapping_drill_mm")}mm, ` +
          `key=${n("key_size_mm")}mm`
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
      appliedProcessNames = procData.map(p => p.display_name as string)
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
    return { content: "", materialsCount: 0, hardwareCount: 0, processesCount: 0, materialCodes: [], materialFamilies: [], processNames: [] }
  }

  return {
    content: sections.join("\n\n"),
    materialsCount,
    hardwareCount,
    processesCount,
    materialCodes: appliedMaterialCodes,
    materialFamilies,
    processNames: appliedProcessNames,
  }
}

// ─── Detection Helpers ──────────────────────────────────────────────

function detectMaterialFamilies(text: string, materials: string[]): string[] {
  const combined = text + " " + materials.join(" ").toLowerCase()
  const families: string[] = []

  // DECISION: Use word-boundary regex to prevent "car"→"carbon", "pp"→"copper" false positives.
  // Multi-word keywords use includes() (no boundary issue). Short keywords (<4 chars) use \b.
  const MATERIAL_KEYWORDS: Record<string, RegExp[]> = {
    aluminum: [/\baluminu?m\b/i, /\b6061\b/, /\b7075\b/, /\b5083\b/, /\b2024\b/],
    steel: [/\bsteel\b/i, /\b1018\b/, /\b4140\b/, /\ba36\b/i, /\bcarbon steel\b/i, /\bmild steel\b/i],
    stainless_steel: [/\bstainless\b/i, /\b304\b/, /\b316\b/, /\b17-4\b/, /\binox\b/i],
    titanium: [/\btitanium\b/i, /\bti-6al\b/i, /\bti64\b/i],
    copper: [/\bcopper\b/i, /\bbrass\b/i, /\bbronze\b/i],
    polymer: [/\bplastic\b/i, /\babs\b/i, /\bpla\b/i, /\bpetg\b/i, /\bnylon\b/i, /\bpolycarbonate\b/i, /\bpeek\b/i, /\bhdpe\b/i, /\bdelrin\b/i, /\bacetal\b/i, /\bpolymer\b/i, /\bpolypropylene\b/i],
    elastomer: [/\brubber\b/i, /\bsilicone\b/i, /\btpu\b/i, /\belastomer\b/i, /\bgasket\b/i, /\bo-ring\b/i],
    composite: [/\bcarbon fiber\b/i, /\bcfrp\b/i, /\bfiberglass\b/i, /\bgfrp\b/i, /\bcomposite\b/i, /\bkevlar\b/i, /\baramid\b/i, /\blaminate\b/i],
    ceramic: [/\bceramic\b/i, /\balumina\b/i, /\bzirconia\b/i],
    wood: [/\bwood\b/i, /\bplywood\b/i, /\btimber\b/i, /\bmdf\b/i, /\bbirch\b/i],
  }

  for (const [family, regexes] of Object.entries(MATERIAL_KEYWORDS)) {
    if (regexes.some(r => r.test(combined))) {
      families.push(family)
    }
  }

  return families
}

function detectProcesses(text: string, processes: string[]): string[] {
  const combined = text + " " + processes.join(" ").toLowerCase()
  const detected: string[] = []

  // Multi-word keywords use includes() (safe from false positives).
  // Short keywords use word-boundary regex.
  const PROCESS_KEYWORDS: Record<string, RegExp[]> = {
    cnc_milling: [/\bcnc\b/i, /\bmilling\b/i, /\bmachined\b/i, /\bmachining\b/i],
    cnc_turning: [/\bturning\b/i, /\blathe\b/i, /\bturned\b/i],
    sheet_metal_bending: [/\bsheet metal\b/i, /\bbending\b/i, /\bbracket\b/i],
    laser_cutting: [/\blaser cut/i, /\blaser cutting\b/i],
    waterjet_cutting: [/\bwaterjet\b/i, /\bwater jet\b/i],
    fdm: [/\bfdm\b/i, /\b3d print/i, /\bfilament\b/i, /\bfff\b/i],
    sla: [/\bsla\b/i, /\bresin print/i, /\bstereolithography\b/i],
    sls: [/\bsls\b/i, /\bpowder bed\b/i],
    dmls: [/\bdmls\b/i, /\bslm\b/i, /\bmetal print/i, /\bmetal 3d/i],
    injection_molding: [/\binjection mold/i, /\binjection mould/i, /\bmolded\b/i, /\bmoulded\b/i],
    die_casting: [/\bdie cast/i, /\bdiecast/i],
    investment_casting: [/\binvestment cast/i, /\blost wax\b/i],
    sand_casting: [/\bsand cast/i],
    mig_welding: [/\bmig weld/i, /\bgmaw\b/i],
    tig_welding: [/\btig weld/i, /\bgtaw\b/i],
  }

  for (const [process, regexes] of Object.entries(PROCESS_KEYWORDS)) {
    if (regexes.some(r => r.test(combined))) {
      detected.push(process)
    }
  }

  return detected
}
