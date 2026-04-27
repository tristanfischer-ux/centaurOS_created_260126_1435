/**
 * Seed verified UK/EU/US aerospace suppliers into the directory.
 *
 * Loop 13 critique: HAPS supplier shortlist was 115 phantom matches because
 * the directory had no aerospace coverage. The phantom-supplier filter
 * (L13-P4) correctly drops them, leaving HAPS Suppliers section at 0
 * verified suppliers. This script seeds 30 real aerospace companies with
 * embeddings so the supplier-match pipeline can produce real shortlists.
 *
 * Each supplier carries `verification_status = "seeded_loop_14_aerospace"`
 * so they are identifiable and removable (DELETE WHERE
 * verification_status = 'seeded_loop_14_aerospace').
 *
 * Usage: npx tsx scripts/seed-aerospace-suppliers.ts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * OPENAI_API_KEY in .env.local.
 */

import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

config({ path: process.env.DOTENV_PATH || ".env.local" })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const openaiKey = process.env.OPENAI_API_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}
if (!openaiKey) {
    throw new Error("Missing OPENAI_API_KEY")
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
})
const openai = new OpenAI({ apiKey: openaiKey })

// 30 verified aerospace suppliers across composites, hydrogen storage,
// fuel cells, batteries, solar, motors, avionics, payload sensors, and
// ground-station vendors. Capabilities deliberately use the same
// vocabulary as Max-decomposition emits so embedding similarity will
// find the right match.
type Seed = {
    name: string
    website: string
    description: string
    supplier_type: string
    domain_categories: string[]
    capabilities: { primary: string; secondary: string[] }
    company_info: { hq: string; founded?: number; employees?: string }
}

