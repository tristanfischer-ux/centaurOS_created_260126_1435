/**
 * @file standard-parts.ts — Standard parts library for engineering calculations.
 *
 * @description Lookup tables for the most commonly needed fasteners, bearings,
 * and seals. All dimensions are sourced from ISO / DIN / AS568 standards and
 * are suitable for real engineering calculations — do NOT treat these as
 * approximations.
 *
 * @related
 * - Index / cross-domain queries: src/lib/engineering-data/index.ts
 * - Manufacturing techniques: src/lib/manufacturing-techniques/index.ts
 *
 * @standards
 * - Metric Socket Head Cap Screws: ISO 4762 / DIN 912
 * - Metric Hex Nuts: ISO 4032
 * - Metric Washers: ISO 7089 (standard), ISO 7093 (large)
 * - Ball Bearings: ISO 15 (deep groove, 6000/6200 series)
 * - O-Rings: AS568 (SAE)
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface MetricBolt {
  /** Nominal thread size, e.g. "M2", "M10" */
  size: string
  /** Standard (coarse) thread pitch in mm */
  pitch_mm: number
  /** Head diameter (max) in mm — ISO 4762 dk */
  head_diameter_mm: number
  /** Head height (max) in mm — ISO 4762 k */
  head_height_mm: number
  /** Socket (Allen key) size in mm — ISO 4762 s */
  socket_size_mm: number
  /** Thread minor diameter in mm (d3 per ISO 724) */
  thread_minor_diameter_mm: number
  /** Proof load in kN per property class */
  proof_load_kn: { class_8_8: number; class_10_9: number; class_12_9: number }
  /** Recommended tightening torque in Nm (dry, K=0.2) */
  recommended_torque_nm: { class_8_8: number; class_10_9: number; class_12_9: number }
  /** Standard clearance hole diameter (medium fit, ISO 273) in mm */
  clearance_hole_mm: number
  /** Counterbore diameter in mm */
  counterbore_diameter_mm: number
}

export interface MetricNut {
  /** Nominal thread size, e.g. "M2", "M10" */
  size: string
  /** Standard (coarse) thread pitch in mm */
  pitch_mm: number
  /** Width across flats in mm — ISO 4032 s */
  width_across_flats_mm: number
  /** Nut thickness (height) in mm — ISO 4032 m */
  thickness_mm: number
  /** Proof load in kN per property class */
  proof_load_kn: { class_8: number; class_10: number }
}

export interface MetricWasher {
  /** Nominal bolt size, e.g. "M2", "M10" */
  size: string
  /** Inner diameter in mm — d1 */
  inner_diameter_mm: number
  /** Outer diameter in mm — d2 */
  outer_diameter_mm: number
  /** Thickness in mm — h */
  thickness_mm: number
  /** Standard (ISO 7089) or Large (ISO 7093) */
  type: "standard" | "large"
}

export interface BallBearing {
  /** Bearing designation, e.g. "6000", "6205" */
  designation: string
  /** Bore diameter in mm — d */
  bore_mm: number
  /** Outer diameter in mm — D */
  outer_diameter_mm: number
  /** Width in mm — B */
  width_mm: number
  /** Basic dynamic load rating in kN — C */
  dynamic_load_kn: number
  /** Basic static load rating in kN — C0 */
  static_load_kn: number
  /** Limiting speed (grease lubrication) in rpm */
  max_rpm: number
  /** Available seal/shield configurations */
  seal_options: string[]
}

export interface ORing {
  /** Designation: AS568 number or metric "IDxCS" */
  designation: string
  /** Inner diameter in mm */
  inner_diameter_mm: number
  /** Cross-section diameter in mm */
  cross_section_mm: number
  /** Outer diameter in mm (computed: ID + 2*CS) */
  outer_diameter_mm: number
}

// ---------------------------------------------------------------------------
// Data — Metric Socket Head Cap Screws (ISO 4762 / DIN 912)
// ---------------------------------------------------------------------------

// INTENT: Real ISO 4762 dimensions. Proof loads per ISO 898-1 stress area.
// Torque values computed with K=0.2 (dry steel-on-steel), T = K * d * F_proof.

