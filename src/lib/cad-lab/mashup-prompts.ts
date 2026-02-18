/**
 * @file mashup-prompts.ts — Prompts for mashup planning and CadQuery code generation.
 *
 * @description Defines system/user prompts for:
 * 1. Mashup planning: Claude returns a structured plan (strategy, steps, positions).
 * 2. Mashup code generation: Claude generates CadQuery that imports STEPs and combines them.
 */

import type { MashupPlan } from "@/lib/cad-lab-types"

/** Source description for the planning prompt */
export interface MashupSourceInfo {
  name: string
  description?: string
  bounding_box?: { xLen: number; yLen: number; zLen: number }
}

/**
 * Builds the system prompt for mashup planning.
 * Claude returns a JSON MashupPlan.
 */
export function getMashupPlanningSystemPrompt(): string {
  return `You are an expert CAD mashup planner. Given 2+ source products (with names and optional bounding boxes) and a user's mashup concept, you produce a structured plan that a code generator will use to write CadQuery Python code.

OUTPUT FORMAT: Respond with a single JSON object (no markdown, no code fence). The object must have:
- "strategy": one of "embed", "attach", "morph", "stack", "integrate", "hybrid_shell"
- "steps": array of step objects, each with "source" (source name), "action" (one of "keep", "cut", "position", "orient", "union", "subtract", "add_adapter"), optional "detail", "position_mm" [x,y,z], "rotation_deg" [rx,ry,rz]
- "adapter_geometry": optional string describing any new geometry to add (e.g. "rectangular slot 80x20mm for radio controls")
- "notes": optional string with assumptions or caveats

STRATEGIES:
- embed: Place one product inside another's cavity (e.g. radio inside toaster).
- attach: Mount one product onto another's surface (e.g. drone props on RC car roof).
- morph: Blend exterior shapes of two products.
- stack: Combine vertically or horizontally (e.g. toaster on radio base).
- integrate: Merge subsystems (e.g. RC drive + drone flight controller housing).
- hybrid_shell: Keep one product's shell, fill with another's internals.

RULES:
- Use source names exactly as provided (they become filenames: <name>.step).
- Prefer simple positions and rotations; origin is at model center unless you specify otherwise.
- If bounding boxes are provided, use them to suggest sensible positions (e.g. stack by height).
- Keep the plan concise; the code generator will implement it in CadQuery.`
}

/**
 * Builds the user prompt for mashup planning.
 */
export function getMashupPlanningUserPrompt(
  sourceInfos: MashupSourceInfo[],
  concept: string,
): string {
  const sourcesText = sourceInfos
    .map(
      (s) =>
        `- ${s.name}${s.description ? `: ${s.description}` : ""}${s.bounding_box ? ` [bbox: ${s.bounding_box.xLen}×${s.bounding_box.yLen}×${s.bounding_box.zLen} mm]` : ""}`,
    )
    .join("\n")

  return `SOURCES:
${sourcesText}

MASHUP CONCEPT:
${concept}

Produce the JSON plan object only (no other text).`
}

/**
 * Builds the system prompt for mashup CadQuery code generation.
 * Code must use SOURCE_DIR and cq.importers.importStep().
 */
export function getMashupCodeGenSystemPrompt(sourceNames: string[]): string {
  const namesList = sourceNames.map((n) => `"${n}"`).join(", ")

  return `You are generating CadQuery Python code that combines existing STEP files into a single mashup model.

ENVIRONMENT:
- A variable SOURCE_DIR is already set (path to a directory containing the source STEP files).
- Source filenames are: ${namesList}. Each file is at SOURCE_DIR + "/" + name + ".step"
- Load a source with: cq.importers.importStep(SOURCE_DIR + "/<name>.step") which returns a cq.Workplane.
- You may translate/rotate with .translate((x,y,z)) and .rotate(axis, angle_deg). For Workplane, get the shape with .val() if you need to pass to cq.Workplane("XY").newObject([shape]).
- Combine with .union() or .cut() as needed. The final variable MUST be named "result" and be a cq.Workplane.
- Do NOT use open(), os, or file paths other than SOURCE_DIR. Do NOT export or print.
- Output ONLY Python code inside a \`\`\`python code fence. No explanations.`
}

/**
 * Builds the user prompt for mashup code generation.
 */
export function getMashupCodeGenUserPrompt(plan: MashupPlan, sourceNames: string[]): string {
  const planJson = JSON.stringify(plan, null, 2)

  return `MASHUP PLAN (JSON):
${planJson}

SOURCE NAMES (use these exact names for filenames): ${sourceNames.join(", ")}

Implement the plan in CadQuery:
1. Import each source with cq.importers.importStep(SOURCE_DIR + "/<name>.step")
2. Apply the positions and rotations from the plan
3. Apply any cuts or unions
4. If adapter_geometry is specified, create that geometry with cq.Workplane primitives and combine
5. Assign the final combined model to "result" (a cq.Workplane)

Output only the Python code.`
}
