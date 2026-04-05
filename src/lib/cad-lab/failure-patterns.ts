/**
 * @file failure-patterns.ts — Queries past CAD generation failures from cad_lab_generation_metrics
 * and compiles them into a prompt section that steers code generation away from known pitfalls.
 *
 * INTENT: CadQuery code generation hits the same failure modes repeatedly (e.g., NameError from
 * undefined helpers, OCP_Crash from bad boolean ops). By injecting these patterns into the system
 * prompt BEFORE generation, the LLM avoids repeating the same mistakes — reducing repair loops
 * and improving first-attempt success rate.
 */

import { createAdminClient } from "@/lib/supabase/admin"

export interface FailurePattern {
  errorCategory: string
  domain: string
  occurrenceCount: number
  projectCount: number
  exampleError: string // modal_error_snippet from most recent occurrence
  wasEventuallyFixed: boolean
}

/**
 * Queries cad_lab_generation_metrics for recurring failure patterns.
 *
 * Two populations:
 * 1. "Repaired" failures: first_attempt_success=false AND success=true — we know the error AND that it was fixable
 * 2. "Permanent" failures: success=false — these are the most dangerous patterns to avoid
 *
 * @param domain - Current module's domain (electronics, mechanical, etc.)
 * @returns Failure patterns seen 2+ times, ordered by frequency DESC, max 10
 */