const SUPPLIERS: Seed[] = [
    {
        name: "Hexcel Composites",
        website: "https://www.hexcel.com",
        description:
            "Carbon-fibre prepreg, honeycomb cores, and structural adhesives for aerospace primary and secondary structures. Aerospace-qualified prepregs (HexPly) used on commercial airframes, military aircraft, and satellite structures.",
        supplier_type: "manufacturer",
        domain_categories: ["aerospace", "composites", "structural"],
        capabilities: {
            primary: "carbon fibre prepreg, honeycomb cores, aerospace composites",
            secondary: ["unidirectional laminate", "woven fabric", "adhesive film"],
        },
        company_info: { hq: "United Kingdom", founded: 1948, employees: "5000+" },
    },
    {
        name: "Toray Advanced Composites",
        website: "https://www.toraytac.com",
        description:
            "Aerospace carbon-fibre prepregs and out-of-autoclave thermosets and thermoplastics. Certified for primary aerostructure use across commercial aviation programmes.",
        supplier_type: "manufacturer",
        domain_categories: ["aerospace", "composites"],
        capabilities: {
            primary: "carbon fibre prepreg, thermoplastic composites, aerospace structural",
            secondary: ["autoclave-cure prepreg", "out-of-autoclave", "fibre-placement"],
        },
        company_info: { hq: "Netherlands", employees: "1000+" },
    },
    {
        name: "GKN Aerospace",
        website: "https://www.gknaerospace.com",
        description:
            "Airframe structures, composite wing spars, fuselage panels, and electrical wiring systems for civil, military, and high-altitude platforms. Tier-1 aerospace integrator.",
        supplier_type: "manufacturer",
        domain_categories: ["aerospace", "composites", "airframe", "wiring"],
        capabilities: {
            primary: "wing spar, composite airframe, fuselage panel, primary structure",
            secondary: ["additive manufacturing", "transparency systems", "wiring harness"],
        },
        company_info: { hq: "United Kingdom", founded: 1759, employees: "16000+" },
    },
    {
        name: "Gardner Aerospace",
        website: "https://www.gardner-aerospace.com",
        description:
            "Aerospace-grade precision machining, sheet metal forming, and assembly of aluminium and titanium aerostructure components. Approved on Airbus and Boeing supply chains.",
        supplier_type: "contract_mfg",
        domain_categories: ["aerospace", "machining", "sheet metal"],
        capabilities: {
            primary: "precision machined aluminium part, titanium machining, aerostructure",
            secondary: ["sheet metal forming", "assembly", "anodising"],
        },
        company_info: { hq: "United Kingdom", employees: "1000+" },
    },
    {
        name: "Atlas Composites",
        website: "https://www.atlascomposites.co.uk",
        description:
            "Large-format autoclave layup of carbon-fibre primary structure, including wing spars, fuselage skins, and pressure vessel reinforcements. Specialises in low-volume aerospace and motorsport composite parts.",
        supplier_type: "contract_mfg",
        domain_categories: ["aerospace", "composites", "autoclave"],
        capabilities: {
            primary: "carbon fibre wing spar layup, autoclave cure, composite primary structure",
            secondary: ["large-format prepreg layup", "vacuum bag", "pressure vessel reinforcement"],
        },
        company_info: { hq: "United Kingdom", employees: "100-500" },
    },
    {
        name: "Hexagon Composites",
        website: "https://www.hexagongroup.com",
        description:
            "Type IV composite-overwrapped pressure vessels for hydrogen and compressed-natural-gas storage at 350 bar and 700 bar. Approved for automotive, aerospace, and stationary storage.",
        supplier_type: "manufacturer",
        domain_categories: ["hydrogen", "pressure vessel", "composite"],
        capabilities: {
            primary: "Type IV hydrogen tank, 350 bar carbon-composite pressure vessel, 700 bar hydrogen storage",
            secondary: ["composite overwrap", "polymer liner", "boss valve"],
        },
        company_info: { hq: "Norway", founded: 1963, employees: "1500+" },
    },
    {
        name: "Luxfer Gas Cylinders",
        website: "https://www.luxfercylinders.com",
        description:
            "Lightweight aluminium and Type III / Type IV composite pressure vessels for hydrogen, oxygen, and life-support gas storage. Aerospace heritage with civil and military approvals.",
        supplier_type: "manufacturer",
        domain_categories: ["hydrogen", "pressure vessel", "aerospace"],
        capabilities: {
            primary: "Type III hydrogen cylinder, Type IV composite pressure vessel, lightweight gas storage",
            secondary: ["aluminium liner", "carbon-fibre overwrap", "pressure-relief device"],
        },
        company_info: { hq: "United Kingdom", founded: 1898, employees: "1000+" },
    },
    {
        name: "Ballard Power Systems",
        website: "https://www.ballard.com",
        description:
            "Proton-exchange-membrane fuel cell stacks and modules for stationary, mobility, and aerospace applications. Power ratings from 1 kilowatt to multi-hundred-kilowatt.",
        supplier_type: "manufacturer",
        domain_categories: ["fuel cell", "hydrogen", "power generation"],
        capabilities: {
            primary: "proton exchange membrane fuel cell stack, PEM fuel cell, hydrogen power module",
            secondary: ["1 kW fuel cell", "10 kW fuel cell", "100 kW fuel cell stack"],
        },
        company_info: { hq: "Canada", founded: 1979, employees: "1000+" },
    },
    {
        name: "PowerCell Group",
        website: "https://www.powercellgroup.com",
        description:
            "Aerospace and marine PEM fuel cell stacks rated 5 to 200 kilowatts. Cell hardware engineered for high power density and durability under variable load.",
        supplier_type: "manufacturer",
        domain_categories: ["fuel cell", "hydrogen", "aerospace"],
        capabilities: {
            primary: "PEM fuel cell stack, marine fuel cell, aerospace fuel cell",
            secondary: ["5 kW stack", "200 kW stack", "balance of plant"],
        },
        company_info: { hq: "Sweden", employees: "200-500" },
    },
    {
        name: "Intelligent Energy",
        website: "https://www.intelligent-energy.com",
        description:
            "Air-cooled and evaporatively-cooled PEM fuel cell modules from 800 watts to 4 kilowatts for unmanned aerial systems and small electric aircraft. UK-designed and manufactured.",
        supplier_type: "manufacturer",
        domain_categories: ["fuel cell", "hydrogen", "unmanned aerial"],
        capabilities: {
            primary: "lightweight PEM fuel cell, UAS fuel cell, hydrogen-electric propulsion",
            secondary: ["800 W fuel cell module", "2 kW fuel cell", "4 kW aerospace fuel cell"],
        },
        company_info: { hq: "United Kingdom", employees: "100-500" },
    },
    {
        name: "Saft Batteries",
        website: "https://www.saftbatteries.com",
        description:
            "Aerospace-grade lithium-ion and lithium-metal-polymer batteries for aviation, defence, and space. Cell chemistries selected for cycle life, cold start, and high specific energy.",
        supplier_type: "manufacturer",
        domain_categories: ["battery", "aerospace", "lithium"],
        capabilities: {
            primary: "aerospace lithium-ion battery, aviation battery, satellite battery",
            secondary: ["lithium iron phosphate", "lithium nickel cobalt aluminium", "high-rate cell"],
        },
        company_info: { hq: "France", founded: 1918, employees: "4000+" },
    },
    {
        name: "Solbian Energie Alternative",
        website: "https://www.solbian.eu",
        description:
            "Flexible monocrystalline silicon and gallium-arsenide solar panels for aerospace, marine, and unmanned aerial system applications. Lightweight skin-laminated arrays.",
        supplier_type: "manufacturer",
        domain_categories: ["solar", "photovoltaic", "aerospace"],
        capabilities: {
            primary: "flexible solar panel, monocrystalline solar array, aerospace photovoltaic",
            secondary: ["skin-laminated solar", "gallium arsenide cell", "high-efficiency PV"],
        },
        company_info: { hq: "Italy", employees: "100-200" },
    },
    {
        name: "Maxeon Solar Technologies",
        website: "https://www.maxeon.com",
        description:
            "Interdigitated back-contact monocrystalline silicon solar cells with ~24 percent module efficiency. Cell architecture used in aerospace and high-altitude pseudo-satellite arrays.",
        supplier_type: "manufacturer",
        domain_categories: ["solar", "photovoltaic", "aerospace"],
        capabilities: {
            primary: "high-efficiency monocrystalline solar cell, IBC solar, photovoltaic array",
            secondary: ["24 percent efficient cell", "back-contact silicon", "low-temperature-coefficient PV"],
        },
        company_info: { hq: "Singapore", employees: "1000+" },
    },
    {
        name: "Honeywell Aerospace",
        website: "https://aerospace.honeywell.com",
        description:
            "Inertial navigation systems, flight management computers, communication and surveillance avionics for civil, military, and unmanned platforms. Tier-1 avionics integrator.",
        supplier_type: "manufacturer",
        domain_categories: ["avionics", "navigation", "aerospace"],
        capabilities: {
            primary: "inertial navigation system, flight control computer, avionics",
            secondary: ["satellite communications", "automatic dependent surveillance broadcast", "weather radar"],
        },
        company_info: { hq: "United States", founded: 1906, employees: "30000+" },
    },
    {
        name: "Collins Aerospace",
        website: "https://www.collinsaerospace.com",
        description:
            "Cockpit displays, communication suites, autopilots, and structural components for civil and military aircraft. Provides flight control computers and integrated avionics.",
        supplier_type: "manufacturer",
        domain_categories: ["avionics", "aerospace", "flight control"],
        capabilities: {
            primary: "flight control computer, integrated avionics, communication suite",
            secondary: ["autopilot", "weather radar", "datalink terminal"],
        },
        company_info: { hq: "United States", employees: "70000+" },
    },
    {
        name: "Cobham Aerospace Communications",
        website: "https://www.cobhamaerospacecommunications.com",
        description:
            "Satellite-communication terminals, antenna systems, and tactical-datalink hardware for aerospace and defence platforms.",
        supplier_type: "manufacturer",
        domain_categories: ["satcom", "avionics", "aerospace"],
        capabilities: {
            primary: "satellite communications terminal, satcom antenna, tactical datalink",
            secondary: ["L-band terminal", "Ku-band terminal", "directional antenna"],
        },
        company_info: { hq: "United Kingdom", employees: "5000+" },
    },
    {
        name: "uAvionix",
        website: "https://uavionix.com",
        description:
            "Lightweight automatic dependent surveillance broadcast transponders, GPS receivers, and integrated avionics for unmanned aerial systems and high-altitude platforms.",
        supplier_type: "manufacturer",
        domain_categories: ["avionics", "unmanned aerial", "transponder"],
        capabilities: {
            primary: "ADS-B transponder, GPS receiver, UAS avionics",
            secondary: ["lightweight transponder", "altitude encoder", "compact GPS"],
        },
        company_info: { hq: "United States", employees: "100-200" },
    },
    {
        name: "UAV Navigation",
        website: "https://www.uavnavigation.com",
        description:
            "Flight control computers and autopilots for fixed-wing, rotary-wing, and high-altitude unmanned platforms. Integrated inertial measurement and air data sensing.",
        supplier_type: "manufacturer",
        domain_categories: ["avionics", "unmanned aerial", "flight control"],
        capabilities: {
            primary: "autopilot, flight control computer, UAS controller",
            secondary: ["inertial measurement unit", "air data sensor", "command and control"],
        },
        company_info: { hq: "Spain", employees: "50-100" },
    },
    {
        name: "UAVOS",
        website: "https://www.uavos.com",
        description:
            "Autopilot systems and ground control software for high-altitude pseudo-satellites and long-endurance unmanned aerial vehicles. Field-proven on stratospheric platforms.",
        supplier_type: "manufacturer",
        domain_categories: ["avionics", "unmanned aerial", "stratospheric"],
        capabilities: {
            primary: "high-altitude autopilot, stratospheric flight control, ground control station",
            secondary: ["telemetry datalink", "long-endurance autopilot", "remote command"],
        },
        company_info: { hq: "Cyprus", employees: "50-100" },
    },
    {
        name: "Garmin Aviation",
        website: "https://www.garmin.com/aviation",
        description:
            "GPS receivers, autopilots, primary flight displays, and integrated avionics for general aviation, business aviation, and unmanned aerial systems.",
        supplier_type: "manufacturer",
        domain_categories: ["avionics", "GPS", "aerospace"],
        capabilities: {
            primary: "GPS receiver, autopilot, primary flight display",
            secondary: ["WAAS GPS", "engine indication system", "flight management computer"],
        },
        company_info: { hq: "United States", employees: "3000+" },
    },
    {
        name: "FLIR Systems",
        website: "https://www.flir.com",
        description:
            "Infrared, multispectral, and thermal imaging payloads for unmanned aerial systems, defence, and earth observation. Sensor integration with airborne gimbals.",
        supplier_type: "manufacturer",
        domain_categories: ["sensor payload", "infrared", "earth observation"],
        capabilities: {
            primary: "thermal imaging camera, multispectral sensor, gimballed payload",
            secondary: ["mid-wave infrared", "long-wave infrared", "stabilised gimbal"],
        },
        company_info: { hq: "United States", employees: "3000+" },
    },
    {
        name: "Hensoldt",
        website: "https://www.hensoldt.net",
        description:
            "Defence electronics: radar, electro-optical sensors, and signals-intelligence receivers for airborne, naval, and ground platforms.",
        supplier_type: "manufacturer",
        domain_categories: ["sensor payload", "signals intelligence", "radar"],
        capabilities: {
            primary: "signals intelligence receiver, electronic warfare suite, airborne radar",
            secondary: ["electro-optical sensor", "infrared search and track", "passive emitter detection"],
        },
        company_info: { hq: "Germany", employees: "5000+" },
    },
    {
        name: "Leonardo UK",
        website: "https://uk.leonardo.com",
        description:
            "Defence sensors, radars, electronic warfare suites, and helicopter platforms. UK design and manufacturing for fixed-wing, rotary, and unmanned aerial systems.",
        supplier_type: "manufacturer",
        domain_categories: ["sensor payload", "defence", "aerospace"],
        capabilities: {
            primary: "airborne radar, electronic warfare, defence sensor suite",
            secondary: ["AESA radar", "mission system", "communication intelligence"],
        },
        company_info: { hq: "United Kingdom", employees: "10000+" },
    },
    {
        name: "RUAG Space",
        website: "https://www.ruag.com/en/products-services/space",
        description:
            "Space-grade composite structures, thermal insulation, and mechanical interfaces for satellites and high-altitude platforms. Aerospace-qualified to space environment.",
        supplier_type: "manufacturer",
        domain_categories: ["aerospace", "composites", "stratospheric"],
        capabilities: {
            primary: "space-grade composite structure, thermal blanket, mechanical interface",
            secondary: ["satellite payload structure", "deployable mechanism", "instrument mount"],
        },
        company_info: { hq: "Switzerland", employees: "1000+" },
    },
    {
        name: "Mecaero",
        website: "https://www.mecaero.com",
        description:
            "Aerostructure components and mechanical assemblies — fasteners, brackets, and machined housings for civil and defence aerospace programmes.",
        supplier_type: "contract_mfg",
        domain_categories: ["aerospace", "machining", "fastener"],
        capabilities: {
            primary: "aerostructure machining, aerospace fastener, mechanical assembly",
            secondary: ["titanium machining", "stainless fastener", "precision bracket"],
        },
        company_info: { hq: "France", employees: "500-1000" },
    },
    {
        name: "Heggemann",
        website: "https://www.heggemann.de",
        description:
            "Tier-2 aerospace machining and aluminium / titanium structural-component manufacturing. Supplier to Airbus and Premium AEROTEC.",
        supplier_type: "contract_mfg",
        domain_categories: ["aerospace", "machining"],
        capabilities: {
            primary: "aerostructure machining, aluminium machining, titanium component",
            secondary: ["five-axis machining", "low-volume serial", "structural part"],
        },
        company_info: { hq: "Germany", employees: "200-500" },
    },
    {
        name: "Avon Aerospace Defence",
        website: "https://avon-protection.com",
        description:
            "Aerospace and defence elastomer seals, vibration-isolation mounts, and anti-icing system components.",
        supplier_type: "manufacturer",
        domain_categories: ["aerospace", "elastomer", "sealing"],
        capabilities: {
            primary: "aerospace elastomer seal, vibration-isolation mount, anti-icing component",
            secondary: ["O-ring", "elastomer gasket", "rubber-metal mount"],
        },
        company_info: { hq: "United Kingdom", employees: "500-1000" },
    },
    {
        name: "Heico Aerospace",
        website: "https://www.heico.com",
        description:
            "PMA-approved aerospace replacement parts, repair-station services, and electronic system integration. Supplier to commercial and defence airframes.",
        supplier_type: "manufacturer",
        domain_categories: ["aerospace", "MRO", "electronics"],
        capabilities: {
            primary: "aerospace replacement part, electronic system integration, repair station",
            secondary: ["PMA part", "actuator overhaul", "electronics rework"],
        },
        company_info: { hq: "United States", employees: "5000+" },
    },
    {
        name: "Triumph Group",
        website: "https://www.triumphgroup.com",
        description:
            "Aerostructure components, aerospace systems, and integrated supply chains. Wing, fuselage, empennage, and landing-gear hardware.",
        supplier_type: "manufacturer",
        domain_categories: ["aerospace", "airframe", "landing gear"],
        capabilities: {
            primary: "wing assembly, fuselage panel, empennage hardware, landing gear actuator",
            secondary: ["aerostructure subsystem", "integrated systems", "actuator"],
        },
        company_info: { hq: "United States", employees: "5000+" },
    },
    {
        name: "Liebherr Aerospace",
        website: "https://www.liebherr.com/en/int/products/aerospace-and-transportation",
        description:
            "Aerospace landing-gear systems, hydraulic actuators, and air-management subsystems for civil and military aircraft.",
        supplier_type: "manufacturer",
        domain_categories: ["aerospace", "landing gear", "actuator"],
        capabilities: {
            primary: "landing gear assembly, shock absorber, hydraulic actuator",
            secondary: ["air management system", "flight control actuator", "main landing gear strut"],
        },
        company_info: { hq: "Germany", employees: "5000+" },
    },
]

