/**
 * @file oracle-benchmarks.ts — UK product-class cost anchors.
 *
 * @description Council-verified cost benchmarks (low/median/high) for
 * common engineering modules across product classes. Tristan's idea
 * (2026-04-26 NIGHT): "if 4 frontier LLMs agree something should cost
 * £100k and the engine says £800k, that warrants a deep investigation".
 *
 * Source: Loop 7 council critique with GPT-5.5 + Gemini 3.1 Pro +
 * DeepSeek V4-Pro firing predictions in parallel against 3 reference
 * projects (BESS, Hedgerow, Vert Farm). Each model returned tight
 * low/median/high bands grounded in their training-data knowledge of
 * UK market economics.
 *
 * Use: injected into the BOM expansion prompt's briefContext to give
 * Sonnet a hard reality anchor when costing a part. Replaces the
 * previous flat "use realistic UK market norms" instruction with
 * specific reference numbers per product class.
 *
 * Effect: engine costing decisions are now bounded by council priors.
 * Without this, Hedgerow Loop 5 came in at £491 (council median £108);
 * Vert Farm Loop 4 came in at £49k (council median £106k). The
 * engine had no internalised product-class economics.
 *
 * Updates: rerun the council quarterly on a fresh year of UK market
 * data; the file is small enough to hand-edit when the model drift
 * picks up new pricing trends.
 */

export interface OracleBenchmark {
    /** Product class — UK BESS, UK consumer-IoT, UK agritech-vertical-farm, etc. */
    productClass: string
    /** Module-class identifier — usually a generic name like "Body shell, consumer outdoor product" */
    moduleClass: string
    /** GBP low / median / high. */
    low: number
    median: number
    high: number
    /** Volume context — single-unit / 5,000 units/yr / fleet / etc. */
    volumeContext: string
    /** One-line reasoning so the prompt can quote it. */
    reasoning: string
}

/** UK premium consumer-IoT outdoor product (£200-500 retail), 5,000 units/yr volume.
 *  Source: Loop 7 council 2026-04-26 NIGHT — GPT-5.5 cost predictions. */
const UK_CONSUMER_IOT_OUTDOOR: OracleBenchmark[] = [
    {
        productClass: "uk-consumer-iot-outdoor",
        moduleClass: "Body shell — powder-coated steel structural enclosure",
        low: 9,
        median: 14,
        high: 24,
        volumeContext: "5,000 units/yr",
        reasoning:
            "Small-batch powder-coated steel enclosure with bends, inserts and mounting features is materially cheap but labour, coating and rejects dominate at 5k/yr.",
    },
    {
        productClass: "uk-consumer-iot-outdoor",
        moduleClass: "Camera & optics — 12MP MIPI sensor + plastic optics + IR cut filter",
        low: 7,
        median: 10.5,
        high: 18,
        volumeContext: "5,000 units/yr",
        reasoning:
            "12MP mobile/IoT MIPI sensor, plastic lens stack, FPC and IR-cut parts are commodity, with range driven by sensor grade and low-light optics.",
    },
    {
        productClass: "uk-consumer-iot-outdoor",
        moduleClass:
            "Compute assembly — 5 TOPS NPU SoC (Rockchip RV1126 / Hailo-8L) + RAM + storage + PCB",
        low: 22,
        median: 32,
        high: 58,
        volumeContext: "5,000 units/yr",
        reasoning:
            "Integrated vision SoC designs land near low end; discrete Hailo-class accelerator + host + RAM + eMMC + PMICs + PCB push high end.",
    },
    {
        productClass: "uk-consumer-iot-outdoor",
        moduleClass: "Solar+LFP power module — 5-10W panel + 12.8V LFP cell pack + BMS + MPPT",
        low: 18,
        median: 28,
        high: 45,
        volumeContext: "5,000 units/yr",
        reasoning:
            "Small 5-10W panel + 4S LFP pack + BMS + MPPT/charger + cabling + weatherproof connectors is one of the largest landed BOM blocks.",
    },
    {
        productClass: "uk-consumer-iot-outdoor",
        moduleClass: "Wireless connectivity — Wi-Fi/BLE module only (ESP32 / Realtek-class)",
        low: 3,
        median: 5,
        high: 8,
        volumeContext: "5,000 units/yr",
        reasoning:
            "ESP32/Realtek-style certified Wi-Fi/BLE modules commonly land around £4-6 at this volume. NEVER specify a £60+ industrial LTE module on a consumer-product brief that says Wi-Fi/BLE.",
    },
    {
        productClass: "uk-consumer-iot-outdoor",
        moduleClass: "Sensor cluster — MEMS mic + 6-axis IMU + temp/light/weather",
        low: 3,
        median: 5.5,
        high: 11,
        volumeContext: "5,000 units/yr",
        reasoning:
            "MEMS mic, 6-axis IMU, ambient light, temperature/humidity/pressure sensors are low-cost; weather sealing and quality widen the range.",
    },
    {
        productClass: "uk-consumer-iot-outdoor",
        moduleClass: "Perch + 1kg load cell — mechanical assembly + simple amplifier PCB",
        low: 3,
        median: 5.5,
        high: 10,
        volumeContext: "5,000 units/yr",
        reasoning:
            "Commodity 1kg load cell + amplifier PCB + perch mechanics inexpensive; calibration, corrosion-resistant hardware and sealing add cost.",
    },
    {
        productClass: "uk-consumer-iot-outdoor",
        moduleClass: "Modular reservoir — HDPE injection-moulded + perch hardware",
        low: 4.5,
        median: 8,
        high: 15,
        volumeContext: "5,000 units/yr",
        reasoning:
            "HDPE/PP moulded reservoir unit cost modest; modular geometry, translucent material, clips, seals, low-volume tooling amortisation can raise landed cost.",
    },
    {
        productClass: "uk-consumer-iot-outdoor",
        moduleClass: "TOTAL landed BOM (excludes assembly+packaging+30% gross margin headroom)",
        low: 55,
        median: 80,
        high: 150,
        volumeContext: "5,000 units/yr",
        reasoning:
            "GPT-5.5 (US OpenAI) predicted £69-189 median £108. Qwen3.6-Plus (China Alibaba) corrected to £40-105 median £62 — argues GPT band conflated raw BOM with channel margin / NRE amortisation. Reconciled band £55-150 median £80 takes the Asian-lineage correction seriously while staying conservative — a £220 retail product with 30%+ margin to channel + £40-60 of assembly+packaging+QA implies landed BOM <£100 is the design target.",
    },
]

