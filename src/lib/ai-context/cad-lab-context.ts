/**
 * @file cad-lab-context.ts — Builds rich context for specialist reviews of CAD Lab modules.
 *
 * @description When a specialist reviews a CAD Lab module, they need to see the full
 * engineering picture: the research report, design brief, diagnostics, DFM results,
 * geometry dimensions, and material/process choices. This module assembles that
 * context into a structured markdown string that gets injected into the specialist's
 * system prompt.
 *
 * @related
 * - Review actions: src/actions/cad-lab-reviews.ts (consumer)
 * - Module types: src/lib/cad-lab-types.ts
 * - Engineering data: src/lib/engineering-data/
 */

import type { CadLabModule, CadLabDesignBrief, CadLabResearchResult } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"

// ─── Review Prompt Builders ─────────────────────────────────────────

/**
 * Review focus areas per specialist role.
 * Tells each specialist what to evaluate and what tools to use.
 */
const REVIEW_FOCUS: Record<string, string> = {
    "vp-manufacturing": `## Your Review Focus: Manufacturability (DFM)
You are reviewing this module for **manufacturability**. Evaluate:
1. **Wall thickness** — Is it adequate for the selected process? Check against process minimums.
2. **Draft angles** — Are they sufficient for the tooling method?
3. **Undercuts & internal features** — Can the process handle these without special tooling?
4. **Feature sizes** — Are the smallest features above the process minimum?
5. **Material-process compatibility** — Does the chosen material work with the chosen process?
6. **Surface finish** — Can the process achieve the required finish?
7. **Support structures** — For additive: is the design optimised to minimise supports?

Use \`lookup_material\` and \`lookup_process\` to verify real constraints.
Use \`calculate_tolerance_stack\` if there are mating interfaces.`,

    "vp-engineering": `## Your Review Focus: Engineering Soundness
You are reviewing this module for **structural and engineering adequacy**. Evaluate:
1. **Structural integrity** — Will the part withstand expected loads? Use \`calculate_stress\` for critical sections.
2. **Thermal management** — If the module generates or transfers heat, use \`calculate_thermal\`.
3. **Tolerance feasibility** — Are the specified tolerances achievable with the selected process?
4. **Fastener sizing** — If bolted joints exist, verify with \`calculate_fastener\`.
5. **Material selection** — Is the material appropriate for the operating environment?
6. **Safety factors** — Are safety margins adequate for the application?

Use \`lookup_material\` for real property data. Never guess material properties.`,

    cto: `## Your Review Focus: System Integration
You are reviewing this module for **system-level integration**. Evaluate:
1. **Module interfaces** — Do the inputs/outputs connect properly to adjacent modules?
2. **Dimensional compatibility** — Do mating dimensions and mounting patterns align?
3. **Mass & power budget** — Does this module's mass/power fit the system allocation?
4. **Tolerance stack-up** — Use \`calculate_tolerance_stack\` for multi-part assemblies.
5. **Redundancy & failure modes** — Are the identified failure modes addressed?
6. **Standardisation** — Are standard parts used where possible?`,

    "vp-supply-chain": `## Your Review Focus: Supply Chain Viability
You are reviewing this module for **procurement and supply chain feasibility**. Evaluate:
1. **Material availability** — Is the chosen material readily sourced? Check lead times.
2. **Process availability** — Are qualified suppliers available for this process?
3. **Tolerance cost impact** — Tighter tolerances = higher cost. Use \`calculate_tolerance_stack\` to check if tolerances can be relaxed.
4. **Batch economics** — Does the batch size justify the chosen process?
5. **Lead time risk** — Are there long-lead items that need early ordering?
6. **Second-source options** — Can the part be made by multiple suppliers?

Use \`lookup_material\` and \`lookup_process\` for real data.`,
}

// ─── Context Building ───────────────────────────────────────────────

export interface CadLabReviewContext {
    /** The specific module being reviewed */
    module: CadLabModule
    /** All modules in the project (for system-level context) */
    allModules: CadLabModule[]
    /** Research report text */
    researchReport?: string
    /** Design brief from diagnostics */
    designBrief?: CadLabDesignBrief
    /** Diagnostic answers for this module */
    diagnosticAnswers?: DiagnosticAnswers[string]
    /** Project subject (what they're building) */
    projectSubject: string
}

/**
 * Builds the full context string for a specialist reviewing a CAD Lab module.
 *
 * @param ctx - Module + project context
 * @param specialistId - Which specialist is reviewing
 * @returns Markdown context string for injection into the specialist system prompt
 */
