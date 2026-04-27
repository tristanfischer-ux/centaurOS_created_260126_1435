/**
 * @file bom-cost-fallback.ts — Loop 15 P3: parametric fallback for unpriced
 * BOM rows.
 *
 * Why this exists:
 *   Loop 14 surfaced the unpriced-row callout honestly: HAPS Loop 14 shows
 *   "7 rows have no estimated unit cost · PWA-001 to PWA-007" — the entire
 *   port-wing primary structure unpriced. The callout is informative but
 *   the rows themselves still render "—" in the Cost column, so the unit-cost
 *   total understates by the unpriced rows' contribution.
 *
 *   Council L15 (DeepSeek V4-Pro, GPT-5.5, Mistral, Kimi K2.6, Qwen 3.6)
 *   was unanimous: rows must exit with a non-null cost OR an explicit
 *   "unpriceable_blocker" flag. Blank cells in a £393k aerospace BOM that
 *   claims procurement-grade are not acceptable.
 *
 * What this helper does (deterministic, no LLM call):
 *   1. Pattern-match the part name + description + process + material
 *      against a category taxonomy (PCBA, camera, motor, composite spar,
 *      pressure vessel, harness, fastener, sensor, etc.).
 *   2. For each category, hold a parametric cost band (low / typical / high)
 *      in GBP, plus the heuristic that drives it (mass-scaled / area-scaled /
 *      complexity-tier / fixed).
 *   3. Compute a "parametric estimate" with explicit confidence label
 *      (low / medium / high) and a one-line rationale.
 *
 * Output is OPT-IN: callers call `parametricEstimate(part)` to compute the
 * estimate; the PDF renderer chooses whether to display it (typically as
 * "estimated" badge or beside the Cost column with provenance footnote).
 *
 * The estimate NEVER overwrites a non-null estimatedUnitCostGbp. It only
 * fills in nulls. The persistence layer is unchanged — these are render-time
 * estimates, not data-layer mutations.
 */

export interface BomCostFallbackInput {
    partNumber: string
    name: string
    description: string | null
    process: string | null
    material: string | null
    massKg: number | null
    isPurchased: boolean
}

export interface BomCostFallbackOutput {
    /** Estimated unit cost in GBP. Null when the helper has no category match. */
    estimatedUnitCostGbp: number | null
    /** Confidence band: high (catalogue/parametric established), medium
     * (category model fits but specifics unknown), low (rough order of
     * magnitude only). */
    confidence: "high" | "medium" | "low" | null
    /** One-line rationale stating which category was matched + the basis. */
    rationale: string | null
    /** Category id for downstream grouping. */
    categoryId: string | null
}

/** Category taxonomy. Order matters — first match wins. */
interface CostCategory {
    id: string
    /** Lower-case keywords; any match against name + description + material
     * + process triggers this category. */
    keywords: RegExp
    /** Cost computation. Receives mass (kg) and returns GBP. */
    estimate: (massKg: number | null) => { value: number; rationale: string }
    /** Confidence for this category. */
    confidence: "high" | "medium" | "low"
}