export async function getFailurePatterns(domain: string): Promise<FailurePattern[]> {
  // SECURITY: admin client — global metrics data (failure patterns), foundry_id not needed
  const supabase = createAdminClient()

  // DECISION: Two separate queries rather than a UNION — keeps the logic clear and lets us tag
  // wasEventuallyFixed accurately. The metrics table is small enough that two queries are fine.

  // 1. Repaired failures: failed first attempt but eventually succeeded
  const { data: repairedRows, error: repairedErr } = await supabase
    .rpc("get_failure_patterns_repaired", { target_domain: domain })

  if (repairedErr) {
    console.warn("[failure-patterns] Failed to query repaired patterns:", repairedErr.message)
  }

  // 2. Permanent failures: never succeeded
  const { data: permanentRows, error: permanentErr } = await supabase
    .rpc("get_failure_patterns_permanent", { target_domain: domain })

  if (permanentErr) {
    console.warn("[failure-patterns] Failed to query permanent patterns:", permanentErr.message)
  }

  // DECISION: If RPCs don't exist yet (migration not run), fall back to direct queries
  const patterns: FailurePattern[] = []

  if (repairedRows && repairedRows.length > 0) {
    for (const row of repairedRows) {
      patterns.push({
        errorCategory: row.error_category,
        domain: row.domain ?? domain,
        occurrenceCount: Number(row.occurrence_count),
        projectCount: Number(row.project_count),
        exampleError: row.example_error ?? "",
        wasEventuallyFixed: true,
      })
    }
  } else if (repairedErr) {
    // DECISION: RPC doesn't exist yet (migration not run) — fall back to direct table query
    const directRepaired = await queryRepairedDirect(supabase, domain)
    patterns.push(...directRepaired)
  }

  if (permanentRows && permanentRows.length > 0) {
    for (const row of permanentRows) {
      patterns.push({
        errorCategory: row.error_category,
        domain: row.domain ?? domain,
        occurrenceCount: Number(row.occurrence_count),
        projectCount: Number(row.project_count),
        exampleError: row.example_error ?? "",
        wasEventuallyFixed: false,
      })
    }
  } else if (permanentErr) {
    // DECISION: RPC doesn't exist yet — fall back to direct table query
    const directPermanent = await queryPermanentDirect(supabase, domain)
    patterns.push(...directPermanent)
  }

  // Deduplicate by error_category+domain (prefer permanent over repaired if both exist)
  const seen = new Map<string, FailurePattern>()
  for (const p of patterns) {
    const key = `${p.errorCategory}:${p.domain}`
    const existing = seen.get(key)
    if (!existing || (!p.wasEventuallyFixed && existing.wasEventuallyFixed)) {
      seen.set(key, p)
    } else if (existing && p.occurrenceCount > existing.occurrenceCount) {
      seen.set(key, { ...p, wasEventuallyFixed: existing.wasEventuallyFixed && p.wasEventuallyFixed })
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
    .slice(0, 10)
}

async function queryRepairedDirect(supabase: ReturnType<typeof createAdminClient>, domain: string): Promise<FailurePattern[]> {
  const { data, error } = await supabase
    .from("cad_lab_generation_metrics")
    .select("error_category, domain, modal_error_snippet, project_id")
    .eq("first_attempt_success", false)
    .eq("success", true)
    .not("error_category", "is", null)

  if (error || !data) return []
  return aggregateRows(data, domain, true)
}

async function queryPermanentDirect(supabase: ReturnType<typeof createAdminClient>, domain: string): Promise<FailurePattern[]> {
  const { data, error } = await supabase
    .from("cad_lab_generation_metrics")
    .select("error_category, domain, modal_error_snippet, project_id")
    .eq("success", false)
    .not("error_category", "is", null)

  if (error || !data) return []
  return aggregateRows(data, domain, false)
}

interface MetricsRow {
  error_category: string
  domain: string | null
  modal_error_snippet: string | null
  project_id: string
}

function aggregateRows(rows: MetricsRow[], domain: string, wasEventuallyFixed: boolean): FailurePattern[] {
  const groups = new Map<string, { count: number; projects: Set<string>; latestError: string }>()

  for (const row of rows) {
    const key = `${row.error_category}:${row.domain ?? "unknown"}`
    const group = groups.get(key) ?? { count: 0, projects: new Set<string>(), latestError: "" }
    group.count++
    group.projects.add(row.project_id)
    if (row.modal_error_snippet) group.latestError = row.modal_error_snippet
    groups.set(key, group)
  }

  const patterns: FailurePattern[] = []
  for (const [key, group] of groups) {
    if (group.count < 2) continue
    const [errorCategory, groupDomain] = key.split(":")
    patterns.push({
      errorCategory,
      domain: groupDomain ?? domain,
      occurrenceCount: group.count,
      projectCount: group.projects.size,
      exampleError: group.latestError,
      wasEventuallyFixed,
    })
  }

  return patterns
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
    .slice(0, 10)
}

/**
 * Compiles failure patterns into a prompt section for injection into the system prompt.
 *
 * @param patterns - Failure patterns from getFailurePatterns()
 * @param currentDomain - The current module's domain
 * @returns Formatted prompt section, or empty string if no relevant patterns
 */
export function compileFailurePatternPrompt(patterns: FailurePattern[], currentDomain: string): string {
  // Filter to: same domain OR universal patterns (5+ occurrences from any domain)
  const relevant = patterns.filter(
    p => p.domain === currentDomain || p.occurrenceCount >= 5
  )

  if (relevant.length === 0) return ""

  const lines: string[] = [
    "KNOWN FAILURE PATTERNS FROM PAST GENERATIONS (avoid these mistakes):",
    "",
  ]

  for (const p of relevant) {
    const severity = p.wasEventuallyFixed ? "COMMON PITFALL" : "FATAL — never recovered"
    const scope = p.domain === currentDomain ? "" : ` [universal, seen across ${p.domain} domain]`
    lines.push(`⚠ ${p.errorCategory} (${p.occurrenceCount}× across ${p.projectCount} projects — ${severity})${scope}`)

    if (p.exampleError) {
      // Truncate to ~200 chars for prompt efficiency
      const snippet = p.exampleError.length > 200
        ? p.exampleError.slice(0, 200) + "..."
        : p.exampleError
      lines.push(`  Example: ${snippet}`)
    }

    // INTENT: Actionable guidance per error category so the LLM knows HOW to avoid it, not just WHAT to avoid
    const guidance = getGuidanceForCategory(p.errorCategory)
    if (guidance) {
      lines.push(`  Prevention: ${guidance}`)
    }

    lines.push("")
  }

  return lines.join("\n")
}

/**
 * Maps error categories to specific prevention guidance for the LLM.
 */
function getGuidanceForCategory(category: string): string {
  switch (category) {
    case "NameError":
      return "Every function you call MUST be defined in your script or listed in the COMPONENT LIBRARY. Trace all names before outputting code."
    case "SyntaxError":
      return "Double-check parentheses, colons, and indentation. Ensure all f-strings and multi-line expressions are properly closed."
    case "TypeError":
      return "Verify argument types — especially cq.Workplane vs cq.Compound vs cq.Shape. Use .val() to extract solids when needed."
    case "ValueError":
      return "Check that numeric parameters are positive and non-zero. Wire dimensions (radius, height, thickness) must be > 0."
    case "AttributeError":
      return "Confirm the CadQuery method exists on the object type you're calling it on. Workplane and Shape have different APIs."
    case "Standard_DomainError":
      return "Geometry operations failed — likely zero-thickness walls, degenerate faces, or self-intersecting shapes. Add minimum thickness guards."
    case "OCP_Crash":
      return "The OpenCascade kernel crashed — usually from boolean ops on invalid geometry. Simplify unions, avoid co-planar faces, and use Assembly for complex models."
    case "TimeoutError":
      return "Model is too complex for the time limit. Use cq.Assembly() instead of .union() chains. Max 10 unions per sub-group."
    case "ImportError":
      return "Only import cadquery and math. Do NOT import os, sys, numpy, or any other module."
    case "MemoryError":
      return "Reduce fillet/chamfer count and avoid deeply nested boolean operations. Simplify geometry."
    case "IndentationError":
      return "Use consistent 4-space indentation. Do not mix tabs and spaces."
    case "RuntimeError_NoOutput":
      return "Script MUST produce a 'result' variable containing a cq.Workplane, cq.Assembly, or cq.Compound. Ensure the grammar template assigns its output."
    case "RuntimeError":
      return "Check for invalid geometry ops or missing output assignment. Ensure all operations produce valid solids."
    case "ValidationError":
      return "Pre-execution dimension check failed. Verify parameter scaling matches the interface definition — especially axis mapping (width=X, depth=Y, height=Z)."
    default:
      return ""
  }
}
