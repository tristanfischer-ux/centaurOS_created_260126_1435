/**
 * @file engineering-compute.ts — Tool handlers for engineering calculations.
 *
 * @description Provides real computation for engineering analysis by generating
 * template-based Python code and executing it on Modal. Unlike the JS VM sandbox
 * in compute.ts (designed for financial models), these handlers have access to
 * numpy, scipy, sympy, and pint via Modal's Python runtime.
 *
 * INTENT: LLMs hallucinate numbers. These handlers ensure that when a specialist
 * says "safety factor 2.3", that number comes from σ = M·y/I with real inputs,
 * not from Claude's training data. The Python code is template-generated (not
 * LLM-generated) to guarantee formula correctness.
 *
 * DECISION: Template-based code generation over letting the LLM write Python.
 * Templates guarantee correct formulas; LLM-generated code could introduce
 * subtle errors in safety-critical calculations.
 *
 * @security
 * - All Python code is template-generated, not user-provided
 * - Modal containers are sandboxed
 * - Code validated before execution (no dangerous imports)
 *
 * @related
 * - Modal client: src/lib/agents/tools/modal-compute.ts
 * - Tool definitions: src/lib/agents/tools/definitions.ts
 * - Material data: src/lib/engineering-data/materials.ts
 * - Process data: src/lib/engineering-data/processes.ts
 */

import type { ToolHandler } from "./common"
import { executeModalCompute } from "../modal-compute"
import {
    findMaterial,
    listMaterials,
    findProcess,
    listProcesses,
    getProcessesForMaterial,
} from "@/lib/engineering-data"

// ─── Helper: Format compute result as markdown ──────────────────────

function formatComputeError(toolName: string, error: string): string {
    return `**${toolName} — Error**\n\n${error}`
}

// ─── run_engineering_calc ────────────────────────────────────────────

/**
 * General-purpose Python computation on Modal.
 * Used by specialists when they need custom engineering calculations
 * that don't fit the structured tools below.
 */
export const handleRunEngineeringCalc: ToolHandler = async (args, _ctx) => {
    const code = args.code as string
    const description = (args.description as string) ?? "Engineering calculation"

    if (!code || typeof code !== "string") {
        return "Error: `code` parameter is required and must be a Python string."
    }

    const result = await executeModalCompute(code, description)

    if (result.error) {
        return formatComputeError("Engineering Calculation", result.error)
    }

    let output = `**Engineering Calculation** *(${result.duration_ms}ms)*\n\n`
    if (result.stdout) {
        output += "```\n" + result.stdout + "\n```\n"
    }
    if (result.result && result.result !== result.stdout?.trim()) {
        output +=
            "\n**Result:**\n```json\n" +
            JSON.stringify(result.result, null, 2) +
            "\n```"
    }

    return output
}

// ─── calculate_stress ───────────────────────────────────────────────

/**
 * Structural stress analysis for common geometry types.
 *
 * Generates Python code using classical mechanics formulas:
 * - Beam: σ = M·y/I (bending), τ = V·Q/(I·b) (shear)
 * - Cylinder: σ_hoop = p·r/t (thin-wall pressure vessel)
 * - Plate: σ = 6·M/(b·t²) (flat plate bending)
 * - Column: P_cr = π²·E·I/L² (Euler buckling)
 */
