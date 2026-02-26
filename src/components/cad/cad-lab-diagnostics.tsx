/**
 * @file cad-lab-diagnostics.tsx — Engineering readiness diagnostic center.
 *
 * @description Presents a fixed set of universal engineering diagnostic
 * questions per module: manufacturing process, material class, tolerance,
 * surface finish, batch size, and operating environment. Answers inform
 * downstream supply chain and contracting decisions.
 *
 * Answers are stored in component state and passed up via callback.
 * Persistence to DB happens when the parent saves modules.
 *
 * @component
 *
 * @example
 * <CadLabDiagnostics
 *   modules={modules}
 *   answers={diagnosticAnswers}
 *   onAnswersChange={setDiagnosticAnswers}
 * />
 */

"use client"

import { useState, useMemo } from "react"
import {
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Box,
  Zap,
  Lightbulb,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { CadLabModule, CadLabDesignBrief } from "@/lib/cad-lab-types"
import {
  getMaterialCompatibilityForProcess,
  getProcessCompatibilityForMaterial,
} from "@/lib/cad-lab/diagnostic-mappings"
import type { CompatibilityStatus } from "@/lib/cad-lab/diagnostic-mappings"

// ─── Diagnostic Questions ───────────────────────────────────────────

interface DiagnosticQuestion {
  /** Unique question identifier */
  id: string
  /** Short question text */
  question: string
  /** Why this question matters */
  hint: string
  /** Available answer options */
  options: string[]
  /** Default recommended option for early-stage prototyping */
  recommended: string
  /** Tooltip description per option */
  optionDescriptions: Record<string, string>
}

/**
 * Standard engineering diagnostic questions.
 *
 * These are universal across all hardware modules and directly
 * inform manufacturing feasibility, supplier matching, and quoting.
 */
const DIAGNOSTIC_QUESTIONS: DiagnosticQuestion[] = [
  {
    id: "mfg_process",
    question: "Primary manufacturing process?",
    hint: "Determines supplier pool and cost structure",
    recommended: "FDM 3D Print",
    options: [
      "FDM 3D Print",
      "SLA/Resin Print",
      "SLS/Powder Print",
      "CNC Machining",
      "Sheet Metal",
      "Injection Molding",
      "Casting",
      "Manual/Assembly",
      "Other",
    ],
    optionDescriptions: {
      "FDM 3D Print":
        "Fused filament deposition. Cheapest and fastest for prototypes. Weak layer adhesion limits structural use.",
      "SLA/Resin Print":
        "Photopolymer resin cured by UV light. Higher surface detail than FDM. Parts can be brittle; not suitable for high-stress applications.",
      "SLS/Powder Print":
        "Laser-sintered nylon powder. Strong, functional parts with good detail. Higher cost and longer lead time than FDM.",
      "CNC Machining":
        "Subtractive cutting from solid block. Excellent precision and strength. Higher cost, longer lead time, ideal for metal parts.",
      "Sheet Metal":
        "Laser cut and bent flat metal stock. Great for enclosures, brackets, and structural frames. Efficient at higher volumes.",
      "Injection Molding":
        "High-pressure plastic injection into a mold. Very low unit cost at scale but tooling costs are high. Best for 1k+ units.",
      Casting:
        "Metal or resin poured into a mold. Good for complex shapes in metal. Longer lead time and higher setup cost.",
      "Manual/Assembly":
        "Hand assembly of purchased or custom components. Flexible but labor-intensive. Common for wiring harnesses and custom assemblies.",
      Other:
        "A process not listed above. Add context in the notes field to help with supplier matching.",
    },
  },
  {
    id: "material",
    question: "Material class?",
    hint: "Affects structural properties, cost, and lead time",
    recommended: "PLA/PETG",
    options: [
      "PLA/PETG",
      "ABS/Nylon",
      "Resin (standard)",
      "Aluminum 6061",
      "Steel (mild)",
      "Stainless Steel",
      "Titanium",
      "Copper/Brass",
      "Carbon Fiber",
      "Wood/Plywood",
      "Other",
    ],
    optionDescriptions: {
      "PLA/PETG":
        "Common FDM filaments. PLA is easy to print but brittle; PETG is tougher with better heat resistance. Ideal for prototypes.",
      "ABS/Nylon":
        "Engineering plastics with good impact resistance and heat tolerance. ABS can warp; Nylon absorbs moisture. Better for functional parts.",
      "Resin (standard)":
        "General-purpose photopolymer for SLA/DLP printing. High detail, smooth surface. Can be brittle under load.",
      "Aluminum 6061":
        "Most common structural aluminum alloy. Excellent strength-to-weight ratio, good machinability, corrosion resistant.",
      "Steel (mild)":
        "Low-carbon steel. Strong and cheap but heavy and prone to rust. Good for structural frames and brackets.",
      "Stainless Steel":
        "Corrosion-resistant steel alloy. Harder to machine than mild steel. Used when rust resistance or aesthetics are required.",
      Titanium:
        "High strength, very light, corrosion resistant. Expensive and difficult to machine. Used in aerospace and medical applications.",
      "Copper/Brass":
        "Good electrical and thermal conductivity. Brass is easy to machine. Used for connectors, heat sinks, and decorative parts.",
      "Carbon Fiber":
        "Extremely high strength-to-weight. Expensive and requires specialist fabrication. Used in aerospace, automotive, and performance applications.",
      "Wood/Plywood":
        "Easy to cut and join. Good for enclosures, jigs, and non-structural parts. Not suitable for wet or high-stress environments.",
      Other:
        "A material not listed above. Add context to help with supplier matching.",
    },
  },
  {
    id: "tolerance",
    question: "Tolerance class?",
    hint: "Tighter tolerances increase cost and reduce supplier options",
    recommended: "Standard (±0.5mm)",
    options: [
      "Loose (±1mm)",
      "Standard (±0.5mm)",
      "Precision (±0.1mm)",
      "Tight (±0.05mm)",
      "Ultra-tight (±0.01mm)",
    ],
    optionDescriptions: {
      "Loose (±1mm)":
        "Acceptable for non-mating or decorative parts. Most FDM printers achieve this without tuning. Lowest cost.",
      "Standard (±0.5mm)":
        "Default for most prototype parts. Achievable with well-calibrated FDM or basic machining. Good cost-quality balance.",
      "Precision (±0.1mm)":
        "Required for parts that must fit together accurately. Achievable with SLS, CNC, or tuned SLA. Moderate cost increase.",
      "Tight (±0.05mm)":
        "For precision mechanical assemblies with moving parts. Requires CNC machining with careful setup. Significant cost increase.",
      "Ultra-tight (±0.01mm)":
        "Requires precision CNC, jig grinding, or specialized metrology. Very expensive. Only when truly necessary for function.",
    },
  },
  {
    id: "finish",
    question: "Surface finish?",
    hint: "Post-processing adds time and cost",
    recommended: "As-manufactured",
    options: [
      "As-manufactured",
      "Sanded/Deburred",
      "Painted/Coated",
      "Anodized",
      "Polished",
      "Plated",
      "N/A",
    ],
    optionDescriptions: {
      "As-manufactured":
        "No post-processing beyond basic cleaning. Fastest and cheapest. Appropriate for prototype and internal parts.",
      "Sanded/Deburred":
        "Manual or mechanical removal of sharp edges and layer lines. Low cost, improves appearance and handling safety.",
      "Painted/Coated":
        "Spray paint, powder coat, or protective coating. Improves aesthetics and corrosion resistance. Adds 1–3 days.",
      Anodized:
        "Electrochemical surface treatment for aluminum. Hard, colorfast, corrosion resistant. Adds cost and 3–5 day lead time.",
      Polished:
        "Mirror or satin surface finish. Purely aesthetic or for reducing friction. Labor-intensive and expensive.",
      Plated:
        "Electroplated metal layer (nickel, chrome, gold). Improves corrosion resistance or conductivity. Specialist process.",
      "N/A": "Surface finish not applicable to this part or process.",
    },
  },
  {
    id: "batch_size",
    question: "Batch size?",
    hint: "Determines manufacturing method viability and unit economics",
    recommended: "Prototype (1–5)",
    options: [
      "Prototype (1–5)",
      "Small batch (10–50)",
      "Medium (50–500)",
      "Production (500+)",
      "Mass production (10k+)",
    ],
    optionDescriptions: {
      "Prototype (1–5)":
        "Early validation with minimal investment. FDM, SLA, and basic CNC are cost-effective. Unit cost is high but total spend is low.",
      "Small batch (10–50)":
        "Pre-production or pilot builds. SLS, sheet metal, and CNC become viable. Unit cost begins to fall.",
      "Medium (50–500)":
        "Low-volume production. Bridge tooling and cast parts become cost-effective. Requires design-for-manufacture review.",
      "Production (500+)":
        "Full production run. Injection molding and high-volume CNC economical. Requires robust quality control.",
      "Mass production (10k+)":
        "High-volume manufacturing. Tooling investment fully amortized. Requires offshore or high-volume domestic suppliers.",
    },
  },
  {
    id: "environment",
    question: "Operating environment?",
    hint: "Affects material selection, sealing, and testing requirements",
    recommended: "Indoor (office)",
    options: [
      "Indoor (office)",
      "Indoor (industrial)",
      "Outdoor (temperate)",
      "Outdoor (harsh)",
      "High temperature",
      "Wet/Marine",
      "Corrosive",
      "Cleanroom",
      "Space/Vacuum",
    ],
    optionDescriptions: {
      "Indoor (office)":
        "Controlled temperature and humidity. Minimal environmental stress. Most materials suitable. Lowest protection requirements.",
      "Indoor (industrial)":
        "Vibration, dust, oils, or elevated temperatures. Requires more robust materials and possibly IP-rated enclosures.",
      "Outdoor (temperate)":
        "UV exposure, rain, temperature cycling. Requires UV-stable materials, sealed enclosures, and corrosion-resistant fasteners.",
      "Outdoor (harsh)":
        "Extreme temperatures, wind, sand, or saltwater spray. Requires ruggedized design, IP67+ rating, and corrosion-resistant materials.",
      "High temperature":
        "Operating above 80°C. PLA unsuitable. Requires ABS, Nylon, PEEK, or metal. Thermal expansion must be accounted for.",
      "Wet/Marine":
        "Continuous water exposure. Requires stainless steel or coated fasteners, sealed electronics, and waterproof materials.",
      Corrosive:
        "Chemical exposure (acids, solvents, cleaning agents). Material compatibility check essential. Often requires PTFE, HDPE, or stainless.",
      Cleanroom:
        "Particulate and contamination control (ISO Class 5–8). Outgassing and particle generation must be minimized.",
      "Space/Vacuum":
        "Vacuum environment with extreme thermal cycling and radiation. Highly restricted material list. Requires specialist suppliers.",
    },
  },
]

// ─── Intelligent Defaults ────────────────────────────────────────────

/** Check whether `kw` appears as a whole word in `text`. */
function matchWord(text: string, kw: string): boolean {
  return new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)
}

