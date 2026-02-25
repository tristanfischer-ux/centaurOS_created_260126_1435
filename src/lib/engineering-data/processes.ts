/**
 * @file processes.ts -- Manufacturing process constraints database.
 *
 * @description Curated database of manufacturing process capabilities and
 * constraints. Used for design validation, material-process compatibility
 * checking, and specialist reviews.
 *
 * IMPORTANT: These values drive design validation. Wrong values could lead to
 * unfeasible designs being sent to manufacturers. All data sourced from
 * manufacturer datasheets and industry handbooks (Machinery's Handbook,
 * ASME standards, machine OEM specs).
 *
 * @related
 * - Material properties: src/lib/engineering-data/materials.ts
 * - Standard parts: src/lib/engineering-data/standard-parts.ts
 * - Validation rules: src/lib/cad-lab/validation-rules.ts
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessConstraints {
  /** Unique key (e.g., "fdm") */
  id: string
  /** Human-readable name (e.g., "FDM 3D Printing") */
  name: string
  /** Process category */
  category: "additive" | "subtractive" | "formative" | "joining" | "cutting"
  /** Minimum wall thickness in mm */
  min_wall_mm: number
  /** Maximum recommended wall thickness in mm (null if no practical limit) */
  max_wall_mm: number | null
  /** Minimum feature size in mm */
  min_feature_mm: number
  /** Standard achievable tolerance in mm */
  tolerance_standard_mm: number
  /** Tight tolerance (premium cost) in mm */
  tolerance_tight_mm: number
  /** Surface finish Ra in um */
  surface_finish_ra_um: { standard: number; fine: number }
  /** Required draft angle in degrees (null if not applicable) */
  draft_angle_deg: number | null
  /** Maximum part size in mm */
  max_part_size_mm: { x: number; y: number; z: number }
  /** Minimum economical batch size */
  min_batch_economical: number
  /** Setup/tooling cost range in USD */
  setup_cost_usd: { low: number; high: number }
  /** Relative per-part cost factor (FDM prototype = 1.0 baseline) */
  per_part_cost_factor: number
  /** Lead time in weeks */
  lead_time_weeks: { prototype: number; production: number }
  /** Compatible material IDs (keys from materials.ts) */
  compatible_materials: string[]
  /** Can produce undercuts without additional operations */
  undercuts_possible: boolean
  /** Can produce internal channels/features */
  internal_features_possible: boolean
  /** Process-specific design rules */
  design_rules: string[]
  /** Engineering notes */
  notes: string
}

// ---------------------------------------------------------------------------
// Additive Manufacturing
// ---------------------------------------------------------------------------