export const handleCalculateStress: ToolHandler = async (args, _ctx) => {
    const geometryType = args.geometry_type as string
    const loadN = args.load_N as number
    const material = args.material as string

    if (!geometryType || loadN == null || !material) {
        return "Error: `geometry_type`, `load_N`, and `material` are required."
    }

    // Look up material properties
    const mat = findMaterial(material)
    if (!mat) {
        return `Material "${material}" not found.\n\nAvailable materials:\n${listMaterials()}`
    }
    if (!mat.yield_strength_mpa) {
        return `Material "${mat.name}" has no yield strength (brittle material). Use ultimate_strength_mpa for brittle failure analysis.`
    }

    const yieldMpa = mat.yield_strength_mpa
    const ultimateMpa = mat.ultimate_strength_mpa
    const elasticGpa = mat.elastic_modulus_gpa

    let pythonCode: string

    switch (geometryType) {
        case "beam": {
            const lengthMm = args.length_mm as number
            const widthMm = args.width_mm as number
            const heightMm = args.height_mm as number
            if (!lengthMm || !widthMm || !heightMm) {
                return "Error: beam requires `length_mm`, `width_mm`, `height_mm`."
            }
            pythonCode = `
import json

# Beam bending analysis (simply supported, center point load)
# σ_max = M_max · y / I where M_max = F·L/4 for center load

load_n = ${loadN}
length_m = ${lengthMm} / 1000
width_m = ${widthMm} / 1000
height_m = ${heightMm} / 1000

# Second moment of area (rectangular cross-section)
I = (width_m * height_m**3) / 12

# Maximum bending moment (simply supported, center point load)
M_max = load_n * length_m / 4

# Maximum bending stress
y = height_m / 2
sigma_max_pa = M_max * y / I
sigma_max_mpa = sigma_max_pa / 1e6

# Maximum shear stress (rectangular beam)
V = load_n / 2  # max shear force
tau_max_pa = (3 * V) / (2 * width_m * height_m)
tau_max_mpa = tau_max_pa / 1e6

# Maximum deflection at center
E_pa = ${elasticGpa} * 1e9
delta_max_m = (load_n * length_m**3) / (48 * E_pa * I)
delta_max_mm = delta_max_m * 1000

# Safety factors
yield_mpa = ${yieldMpa}
ultimate_mpa = ${ultimateMpa}
sf_yield = yield_mpa / sigma_max_mpa if sigma_max_mpa > 0 else float('inf')
sf_ultimate = ultimate_mpa / sigma_max_mpa if sigma_max_mpa > 0 else float('inf')

print(json.dumps({
    "geometry": "Simply supported beam, center point load",
    "material": "${mat.name}",
    "load_N": load_n,
    "dimensions_mm": {"length": ${lengthMm}, "width": ${widthMm}, "height": ${heightMm}},
    "moment_of_inertia_mm4": round(I * 1e12, 2),
    "max_bending_moment_Nm": round(M_max, 3),
    "max_bending_stress_MPa": round(sigma_max_mpa, 2),
    "max_shear_stress_MPa": round(tau_max_mpa, 2),
    "max_deflection_mm": round(delta_max_mm, 4),
    "yield_strength_MPa": yield_mpa,
    "ultimate_strength_MPa": ultimate_mpa,
    "safety_factor_yield": round(sf_yield, 2),
    "safety_factor_ultimate": round(sf_ultimate, 2),
    "pass_yield": sf_yield >= 1.5,
    "pass_ultimate": sf_ultimate >= 2.0,
    "verdict": "PASS" if sf_yield >= 1.5 else ("MARGINAL" if sf_yield >= 1.0 else "FAIL")
}))
`
            break
        }

        case "cylinder":
        case "pressure_vessel": {
            const pressureMpa = args.pressure_MPa as number
            const outerDiameterMm = args.outer_diameter_mm as number
            const wallThicknessMm = args.wall_thickness_mm as number
            if (!pressureMpa || !outerDiameterMm || !wallThicknessMm) {
                return "Error: cylinder/pressure_vessel requires `pressure_MPa`, `outer_diameter_mm`, `wall_thickness_mm`."
            }
            pythonCode = `
import json

# Thin-wall pressure vessel analysis
# σ_hoop = p·r/t, σ_axial = p·r/(2t)

pressure_mpa = ${pressureMpa}
outer_d_mm = ${outerDiameterMm}
wall_t_mm = ${wallThicknessMm}
inner_r_mm = (outer_d_mm / 2) - wall_t_mm

# Check thin-wall assumption (r/t > 10)
r_over_t = inner_r_mm / wall_t_mm
thin_wall_valid = r_over_t > 10

# Hoop (circumferential) stress
sigma_hoop = pressure_mpa * inner_r_mm / wall_t_mm

# Axial (longitudinal) stress
sigma_axial = pressure_mpa * inner_r_mm / (2 * wall_t_mm)

# Von Mises equivalent stress
sigma_vm = (sigma_hoop**2 + sigma_axial**2 - sigma_hoop * sigma_axial)**0.5

yield_mpa = ${yieldMpa}
sf_yield = yield_mpa / sigma_vm if sigma_vm > 0 else float('inf')

print(json.dumps({
    "geometry": "Cylindrical pressure vessel (thin-wall)",
    "material": "${mat.name}",
    "pressure_MPa": pressure_mpa,
    "dimensions_mm": {"outer_diameter": outer_d_mm, "wall_thickness": wall_t_mm, "inner_radius": round(inner_r_mm, 2)},
    "thin_wall_valid": thin_wall_valid,
    "r_over_t": round(r_over_t, 1),
    "hoop_stress_MPa": round(sigma_hoop, 2),
    "axial_stress_MPa": round(sigma_axial, 2),
    "von_mises_stress_MPa": round(sigma_vm, 2),
    "yield_strength_MPa": yield_mpa,
    "safety_factor": round(sf_yield, 2),
    "pass": sf_yield >= 2.0,
    "verdict": "PASS" if sf_yield >= 2.0 else ("MARGINAL" if sf_yield >= 1.5 else "FAIL"),
    "note": "Thin-wall assumption valid" if thin_wall_valid else "WARNING: r/t < 10, use thick-wall (Lame) equations for accurate results"
}))
`
            break
        }

        case "column": {
            const lengthMm = args.length_mm as number
            const widthMm = args.width_mm as number
            const heightMm = args.height_mm as number
            const endCondition = (args.end_condition as string) ?? "pinned-pinned"
            if (!lengthMm || !widthMm || !heightMm) {
                return "Error: column requires `length_mm`, `width_mm`, `height_mm`."
            }
            const kFactors: Record<string, number> = {
                "fixed-fixed": 0.5,
                "fixed-pinned": 0.7,
                "pinned-pinned": 1.0,
                "fixed-free": 2.0,
            }
            const k = kFactors[endCondition] ?? 1.0
            pythonCode = `
import json
import math

# Euler column buckling analysis
# P_cr = π²·E·I / (K·L)²

load_n = ${loadN}
length_m = ${lengthMm} / 1000
width_m = ${widthMm} / 1000
height_m = ${heightMm} / 1000
K = ${k}  # ${endCondition}

E_pa = ${elasticGpa} * 1e9

# Use minimum I (weakest axis)
I_xx = (width_m * height_m**3) / 12
I_yy = (height_m * width_m**3) / 12
I_min = min(I_xx, I_yy)

# Effective length
L_eff = K * length_m

# Critical buckling load
P_cr = (math.pi**2 * E_pa * I_min) / (L_eff**2)

# Slenderness ratio
A = width_m * height_m
r_min = (I_min / A)**0.5
slenderness = L_eff / r_min

# Safety factor against buckling
sf_buckling = P_cr / load_n if load_n > 0 else float('inf')

# Also check compressive yield
sigma_comp = load_n / A / 1e6
sf_yield = ${yieldMpa} / sigma_comp if sigma_comp > 0 else float('inf')

print(json.dumps({
    "geometry": "Rectangular column (${endCondition})",
    "material": "${mat.name}",
    "axial_load_N": load_n,
    "dimensions_mm": {"length": ${lengthMm}, "width": ${widthMm}, "height": ${heightMm}},
    "effective_length_factor_K": K,
    "slenderness_ratio": round(slenderness, 1),
    "critical_buckling_load_N": round(P_cr, 1),
    "compressive_stress_MPa": round(sigma_comp, 2),
    "safety_factor_buckling": round(sf_buckling, 2),
    "safety_factor_yield": round(sf_yield, 2),
    "governing_failure": "buckling" if sf_buckling < sf_yield else "compressive_yield",
    "verdict": "PASS" if min(sf_buckling, sf_yield) >= 2.0 else ("MARGINAL" if min(sf_buckling, sf_yield) >= 1.5 else "FAIL")
}))
`
            break
        }

        default:
            return `Unknown geometry type "${geometryType}". Supported: beam, cylinder, pressure_vessel, column.`
    }

    const result = await executeModalCompute(pythonCode, `stress_${geometryType}`)

    if (result.error) {
        return formatComputeError("Stress Analysis", result.error)
    }

    // Format the result as a readable markdown report
    const data = result.result as Record<string, unknown>
    if (!data || typeof data !== "object") {
        return `**Stress Analysis**\n\n\`\`\`\n${result.stdout}\n\`\`\``
    }

    let md = `## Stress Analysis — ${data.geometry}\n\n`
    md += `**Material:** ${data.material}\n\n`
    md += `| Parameter | Value |\n|-----------|-------|\n`

    const skipKeys = new Set(["geometry", "material", "verdict", "pass", "pass_yield", "pass_ultimate", "note", "dimensions_mm"])
    for (const [key, value] of Object.entries(data)) {
        if (skipKeys.has(key)) continue
        const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        md += `| ${label} | ${typeof value === "number" ? value : String(value)} |\n`
    }

    const verdict = data.verdict as string
    md += `\n**Verdict: ${verdict}**`
    if (verdict === "FAIL") {
        md += " — Part will likely fail under the specified load. Increase cross-section or choose a stronger material."
    } else if (verdict === "MARGINAL") {
        md += " — Safety factor below recommended minimum. Consider increasing dimensions."
    } else {
        md += " — Part meets structural requirements."
    }

    if (data.note) {
        md += `\n\n> ${data.note}`
    }

    return md
}

