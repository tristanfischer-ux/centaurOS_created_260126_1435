/**
 * @file seed-design-standards.ts — Seeds the design_standards table with ~185 standards across 19 domains.
 *
 * Usage: npx tsx scripts/seed-design-standards.ts
 *
 * Requires: ANTHROPIC_API_KEY and SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Each domain batch calls Claude Opus once to generate all standards for that domain,
 * keeping API calls to ~19 (one per domain) instead of ~185.
 */

import { config } from "dotenv"
import { resolve } from "path"

// Load env from .env.local
config({ path: resolve(process.cwd(), ".env.local") })

import { createClient } from "@supabase/supabase-js"

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing required env vars: ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ─── Domain Definitions ─────────────────────────────────────────────

interface DomainSeed {
  domain: string
  description: string
  standards: string[] // standard codes + names to generate
}

const DOMAINS: DomainSeed[] = [
  {
    domain: "marine",
    description: "Boats, ships, submarines, offshore structures, marine equipment",
    standards: [
      "ISO 12215-5: Hull construction — scantlings for single-skin craft",
      "ISO 12215-6: Hull construction — structural arrangements and details",
      "ISO 12215-3: Hull construction — materials (GRP, carbon, aramid)",
      "ISO 12217-1: Stability and buoyancy — non-sailing boats ≤6m",
      "ISO 12217-2: Stability and buoyancy — sailing boats ≥6m",
      "ISO 8666: Principal data — terminology and definitions",
      "ABYC H-22: Electric bilge blower operated ventilation",
      "ABYC H-33: Diesel exhaust systems",
      "ABYC E-11: AC and DC electrical systems on boats",
      "DNV GL Rules: Hull structural design — ships",
      "ISO 15084: Anchoring, mooring and towing — strong points",
      "ISO 10592: Hydraulic steering systems",
    ],
  },
  {
    domain: "automotive",
    description: "Cars, trucks, motorcycles, EVs, trailers, vehicle components",
    standards: [
      "SAE J1100: Motor vehicle dimensions",
      "SAE J826: Devices for defining seating accommodation",
      "FMVSS 208: Occupant crash protection (frontal)",
      "FMVSS 214: Side impact protection",
      "FMVSS 301: Fuel system integrity",
      "ISO 26262: Road vehicles — functional safety",
      "SAE J1772: Electric vehicle charging connector",
      "SAE J3016: Taxonomy for automated driving",
      "ECE R94: Frontal collision protection",
      "ECE R95: Lateral collision protection",
      "ISO 6469: Electrically propelled road vehicles — safety specifications",
      "SAE J2464: Electric and hybrid vehicle battery abuse testing",
    ],
  },
  {
    domain: "aerospace",
    description: "Aircraft, drones, satellites, rockets, turbines, avionics",
    standards: [
      "FAR Part 25: Airworthiness standards — transport category airplanes",
      "DO-160G: Environmental conditions and test procedures for airborne equipment",
      "DO-178C: Software considerations in airborne systems",
      "AS9100D: Quality management systems for aviation",
      "MIL-STD-810H: Environmental engineering considerations and laboratory tests",
      "RTCA DO-254: Design assurance guidance for airborne electronic hardware",
      "NASA-STD-5009: Nondestructive evaluation requirements for fracture-critical metallic components",
      "FAR Part 23: Airworthiness standards — normal category airplanes",
      "ECSS-E-ST-32C: Structural general requirements (space)",
      "SAE AMS 2750F: Pyrometry — aerospace heat treating",
      "ASTM E1742: Standard practice for radiographic examination",
      "MIL-HDBK-5J: Metallic materials properties development and standardization",
    ],
  },
  {
    domain: "medical",
    description: "Medical devices, implants, prosthetics, surgical instruments, diagnostic equipment",
    standards: [
      "FDA 21 CFR 820: Quality system regulation for medical devices",
      "ISO 13485: Quality management systems for medical devices",
      "ISO 14971: Application of risk management to medical devices",
      "IEC 60601-1: Medical electrical equipment — general requirements for safety",
      "ISO 10993-1: Biological evaluation of medical devices — evaluation and testing",
      "ISO 11607-1: Packaging for terminally sterilized medical devices",
      "ISO 11135: Sterilization by ethylene oxide",
      "IEC 62304: Medical device software — software lifecycle processes",
      "ISO 14708-1: Implants for surgery — active implantable medical devices",
      "ISO 5832-1: Implants for surgery — metallic materials (stainless steel)",
      "ISO 7153-1: Surgical instruments — metallic materials",
      "IEC 60601-1-2: Medical electrical equipment — EMC requirements",
    ],
  },
  {
    domain: "consumer",
    description: "Consumer electronics, household appliances, wearables, smart devices",
    standards: [
      "IEC 60335-1: Household and similar electrical appliances — safety",
      "IEC 62368-1: Audio/video, IT and communication equipment — safety",
      "IEC 60529: Degrees of protection (IP code)",
      "UL 2054: Household and commercial batteries",
      "EN 55032: EMC of multimedia equipment — emission requirements",
      "EN 61000-4-2: EMC — electrostatic discharge immunity",
      "IEC 61960: Secondary lithium cells and batteries for portable applications",
      "IEC 62133-2: Safety requirements for portable sealed lithium cells/batteries",
      "EN 50581: Technical documentation for assessment of RoHS compliance",
      "IEC 62471: Photobiological safety of lamps and lamp systems",
    ],
  },
  {
    domain: "industrial",
    description: "Factory equipment, CNC machines, conveyors, presses, assembly systems",
    standards: [
      "ISO 12100: Safety of machinery — general principles for design",
      "ISO 13849-1: Safety-related parts of control systems",
      "IEC 60204-1: Safety of machinery — electrical equipment of machines",
      "ISO 14120: Safety of machinery — guards and protective devices",
      "EN 349: Safety of machinery — minimum gaps to avoid crushing",
      "ISO 4413: Hydraulic fluid power — general rules for systems",
      "ISO 4414: Pneumatic fluid power — general rules for systems",
      "IEC 61508: Functional safety of E/E/PE safety-related systems",
      "ISO 13857: Safety distances to prevent hazard zones being reached",
      "OSHA 29 CFR 1910.147: Control of hazardous energy (lockout/tagout)",
    ],
  },
  {
    domain: "robotics",
    description: "Industrial robots, collaborative robots, autonomous vehicles, actuators",
    standards: [
      "ISO 10218-1: Industrial robots — safety requirements (robot)",
      "ISO 10218-2: Industrial robots — safety requirements (system/integration)",
      "ISO/TS 15066: Collaborative robots — safety requirements",
      "ISO 13482: Robots for personal care — safety requirements",
      "RIA 15.08: Industrial mobile robots — safety requirements",
      "IEC 61508: Functional safety of E/E/PE safety-related systems",
      "IEC 62443: Industrial communication networks — cybersecurity",
      "ISO 8373: Robotics — vocabulary",
    ],
  },
  {
    domain: "energy",
    description: "Solar panels, wind turbines, batteries, generators, inverters, fuel cells",
    standards: [
      "IEC 61215: Terrestrial PV modules — design qualification and type approval",
      "IEC 61730: PV module safety qualification",
      "IEC 62109-1: Safety of power converters for PV energy systems",
      "IEC 61400-1: Wind energy generation systems — design requirements",
      "IEC 62619: Secondary lithium cells — safety requirements for industrial applications",
      "UL 9540: Energy storage systems and equipment",
      "NFPA 855: Standard for the installation of stationary energy storage systems",
      "IEC 62282-3-100: Fuel cell technologies — stationary fuel cell power systems",
      "IEC 61427-1: Secondary cells for renewable energy storage",
      "IEEE 1547: Interconnection of distributed energy resources",
    ],
  },
  {
    domain: "construction",
    description: "Steel structures, concrete, buildings, bridges, HVAC, plumbing",
    standards: [
      "Eurocode 3 (EN 1993): Design of steel structures",
      "Eurocode 2 (EN 1992): Design of concrete structures",
      "AISC 360: Specification for structural steel buildings",
      "ACI 318: Building code requirements for structural concrete",
      "ASCE 7: Minimum design loads for buildings",
      "BS 5950: Structural use of steelwork in building",
      "EN 1090: Execution of steel structures — requirements",
      "ISO 3834: Quality requirements for fusion welding of metallic materials",
    ],
  },
  {
    domain: "rail",
    description: "Trains, locomotives, rail cars, signaling, track components",
    standards: [
      "EN 50126: Railway applications — RAMS specification",
      "EN 50128: Railway applications — software for railway control",
      "EN 50129: Railway applications — safety-related electronic systems",
      "UIC 518: Testing and approval of railway vehicles — running behaviour",
      "EN 15085: Railway applications — welding of railway vehicles",
      "EN 12663: Railway applications — structural requirements of vehicle bodies",
    ],
  },
  {
    domain: "defense",
    description: "Military equipment, armor, tactical systems, communications",
    standards: [
      "MIL-STD-810H: Environmental engineering considerations",
      "MIL-STD-461G: Electromagnetic interference characteristics",
      "MIL-STD-883: Test methods for microelectronics",
      "MIL-STD-1553B: Digital time division data bus",
      "DEF STAN 00-35: Environmental handbook for defence materiel",
      "STANAG 4569: Protection levels for armoured vehicles",
      "MIL-STD-130: Identification marking of US military property",
      "MIL-DTL-5015: Electrical connectors — environment resisting",
    ],
  },
  {
    domain: "oil_gas",
    description: "Pipelines, wellheads, refineries, offshore platforms, storage tanks",
    standards: [
      "API 5L: Line pipe specification",
      "API 6A: Wellhead and tree equipment",
      "API 650: Welded tanks for oil storage",
      "ASME B31.3: Process piping",
      "ASME B31.4: Pipeline transportation systems for liquids",
      "NACE MR0175/ISO 15156: Sulfide stress cracking — materials for use in H2S environments",
      "DNV-OS-F101: Submarine pipeline systems",
      "API 2000: Venting atmospheric and low-pressure storage tanks",
      "ATEX Directive 2014/34/EU: Equipment for explosive atmospheres",
      "API 520: Sizing, selection, and installation of pressure-relieving devices",
    ],
  },
  {
    domain: "mining",
    description: "Excavators, crushers, conveyors, underground ventilation, mineral processing",
    standards: [
      "ISO 19296: Mining machinery — mobile machines working underground — safety",
      "EN 14591: Explosion prevention and protection in underground mines",
      "AS/NZS 4240: Remote-controlled mining equipment — safety requirements",
      "IEC 60079-0: Explosive atmospheres — general requirements for equipment",
      "IEC 60079-1: Explosive atmospheres — flameproof enclosures",
      "MSHA 30 CFR Part 75: Mandatory safety standards — underground coal mines",
      "ISO 21815: Earth-moving machinery — collision warning and avoidance",
      "EN 1889-1: Non-rail-bound machines for underground mines — safety",
    ],
  },
  {
    domain: "water_treatment",
    description: "Water treatment plants, sewage systems, filtration, desalination, pipe networks",
    standards: [
      "EN 12566: Small wastewater treatment systems",
      "ISO 24516: Guidelines for asset management of water supply and sewerage",
      "NSF/ANSI 61: Drinking water system components — health effects",
      "NSF/ANSI 372: Drinking water system components — lead content",
      "EN 12255: Wastewater treatment plants — general construction principles",
      "BS 8525: Greywater systems — code of practice",
      "AWWA C900: PVC pressure pipe and fabricated fittings (4-60 in)",
      "ISO 16075: Guidelines for treated wastewater use for irrigation",
    ],
  },
  {
    domain: "processing",
    description: "Chemical plants, pressure vessels, heat exchangers, reactors, pharmaceutical equipment",
    standards: [
      "ASME BPVC Section VIII: Rules for construction of pressure vessels",
      "PED 2014/68/EU: Pressure equipment directive",
      "ATEX Directive 2014/34/EU: Equipment for explosive atmospheres",
      "ISO 2852: Stainless steel clamp-type sanitary fittings",
      "DIN 11850: Stainless steel tubes for the food industry",
      "NFPA 30: Flammable and combustible liquids code",
      "API 520: Sizing, selection, installation of pressure-relieving devices in refineries",
      "ASME B16.5: Pipe flanges and flanged fittings",
    ],
  },
  {
    domain: "agriculture",
    description: "Tractors, harvesters, irrigation systems, food processing machines",
    standards: [
      "ISO 4254-1: Agricultural machinery — safety — general requirements",
      "EN 1672-2: Food processing machinery — safety and hygiene requirements",
      "FDA 21 CFR 110: Current good manufacturing practice for food",
      "3-A Sanitary Standards: Hygienic design criteria for dairy and food equipment",
      "ISO 22000: Food safety management systems — requirements",
      "NSF/ANSI 51: Food equipment materials",
      "ISO 4254-7: Agricultural machinery — combine harvesters — safety",
      "EN ISO 4254-6: Agricultural machinery — sprayers and liquid fertilizer distributors",
    ],
  },
  {
    domain: "furniture",
    description: "Chairs, tables, desks, shelving, beds, cabinets, children's furniture",
    standards: [
      "BS EN 1728: Furniture — seating — test methods for durability",
      "EN 12520: Furniture — strength, durability and safety — domestic seating",
      "BIFMA X5.1: General-purpose office chairs — tests",
      "ASTM F2057: Standard safety specification for clothing storage units",
      "EN 716: Furniture — children's cots and folding cots — safety",
      "EN 14988: Children's high chairs — safety requirements",
      "CPSC 16 CFR 1303: Ban of lead-containing paint",
      "EN 527-1: Office furniture — work tables and desks — dimensions",
    ],
  },
  {
    domain: "sporting",
    description: "Bicycles, helmets, climbing gear, surfboards, fitness equipment",
    standards: [
      "ISO 4210: Cycles — safety requirements for bicycles",
      "EN 1078: Helmets for pedal cyclists and for users of skateboards and roller skates",
      "ASTM F1447: Standard specification for helmets used in recreational bicycling",
      "EN 892: Mountaineering equipment — dynamic ropes — safety requirements",
      "EN 13138: Buoyancy aids for swimming instruction",
      "ISO 6185: Inflatable boats — specifications",
      "EN 1651: Paragliding equipment — harnesses — safety requirements",
      "EN 957: Stationary training equipment — general safety requirements",
    ],
  },
  {
    domain: "packaging",
    description: "Containers, bottles, shipping containers, packaging machinery",
    standards: [
      "ISO 3394: Packaging — complete, filled transport packages — dimensions of rigid rectangular packages",
      "ASTM D4169: Standard practice for performance testing of shipping containers",
      "UN 3H1: Jerricans for dangerous goods — plastic",
      "ISTA 3A: General simulation performance test for packaged products",
      "ISO 11607-1: Packaging for terminally sterilized medical devices",
      "ASTM D6653: Standard test methods for determining the effects of high altitude on packaging",
    ],
  },
]

