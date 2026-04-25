/**
 * @file convergence-controller.ts — Iterative design optimization loop
 *
 * @description Orchestrates the "Generate → Analyze → Evaluate → Modify → Repeat"
 * loop. Evaluates analysis results against configurable criteria, asks AI to
 * propose parametric changes when criteria aren't met, and manages the
 * iteration lifecycle.
 *
 * Key design decisions:
 * 1. Semi-automatic: fast analyses (mass, DFM) auto-run. Changes require user approval.
 * 2. Dampening: proposed changes are scaled to 50-70% to prevent oscillation.
 * 3. Hard cap: max 10 iterations. Best result presented if not converged.
 * 4. Product-agnostic: criteria are derived from analysis results, not product type.
 *
 * @security
 * - OPENAI_API_KEY for AI-proposed design changes
 *
 * @related
 * - FEA generator: ./fea-generator.ts (structural analysis)
 * - CAD generator: ./cad-generator.ts (geometry generation)
 * - Schema: ./xray-schema.ts (SystemAnalysis, ConvergenceCriterion)
 */

import OpenAI from "openai"

import type {
  XRaySpec,
  ModuleSpec,
  SystemAnalysis,
  ConvergenceCriterion,
  IterationRecord,
  StructuralAnalysis,
  DfmAnalysis,
  MassProperties,
} from "./xray-schema"

// ─── Constants ───────────────────────────────────────────────────────

const MAX_ITERATIONS = 10
const CHANGE_DAMPENING_FACTOR = 0.6  // Apply 60% of suggested change

// ─── Types ───────────────────────────────────────────────────────────

/** A proposed parametric change to improve a failing criterion */
export interface ProposedChange {
  moduleId: string
  description: string
  parameter: string
  currentValue: string
  suggestedValue: string
  rationale: string
  severity: "critical" | "recommended" | "optional"
}

/** Result of evaluating convergence criteria */
export interface ConvergenceEvaluation {
  isConverged: boolean
  criteria: ConvergenceCriterion[]
  metCount: number
  totalCount: number
  proposedChanges: ProposedChange[]
  summary: string
}

/** Configuration for convergence criteria thresholds */
export interface ConvergenceConfig {
  minSafetyFactor: number
  maxCgOffset_mm: number
  maxDeformation_pct: number
  minFrequencySeparation_pct: number
  maxCriticalDfmIssues: number
  massTarget_kg?: number
  massTolerance_pct: number
}

// ─── Default Convergence Configuration ───────────────────────────────

const DEFAULT_CONFIG: ConvergenceConfig = {
  minSafetyFactor: 1.5,
  maxCgOffset_mm: 5.0,
  maxDeformation_pct: 1.0,     // Max 1% deformation relative to span
  minFrequencySeparation_pct: 20.0,
  maxCriticalDfmIssues: 0,
  massTolerance_pct: 10.0,
}

// ─── Convergence Evaluation ──────────────────────────────────────────

/**
 * Evaluates all convergence criteria against current analysis results.
 *
 * @description Checks each criterion against the current analysis state
 * of all modules. Returns which criteria are met/unmet and proposes
 * changes for unmet criteria via AI.
 *
 * @param spec - Current X-Ray spec with analysis results
 * @param config - Convergence threshold configuration
 * @returns Evaluation result with criteria status and proposed changes
 */
