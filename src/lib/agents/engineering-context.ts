/**
 * @file engineering-context.ts — Engineering Reference Data context layer for specialist chat.
 *
 * INTENT: Grounds specialist advice (Fang, Jian, Max) in verified material properties,
 * process tolerances, applicable standards, and real supplier intelligence from the
 * ForgeOS engineering databases — instead of relying on generic LLM knowledge.
 *
 * Reuses three existing retrievers — no new database tables or queries.
 *
 * @related
 * - Prompt builder: src/lib/agents/prompt-builder.ts (consumer)
 * - Engineering data: src/lib/cad-lab/engineering-data-retriever.ts
 * - Standards: src/lib/cad-lab/standards-retriever.ts
 * - Technique insights: src/actions/manufacturing-techniques.ts
 */

import {
    detectMaterialFamilies,
    detectProcesses,
    retrieveEngineeringDataForPrompt,
} from "@/lib/cad-lab/engineering-data-retriever"
import { retrieveStandardsForPrompt } from "@/lib/cad-lab/standards-retriever"
import { detectIndustryDomain } from "@/lib/cad-lab/industry-domains"
import { getTechniqueInsightsByProcess } from "@/actions/manufacturing-techniques"
import { createAdminClient } from "@/lib/supabase/admin"

// ─── Relevance Gate ──────────────────────────────────────────────────────────

/** Specialists that benefit from engineering reference data */
const ENGINEERING_SPECIALISTS = new Set([
    "cto",
    "vp-engineering",
    "vp-manufacturing",
    "product-lead",
    "vp-supply-chain",
])

const STRONG_SIGNALS = /\b(aluminu?m|steel|stainless|titanium|copper|brass|bronze|polymer|plastic|abs|pla|petg|nylon|polycarbonate|peek|hdpe|delrin|carbon fiber|cfrp|fiberglass|kevlar|rubber|silicone|tpu|ceramic|cnc|milling|3d print|injection mold|injection mould|sheet metal|casting|die cast|laser cut|waterjet|sla|sls|dmls|fdm|turning|lathe|welding)\b/i

const WEAK_SIGNALS = /\b(tolerance|dfm|bom|yield|stress|fatigue|thermal|weld|surface finish|draft angle|wall thickness|iso|asme|material selection|tooling|hardness|tensile|ductil|corrosion|anodiz|galvaniz|powder coat|heat treat)\b/gi

/**
 * Determines whether the Engineering Reference Data layer should be injected.
 *
 * @param input - The user's message text
 * @param specialistId - Current specialist ID
 * @param cadLabProjectId - If set, user is in CAD Lab context (always relevant)
 * @returns true if engineering data would be useful
 */
export function isEngineeringRelevant(
    input: string,
    specialistId: string,
    cadLabProjectId?: string,
): boolean {
    // Specialist gate applies even in CAD Lab context — non-engineering
    // specialists (CFO, CMO) don't benefit from material/process data
    if (!ENGINEERING_SPECIALISTS.has(specialistId)) return false

    // CAD Lab context with engineering specialist — always inject
    if (cadLabProjectId) return true

    // Strong signal — any one keyword triggers
    if (STRONG_SIGNALS.test(input)) return true

    // Weak signals — need 2+ matches
    const weakMatches = input.match(WEAK_SIGNALS)
    if (weakMatches && weakMatches.length >= 2) return true

    return false
}

// ─── Process Name Mapping ────────────────────────────────────────────────────

/** Maps detectProcesses() keys to display names for getTechniqueInsightsByProcess() */
const PROCESS_DISPLAY_NAMES: Record<string, string> = {
    cnc_milling: "CNC Machining",
    cnc_turning: "CNC Machining",
    sheet_metal_bending: "Sheet Metal",
    laser_cutting: "Sheet Metal",
    waterjet_cutting: "Sheet Metal",
    fdm: "FDM 3D Print",
    sla: "SLA/Resin Print",
    sls: "SLS/Powder Print",
    // DECISION: dmls omitted — DMLS is metal AM, no matching technique slug exists.
    // Mapping to CNC Machining would return wrong supplier intelligence.
    injection_molding: "Injection Molding",
    die_casting: "Casting",
    investment_casting: "Casting",
    sand_casting: "Casting",
    mig_welding: "Manual/Assembly",
    tig_welding: "Manual/Assembly",
}

// ─── Layer Builder ───────────────────────────────────────────────────────────

