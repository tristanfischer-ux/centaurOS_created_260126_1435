/**
 * @file cad-lab-people.tsx — Expert discipline matching for The Forge.
 *
 * @description Derives required engineering disciplines from module data
 * (key parts, failure modes, manufacturing process) and shows which
 * experts are needed per module. Disciplines include mechanical,
 * materials, manufacturing, controls, structural, and thermal.
 *
 * @component
 *
 * @example
 * <CadLabPeople modules={modules} diagnosticAnswers={diagnosticAnswers} />
 */

"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Users,
  Box,
  Wrench,
  Cpu,
  FlaskConical,
  Shield,
  Thermometer,
  Zap,
  HardHat,
  Search,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"

// ─── Discipline Definitions ─────────────────────────────────────────

interface Discipline {
  /** Unique discipline id */
  id: string
  /** Human-readable name */
  name: string
  /** Short description */
  description: string
  /** Icon component */
  icon: React.ComponentType<{ className?: string }>
  /** Keywords that trigger this discipline */
  keywords: string[]
  /** Diagnostic answers that trigger this discipline */
  diagnosticTriggers?: { questionId: string; answers: string[] }[]
}

const DISCIPLINES: Discipline[] = [
  {
    id: "mechanical",
    name: "Mechanical Engineer",
    description: "Structural design, mechanisms, tolerances, assemblies",
    icon: Wrench,
    keywords: [
      "bearing", "shaft", "gear", "mechanism", "joint", "hinge",
      "actuator", "linkage", "spring", "cam", "bracket", "mount",
      "assembly", "fastener", "bolt", "screw",
    ],
  },
  {
    id: "materials",
    name: "Materials Scientist",
    description: "Material selection, properties, compatibility, testing",
    icon: FlaskConical,
    keywords: [
      "composite", "alloy", "polymer", "ceramic", "fatigue",
      "corrosion", "creep", "yield", "tensile", "hardness",
      "carbon fiber", "titanium", "stainless",
    ],
    diagnosticTriggers: [
      { questionId: "material", answers: ["Carbon Fiber", "Titanium", "Stainless Steel"] },
      { questionId: "environment", answers: ["High temperature", "Corrosive", "Space/Vacuum"] },
    ],
  },
  {
    id: "manufacturing",
    name: "Manufacturing Engineer",
    description: "DFM, process selection, tooling, quality control",
    icon: HardHat,
    keywords: [
      "mold", "tooling", "fixture", "jig", "cnc", "machining",
      "casting", "forging", "welding", "injection", "extrusion",
      "tolerance", "surface finish",
    ],
    diagnosticTriggers: [
      { questionId: "mfg_process", answers: ["CNC Machining", "Injection Molding", "Casting", "Sheet Metal"] },
      { questionId: "tolerance", answers: ["Tight (±0.05mm)", "Ultra-tight (±0.01mm)"] },
    ],
  },
  {
    id: "electronics",
    name: "Electronics Engineer",
    description: "PCB design, sensors, power systems, firmware",
    icon: Cpu,
    keywords: [
      "pcb", "sensor", "motor", "driver", "controller", "battery",
      "power", "voltage", "circuit", "wire", "connector", "led",
      "microcontroller", "encoder", "signal",
    ],
  },
  {
    id: "controls",
    name: "Controls Engineer",
    description: "Automation, feedback loops, PID, motion control",
    icon: Zap,
    keywords: [
      "control", "pid", "servo", "stepper", "feedback", "loop",
      "automation", "plc", "motion", "trajectory", "encoder",
      "closed-loop",
    ],
  },
  {
    id: "structural",
    name: "Structural Analyst (FEA)",
    description: "Stress analysis, FEA simulation, load paths, safety factors",
    icon: Shield,
    keywords: [
      "stress", "load", "fea", "simulation", "deflection",
      "safety factor", "buckling", "vibration", "modal",
      "structural", "frame", "chassis",
    ],
  },
  {
    id: "thermal",
    name: "Thermal Engineer",
    description: "Heat management, cooling, insulation, thermal simulation",
    icon: Thermometer,
    keywords: [
      "heat", "thermal", "cooling", "heatsink", "fan", "insulation",
      "temperature", "dissipation", "radiator", "conduction",
      "convection",
    ],
    diagnosticTriggers: [
      { questionId: "environment", answers: ["High temperature"] },
    ],
  },
]

// ─── Types ──────────────────────────────────────────────────────────

interface CadLabPeopleProps {
  /** Array of decomposed modules */
  modules: CadLabModule[]
  /** Diagnostic answers per module */
  diagnosticAnswers?: DiagnosticAnswers
}

interface DisciplineMatch {
  discipline: Discipline
  /** Module IDs that need this discipline */
  moduleIds: string[]
  /** Why this discipline was matched (sample keywords found) */
  reasons: string[]
}

// ─── Matching Logic ─────────────────────────────────────────────────

