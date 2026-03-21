/**
 * @file seed-standard-hardware.ts — Seeds standard_hardware with ISO metric fasteners.
 *
 * Values from ISO 4762 (socket head cap screws), ISO 4032 (hex nuts), ISO 7089 (plain washers).
 * These are exact published dimensions — no AI generation needed.
 *
 * Usage: npx tsx scripts/seed-standard-hardware.ts
 */

import { config } from "dotenv"
import { resolve } from "path"
config({ path: resolve(process.cwd(), ".env.local") })

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ISO 4762 Socket Head Cap Screws — M2 through M24
const SOCKET_HEAD_BOLTS = [
  { designation: "M2", dimensions: { thread_pitch_mm: 0.4, head_diameter_mm: 3.8, head_height_mm: 2.0, clearance_hole_mm: 2.4, close_fit_hole_mm: 2.2, tapping_drill_mm: 1.6, key_size_mm: 1.5 } },
  { designation: "M2.5", dimensions: { thread_pitch_mm: 0.45, head_diameter_mm: 4.5, head_height_mm: 2.5, clearance_hole_mm: 2.9, close_fit_hole_mm: 2.7, tapping_drill_mm: 2.05, key_size_mm: 2.0 } },
  { designation: "M3", dimensions: { thread_pitch_mm: 0.5, head_diameter_mm: 5.5, head_height_mm: 3.0, clearance_hole_mm: 3.4, close_fit_hole_mm: 3.2, tapping_drill_mm: 2.5, key_size_mm: 2.5 } },
  { designation: "M4", dimensions: { thread_pitch_mm: 0.7, head_diameter_mm: 7.0, head_height_mm: 4.0, clearance_hole_mm: 4.5, close_fit_hole_mm: 4.3, tapping_drill_mm: 3.3, key_size_mm: 3.0 } },
  { designation: "M5", dimensions: { thread_pitch_mm: 0.8, head_diameter_mm: 8.5, head_height_mm: 5.0, clearance_hole_mm: 5.5, close_fit_hole_mm: 5.3, tapping_drill_mm: 4.2, key_size_mm: 4.0 } },
  { designation: "M6", dimensions: { thread_pitch_mm: 1.0, head_diameter_mm: 10.0, head_height_mm: 6.0, clearance_hole_mm: 6.6, close_fit_hole_mm: 6.4, tapping_drill_mm: 5.0, key_size_mm: 5.0 } },
  { designation: "M8", dimensions: { thread_pitch_mm: 1.25, head_diameter_mm: 13.0, head_height_mm: 8.0, clearance_hole_mm: 9.0, close_fit_hole_mm: 8.4, tapping_drill_mm: 6.8, key_size_mm: 6.0 } },
  { designation: "M10", dimensions: { thread_pitch_mm: 1.5, head_diameter_mm: 16.0, head_height_mm: 10.0, clearance_hole_mm: 11.0, close_fit_hole_mm: 10.5, tapping_drill_mm: 8.5, key_size_mm: 8.0 } },
  { designation: "M12", dimensions: { thread_pitch_mm: 1.75, head_diameter_mm: 18.0, head_height_mm: 12.0, clearance_hole_mm: 13.5, close_fit_hole_mm: 13.0, tapping_drill_mm: 10.2, key_size_mm: 10.0 } },
  { designation: "M14", dimensions: { thread_pitch_mm: 2.0, head_diameter_mm: 21.0, head_height_mm: 14.0, clearance_hole_mm: 15.5, close_fit_hole_mm: 15.0, tapping_drill_mm: 12.0, key_size_mm: 12.0 } },
  { designation: "M16", dimensions: { thread_pitch_mm: 2.0, head_diameter_mm: 24.0, head_height_mm: 16.0, clearance_hole_mm: 17.5, close_fit_hole_mm: 17.0, tapping_drill_mm: 14.0, key_size_mm: 14.0 } },
  { designation: "M20", dimensions: { thread_pitch_mm: 2.5, head_diameter_mm: 30.0, head_height_mm: 20.0, clearance_hole_mm: 22.0, close_fit_hole_mm: 21.0, tapping_drill_mm: 17.5, key_size_mm: 17.0 } },
  { designation: "M24", dimensions: { thread_pitch_mm: 3.0, head_diameter_mm: 36.0, head_height_mm: 24.0, clearance_hole_mm: 26.0, close_fit_hole_mm: 25.0, tapping_drill_mm: 21.0, key_size_mm: 19.0 } },
]