const ADDITIVE: ProcessConstraints[] = [
  {
    id: "fdm",
    name: "FDM 3D Printing",
    category: "additive",
    min_wall_mm: 0.8,
    max_wall_mm: null,
    min_feature_mm: 0.4,
    tolerance_standard_mm: 0.5,
    tolerance_tight_mm: 0.2,
    surface_finish_ra_um: { standard: 12.5, fine: 6.3 },
    draft_angle_deg: null,
    max_part_size_mm: { x: 300, y: 300, z: 400 },
    min_batch_economical: 1,
    setup_cost_usd: { low: 0, high: 50 },
    per_part_cost_factor: 1.0,
    lead_time_weeks: { prototype: 0.1, production: 1 },
    compatible_materials: [
      "pla",
      "abs",
      "petg",
      "nylon-pa6",
      "nylon-pa12",
      "tpu-95a",
      "pc",
      "asa",
      "pei-ultem",
      "cf-nylon",
    ],
    undercuts_possible: true,
    internal_features_possible: true,
    design_rules: [
      "Overhangs >45 deg from vertical require support material, increasing cost and surface roughness on supported faces",
      "Minimum unsupported bridge span: 10mm; minimum unsupported hole diameter: 2mm",
      "Layer lines create anisotropic strength -- Z-axis tensile strength is 30-50% of XY plane",
      "Horizontal holes <10mm will print oval unless oriented or supported; use teardrop profiles for self-supporting holes",
      "Minimum embossed/engraved text height: 2mm with 0.4mm nozzle; font stroke width >= nozzle diameter",
    ],
    notes:
      "Most accessible AM process. Best for rapid prototyping and low-volume functional parts. Layer height typically 0.1-0.3mm with 0.4mm nozzle. Industrial FDM (Stratasys Fortus) achieves tighter tolerances than desktop machines.",
  },
  {
    id: "sla",
    name: "SLA / Resin 3D Printing",
    category: "additive",
    min_wall_mm: 0.5,
    max_wall_mm: null,
    min_feature_mm: 0.15,
    tolerance_standard_mm: 0.15,
    tolerance_tight_mm: 0.05,
    surface_finish_ra_um: { standard: 3.2, fine: 1.6 },
    draft_angle_deg: null,
    max_part_size_mm: { x: 145, y: 145, z: 175 },
    min_batch_economical: 1,
    setup_cost_usd: { low: 0, high: 100 },
    per_part_cost_factor: 1.5,
    lead_time_weeks: { prototype: 0.1, production: 1 },
    compatible_materials: [
      "resin-standard",
      "resin-tough",
      "resin-flexible",
      "resin-castable",
      "resin-dental",
      "resin-high-temp",
      "resin-ceramic",
    ],
    undercuts_possible: true,
    internal_features_possible: true,
    design_rules: [
      "Parts require UV post-curing (405nm) for full mechanical properties; uncured parts are brittle",
      "Hollow parts need drain holes (min 3mm diameter) to evacuate uncured resin and reduce cost",
      "Support contact points leave witness marks ~0.2mm -- orient critical surfaces away from supports",
      "Wall thickness <0.5mm risks warping during post-cure; uniform wall thickness preferred",
      "Resins degrade under prolonged UV exposure; not suitable for outdoor applications without coating",
    ],
    notes:
      "Desktop SLA (Form 3) maxes at 145x145x185mm. Industrial SLA (3D Systems ProX 800) reaches 650x750x550mm but at significantly higher cost. Best for visual prototypes, investment casting patterns, and dental/jewelry applications.",
  },
  {
    id: "sls",
    name: "SLS Powder Bed Fusion",
    category: "additive",
    min_wall_mm: 0.7,
    max_wall_mm: null,
    min_feature_mm: 0.5,
    tolerance_standard_mm: 0.3,
    tolerance_tight_mm: 0.15,
    surface_finish_ra_um: { standard: 9, fine: 5 },
    draft_angle_deg: null,
    max_part_size_mm: { x: 340, y: 340, z: 600 },
    min_batch_economical: 1,
    setup_cost_usd: { low: 0, high: 200 },
    per_part_cost_factor: 2.5,
    lead_time_weeks: { prototype: 0.5, production: 2 },
    compatible_materials: [
      "nylon-pa12",
      "nylon-pa11",
      "nylon-pa6",
      "tpu-sls",
      "pp-sls",
      "cf-nylon",
      "glass-filled-nylon",
    ],
    undercuts_possible: true,
    internal_features_possible: true,
    design_rules: [
      "No support structures needed -- unsintered powder supports the part, enabling complex geometries",
      "Minimum escape hole diameter 5mm for trapped powder removal; design powder exit channels for internal cavities",
      "Parts have grainy matte finish; dye or vapor smoothing for cosmetic surfaces adds lead time",
      "Large flat surfaces tend to warp -- add ribs or curvature to panels exceeding 150mm span",
      "Living hinges possible with PA11 (elongation at break ~30%) but not PA12 (~15%)",
    ],
    notes:
      "Best polymer AM process for functional end-use parts. No support structures needed. Nylon PA12 is the workhorse material. Build volumes: EOS P 396 (340x340x600mm), HP MJF 5200 (similar). Powder refresh ratio typically 50/50 new/recycled.",
  },
  {
    id: "dmls",
    name: "DMLS / SLM Metal 3D Printing",
    category: "additive",
    min_wall_mm: 0.4,
    max_wall_mm: null,
    min_feature_mm: 0.2,
    tolerance_standard_mm: 0.1,
    tolerance_tight_mm: 0.05,
    surface_finish_ra_um: { standard: 8, fine: 3.2 },
    draft_angle_deg: null,
    max_part_size_mm: { x: 250, y: 250, z: 300 },
    min_batch_economical: 1,
    setup_cost_usd: { low: 200, high: 2000 },
    per_part_cost_factor: 15,
    lead_time_weeks: { prototype: 1, production: 4 },
    compatible_materials: [
      "ss-316l",
      "ti-6al-4v",
      "al-alsi10mg",
      "inconel-718",
      "inconel-625",
      "maraging-steel",
      "cobalt-chrome",
      "copper-cuw",
    ],
    undercuts_possible: true,
    internal_features_possible: true,
    design_rules: [
      "Support structures are mandatory for overhangs >45 deg; removal by EDM or machining adds cost and lead time",
      "Minimum self-supporting angle is 45 deg from the build plate; lower angles risk curling and delamination",
      "Residual thermal stress requires stress relief heat treatment before removal from build plate",
      "Post-machining critical interfaces is standard -- as-printed surfaces are too rough for bearing or sealing faces",
      "Design for wire EDM removal from build plate; add 2-3mm sacrificial stock on the base",
    ],
    notes:
      "Fully dense metal parts (~99.9%) with properties comparable to wrought material after HIP. Build volumes: EOS M 290 (250x250x325mm), SLM 500 (500x280x365mm). Argon atmosphere required for reactive metals (Ti, Al). Post-processing often includes HIP, heat treat, and CNC finish machining.",
  },
  {
    id: "mjf",
    name: "Multi Jet Fusion (MJF)",
    category: "additive",
    min_wall_mm: 0.5,
    max_wall_mm: null,
    min_feature_mm: 0.3,
    tolerance_standard_mm: 0.3,
    tolerance_tight_mm: 0.15,
    surface_finish_ra_um: { standard: 8, fine: 5 },
    draft_angle_deg: null,
    max_part_size_mm: { x: 380, y: 284, z: 380 },
    min_batch_economical: 10,
    setup_cost_usd: { low: 0, high: 200 },
    per_part_cost_factor: 2.0,
    lead_time_weeks: { prototype: 0.5, production: 2 },
    compatible_materials: [
      "nylon-pa12",
      "nylon-pa11",
      "tpu-mjf",
      "pp-mjf",
      "glass-filled-nylon",
    ],
    undercuts_possible: true,
    internal_features_possible: true,
    design_rules: [
      "Similar design freedom to SLS -- no supports needed; unsintered powder is the support",
      "Parts come out grey/black by default; dyeing available but color uniformity can vary on complex geometries",
      "Mechanical properties are more isotropic than FDM but still have slight Z-axis weakness (~5-10%)",
      "Minimum text size: 1.5mm height, 0.5mm stroke width for legible embossed/engraved text",
      "Snap fits and living hinges work well with PA12 MJF due to consistent mechanical properties",
    ],
    notes:
      "HP's powder bed fusion process. Faster throughput than SLS for batch production. Excellent for bridge manufacturing (100-10000 units). More isotropic than SLS. Parts have a characteristic grey color. Build volume: HP 5200 (380x284x380mm).",
  },
  {
    id: "binder-jetting",
    name: "Binder Jetting",
    category: "additive",
    min_wall_mm: 2.0,
    max_wall_mm: null,
    min_feature_mm: 1.5,
    tolerance_standard_mm: 0.5,
    tolerance_tight_mm: 0.2,
    surface_finish_ra_um: { standard: 6, fine: 3 },
    draft_angle_deg: null,
    max_part_size_mm: { x: 400, y: 250, z: 250 },
    min_batch_economical: 50,
    setup_cost_usd: { low: 100, high: 1000 },
    per_part_cost_factor: 3.0,
    lead_time_weeks: { prototype: 1, production: 3 },
    compatible_materials: [
      "ss-316l",
      "ss-17-4ph",
      "tool-steel",
      "sand-casting-sand",
      "gypsum-composite",
      "inconel-625",
    ],
    undercuts_possible: true,
    internal_features_possible: true,
    design_rules: [
      "Green parts are fragile (40-60% density); handle with care before sintering",
      "Sintering shrinkage is 15-20% and must be compensated in the design; non-uniform cross-sections shrink unevenly",
      "Minimum wall thickness is higher than laser PBF due to depowdering and handling of green parts",
      "Internal channels must allow powder removal -- minimum passage diameter 5mm with line-of-sight access",
      "Metal binder jetting achieves ~97% density after sintering; HIP recommended for structural applications",
    ],
    notes:
      "Two main applications: metal parts (Desktop Metal, ExOne) and sand molds/cores (ExOne, Voxeljet). Metal parts require sintering with ~18% shrinkage. Full-color gypsum models for visual prototypes. Sand casting molds printed without tooling enable rapid casting prototyping.",
  },
]