const METRIC_BOLTS: MetricBolt[] = [
  {
    size: "M2",
    pitch_mm: 0.4,
    head_diameter_mm: 3.8,
    head_height_mm: 2.0,
    socket_size_mm: 1.5,
    thread_minor_diameter_mm: 1.509,
    proof_load_kn: { class_8_8: 1.79, class_10_9: 2.53, class_12_9: 2.94 },
    recommended_torque_nm: { class_8_8: 0.72, class_10_9: 1.01, class_12_9: 1.18 },
    clearance_hole_mm: 2.4,
    counterbore_diameter_mm: 4.4,
  },
  {
    size: "M2.5",
    pitch_mm: 0.45,
    head_diameter_mm: 4.5,
    head_height_mm: 2.5,
    socket_size_mm: 2.0,
    thread_minor_diameter_mm: 1.948,
    proof_load_kn: { class_8_8: 2.94, class_10_9: 4.15, class_12_9: 4.83 },
    recommended_torque_nm: { class_8_8: 1.47, class_10_9: 2.08, class_12_9: 2.42 },
    clearance_hole_mm: 2.9,
    counterbore_diameter_mm: 5.4,
  },
  {
    size: "M3",
    pitch_mm: 0.5,
    head_diameter_mm: 5.5,
    head_height_mm: 3.0,
    socket_size_mm: 2.5,
    thread_minor_diameter_mm: 2.387,
    proof_load_kn: { class_8_8: 4.34, class_10_9: 6.13, class_12_9: 7.13 },
    recommended_torque_nm: { class_8_8: 2.6, class_10_9: 3.68, class_12_9: 4.28 },
    clearance_hole_mm: 3.4,
    counterbore_diameter_mm: 6.5,
  },
  {
    size: "M4",
    pitch_mm: 0.7,
    head_diameter_mm: 7.0,
    head_height_mm: 4.0,
    socket_size_mm: 3.0,
    thread_minor_diameter_mm: 3.141,
    proof_load_kn: { class_8_8: 7.92, class_10_9: 11.2, class_12_9: 13.0 },
    recommended_torque_nm: { class_8_8: 6.34, class_10_9: 8.96, class_12_9: 10.4 },
    clearance_hole_mm: 4.5,
    counterbore_diameter_mm: 8.0,
  },
  {
    size: "M5",
    pitch_mm: 0.8,
    head_diameter_mm: 8.5,
    head_height_mm: 5.0,
    socket_size_mm: 4.0,
    thread_minor_diameter_mm: 4.019,
    proof_load_kn: { class_8_8: 12.7, class_10_9: 17.9, class_12_9: 20.8 },
    recommended_torque_nm: { class_8_8: 12.7, class_10_9: 17.9, class_12_9: 20.8 },
    clearance_hole_mm: 5.5,
    counterbore_diameter_mm: 9.5,
  },
  {
    size: "M6",
    pitch_mm: 1.0,
    head_diameter_mm: 10.0,
    head_height_mm: 6.0,
    socket_size_mm: 5.0,
    thread_minor_diameter_mm: 4.773,
    proof_load_kn: { class_8_8: 18.1, class_10_9: 25.5, class_12_9: 29.7 },
    recommended_torque_nm: { class_8_8: 21.7, class_10_9: 30.6, class_12_9: 35.6 },
    clearance_hole_mm: 6.6,
    counterbore_diameter_mm: 11.0,
  },
  {
    size: "M8",
    pitch_mm: 1.25,
    head_diameter_mm: 13.0,
    head_height_mm: 8.0,
    socket_size_mm: 6.0,
    thread_minor_diameter_mm: 6.466,
    proof_load_kn: { class_8_8: 33.1, class_10_9: 46.7, class_12_9: 54.3 },
    recommended_torque_nm: { class_8_8: 53.0, class_10_9: 74.7, class_12_9: 86.9 },
    clearance_hole_mm: 9.0,
    counterbore_diameter_mm: 14.5,
  },
  {
    size: "M10",
    pitch_mm: 1.5,
    head_diameter_mm: 16.0,
    head_height_mm: 10.0,
    socket_size_mm: 8.0,
    thread_minor_diameter_mm: 8.160,
    proof_load_kn: { class_8_8: 52.3, class_10_9: 73.8, class_12_9: 85.8 },
    recommended_torque_nm: { class_8_8: 105, class_10_9: 148, class_12_9: 172 },
    clearance_hole_mm: 11.0,
    counterbore_diameter_mm: 17.5,
  },
  {
    size: "M12",
    pitch_mm: 1.75,
    head_diameter_mm: 18.0,
    head_height_mm: 12.0,
    socket_size_mm: 10.0,
    thread_minor_diameter_mm: 9.853,
    proof_load_kn: { class_8_8: 76.2, class_10_9: 108, class_12_9: 125 },
    recommended_torque_nm: { class_8_8: 183, class_10_9: 259, class_12_9: 300 },
    clearance_hole_mm: 13.5,
    counterbore_diameter_mm: 20.0,
  },
  {
    size: "M14",
    pitch_mm: 2.0,
    head_diameter_mm: 21.0,
    head_height_mm: 14.0,
    socket_size_mm: 12.0,
    thread_minor_diameter_mm: 11.546,
    proof_load_kn: { class_8_8: 104, class_10_9: 147, class_12_9: 171 },
    recommended_torque_nm: { class_8_8: 291, class_10_9: 412, class_12_9: 479 },
    clearance_hole_mm: 15.5,
    counterbore_diameter_mm: 23.0,
  },
  {
    size: "M16",
    pitch_mm: 2.0,
    head_diameter_mm: 24.0,
    head_height_mm: 16.0,
    socket_size_mm: 14.0,
    thread_minor_diameter_mm: 13.546,
    proof_load_kn: { class_8_8: 141, class_10_9: 199, class_12_9: 232 },
    recommended_torque_nm: { class_8_8: 451, class_10_9: 637, class_12_9: 742 },
    clearance_hole_mm: 17.5,
    counterbore_diameter_mm: 26.0,
  },
  {
    size: "M20",
    pitch_mm: 2.5,
    head_diameter_mm: 30.0,
    head_height_mm: 20.0,
    socket_size_mm: 17.0,
    thread_minor_diameter_mm: 16.933,
    proof_load_kn: { class_8_8: 219, class_10_9: 309, class_12_9: 360 },
    recommended_torque_nm: { class_8_8: 876, class_10_9: 1236, class_12_9: 1440 },
    clearance_hole_mm: 22.0,
    counterbore_diameter_mm: 33.0,
  },
]