/**
 * Builds the Engineering Reference Data context layer.
 *
 * @param input - The user's message text
 * @param foundryId - The foundry ID (for CAD Lab project queries)
 * @param specialistId - The specialist ID
 * @param cadLabProjectId - Optional CAD Lab project ID for module context
 * @returns Formatted prompt block, or empty string if no data found
 */
export async function buildEngineeringReferenceLayer(
    input: string,
    foundryId: string,
    cadLabProjectId?: string,
): Promise<string> {
    const lower = input.toLowerCase()
    let materials = detectMaterialFamilies(lower, [])
    let processes = detectProcesses(lower, [])

    // Supplement from CAD Lab project modules if available
    if (cadLabProjectId) {
        try {
            const admin = createAdminClient()
            // SECURITY: Filter by foundry_id to prevent cross-tenant data access
            const { data: project } = await admin
                .from("cad_lab_projects")
                .select("modules")
                .eq("id", cadLabProjectId)
                .eq("foundry_id", foundryId)
                .single()

            if (project?.modules && typeof project.modules === "object") {
                const modules = Object.values(project.modules as Record<string, { material?: string; mfg_process?: string }>)
                for (const mod of modules) {
                    if (mod.material) {
                        const modMaterials = detectMaterialFamilies(mod.material.toLowerCase(), [])
                        materials = [...new Set([...materials, ...modMaterials])]
                    }
                    if (mod.mfg_process) {
                        const modProcesses = detectProcesses(mod.mfg_process.toLowerCase(), [])
                        processes = [...new Set([...processes, ...modProcesses])]
                    }
                }
            }
        } catch (err) {
            console.warn("[EngineeringContext] Could not load CAD Lab project modules:", err)
        }
    }

    // No keywords detected at all — bail early
    if (materials.length === 0 && processes.length === 0) return ""

    // Run all three retrievers in parallel
    const domain = detectIndustryDomain(input)

    // Deduplicate process display names for technique insights
    const uniqueProcessNames = [...new Set(
        processes.map(p => PROCESS_DISPLAY_NAMES[p]).filter(Boolean)
    )]

    const [engResult, stdResult, ...insightResults] = await Promise.allSettled([
        retrieveEngineeringDataForPrompt(input, materials, processes),
        retrieveStandardsForPrompt(domain, input, [], materials, 1500, "summary"),
        ...uniqueProcessNames.map(name => getTechniqueInsightsByProcess(name)),
    ])

    const sections: string[] = []

    // Materials + Process Constraints from engineering data retriever
    if (engResult.status === "fulfilled" && engResult.value.content) {
        const eng = engResult.value
        if (eng.materialsCount > 0) {
            const matMatch = eng.content.match(/=== MATERIAL PROPERTIES.*?===([\s\S]*?)(?====|$)/)
            if (matMatch) {
                sections.push(`### Materials\n${matMatch[1].trim()}`)
            }
        }
        if (eng.processesCount > 0) {
            const procMatch = eng.content.match(/=== MANUFACTURING PROCESS.*?===([\s\S]*?)(?====|$)/)
            if (procMatch) {
                sections.push(`### Process Constraints\n${procMatch[1].trim()}`)
            }
        }
    }

    // Standards
    if (stdResult.status === "fulfilled" && stdResult.value.content) {
        // Truncate at newline boundary to avoid cutting mid-standard-code
        let stdContent = stdResult.value.content
        if (stdContent.length > 600) {
            const breakpoint = stdContent.lastIndexOf("\n", 600)
            stdContent = stdContent.slice(0, breakpoint > 200 ? breakpoint : 600) + "\n..."
        }
        sections.push(`### Applicable Standards\n${stdContent}`)
    }

    // Supplier intelligence from technique insights
    const insightLines: string[] = []
    for (let i = 0; i < uniqueProcessNames.length; i++) {
        const result = insightResults[i]
        if (result?.status === "fulfilled" && result.value) {
            const ins = result.value
            let line = `- **${uniqueProcessNames[i]}**: ${ins.totalSupplierCount} suppliers`
            if (ins.tolerances.typical_mm != null) {
                line += `, typical ±${ins.tolerances.typical_mm.toFixed(2)}mm`
            }
            if (ins.tips.length > 0) {
                line += `\n  Tip: "${ins.tips[0]}"`
            }
            insightLines.push(line)
        }
    }
    if (insightLines.length > 0) {
        sections.push(`### Supplier Intelligence (ForgeOS marketplace)\n${insightLines.join("\n")}`)
    }

    if (sections.length === 0) return ""

    return [
        "## Engineering Reference Data",
        "(Verified data from ForgeOS databases — use these instead of guessing properties or tolerances.)",
        "",
        ...sections,
    ].join("\n")
}
