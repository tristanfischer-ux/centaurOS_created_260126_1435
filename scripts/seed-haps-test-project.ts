/**
 * seed-haps-test-project.ts
 *
 * Seeds a single, richly populated HAPS UAV project into the Claude test
 * foundry so the V2 Forge pages (Today / Workspace / Brief) render with
 * real-looking data instead of empty states. The project is the
 * "Stratosphere HAPS-S1" spec from the mockup reference brief:
 *   - solar-powered high-altitude pseudo-satellite
 *   - 30-day endurance at FL650
 *   - 25 m wingspan, 42 m² solar array
 *   - 9 modules, 93 parts (sum of keyParts)
 *   - batch 50, UK + EU markets
 *   - AS9100 / EASA Part 21 regulatory posture
 *   - £172k all-in unit cost (over the £150k ceiling)
 *   - 68.17 kg total module mass (over the 68 kg MTOW)
 *
 * Idempotent: reuses a deterministic UUID derived from the foundry + project
 * slug so reruns overwrite the same row. Safe to run multiple times.
 *
 * Usage:
 *   npx tsx scripts/seed-haps-test-project.ts
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local. Uses the
 * service-role key to bypass RLS so it can INSERT into the test user's
 * foundry without needing a session token.
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { v5 as uuidv5 } from "uuid"

dotenv.config({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Constants ───────────────────────────────────────────────────────

const TEST_USER_EMAIL = "claude-test@forgeos.test"
const FOUNDRY_ID = "claude-test-foundry"
const PROJECT_SLUG = "haps-s1"
const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
const PROJECT_ID = uuidv5(`${FOUNDRY_ID}::${PROJECT_SLUG}`, NAMESPACE)

const START_DATE = new Date("2026-02-11T09:15:00Z") // 11 Feb 2026 (from the original HAPS reference brief)

// ─── Modules — 9 modules summing to 68.17 kg and 93 parts ────────────

interface SeedModule {
    id: string
    name: string
    purpose: string
    description: string
    whyItMatters: string
    keyParts: string[]
    inputs: string[]
    outputs: string[]
    estimatedMassKg: number
    /** Pre-declared mass budget (kg) for this module — the Modules mass
     *  budget table reads this and surfaces deltas vs estimatedMassKg. */
    budgetMassKg: number
    leadWeeks: number
    /** Where the lead-time number came from. Shown under the Lead stat on the
     *  Modules page so founders know how much to trust each number. */
    leadTimeSource: "supplier-quote" | "ai-estimate" | "historical-analogue" | "specialist-judgement"
    failureModes: string[]
    unknowns: string[]
    /** Per-unit all-in cost (GBP) across this module. Sum across modules = £172k. */
    unitCostGbp: number
    /** How confident the estimate is — shown in the workspace cost pane. */
    confidence: "low" | "medium" | "high"
    costAssumptions: string[]
    costReasoning: string
}