export async function evaluateConvergence(
  spec: XRaySpec,
  config: ConvergenceConfig = DEFAULT_CONFIG,
): Promise<ConvergenceEvaluation> {
  const criteria: ConvergenceCriterion[] = []
  const failingModules: Array<{ module: ModuleSpec; failedCriteria: string[] }> = []

  // Evaluate each module
  for (const xrayModule of spec.modules) {
    const analysis = xrayModule.cadModel?.analysis
    if (!analysis) continue

    const moduleFailures: string[] = []

    // Criterion 1: Structural safety factor
    if (analysis.structural?.status === "complete" && analysis.structural.safetyFactor !== undefined) {
      const sf = analysis.structural.safetyFactor
      const met = sf >= config.minSafetyFactor
      criteria.push({
        metric: `${xrayModule.name}: Safety Factor`,
        threshold: `≥ ${config.minSafetyFactor}`,
        currentValue: sf,
        targetValue: config.minSafetyFactor,
        met,
        source: "FEA",
      })
      if (!met) moduleFailures.push(`Safety factor ${sf.toFixed(2)} < ${config.minSafetyFactor}`)
    }

    // Criterion 2: Max deformation
    if (analysis.structural?.maxDeformation_mm !== undefined && analysis.massProperties?.boundingBox) {
      const bb = analysis.massProperties.boundingBox
      const span = Math.max(bb.xLen, bb.yLen, bb.zLen)
      const deformPct = span > 0 ? (analysis.structural.maxDeformation_mm / span) * 100 : 0
      const met = deformPct <= config.maxDeformation_pct
      criteria.push({
        metric: `${xrayModule.name}: Deformation`,
        threshold: `≤ ${config.maxDeformation_pct}% of span`,
        currentValue: deformPct,
        targetValue: config.maxDeformation_pct,
        met,
        source: "FEA",
      })
      if (!met) moduleFailures.push(`Deformation ${deformPct.toFixed(2)}% > ${config.maxDeformation_pct}%`)
    }

    // Criterion 3: DFM — zero critical issues
    if (analysis.dfm) {
      const criticalCount = analysis.dfm.issues.filter((i) => i.severity === "critical").length
      const met = criticalCount <= config.maxCriticalDfmIssues
      criteria.push({
        metric: `${xrayModule.name}: Critical DFM Issues`,
        threshold: `≤ ${config.maxCriticalDfmIssues}`,
        currentValue: criticalCount,
        targetValue: config.maxCriticalDfmIssues,
        met,
        source: "DFM",
      })
      if (!met) moduleFailures.push(`${criticalCount} critical DFM issue(s)`)
    }

    if (moduleFailures.length > 0) {
      failingModules.push({ module: xrayModule, failedCriteria: moduleFailures })
    }
  }

  // System-level criteria
  if (spec.systemAnalysis?.systemCenterOfGravity) {
    const cg = spec.systemAnalysis.systemCenterOfGravity
    const cgOffset = Math.sqrt(cg[0] ** 2 + cg[1] ** 2)  // Horizontal offset from origin
    const met = cgOffset <= config.maxCgOffset_mm
    criteria.push({
      metric: "System CG Offset",
      threshold: `≤ ${config.maxCgOffset_mm} mm from center`,
      currentValue: Math.round(cgOffset * 100) / 100,
      targetValue: config.maxCgOffset_mm,
      met,
      source: "Mass Properties",
    })
  }

  // Mass target (if specified)
  if (config.massTarget_kg && spec.systemAnalysis?.totalMass_kg) {
    const massDiff = Math.abs(spec.systemAnalysis.totalMass_kg - config.massTarget_kg) / config.massTarget_kg * 100
    const met = massDiff <= config.massTolerance_pct
    criteria.push({
      metric: "Total Mass vs Target",
      threshold: `Within ${config.massTolerance_pct}% of ${config.massTarget_kg} kg`,
      currentValue: spec.systemAnalysis.totalMass_kg,
      targetValue: config.massTarget_kg,
      met,
      source: "Mass Properties",
    })
  }

  const metCount = criteria.filter((c) => c.met).length
  const totalCount = criteria.length
  const isConverged = totalCount > 0 && metCount === totalCount

  // Generate proposed changes for failing criteria using AI
  let proposedChanges: ProposedChange[] = []
  if (!isConverged && failingModules.length > 0) {
    try {
      proposedChanges = await generateDesignChanges(failingModules, config)
    } catch (error) {
      console.error("[Convergence] Failed to generate design changes:", {
        error: error instanceof Error ? error.message : "Unknown",
      })
    }
  }

  const summary = isConverged
    ? `All ${totalCount} criteria met. Design is converged.`
    : `${metCount}/${totalCount} criteria met. ${failingModules.length} module(s) need attention.`

  return {
    isConverged,
    criteria,
    metCount,
    totalCount,
    proposedChanges,
    summary,
  }
}

// ─── AI Design Change Proposals ──────────────────────────────────────

const DESIGN_CHANGE_SYSTEM_PROMPT = `You are a mechanical design optimization expert. Given failing structural or DFM criteria, propose specific parametric changes to the CAD model to resolve the issues.

## Rules
1. Propose conservative changes — prefer small improvements over aggressive ones.
2. Changes should be specific and quantitative (e.g., "increase fillet radius from 3mm to 6mm").
3. Consider trade-offs (adding material fixes stress but increases mass/print time).
4. Prioritize changes by impact — fix the most critical issue first.
5. Return valid JSON array of proposed changes.

## Output Schema
[
  {
    "moduleId": "module-id",
    "description": "Increase wall thickness at arm junction",
    "parameter": "wall_thickness_mm",
    "currentValue": "2.0",
    "suggestedValue": "3.5",
    "rationale": "Von Mises stress at junction exceeds yield by 20%. Increasing wall thickness distributes load.",
    "severity": "critical"
  }
]

Return ONLY valid JSON array. No markdown fences.`