/** UK 40ft containerised LFP BESS (3.5 MWh / 1.5 MW grid-forming).
 *  Source: Loop 7 council 2026-04-26 NIGHT — GPT-5.5 prediction. */
const UK_BESS_3MWH: OracleBenchmark[] = [
    {
        productClass: "uk-bess-containerised",
        moduleClass: "ISO Container Enclosure (40ft High Cube, modified, fire-rated)",
        low: 60_000,
        median: 100_000,
        high: 170_000,
        volumeContext: "single unit",
        reasoning:
            "Modified 40ft HC container with fire lining, blast relief and structural anchoring is typically £60k-170k fabricated UK/EU enclosure item.",
    },
    {
        productClass: "uk-bess-containerised",
        moduleClass: "Lithium Iron Phosphate Battery Rack Assembly (~3.5 MWh, 2 racks)",
        low: 230_000,
        median: 320_000,
        high: 470_000,
        volumeContext: "single unit",
        reasoning:
            "Contracted 2025-26 LFP rack pricing for 3.5 MWh lands £65-135/kWh depending on cell source, integration depth and warranty.",
    },
    {
        productClass: "uk-bess-containerised",
        moduleClass: "Battery Management System (master + slave, SIL 2 candidate)",
        low: 30_000,
        median: 55_000,
        high: 95_000,
        volumeContext: "single unit",
        reasoning:
            "Two-rack master/slave BMS with safety-rated design evidence and integration support is typically tens of thousands rather than commodity BMS pricing.",
    },
    {
        productClass: "uk-bess-containerised",
        moduleClass: "Bi-Directional Power Conversion System (1.5 MW, grid-forming, G99)",
        low: 130_000,
        median: 210_000,
        high: 340_000,
        volumeContext: "single unit",
        reasoning:
            "Grid-forming PCS hardware with UK G99 type-test support commonly prices £85-225/kW at this size and compliance level.",
    },
    {
        productClass: "uk-bess-containerised",
        moduleClass: "Liquid Cooling Thermal Management Skid",
        low: 45_000,
        median: 80_000,
        high: 145_000,
        volumeContext: "single unit",
        reasoning:
            "Container-scale chiller, glycol circuit, pumps, manifolds and controls for 3.5 MWh LFP usually sits in the £45k-145k range.",
    },
    {
        productClass: "uk-bess-containerised",
        moduleClass: "Fire Detection and Suppression (Novec/water-mist hybrid, NFPA 2001)",
        low: 40_000,
        median: 75_000,
        high: 140_000,
        volumeContext: "single unit",
        reasoning:
            "Aspirating detection, gas detection, Novec or equivalent agent hardware and water-mist hybridisation materially exceed basic container fire systems.",
    },
    {
        productClass: "uk-bess-containerised",
        moduleClass: "Auxiliary Electrical and Control Cabinet (UPS+PLC+SCADA)",
        low: 40_000,
        median: 75_000,
        high: 130_000,
        volumeContext: "single unit",
        reasoning:
            "UPS, LV distribution, PLC, metering, networking and SCADA integration for grid-scale container typically £40k-130k.",
    },
    {
        productClass: "uk-bess-containerised",
        moduleClass: "Site Integration / Commissioning (transport+SAT+G99 settings+DOC)",
        low: 90_000,
        median: 160_000,
        high: 300_000,
        volumeContext: "single unit",
        reasoning:
            "UK transport, cranage allowance, SAT, grid-code settings, protection checks, commissioning labour and documentation commonly add £90k-300k. CRITICAL: this is OFTEN excluded from BOM but ALWAYS present in real-world delivered cost.",
    },
    {
        productClass: "uk-bess-containerised",
        moduleClass: "TOTAL all-in (£/kWh)",
        low: 665_000,
        median: 1_075_000,
        high: 1_790_000,
        volumeContext: "single unit",
        reasoning:
            "Summed all-in range £190-510/kWh, consistent with small UK-delivered grid-forming, NFCC-aligned containerised BESS. A £180k brief ceiling is ~6x below typical UK market reality for this spec — flag immediately.",
    },
]