const MODULES: SeedModule[] = [
    {
        id: "wing_structure",
        name: "Wing structure (25 m span)",
        purpose:
            "Primary lift surface and load-bearing backbone — carries solar array, fuel-cell pods, control surfaces, and gust loads at FL650.",
        description:
            "Twin-boom carbon-epoxy box-spar with ribbed composite skin. Aspect ratio 21:1. Integrated cable tray routes power from array to MPPT. Designed for +3.2g / -1.5g limit loads with 1.5× ultimate factor per CS-23 aerobatic. Three-piece field-assembly with bolted butt joints at ±7 m and ±12.5 m so a 50-station production line can ship shorter crates.",
        whyItMatters:
            "Every kilo of wing mass costs you 2.3 kg of fuel-cell + solar area to stay airborne at 30 days. Getting the spar lay-up right is the single biggest lever on endurance.",
        keyParts: [
            "Upper spar cap (T700 / 8552 prepreg)",
            "Lower spar cap (T800 / 3900-2B prepreg)",
            "Shear web (±45° CFRP)",
            "Wing ribs × 44",
            "Leading-edge D-box",
            "Trailing-edge control-surface hinges × 8",
            "Carbon skin panel set (upper + lower, 18 panels)",
            "Winglet tip assembly × 2",
            "Root rib + boom attachment fitting",
            "Field-joint splice plate set × 2",
            "Pitot + AOA boom mount",
            "Aileron hinge bearing set",
            "Electrical cable tray (wing-root to tip)",
        ],
        inputs: ["Aero-loads flight envelope", "Payload mass budget", "MPPT cable run"],
        outputs: ["Lift", "Solar panel mounting surface", "Control-surface actuation path"],
        estimatedMassKg: 22.4,
        budgetMassKg: 22.5,
        leadWeeks: 14,
        leadTimeSource: "supplier-quote",
        failureModes: [
            "Spar-cap delamination under thermal cycling (−65 °C ↔ +55 °C at FL650)",
            "Boom-attachment fitting fatigue at 15 000 gust cycles",
            "Field-joint bolt hole fretting after humidity / altitude cycling",
        ],
        unknowns: [
            "Final lay-up schedule — awaiting Jian's FEA correlation against Astra's coupon data.",
            "Whether we need a wet-wing tank section or keep fuel cells in the pods.",
        ],
        unitCostGbp: 42_300,
        confidence: "medium",
        costAssumptions: [
            "T700/T800 prepreg at £68/kg delivered",
            "Autoclave cycle 4h, £620/h shared rate",
            "22% scrap allowance on prepreg",
            "50-unit batch spread over 9 months",
        ],
        costReasoning:
            "Dominated by autoclave hours and prepreg. If we can move the field-joint plates to RTM we save ~£3 100/unit but add 2 weeks to the tool build.",
    },
    {
        id: "propulsion_pods",
        name: "Propulsion pods (×2)",
        purpose:
            "Carry fuel cells, hydrogen tanks, motor controllers, and twin electric motors + variable-pitch props.",
        description:
            "Mirrored port/starboard pods slung under the wing at ±6.2 m. Each pod houses one 4 kW PEM fuel cell, a 3.7 kg composite hydrogen tank (700 bar), motor controller, and a 9.2 kW brushless motor driving a 2.4 m composite prop. Pods are Kevlar-skinned for bird-strike and fire containment.",
        whyItMatters:
            "The propulsion pods are the only redundant system on the aircraft. Single-pod failure must let us glide 180 km to the nearest recovery site.",
        keyParts: [
            "PEM fuel cell stack × 2",
            "Type-IV H₂ tank (700 bar) × 2",
            "Motor controller + DC-DC converter × 2",
            "Brushless outrunner motor × 2",
            "Variable-pitch prop hub × 2",
            "2.4 m composite prop blade × 4",
            "Pod nacelle (Kevlar skin) × 2",
            "Thermal-management radiator × 2",
            "Oxygen intake scoop × 2",
            "Fire-detection + nitrogen purge kit × 2",
            "Pod-to-wing attachment fitting × 2",
        ],
        inputs: ["H₂ from centre tank", "Battery DC bus", "FMS throttle command"],
        outputs: ["Thrust", "Waste heat", "Water exhaust"],
        estimatedMassKg: 15.6,
        budgetMassKg: 15.2,
        leadWeeks: 18,
        leadTimeSource: "supplier-quote",
        failureModes: [
            "Fuel-cell flooding above 98% humidity during climb through weather layer",
            "Prop-blade fatigue at 1 900 rpm over 30-day continuous duty",
            "Motor bearing cold-soak seizure during restart at −65 °C",
        ],
        unknowns: [
            "Prop supplier — still choosing between MT Propeller and Hartzell composite variants.",
            "Whether we need a small lithium buffer for restart current or sized purely off the fuel cell.",
        ],
        unitCostGbp: 38_900,
        confidence: "medium",
        costAssumptions: [
            "Fuel-cell stack £14k each (Intelligent Energy quote)",
            "H₂ tank £3.1k each (ILJIN composites, 10-unit tooling amortised)",
            "Motor + controller £4.8k (Emrax quote)",
            "Pod nacelle tooling amortised over 50 units",
        ],
        costReasoning:
            "Fuel-cell cost is the biggest line. Intelligent Energy indicated a 12% discount if we commit to a 100-stack frame contract before end of Q3.",
    },
    {
        id: "fuselage_central",
        name: "Fuselage (central pressure vessel)",
        purpose:
            "Houses avionics bay, main H₂ tank, payload bay, and ground-handling interfaces.",
        description:
            "Carbon-epoxy monocoque with ring-frames at 0.4 m pitch. Nose cone houses the satcom radome; centre section carries the main hydrogen tank; aft cone houses the tail-tie-down and ground-control antenna. The avionics bay is on vibration isolators and is temperature-stabilised between −20 °C and +40 °C via cabin heater + passive radiator.",
        whyItMatters:
            "Fuselage ring-frame pitch drives how you route every cable and pressure line. Get it wrong and every downstream module has to re-route.",
        keyParts: [
            "Forward ring-frame set × 4",
            "Mid ring-frame set (reinforced) × 3",
            "Aft ring-frame set × 3",
            "Nose cone + radome",
            "Avionics bay floor + rack",
            "Main H₂ tank (28 kg, 700 bar)",
            "Payload bay door + latch",
            "Tail cone + ground-handling fitting",
            "External access panels × 4",
            "Cabin heater element",
        ],
        inputs: ["Wing root loads", "Tail loads", "Ground-handling loads"],
        outputs: ["Structural load path", "Avionics thermal environment"],
        estimatedMassKg: 9.4,
        budgetMassKg: 9.5,
        leadWeeks: 12,
        leadTimeSource: "historical-analogue",
        failureModes: [
            "Ring-frame web buckling during ground-handling tip-overs",
            "Tank mount fatigue under 30-day vibration environment",
            "Access-panel seal failure at altitude (condensation in avionics bay)",
        ],
        unknowns: [
            "Whether to move to a CFRP–aluminium hybrid centre frame to simplify the tank attachment.",
        ],
        unitCostGbp: 14_800,
        confidence: "high",
        costAssumptions: [
            "Monolithic lay-up at 6 h autoclave",
            "Ring-frames machined from Al-2024 billet",
            "Tank interface plate via 5-axis mill, £450 per unit",
        ],
        costReasoning: "Well understood. Quote from Astra already has 50-unit price locked.",
    },
    {
        id: "tail_assembly",
        name: "Tail assembly (V-tail)",
        purpose: "Provide pitch and yaw authority with minimum wetted area for a HAPS endurance envelope.",
        description:
            "V-tail configuration at 34° dihedral driving two ruddervators. Built from foam-core skinned with ±45° CFRP — light, cheap, and easy to field-replace if damaged during ground handling. Tail boom is a CFRP tube fished into the fuselage ring-frame 7.",
        whyItMatters:
            "V-tail saves about 1.1 kg over a conventional empennage — that's another 34 minutes of endurance at FL650.",
        keyParts: [
            "Ruddervator × 2",
            "V-tail fin spar × 2",
            "Foam-core skin panel set × 4",
            "Ruddervator hinge set × 2",
            "Tail boom (CFRP tube, 2.8 m)",
            "Tail boom ring-7 attachment",
            "Tie-down tail fitting",
            "Nav-light housing",
        ],
        inputs: ["Autopilot servo command", "Aero loads"],
        outputs: ["Pitch / yaw control authority", "Static directional stability"],
        estimatedMassKg: 2.1,
        budgetMassKg: 1.9,
        leadWeeks: 10,
        leadTimeSource: "historical-analogue",
        failureModes: [
            "Ruddervator hinge wear after 120 h flutter testing",
            "Servo backlash in sub-freezing soak",
        ],
        unknowns: [
            "Whether the ruddervator actuation can share a servo family with the ailerons (BOM simplification).",
        ],
        unitCostGbp: 4_250,
        confidence: "high",
        costAssumptions: ["Foam-core construction, minimal tooling", "Shared servo family with ailerons"],
        costReasoning: "Low-risk, low-cost. Confidence high — we built a similar tail on the Mirror Verify project.",
    },
    {
        id: "solar_array",
        name: "Solar array (42 m² flexible film)",
        purpose: "Sole daytime energy source — generates enough charge to cover both nocturnal and daily flight needs.",
        description:
            "42 m² of 26%-efficient flexible IBC cells bonded to the upper wing skin in 9 strings. Peak power 11.4 kW at AM1.5, ~8.9 kW at FL650 noon equator, dropping below 2 kW at 55° N in late winter. Array voltage 96 V nominal, delivered to the MPPT via the wing cable tray.",
        whyItMatters:
            "Endurance math is brutal: miss the daily energy budget by 4% and you're deadsticking inside a week.",
        keyParts: [
            "IBC cell string × 9",
            "Interconnect bus × 9",
            "Encapsulation film (upper)",
            "Encapsulation film (lower)",
            "Bypass-diode module × 9",
            "Array junction box (port)",
            "Array junction box (starboard)",
            "MC-4 field-joint connector set",
            "Array thermal sensor harness",
        ],
        inputs: ["Solar irradiance", "Wing skin bond surface"],
        outputs: ["DC power to MPPT"],
        estimatedMassKg: 4.7,
        budgetMassKg: 5.0,
        leadWeeks: 16,
        leadTimeSource: "supplier-quote",
        failureModes: [
            "Cell delamination under thermal cycling (−65 °C to +55 °C)",
            "Hot-spot formation when a bypass diode fails open",
            "Encapsulation film UV yellowing — irradiance loss ≥ 6% by month 12",
        ],
        unknowns: [
            "Whether to ship cells pre-laminated from Maxeon vs bonded at our own field-joint station.",
        ],
        unitCostGbp: 24_100,
        confidence: "medium",
        costAssumptions: [
            "IBC cells at £0.48/W (Maxeon small-batch quote)",
            "Encapsulation film supplied by DuPont",
            "Field-bond labour 6 h/unit",
        ],
        costReasoning:
            "Price per watt is the dominant uncertainty. A 10% drop in cell price (quite likely mid-2026) would save us £1 900/unit.",
    },
    {
        id: "battery_buffer",
        name: "Battery buffer (night cycle)",
        purpose: "Stores daytime solar to power nocturnal flight and avionics.",
        description:
            "Li-ion battery sized for 14 h of nocturnal cruise at 420 W nominal with a 30% reserve. Pack voltage 96 V, capacity 72 Ah (6.9 kWh). Pack is in the fuselage avionics bay on vibration isolators; built from 21700 cells (Samsung 50GB) in a 24S20P configuration with redundant BMS.",
        whyItMatters:
            "If the BMS drops a cell string the aircraft can't make it through the first night. The redundant BMS design is the only thing preventing a single-point-failure kill chain.",
        keyParts: [
            "21700 Li-ion cell × 480 (24S20P)",
            "Cell holder set",
            "Copper bus-bar set",
            "Primary BMS",
            "Backup BMS",
            "Pack enclosure (CFRP)",
            "Cell-level fuse set × 20",
            "Contactor + pre-charge",
            "Thermal pad set",
            "Pack vent valve",
        ],
        inputs: ["DC from MPPT", "Pack thermistor chain"],
        outputs: ["DC to avionics + motor bus", "BMS CAN telemetry"],
        estimatedMassKg: 7.8,
        budgetMassKg: 7.6,
        leadWeeks: 11,
        leadTimeSource: "supplier-quote",
        failureModes: [
            "Single-cell runaway during sub-freezing charge",
            "BMS false-positive on cell imbalance above 12 000 m",
            "Contactor welding under sudden short-circuit",
        ],
        unknowns: [
            "Cell supply — Samsung have a 14-week queue. Do we dual-source with Molicel?",
        ],
        unitCostGbp: 11_600,
        confidence: "high",
        costAssumptions: [
            "Samsung 50GB at £4.80/cell (50-unit bulk)",
            "BMS £1 800/unit including the redundant board",
        ],
        costReasoning: "Well-scoped. Confidence high — we have a quote from Samsung valid 90 days.",
    },
    {
        id: "mppt_power_electronics",
        name: "MPPT + power electronics",
        purpose: "Track solar array's max power point, regulate bus, and distribute power to avionics + motors.",
        description:
            "9-channel MPPT (one per array string) feeding a 96 V bus. Buck-boost converter steps down to 28 V for avionics and 12 V for nav / comms. All MPPT switching is synchronised to minimise EMI that would couple into the satcom link.",
        whyItMatters:
            "A 2% drop in MPPT efficiency costs the same endurance as losing 1.2 m² of solar array. Switching losses are the single most tuneable lever on total energy capture.",
        keyParts: [
            "MPPT channel × 9",
            "Buck-boost converter (28 V rail)",
            "Buck converter (12 V rail)",
            "Bus capacitor bank",
            "Housing enclosure (aluminium)",
            "Output contactor",
            "Telemetry MCU board",
        ],
        inputs: ["96 V DC from solar array", "BMS CAN"],
        outputs: ["96 V pack bus", "28 V avionics bus", "12 V comms bus"],
        estimatedMassKg: 2.3,
        budgetMassKg: 2.4,
        leadWeeks: 9,
        leadTimeSource: "ai-estimate",
        failureModes: [
            "MOSFET failure under cold-soak switching at 300 kHz",
            "Bus-capacitor failure after 8 000 h duty at 80 °C",
        ],
        unknowns: ["Whether a SiC FET upgrade is worth the £420/unit extra at this volume."],
        unitCostGbp: 6_900,
        confidence: "medium",
        costAssumptions: [
            "Custom MPPT board £520/channel",
            "Shared buck housing tooling amortised",
        ],
        costReasoning:
            "Confidence medium because we haven't locked the SiC vs Si FET decision. SiC adds £420 but saves 0.1 kg.",
    },
    {
        id: "avionics_flight_control",
        name: "Avionics & flight control",
        purpose: "Sense, plan, and command the airframe autonomously for a 30-day unmanned mission.",
        description:
            "Triplex flight-control computer with voting, integrated IMU + GPS/GNSS + ADS-B + AOA probe. Runs Cube Orange+ autopilot on redundant ArduPilot builds. Ground-handling and emergency-recovery modes are flight-critical items certified against AS9100 Class A.",
        whyItMatters:
            "If the flight-control computer can't vote its way through a single-fault event, the entire 30-day mission ends with a hull loss on day one.",
        keyParts: [
            "Triplex flight-control computer",
            "IMU × 3",
            "GPS / GNSS receiver × 2",
            "ADS-B in/out transceiver",
            "AOA probe set",
            "Air-data computer",
            "Servo harness",
            "Servo × 6 (ruddervator + aileron)",
            "Emergency recovery chute interface",
        ],
        inputs: ["Pilot-in-command commands via satcom", "Sensor fusion data"],
        outputs: ["Control-surface commands", "Health telemetry"],
        estimatedMassKg: 2.4,
        budgetMassKg: 2.5,
        leadWeeks: 13,
        leadTimeSource: "ai-estimate",
        failureModes: [
            "IMU gyro bias drift after 120 h of continuous flight",
            "ADS-B transceiver lockup during airspace hand-off",
            "Servo stall at sub-freezing sustained load",
        ],
        unknowns: [
            "Whether the Cube Orange+ baseline FW revision passes the EASA Part 21 subpart-G airworthiness gate without a custom patch.",
        ],
        unitCostGbp: 14_200,
        confidence: "medium",
        costAssumptions: [
            "Cube Orange+ £1 600/unit",
            "Servo pack £260/servo × 6",
            "Certification amortised across 50 units",
        ],
        costReasoning: "Main risk is EASA subpart-G — if we need a custom FW certification that's another £65k on the programme.",
    },
    {
        id: "comms_satlink",
        name: "Comms (Iridium Certus + mesh)",
        purpose: "Maintain continuous command + telemetry link with ground control anywhere on the mission footprint.",
        description:
            "Iridium Certus 700 primary satellite link + L-band LOS mesh to nearby HAPS + emergency 406 MHz beacon. Avionics bay antenna on the fuselage spine, redundant antenna on the belly, automatic fallover between the two when line-of-sight to a satellite is lost.",
        whyItMatters:
            "Losing comms for more than 4 hours triggers the automatic recovery chute. Iridium coverage over the North Sea is the riskiest segment of the mission envelope.",
        keyParts: [
            "Iridium Certus 700 modem",
            "Iridium patch antenna × 2",
            "L-band mesh radio",
            "L-band antenna",
            "406 MHz PLB",
            "Antenna switch unit",
            "Comms bay cabling harness",
        ],
        inputs: ["Avionics CAN bus", "Antenna RF path"],
        outputs: ["Satellite command+telemetry link", "Mesh to nearby HAPS"],
        estimatedMassKg: 1.47,
        budgetMassKg: 1.4,
        leadWeeks: 12,
        leadTimeSource: "supplier-quote",
        failureModes: [
            "Antenna icing at FL650 above 30% relative humidity",
            "Iridium Certus modem lock-up during polar hand-off (>70° N)",
        ],
        unknowns: [
            "Whether we can share the Certus modem across the comms / payload telemetry paths or need a second unit.",
        ],
        unitCostGbp: 15_200,
        confidence: "medium",
        costAssumptions: [
            "Iridium Certus 700 modem £7 800/unit",
            "Antenna pair £1 600/unit",
            "Iridium airtime contracted separately, not in hardware BOM",
        ],
        costReasoning: "Iridium hardware pricing is locked. Service contract is not in this BOM line.",
    },
]

