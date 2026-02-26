/**
 * @file checkpoint-prompt.ts — Converts specialist checkpoint feedback into
 * prompt sections for CAD generation.
 *
 * @description Extracted into a standalone lib file (not "use server") so it
 * can be imported by both client components and server actions.
 */

import type { DecompositionCheckpoint } from "@/lib/cad-lab-types"

/**
 * Builds a prompt section from specialist checkpoint feedback for a given module.
 *
 * @description Flagged modules get a strong directive to address each concern.
 * Non-flagged modules get lighter general context if any specialist expressed
 * system-level concerns. All-positive checkpoints return empty string (no bloat).
 *
 * @param checkpoints - Record of specialist checkpoints (keyed by specialist ID)
 * @param moduleId - The module being generated
 * @returns Prompt section string, or empty string if nothing to inject
 */
export function buildCheckpointPromptSection(
  checkpoints: Record<string, DecompositionCheckpoint> | null | undefined,
  moduleId: string,
): string {
  if (!checkpoints || Object.keys(checkpoints).length === 0) return ""

  const entries = Object.values(checkpoints)
  const isFlagged = entries.some((cp) => cp.flaggedModules.includes(moduleId))

  if (isFlagged) {
    // Strong directive — this module was specifically called out
    const lines = entries
      .filter((cp) => cp.flaggedModules.includes(moduleId))
      .map((cp) => {
        const suggestions = cp.suggestions.length > 0
          ? `\n   Suggestions: ${cp.suggestions.join("; ")}`
          : ""
        return `- ${cp.specialistName} (${cp.sentiment}): ${cp.summary}${suggestions}`
      })

    return `\n\n=== SPECIALIST FEEDBACK (THIS MODULE WAS FLAGGED — ADDRESS THESE CONCERNS) ===
${lines.join("\n")}
You MUST address each suggestion in your design. If a suggestion conflicts with research dimensions, prefer the research but note the trade-off.`
  }

  // Check for system-level concerns from non-positive specialists
  const concerned = entries.filter((cp) => cp.sentiment !== "positive")
  if (concerned.length === 0) return ""

  const lines = concerned.map(
    (cp) => `- ${cp.specialistName}: ${cp.summary}`,
  )

  return `\n\n=== SPECIALIST NOTES (general system-level concerns — apply where relevant) ===
${lines.join("\n")}
Consider these during your design. No action required unless directly applicable.`
}