// ---------------------------------------------------------------------------
// Subtractive Manufacturing
// ---------------------------------------------------------------------------

const SUBTRACTIVE: ProcessConstraints[] = [
  {
    id: "cnc-3axis",
    name: "CNC Milling (3-Axis)",
    category: "subtractive",
    min_wall_mm: 0.5,
    max_wall_mm: null,
    min_feature_mm: 1.0,
    tolerance_standard_mm: 0.05,
    tolerance_tight_mm: 0.01,
    surface_finish_ra_um: { standard: 3.2, fine: 0.8 },
    draft_angle_deg: null,
    max_part_size_mm: { x: 1200, y: 600, z: 500 },
    min_batch_economical: 1,
    setup_cost_usd: { low: 50, high: 500 },
    per_part_cost_factor: 5.0,
    lead_time_weeks: { prototype: 0.5, production: 3 },
    compatible_materials: [
      "al-6061-t6",
      "al-7075-t6",
      "al-2024-t3",
      "ss-304",
      "ss-316l",
      "ss-17-4ph",
      "steel-1018",
      "steel-4140",
      "steel-a36",
      "ti-6al-4v",
      "brass-c360",
      "copper-c110",
      "delrin-pom",
      "nylon-6",
      "acetal",
      "hdpe",
      "ptfe",
      "peek",
      "abs",
      "pc",
    ],
    undercuts_possible: false,
    internal_features_possible: false,
    design_rules: [
      "Internal corners are limited by cutter radius -- design minimum fillet radius >= tool radius (typically 1mm+)",
      "Deep pockets increase machining time exponentially and cause tool deflection; max depth-to-width ratio 4:1 standard, 6:1 with reduced stepover",
      "Undercuts and features not accessible from top/bottom/side require secondary setups or 5-axis",
      "Thin walls (<1mm) deflect under cutting forces; add ribs or increase thickness near clamping points",
      "Design for standard cutter sizes: 1mm, 1.5mm, 2mm, 3mm, 4mm, 6mm, 8mm, 10mm, 12mm end mills",
    ],
    notes:
      "Workhorse of precision manufacturing. Tool approaches from 3 orthogonal directions. Parts must be fixtured and may need multiple setups for 6-sided machining. Typical spindle speed 8000-24000 RPM. Aluminum is the fastest/cheapest material to machine; titanium and stainless are 5-10x slower.",
  },
  {
    id: "cnc-5axis",
    name: "CNC Milling (5-Axis)",
    category: "subtractive",
    min_wall_mm: 0.5,
    max_wall_mm: null,
    min_feature_mm: 0.5,
    tolerance_standard_mm: 0.025,
    tolerance_tight_mm: 0.005,
    surface_finish_ra_um: { standard: 1.6, fine: 0.4 },
    draft_angle_deg: null,
    max_part_size_mm: { x: 1000, y: 600, z: 500 },
    min_batch_economical: 1,
    setup_cost_usd: { low: 100, high: 1500 },
    per_part_cost_factor: 10.0,
    lead_time_weeks: { prototype: 1, production: 4 },
    compatible_materials: [
      "al-6061-t6",
      "al-7075-t6",
      "al-2024-t3",
      "ss-304",
      "ss-316l",
      "ss-17-4ph",
      "steel-1018",
      "steel-4140",
      "ti-6al-4v",
      "ti-cp-grade2",
      "inconel-718",
      "brass-c360",
      "copper-c110",
      "peek",
      "delrin-pom",
    ],
    undercuts_possible: true,
    internal_features_possible: false,
    design_rules: [
      "Simultaneous 5-axis contouring enables undercuts and compound angles in a single setup",
      "Tool length-to-diameter ratio should not exceed 5:1 to avoid chatter; shorter tools preferred",
      "Fixture design is critical -- ensure collision-free tool paths with the B/C axis tilted to extreme angles",
      "Impeller and turbine blades are ideal 5-axis geometries; ruled surfaces are more machinable than freeform",
      "Programming cost is higher than 3-axis; justify 5-axis only for complex geometry or reduced setup count",
    ],
    notes:
      "Two additional rotary axes (typically B and C) allow tool access to nearly any surface angle. Reduces setups from multiple 3-axis ops to a single clamping. Essential for aerospace turbine blades, impellers, and complex mold cavities. Machine cost $200k-$1M+.",
  },
  {
    id: "edm-wire",
    name: "Wire EDM",
    category: "subtractive",
    min_wall_mm: 0.1,
    max_wall_mm: null,
    min_feature_mm: 0.1,
    tolerance_standard_mm: 0.01,
    tolerance_tight_mm: 0.002,
    surface_finish_ra_um: { standard: 0.8, fine: 0.2 },
    draft_angle_deg: null,
    max_part_size_mm: { x: 500, y: 350, z: 300 },
    min_batch_economical: 1,
    setup_cost_usd: { low: 100, high: 800 },
    per_part_cost_factor: 8.0,
    lead_time_weeks: { prototype: 1, production: 3 },
    compatible_materials: [
      "steel-4140",
      "steel-d2",
      "steel-a2",
      "steel-s7",
      "steel-h13",
      "ss-304",
      "ss-316l",
      "ti-6al-4v",
      "tungsten-carbide",
      "copper-c110",
      "inconel-718",
      "maraging-steel",
    ],
    undercuts_possible: false,
    internal_features_possible: false,
    design_rules: [
      "Wire EDM cuts only conductive materials using electrical discharge through a thin brass or molybdenum wire",
      "All cut profiles are through-cuts (2D extrusions); cannot produce blind pockets or 3D surfaces",
      "Wire diameter is typically 0.1-0.3mm; minimum internal corner radius equals half the wire diameter",
      "Start holes must be pre-drilled or a wire-threading slot provided for enclosed profiles",
      "Multiple finish passes reduce Ra but increase cost; specify surface finish only where functionally required",
    ],
    notes:
      "Cuts hardened materials (60+ HRC) with ease. Wire diameter typically 0.25mm brass. Cutting speed ~5-10 mm/min for roughing in steel. Best for punches, dies, and precision tooling. Taper cutting possible on most machines (up to 30 deg). Dielectric fluid is deionized water.",
  },
  {
    id: "edm-sinker",
    name: "Sinker EDM",
    category: "subtractive",
    min_wall_mm: 0.2,
    max_wall_mm: null,
    min_feature_mm: 0.2,
    tolerance_standard_mm: 0.01,
    tolerance_tight_mm: 0.005,
    surface_finish_ra_um: { standard: 1.6, fine: 0.4 },
    draft_angle_deg: null,
    max_part_size_mm: { x: 400, y: 300, z: 250 },
    min_batch_economical: 1,
    setup_cost_usd: { low: 500, high: 5000 },
    per_part_cost_factor: 12.0,
    lead_time_weeks: { prototype: 2, production: 4 },
    compatible_materials: [
      "steel-4140",
      "steel-d2",
      "steel-a2",
      "steel-h13",
      "ss-304",
      "ss-316l",
      "ti-6al-4v",
      "tungsten-carbide",
      "inconel-718",
      "copper-c110",
    ],
    undercuts_possible: true,
    internal_features_possible: true,
    design_rules: [
      "Electrode (graphite or copper) is the inverse of the desired cavity -- electrode fabrication is a significant cost driver",
      "Spark gap (0.01-0.05mm per side) must be compensated in electrode dimensions",
      "Multiple electrodes are needed for roughing and finishing; plan 2-4 electrodes per cavity",
      "Internal corners can be made sharp (unlike CNC); EDM excels where CNC tool radius is a limitation",
      "Surface exhibits recast layer (5-20um) that may need removal for fatigue-critical applications",
    ],
    notes:
      "Used primarily for mold and die cavities where CNC cannot reach. Electrode is pre-machined from graphite or copper. Slower than CNC but handles hardened steel and complex internal geometry. Dielectric fluid is hydrocarbon oil. Orbital and linear sinker modes available.",
  },
]

