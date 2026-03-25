/**
 * @file assembler-fitness.ts — Instant client-side fitness checks for matched assemblers.
 *
 * @description Pure function that runs 4 rule-based checks against assembler matches,
 * module specs, diagnostics, and assembly notes. No API call.
 *
 * @related
 * - Assembly matching: src/actions/assembly-match.ts
 * - Assembly types: src/lib/assembly-utils.ts
 */

import type { AssemblyCompanyMatch } from "@/lib/assembly-utils"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Types ──────────────────────────────────────────────────────────

export interface AssemblerFitnessCheck {
  id: string
  severity: "critical" | "warning" | "info"
  message: string
}

export interface AssemblerFitnessResult {
  checks: AssemblerFitnessCheck[]
  hasCritical: boolean
  hasWarning: boolean
}

// ─── Main Function ──────────────────────────────────────────────────

/**
 * @description Runs instant client-side fitness checks on assembler matches.
 * @param assemblerMatches - Matched assembly companies
 * @param modules - Eligible CAD Lab modules
 * @param diagnosticAnswers - Per-module diagnostic answers
 * @param assemblyNotes - Fang's assembly notes from specialist review
 * @returns AssemblerFitnessCheck[] grouped by severity
 */
export function computeAssemblerFitness(
  assemblerMatches: AssemblyCompanyMatch[],
  modules: CadLabModule[],
  diagnosticAnswers: DiagnosticAnswers,
  assemblyNotes: Array<{ moduleName: string; note: string }>,
): AssemblerFitnessResult {
  const checks: AssemblerFitnessCheck[] = []

  if (assemblerMatches.length === 0) return { checks, hasCritical: false, hasWarning: false }

  const topAssembler = assemblerMatches[0]

  // Check 1: Missing specialties (warning)
  if ((topAssembler.missingSpecialties ?? []).length > 0) {
    const missing = topAssembler.missingSpecialties.join(", ").replace(/_/g, " ")
    checks.push({
      id: "missing-specialties",
      severity: "warning",
      message: `Top assembler (${topAssembler.name}) is missing specialties: ${missing}. Consider a multi-assembler config.`,
    })
  }

  // Check 2: Certification gaps for harsh environments (critical)
  const hasHarshEnv = modules.some((mod) => {
    const diag = diagnosticAnswers[mod.id]
    return diag?.environment?.toLowerCase().includes("outdoor") || diag?.environment?.toLowerCase().includes("harsh")
  })
  if (hasHarshEnv) {
    const certKeywords = ["iso", "iatf", "as9100", "ip67", "ip68", "mil-spec", "ul"]
    const topCerts = (topAssembler.certifications ?? []).map((c) => c.toLowerCase())
    const hasRelevantCert = topCerts.some((cert) => certKeywords.some((kw) => cert.includes(kw)))
    if (!hasRelevantCert) {
      checks.push({
        id: "cert-gap-harsh-env",
        severity: "critical",
        message: `Harsh/outdoor environment spec but ${topAssembler.name} has no relevant certifications (ISO, IP rating, MIL-SPEC). Verify environmental compliance.`,
      })
    }
  }

  // Check 3: Lead time flags (warning)
  if (topAssembler.typicalLeadDays != null && topAssembler.typicalLeadDays > 30) {
    checks.push({
      id: "lead-time-long",
      severity: "warning",
      message: `${topAssembler.name} typical lead time is ${topAssembler.typicalLeadDays} days — plan buffer for assembly stage.`,
    })
  }

  // Check 4: Assembly note process cross-reference (warning)
  if (assemblyNotes.length > 0) {
    const noteProcesses = new Set<string>()
    for (const note of assemblyNotes) {
      const lower = note.note.toLowerCase()
      if (lower.includes("solder") || lower.includes("pcba")) noteProcesses.add("pcba_assembly")
      if (lower.includes("cable") || lower.includes("harness")) noteProcesses.add("cable_harness")
      if (lower.includes("weld") || lower.includes("braze")) noteProcesses.add("welding")
    }
    if (noteProcesses.size > 0) {
      const assemblerSpecs = new Set((topAssembler.matchedSpecialties ?? []).map((s) => s.toLowerCase()))
      const unmatched = [...noteProcesses].filter((p) => !assemblerSpecs.has(p))
      if (unmatched.length > 0) {
        checks.push({
          id: "assembly-note-gap",
          severity: "warning",
          message: `Assembly notes reference ${unmatched.join(", ").replace(/_/g, " ")} but ${topAssembler.name} doesn't list these specialties.`,
        })
      }
    }
  }

  return {
    checks,
    hasCritical: checks.some((c) => c.severity === "critical"),
    hasWarning: checks.some((c) => c.severity === "warning"),
  }
}