interface InferCategory {
  keywords: string[]
  mfgProcess: string
  material: string
  tolerance: string
  finish: string
}

const INFER_CATEGORIES: InferCategory[] = [
  {
    keywords: ["pcb", "circuit", "motor", "driver", "battery", "sensor", "controller", "wire", "led"],
    mfgProcess: "Manual/Assembly",
    material: "Other",
    tolerance: "Standard (±0.5mm)",
    finish: "N/A",
  },
  {
    keywords: ["servo", "kinematic", "bearing", "linear", "leadscrew", "ball screw"],
    mfgProcess: "CNC Machining",
    material: "Aluminum 6061",
    tolerance: "Precision (±0.1mm)",
    finish: "Anodized",
  },
  {
    keywords: ["aluminium", "aluminum", "housing", "chassis", "shaft", "gear", "axle", "spindle"],
    mfgProcess: "CNC Machining",
    material: "Aluminum 6061",
    tolerance: "Standard (±0.5mm)",
    finish: "Sanded/Deburred",
  },
  {
    keywords: ["frame", "bracket", "panel", "enclosure", "rail", "plate"],
    mfgProcess: "Sheet Metal",
    material: "Steel (mild)",
    tolerance: "Standard (±0.5mm)",
    finish: "Painted/Coated",
  },
  {
    keywords: ["casting", "foundry"],
    mfgProcess: "Casting",
    material: "Aluminum 6061",
    tolerance: "Loose (±1mm)",
    finish: "Sanded/Deburred",
  },
]