// ---------------------------------------------------------------------------
// Formative Manufacturing
// ---------------------------------------------------------------------------

const FORMATIVE: ProcessConstraints[] = [
  {
    id: "injection-molding",
    name: "Injection Molding",
    category: "formative",
    min_wall_mm: 1.0,
    max_wall_mm: 4.0,
    min_feature_mm: 0.5,
    tolerance_standard_mm: 0.1,
    tolerance_tight_mm: 0.05,
    surface_finish_ra_um: { standard: 1.6, fine: 0.4 },
    draft_angle_deg: 1.5,
    max_part_size_mm: { x: 1000, y: 1000, z: 500 },
    min_batch_economical: 500,
    setup_cost_usd: { low: 5000, high: 100000 },
    per_part_cost_factor: 0.1,
    lead_time_weeks: { prototype: 4, production: 8 },
    compatible_materials: [
      "abs",
      "pc",
      "pp",
      "pe-hd",
      "pe-ld",
      "nylon-pa6",
      "nylon-pa66",
      "pom-acetal",
      "pbt",
      "pei-ultem",
      "peek",
      "tpe",
      "lcp",
      "pps",
      "pc-abs",
      "glass-filled-nylon",
    ],
    undercuts_possible: false,
    internal_features_possible: false,
    design_rules: [
      "Uniform wall thickness critical -- variations >15% cause sink marks, warpage, and internal stresses",
      "Draft angle minimum 1 deg per side; 2 deg for textured surfaces (add 1 deg per 0.025mm texture depth)",
      "Ribs should be 50-60% of adjacent wall thickness to prevent sink marks; max rib height 3x wall thickness",
      "Gate location determines knit-line position and fill pattern -- place gates at thickest section",
      "Undercuts require side actions (slides/lifters) adding $2000-$10000 per action to mold cost",
    ],
    notes:
      "Dominant process for high-volume plastic parts. Cycle time 15-60 seconds. Tooling is steel (P20, H13, S7) for production or aluminum for prototyping (<10k shots). Multi-cavity molds (2-64+) for higher throughput. Mold flow simulation recommended for parts >100mm.",
  },
  {
    id: "die-casting",
    name: "Die Casting",
    category: "formative",
    min_wall_mm: 1.0,
    max_wall_mm: 8.0,
    min_feature_mm: 1.0,
    tolerance_standard_mm: 0.1,
    tolerance_tight_mm: 0.05,
    surface_finish_ra_um: { standard: 3.2, fine: 1.6 },
    draft_angle_deg: 2.0,
    max_part_size_mm: { x: 600, y: 600, z: 300 },
    min_batch_economical: 1000,
    setup_cost_usd: { low: 10000, high: 150000 },
    per_part_cost_factor: 0.15,
    lead_time_weeks: { prototype: 8, production: 12 },
    compatible_materials: [
      "al-a380",
      "al-a360",
      "zinc-zamak3",
      "zinc-zamak5",
      "mg-az91d",
      "copper-alloy",
    ],
    undercuts_possible: false,
    internal_features_possible: false,
    design_rules: [
      "Draft angle minimum 1 deg for zinc, 2 deg for aluminum, 3 deg for magnesium; more on deep cores",
      "Uniform wall thickness preferred; gradual transitions (3:1 taper ratio) where changes are necessary",
      "Porosity is inherent in high-pressure die casting; not suitable for pressure-tight applications without impregnation",
      "Minimum core diameter for cast-in holes: 3mm; depth-to-diameter ratio max 4:1",
      "Ejector pin marks are unavoidable -- locate them on non-cosmetic surfaces",
    ],
    notes:
      "High-pressure die casting (HPDC) forces molten metal into steel dies at 10-175 MPa. Cycle time 30-90 seconds. Excellent for thin-walled aluminum and zinc housings. Post-machining of critical features is standard. Tooling life: 100k-1M+ shots depending on alloy and maintenance.",
  },
  {
    id: "investment-casting",
    name: "Investment Casting (Lost Wax)",
    category: "formative",
    min_wall_mm: 1.5,
    max_wall_mm: 75.0,
    min_feature_mm: 1.0,
    tolerance_standard_mm: 0.1,
    tolerance_tight_mm: 0.05,
    surface_finish_ra_um: { standard: 3.2, fine: 1.6 },
    draft_angle_deg: null,
    max_part_size_mm: { x: 600, y: 600, z: 450 },
    min_batch_economical: 25,
    setup_cost_usd: { low: 1000, high: 20000 },
    per_part_cost_factor: 8.0,
    lead_time_weeks: { prototype: 4, production: 8 },
    compatible_materials: [
      "ss-304",
      "ss-316l",
      "ss-17-4ph",
      "al-a356",
      "ti-6al-4v",
      "inconel-718",
      "inconel-625",
      "cobalt-chrome",
      "steel-4140",
      "steel-8620",
      "copper-alloy",
      "bronze",
    ],
    undercuts_possible: true,
    internal_features_possible: true,
    design_rules: [
      "No draft angle required (wax pattern is melted out), enabling near-net-shape complex geometry",
      "Uniform wall thickness reduces hot-spot defects; maximum wall thickness ~75mm before solidification issues",
      "Internal passages possible using ceramic cores; minimum core diameter 3mm, max L/D ratio 6:1",
      "Wax pattern shrinkage (0.6-1.0%) and metal shrinkage (1.5-2.5%) must be compensated in tooling",
      "Surface finish is as-cast smooth (Ra 3.2um) but porosity may occur at thick-to-thin transitions",
    ],
    notes:
      "Produces near-net-shape castings in virtually any alloy. Process: wax pattern -> ceramic shell -> dewax -> pour metal -> break shell. 3D printed wax/resin patterns eliminate tooling for prototypes. Widely used for aerospace turbine blades, medical implants, and jewelry. Tolerances per ANSI/ICI Standard.",
  },
  {
    id: "sand-casting",
    name: "Sand Casting",
    category: "formative",
    min_wall_mm: 3.0,
    max_wall_mm: null,
    min_feature_mm: 3.0,
    tolerance_standard_mm: 0.5,
    tolerance_tight_mm: 0.2,
    surface_finish_ra_um: { standard: 12.5, fine: 6.3 },
    draft_angle_deg: 4.0,
    max_part_size_mm: { x: 3000, y: 2000, z: 1500 },
    min_batch_economical: 1,
    setup_cost_usd: { low: 500, high: 10000 },
    per_part_cost_factor: 3.0,
    lead_time_weeks: { prototype: 2, production: 6 },
    compatible_materials: [
      "al-a356",
      "al-319",
      "gray-iron",
      "ductile-iron",
      "steel-a36",
      "steel-4140",
      "steel-8620",
      "bronze",
      "brass-c844",
      "copper-alloy",
    ],
    undercuts_possible: true,
    internal_features_possible: true,
    design_rules: [
      "Draft angle 3-5 deg on vertical surfaces for pattern withdrawal from sand; more for deep features",
      "Minimum section thickness 3mm for aluminum, 5mm for cast iron, 6mm for steel to ensure complete fill",
      "Design junctions to minimize hot spots -- use staggered T-junctions and fillet radii >= wall thickness",
      "Cores for internal features add cost; minimum core print length 1.5x core diameter for stability",
      "Machining allowance 1.5-3mm on all machined surfaces; specify on drawing with chain dimensioning",
    ],
    notes:
      "Most versatile casting process. Handles parts from grams to tons. Green sand (clay-bonded) for production, no-bake (resin-bonded) for large/low-volume. 3D printed sand molds eliminate pattern tooling for prototypes. Surface is rough -- all functional surfaces require post-machining.",
  },
]