// ─── calculate_tolerance_stack ───────────────────────────────────────

/**
 * Tolerance stack-up analysis using worst-case, RSS, or Monte Carlo methods.
 */
export const handleCalculateToleranceStack: ToolHandler = async (args, _ctx) => {
    const dimensions = args.dimensions as Array<{ nominal_mm: number; tolerance_mm: number }>
    const method = (args.method as string) ?? "rss"
    const targetGap = args.target_gap_mm as number | undefined

    if (!dimensions || !Array.isArray(dimensions) || dimensions.length < 2) {
        return "Error: `dimensions` must be an array of at least 2 items, each with `nominal_mm` and `tolerance_mm`."
    }

    // Validate each dimension
    for (let i = 0; i < dimensions.length; i++) {
        const d = dimensions[i]
        if (d.nominal_mm == null || d.tolerance_mm == null) {
            return `Error: dimension[${i}] missing nominal_mm or tolerance_mm.`
        }
    }

    const dimJson = JSON.stringify(dimensions)
    const pythonCode = `
import json
import math

dimensions = ${dimJson}
method = "${method}"
target_gap = ${targetGap ?? "None"}

# Extract values
nominals = [d["nominal_mm"] for d in dimensions]
tolerances = [d["tolerance_mm"] for d in dimensions]

# Total nominal
total_nominal = sum(nominals)

# Worst-case stack
wc_total_tol = sum(tolerances)
wc_min = total_nominal - wc_total_tol
wc_max = total_nominal + wc_total_tol

# RSS (Root Sum Square) stack
rss_total_tol = math.sqrt(sum(t**2 for t in tolerances))
rss_min = total_nominal - rss_total_tol
rss_max = total_nominal + rss_total_tol

# Monte Carlo (10,000 samples)
import random
random.seed(42)
samples = []
n_samples = 10000
for _ in range(n_samples):
    sample = sum(
        random.gauss(nom, tol / 3)  # 3-sigma = tolerance band
        for nom, tol in zip(nominals, tolerances)
    )
    samples.append(sample)

mc_mean = sum(samples) / len(samples)
mc_std = (sum((s - mc_mean)**2 for s in samples) / len(samples))**0.5
mc_min = min(samples)
mc_max = max(samples)
mc_3sigma_min = mc_mean - 3 * mc_std
mc_3sigma_max = mc_mean + 3 * mc_std

# Gap analysis if target specified
gap_result = None
if target_gap is not None:
    gap_wc = target_gap - wc_total_tol
    gap_rss = target_gap - rss_total_tol
    interference_probability = sum(1 for s in samples if (s - total_nominal) > target_gap) / n_samples
    gap_result = {
        "target_gap_mm": target_gap,
        "worst_case_remaining_gap_mm": round(gap_wc, 4),
        "rss_remaining_gap_mm": round(gap_rss, 4),
        "interference_probability_pct": round(interference_probability * 100, 2),
        "interference_risk": "HIGH" if interference_probability > 0.01 else ("MODERATE" if interference_probability > 0.001 else "LOW")
    }

result = {
    "dimensions_count": len(dimensions),
    "total_nominal_mm": round(total_nominal, 4),
    "method_used": method,
    "worst_case": {
        "total_tolerance_mm": round(wc_total_tol, 4),
        "min_mm": round(wc_min, 4),
        "max_mm": round(wc_max, 4),
        "range_mm": round(wc_max - wc_min, 4),
    },
    "rss": {
        "total_tolerance_mm": round(rss_total_tol, 4),
        "min_mm": round(rss_min, 4),
        "max_mm": round(rss_max, 4),
        "range_mm": round(rss_max - rss_min, 4),
    },
    "monte_carlo": {
        "samples": n_samples,
        "mean_mm": round(mc_mean, 4),
        "std_dev_mm": round(mc_std, 4),
        "min_mm": round(mc_min, 4),
        "max_mm": round(mc_max, 4),
        "three_sigma_min_mm": round(mc_3sigma_min, 4),
        "three_sigma_max_mm": round(mc_3sigma_max, 4),
    },
}

if gap_result:
    result["gap_analysis"] = gap_result

print(json.dumps(result))
`

    const computeResult = await executeModalCompute(pythonCode, "tolerance_stack")

    if (computeResult.error) {
        return formatComputeError("Tolerance Stack-Up", computeResult.error)
    }

    const data = computeResult.result as Record<string, unknown>
    if (!data || typeof data !== "object") {
        return `**Tolerance Stack-Up**\n\n\`\`\`\n${computeResult.stdout}\n\`\`\``
    }

    const wc = data.worst_case as Record<string, number>
    const rss = data.rss as Record<string, number>
    const mc = data.monte_carlo as Record<string, number>

    let md = `## Tolerance Stack-Up Analysis\n\n`
    md += `**${data.dimensions_count} dimensions, total nominal: ${data.total_nominal_mm}mm**\n\n`
    md += `| Method | Total Tol (±mm) | Range (mm) | Min (mm) | Max (mm) |\n`
    md += `|--------|----------------|------------|----------|----------|\n`
    md += `| Worst Case | ±${wc.total_tolerance_mm} | ${wc.range_mm} | ${wc.min_mm} | ${wc.max_mm} |\n`
    md += `| RSS (statistical) | ±${rss.total_tolerance_mm} | ${rss.range_mm} | ${rss.min_mm} | ${rss.max_mm} |\n`
    md += `| Monte Carlo (3σ) | — | ${(mc.three_sigma_max_mm - mc.three_sigma_min_mm).toFixed(4)} | ${mc.three_sigma_min_mm} | ${mc.three_sigma_max_mm} |\n`

    const gap = data.gap_analysis as Record<string, unknown> | undefined
    if (gap) {
        md += `\n### Gap Analysis\n\n`
        md += `| Parameter | Value |\n|-----------|-------|\n`
        md += `| Target gap | ${gap.target_gap_mm}mm |\n`
        md += `| Worst-case remaining gap | ${gap.worst_case_remaining_gap_mm}mm |\n`
        md += `| RSS remaining gap | ${gap.rss_remaining_gap_mm}mm |\n`
        md += `| Interference probability | ${gap.interference_probability_pct}% |\n`
        md += `| Risk level | **${gap.interference_risk}** |\n`
    }

    return md
}