/**
 * Infers recommended diagnostics per module using a scoring approach.
 *
 * Each category earns one point per keyword hit (word-boundary matched).
 * The highest-scoring category wins. Ties fall to the first category.
 * If the design brief specifies a target process or material that matches
 * a diagnostic option, those are used directly.
 *
 * @param mod - The module to analyze
 * @param designBrief - Optional design brief with user-specified targets
 * @returns Record of questionId → suggested answer
 */
function inferRecommendations(mod: CadLabModule, designBrief?: CadLabDesignBrief): Record<string, string> {
  const text = [mod.name, mod.purpose, mod.description, ...mod.keyParts]
    .join(" ")
    .toLowerCase()

  // Score each category by counting keyword hits
  let bestScore = 0
  let bestCat: InferCategory | null = null
  for (const cat of INFER_CATEGORIES) {
    const score = cat.keywords.reduce((s, kw) => s + (matchWord(text, kw) ? 1 : 0), 0)
    if (score > bestScore) {
      bestScore = score
      bestCat = cat
    }
  }

  let mfgProcess = bestCat?.mfgProcess ?? "FDM 3D Print"
  let material = bestCat?.material ?? "PLA/PETG"
  const tolerance = bestCat?.tolerance ?? "Standard (±0.5mm)"
  const finish = bestCat?.finish ?? "As-manufactured"

  // Design brief overrides: use directly if they match a diagnostic option
  if (designBrief?.targetProcess) {
    const bp = designBrief.targetProcess.toLowerCase()
    const processQ = DIAGNOSTIC_QUESTIONS.find((q) => q.id === "mfg_process")
    const match = processQ?.options.find((o) => o.toLowerCase().includes(bp) || bp.includes(o.toLowerCase()))
    if (match) mfgProcess = match
  }
  if (designBrief?.targetMaterial) {
    const bm = designBrief.targetMaterial.toLowerCase()
    const materialQ = DIAGNOSTIC_QUESTIONS.find((q) => q.id === "material")
    const match = materialQ?.options.find((o) => o.toLowerCase().includes(bm) || bm.includes(o.toLowerCase()))
    if (match) material = match
  }

  return {
    mfg_process: mfgProcess,
    material,
    tolerance,
    finish,
    batch_size: "Prototype (1–5)",
    environment: "Indoor (office)",
  }
}