// ---------------------------------------------------------------------------
// Cutting Processes
// ---------------------------------------------------------------------------

const CUTTING: ProcessConstraints[] = [
  {
    id: "sheet-metal",
    name: "Sheet Metal / Brake Forming",
    category: "cutting",
    min_wall_mm: 0.5,
    max_wall_mm: 6.0,
    min_feature_mm: 1.0,
    tolerance_standard_mm: 0.1,
    tolerance_tight_mm: 0.05,
    surface_finish_ra_um: { standard: 1.6, fine: 0.8 },
    draft_angle_deg: null,
    max_part_size_mm: { x: 3000, y: 1500, z: 300 },
    min_batch_economical: 1,
    setup_cost_usd: { low: 50, high: 2000 },
    per_part_cost_factor: 1.5,
    lead_time_weeks: { prototype: 0.5, production: 3 },
    compatible_materials: [
      "al-5052-h32",
      "al-6061-t6",
      "ss-304",
      "ss-316l",
      "steel-1018",
      "steel-1008",
      "galvanized-steel",
      "copper-c110",
      "brass-c260",
      "ti-cp-grade2",
    ],
    undercuts_possible: false,
    internal_features_possible: false,
    design_rules: [
      "Minimum bend radius equals material thickness for aluminum and mild steel; 2x for stainless steel and titanium",
      "Minimum distance from hole edge to bend line: 2x material thickness + bend radius",
      "Bend relief cuts needed at bend intersections to prevent tearing; width >= material thickness, length >= bend radius",
      "Maintain consistent bend direction where possible to minimize setup changes and reduce cost",
      "K-factor varies by material (0.33-0.50); use manufacturer's bend tables for accurate flat pattern development",
    ],
    notes:
      "Sheet metal fabrication combines cutting (laser, punch, waterjet) with forming (brake press, roll forming). Standard gauge thicknesses preferred for cost (20ga/0.9mm to 10ga/3.4mm most common). Hardware inserts (PEM nuts, standoffs) are cost-effective alternatives to machined features. DFM tip: design flat pattern to nest efficiently on standard sheet sizes (1220x2440mm).",
  },
  {
    id: "waterjet",
    name: "Waterjet Cutting",
    category: "cutting",
    min_wall_mm: 0.5,
    max_wall_mm: null,
    min_feature_mm: 0.8,
    tolerance_standard_mm: 0.1,
    tolerance_tight_mm: 0.05,
    surface_finish_ra_um: { standard: 3.2, fine: 1.6 },
    draft_angle_deg: null,
    max_part_size_mm: { x: 4000, y: 2000, z: 150 },
    min_batch_economical: 1,
    setup_cost_usd: { low: 0, high: 200 },
    per_part_cost_factor: 2.0,
    lead_time_weeks: { prototype: 0.5, production: 2 },
    compatible_materials: [
      "al-6061-t6",
      "al-7075-t6",
      "ss-304",
      "ss-316l",
      "steel-a36",
      "steel-4140",
      "ti-6al-4v",
      "copper-c110",
      "brass-c360",
      "glass",
      "carbon-fiber-sheet",
      "stone",
      "ceramic-tile",
      "rubber",
      "foam",
    ],
    undercuts_possible: false,
    internal_features_possible: false,
    design_rules: [
      "Kerf width is 0.8-1.2mm for abrasive waterjet; compensate in CAM, not in the design",
      "Maximum material thickness: ~150mm for steel, ~200mm for aluminum; cutting speed drops dramatically above 50mm",
      "No heat-affected zone (HAZ) -- ideal for heat-sensitive materials (composites, tempered metals)",
      "Taper of 0.05-0.1mm per 25mm thickness is inherent; taper compensation available on 5-axis heads",
      "Pierce points leave a dimple -- start cuts in waste material or on edges where possible",
    ],
    notes:
      "Abrasive waterjet uses 60,000 PSI water stream with garnet abrasive. Cuts virtually any material. No HAZ or thermal distortion. Speed: 25mm/min for 50mm steel, 500mm/min for 3mm aluminum. Pure waterjet (no abrasive) for soft materials: rubber, foam, food, textiles. 5-axis heads available for bevel and taper compensation.",
  },
  {
    id: "laser-cutting",
    name: "Laser Cutting",
    category: "cutting",
    min_wall_mm: 0.5,
    max_wall_mm: null,
    min_feature_mm: 0.2,
    tolerance_standard_mm: 0.1,
    tolerance_tight_mm: 0.05,
    surface_finish_ra_um: { standard: 3.2, fine: 1.6 },
    draft_angle_deg: null,
    max_part_size_mm: { x: 3000, y: 1500, z: 25 },
    min_batch_economical: 1,
    setup_cost_usd: { low: 0, high: 100 },
    per_part_cost_factor: 1.0,
    lead_time_weeks: { prototype: 0.3, production: 2 },
    compatible_materials: [
      "al-5052-h32",
      "al-6061-t6",
      "ss-304",
      "ss-316l",
      "steel-1018",
      "steel-a36",
      "galvanized-steel",
      "copper-c110",
      "brass-c260",
      "acrylic",
      "plywood",
      "mdf",
    ],
    undercuts_possible: false,
    internal_features_possible: false,
    design_rules: [
      "Kerf width 0.1-0.3mm for fiber laser on metals; design minimum web width >= 1.5x material thickness",
      "Maximum thickness: 25mm mild steel (CO2), 30mm (fiber laser); 20mm stainless; 12mm aluminum (reflective)",
      "Heat-affected zone (HAZ) is 0.1-0.5mm; critical for hardened or tempered materials",
      "Minimum hole diameter equals material thickness for clean piercing; smaller holes require peck piercing",
      "Highly reflective materials (copper, brass, aluminum) require fiber laser with back-reflection protection",
    ],
    notes:
      "Fastest 2D cutting process for metals <12mm. Fiber lasers (1-12kW) have largely replaced CO2 for metals. Cutting speed: 10m/min for 1mm mild steel at 4kW. Assist gas: oxygen (mild steel, exothermic cut), nitrogen (stainless, clean edge), air (aluminum, cost reduction). Tube laser cutting also available for profiles.",
  },
]