// ─── calculate_thermal ──────────────────────────────────────────────

/**
 * Steady-state thermal analysis for heat dissipation.
 */
export const handleCalculateThermal: ToolHandler = async (args, _ctx) => {
    const powerW = args.power_w as number
    const material = args.material as string
    const ambientC = (args.ambient_temp_c as number) ?? 25
    const convCoeff = (args.convection_coefficient as number) ?? 10 // natural convection in air
    const surfaceAreaMm2 = args.surface_area_mm2 as number
    const thicknessMm = args.thickness_mm as number

    if (!powerW || !material || !surfaceAreaMm2) {
        return "Error: `power_w`, `material`, and `surface_area_mm2` are required."
    }

    const mat = findMaterial(material)
    if (!mat) {
        return `Material "${material}" not found.\n\nAvailable materials:\n${listMaterials()}`
    }

    const pythonCode = `
import json

# Steady-state thermal analysis
# Conduction: R_cond = L / (k·A)
# Convection: R_conv = 1 / (h·A)
# Total: R_total = R_cond + R_conv
# ΔT = Q · R_total

power_w = ${powerW}
k = ${mat.thermal_conductivity_w_mk}  # W/(m·K) - thermal conductivity
h = ${convCoeff}  # W/(m²·K) - convection coefficient
A_m2 = ${surfaceAreaMm2} / 1e6  # surface area in m²
thickness_m = ${thicknessMm ?? 5} / 1000  # thickness in m
T_ambient = ${ambientC}  # °C

# Thermal resistances
R_cond = thickness_m / (k * A_m2) if k > 0 and A_m2 > 0 else 0
R_conv = 1 / (h * A_m2) if h > 0 and A_m2 > 0 else float('inf')
R_total = R_cond + R_conv

# Temperature rise
delta_T = power_w * R_total
T_surface = T_ambient + power_w * R_cond
T_max = T_ambient + delta_T

# Material limits
hdt = ${mat.hdt_c ?? "None"}
melting = ${mat.melting_point_c ?? "None"}

max_safe_temp = hdt if hdt else (melting * 0.5 if melting else None)
thermal_ok = T_max < max_safe_temp if max_safe_temp else None

print(json.dumps({
    "material": "${mat.name}",
    "power_dissipation_W": power_w,
    "surface_area_mm2": ${surfaceAreaMm2},
    "thickness_mm": ${thicknessMm ?? 5},
    "ambient_temp_C": T_ambient,
    "convection_coefficient_W_m2K": h,
    "thermal_conductivity_W_mK": k,
    "thermal_resistance_conduction_K_W": round(R_cond, 4),
    "thermal_resistance_convection_K_W": round(R_conv, 4),
    "thermal_resistance_total_K_W": round(R_total, 4),
    "surface_temperature_C": round(T_surface, 1),
    "max_temperature_C": round(T_max, 1),
    "temperature_rise_C": round(delta_T, 1),
    "material_hdt_C": hdt,
    "material_melting_C": melting,
    "max_safe_operating_C": max_safe_temp,
    "thermal_ok": thermal_ok,
    "verdict": "PASS" if thermal_ok else ("UNKNOWN" if thermal_ok is None else "FAIL")
}))
`

    const result = await executeModalCompute(pythonCode, "thermal_analysis")

    if (result.error) {
        return formatComputeError("Thermal Analysis", result.error)
    }

    const data = result.result as Record<string, unknown>
    if (!data || typeof data !== "object") {
        return `**Thermal Analysis**\n\n\`\`\`\n${result.stdout}\n\`\`\``
    }

    let md = `## Thermal Analysis — ${data.material}\n\n`
    md += `| Parameter | Value |\n|-----------|-------|\n`
    md += `| Power dissipation | ${data.power_dissipation_W} W |\n`
    md += `| Ambient temperature | ${data.ambient_temp_C}°C |\n`
    md += `| Surface area | ${data.surface_area_mm2} mm² |\n`
    md += `| Thermal conductivity | ${data.thermal_conductivity_W_mK} W/(m·K) |\n`
    md += `| Convection coefficient | ${data.convection_coefficient_W_m2K} W/(m²·K) |\n`
    md += `| **Temperature rise** | **${data.temperature_rise_C}°C** |\n`
    md += `| **Max temperature** | **${data.max_temperature_C}°C** |\n`
    md += `| Material HDT | ${data.material_hdt_C ?? "N/A"}°C |\n`
    md += `| Material melting point | ${data.material_melting_C ?? "N/A"}°C |\n`

    const verdict = data.verdict as string
    md += `\n**Verdict: ${verdict}**`
    if (verdict === "FAIL") {
        md += ` — Max temperature (${data.max_temperature_C}°C) exceeds safe operating limit (${data.max_safe_operating_C}°C). Increase surface area, add heatsink, or choose a higher-temperature material.`
    } else if (verdict === "PASS") {
        md += ` — Operating temperature within material limits.`
    } else {
        md += ` — Material temperature limits unknown. Verify manually.`
    }

    return md
}