const TOTAL_MASS_KG = MODULES.reduce((acc, m) => acc + m.estimatedMassKg, 0)
const TOTAL_PARTS = MODULES.reduce((acc, m) => acc + m.keyParts.length, 0)
const TOTAL_UNIT_COST_GBP = MODULES.reduce((acc, m) => acc + m.unitCostGbp, 0)

// ─── Activity timeline ───────────────────────────────────────────────
// Seven entries tailed against the real START_DATE so the workspace page's
// recent-activity card shows a populated list. All attributed to the test
// user (the only member in the test foundry today) — the mockup's
// Chase/Max/Fang/Jian names would need additional specialist actor
// records which we deliberately don't fake.

interface SeedAuditEvent {
    action: string
    entityType: string
    note: string
    daysAgo: number
    hour: number
}

const ACTIVITY_EVENTS: SeedAuditEvent[] = [
    {
        action: "research_completed",
        entityType: "cad_lab_project",
        note: "Subject research complete — 9 modules proposed, 42 m² solar array confirmed against 30-day endurance math.",
        daysAgo: 7,
        hour: 10,
    },
    {
        action: "decomposition_generated",
        entityType: "cad_lab_project",
        note: "Decomposed into 9 modules with 93 parts — mass budget 68.17 kg (0.17 kg over MTOW).",
        daysAgo: 6,
        hour: 14,
    },
    {
        action: "brief_updated",
        entityType: "cad_lab_project",
        note: "Confirmed AS9100 Class A + EASA Part 21 subpart-G as the regulatory envelope.",
        daysAgo: 5,
        hour: 9,
    },
    {
        action: "module_updated",
        entityType: "cad_lab_module",
        note: "Wing structure — chose field-assembly joints at ±7 m and ±12.5 m to fit shipping crates.",
        daysAgo: 4,
        hour: 11,
    },
    {
        action: "cost_estimate_generated",
        entityType: "cad_lab_project",
        note: "Rolled up first cost estimate — £172 250/unit against £150 000 ceiling.",
        daysAgo: 3,
        hour: 15,
    },
    {
        action: "risk_flagged",
        entityType: "cad_lab_project",
        note: "Astra AS9100 certificate expired 2026-03-14 — blocks wing-spar supply chain until renewed.",
        daysAgo: 2,
        hour: 10,
    },
    {
        action: "supplier_outreach",
        entityType: "cad_lab_project",
        note: "Requested updated quote from Intelligent Energy for fuel-cell stack with 100-unit commitment.",
        daysAgo: 1,
        hour: 13,
    },
]