// ─── Generation ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert standards engineer with deep knowledge of international engineering standards across all industries.

Your task: Generate detailed engineering guidance for each standard listed. These must be based on REAL, PUBLISHED standards from recognized bodies.

For each standard, provide comprehensive engineering guidance that a CAD engineer would need to design a compliant product. Focus on requirements that affect physical design: dimensions, materials, safety factors, tolerances, test procedures.

IMPORTANT: Your content is engineering guidance INFORMED BY these standards — synthesized from publicly available scope descriptions, engineering textbooks, and common engineering knowledge. NOT verbatim copyrighted text.

Return ONLY valid JSON (no markdown fences) in this format:
{
  "standards": [
    {
      "standard_code": "ISO 12215-5",
      "standard_name": "Hull construction — scantlings for single-skin craft",
      "issuing_body": "ISO",
      "summary": "200-500 word summary of what the standard covers and why it matters for CAD design",
      "requirements_markdown": "2000-8000 word detailed engineering guidance including specific dimensions, tolerances, material requirements, safety factors, formulas, and test procedures. Use markdown headers and bullet points for readability.",
      "design_rules": [
        {"rule": "Minimum single-skin GRP panel thickness for vessels <8m LOA is 4mm", "section": "5.2.3", "criticality": "mandatory"},
        {"rule": "Stiffener spacing shall not exceed 300mm for unsupported panels", "section": "6.1", "criticality": "mandatory"}
      ],
      "material_specs": {
        "allowed_materials": ["E-glass/polyester GRP", "marine-grade aluminum 5083-H321"],
        "prohibited_materials": ["mild steel without marine coating"]
      },
      "product_tags": ["boat", "hull", "vessel"],
      "engineering_tags": ["structural", "scantlings", "laminate"],
      "applicable_to": ["recreational_vessel", "commercial_vessel"],
      "region": ["global"],
      "version": "2019"
    }
  ]
}`

async function generateStandardsForDomain(domainSeed: DomainSeed): Promise<number> {
  const userPrompt = `Domain: ${domainSeed.domain} (${domainSeed.description})

