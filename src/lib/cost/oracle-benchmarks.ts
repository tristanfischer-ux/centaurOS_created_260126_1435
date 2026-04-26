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
        low: 69.5,
        median: 108.5,
        high: 189,
        volumeContext: "5,000 units/yr",
        reasoning:
            "Summed module landed BOM implies a feasible median for a £220 premium DTC-style product; high-end leaves little room for assembly+packaging+margin.",
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

/** Master registry — keyed by productClass slug. */
export const ORACLE_BENCHMARKS_BY_PRODUCT_CLASS: Record<string, OracleBenchmark[]> = {
    "uk-consumer-iot-outdoor": UK_CONSUMER_IOT_OUTDOOR,
    "uk-bess-containerised": UK_BESS_3MWH,
    "uk-vertical-farm-container": UK_VERTICAL_FARM_CONTAINER,
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