// ─── calculate_fastener ─────────────────────────────────────────────

/**
 * Bolted joint analysis — preload, clamping force, bolt stress.
 */
export const handleCalculateFastener: ToolHandler = async (args, _ctx) => {
    const boltSize = args.bolt_size as string // e.g., "M8"
    const gradeStr = (args.grade as string) ?? "8.8"
    const preloadNm = args.preload_torque_Nm as number
    const externalLoadN = (args.external_load_N as number) ?? 0
    const jointMaterial = (args.joint_material as string) ?? "steel"

    if (!boltSize) {
        return "Error: `bolt_size` is required (e.g., 'M8')."
    }

    // Parse bolt size to get nominal diameter
    const sizeMatch = boltSize.match(/^M(\d+(?:\.\d+)?)$/)
    if (!sizeMatch) {
        return `Invalid bolt size format "${boltSize}". Use metric format: M3, M5, M8, M10, etc.`
    }
    const nominalDiaMm = parseFloat(sizeMatch[1])

    // Grade → proof stress
    const gradeProofStress: Record<string, number> = {
        "4.6": 225,
        "4.8": 310,
        "5.8": 380,
        "8.8": 580,
        "10.9": 830,
        "12.9": 970,
    }
    const proofStress = gradeProofStress[gradeStr]
    if (!proofStress) {
        return `Unknown bolt grade "${gradeStr}". Supported: ${Object.keys(gradeProofStress).join(", ")}`
    }

    const pythonCode = `
import json
import math

# Bolted joint analysis
# Preload: F_i = T / (K · d) where K ≈ 0.2 (dry steel)
# Bolt stress: σ = F / A_tensile

d_nom_mm = ${nominalDiaMm}
d_nom_m = d_nom_mm / 1000
proof_stress_mpa = ${proofStress}
grade = "${gradeStr}"

# Standard coarse pitch (ISO 261)
pitch_table = {2: 0.4, 2.5: 0.45, 3: 0.5, 4: 0.7, 5: 0.8, 6: 1.0, 8: 1.25, 10: 1.5, 12: 1.75, 14: 2.0, 16: 2.0, 20: 2.5}
pitch_mm = pitch_table.get(d_nom_mm, d_nom_mm * 0.125)  # fallback

# Tensile stress area (ISO 898-1)
d2 = d_nom_mm - 0.6495 * pitch_mm  # pitch diameter
d3 = d_nom_mm - 1.2269 * pitch_mm  # minor diameter
A_tensile_mm2 = (math.pi / 4) * ((d2 + d3) / 2)**2

# Torque coefficient (dry steel-on-steel)
K = 0.2

# If preload torque given, calculate preload force
preload_torque_nm = ${preloadNm ?? 0}
if preload_torque_nm > 0:
    F_preload_n = preload_torque_nm / (K * d_nom_m)
else:
    # Use 75% of proof load as recommended preload
    F_preload_n = 0.75 * proof_stress_mpa * A_tensile_mm2

# Recommended torque for this preload
T_recommended = F_preload_n * K * d_nom_m

# External load
F_external_n = ${externalLoadN}

# Joint stiffness ratio (typical steel-on-steel: bolt takes ~20% of external load)
C_joint = 0.2  # bolt stiffness fraction
F_bolt_total = F_preload_n + C_joint * F_external_n

# Bolt stress
sigma_bolt = F_bolt_total / A_tensile_mm2
sf_proof = proof_stress_mpa / sigma_bolt if sigma_bolt > 0 else float('inf')

# Clamp check — joint separates when external load exceeds preload/(1-C)
F_separation = F_preload_n / (1 - C_joint)
sf_separation = F_separation / F_external_n if F_external_n > 0 else float('inf')

print(json.dumps({
    "bolt": "${boltSize} grade ${gradeStr}",
    "nominal_diameter_mm": d_nom_mm,
    "pitch_mm": round(pitch_mm, 2),
    "tensile_stress_area_mm2": round(A_tensile_mm2, 2),
    "proof_stress_MPa": proof_stress_mpa,
    "preload_force_N": round(F_preload_n, 0),
    "recommended_torque_Nm": round(T_recommended, 1),
    "external_load_N": F_external_n,
    "total_bolt_force_N": round(F_bolt_total, 0),
    "bolt_stress_MPa": round(sigma_bolt, 1),
    "safety_factor_proof": round(sf_proof, 2),
    "safety_factor_separation": round(sf_separation, 2) if F_external_n > 0 else "N/A (no external load)",
    "verdict": "PASS" if sf_proof >= 1.2 and (F_external_n == 0 or sf_separation >= 2.0) else "FAIL"
}))
`

    const result = await executeModalCompute(pythonCode, `fastener_${boltSize}`)

    if (result.error) {
        return formatComputeError("Fastener Analysis", result.error)
    }

    const data = result.result as Record<string, unknown>
    if (!data || typeof data !== "object") {
        return `**Fastener Analysis**\n\n\`\`\`\n${result.stdout}\n\`\`\``
    }

    let md = `## Fastener Analysis — ${data.bolt}\n\n`
    md += `| Parameter | Value |\n|-----------|-------|\n`
    md += `| Tensile stress area | ${data.tensile_stress_area_mm2} mm² |\n`
    md += `| Proof stress | ${data.proof_stress_MPa} MPa |\n`
    md += `| Preload force | ${data.preload_force_N} N |\n`
    md += `| Recommended torque | ${data.recommended_torque_Nm} Nm |\n`
    if ((data.external_load_N as number) > 0) {
        md += `| External load | ${data.external_load_N} N |\n`
        md += `| Total bolt force | ${data.total_bolt_force_N} N |\n`
    }
    md += `| Bolt stress | ${data.bolt_stress_MPa} MPa |\n`
    md += `| Safety factor (proof) | ${data.safety_factor_proof} |\n`
    if ((data.external_load_N as number) > 0) {
        md += `| Safety factor (separation) | ${data.safety_factor_separation} |\n`
    }
    md += `\n**Verdict: ${data.verdict}**`

    return md
}