const CATEGORIES: CostCategory[] = [
    // Aerospace primary structural — composite wing spars, ribs, skins
    {
        id: "aerospace-composite-primary-structure",
        keywords:
            /\b(primary spar|wing spar|main spar|rib(?:s|let)?\b|composite skin|wing skin|fuselage skin|carbon[- ]fibre|carbon[- ]fiber|cfrp|prepreg|autoclave[- ]cured|composite primary)\b/i,
        estimate: (massKg) => {
            // Aerospace composite primary structure: ~£900-£1,400 per kg
            // (raw material + autoclave cure + NDI). Use £1,100/kg as
            // mid-band. Default mass 4 kg if unknown (matches a HAPS-class
            // wing rib).
            const mass = massKg && massKg > 0 ? massKg : 4
            const value = Math.round(mass * 1100)
            return {
                value,
                rationale: `Aerospace composite primary structure: parametric £1,100/kg (autoclave-cured CFRP including NDI). Estimated mass ${mass.toFixed(2)} kg.`,
            }
        },
        confidence: "medium",
    },
    // Solar panels / PV tiles
    {
        id: "solar-pv",
        keywords:
            /\b(solar (?:array|panel|tile|cell)|PV (?:array|cell|tile|panel)|photovoltaic|monocrystalline|perovskite)\b/i,
        estimate: (massKg) => {
            // Conformal aerospace-grade flexible PV: ~£280/m² typical.
            // For consumer-grade fixed-tilt: ~£90/m². Use mass as a proxy:
            // PV area ≈ massKg / 1.4 (kg/m² for aerospace flexi).
            // Default 0.6 m² if unknown.
            const m2 = massKg && massKg > 0 ? massKg / 1.4 : 0.6
            const value = Math.round(m2 * 280)
            return {
                value,
                rationale: `Aerospace-grade flexible PV array: parametric £280/m². Estimated area ${m2.toFixed(2)} m² (mass × 1/1.4 kg/m²).`,
            }
        },
        confidence: "medium",
    },
    // Hydrogen storage / pressure vessel
    {
        id: "hydrogen-pressure-vessel",
        keywords:
            /\b(hydrogen tank|hydrogen storage|H2 tank|pressure vessel|composite overwrap|type[- ]?[1234]\b|350 ?bar|700 ?bar|kevlar|carbon overwrapped)\b/i,
        estimate: (massKg) => {
            // Type-IV CFRP overwrap pressure vessel ~£1,400/kg. Default 12 kg.
            const mass = massKg && massKg > 0 ? massKg : 12
            const value = Math.round(mass * 1400)
            return {
                value,
                rationale: `Type-IV composite overwrap pressure vessel: parametric £1,400/kg (DOT/ECE certified). Estimated mass ${mass.toFixed(2)} kg.`,
            }
        },
        confidence: "medium",
    },
    // Fuel cell stack / power electronics for fuel cell
    {
        id: "fuel-cell-stack",
        keywords:
            /\b(fuel cell|PEM stack|proton exchange|electrolyser|electrolyzer|stack assembly)\b/i,
        estimate: (massKg) => {
            // PEM fuel cell stacks ~£600/kW. Mass ≈ 0.8 kg/kW. So ~£750/kg.
            const mass = massKg && massKg > 0 ? massKg : 6
            const value = Math.round(mass * 750)
            return {
                value,
                rationale: `PEM fuel-cell stack: parametric £750/kg (≈£600/kW × 0.8 kg/kW). Estimated mass ${mass.toFixed(2)} kg.`,
            }
        },
        confidence: "medium",
    },
    // Avionics / flight control / DAL-B compute
    {
        id: "avionics-flight-control",
        keywords:
            /\b(flight[- ]control computer|FCC|triple[- ]redundant|DAL[- ]?[ABC]|inertial navigation|INS\b|FADEC|autopilot computer)\b/i,
        estimate: () => {
            // Triple-redundant DAL-B FCC: £35-£60k typical. Use £42k.
            return {
                value: 42000,
                rationale: "Triple-redundant DAL-B flight-control computer: parametric £42,000 (industry mid-band; Garmin G3X type-cert tier).",
            }
        },
        confidence: "medium",
    },
    // Inertial / GPS receiver
    {
        id: "inertial-gps",
        keywords:
            /\b(inertial measurement|IMU|tactical[- ]grade|fibre[- ]optic gyro|FOG|MEMS gyro|GNSS receiver|RTK GPS)\b/i,
        estimate: () => ({
            value: 18000,
            rationale: "Tactical-grade IMU + GNSS receiver: parametric £18,000 (mid-band; Honeywell/Northrop tier).",
        }),
        confidence: "medium",
    },
    // SATCOM / data link
    {
        id: "satcom-datalink",
        keywords:
            /\b(satellite (?:comm|comms|communications|link)|SATCOM|Iridium Certus|Inmarsat|S[- ]?band link|UHF data link|secure datalink|Ku[- ]?band)\b/i,
        estimate: () => ({
            value: 25000,
            rationale: "Aerospace SATCOM transceiver: parametric £25,000 (Iridium Certus / Inmarsat L-band terminal).",
        }),
        confidence: "medium",
    },
    // Electromechanical actuator (aileron / flap)
    {
        id: "electromechanical-actuator",
        keywords:
            /\b(electromechanical actuator|EMA\b|aileron actuator|flap actuator|servo[- ]?actuator|linear actuator)\b/i,
        estimate: () => ({
            value: 4500,
            rationale: "Aerospace electromechanical actuator: parametric £4,500 (mid-band; brushless DC + harmonic-drive + position feedback).",
        }),
        confidence: "medium",
    },
    // Battery cell modules
    {
        id: "battery-cell-module",
        keywords:
            /\b(battery (?:cell|module|pack)|li[- ]?ion|lithium[- ]?ion|LFP|NMC|18650|21700|cylindrical cell)\b/i,
        estimate: (massKg) => {
            // Aerospace-grade battery cells: ~£280/kg.
            const mass = massKg && massKg > 0 ? massKg : 2
            const value = Math.round(mass * 280)
            return {
                value,
                rationale: `Lithium-ion cells (aerospace qualification): parametric £280/kg. Estimated mass ${mass.toFixed(2)} kg.`,
            }
        },
        confidence: "medium",
    },
    // Camera / image sensor module
    {
        id: "camera-imager",
        keywords:
            /\b(image sensor|camera module|IMX\d{3}|CMOS sensor|CCD sensor|optical zoom|machine vision camera)\b/i,
        estimate: () => ({
            value: 35,
            rationale: "Camera / image-sensor module (consumer / industrial): parametric £35 (Sony IMX-class CMOS + lens).",
        }),
        confidence: "high",
    },
    // Edge AI / NPU compute module
    {
        id: "edge-ai-npu",
        keywords:
            /\b(edge AI|neural processing|NPU|edge inference|Hailo|Rockchip|Ambarella|Coral|Jetson|TensorRT)\b/i,
        estimate: () => ({
            value: 95,
            rationale: "Edge-AI compute module: parametric £95 (Hailo-8 / Rockchip RK3588-class).",
        }),
        confidence: "high",
    },
    // PCBA — generic populated PCB
    {
        id: "pcba",
        keywords:
            /\b(PCBA|populated PCB|printed circuit assembly|main board|motherboard|control board|interface board)\b/i,
        estimate: (massKg) => {
            // Generic PCBA: £70-£120 per board. Use £90.
            return {
                value: 90,
                rationale: "Populated PCB assembly: parametric £90 (4-layer FR4, mixed SMT + through-hole, mid-volume tier).",
            }
        },
        confidence: "high",
    },
    // Wiring harness / cable assembly
    {
        id: "wiring-harness",
        keywords:
            /\b(wiring harness|cable assembly|interconnect harness|loom\b|wire bundle|harness assembly)\b/i,
        estimate: (massKg) => {
            const mass = massKg && massKg > 0 ? massKg : 0.4
            const value = Math.round(mass * 220)
            return {
                value,
                rationale: `Aerospace wiring harness: parametric £220/kg (Tyco/Carlisle aerospace-grade, terminated). Estimated mass ${mass.toFixed(2)} kg.`,
            }
        },
        confidence: "medium",
    },
    // Generic fastener — small metal parts
    {
        id: "fastener",
        keywords:
            /\b(fastener|bolt\b|screw\b|rivet|stud\b|nut\b|insert\b|bushing\b|grommet\b|clip\b)\b/i,
        estimate: () => ({
            value: 2,
            rationale: "Aerospace-grade fastener (titanium or stainless): parametric £2 each (NAS / MS-spec).",
        }),
        confidence: "high",
    },
    // Aluminium / steel machined part
    {
        id: "machined-metal-part",
        keywords:
            /\b(machined|CNC[- ]machined|milled|turned|fabricated|aluminium\b|aluminum\b|stainless\b|titanium\b)\b/i,
        estimate: (massKg) => {
            const mass = massKg && massKg > 0 ? massKg : 0.3
            // Machined aluminium ~£90/kg; titanium ~£280/kg. Use £140 mid-band.
            const value = Math.round(mass * 140)
            return {
                value,
                rationale: `CNC-machined metallic part: parametric £140/kg (aluminium / stainless mid-band). Estimated mass ${mass.toFixed(2)} kg.`,
            }
        },
        confidence: "medium",
    },
    // Sensor / transducer
    {
        id: "sensor-transducer",
        keywords:
            /\b(sensor|transducer|pressure transducer|load cell|accelerometer|gyroscope|magnetometer|hall sensor)\b/i,
        estimate: () => ({
            value: 65,
            rationale: "Industrial sensor / transducer: parametric £65 (mid-volume tier, calibrated).",
        }),
        confidence: "high",
    },
    // Navigation lights / position lights (aerospace) — lightweight LED clusters
    {
        id: "nav-lights",
        keywords:
            /\b(navigation light|position light|nav light|anti[- ]collision|strobe light|beacon\b)\b/i,
        estimate: () => ({
            value: 280,
            rationale: "Aerospace navigation / position light (LED cluster, AS-rated): parametric £280.",
        }),
        confidence: "medium",
    },
    // Antennas / RF
    {
        id: "rf-antenna",
        keywords:
            /\b(antenna|RF (?:module|front end)|patch antenna|monopole|dipole|GPS antenna)\b/i,
        estimate: () => ({
            value: 180,
            rationale: "Aerospace RF antenna assembly: parametric £180 (patch / blade, AS-rated).",
        }),
        confidence: "medium",
    },
    // Generic injection-moulded plastic part (consumer)
    {
        id: "injection-moulded-plastic",
        keywords:
            /\b(injection mould|injection moulded|injection molded|plastic enclosure|housing\b|case\b|abs|polycarbonate|nylon\b)\b/i,
        estimate: (massKg) => {
            const mass = massKg && massKg > 0 ? massKg : 0.2
            const value = Math.round(mass * 18 + 4)
            return {
                value,
                rationale: `Injection-moulded plastic part: parametric £18/kg + £4 fixed (mid-volume tier). Estimated mass ${mass.toFixed(2)} kg.`,
            }
        },
        confidence: "high",
    },
]