// ─── Types ──────────────────────────────────────────────────────────

/** Map of moduleId → { questionId: answer } */
export type DiagnosticAnswers = Record<string, Record<string, string>>

interface CadLabDiagnosticsProps {
  /** Array of decomposed modules */
  modules: CadLabModule[]
  /** Current diagnostic answers */
  answers: DiagnosticAnswers
  /** Called when answers change */
  onAnswersChange: (answers: DiagnosticAnswers) => void
  /** Whether AI pre-filled answers are present */
  aiPrefilled?: boolean
  /** Design brief for smarter inference defaults */
  designBrief?: CadLabDesignBrief
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * CadLabDiagnostics — engineering readiness diagnostic center.
 *
 * @description Presents per-module diagnostic questions covering
 * manufacturing process, materials, tolerances, finish, batch size,
 * and environment. Tracks completion per module and shows an overall
 * readiness score.
 */
export function CadLabDiagnostics({
  modules,
  answers,
  onAnswersChange,
  aiPrefilled = false,
  designBrief,
}: CadLabDiagnosticsProps): React.ReactNode {
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null)

  // Compute completion stats
  const stats = useMemo(() => {
    const totalQuestions = DIAGNOSTIC_QUESTIONS.length
    let totalAnswered = 0
    let modulesComplete = 0

    for (const mod of modules) {
      const modAnswers = answers[mod.id] || {}
      const answered = Object.keys(modAnswers).length
      totalAnswered += answered
      if (answered >= totalQuestions) modulesComplete++
    }

    return {
      totalQuestions,
      totalModules: modules.length,
      totalAnswered,
      totalPossible: modules.length * totalQuestions,
      modulesComplete,
      completionPct:
        modules.length * totalQuestions > 0
          ? Math.round(
              (totalAnswered / (modules.length * totalQuestions)) * 100
            )
          : 0,
    }
  }, [modules, answers])