/** UK 40ft containerised vertical farm (6,000 slots, 4t/yr leafy greens).
 *  Source: Loop 7 council 2026-04-26 NIGHT — V4-Pro prediction. */
const UK_VERTICAL_FARM_CONTAINER: OracleBenchmark[] = [
    {
        productClass: "uk-vertical-farm-container",
        moduleClass: "Insulated Container Shell (40ft HC, vapour barrier, fire-rated)",
        low: 22_000,
        median: 32_000,
        high: 45_000,
        volumeContext: "single unit",
        reasoning:
            "One-trip HC container ~£5k, spray-foam insulation, lining, fire-rated boards, anchors add £15-30k; UK conversion labour intensive.",
    },
    {
        productClass: "uk-vertical-farm-container",
        moduleClass: "Multi-Tier Hydroponic Racking (NFT or DWC, 4 tiers)",
        low: 10_000,
        median: 15_000,
        high: 25_000,
        volumeContext: "single unit",
        reasoning:
            "4 tiers with NFT gutters, supports, drainage for ~100m² effective canopy; prices from vertical farming suppliers.",
    },
    {
        productClass: "uk-vertical-farm-container",
        moduleClass: "LED Grow-Light Array (200 m² canopy, DLI programmable)",
        low: 10_000,
        median: 15_000,
        high: 22_000,
        volumeContext: "single unit",
        reasoning:
            "10 kW actual load based on 250 kWh/day ceiling and DLI ~17 mol/m²/day; £1.50/W installed covers high-efficiency fixtures, drivers, mounting.",
    },
    {
        productClass: "uk-vertical-farm-container",
        moduleClass: "Climate Control Unit (100kW heat rejection + dehumid)",
        low: 12_000,
        median: 20_000,
        high: 35_000,
        volumeContext: "single unit",
        reasoning:
            "Package roof-top or split AC with 100kW nominal cooling and latent dehumidification; commercial units £15-30k installed in UK.",
    },
    {
        productClass: "uk-vertical-farm-container",
        moduleClass: "Recirculating Nutrient Delivery (2,000L+pump+pH/EC dosing+UV-C)",
        low: 3_000,
        median: 5_000,
        high: 8_000,
        volumeContext: "single unit",
        reasoning:
            "Tank, magnetic-drive pump, peristaltic dosing, inline UV-C, piping, sensors; modular systems £3-8k for small farms.",
    },
    {
        productClass: "uk-vertical-farm-container",
        moduleClass: "CO2 Dosing System",
        low: 1_500,
        median: 3_000,
        high: 5_000,
        volumeContext: "single unit",
        reasoning:
            "2-4 cylinders, manifold, optical ppm sensor, safety chain; off-the-shelf costs well known.",
    },
    {
        productClass: "uk-vertical-farm-container",
        moduleClass: "3-Phase Electrical Distribution (32-63A, RCD+MCB)",
        low: 2_500,
        median: 4_000,
        high: 7_000,
        volumeContext: "single unit",
        reasoning:
            "Consumer unit, armoured cable, 3-phase RCD, MCBs, sub-boards; industrial spark <£5k unless groundworks needed.",
    },
    {
        productClass: "uk-vertical-farm-container",
        moduleClass: "Farm Control + Sensor Mesh (PLC+IoT gateway+30+ wireless sensors)",
        low: 8_000,
        median: 12_000,
        high: 20_000,
        volumeContext: "single unit",
        reasoning:
            "PLC ~£2k, industrial wireless sensors £100-300 each, commissioning, cloud dashboard integration; cost varies sharply with customisation.",
    },
    {
        productClass: "uk-vertical-farm-container",
        moduleClass: "TOTAL installed cost",
        low: 69_000,
        median: 106_000,
        high: 157_000,
        volumeContext: "single unit",
        reasoning:
            "Aligned with £80-120k observed container farm offers. Engine estimates well below £100k are likely missing labour/integration.",
    },
]