// ISO 4032 Hex Nuts
const HEX_NUTS = [
  { designation: "M3", dimensions: { across_flats_mm: 5.5, height_mm: 2.4, thread_pitch_mm: 0.5 } },
  { designation: "M4", dimensions: { across_flats_mm: 7.0, height_mm: 3.2, thread_pitch_mm: 0.7 } },
  { designation: "M5", dimensions: { across_flats_mm: 8.0, height_mm: 4.7, thread_pitch_mm: 0.8 } },
  { designation: "M6", dimensions: { across_flats_mm: 10.0, height_mm: 5.2, thread_pitch_mm: 1.0 } },
  { designation: "M8", dimensions: { across_flats_mm: 13.0, height_mm: 6.8, thread_pitch_mm: 1.25 } },
  { designation: "M10", dimensions: { across_flats_mm: 16.0, height_mm: 8.4, thread_pitch_mm: 1.5 } },
  { designation: "M12", dimensions: { across_flats_mm: 18.0, height_mm: 10.8, thread_pitch_mm: 1.75 } },
  { designation: "M16", dimensions: { across_flats_mm: 24.0, height_mm: 14.8, thread_pitch_mm: 2.0 } },
  { designation: "M20", dimensions: { across_flats_mm: 30.0, height_mm: 18.0, thread_pitch_mm: 2.5 } },
]

// ISO 7089 Plain Washers (Form A)
const PLAIN_WASHERS = [
  { designation: "M3", dimensions: { inner_diameter_mm: 3.2, outer_diameter_mm: 7.0, thickness_mm: 0.5 } },
  { designation: "M4", dimensions: { inner_diameter_mm: 4.3, outer_diameter_mm: 9.0, thickness_mm: 0.8 } },
  { designation: "M5", dimensions: { inner_diameter_mm: 5.3, outer_diameter_mm: 10.0, thickness_mm: 1.0 } },
  { designation: "M6", dimensions: { inner_diameter_mm: 6.4, outer_diameter_mm: 12.0, thickness_mm: 1.6 } },
  { designation: "M8", dimensions: { inner_diameter_mm: 8.4, outer_diameter_mm: 16.0, thickness_mm: 1.6 } },
  { designation: "M10", dimensions: { inner_diameter_mm: 10.5, outer_diameter_mm: 20.0, thickness_mm: 2.0 } },
  { designation: "M12", dimensions: { inner_diameter_mm: 13.0, outer_diameter_mm: 24.0, thickness_mm: 2.5 } },
  { designation: "M16", dimensions: { inner_diameter_mm: 17.0, outer_diameter_mm: 30.0, thickness_mm: 3.0 } },
  { designation: "M20", dimensions: { inner_diameter_mm: 21.0, outer_diameter_mm: 37.0, thickness_mm: 3.0 } },
]