  const handleAnswer = (
    moduleId: string,
    questionId: string,
    value: string
  ): void => {
    onAnswersChange({
      ...answers,
      [moduleId]: {
        ...(answers[moduleId] || {}),
        [questionId]: value,
      },
    })
  }

  const handleUseRecommended = (moduleId: string): void => {
    const mod = modules.find((m) => m.id === moduleId)
    const recommended = mod
      ? inferRecommendations(mod, designBrief)
      : DIAGNOSTIC_QUESTIONS.reduce<Record<string, string>>((acc, q) => { acc[q.id] = q.recommended; return acc }, {})
    onAnswersChange({
      ...answers,
      [moduleId]: {
        ...(answers[moduleId] || {}),
        ...recommended,
      },
    })
  }

  const isAllComplete = stats.modulesComplete === stats.totalModules

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FlaskConical className="h-4 w-4" />
          Engineering Diagnostics
          {isAllComplete ? (
            <span className="text-xs font-normal text-status-success flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Complete
            </span>
          ) : (
            <span className="text-xs font-normal text-muted-foreground">
              {stats.completionPct}% complete
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {aiPrefilled && (
          <div className="flex items-center gap-2 p-2.5 bg-status-info-light rounded text-xs text-status-info-dark">
            <Zap className="h-3.5 w-3.5 flex-shrink-0" />
            <span>AI pre-filled answers based on your research. Review and override any that need adjustment.</span>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Answer these manufacturing questions per module to unlock accurate
          supplier matching and contracting. Each module needs{" "}
          {DIAGNOSTIC_QUESTIONS.length} answers.
        </p>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {stats.totalAnswered}/{stats.totalPossible} answers
            </span>
            <span>
              {stats.modulesComplete}/{stats.totalModules} modules complete
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                isAllComplete
                  ? "bg-status-success"
                  : stats.completionPct > 50
                    ? "bg-international-orange"
                    : "bg-muted-foreground"
              )}
              style={{ width: `${stats.completionPct}%` }}
            />
          </div>
        </div>

        {/* Per-module diagnostics */}
        <div className="space-y-2">
          {modules.map((mod) => {
            const modAnswers = answers[mod.id] || {}
            const answeredCount = Object.keys(modAnswers).length
            const isComplete =
              answeredCount >= DIAGNOSTIC_QUESTIONS.length
            const isExpanded = expandedModuleId === mod.id

            return (
              <div key={mod.id} className="border rounded-md overflow-hidden">
                {/* Module header */}
                <button
                  onClick={() =>
                    setExpandedModuleId(isExpanded ? null : mod.id)
                  }
                  className="flex items-center justify-between w-full p-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {isComplete ? (
                      <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0" />
                    ) : (
                      <Box className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium text-foreground truncate">
                      {mod.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {answeredCount}/{DIAGNOSTIC_QUESTIONS.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!isComplete && answeredCount > 0 && (
                      <span className="text-[10px] text-status-warning flex items-center gap-0.5">
                        <AlertTriangle className="h-3 w-3" />
                        Incomplete
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Expanded questionnaire */}
                {isExpanded && (() => {
                  const modRecs = inferRecommendations(mod, designBrief)
                  return (
                  <div className="border-t p-4 space-y-5 bg-muted/10">
                    {/* "Use suggested answers" button — only when unanswered questions remain */}
                    {!isComplete && (
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-international-orange hover:text-international-orange hover:bg-international-orange/10 gap-1.5"
                          onClick={() => handleUseRecommended(mod.id)}
                          type="button"
                        >
                          <Lightbulb className="h-3.5 w-3.5" />
                          Use suggested answers
                        </Button>
                      </div>
                    )}

                    {DIAGNOSTIC_QUESTIONS.map((q) => {
                      const currentAnswer = modAnswers[q.id]

                      // INTENT: Compute compatibility map for cross-question guidance
                      let compatMap: Record<string, CompatibilityStatus> | null = null
                      if (q.id === "material" && modAnswers.mfg_process) {
                        compatMap = getMaterialCompatibilityForProcess(modAnswers.mfg_process)
                      } else if (q.id === "mfg_process" && modAnswers.material) {
                        compatMap = getProcessCompatibilityForMaterial(modAnswers.material)
                      }

                      return (
                        <div key={q.id} className="space-y-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {q.question}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {q.hint}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {q.options.map((opt) => {
                              const isSelected = currentAnswer === opt
                              const isSuggested = modRecs[q.id] === opt
                              const compat = compatMap?.[opt]
                              const isIncompat = compat === "incompatible" && !isSelected

                              // Build tooltip text with compatibility note
                              let tooltipText = q.optionDescriptions[opt] ?? opt
                              if (isIncompat) {
                                const crossField = q.id === "material"
                                  ? modAnswers.mfg_process
                                  : modAnswers.material
                                tooltipText += ` — Not typically used with ${crossField}`
                              }

                              return (
                                <Tooltip key={opt}>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant={isSelected ? "default" : "outline"}
                                      size="sm"
                                      className={cn(
                                        "text-xs h-7",
                                        !isSelected && isSuggested &&
                                          "ring-1 ring-international-orange/40",
                                        isIncompat && "opacity-40",
                                      )}
                                      onClick={() =>
                                        handleAnswer(mod.id, q.id, opt)
                                      }
                                      type="button"
                                    >
                                      {isIncompat && (
                                        <AlertTriangle className="h-3 w-3 mr-1 text-muted-foreground" />
                                      )}
                                      {!isIncompat && !isSelected && isSuggested && (
                                        <Lightbulb className="h-3 w-3 mr-1 text-international-orange/70" />
                                      )}
                                      {opt}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="bottom"
                                    className="max-w-[250px] z-[300]"
                                  >
                                    <p className="text-xs leading-relaxed">
                                      {tooltipText}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  )
                })()}
              </div>
            )
          })}
        </div>

        {/* Status message */}
        {isAllComplete && (
          <div className="flex items-center gap-2 text-sm text-status-success p-3 bg-status-success-light rounded-lg">
            <CheckCircle2 className="h-4 w-4" />
            All modules diagnosed. Supply chain matching and contracting are now
            unlocked.
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground border-t pt-3">
          <span className="font-medium">Why?</span>
          <span>
            Diagnostic answers determine which suppliers can quote, what
            contracts are needed, and estimated costs.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