/** UK 40ft containerised seawater reverse-osmosis desalination, 500 m³/day,
 *  3.5 kWh/m³ specific energy. Source: Loop 8 council priors. */
const UK_DESAL_CONTAINER: OracleBenchmark[] = [
    {
        productClass: "uk-desal-containerised",
        moduleClass: "Container + Skid Structure (40ft, modified, FRP-lined)",
        low: 30_000,
        median: 45_000,
        high: 70_000,
        volumeContext: "single unit",
        reasoning:
            "Modified 40ft container with corrosion-resistant FRP/SS lining for seawater service, foundation skid, anchor points; standard mod scope.",
    },
    {
        productClass: "uk-desal-containerised",
        moduleClass: "Pre-treatment (multi-media filter + cartridge + dosing)",
        low: 15_000,
        median: 25_000,
        high: 40_000,
        volumeContext: "single unit",
        reasoning:
            "MMF tank, 1µm cartridge filters, antiscalant + chlorine + sulphuric acid dosing skid for 500 m³/day SWRO feed.",
    },
    {
        productClass: "uk-desal-containerised",
        moduleClass: "High-Pressure Pump + Energy Recovery Device (PX or DWEER)",
        low: 60_000,
        median: 95_000,
        high: 150_000,
        volumeContext: "single unit",
        reasoning:
            "HP pump (~75 kW for 500 m³/day at 60-65 bar) + ERD (Energy Recovery Inc PX-Q260 or equivalent); ~50% of capex efficiency story.",
    },
    {
        productClass: "uk-desal-containerised",
        moduleClass: "First Pass SWRO Train (membrane vessels, racks, manifolds)",
        low: 35_000,
        median: 55_000,
        high: 90_000,
        volumeContext: "single unit",
        reasoning:
            "FilmTec / Hydranautics 8-inch SW elements, FRP pressure vessels, SS316 manifolds; ~60-80 elements for 500 m³/day @ 50% recovery.",
    },
    {
        productClass: "uk-desal-containerised",
        moduleClass: "Second Pass BWRO Train (boron polish or remineralisation feed)",
        low: 12_000,
        median: 20_000,
        high: 35_000,
        volumeContext: "single unit",
        reasoning:
            "Smaller BWRO stage typically £12-35k; sometimes elided where boron spec is relaxed.",
    },
    {
        productClass: "uk-desal-containerised",
        moduleClass: "Post-treatment (remineralisation, chlorination)",
        low: 8_000,
        median: 14_000,
        high: 22_000,
        volumeContext: "single unit",
        reasoning:
            "Calcite contactor, CO2 dosing, hypochlorite final dose, polishing filter; standard package.",
    },
    {
        productClass: "uk-desal-containerised",
        moduleClass: "Clean-In-Place (CIP) System",
        low: 6_000,
        median: 10_000,
        high: 16_000,
        volumeContext: "single unit",
        reasoning:
            "CIP tank + heater + dosing pumps for membrane cleaning every 1-3 months.",
    },
    {
        productClass: "uk-desal-containerised",
        moduleClass: "Motor Control Centre + 3-phase distribution (200-300A)",
        low: 15_000,
        median: 25_000,
        high: 40_000,
        volumeContext: "single unit",
        reasoning:
            "MCC for ~150kW connected load (HP pump + ancillaries), VFDs on HP pump and feed pump, soft-start contactors.",
    },
    {
        productClass: "uk-desal-containerised",
        moduleClass: "PLC + Instrumentation Cabinet (SCADA-ready)",
        low: 12_000,
        median: 20_000,
        high: 35_000,
        volumeContext: "single unit",
        reasoning:
            "Siemens/Allen-Bradley PLC + HMI + flow/pressure/conductivity instruments + ATI/ATP sensors + comms gateway.",
    },
    {
        productClass: "uk-desal-containerised",
        moduleClass: "TOTAL installed UK delivery + commissioning",
        low: 280_000,
        median: 410_000,
        high: 620_000,
        volumeContext: "single unit",
        reasoning:
            "Aligned with £80-130k per 100 m³/day for UK-delivered containerised SWRO; 500 m³/day plant £400-650k typical including transport+SAT+commissioning. £350k brief ceiling sits at the LOW end of the range — feasible but tight.",
    },
]