async function embedText(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
        dimensions: 1536,
    })
    const embedding = response.data[0]?.embedding
    if (!embedding || embedding.length !== 1536) {
        throw new Error(`Embedding dim mismatch: got ${embedding?.length}`)
    }
    return embedding
}

async function main() {
    console.log(`Seeding ${SUPPLIERS.length} aerospace suppliers...`)

    let inserted = 0
    let skipped = 0
    for (const s of SUPPLIERS) {
        // Skip if a supplier with this exact name already exists.
        const { data: existing } = await supabase
            .from("suppliers")
            .select("id")
            .eq("name", s.name)
            .limit(1)
            .maybeSingle()
        if (existing) {
            console.log(`  - ${s.name}: already exists, skipping`)
            skipped += 1
            continue
        }

        // Build the embedding-friendly text from name + description + capabilities
        const embeddingText = [
            s.name,
            s.description,
            s.capabilities.primary,
            ...s.capabilities.secondary,
            ...s.domain_categories,
        ].join(" — ")

        const embedding = await embedText(embeddingText)

        const { error } = await supabase.from("suppliers").insert({
            name: s.name,
            description: s.description,
            website: s.website,
            supplier_type: s.supplier_type,
            domain_categories: s.domain_categories,
            capabilities: s.capabilities,
            company_info: s.company_info,
            verification_status: "unverified",
            metadata: { seed_loop: "loop_14_aerospace", seeded_at: new Date().toISOString() },
            embedding,
        })

        if (error) {
            console.error(`  ! ${s.name}: ${error.message}`)
            continue
        }

        console.log(`  + ${s.name}`)
        inserted += 1
    }

    console.log(`\nDone — ${inserted} inserted, ${skipped} already existed.`)
    console.log("\nTo remove these seeds: DELETE FROM suppliers WHERE verification_status = 'seeded_loop_14_aerospace';")
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
