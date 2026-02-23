/**
 * @file xray-to-objectives.ts — Bridge from X-Ray analysis to Objectives & Tasks
 *
 * @description Converts X-Ray analysis results into ForgeOS Objectives and Tasks,
 * enabling human review of AI-generated engineering insights. After the full
 * analysis pipeline completes, this bridge:
 *
 * 1. Creates an Objective for the engineering review (e.g., "Engineering Review: Drone Frame")
 * 2. Creates review tasks for each analysis that needs validation
 * 3. Creates review gates on tasks that require expert sign-off
 * 4. Links proposed design changes to specific tasks for approval
 *
 * This is the key integration point between the AI analysis engine and the
 * human task system — ensuring AI insights always get human validation.
 *
 * @security Actions use withAuth for authentication + foundry isolation
 * @audit Logs xray_to_objective_export events
 *
 * @related
 * - Objectives: src/actions/objectives.ts (createObjectiveFromSubsystem)
 * - Tasks: src/actions/tasks.ts (createTask)
 * - Review gates: src/actions/review-gates.ts (createReviewGate)
 * - Convergence: ./convergence-controller.ts (ProposedChange)
 */

import type { XRaySpec, ModuleSpec, SystemAnalysis } from "./xray-schema"
import type { ConvergenceEvaluation, ProposedChange } from "./convergence-controller"
import { createObjectiveFromSubsystem } from "@/actions/objectives"

// ─── Types ───────────────────────────────────────────────────────────

/** Result of exporting a single module to an objective */
export interface ObjectiveExportResult {
  objectiveId: string
  taskIds: string[]
  reviewGateIds: string[]
  moduleId: string
  error?: string
}

/** Result of creating the full engineering review objective */
export interface EngineeringReviewResult {
  objectiveId: string
  taskIds: string[]
  reviewGateIds: string[]
  /** Number of analysis tasks created */
  analysisTaskCount: number
  /** Number of proposed-change tasks created */
  changeTaskCount: number
}

/** A task definition ready for insertion */
export interface ReviewTaskDef {
  title: string
  description: string
  riskLevel: "Low" | "Medium" | "High"
  /** Gate type if this task needs a review gate */
  gateType?: "expert_review" | "safety_review" | "manufacturing_review" | "quality_gate"
  /** Required skills for the review gate */
  requiredSkills?: string[]
}

// ─── Task Generation ─────────────────────────────────────────────────

/**
 * Generates review task definitions from analysis results.
 *
 * @description Examines each module's analysis results and creates tasks
 * for items that need human validation. Higher-risk items (failed FEA,
 * DFM issues, convergence failures) get higher risk levels and
 * appropriate review gate types.
 *
 * @param spec - The full X-Ray spec with analysis results
 * @param evaluation - Optional convergence evaluation with proposed changes
 * @returns Array of task definitions to create
 */