/**
 * Matches disciplines to modules based on keyword matching in
 * key parts, failure modes, unknowns, and description text.
 * Also checks diagnostic answers for discipline triggers.
 *
 * @param modules - Project modules
 * @param diagnosticAnswers - Diagnostic answers per module
 * @returns Array of discipline matches sorted by relevance
 */
function matchDisciplines(
  modules: CadLabModule[],
  diagnosticAnswers?: DiagnosticAnswers
): DisciplineMatch[] {
  const matches = new Map<string, DisciplineMatch>()

  for (const disc of DISCIPLINES) {
    const match: DisciplineMatch = {
      discipline: disc,
      moduleIds: [],
      reasons: [],
    }

    for (const mod of modules) {
      // Build searchable text from module data
      const searchText = [
        mod.name,
        mod.purpose,
        mod.description,
        ...mod.keyParts,
        ...mod.failureModes,
        ...mod.unknowns,
      ]
        .join(" ")
        .toLowerCase()

      // Check keyword matches
      const foundKeywords = disc.keywords.filter((kw) =>
        searchText.includes(kw.toLowerCase())
      )

      // Check diagnostic triggers
      let diagTriggered = false
      if (disc.diagnosticTriggers && diagnosticAnswers?.[mod.id]) {
        const modAnswers = diagnosticAnswers[mod.id]
        for (const trigger of disc.diagnosticTriggers) {
          const answer = modAnswers[trigger.questionId]
          if (answer && trigger.answers.includes(answer)) {
            diagTriggered = true
          }
        }
      }

      if (foundKeywords.length > 0 || diagTriggered) {
        if (!match.moduleIds.includes(mod.id)) {
          match.moduleIds.push(mod.id)
        }
        for (const kw of foundKeywords) {
          if (!match.reasons.includes(kw)) match.reasons.push(kw)
        }
        if (diagTriggered && !match.reasons.includes("diagnostic match")) {
          match.reasons.push("diagnostic match")
        }
      }
    }

    if (match.moduleIds.length > 0) {
      matches.set(disc.id, match)
    }
  }

  // Sort by number of modules matched (most relevant first)
  return Array.from(matches.values()).sort(
    (a, b) => b.moduleIds.length - a.moduleIds.length
  )
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * CadLabPeople — expert discipline matching.
 *
 * @description Analyzes module data to determine which engineering
 * disciplines are needed for the project. Shows discipline cards
 * with matched modules and triggering keywords.
 */
export function CadLabPeople({
  modules,
  diagnosticAnswers,
}: CadLabPeopleProps): React.ReactNode {
  const router = useRouter()
  const disciplineMatches = useMemo(
    () => matchDisciplines(modules, diagnosticAnswers),
    [modules, diagnosticAnswers]
  )

  if (disciplineMatches.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Expert Disciplines Needed
          <span className="text-xs font-normal text-muted-foreground">
            {disciplineMatches.length} discipline
            {disciplineMatches.length !== 1 ? "s" : ""} identified
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Based on module requirements, these engineering disciplines are
          recommended for design review, analysis, or fabrication support.
        </p>

        {/* Discipline grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {disciplineMatches.map((match) => {
            const Icon = match.discipline.icon
            const moduleNames = match.moduleIds
              .map((id) => modules.find((m) => m.id === id)?.name || id)

            return (
              <div
                key={match.discipline.id}
                className="border rounded-lg p-4 space-y-2.5 hover:bg-muted/30 transition-colors"
              >
                {/* Discipline header */}
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-international-orange/10 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-international-orange" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {match.discipline.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {match.discipline.description}
                    </p>
                  </div>
                </div>

                {/* Matched modules */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">
                    Modules:
                  </span>
                  {moduleNames.map((name, i) => (
                    <span
                      key={i}
                      className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium text-foreground"
                    >
                      {name}
                    </span>
                  ))}
                </div>

                {/* Matching reasons */}
                {match.reasons.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {match.reasons.slice(0, 5).map((reason, i) => (
                      <span
                        key={i}
                        className="text-[9px] bg-international-orange/10 text-international-orange px-1.5 py-0.5 rounded-full font-mono"
                      >
                        {reason}
                      </span>
                    ))}
                    {match.reasons.length > 5 && (
                      <span className="text-[9px] text-muted-foreground">
                        +{match.reasons.length - 5} more
                      </span>
                    )}
                  </div>
                )}

                {/* Marketplace CTA */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-international-orange hover:text-international-orange hover:bg-international-orange/10 gap-1.5 text-xs"
                  onClick={() => {
                    const q = encodeURIComponent(match.discipline.name)
                    router.push(`/the-forge/marketplace?tab=people&q=${q}`)
                  }}
                >
                  <Search className="h-3 w-3" />
                  Find in Marketplace
                </Button>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="text-[11px] text-muted-foreground border-t pt-3">
          Disciplines derived from module key parts, failure modes, unknowns,
          and diagnostic answers. Use this to identify which experts to involve
          in design review.
        </div>
      </CardContent>
    </Card>
  )
}