/** UK premium connected mobility aid (£300-500 retail), 5,000 units/yr.
 *  Source: Loop 8 council priors. */
const UK_CONNECTED_MOBILITY_AID: OracleBenchmark[] = [
    {
        productClass: "uk-connected-mobility-aid",
        moduleClass: "Hardwood handle assembly (machined+finished)",
        low: 12,
        median: 20,
        high: 35,
        volumeContext: "5,000 units/yr",
        reasoning:
            "Ash/walnut blank, CNC profiled, sanded, oiled or lacquered; small-batch UK woodturning shop; quality grading drives range.",
    },
    {
        productClass: "uk-connected-mobility-aid",
        moduleClass: "Carbon-fibre shaft + adjustment mechanism",
        low: 15,
        median: 25,
        high: 40,
        volumeContext: "5,000 units/yr",
        reasoning:
            "CF tube (rolled, ~25mm OD), telescoping clamp, locking pin; CF tube cost dominates.",
    },
    {
        productClass: "uk-connected-mobility-aid",
        moduleClass: "Rubber + tungsten-carbide ferrule",
        low: 4,
        median: 7,
        high: 12,
        volumeContext: "5,000 units/yr",
        reasoning:
            "WC tip insert, NBR rubber boot, machined alloy housing; commodity walking-aid component.",
    },
    {
        productClass: "uk-connected-mobility-aid",
        moduleClass: "Cellular IoT module — Nordic nRF9160 + LTE-M antenna + SIM",
        low: 18,
        median: 28,
        high: 45,
        volumeContext: "5,000 units/yr",
        reasoning:
            "nRF9160-based cellular module with eSIM is the dominant cost driver; £20-40 typical at this volume.",
    },
    {
        productClass: "uk-connected-mobility-aid",
        moduleClass: "9-axis IMU + grip cap-touch + pressure sensors",
        low: 4,
        median: 7,
        high: 12,
        volumeContext: "5,000 units/yr",
        reasoning:
            "BMI270/MPU-9250 IMU (~£3) + cap-touch IC + 1-2 small pressure sensors; commodity MEMS.",
    },
    {
        productClass: "uk-connected-mobility-aid",
        moduleClass: "Battery + inductive charging receiver",
        low: 10,
        median: 17,
        high: 28,
        volumeContext: "5,000 units/yr",
        reasoning:
            "Single 18650 LFP cell or pouch, BMS, Qi/PMA receiver coil + IC, current sensing; tightly packaged.",
    },
    {
        productClass: "uk-connected-mobility-aid",
        moduleClass: "Speaker + microphone + haptic motor",
        low: 4,
        median: 7,
        high: 11,
        volumeContext: "5,000 units/yr",
        reasoning:
            "Small mylar speaker + MEMS mic + LRA haptic; commodity audio/feedback components.",
    },
    {
        productClass: "uk-connected-mobility-aid",
        moduleClass: "PCB + SMT assembly + conformal coating",
        low: 8,
        median: 14,
        high: 25,
        volumeContext: "5,000 units/yr",
        reasoning:
            "4-6 layer PCB, SMT assembly + conformal coating for ingress protection; UK contract manufacturer pricing.",
    },
    {
        productClass: "uk-connected-mobility-aid",
        moduleClass: "Inductive charging stand (counterpart product)",
        low: 6,
        median: 10,
        high: 18,
        volumeContext: "5,000 units/yr",
        reasoning:
            "Cradle moulded ABS, Qi transmitter coil + IC, USB-C input, weighted base; secondary product.",
    },
    {
        productClass: "uk-connected-mobility-aid",
        moduleClass: "TOTAL landed BOM",
        low: 81,
        median: 135,
        high: 226,
        volumeContext: "5,000 units/yr",
        reasoning:
            "For a £325 retail product, a £130-150 landed BOM leaves room for 30-40% channel margin + £30-50 assembly+packaging+QA. £155 brief target sits within reach but only with tight cellular module sourcing.",
    },
]