// Common bearings (deep groove ball bearings — 6000 series)
const BEARINGS = [
  { designation: "608-2RS", dimensions: { bore_mm: 8, outer_diameter_mm: 22, width_mm: 7, dynamic_load_kn: 3.45, static_load_kn: 1.37, max_rpm: 30000 } },
  { designation: "6001-2RS", dimensions: { bore_mm: 12, outer_diameter_mm: 28, width_mm: 8, dynamic_load_kn: 5.07, static_load_kn: 2.36, max_rpm: 26000 } },
  { designation: "6002-2RS", dimensions: { bore_mm: 15, outer_diameter_mm: 32, width_mm: 9, dynamic_load_kn: 5.59, static_load_kn: 2.85, max_rpm: 22000 } },
  { designation: "6003-2RS", dimensions: { bore_mm: 17, outer_diameter_mm: 35, width_mm: 10, dynamic_load_kn: 6.05, static_load_kn: 3.25, max_rpm: 20000 } },
  { designation: "6004-2RS", dimensions: { bore_mm: 20, outer_diameter_mm: 42, width_mm: 12, dynamic_load_kn: 9.36, static_load_kn: 5.0, max_rpm: 17000 } },
  { designation: "6005-2RS", dimensions: { bore_mm: 25, outer_diameter_mm: 47, width_mm: 12, dynamic_load_kn: 10.1, static_load_kn: 5.85, max_rpm: 15000 } },
  { designation: "6006-2RS", dimensions: { bore_mm: 30, outer_diameter_mm: 55, width_mm: 13, dynamic_load_kn: 13.3, static_load_kn: 8.3, max_rpm: 13000 } },
  { designation: "6200-2RS", dimensions: { bore_mm: 10, outer_diameter_mm: 30, width_mm: 9, dynamic_load_kn: 5.07, static_load_kn: 2.36, max_rpm: 22000 } },
  { designation: "6201-2RS", dimensions: { bore_mm: 12, outer_diameter_mm: 32, width_mm: 10, dynamic_load_kn: 6.89, static_load_kn: 3.1, max_rpm: 20000 } },
  { designation: "6202-2RS", dimensions: { bore_mm: 15, outer_diameter_mm: 35, width_mm: 11, dynamic_load_kn: 7.65, static_load_kn: 3.75, max_rpm: 18000 } },
  { designation: "6203-2RS", dimensions: { bore_mm: 17, outer_diameter_mm: 40, width_mm: 12, dynamic_load_kn: 9.56, static_load_kn: 4.75, max_rpm: 16000 } },
  { designation: "6204-2RS", dimensions: { bore_mm: 20, outer_diameter_mm: 47, width_mm: 14, dynamic_load_kn: 12.7, static_load_kn: 6.55, max_rpm: 14000 } },
  { designation: "6205-2RS", dimensions: { bore_mm: 25, outer_diameter_mm: 52, width_mm: 15, dynamic_load_kn: 14.0, static_load_kn: 7.8, max_rpm: 12000 } },
]

async function main() {
  console.log("Seeding standard hardware...")

  const allRows = [
    ...SOCKET_HEAD_BOLTS.map(b => ({
      hardware_type: "bolt",
      standard: "ISO 4762",
      designation: b.designation,
      dimensions: b.dimensions,
      strength_grades: ["8.8", "10.9", "12.9", "A2-70", "A4-80"],
      material_options: ["carbon_steel", "stainless_A2", "stainless_A4"],
      torque_specs: {},
      source: "iso_standard",
    })),
    ...HEX_NUTS.map(n => ({
      hardware_type: "nut",
      standard: "ISO 4032",
      designation: n.designation,
      dimensions: n.dimensions,
      strength_grades: ["8", "10", "12", "A2-70", "A4-80"],
      material_options: ["carbon_steel", "stainless_A2", "stainless_A4"],
      torque_specs: {},
      source: "iso_standard",
    })),
    ...PLAIN_WASHERS.map(w => ({
      hardware_type: "washer",
      standard: "ISO 7089",
      designation: w.designation,
      dimensions: w.dimensions,
      strength_grades: [],
      material_options: ["carbon_steel_zinc", "stainless_A2", "stainless_A4"],
      torque_specs: {},
      source: "iso_standard",
    })),
    ...BEARINGS.map(b => ({
      hardware_type: "bearing",
      standard: "ISO 15",
      designation: b.designation,
      dimensions: b.dimensions,
      strength_grades: [],
      material_options: ["chrome_steel_52100"],
      torque_specs: {},
      source: "iso_standard",
    })),
  ]

  const { data, error } = await supabase
    .from("standard_hardware")
    .upsert(allRows, { onConflict: "standard,designation", ignoreDuplicates: false })
    .select("designation")

  if (error) {
    console.error("Error:", error.message)
    process.exit(1)
  }

  console.log(`✓ Inserted ${data?.length ?? 0} hardware items`)
  console.log(`  ${SOCKET_HEAD_BOLTS.length} socket head cap screws (ISO 4762)`)
  console.log(`  ${HEX_NUTS.length} hex nuts (ISO 4032)`)
  console.log(`  ${PLAIN_WASHERS.length} plain washers (ISO 7089)`)
  console.log(`  ${BEARINGS.length} deep groove ball bearings`)
}

main().catch(console.error)
