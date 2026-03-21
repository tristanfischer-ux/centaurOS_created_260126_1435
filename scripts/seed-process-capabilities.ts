/**
 * @file seed-process-capabilities.ts — Seeds process_capabilities with ~20 manufacturing processes.
 *
 * Values from manufacturing engineering handbooks and industry standards.
 * Deterministic data — no AI generation needed.
 *
 * Usage: npx tsx scripts/seed-process-capabilities.ts
 */

import { config } from "dotenv"
import { resolve } from "path"
config({ path: resolve(process.cwd(), ".env.local") })

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PROCESSES = [
  // ─── Subtractive ──────────────────────────────────────────────────
  {
    process_name: "cnc_milling", display_name: "CNC Milling",
    tolerance_min_mm: 0.01, tolerance_typical_mm: 0.05, tolerance_max_mm: 0.1,
    surface_finish_ra_min_um: 0.4, surface_finish_ra_typical_um: 1.6,
    min_wall_thickness_mm: 0.5, max_part_size_x_mm: 2000, max_part_size_y_mm: 1000, max_part_size_z_mm: 500,
    min_feature_size_mm: 0.5, min_hole_diameter_mm: 1.0, min_internal_radius_mm: 0.5,
    process_rules: { min_tool_diameter_mm: 1.0, max_depth_to_width_ratio: 6, avoid_deep_pockets: true },
    setup_cost_usd_typical: 75, per_part_cost_multiplier: 1.0, typical_lead_time_days: 5,
    suitable_batch_sizes: ["prototype", "low_volume", "medium_volume"],
    suitable_materials: ["aluminum", "steel", "stainless_steel", "titanium", "copper", "polymer", "composite"],
    unsuitable_materials: ["elastomer", "ceramic"],
  },
  {
    process_name: "cnc_turning", display_name: "CNC Turning",
    tolerance_min_mm: 0.01, tolerance_typical_mm: 0.025, tolerance_max_mm: 0.05,
    surface_finish_ra_min_um: 0.4, surface_finish_ra_typical_um: 1.6,
    min_wall_thickness_mm: 0.5, max_part_size_x_mm: 300, max_part_size_y_mm: 300, max_part_size_z_mm: 2000,
    min_feature_size_mm: 0.3, min_hole_diameter_mm: 0.5, min_internal_radius_mm: 0.2,
    process_rules: { max_length_to_diameter_ratio: 10, requires_center_support_above: 6 },
    setup_cost_usd_typical: 50, per_part_cost_multiplier: 0.8, typical_lead_time_days: 3,
    suitable_batch_sizes: ["prototype", "low_volume", "medium_volume"],
    suitable_materials: ["aluminum", "steel", "stainless_steel", "titanium", "copper", "polymer"],
    unsuitable_materials: ["composite", "ceramic"],
  },
  {
    process_name: "wire_edm", display_name: "Wire EDM",
    tolerance_min_mm: 0.005, tolerance_typical_mm: 0.01, tolerance_max_mm: 0.025,
    surface_finish_ra_min_um: 0.1, surface_finish_ra_typical_um: 0.8,
    min_wall_thickness_mm: 0.1, max_part_size_x_mm: 500, max_part_size_y_mm: 350, max_part_size_z_mm: 300,
    min_feature_size_mm: 0.1, min_hole_diameter_mm: 0.3, min_internal_radius_mm: 0.15,
    process_rules: { requires_conductive_material: true, min_wire_diameter_mm: 0.1 },
    setup_cost_usd_typical: 100, per_part_cost_multiplier: 3.0, typical_lead_time_days: 5,
    suitable_batch_sizes: ["prototype", "low_volume"],
    suitable_materials: ["steel", "stainless_steel", "titanium", "copper"],
    unsuitable_materials: ["polymer", "ceramic", "composite"],
  },

  // ─── Sheet Metal ──────────────────────────────────────────────────
  {
    process_name: "sheet_metal_bending", display_name: "Sheet Metal Bending",
    tolerance_min_mm: 0.1, tolerance_typical_mm: 0.5, tolerance_max_mm: 1.0,
    surface_finish_ra_min_um: null, surface_finish_ra_typical_um: null,
    min_wall_thickness_mm: 0.5, max_part_size_x_mm: 3000, max_part_size_y_mm: 1500, max_part_size_z_mm: null,
    min_feature_size_mm: 2.0, min_hole_diameter_mm: null, min_internal_radius_mm: null,
    process_rules: { min_bend_radius_multiplier: 1.0, k_factor: 0.44, max_thickness_mm: 6.0, min_flange_length_mm: 8.0, min_hole_to_bend_distance_multiplier: 2.5 },
    setup_cost_usd_typical: 50, per_part_cost_multiplier: 0.3, typical_lead_time_days: 5,
    suitable_batch_sizes: ["prototype", "low_volume", "medium_volume", "high_volume"],
    suitable_materials: ["aluminum", "steel", "stainless_steel", "copper"],
    unsuitable_materials: ["titanium", "polymer", "ceramic", "composite"],
  },
  {
    process_name: "laser_cutting", display_name: "Laser Cutting",
    tolerance_min_mm: 0.05, tolerance_typical_mm: 0.1, tolerance_max_mm: 0.3,
    surface_finish_ra_min_um: 1.6, surface_finish_ra_typical_um: 3.2,
    min_wall_thickness_mm: 0.5, max_part_size_x_mm: 3000, max_part_size_y_mm: 1500, max_part_size_z_mm: 25,
    min_feature_size_mm: 0.5, min_hole_diameter_mm: 1.0, min_internal_radius_mm: 0.25,
    process_rules: { max_steel_thickness_mm: 25, max_aluminum_thickness_mm: 15, max_stainless_thickness_mm: 20, kerf_width_mm: 0.2 },
    setup_cost_usd_typical: 30, per_part_cost_multiplier: 0.2, typical_lead_time_days: 3,
    suitable_batch_sizes: ["prototype", "low_volume", "medium_volume", "high_volume"],
    suitable_materials: ["aluminum", "steel", "stainless_steel", "polymer"],
    unsuitable_materials: ["copper", "composite"],
  },
  {
    process_name: "waterjet_cutting", display_name: "Waterjet Cutting",
    tolerance_min_mm: 0.05, tolerance_typical_mm: 0.1, tolerance_max_mm: 0.3,
    surface_finish_ra_min_um: 1.6, surface_finish_ra_typical_um: 3.2,
    min_wall_thickness_mm: null, max_part_size_x_mm: 4000, max_part_size_y_mm: 2000, max_part_size_z_mm: 150,
    min_feature_size_mm: 1.0, min_hole_diameter_mm: 1.5, min_internal_radius_mm: 0.5,
    process_rules: { max_material_thickness_mm: 150, no_heat_affected_zone: true },
    setup_cost_usd_typical: 40, per_part_cost_multiplier: 0.5, typical_lead_time_days: 3,
    suitable_batch_sizes: ["prototype", "low_volume", "medium_volume"],
    suitable_materials: ["aluminum", "steel", "stainless_steel", "titanium", "composite", "ceramic"],
    unsuitable_materials: [],
  },

  // ─── Additive (3D Printing) ───────────────────────────────────────
  {
    process_name: "fdm", display_name: "FDM 3D Printing",
    tolerance_min_mm: 0.2, tolerance_typical_mm: 0.3, tolerance_max_mm: 0.5,
    surface_finish_ra_min_um: 12, surface_finish_ra_typical_um: 25,
    min_wall_thickness_mm: 0.8, max_part_size_x_mm: 300, max_part_size_y_mm: 300, max_part_size_z_mm: 400,
    min_feature_size_mm: 0.4, min_hole_diameter_mm: 2.0, min_internal_radius_mm: null,
    process_rules: { layer_height_mm_min: 0.1, layer_height_mm_typical: 0.2, support_angle_deg: 45, min_overhang_without_support_mm: 1.0, nozzle_diameter_mm: 0.4 },
    setup_cost_usd_typical: 5, per_part_cost_multiplier: 0.5, typical_lead_time_days: 1,
    suitable_batch_sizes: ["prototype", "low_volume"],
    suitable_materials: ["polymer", "elastomer"],
    unsuitable_materials: ["aluminum", "steel", "stainless_steel", "titanium", "copper", "ceramic"],
  },
  {
    process_name: "sla", display_name: "SLA 3D Printing (Resin)",
    tolerance_min_mm: 0.05, tolerance_typical_mm: 0.1, tolerance_max_mm: 0.2,
    surface_finish_ra_min_um: 1.6, surface_finish_ra_typical_um: 6.3,
    min_wall_thickness_mm: 0.5, max_part_size_x_mm: 300, max_part_size_y_mm: 300, max_part_size_z_mm: 400,
    min_feature_size_mm: 0.15, min_hole_diameter_mm: 0.5, min_internal_radius_mm: null,
    process_rules: { layer_height_mm: 0.025, requires_support_removal: true, requires_post_curing: true },
    setup_cost_usd_typical: 10, per_part_cost_multiplier: 1.5, typical_lead_time_days: 2,
    suitable_batch_sizes: ["prototype", "low_volume"],
    suitable_materials: ["polymer"],
    unsuitable_materials: ["aluminum", "steel", "titanium"],
  },
  {
    process_name: "sls", display_name: "SLS 3D Printing (Powder Bed)",
    tolerance_min_mm: 0.1, tolerance_typical_mm: 0.2, tolerance_max_mm: 0.3,
    surface_finish_ra_min_um: 6.3, surface_finish_ra_typical_um: 12,
    min_wall_thickness_mm: 0.7, max_part_size_x_mm: 340, max_part_size_y_mm: 340, max_part_size_z_mm: 600,
    min_feature_size_mm: 0.5, min_hole_diameter_mm: 1.5, min_internal_radius_mm: null,
    process_rules: { no_support_required: true, powder_removal_min_hole_mm: 3.5, min_clearance_between_parts_mm: 0.5 },
    setup_cost_usd_typical: 20, per_part_cost_multiplier: 2.0, typical_lead_time_days: 3,
    suitable_batch_sizes: ["prototype", "low_volume", "medium_volume"],
    suitable_materials: ["polymer"],
    unsuitable_materials: ["aluminum", "steel"],
  },
  {
    process_name: "dmls", display_name: "DMLS / SLM Metal 3D Printing",
    tolerance_min_mm: 0.05, tolerance_typical_mm: 0.1, tolerance_max_mm: 0.2,
    surface_finish_ra_min_um: 6.3, surface_finish_ra_typical_um: 12,
    min_wall_thickness_mm: 0.4, max_part_size_x_mm: 250, max_part_size_y_mm: 250, max_part_size_z_mm: 300,
    min_feature_size_mm: 0.3, min_hole_diameter_mm: 0.5, min_internal_radius_mm: null,
    process_rules: { requires_support_structures: true, support_angle_deg: 45, requires_stress_relief: true, min_powder_escape_hole_mm: 3 },
    setup_cost_usd_typical: 200, per_part_cost_multiplier: 10.0, typical_lead_time_days: 7,
    suitable_batch_sizes: ["prototype", "low_volume"],
    suitable_materials: ["aluminum", "steel", "stainless_steel", "titanium"],
    unsuitable_materials: ["polymer", "composite", "ceramic"],
  },

  // ─── Forming / Casting ────────────────────────────────────────────
  {
    process_name: "injection_molding", display_name: "Injection Molding",
    tolerance_min_mm: 0.05, tolerance_typical_mm: 0.1, tolerance_max_mm: 0.3,
    surface_finish_ra_min_um: 0.05, surface_finish_ra_typical_um: 0.8,
    min_wall_thickness_mm: 0.8, max_part_size_x_mm: 1000, max_part_size_y_mm: 1000, max_part_size_z_mm: 500,
    min_feature_size_mm: 0.5, min_hole_diameter_mm: 1.0, min_internal_radius_mm: 0.5,
    process_rules: { draft_angle_deg_min: 1.0, draft_angle_deg_recommended: 2.0, uniform_wall_thickness: true, max_wall_variation_percent: 25, gate_diameter_mm_typical: 2.0, ejector_pin_min_diameter_mm: 3.0, undercut_requires_side_action: true },
    setup_cost_usd_typical: 15000, per_part_cost_multiplier: 0.05, typical_lead_time_days: 42,
    suitable_batch_sizes: ["medium_volume", "high_volume"],
    suitable_materials: ["polymer", "elastomer"],
    unsuitable_materials: ["aluminum", "steel", "titanium", "ceramic"],
  },
  {
    process_name: "die_casting", display_name: "Die Casting (Aluminum/Zinc)",
    tolerance_min_mm: 0.1, tolerance_typical_mm: 0.25, tolerance_max_mm: 0.5,
    surface_finish_ra_min_um: 0.8, surface_finish_ra_typical_um: 3.2,
    min_wall_thickness_mm: 1.0, max_part_size_x_mm: 500, max_part_size_y_mm: 500, max_part_size_z_mm: 300,
    min_feature_size_mm: 1.0, min_hole_diameter_mm: 2.0, min_internal_radius_mm: 1.0,
    process_rules: { draft_angle_deg_min: 1.0, draft_angle_deg_recommended: 3.0, fillet_radius_min_mm: 1.0, parting_line_required: true },
    setup_cost_usd_typical: 25000, per_part_cost_multiplier: 0.1, typical_lead_time_days: 56,
    suitable_batch_sizes: ["high_volume"],
    suitable_materials: ["aluminum", "copper"],
    unsuitable_materials: ["steel", "titanium", "polymer"],
  },
  {
    process_name: "investment_casting", display_name: "Investment Casting (Lost Wax)",
    tolerance_min_mm: 0.1, tolerance_typical_mm: 0.25, tolerance_max_mm: 0.5,
    surface_finish_ra_min_um: 1.6, surface_finish_ra_typical_um: 3.2,
    min_wall_thickness_mm: 1.5, max_part_size_x_mm: 500, max_part_size_y_mm: 500, max_part_size_z_mm: 500,
    min_feature_size_mm: 1.0, min_hole_diameter_mm: 2.0, min_internal_radius_mm: 0.5,
    process_rules: { complex_geometry_ok: true, no_draft_required: true, ceramic_shell_max_temp_c: 1600 },
    setup_cost_usd_typical: 5000, per_part_cost_multiplier: 2.0, typical_lead_time_days: 28,
    suitable_batch_sizes: ["prototype", "low_volume", "medium_volume"],
    suitable_materials: ["steel", "stainless_steel", "titanium", "copper", "aluminum"],
    unsuitable_materials: ["polymer", "composite"],
  },
  {
    process_name: "sand_casting", display_name: "Sand Casting",
    tolerance_min_mm: 0.5, tolerance_typical_mm: 1.0, tolerance_max_mm: 2.0,
    surface_finish_ra_min_um: 6.3, surface_finish_ra_typical_um: 12.5,
    min_wall_thickness_mm: 3.0, max_part_size_x_mm: 5000, max_part_size_y_mm: 3000, max_part_size_z_mm: 2000,
    min_feature_size_mm: 5.0, min_hole_diameter_mm: 10.0, min_internal_radius_mm: 3.0,
    process_rules: { draft_angle_deg_min: 1.5, draft_angle_deg_recommended: 3.0, parting_line_required: true, core_required_for_internal_features: true },
    setup_cost_usd_typical: 2000, per_part_cost_multiplier: 0.3, typical_lead_time_days: 21,
    suitable_batch_sizes: ["prototype", "low_volume", "medium_volume"],
    suitable_materials: ["aluminum", "steel", "stainless_steel", "copper"],
    unsuitable_materials: ["titanium", "polymer"],
  },

  // ─── Joining ──────────────────────────────────────────────────────
  {
    process_name: "mig_welding", display_name: "MIG/GMAW Welding",
    tolerance_min_mm: 0.5, tolerance_typical_mm: 1.0, tolerance_max_mm: 2.0,
    surface_finish_ra_min_um: null, surface_finish_ra_typical_um: null,
    min_wall_thickness_mm: 1.0, max_part_size_x_mm: null, max_part_size_y_mm: null, max_part_size_z_mm: null,
    min_feature_size_mm: null, min_hole_diameter_mm: null, min_internal_radius_mm: null,
    process_rules: { min_joint_thickness_mm: 1.0, max_gap_mm: 2.0, requires_filler_wire: true, shielding_gas: "Argon/CO2" },
    setup_cost_usd_typical: 25, per_part_cost_multiplier: 0.5, typical_lead_time_days: 3,
    suitable_batch_sizes: ["prototype", "low_volume", "medium_volume"],
    suitable_materials: ["steel", "stainless_steel", "aluminum"],
    unsuitable_materials: ["titanium", "polymer", "composite", "ceramic"],
  },
  {
    process_name: "tig_welding", display_name: "TIG/GTAW Welding",
    tolerance_min_mm: 0.3, tolerance_typical_mm: 0.5, tolerance_max_mm: 1.0,
    surface_finish_ra_min_um: null, surface_finish_ra_typical_um: null,
    min_wall_thickness_mm: 0.5, max_part_size_x_mm: null, max_part_size_y_mm: null, max_part_size_z_mm: null,
    min_feature_size_mm: null, min_hole_diameter_mm: null, min_internal_radius_mm: null,
    process_rules: { min_joint_thickness_mm: 0.5, requires_argon_shielding: true, suitable_for_thin_gauge: true },
    setup_cost_usd_typical: 30, per_part_cost_multiplier: 1.0, typical_lead_time_days: 3,
    suitable_batch_sizes: ["prototype", "low_volume"],
    suitable_materials: ["steel", "stainless_steel", "aluminum", "titanium", "copper"],
    unsuitable_materials: ["polymer", "composite", "ceramic"],
  },
]

async function main() {
  console.log(`Seeding ${PROCESSES.length} process capabilities...`)

  const { data, error } = await supabase
    .from("process_capabilities")
    .upsert(
      PROCESSES.map(p => ({ ...p, source: "engineering_handbook", verified: true })),
      { onConflict: "process_name", ignoreDuplicates: false },
    )
    .select("process_name")

  if (error) {
    console.error("Error:", error.message)
    process.exit(1)
  }

  console.log(`✓ Inserted ${data?.length ?? 0} process capabilities`)
}

main().catch(console.error)