/**
 * Uses AI to propose parametric design changes for failing criteria.
 *
 * @param failingModules - Modules with unmet criteria
 * @param config - Current convergence configuration
 * @returns Array of proposed design changes
 */
async function generateDesignChanges(
  failingModules: Array<{ module: ModuleSpec; failedCriteria: string[] }>,
  config: ConvergenceConfig,
): Promise<ProposedChange[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return []

  const openai = new OpenAI({ apiKey })

  const moduleDescriptions = failingModules.map(({ module, failedCriteria }) => {
    const analysis = module.cadModel?.analysis
    return `
Module: ${module.name} (${module.id})
Purpose: ${module.purpose}
Key Parts: ${module.keyParts.join(", ")}
Failed Criteria:
${failedCriteria.map((c) => `  - ${c}`).join("\n")}
${analysis?.structural ? `Current stress: ${analysis.structural.maxVonMisesStress_MPa} MPa, Safety factor: ${analysis.structural.safetyFactor}` : ""}
${analysis?.massProperties ? `Mass: ${(analysis.massProperties.mass_kg * 1000).toFixed(1)}g, Volume: ${analysis.massProperties.volume_mm3.toFixed(0)} mm³` : ""}
${analysis?.dfm ? `DFM: ${analysis.dfm.printable ? "Printable" : "NOT printable"}, Issues: ${analysis.dfm.issues.length}` : ""}
`
  }).join("\n---\n")

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    messages: [
      { role: "system", content: DESIGN_CHANGE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `The following modules have failing engineering criteria. Propose specific parametric changes:\n\n${moduleDescriptions}`,
      },
    ],
    temperature: 0.3,
    max_completion_tokens: 2000,
  })

  const rawContent = completion.choices[0]?.message?.content
  if (!rawContent) return []

  const cleaned = rawContent
    .replace(/^```(?:json)?\n?/gm, "")
    .replace(/\n?```$/gm, "")
    .trim()

  try {
    const raw = JSON.parse(cleaned)

    // SECURITY: Schema-validate AI-returned design changes (F7)
    // Untrusted AI output — validate shape, cap array size, truncate strings
    if (!Array.isArray(raw)) return []
    const validated: ProposedChange[] = raw
      .filter((c: unknown) => {
        if (!c || typeof c !== "object") return false
        const obj = c as Record<string, unknown>
        return typeof obj.moduleId === "string" && typeof obj.parameter === "string"
      })
      .slice(0, 20)
      .map((c: Record<string, unknown>) => ({
        moduleId: String(c.moduleId).slice(0, 100),
        description: String(c.description ?? "").slice(0, 500),
        parameter: String(c.parameter).slice(0, 100),
        currentValue: String(c.currentValue ?? "").slice(0, 100),
        suggestedValue: String(c.suggestedValue ?? "").slice(0, 100),
        rationale: String(c.rationale ?? "").slice(0, 1000),
        severity: (["critical", "recommended", "optional"] as const).includes(c.severity as "critical" | "recommended" | "optional")
          ? (c.severity as "critical" | "recommended" | "optional")
          : "recommended",
      }))

    // Apply dampening: interpolate numeric values toward current by CHANGE_DAMPENING_FACTOR
    return validated.map((change) => {
      const current = parseFloat(change.currentValue)
      const suggested = parseFloat(change.suggestedValue)
      if (!isNaN(current) && !isNaN(suggested) && isFinite(current) && isFinite(suggested)) {
        const dampened = current + (suggested - current) * CHANGE_DAMPENING_FACTOR
        // Clean trailing zeros: "12.50" → "12.5", "12.00" → "12"
        const dampenedStr = parseFloat(dampened.toFixed(6)).toString()
        return {
          ...change,
          suggestedValue: dampenedStr,
          rationale: `${change.rationale} (Dampened ${CHANGE_DAMPENING_FACTOR * 100}%: ${change.suggestedValue} → ${dampenedStr})`,
        }
      }
      // AUDIT: Log non-numeric convergence values (F9)
      console.warn(`[Convergence] Non-numeric change: ${change.parameter} = "${change.currentValue}" → "${change.suggestedValue}"`)
      return change
    })
  } catch {
    console.warn("[Convergence] Failed to parse AI design changes")
    return []
  }
}

// ─── Iteration Management ────────────────────────────────────────────