// ---------------------------------------------------------------------------
// Other Processes
// ---------------------------------------------------------------------------

const OTHER: ProcessConstraints[] = [
  {
    id: "extrusion",
    name: "Metal / Plastic Extrusion",
    category: "formative",
    min_wall_mm: 1.0,
    max_wall_mm: 25.0,
    min_feature_mm: 0.5,
    tolerance_standard_mm: 0.25,
    tolerance_tight_mm: 0.1,
    surface_finish_ra_um: { standard: 1.6, fine: 0.8 },
    draft_angle_deg: null,
    max_part_size_mm: { x: 6000, y: 350, z: 350 },
    min_batch_economical: 100,
    setup_cost_usd: { low: 1000, high: 20000 },
    per_part_cost_factor: 0.3,
    lead_time_weeks: { prototype: 3, production: 6 },
    compatible_materials: [
      "al-6063-t5",
      "al-6061-t6",
      "al-6005-t5",
      "abs",
      "pp",
      "pe-hd",
      "pvc",
      "pc",
      "rubber-epdm",
      "silicone",
    ],
    undercuts_possible: false,
    internal_features_possible: true,
    design_rules: [
      "Profile is constant along the extrusion axis; all features must be 2D cross-sectional",
      "Aluminum extrusion: wall thickness minimum 1mm, uniform thickness preferred; thick-to-thin ratio max 3:1",
      "Hollow profiles require mandrel/porthole dies with higher tooling cost; bridge marks on weld seams",
      "Sharp external corners are achievable; sharp internal corners are not -- minimum inside radius 0.5-1mm",
      "Design for standard aluminum extrusion alloy 6063-T5 unless higher strength (6061-T6) is required",
    ],
    notes:
      "Forces material through a shaped die to produce constant-cross-section profiles of unlimited length. Aluminum extrusion is extremely cost-effective for structural profiles, heat sinks, and enclosures. Minimum order typically 100-500 kg for custom dies. Cut-to-length and post-machining for features along the length.",
  },
]