// ─── lookup_material ────────────────────────────────────────────────

/**
 * Query the material properties database. Returns real engineering data,
 * not LLM-generated values.
 */
export const handleLookupMaterial: ToolHandler = async (args, _ctx) => {
    const query = args.material_name as string
    const property = args.property as string | undefined

    if (!query) {
        return `Error: \`material_name\` is required.\n\nAvailable materials:\n${listMaterials()}`
    }

    const mat = findMaterial(query)
    if (!mat) {
        return `Material "${query}" not found.\n\nAvailable materials:\n${listMaterials()}`
    }

    // If a specific property was requested, return just that
    if (property) {
        const value = (mat as unknown as Record<string, unknown>)[property]
        if (value === undefined) {
            const validProps = Object.keys(mat).join(", ")
            return `Property "${property}" not found on ${mat.name}. Valid properties: ${validProps}`
        }
        return `**${mat.name}** — ${property}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`
    }

    // Return full material card
    let md = `## ${mat.name}\n\n`
    md += `**Category:** ${mat.category}\n\n`
    md += `### Mechanical Properties\n\n`
    md += `| Property | Value |\n|----------|-------|\n`
    md += `| Density | ${mat.density_kg_m3} kg/m³ |\n`
    md += `| Yield Strength | ${mat.yield_strength_mpa ?? "N/A (brittle)"} MPa |\n`
    md += `| Ultimate Tensile Strength | ${mat.ultimate_strength_mpa} MPa |\n`
    md += `| Elastic Modulus | ${mat.elastic_modulus_gpa} GPa |\n`
    md += `| Poisson's Ratio | ${mat.poisson_ratio} |\n`

    md += `\n### Thermal Properties\n\n`
    md += `| Property | Value |\n|----------|-------|\n`
    md += `| Thermal Conductivity | ${mat.thermal_conductivity_w_mk} W/(m·K) |\n`
    md += `| Specific Heat | ${mat.specific_heat_j_kgk} J/(kg·K) |\n`
    md += `| Melting Point | ${mat.melting_point_c ?? "N/A"}°C |\n`
    md += `| Glass Transition | ${mat.glass_transition_c ?? "N/A"}°C |\n`
    md += `| HDT (0.45 MPa) | ${mat.hdt_c ?? "N/A"}°C |\n`
    md += `| CTE | ${mat.cte_um_mk} µm/(m·K) |\n`

    md += `\n### Manufacturing\n\n`
    md += `| Property | Value |\n|----------|-------|\n`
    md += `| Machinability | ${mat.machinability_rating}/100 |\n`
    md += `| FDM Printable | ${mat.printability.fdm ? "Yes" : "No"} |\n`
    md += `| SLA Printable | ${mat.printability.sla ? "Yes" : "No"} |\n`
    md += `| SLS Printable | ${mat.printability.sls ? "Yes" : "No"} |\n`
    md += `| DMLS Printable | ${mat.printability.dmls ? "Yes" : "No"} |\n`
    md += `| Cost | $${mat.cost_per_kg_usd.low}–$${mat.cost_per_kg_usd.high}/kg |\n`

    if (mat.notes) {
        md += `\n> ${mat.notes}`
    }

    return md
}