/** Master registry — keyed by productClass slug. */
export const ORACLE_BENCHMARKS_BY_PRODUCT_CLASS: Record<string, OracleBenchmark[]> = {
    "uk-consumer-iot-outdoor": UK_CONSUMER_IOT_OUTDOOR,
    "uk-bess-containerised": UK_BESS_3MWH,
    "uk-vertical-farm-container": UK_VERTICAL_FARM_CONTAINER,
    "uk-desal-containerised": UK_DESAL_CONTAINER,
    "uk-connected-mobility-aid": UK_CONNECTED_MOBILITY_AID,
}

/** Heuristic match — given a brief subject string, pick the most likely
 *  product class. Returns null when nothing matches; the caller should
 *  skip Oracle hints rather than show wrong reference data. */
export function detectProductClass(briefSubject: string): string | null {
    const s = briefSubject.toLowerCase()
    if (
        /\b(bess|battery energy storage|grid.{0,5}forming|lfp|lithium iron phosphate|grid.{0,5}tied|behind.{0,10}meter)\b/.test(
            s,
        )
    ) {
        return "uk-bess-containerised"
    }
    if (
        /\b(vertical farm|hydroponic|leafy green|grow.{0,5}light|cea|controlled environment agriculture|nutrient.{0,10}recirculat)\b/.test(
            s,
        )
    ) {
        return "uk-vertical-farm-container"
    }
    if (
        /\b(garden|bird feeder|wildlife camera|outdoor.{0,10}iot|consumer.{0,10}outdoor|premium.{0,10}consumer.{0,10}hardware)\b/.test(
            s,
        )
    ) {
        return "uk-consumer-iot-outdoor"
    }
    if (
        /\b(desalination|reverse osmosis|swro|seawater.{0,15}reverse|membrane.{0,10}filt|potable water from seawater)\b/.test(
            s,
        )
    ) {
        return "uk-desal-containerised"
    }
    if (
        /\b(walking stick|walking aid|mobility aid|fall.{0,10}detect|gait.{0,10}analy|sentinel|nordic.{0,10}nrf9160|cellular.{0,10}walking|inductive.{0,10}charg.{0,15}stand)\b/.test(
            s,
        )
    ) {
        return "uk-connected-mobility-aid"
    }
    return null
}

/** Render an Oracle reference block for injection into a BOM expansion
 *  prompt. Returns "" if no benchmarks exist for the product class. */
export function renderOracleHint(briefSubject: string): string {
    const cls = detectProductClass(briefSubject)
    if (!cls) return ""
    const benchmarks = ORACLE_BENCHMARKS_BY_PRODUCT_CLASS[cls]
    if (!benchmarks || benchmarks.length === 0) return ""
    const lines = benchmarks.map(
        (b) =>
            `- ${b.moduleClass} → £${b.low.toLocaleString("en-GB")} / £${b.median.toLocaleString("en-GB")} / £${b.high.toLocaleString("en-GB")} (${b.volumeContext}). ${b.reasoning}`,
    )
    return `\n\nORACLE COST BENCHMARKS (Loop 7 council priors, ${cls}):
${lines.join("\n")}

When your line-item cost falls 1.5x outside the median for the matched class, your costJustification field MUST explicitly justify the deviation against this council reference. When it falls >3x outside, you have almost certainly picked the wrong product tier — downgrade to a commodity equivalent before continuing.`
}