export function buildCadLabReviewContext(
    ctx: CadLabReviewContext,
    specialistId: string,
): string {
    const sections: string[] = []

    // 1. Project overview
    sections.push(`# CAD Lab Design Review — ${ctx.projectSubject}`)

    // 2. Module being reviewed
    const mod = ctx.module
    sections.push(`## Module Under Review: ${mod.name}
- **Purpose:** ${mod.purpose}
- **Status:** ${mod.status}
- **Lead time:** ${mod.leadWeeks} weeks
- **Key parts:** ${mod.keyParts.join(", ")}
- **Inputs:** ${mod.inputs.join(", ")}
- **Outputs:** ${mod.outputs.join(", ")}`)

    if (mod.description) {
        sections.push(`### Description\n${mod.description}`)
    }

    // 3. Geometry & results (if generated)
    if (mod.result) {
        const r = mod.result
        const geometryLines: string[] = ["### Geometry & Properties"]

        if (r.bbox) {
            geometryLines.push(`- **Bounding box:** ${r.bbox.xLen.toFixed(1)} × ${r.bbox.yLen.toFixed(1)} × ${r.bbox.zLen.toFixed(1)} mm`)
        }
        if (r.massGrams) {
            geometryLines.push(`- **Mass:** ${r.massGrams.toFixed(1)} g`)
        }
        if (r.volumeMm3) {
            geometryLines.push(`- **Volume:** ${r.volumeMm3.toFixed(1)} mm³`)
        }
        if (r.fillRatio) {
            geometryLines.push(`- **Fill ratio:** ${r.fillRatio.toFixed(1)}%`)
        }
        if (r.massProperties) {
            const mp = r.massProperties
            geometryLines.push(`- **Surface area:** ${mp.surfaceAreaMm2.toFixed(0)} mm²`)
            geometryLines.push(`- **Density used:** ${mp.materialDensityKgM3} kg/m³`)
            geometryLines.push(`- **Center of gravity:** (${mp.centerOfGravity.map(v => v.toFixed(1)).join(", ")}) mm`)
        }

        sections.push(geometryLines.join("\n"))

        // DFM results
        if (r.dfm) {
            const dfm = r.dfm
            const dfmLines: string[] = ["### Existing DFM Analysis"]
            dfmLines.push(`- **Printable (FDM):** ${dfm.printable ? "Yes" : "No"}`)
            dfmLines.push(`- **Est. print time:** ${dfm.estimatedPrintTimeMin} min`)
            dfmLines.push(`- **Est. material:** ${dfm.estimatedMaterialG} g`)
            dfmLines.push(`- **Support volume:** ${dfm.supportVolumePct}%`)
            if (dfm.issues.length > 0) {
                dfmLines.push("\n**DFM Issues:**")
                for (const issue of dfm.issues) {
                    dfmLines.push(`- [${issue.severity.toUpperCase()}] ${issue.category}: ${issue.message}`)
                }
            }
            sections.push(dfmLines.join("\n"))
        }

        // Validation warnings
        if (r.validationWarnings && r.validationWarnings.length > 0) {
            sections.push("### Validation Warnings\n" + r.validationWarnings.map(w => `- ${w}`).join("\n"))
        }

        // Assumptions
        if (r.assumptions && r.assumptions.length > 0) {
            sections.push("### AI Assumptions\n" + r.assumptions.map(a => `- ${a}`).join("\n"))
        }
    }

    // 4. Interface definition (engineering plan)
    if (mod.interfaceDefinition) {
        sections.push(`### Interface Definition (Engineering Plan)\n${mod.interfaceDefinition}`)
    }

    // 5. Design brief
    if (ctx.designBrief) {
        const db = ctx.designBrief
        sections.push(`### Design Brief
- **Use case:** ${db.useCase}
- **Target process:** ${db.targetProcess}
- **Target material:** ${db.targetMaterial}
- **Tolerance target:** ${db.toleranceTarget}
- **Quantity target:** ${db.quantityTarget}
- **Compliance notes:** ${db.complianceNotes || "None"}`)
    }

    // 6. Diagnostic answers for this module
    if (ctx.diagnosticAnswers) {
        const diagLines: string[] = ["### Manufacturing Diagnostics"]
        for (const [key, value] of Object.entries(ctx.diagnosticAnswers)) {
            if (value) diagLines.push(`- **${key}:** ${value}`)
        }
        if (diagLines.length > 1) sections.push(diagLines.join("\n"))
    }

    // 7. System context (other modules) — brief summary for integration reviews
    if (ctx.allModules.length > 1) {
        const others = ctx.allModules.filter(m => m.id !== mod.id)
        const otherLines: string[] = ["### Other Modules in System"]
        for (const other of others) {
            const bboxStr = other.result?.bbox
                ? ` (${other.result.bbox.xLen.toFixed(0)}×${other.result.bbox.yLen.toFixed(0)}×${other.result.bbox.zLen.toFixed(0)} mm)`
                : ""
            otherLines.push(`- **${other.name}:** ${other.purpose}${bboxStr}`)
        }
        sections.push(otherLines.join("\n"))
    }

    // 8. Failure modes & unknowns
    if (mod.failureModes.length > 0) {
        sections.push("### Known Failure Modes\n" + mod.failureModes.map(f => `- ${f}`).join("\n"))
    }
    if (mod.unknowns.length > 0) {
        sections.push("### Open Questions\n" + mod.unknowns.map(u => `- ${u}`).join("\n"))
    }

    // 9. Specialist-specific review focus
    const focus = REVIEW_FOCUS[specialistId]
    if (focus) {
        sections.push(focus)
    }

    // 10. Response format
    sections.push(`## Required Response Format
You MUST structure your review as follows. Use these exact headers:

### VERDICT: [PASS / WARN / FAIL]
One-sentence summary of your overall assessment.

### Issues Found
For each issue:
- **[CRITICAL/WARNING/INFO] Category:** Description of the issue
  - *Suggestion:* How to fix it

### Recommendations
Numbered list of actionable recommendations.

### Calculations Performed
For each tool you called, briefly note:
- Tool name → what you checked → key result

If you have no issues, say "No issues found" under Issues Found.`)

    return sections.join("\n\n")
}