Generate engineering guidance for these ${domainSeed.standards.length} standards:
${domainSeed.standards.map((s, i) => `${i + 1}. ${s}`).join("\n")}

For each standard, provide detailed, practical engineering guidance that a CAD engineer needs. Include specific numerical values (dimensions, tolerances, safety factors) wherever possible.`

  console.log(`\n[${"=".repeat(60)}]`)
  console.log(`[SEED] Generating ${domainSeed.standards.length} standards for domain: ${domainSeed.domain}`)
  console.log(`[${"=".repeat(60)}]`)

  const startTime = Date.now()

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 16384,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error(`[SEED] API error for ${domainSeed.domain}: ${response.status} ${err.slice(0, 200)}`)
      return 0
    }

    const data = await response.json()
    const text = data.content
      ?.filter((b: { type: string }) => b.type === "text")
      ?.map((b: { type: string; text?: string }) => b.text || "")
      ?.join("") ?? ""

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[SEED] Claude responded in ${elapsed}s (${text.length} chars)`)

    // Parse JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error(`[SEED] No JSON found for ${domainSeed.domain}`)
      return 0
    }

    let parsed: { standards: Array<Record<string, unknown>> }
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch (parseErr) {
      console.error(`[SEED] JSON parse error for ${domainSeed.domain}:`, parseErr)
      return 0
    }

    if (!parsed.standards || !Array.isArray(parsed.standards)) {
      console.error(`[SEED] Invalid structure for ${domainSeed.domain}`)
      return 0
    }

    // Insert into Supabase
    const toInsert = parsed.standards.map((s: Record<string, unknown>) => ({
      standard_code: String(s.standard_code || ""),
      standard_name: String(s.standard_name || ""),
      issuing_body: String(s.issuing_body || ""),
      industry_domain: domainSeed.domain,
      product_tags: Array.isArray(s.product_tags) ? s.product_tags : [],
      engineering_tags: Array.isArray(s.engineering_tags) ? s.engineering_tags : [],
      summary: String(s.summary || ""),
      requirements_markdown: String(s.requirements_markdown || ""),
      design_rules: Array.isArray(s.design_rules) ? s.design_rules : [],
      material_specs: typeof s.material_specs === "object" ? s.material_specs : {},
      dimensional_constraints: {},
      applicable_to: Array.isArray(s.applicable_to) ? s.applicable_to : [],
      region: Array.isArray(s.region) ? s.region : ["global"],
      version: s.version ? String(s.version) : null,
      token_estimate: Math.ceil(
        (String(s.summary || "").length + String(s.requirements_markdown || "").length) / 4
      ),
      source: "ai_generated",
      source_notes: "Seeded by scripts/seed-design-standards.ts — engineering guidance synthesized from public knowledge",
      verified: false,
    }))

    const { data: inserted, error } = await supabase
      .from("design_standards")
      .upsert(toInsert, { onConflict: "standard_code", ignoreDuplicates: false })
      .select("standard_code")

    if (error) {
      console.error(`[SEED] Supabase error for ${domainSeed.domain}:`, error.message)
      return 0
    }

    const count = inserted?.length ?? 0
    console.log(`[SEED] ✓ Inserted ${count} standards for ${domainSeed.domain}`)
    return count
  } catch (err) {
    console.error(`[SEED] Error for ${domainSeed.domain}:`, err instanceof Error ? err.message : err)
    return 0
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗")
  console.log("║  ForgeOS Design Standards Library — Seed Script         ║")
  console.log("║  Generating ~185 standards across 19 domains            ║")
  console.log("╚══════════════════════════════════════════════════════════╝")

  const totalStandards = DOMAINS.reduce((sum, d) => sum + d.standards.length, 0)
  console.log(`\nTotal standards to generate: ${totalStandards} across ${DOMAINS.length} domains`)
  console.log("Estimated time: 5-15 minutes (depending on API speed)\n")

  let totalInserted = 0
  const startTime = Date.now()

  for (const domain of DOMAINS) {
    const count = await generateStandardsForDomain(domain)
    totalInserted += count

    // Brief pause between domains to avoid rate limits
    await new Promise(r => setTimeout(r, 2000))
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1)
  console.log("\n╔══════════════════════════════════════════════════════════╗")
  console.log(`║  DONE: ${totalInserted}/${totalStandards} standards seeded in ${elapsed} minutes`)
  console.log("╚══════════════════════════════════════════════════════════╝")
}

main().catch(console.error)