/**
 * Creates a new iteration record for the convergence history.
 *
 * @param evaluation - The convergence evaluation result
 * @param changesApplied - Descriptions of changes applied in this iteration
 * @returns An IterationRecord to append to the history
 */
export function createIterationRecord(
  evaluation: ConvergenceEvaluation,
  changesApplied: string[],
): IterationRecord {
  return {
    iteration: 0,  // Caller should set the actual iteration number
    timestamp: new Date().toISOString(),
    changesApplied,
    criteriaMetCount: evaluation.metCount,
    criteriaTotalCount: evaluation.totalCount,
  }
}

/**
 * Determines the convergence status based on current state.
 *
 * @param evaluation - The convergence evaluation
 * @param iterationCount - Current iteration number
 * @returns The convergence status string
 */
export function determineConvergenceStatus(
  evaluation: ConvergenceEvaluation,
  iterationCount: number,
): "not_started" | "running" | "converged" | "max_iterations" | "needs_review" {
  if (evaluation.isConverged) return "converged"
  if (iterationCount >= MAX_ITERATIONS) return "max_iterations"
  if (evaluation.totalCount === 0) return "not_started"
  // If more than half criteria are met, it's running normally
  if (evaluation.metCount > evaluation.totalCount / 2) return "running"
  // If few criteria are met after several iterations, needs review
  if (iterationCount > 3 && evaluation.metCount < evaluation.totalCount / 2) return "needs_review"
  return "running"
}

/**
 * Updates the system analysis with convergence loop state.
 *
 * @param currentAnalysis - Current system analysis (may be undefined)
 * @param evaluation - Latest convergence evaluation
 * @param changesApplied - Changes applied in this iteration
 * @returns Updated SystemAnalysis with convergence state
 */
export function updateConvergenceState(
  currentAnalysis: SystemAnalysis | undefined,
  evaluation: ConvergenceEvaluation,
  changesApplied: string[],
): Partial<SystemAnalysis> {
  const iterationCount = (currentAnalysis?.iterationCount ?? 0) + 1
  const history = currentAnalysis?.iterationHistory ?? []

  const record = createIterationRecord(evaluation, changesApplied)
  record.iteration = iterationCount

  return {
    iterationCount,
    maxIterations: MAX_ITERATIONS,
    convergenceStatus: determineConvergenceStatus(evaluation, iterationCount),
    convergenceCriteria: evaluation.criteria,
    iterationHistory: [...history, record],
  }
}

// ─── Full Convergence Loop Step ──────────────────────────────────────

/**
 * Runs one step of the convergence loop.
 *
 * @description Evaluates criteria, proposes changes if needed, and
 * returns the evaluation + proposed changes for the UI to present
 * to the user for approval.
 *
 * This is a SINGLE STEP, not the full loop. The semi-automatic design
 * means the UI calls this, shows results, and waits for user approval
 * before triggering the next iteration.
 *
 * @param spec - Current X-Ray spec with analysis results
 * @param config - Optional convergence configuration overrides
 * @returns Convergence evaluation with proposed changes
 */
export async function runConvergenceStep(
  spec: XRaySpec,
  config?: Partial<ConvergenceConfig>,
): Promise<{
  evaluation: ConvergenceEvaluation
  updatedSystemAnalysis: Partial<SystemAnalysis>
  shouldContinue: boolean
}> {
  const fullConfig: ConvergenceConfig = { ...DEFAULT_CONFIG, ...config }
  const iterationCount = spec.systemAnalysis?.iterationCount ?? 0

  // Check iteration limit
  if (iterationCount >= MAX_ITERATIONS) {
    return {
      evaluation: {
        isConverged: false,
        criteria: spec.systemAnalysis?.convergenceCriteria ?? [],
        metCount: 0,
        totalCount: 0,
        proposedChanges: [],
        summary: `Maximum iterations (${MAX_ITERATIONS}) reached. Best result presented.`,
      },
      updatedSystemAnalysis: {
        convergenceStatus: "max_iterations",
        iterationCount,
      },
      shouldContinue: false,
    }
  }

  // Evaluate current state
  const evaluation = await evaluateConvergence(spec, fullConfig)

  // Update convergence state
  const updatedSystemAnalysis = updateConvergenceState(
    spec.systemAnalysis ?? undefined,
    evaluation,
    [],  // No changes applied yet — user must approve first
  )

  return {
    evaluation,
    updatedSystemAnalysis,
    shouldContinue: !evaluation.isConverged && iterationCount < MAX_ITERATIONS,
  }
}
