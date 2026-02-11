/**
 * @file xray-to-objectives.ts — Bridge from X-Ray modules to Objectives & Tasks
 *
 * @description Converts X-Ray module requirements into ForgeOS Objectives and Tasks:
 * - Each module → one Objective (e.g., "Procure & commission Intake & Pumping")
 * - Module unknowns/expert questions → Tasks under that Objective
 * - Module tests → Validation tasks
 * - Interview results → inform task descriptions
 *
 * CURRENT STATE: Stub with documented integration signatures.
 *
 * TODO: Implement real integration:
 * 1. Call createObjectiveFromSubsystem() from src/actions/objectives.ts:
 *    - title: `Build: ${module.name}`
 *    - description: module.purpose
 *    - source: 'xray' (new source type to track origin)
 * 2. For each unknown/expert question, call createTask():
 *    - title: question text
 *    - description: context from module detail
 *    - assigned_to: matched team member (from people service)
 *    - source_reference: `xray:${module.id}`
 * 3. For each test, create a validation task:
 *    - title: `Validate: ${test}`
 *    - tags: ['validation', 'xray']
 * 4. If interview is completed, enrich task descriptions with answers
 *
 * @related
 * - Objectives: src/actions/objectives.ts (createObjectiveFromSubsystem, createObjectiveFromInput)
 * - Tasks: src/actions/tasks.ts (createTask)
 * - Team assignment: src/actions/team.ts (member skills for auto-assignment)
 */

import type { XRaySpec, ModuleSpec } from "./xray-schema"

export interface ObjectiveExportResult {
  objectiveId: string
  taskIds: string[]
  moduleId: string
}

/**
 * Exports a single X-Ray module as an Objective with Tasks.
 *
 * @param module - The module to convert
 * @param spec - The parent spec (for context)
 * @param foundryId - Target foundry
 * @returns Created Objective ID and Task IDs
 *
 * @security Requires authenticated user with objective.create permission
 * @audit Logs xray_to_objective_export event
 */
export async function exportModuleToObjective(
  _module: ModuleSpec,
  _spec: XRaySpec,
  _foundryId: string
): Promise<ObjectiveExportResult> {
  // TODO: Implement real objective + task creation
  //
  // const objective = await createObjectiveFromSubsystem({
  //   title: `Build: ${module.name}`,
  //   description: `${module.purpose}\n\nKey parts: ${module.keyParts.join(', ')}\nLead time: ${module.requirements.leadWeeks} weeks`,
  //   foundry_id: foundryId,
  // })
  //
  // const taskPromises = [
  //   // Unknowns → research tasks
  //   ...module.detail.unknownsToResolve.map(unknown =>
  //     createTask({
  //       title: `Resolve: ${unknown}`,
  //       description: `From X-Ray module "${module.name}"`,
  //       objective_id: objective.id,
  //       foundry_id: foundryId,
  //     })
  //   ),
  //   // Tests → validation tasks
  //   ...module.tests.map(test =>
  //     createTask({
  //       title: `Validate: ${test}`,
  //       description: `Validation for module "${module.name}"`,
  //       objective_id: objective.id,
  //       foundry_id: foundryId,
  //       tags: ['validation', 'xray'],
  //     })
  //   ),
  // ]
  //
  // const tasks = await Promise.all(taskPromises)

  throw new Error("exportModuleToObjective is not yet implemented — stub only.")
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
  foundryId: string
): Promise<ObjectiveExportResult[]> {
  const results: ObjectiveExportResult[] = []
  for (const mod of spec.modules) {
    const result = await exportModuleToObjective(mod, spec, foundryId)
    results.push(result)
  }
  return results
}