// ---------------------------------------------------------------------------
// Data — Metric Hex Nuts (ISO 4032)
// ---------------------------------------------------------------------------

const METRIC_NUTS: MetricNut[] = [
  { size: "M2", pitch_mm: 0.4, width_across_flats_mm: 4.0, thickness_mm: 1.6, proof_load_kn: { class_8: 1.53, class_10: 1.90 } },
  { size: "M2.5", pitch_mm: 0.45, width_across_flats_mm: 5.0, thickness_mm: 2.0, proof_load_kn: { class_8: 2.54, class_10: 3.15 } },
  { size: "M3", pitch_mm: 0.5, width_across_flats_mm: 5.5, thickness_mm: 2.4, proof_load_kn: { class_8: 3.77, class_10: 4.68 } },
  { size: "M4", pitch_mm: 0.7, width_across_flats_mm: 7.0, thickness_mm: 3.2, proof_load_kn: { class_8: 6.82, class_10: 8.46 } },
  { size: "M5", pitch_mm: 0.8, width_across_flats_mm: 8.0, thickness_mm: 4.7, proof_load_kn: { class_8: 11.6, class_10: 14.4 } },
  { size: "M6", pitch_mm: 1.0, width_across_flats_mm: 10.0, thickness_mm: 5.2, proof_load_kn: { class_8: 16.3, class_10: 20.2 } },
  { size: "M8", pitch_mm: 1.25, width_across_flats_mm: 13.0, thickness_mm: 6.8, proof_load_kn: { class_8: 30.1, class_10: 37.3 } },
  { size: "M10", pitch_mm: 1.5, width_across_flats_mm: 16.0, thickness_mm: 8.4, proof_load_kn: { class_8: 48.1, class_10: 59.7 } },
  { size: "M12", pitch_mm: 1.75, width_across_flats_mm: 18.0, thickness_mm: 10.8, proof_load_kn: { class_8: 71.3, class_10: 88.5 } },
  { size: "M14", pitch_mm: 2.0, width_across_flats_mm: 21.0, thickness_mm: 12.8, proof_load_kn: { class_8: 98.5, class_10: 122 } },
  { size: "M16", pitch_mm: 2.0, width_across_flats_mm: 24.0, thickness_mm: 14.8, proof_load_kn: { class_8: 133, class_10: 165 } },
  { size: "M20", pitch_mm: 2.5, width_across_flats_mm: 30.0, thickness_mm: 18.0, proof_load_kn: { class_8: 206, class_10: 256 } },
]

// ---------------------------------------------------------------------------
// Data — Metric Washers (ISO 7089 standard, ISO 7093 large)
// ---------------------------------------------------------------------------