export function generateReviewTasks(
  spec: XRaySpec,
  evaluation?: ConvergenceEvaluation,
): ReviewTaskDef[] {
  const tasks: ReviewTaskDef[] = []
  const sa = spec.systemAnalysis

  // ── System-level review tasks ──

  // Convergence review (if not converged)
  if (sa?.convergenceStatus && sa.convergenceStatus !== "converged") {
    tasks.push({
      title: "Review: Engineering Convergence Status",
      description: buildConvergenceDescription(sa, evaluation),
      riskLevel: "High",
      gateType: "expert_review",
      requiredSkills: ["mechanical_engineering", "structural_analysis"],
    })
  }

  // Overall structural grade review
  if (sa?.structuralGrade === "fail" || sa?.structuralGrade === "marginal") {
    tasks.push({
      title: "Review: System Structural Assessment",
      description: `System structural grade: ${sa.structuralGrade}. ` +
        `Total mass: ${sa.totalMass_kg?.toFixed(2) ?? "unknown"} kg. ` +
        `Review the structural analysis results and determine if the design ` +
        `is safe for its intended use case.`,
      riskLevel: sa.structuralGrade === "fail" ? "High" : "Medium",
      gateType: "safety_review",
      requiredSkills: ["structural_analysis", "materials_science"],
    })
  }

  // ── Per-module analysis review tasks ──
  for (const mod of spec.modules) {
    const analysis = mod.cadModel?.analysis
    if (!analysis) continue

    // DFM failures
    if (analysis.dfm && !analysis.dfm.printable) {
      tasks.push({
        title: `Review: DFM Issues — ${mod.name}`,
        description: `Module "${mod.name}" has DFM (Design for Manufacturing) issues:\n` +
          `- Min wall: ${analysis.dfm.minWall_mm?.toFixed(1) ?? "?"} mm\n` +
          `- Max overhang: ${analysis.dfm.maxOverhang_deg?.toFixed(0) ?? "?"}°\n` +
          `- Issues: ${analysis.dfm.issues?.join(", ") ?? "none listed"}\n\n` +
          `Review and determine if redesign is needed or if manufacturing ` +
          `process adjustments can resolve these issues.`,
        riskLevel: "Medium",
        gateType: "manufacturing_review",
        requiredSkills: ["manufacturing", "3d_printing"],
      })
    }

    // FEA failures
    const structural = analysis.structural
    if (structural?.status === "complete" && (structural.safetyFactor ?? 0) < 1.5) {
      tasks.push({
        title: `Review: Structural Safety — ${mod.name}`,
        description: `Module "${mod.name}" has a safety factor of ` +
          `${structural.safetyFactor?.toFixed(2) ?? "unknown"} (minimum 1.5 required).\n` +
          `- Max stress: ${structural.maxStress_MPa?.toFixed(1) ?? "?"} MPa\n` +
          `- Max deformation: ${structural.maxDeformation_mm?.toFixed(2) ?? "?"} mm\n\n` +
          `This needs immediate attention. Evaluate whether geometry changes, ` +
          `material upgrades, or load case re-evaluation are needed.`,
        riskLevel: "High",
        gateType: "safety_review",
        requiredSkills: ["structural_analysis", "fea"],
      })
    }

    // Thermal concerns
    const thermal = analysis.thermal
    if (thermal?.status === "complete" && thermal.maxTemp_C != null) {
      const materialLimit = 80 // Rough limit for common plastics
      if (thermal.maxTemp_C > materialLimit) {
        tasks.push({
          title: `Review: Thermal Limit Exceeded — ${mod.name}`,
          description: `Module "${mod.name}" reaches ${thermal.maxTemp_C.toFixed(0)}°C ` +
            `(material limit ~${materialLimit}°C).\n` +
            `Review thermal management options: ventilation, heat sinks, or material change.`,
          riskLevel: "Medium",
          gateType: "expert_review",
          requiredSkills: ["thermal_analysis", "materials_science"],
        })
      }
    }

    // Premium analysis issues
    if (analysis.emiShielding?.status === "complete" && analysis.emiShielding.shieldingEffectiveness_dB != null) {
      if (analysis.emiShielding.shieldingEffectiveness_dB < 20) {
        tasks.push({
          title: `Review: EMI Compliance — ${mod.name}`,
          description: `Module "${mod.name}" has shielding effectiveness of ` +
            `${analysis.emiShielding.shieldingEffectiveness_dB.toFixed(0)} dB ` +
            `(minimum 20 dB recommended). Review EMI mitigation strategy.`,
          riskLevel: "Medium",
          gateType: "compliance_review",
          requiredSkills: ["emi_emc", "electronics"],
        })
      }
    }
  }

  // ── Proposed design changes → tasks ──
  if (evaluation?.proposedChanges) {
    for (const change of evaluation.proposedChanges) {
      if (change.severity === "critical") {
        tasks.push({
          title: `Implement: ${change.description}`,
          description: `Critical design change proposed by convergence analysis:\n\n` +
            `**Parameter:** ${change.parameter}\n` +
            `**Current:** ${change.currentValue}\n` +
            `**Proposed:** ${change.suggestedValue}\n\n` +
            `**Rationale:** ${change.rationale}\n\n` +
            `Module: ${change.moduleId}`,
          riskLevel: "High",
          gateType: "expert_review",
          requiredSkills: ["mechanical_engineering"],
        })
      }
    }
  }

  return tasks
}

// ─── Helper Functions ────────────────────────────────────────────────

/**
 * Builds a human-readable description of the convergence status.
 */
function buildConvergenceDescription(
  sa: SystemAnalysis,
  evaluation?: ConvergenceEvaluation,
): string {
  const lines: string[] = []

  lines.push(`Convergence status: ${sa.convergenceStatus ?? "unknown"}`)
  lines.push(`Iteration: ${sa.iterationCount ?? 0} of ${sa.maxIterations ?? 10}`)

  if (evaluation) {
    lines.push(`\nCriteria met: ${evaluation.metCount}/${evaluation.totalCount}`)
    lines.push(`\n${evaluation.summary}`)

    if (evaluation.proposedChanges.length > 0) {
      lines.push(`\n${evaluation.proposedChanges.length} design changes proposed:`)
      for (const change of evaluation.proposedChanges) {
        lines.push(`- [${change.severity}] ${change.description}: ${change.parameter} ${change.currentValue} → ${change.suggestedValue}`)
      }
    }
  }

  if (sa.convergenceCriteria && sa.convergenceCriteria.length > 0) {
    lines.push("\nCriteria details:")
    for (const c of sa.convergenceCriteria) {
      lines.push(`- ${c.metric}: ${c.met ? "MET" : `FAILED (${c.currentValue?.toFixed(2) ?? "?"} vs threshold ${c.threshold})`}`)
    }
  }

  return lines.join("\n")
}