// ---------------------------------------------------------------------------
// Aggregated Process Database
// ---------------------------------------------------------------------------

/** All manufacturing processes in the database. */
export const PROCESSES: ProcessConstraints[] = [
  ...ADDITIVE,
  ...SUBTRACTIVE,
  ...FORMATIVE,
  ...CUTTING,
  ...OTHER,
]

// ---------------------------------------------------------------------------
// Lookup & Search Functions
// ---------------------------------------------------------------------------

/**
 * Find a process by exact ID or fuzzy name match.
 *
 * @description Searches first by exact ID match, then by case-insensitive
 * substring match on the process name. Returns undefined if no match.
 *
 * @param query - Process ID (e.g., "fdm") or partial name (e.g., "injection")
 * @returns The matching ProcessConstraints, or undefined
 */
export function findProcess(
  query: string
): ProcessConstraints | undefined {
  const q = query.toLowerCase().trim()

  // INTENT: exact ID match first for programmatic lookups
  const exactMatch = PROCESSES.find((p) => p.id === q)
  if (exactMatch) return exactMatch

  // INTENT: fuzzy name match for human search queries
  return PROCESSES.find((p) => p.name.toLowerCase().includes(q))
}

/**
 * List all process IDs and names in a human-readable format.
 *
 * @description Returns a newline-separated string of "id: name" pairs,
 * suitable for embedding in LLM prompts or displaying in a selection UI.
 *
 * @returns Formatted list of all processes
 */
export function listProcesses(): string {
  return PROCESSES.map((p) => `${p.id}: ${p.name}`).join("\n")
}

/**
 * Get processes filtered by category.
 *
 * @param category - The process category to filter by
 * @returns Array of processes matching the category
 */
export function getProcessesByCategory(
  category: ProcessConstraints["category"]
): ProcessConstraints[] {
  return PROCESSES.filter((p) => p.category === category)
}

/**
 * Find processes compatible with a given material ID.
 *
 * @description Searches each process's compatible_materials array for the
 * given material ID. Useful for answering "what processes can I use to make
 * this part out of 6061 aluminum?"
 *
 * @param materialId - Material ID key (e.g., "al-6061-t6", "abs", "ss-304")
 * @returns Array of processes that list the material as compatible
 */
export function getProcessesForMaterial(
  materialId: string
): ProcessConstraints[] {
  const id = materialId.toLowerCase().trim()
  return PROCESSES.filter((p) =>
    p.compatible_materials.some((m) => m === id)
  )
}