const METRIC_WASHERS: MetricWasher[] = [
  // ISO 7089 — Standard (form A)
  { size: "M2", inner_diameter_mm: 2.2, outer_diameter_mm: 5.0, thickness_mm: 0.3, type: "standard" },
  { size: "M2.5", inner_diameter_mm: 2.7, outer_diameter_mm: 6.0, thickness_mm: 0.5, type: "standard" },
  { size: "M3", inner_diameter_mm: 3.2, outer_diameter_mm: 7.0, thickness_mm: 0.5, type: "standard" },
  { size: "M4", inner_diameter_mm: 4.3, outer_diameter_mm: 9.0, thickness_mm: 0.8, type: "standard" },
  { size: "M5", inner_diameter_mm: 5.3, outer_diameter_mm: 10.0, thickness_mm: 1.0, type: "standard" },
  { size: "M6", inner_diameter_mm: 6.4, outer_diameter_mm: 12.0, thickness_mm: 1.6, type: "standard" },
  { size: "M8", inner_diameter_mm: 8.4, outer_diameter_mm: 16.0, thickness_mm: 1.6, type: "standard" },
  { size: "M10", inner_diameter_mm: 10.5, outer_diameter_mm: 20.0, thickness_mm: 2.0, type: "standard" },
  { size: "M12", inner_diameter_mm: 13.0, outer_diameter_mm: 24.0, thickness_mm: 2.5, type: "standard" },
  { size: "M14", inner_diameter_mm: 15.0, outer_diameter_mm: 28.0, thickness_mm: 2.5, type: "standard" },
  { size: "M16", inner_diameter_mm: 17.0, outer_diameter_mm: 30.0, thickness_mm: 3.0, type: "standard" },
  { size: "M20", inner_diameter_mm: 21.0, outer_diameter_mm: 37.0, thickness_mm: 3.0, type: "standard" },

  // ISO 7093 — Large (form A, large OD)
  { size: "M3", inner_diameter_mm: 3.2, outer_diameter_mm: 9.0, thickness_mm: 0.8, type: "large" },
  { size: "M4", inner_diameter_mm: 4.3, outer_diameter_mm: 12.0, thickness_mm: 1.0, type: "large" },
  { size: "M5", inner_diameter_mm: 5.3, outer_diameter_mm: 15.0, thickness_mm: 1.2, type: "large" },
  { size: "M6", inner_diameter_mm: 6.4, outer_diameter_mm: 18.0, thickness_mm: 1.6, type: "large" },
  { size: "M8", inner_diameter_mm: 8.4, outer_diameter_mm: 24.0, thickness_mm: 2.0, type: "large" },
  { size: "M10", inner_diameter_mm: 10.5, outer_diameter_mm: 30.0, thickness_mm: 2.5, type: "large" },
  { size: "M12", inner_diameter_mm: 13.0, outer_diameter_mm: 37.0, thickness_mm: 3.0, type: "large" },
  { size: "M14", inner_diameter_mm: 15.0, outer_diameter_mm: 44.0, thickness_mm: 3.0, type: "large" },
  { size: "M16", inner_diameter_mm: 17.0, outer_diameter_mm: 50.0, thickness_mm: 3.0, type: "large" },
  { size: "M20", inner_diameter_mm: 21.0, outer_diameter_mm: 56.0, thickness_mm: 4.0, type: "large" },
]

// ---------------------------------------------------------------------------
// Data — Deep Groove Ball Bearings (6000 and 6200 series)
// ---------------------------------------------------------------------------

// INTENT: ISO 15 / manufacturer catalogue data (SKF/NSK/FAG consensus values).
// max_rpm is grease-lubricated limiting speed.