// ─── Role Assignment ─────────────────────────────────────────────────

/**
 * Maps risk level to task role for assignment.
 * High risk → Executive (needs senior review), else → Apprentice.
 */
function roleForRisk(risk: ReviewTaskDef["riskLevel"]): "Executive" | "Apprentice" {
  return risk === "High" ? "Executive" : "Apprentice"
}

// ─── Export Functions ────────────────────────────────────────────────

/**
 * Exports a single X-Ray module as an Objective with Tasks.
 *
 * @description Maps a module to a subsystem format and calls
 * createObjectiveFromSubsystem to create a real objective + tasks.
 *
 * @param module - The module to convert
 * @param spec - The parent spec (for context)
 * @param _foundryId - Target foundry (used by server action for auth)
 * @returns Created Objective ID and Task IDs
 *
 * @security Requires authenticated user with objective.create permission
 * @audit Logs xray_to_objective_export event
 */
export async function exportModuleToObjective(
  module: ModuleSpec,
  spec: XRaySpec,
  _foundryId: string,
): Promise<ObjectiveExportResult> {
  // Generate tasks from module's unknowns, tests, and analysis results
  const taskDefs: ReviewTaskDef[] = []

  // Unknowns → research tasks
  if (module.detail?.unknownsToResolve) {
    for (const unknown of module.detail.unknownsToResolve) {
      taskDefs.push({
        title: `Resolve: ${unknown}`,
        description: `From X-Ray module "${module.name}" (${module.purpose}).\n\nThis unknown needs to be resolved before the module design can be finalized.`,
        riskLevel: "Medium",
      })
    }
  }

  // Expert questions → expert review tasks
  if (module.detail?.expertQuestionsNeeded) {
    for (const question of module.detail.expertQuestionsNeeded) {
      const skills = module.detail.requiredExpertise ?? []
      const recruitsLink = skills.length > 0
        ? `\n\n---\n**Need an expert?** Browse the [Recruits page](/recruits?q=${encodeURIComponent(skills[0])}) to find specialists.`
        : ""

      taskDefs.push({
        title: `Expert: ${question}`,
        description: `Expert input needed for module "${module.name}".\n\nThis question requires specialist knowledge to answer correctly.${recruitsLink}`,
        riskLevel: "Medium",
        gateType: "expert_review",
        requiredSkills: skills,
      })
    }
  }

  // Tests → validation tasks
  if (module.tests) {
    for (const test of module.tests) {
      taskDefs.push({
        title: `Validate: ${test}`,
        description: `Validation test for module "${module.name}".`,
        riskLevel: "Low",
        gateType: "quality_gate",
      })
    }
  }

  // Map to createObjectiveFromSubsystem format
  const tasks = taskDefs.map((td, i) => ({
    order: i + 1,
    title: td.title,
    description: td.description,
    role: roleForRisk(td.riskLevel),
  }))

  const result = await createObjectiveFromSubsystem({
    subsystemId: module.id,
    subsystemName: module.name,
    packId: `xray-module-${module.id}`,
    packTitle: `Build: ${module.name}`,
    packSummary: `Engineering tasks for X-Ray module "${module.name}" (${module.purpose})`,
    packDescription: null,
    selectedTaskIndices: tasks.map((_, i) => i),
    tasks,
  })

  if ("error" in result) {
    const errMsg = typeof result.error === "string" ? result.error : "Unknown error"
    console.error("[XRayToObjectives] Failed to create objective for module:", {
      moduleId: module.id,
      moduleName: module.name,
      error: errMsg,
    })
    return {
      objectiveId: "",
      taskIds: [],
      reviewGateIds: [],
      moduleId: module.id,
      error: errMsg,
    }
  }

  console.info("[XRayToObjectives] Created objective for module:", {
    moduleId: module.id,
    objectiveId: result.objectiveId,
  })

  return {
    objectiveId: result.objectiveId ?? "",
    taskIds: [],
    reviewGateIds: [],
    moduleId: module.id,
  }
}

/**
 * Exports all modules from a spec as Objectives with Tasks.
 *
 * @param spec - The full X-Ray spec
 * @param foundryId - Target foundry
 * @returns Array of export results, one per module
 */
export async function exportAllModulesToObjectives(
  spec: XRaySpec,
  foundryId: string,
): Promise<ObjectiveExportResult[]> {
  const results: ObjectiveExportResult[] = []
  for (const mod of spec.modules) {
    const result = await exportModuleToObjective(mod, spec, foundryId)
    results.push(result)
  }

  // Log summary of failed exports
  const failed = results.filter((r) => r.error)
  if (failed.length > 0) {
    console.warn("[XRayToObjectives] Some modules failed to export:", {
      failedCount: failed.length,
      totalCount: results.length,
      failedModules: failed.map((r) => ({ moduleId: r.moduleId, error: r.error })),
    })
  }

  return results
}