// ─── Helpers ──────────────────────────────────────────────────────────

function daysAgoTs(days: number, hour: number): string {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - days)
    d.setUTCHours(hour, 0, 0, 0)
    return d.toISOString()
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n▶ Seeding HAPS UAV project into foundry ${FOUNDRY_ID} …\n`)

    // 1. Resolve the test user id
    const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("id, foundry_id, email")
        .eq("email", TEST_USER_EMAIL)
        .maybeSingle()
    if (profileErr || !profile) {
        console.error("Cannot find test user:", TEST_USER_EMAIL, profileErr?.message)
        process.exit(1)
    }
    if (profile.foundry_id !== FOUNDRY_ID) {
        console.error(`Profile foundry_id mismatch: expected ${FOUNDRY_ID}, got ${profile.foundry_id}`)
        process.exit(1)
    }
    const userId = profile.id as string
    console.log(`  ✓ Test user resolved: ${userId}`)

    // 2. Build the project row
    const modulesJson = MODULES.map((m) => ({
        id: m.id,
        name: m.name,
        purpose: m.purpose,
        description: m.description,
        whyItMatters: m.whyItMatters,
        keyParts: m.keyParts,
        inputs: m.inputs,
        outputs: m.outputs,
        estimatedMassKg: m.estimatedMassKg,
        budgetMassKg: m.budgetMassKg,
        leadWeeks: m.leadWeeks,
        leadTimeSource: m.leadTimeSource,
        failureModes: m.failureModes,
        unknowns: m.unknowns,
        status: "researched" as const,
    }))

    const aiCostEstimatesJson: Record<
        string,
        {
            moduleId: string
            totalPerUnit: number
            confidence: "low" | "medium" | "high"
            assumptions: string[]
            reasoning: string
        }
    > = {}
    for (const m of MODULES) {
        aiCostEstimatesJson[m.id] = {
            moduleId: m.id,
            totalPerUnit: m.unitCostGbp,
            confidence: m.confidence,
            assumptions: m.costAssumptions,
            reasoning: m.costReasoning,
        }
    }

    const designBrief = {
        useCase:
            "Persistent stratospheric platform for telco backhaul, wildfire / flood early warning, and defence ISR. 30-day endurance at FL650.",
        targetProcess: "Composite lay-up (autoclave + RTM) + machined metallics",
        targetMaterial: "CFRP (T700/T800 prepreg), Al-2024, Ti-6Al-4V joints",
        toleranceTarget: "±0.2 mm on structural interfaces, ±0.05 mm on control-surface hinges",
        quantityTarget: "50",
        complianceNotes:
            "AS9100 Class A structural quality; EASA Part 21 subpart-G airworthiness; UK CAA experimental category; ITAR-free propulsion supply chain (UK + EU sources only).",
        // V2 Brief-page fields (added 2026-04-20 migration cad_lab_brief_lock)
        mission:
            "Deliver persistent stratospheric presence (30-day continuous endurance at FL650) for hardware teams that need a reusable, regulatory-friendly alternative to LEO smallsats and conventional UAVs.",
        targetCustomers:
            "UK & EU telco operators (BT, Vodafone, Deutsche Telekom backhaul teams) solving rural coverage; civil-defence + environment agencies running wildfire / flood early-warning; MoD / NATO ISR tier-2 customers after an EASA-certifiable, ITAR-free platform.",
        whyNow:
            "Solar cell efficiency crossed 26% in 2025, bringing the daytime energy budget into reach at 42 m². EASA opened a dedicated HAPS subpart-G airworthiness path in Feb 2026. UK spectrum for HAPS backhaul is now allocated. First 36-month window before Airbus Zephyr Next and BAE PHASA-36 saturate the regulated European airspace.",
        constraints: {
            unitCostCeilingGbp: 150_000,
            firstShipDate: "2026-11-01",
            maxMassKg: 68,
            batchSize: 50,
            markets: ["UK", "EU"],
            productionRegion: "UK + EU (ITAR-free supply chain)",
        },
        regulatory: [
            {
                code: "AS9100D",
                name: "Aerospace QMS — Class A",
                summary: "Required on primary structure suppliers",
                status: "in-progress" as const,
            },
            {
                code: "EASA Part 21",
                name: "Subpart-G airworthiness",
                summary: "HAPS path · Cube Orange+ FW is critical path",
                status: "in-progress" as const,
            },
            {
                code: "UK CAA",
                name: "Experimental permit",
                summary: "12 test flights · North Sea corridor",
                status: "in-progress" as const,
            },
            {
                code: "ISO 9001",
                name: "Supplier QMS",
                summary: "Baseline supplier requirement",
                status: "met" as const,
            },
            {
                code: "RTCA DO-160",
                name: "Environmental",
                summary: "FL650 avionics + battery qualification",
                status: "not-started" as const,
            },
            {
                code: "ITAR / EAR99",
                name: "Export control",
                summary: "ITAR-free · UK+EU propulsion sources only",
                status: "met" as const,
            },
        ],
    }

    const research = {
        report:
            "Stratosphere HAPS-S1 is a 25 m-span, solar-powered high-altitude pseudo-satellite designed for 30-day endurance at FL650 (65 000 ft). The aircraft carries 42 m² of 26%-efficient flexible solar array on the upper wing skin, backed by a 6.9 kWh lithium buffer for nocturnal flight. Propulsion is dual PEM fuel-cell / electric with variable-pitch props, sized for a 180 km glide on single-pod failure. Payload capacity is 24 kg across a 0.4 m³ bay. Target mission sets: telco backhaul over the North Sea, wildfire early warning over southern Europe, and defence ISR at 55–65° N.",
        designBrief,
        sources: [
            { uri: "https://www.easa.europa.eu/en/document-library/regulations/part-21", title: "EASA Part 21 — Aircraft / Parts Certification" },
            { uri: "https://as9100store.com/", title: "AS9100 — Aerospace Quality Management" },
            { uri: "https://www.caa.co.uk/", title: "UK CAA — Experimental Category" },
        ],
        referenceModels: [],
        researchTime: 94.2,
    }

    const now = new Date().toISOString()
    // Brief locked 4 days ago against revision A — gives the lock banner
    // something to point at and exercises the brief_locked_at / brief_locked_by
    // columns added by migration 20260420100000.
    const briefLockedAt = (() => {
        const d = new Date()
        d.setUTCDate(d.getUTCDate() - 4)
        d.setUTCHours(11, 30, 0, 0)
        return d.toISOString()
    })()

    const projectRow = {
        id: PROJECT_ID,
        foundry_id: FOUNDRY_ID,
        created_by: userId,
        name: "Stratosphere HAPS-S1",
        subject:
            "Solar-powered high-altitude pseudo-satellite with 30-day endurance at FL650. 25 m wingspan, 42 m² solar array, dual fuel-cell propulsion, 24 kg payload bay. Target batch 50 for UK + EU operators. AS9100 Class A, EASA Part 21 subpart-G.",
        model_id: "claude-opus-4-7",
        research,
        modules: modulesJson,
        ai_cost_estimates: aiCostEstimatesJson,
        product_overview:
            "Stratosphere HAPS-S1 — 25 m wingspan, 42 m² solar array, 30-day endurance at FL650. Target unit cost £150 000 at batch 50. Primary markets: UK + EU telco backhaul and ISR.",
        system_illustration_url: "/seed/haps-s1-concept.svg",
        concept_render_url: "/seed/haps-s1-render.svg",
        stage: "analysis" as const,
        status: "generated" as const,
        design_revision: 1,
        brief_locked_at: briefLockedAt,
        brief_locked_by: userId,
        created_at: START_DATE.toISOString(),
        updated_at: now,
    }

    // 3. Upsert the project row
    const { error: upsertErr } = await supabase
        .from("cad_lab_projects")
        .upsert(projectRow, { onConflict: "id" })

    if (upsertErr) {
        console.error("  ✗ Project upsert failed:", upsertErr.message)
        process.exit(1)
    }
    console.log(`  ✓ Project upserted: ${PROJECT_ID}`)
    console.log(
        `    • ${MODULES.length} modules, ${TOTAL_PARTS} parts, ${TOTAL_MASS_KG.toFixed(2)} kg, £${TOTAL_UNIT_COST_GBP.toLocaleString("en-GB")}/unit`,
    )

    // 4. Refresh the audit-log timeline
    //    Delete prior seed-flagged events for this project so reruns don't duplicate.
    const { error: delErr } = await supabase
        .from("audit_log")
        .delete()
        .eq("entity_id", PROJECT_ID)
        .eq("metadata->>seeded", "haps-s1")
    if (delErr) {
        console.warn("  ! Could not prune prior audit_log rows (may be first run):", delErr.message)
    }

    const auditRows = ACTIVITY_EVENTS.map((ev) => ({
        foundry_id: FOUNDRY_ID,
        user_id: userId,
        action: ev.action,
        entity_type: ev.entityType,
        entity_id: PROJECT_ID,
        metadata: { note: ev.note, seeded: "haps-s1" },
        created_at: daysAgoTs(ev.daysAgo, ev.hour),
    }))

    const { error: auditErr } = await supabase.from("audit_log").insert(auditRows)
    if (auditErr) {
        console.error("  ✗ Audit-log insert failed:", auditErr.message)
        process.exit(1)
    }
    console.log(`  ✓ Activity timeline: ${auditRows.length} events`)

    // 5. Brief revision history — wipe prior seed-flagged rows, reinsert the
    //    mockup's four-row timeline. rev 1 (locked) is the current row.
    const { error: revDelErr } = await supabase
        .from("brief_revisions")
        .delete()
        .eq("project_id", PROJECT_ID)
    if (revDelErr) {
        console.warn("  ! Could not prune brief_revisions rows (may be first run):", revDelErr.message)
    }

    const revisionRows = [
        {
            project_id: PROJECT_ID,
            foundry_id: FOUNDRY_ID,
            revision_number: 1,
            revision_label: "Revision A (current · locked)",
            summary: "locked by Max after specialist review · 14 supplier RFQs cite this rev",
            locked_at: briefLockedAt,
            locked_by: userId,
            created_at: daysAgoTs(4, 11),
        },
        {
            project_id: PROJECT_ID,
            foundry_id: FOUNDRY_ID,
            revision_number: 2,
            revision_label: "Draft 0.3 → Revision A",
            summary: "added EASA Part 21 DOA target · removed global mission scope to UK+EU only",
            locked_at: null,
            locked_by: null,
            created_at: daysAgoTs(8, 14),
        },
        {
            project_id: PROJECT_ID,
            foundry_id: FOUNDRY_ID,
            revision_number: 3,
            revision_label: "Draft 0.2",
            summary: "raised unit-cost ceiling to £150k after first BOM roll-up · Fang",
            locked_at: null,
            locked_by: null,
            created_at: daysAgoTs(14, 10),
        },
        {
            project_id: PROJECT_ID,
            foundry_id: FOUNDRY_ID,
            revision_number: 4,
            revision_label: "Draft 0.1",
            summary: "initial concept · 30-day endurance target · HAPS envelope set",
            locked_at: null,
            locked_by: null,
            created_at: daysAgoTs(21, 9),
        },
    ]

    const { error: revInsErr } = await supabase.from("brief_revisions").insert(revisionRows)
    if (revInsErr) {
        console.error("  ✗ brief_revisions insert failed:", revInsErr.message)
        process.exit(1)
    }
    console.log(`  ✓ Brief revisions: ${revisionRows.length} rows`)

    // 5. Summary
    console.log("\n✅ HAPS UAV seed complete.\n")
    console.log(`   Open:  /the-forge-v2/projects/${PROJECT_ID}`)
    console.log(`   Brief: /the-forge-v2/projects/${PROJECT_ID}/brief`)
    console.log()
}

main().catch((err) => {
    console.error("Unhandled seed error:", err)
    process.exit(1)
})
