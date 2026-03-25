/**
 * @file recommend-specialist.ts — Recommends the best specialist reviewer per module.
 *
 * @description Keyword-scores each specialist against the module's text (name, purpose,
 * description, key parts) and diagnostic answers to produce a ranked list. The UI uses
 * the top pick as the primary CTA and shows the rest in a secondary expandable section.
 *
 * @related
 * - Panel: src/components/cad/specialist-review-panel.tsx
 * - Types: src/lib/cad-lab-types.ts (CadLabModule)
 * - Diagnostics: src/components/cad/cad-lab-diagnostics.tsx (DiagnosticAnswers)
 */

import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"

// ─── Specialist Scoring Config ──────────────────────────────────────

interface SpecialistKeywords {
  /** Specialist ID matching REVIEW_SPECIALISTS in specialist-review-panel */
  id: string
  /** Keywords to match in module text (case-insensitive) */
  textKeywords: string[]
  /** Diagnostic answer values that boost this specialist's score */
  diagnosticBoosts: { questionId: string; values: string[] }[]
}

const SPECIALIST_SCORING: SpecialistKeywords[] = [
  {
    id: "vp-manufacturing",
    textKeywords: [
      "wall thickness", "mold", "cnc", "injection", "machining", "mill",
      "lathe", "tolerance", "surface finish", "deburr", "draft angle",
      "undercut", "parting line", "tooling", "fixture", "jig",
    ],
    diagnosticBoosts: [
      { questionId: "tolerance", values: ["Tight ±0.05mm", "Ultra-tight ±0.01mm"] },
      { questionId: "mfg_process", values: ["CNC", "Injection Molding", "Casting", "Sheet Metal"] },
      { questionId: "finish", values: ["Anodized", "Polished", "Plated"] },
    ],
  },
  {
    id: "vp-engineering",
    textKeywords: [
      "stress", "load", "thermal", "motor", "bearing", "fatigue", "vibration",
      "strain", "fea", "simulation", "heat", "pressure", "force", "torque",
      "deflection", "resonance", "damping", "seal", "safety factor",
      "yield", "tensile", "creep", "corrosion", "certification", "iso",
      "asme", "structural", "analysis", "test", "compliance",
    ],
    diagnosticBoosts: [
      { questionId: "environment", values: ["High temperature", "Outdoor harsh", "Corrosive", "Space/Vacuum"] },
      { questionId: "material", values: ["Titanium", "Stainless", "Carbon Fiber"] },
    ],
  },
  {
    id: "cto",
    textKeywords: [
      "interface", "system", "connector", "protocol", "integration", "bus",
      "api", "communication", "module", "assembly", "wiring", "harness",
      "signal", "interop", "compatibility",
    ],
    diagnosticBoosts: [
      { questionId: "batch_size", values: ["Prototype 1–5"] },
    ],
  },
  {
    id: "vp-supply-chain",
    textKeywords: [
      "supplier", "lead time", "cost", "procurement", "vendor", "moq",
      "sourcing", "shipping", "inventory", "logistics", "quote", "rfq",
      "budget", "unit cost",
    ],
    diagnosticBoosts: [
      { questionId: "batch_size", values: ["Production 500+", "Mass 10k+"] },
      { questionId: "material", values: ["Titanium", "Copper/Brass"] },
    ],
  },
]

// ─── Public API ─────────────────────────────────────────────────────

export interface SpecialistRanking {
  id: string
  score: number
  /** Keywords that matched, for display as a reason line */
  matchedKeywords: string[]
}

/**
 * Score and rank specialists for a given module.
 *
 * @param mod - The module to score against
 * @param diagnosticAnswers - All diagnostic answers (keyed by module ID)
 * @returns Ranked list of specialists, best first. Ties broken by Fang (manufacturing).
 */
export function recommendSpecialist(
  mod: CadLabModule,
  diagnosticAnswers: DiagnosticAnswers,
): SpecialistRanking[] {
  // Build a single searchable string from module text
  const corpus = [
    mod.name,
    mod.purpose,
    mod.description,
    ...mod.keyParts,
    ...(mod.failureModes ?? []),
    ...(mod.unknowns ?? []),
  ]
    .join(" ")
    .toLowerCase()

  const modAnswers = diagnosticAnswers[mod.id] ?? {}

  const rankings: SpecialistRanking[] = SPECIALIST_SCORING.map((spec) => {
    let score = 0
    const matchedKeywords: string[] = []

    // Text keyword scoring: +1 per match
    for (const kw of spec.textKeywords) {
      if (corpus.includes(kw)) {
        score += 1
        matchedKeywords.push(kw)
      }
    }

    // Diagnostic answer boosts: +2 per matching diagnostic value
    for (const boost of spec.diagnosticBoosts) {
      const answer = modAnswers[boost.questionId]
      if (answer && boost.values.includes(answer)) {
        score += 2
        matchedKeywords.push(answer)
      }
    }

    return { id: spec.id, score, matchedKeywords }
  })

  // DECISION: Fang (VP Manufacturing) owns the Specify stage. She is the default
  // reviewer for ALL hardware modules — DFM, tolerances, materials, assembly notes.
  // Give Fang a +10 baseline so she always wins unless another specialist has
  // overwhelmingly strong keyword matches. Users can still override manually.
  const fangBonus = rankings.find(r => r.id === "vp-manufacturing")
  if (fangBonus) fangBonus.score += 10

  // Sort descending by score. Tiebreak: Fang first.
  const tiebreakOrder = ["vp-manufacturing", "cto", "vp-supply-chain", "vp-engineering"]
  rankings.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return tiebreakOrder.indexOf(a.id) - tiebreakOrder.indexOf(b.id)
  })

  return rankings
}