const BALL_BEARINGS: BallBearing[] = [
  // 6000 series (light)
  { designation: "6000", bore_mm: 10, outer_diameter_mm: 26, width_mm: 8, dynamic_load_kn: 4.75, static_load_kn: 1.96, max_rpm: 30000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6001", bore_mm: 12, outer_diameter_mm: 28, width_mm: 8, dynamic_load_kn: 5.07, static_load_kn: 2.24, max_rpm: 28000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6002", bore_mm: 15, outer_diameter_mm: 32, width_mm: 9, dynamic_load_kn: 5.59, static_load_kn: 2.55, max_rpm: 26000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6003", bore_mm: 17, outer_diameter_mm: 35, width_mm: 10, dynamic_load_kn: 6.05, static_load_kn: 2.85, max_rpm: 24000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6004", bore_mm: 20, outer_diameter_mm: 42, width_mm: 12, dynamic_load_kn: 9.36, static_load_kn: 4.75, max_rpm: 20000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6005", bore_mm: 25, outer_diameter_mm: 47, width_mm: 12, dynamic_load_kn: 10.1, static_load_kn: 5.4, max_rpm: 18000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6006", bore_mm: 30, outer_diameter_mm: 55, width_mm: 13, dynamic_load_kn: 13.3, static_load_kn: 7.8, max_rpm: 16000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6007", bore_mm: 35, outer_diameter_mm: 62, width_mm: 14, dynamic_load_kn: 15.9, static_load_kn: 9.8, max_rpm: 14000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6008", bore_mm: 40, outer_diameter_mm: 68, width_mm: 15, dynamic_load_kn: 17.8, static_load_kn: 11.6, max_rpm: 13000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6009", bore_mm: 45, outer_diameter_mm: 75, width_mm: 16, dynamic_load_kn: 21.2, static_load_kn: 14.3, max_rpm: 11000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6010", bore_mm: 50, outer_diameter_mm: 80, width_mm: 16, dynamic_load_kn: 21.8, static_load_kn: 15.3, max_rpm: 10000, seal_options: ["open", "2Z", "2RS"] },

  // 6200 series (medium)
  { designation: "6200", bore_mm: 10, outer_diameter_mm: 30, width_mm: 9, dynamic_load_kn: 5.07, static_load_kn: 2.36, max_rpm: 26000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6201", bore_mm: 12, outer_diameter_mm: 32, width_mm: 10, dynamic_load_kn: 6.89, static_load_kn: 3.1, max_rpm: 24000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6202", bore_mm: 15, outer_diameter_mm: 35, width_mm: 11, dynamic_load_kn: 7.65, static_load_kn: 3.6, max_rpm: 22000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6203", bore_mm: 17, outer_diameter_mm: 40, width_mm: 12, dynamic_load_kn: 9.56, static_load_kn: 4.75, max_rpm: 20000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6204", bore_mm: 20, outer_diameter_mm: 47, width_mm: 14, dynamic_load_kn: 12.7, static_load_kn: 6.55, max_rpm: 17000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6205", bore_mm: 25, outer_diameter_mm: 52, width_mm: 15, dynamic_load_kn: 14.0, static_load_kn: 7.8, max_rpm: 15000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6206", bore_mm: 30, outer_diameter_mm: 62, width_mm: 16, dynamic_load_kn: 19.5, static_load_kn: 11.2, max_rpm: 13000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6207", bore_mm: 35, outer_diameter_mm: 72, width_mm: 17, dynamic_load_kn: 25.5, static_load_kn: 15.3, max_rpm: 11000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6208", bore_mm: 40, outer_diameter_mm: 80, width_mm: 18, dynamic_load_kn: 29.1, static_load_kn: 17.8, max_rpm: 10000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6209", bore_mm: 45, outer_diameter_mm: 85, width_mm: 19, dynamic_load_kn: 31.9, static_load_kn: 20.0, max_rpm: 9000, seal_options: ["open", "2Z", "2RS"] },
  { designation: "6210", bore_mm: 50, outer_diameter_mm: 90, width_mm: 20, dynamic_load_kn: 35.1, static_load_kn: 23.2, max_rpm: 8500, seal_options: ["open", "2Z", "2RS"] },
]

// ---------------------------------------------------------------------------
// Data — O-Rings (AS568 standard sizes)
// ---------------------------------------------------------------------------

// INTENT: AS568B nominal dimensions. OD = ID + 2 * CS.

const O_RINGS: ORing[] = [
  { designation: "AS568-001", inner_diameter_mm: 0.74, cross_section_mm: 1.02, outer_diameter_mm: 2.78 },
  { designation: "AS568-010", inner_diameter_mm: 6.07, cross_section_mm: 1.78, outer_diameter_mm: 9.63 },
  { designation: "AS568-020", inner_diameter_mm: 18.72, cross_section_mm: 1.78, outer_diameter_mm: 22.28 },
  { designation: "AS568-030", inner_diameter_mm: 31.42, cross_section_mm: 1.78, outer_diameter_mm: 34.98 },
  { designation: "AS568-100", inner_diameter_mm: 2.57, cross_section_mm: 1.78, outer_diameter_mm: 6.13 },
  { designation: "AS568-110", inner_diameter_mm: 9.19, cross_section_mm: 2.62, outer_diameter_mm: 14.43 },
  { designation: "AS568-200", inner_diameter_mm: 12.37, cross_section_mm: 3.53, outer_diameter_mm: 19.43 },
  { designation: "AS568-210", inner_diameter_mm: 18.64, cross_section_mm: 3.53, outer_diameter_mm: 25.70 },
  { designation: "AS568-300", inner_diameter_mm: 12.07, cross_section_mm: 5.33, outer_diameter_mm: 22.73 },
  { designation: "AS568-310", inner_diameter_mm: 18.77, cross_section_mm: 5.33, outer_diameter_mm: 29.43 },
  { designation: "AS568-400", inner_diameter_mm: 126.37, cross_section_mm: 6.99, outer_diameter_mm: 140.35 },
]

// ---------------------------------------------------------------------------
// Lookup maps (O(1) access)
// ---------------------------------------------------------------------------

const BOLT_MAP = new Map<string, MetricBolt>(
  METRIC_BOLTS.map(b => [b.size.toUpperCase(), b]),
)

const NUT_MAP = new Map<string, MetricNut>(
  METRIC_NUTS.map(n => [n.size.toUpperCase(), n]),
)

// DECISION: Washers keyed as "SIZE|TYPE" since same size has standard + large variants.
const WASHER_MAP = new Map<string, MetricWasher>(
  METRIC_WASHERS.map(w => [`${w.size.toUpperCase()}|${w.type}`, w]),
)

const BEARING_MAP = new Map<string, BallBearing>(
  BALL_BEARINGS.map(b => [b.designation, b]),
)

const ORING_MAP = new Map<string, ORing>(
  O_RINGS.map(o => [o.designation.toUpperCase(), o]),
)

// ---------------------------------------------------------------------------
// Search functions
// ---------------------------------------------------------------------------

/**
 * Find a metric socket head cap screw by size.
 *
 * @param size - Thread size, e.g. "M6", "m6", "M2.5"
 * @returns The bolt data or undefined if not in the library
 */
export function findBolt(size: string): MetricBolt | undefined {
  return BOLT_MAP.get(size.toUpperCase())
}

/**
 * Find a metric hex nut by size.
 *
 * @param size - Thread size, e.g. "M8"
 * @returns The nut data or undefined if not in the library
 */
export function findNut(size: string): MetricNut | undefined {
  return NUT_MAP.get(size.toUpperCase())
}

/**
 * Find a metric washer by size and type.
 *
 * @param size - Bolt size, e.g. "M6"
 * @param type - "standard" (ISO 7089, default) or "large" (ISO 7093)
 * @returns The washer data or undefined if not in the library
 */
export function findWasher(
  size: string,
  type: "standard" | "large" = "standard",
): MetricWasher | undefined {
  return WASHER_MAP.get(`${size.toUpperCase()}|${type}`)
}

/**
 * Find a ball bearing by its designation string.
 *
 * @param designation - Bearing designation, e.g. "6205", "6001"
 * @returns The bearing data or undefined if not in the library
 */
export function findBearing(designation: string): BallBearing | undefined {
  return BEARING_MAP.get(designation)
}

/**
 * Find all ball bearings that match a given bore diameter.
 *
 * @param bore_mm - Shaft diameter / bore in mm
 * @returns Array of matching bearings (may span multiple series)
 */
export function findBearingByBore(bore_mm: number): BallBearing[] {
  return BALL_BEARINGS.filter(b => b.bore_mm === bore_mm)
}

/**
 * Find an O-ring by its AS568 designation.
 *
 * @param designation - AS568 designation, e.g. "AS568-110", "as568-010"
 * @returns The O-ring data or undefined if not in the library
 */
export function findORing(designation: string): ORing | undefined {
  return ORING_MAP.get(designation.toUpperCase())
}

// ---------------------------------------------------------------------------
// Bulk access (for UI lists, tables, etc.)
// ---------------------------------------------------------------------------

/** All metric socket head cap screws in the library. */
export const ALL_BOLTS: readonly MetricBolt[] = METRIC_BOLTS

/** All metric hex nuts in the library. */
export const ALL_NUTS: readonly MetricNut[] = METRIC_NUTS

/** All metric washers in the library. */
export const ALL_WASHERS: readonly MetricWasher[] = METRIC_WASHERS

/** All ball bearings in the library. */
export const ALL_BEARINGS: readonly BallBearing[] = BALL_BEARINGS

/** All O-rings in the library. */
export const ALL_O_RINGS: readonly ORing[] = O_RINGS