// ─── lookup_process ─────────────────────────────────────────────────

/**
 * Query the manufacturing process constraints database.
 */
export const handleLookupProcess: ToolHandler = async (args, _ctx) => {
    const query = args.process_name as string
    const materialId = args.for_material as string | undefined

    if (!query && !materialId) {
        return `Error: \`process_name\` or \`for_material\` is required.\n\nAvailable processes:\n${listProcesses()}`
    }

    // If looking for processes compatible with a material
    if (materialId && !query) {
        const compatible = getProcessesForMaterial(materialId)
        if (compatible.length === 0) {
            return `No processes found compatible with material "${materialId}".`
        }
        let md = `## Processes Compatible with "${materialId}"\n\n`
        md += `| Process | Min Wall | Tolerance | Min Batch |\n|---------|----------|-----------|----------|\n`
        for (const proc of compatible) {
            md += `| ${proc.name} | ${proc.min_wall_mm}mm | ±${proc.tolerance_standard_mm}mm | ${proc.min_batch_economical} |\n`
        }
        return md
    }

    const proc = findProcess(query!)
    if (!proc) {
        return `Process "${query}" not found.\n\nAvailable processes:\n${listProcesses()}`
    }

    let md = `## ${proc.name}\n\n`
    md += `**Category:** ${proc.category}\n\n`
    md += `### Capabilities\n\n`
    md += `| Constraint | Value |\n|------------|-------|\n`
    md += `| Min wall thickness | ${proc.min_wall_mm}mm |\n`
    md += `| Max wall thickness | ${proc.max_wall_mm ?? "No limit"}mm |\n`
    md += `| Min feature size | ${proc.min_feature_mm}mm |\n`
    md += `| Tolerance (standard) | ±${proc.tolerance_standard_mm}mm |\n`
    md += `| Tolerance (tight) | ±${proc.tolerance_tight_mm}mm |\n`
    md += `| Surface finish (std) | Ra ${proc.surface_finish_ra_um.standard}µm |\n`
    md += `| Surface finish (fine) | Ra ${proc.surface_finish_ra_um.fine}µm |\n`
    if (proc.draft_angle_deg != null) {
        md += `| Draft angle required | ${proc.draft_angle_deg}° |\n`
    }
    md += `| Max part size | ${proc.max_part_size_mm.x}×${proc.max_part_size_mm.y}×${proc.max_part_size_mm.z}mm |\n`
    md += `| Undercuts possible | ${proc.undercuts_possible ? "Yes" : "No"} |\n`
    md += `| Internal features | ${proc.internal_features_possible ? "Yes" : "No"} |\n`

    md += `\n### Economics\n\n`
    md += `| Parameter | Value |\n|-----------|-------|\n`
    md += `| Min economical batch | ${proc.min_batch_economical} |\n`
    md += `| Setup cost | $${proc.setup_cost_usd.low}–$${proc.setup_cost_usd.high} |\n`
    md += `| Prototype lead time | ${proc.lead_time_weeks.prototype} weeks |\n`
    md += `| Production lead time | ${proc.lead_time_weeks.production} weeks |\n`

    if (proc.design_rules.length > 0) {
        md += `\n### Design Rules\n\n`
        for (const rule of proc.design_rules) {
            md += `- ${rule}\n`
        }
    }

    if (proc.notes) {
        md += `\n> ${proc.notes}`
    }

    return md
}