/**
 * Compute a parametric estimate for a part. Returns the original cost
 * if it is non-null and > 0; otherwise tries each category in order.
 * If no category matches, returns nulls — the caller knows the row is
 * a true unpriceable_blocker.
 */
export function parametricEstimate(
    input: BomCostFallbackInput,
    existingCost: number | null,
): BomCostFallbackOutput {
    if (existingCost != null && existingCost > 0) {
        // Already priced; do not estimate.
        return {
            estimatedUnitCostGbp: existingCost,
            confidence: "high",
            rationale: null,
            categoryId: null,
        }
    }

    if (!input.isPurchased) {
        // Make rows are estimated upstream by the make-cost specialist; the
        // parametric ladder targets unpriced BUY rows specifically.
        return {
            estimatedUnitCostGbp: null,
            confidence: null,
            rationale: null,
            categoryId: null,
        }
    }

    const haystack = [
        input.name,
        input.description ?? "",
        input.process ?? "",
        input.material ?? "",
    ]
        .filter((s) => s.length > 0)
        .join(" ")
        .toLowerCase()

    for (const cat of CATEGORIES) {
        if (cat.keywords.test(haystack)) {
            const { value, rationale } = cat.estimate(input.massKg)
            return {
                estimatedUnitCostGbp: value,
                confidence: cat.confidence,
                rationale,
                categoryId: cat.id,
            }
        }
    }

    return {
        estimatedUnitCostGbp: null,
        confidence: null,
        rationale: null,
        categoryId: null,
    }
}

/**
 * Apply parametric fallback to an array of parts. Returns a Map keyed by
 * partNumber → BomCostFallbackOutput. Rows already priced map to a no-op
 * output (estimatedUnitCostGbp = original, no rationale).
 */
export function applyBomCostFallback<T extends BomCostFallbackInput & {
    estimatedUnitCostGbp: number | null
}>(
    parts: T[],
): Map<string, BomCostFallbackOutput> {
    const out = new Map<string, BomCostFallbackOutput>()
    for (const p of parts) {
        out.set(p.partNumber, parametricEstimate(p, p.estimatedUnitCostGbp))
    }
    return out
}
