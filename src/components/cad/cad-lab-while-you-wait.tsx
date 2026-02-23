"use client"

/**
 * @file cad-lab-while-you-wait.tsx — Productive activities panel during batch generation.
 *
 * @description Turns dead wait time into preparation by suggesting context-aware
 * activities: reviewing failure modes, reviewing module blueprints,
 * refining the research report, checking tasks, and preparing review checklists.
 *
 * Shown on the Build page while batch generation is running.
 *
 * @component
 */

import { useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ClipboardCheck,
  FileText,
  ListChecks,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  HelpCircle,
  Coffee,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"

// ─── Manufacturing Education Content ────────────────────────────────

const PROCESS_EDUCATION: Record<string, { title: string; content: string; costDriver: string }> = {
  "CNC Machining": {
    title: "How CNC Machining Works",
    content: "A rotating cutting tool removes material from a solid block. 3-axis machines cut from one direction; 5-axis machines approach from any angle. Your part starts as a block of material larger than the finished piece — the removed material is waste.",
    costDriver: "Setup time (fixturing), number of operations (flips), tight tolerances requiring slow feeds, and deep pockets requiring specialty tooling.",
  },
  "Sheet Metal": {
    title: "How Sheet Metal Fabrication Works",
    content: "Flat sheet is cut (laser/waterjet), then bent on a press brake. Each bend requires a separate tool setup. The grain direction of the sheet affects bendability — bending perpendicular to grain is stronger.",
    costDriver: "Number of unique bends, tight bend radii requiring special tooling, and secondary operations (welding, hardware insertion, finishing).",
  },
  "Injection Molding": {
    title: "How Injection Molding Works",
    content: "Molten plastic is injected into a steel mold under high pressure. The mold (tool) costs $5k-$100k+ but each part costs pennies. Design changes after tooling are extremely expensive — the steel mold must be re-cut or scrapped.",
    costDriver: "Mold complexity (undercuts require side actions at $2-10k each), surface finish requirements, material selection, and part volume.",
  },
  Casting: {
    title: "How Casting Works",
    content: "Molten metal is poured into a mold cavity and solidifies. Sand casting uses expendable molds (low tooling, rough finish). Die casting uses permanent steel molds (high tooling, smooth finish). Investment casting uses wax patterns for complex shapes.",
    costDriver: "Tooling type (sand vs die vs investment), wall thickness uniformity, number of cores for internal features, and post-machining requirements.",
  },
  "FDM 3D Print": {
    title: "How FDM 3D Printing Works",
    content: "A heated nozzle melts plastic filament and deposits it layer by layer. Parts are strongest in the XY plane and weakest between layers (Z direction). Overhangs beyond 45° need support material that leaves surface marks when removed.",
    costDriver: "Print time (driven by volume and height), support material usage, post-processing (sanding, vapor smoothing), and material choice.",
  },
  "SLA/Resin Print": {
    title: "How SLA Resin Printing Works",
    content: "A UV laser cures liquid resin one layer at a time. Produces the finest detail of any 3D printing process but parts are brittle unless specially formulated. All parts require post-cure under UV light for final properties.",
    costDriver: "Print height (not volume), resin cost ($50-300/L), support removal and post-curing labor, and functional resin formulations.",
  },
  "SLS/Powder Print": {
    title: "How SLS Powder Printing Works",
    content: "A laser sinters (fuses) powder particles layer by layer. No support structures needed — unfused powder supports the part. Produces strong nylon parts with good mechanical properties but grainy surface finish.",
    costDriver: "Build chamber packing efficiency, powder refresh ratio (used vs virgin), part volume, and post-processing (dyeing, polishing, vapor smoothing).",
  },
}

const MATERIAL_EDUCATION: Record<string, string> = {
  "Aluminum 6061": "Temper matters: T6 means heat-treated and artificially aged (strongest). T651 adds stress-relief for better flatness after machining. Raw (F temper) is soft and will deform under load. Always specify temper.",
  "Steel (mild)": "Mild steel rusts without coating. Common grades: 1018 (general purpose), 1045 (higher strength, heat-treatable), A36 (structural). If your part will be welded, specify weldable grade and call out weld symbols on the drawing.",
  "Stainless Steel": "Not all stainless is equal: 304 is the general-purpose default. 316 resists chlorides (marine/medical). 17-4PH can be heat-treated to high strength. Stainless work-hardens during machining, increasing cost.",
  Titanium: "Grade 5 (Ti-6Al-4V) is the aerospace standard — high strength but 5-10× the machining cost of aluminum. Grade 2 (commercially pure) is cheaper to machine and sufficient for corrosion resistance. Always question whether titanium is truly necessary.",
  "PLA/PETG": "PLA is for prototypes only — it softens above 60°C and degrades over time. PETG is the minimum for functional parts: better chemical resistance and temperature range. Neither is suitable for outdoor UV exposure without coating.",
  "ABS/Nylon": "ABS can be vapor-smoothed with acetone for a glossy finish. Nylon (PA6, PA12) has the best mechanical properties of any printable plastic but absorbs moisture — parts must be dried before printing and may change dimensions in humid environments.",
  "Carbon Fiber": "Carbon fiber composites are not isotropic — strength depends entirely on fiber orientation. Specify layup angles for your load case. Chopped fiber (injection molded) is much weaker than continuous fiber (laminated). Always specify which you need.",
  "Copper/Brass": "Copper is extremely difficult to machine — it's gummy and clogs tools. Free-machining brass (C360) is 10× easier. For electrical conductivity, specify %IACS requirement. For thermal, specify thermal conductivity in W/m·K.",
}

const TOLERANCE_EDUCATION: Record<string, string> = {
  "General (±0.5mm)": "General tolerance is what you get without specifying anything. Suitable for non-mating surfaces and most 3D printed parts. If your parts need to fit together, you probably need tighter tolerances on the interface features only.",
  "Moderate (±0.25mm)": "Moderate tolerance is achievable with standard CNC machining at no cost premium. Good for clearance fits and most mechanical assemblies. This is the sweet spot for prototyping.",
  "Tight (±0.1mm)": "Tight tolerance requires careful machining with measured setups. Cost increases 30-50% over general. Only specify on features that genuinely need it — mating surfaces, bearing bores, and alignment pins. Never blanket an entire part with tight tolerance.",
  "Very tight (±0.05mm)": "Very tight tolerance requires grinding or precision machining. Cost increases 2-3× over general. Only use for precision fits (bearing seats, shaft journals). Your supplier pool shrinks significantly — many shops can't hold this.",
  "Ultra-tight (±0.01mm)": "Ultra-tight tolerance is near the limit of conventional machining. Requires temperature-controlled inspection and specialized equipment. Cost is 5-10× general tolerance. Only justify for optical, medical, or aerospace-grade interfaces.",
}

// ─── Types ───────────────────────────────────────────────────────────

interface WhileYouWaitProps {
  /** Current module list with failure modes and unknowns */
  modules: CadLabModule[]
  /** Number of diagnostic questionnaires completed */
  diagCompletedCount: number
  /** Whether the user has research to review */
  hasResearch: boolean
  /** Diagnostic answers for manufacturing-context education */
  diagnosticAnswers?: DiagnosticAnswers
}

// ─── Activity Card ───────────────────────────────────────────────────

interface ActivityProps {
  icon: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
  /** Priority: higher = shown first */
  priority: number
  /** Whether this activity is already completed */
  completed?: boolean
}

function Activity({ icon, title, description, action, completed }: ActivityProps): React.ReactNode {
  if (completed) return null
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex-shrink-0 mt-0.5 text-international-orange">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  )
}

// ─── Risk Summary Expandable ─────────────────────────────────────────

function RiskSummary({ modules }: { modules: CadLabModule[] }): React.ReactNode {
  const [expanded, setExpanded] = useState(false)

  const allFailureModes = modules.flatMap((m) =>
    m.failureModes.map((f) => ({ module: m.name, risk: f })),
  )
  const allUnknowns = modules.flatMap((m) =>
    m.unknowns.map((u) => ({ module: m.name, unknown: u })),
  )

  if (allFailureModes.length === 0 && allUnknowns.length === 0) return null

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full p-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-status-warning" />
          <span className="text-sm font-medium">
            {allFailureModes.length} failure modes, {allUnknowns.length} unknowns across modules
          </span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {allFailureModes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-1">
                Failure Modes
              </p>
              <ul className="space-y-1">
                {allFailureModes.map((f, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0 mt-0.5" />
                    <span>
                      <span className="font-medium text-foreground">{f.module}:</span> {f.risk}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {allUnknowns.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-status-warning uppercase tracking-wider mb-1">
                Unknowns
              </p>
              <ul className="space-y-1">
                {allUnknowns.map((u, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <HelpCircle className="h-3 w-3 text-status-warning flex-shrink-0 mt-0.5" />
                    <span>
                      <span className="font-medium text-foreground">{u.module}:</span> {u.unknown}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────

/**
 * CadLabWhileYouWait — Productive activities panel during batch generation.
 *
 * @description Shows context-aware suggestions for what the user can do
 * while modules are being generated. Activities are prioritized based on
 * what's most useful given the current state (e.g., if diagnostics aren't
 * done, that's suggested first).
 */
export function CadLabWhileYouWait({
  modules,
  diagCompletedCount,
  hasResearch,
  diagnosticAnswers,
}: WhileYouWaitProps): React.ReactNode {
  const totalModules = modules.length
  const riskCount = modules.reduce(
    (sum, m) => sum + m.failureModes.length + m.unknowns.length,
    0,
  )
  const diagsRemaining = totalModules - diagCompletedCount

  // Derive unique processes, materials, and tolerances from diagnostic answers
  const uniqueProcesses = new Set<string>()
  const uniqueMaterials = new Set<string>()
  const uniqueTolerances = new Set<string>()
  if (diagnosticAnswers) {
    for (const modAnswers of Object.values(diagnosticAnswers)) {
      if (modAnswers.mfg_process) uniqueProcesses.add(modAnswers.mfg_process)
      if (modAnswers.material) uniqueMaterials.add(modAnswers.material)
      if (modAnswers.tolerance) uniqueTolerances.add(modAnswers.tolerance)
    }
  }

  const activities: ActivityProps[] = [
    // Review risks — always useful if there are any
    {
      icon: <ShieldAlert className="h-4 w-4" />,
      title: "Review failure modes & unknowns",
      description: `Your modules have ${riskCount} identified risks. Review them now so you can prioritise mitigations when CAD results arrive.`,
      priority: riskCount > 0 ? 100 : 0,
      completed: riskCount === 0,
    },
    // Review module blueprints — useful context while waiting
    {
      icon: <ClipboardCheck className="h-4 w-4" />,
      title: "Review module blueprints from Concept stage",
      description: "Scroll through the blueprint illustrations generated during the Concept stage. Annotate any design concerns before CAD results arrive.",
      priority: 70,
      completed: false,
    },
    // Review research — always available
    {
      icon: <FileText className="h-4 w-4" />,
      title: "Refine the research report",
      description: "Your research report is editable. Add missing dimensions, correct assumptions, or add notes from your own expertise. Changes will improve future generations.",
      priority: hasResearch ? 60 : 0,
      completed: !hasResearch,
    },
    // Manufacturing education — contextual to diagnostic answers
    ...Array.from(uniqueProcesses).map((proc): ActivityProps => {
      const edu = PROCESS_EDUCATION[proc]
      if (!edu) return { icon: <></>, title: "", description: "", priority: 0, completed: true }
      return {
        icon: <FileText className="h-4 w-4" />,
        title: edu.title,
        description: `${edu.content} Cost driver: ${edu.costDriver}`,
        priority: 85,
      }
    }),
    ...Array.from(uniqueMaterials).map((mat): ActivityProps => {
      const edu = MATERIAL_EDUCATION[mat]
      if (!edu) return { icon: <></>, title: "", description: "", priority: 0, completed: true }
      return {
        icon: <FileText className="h-4 w-4" />,
        title: `Understand your material: ${mat}`,
        description: edu,
        priority: 80,
      }
    }),
    ...Array.from(uniqueTolerances).map((tol): ActivityProps => {
      const edu = TOLERANCE_EDUCATION[tol]
      if (!edu) return { icon: <></>, title: "", description: "", priority: 0, completed: true }
      return {
        icon: <FileText className="h-4 w-4" />,
        title: `Review your tolerance spec: ${tol}`,
        description: edu,
        priority: 75,
      }
    }),
    // Check tasks — always useful
    {
      icon: <ListChecks className="h-4 w-4" />,
      title: "Check today's tasks",
      description: "You'll be notified when generation completes. Use this time to review your task list, clear blockers, or respond to messages.",
      action: (
        <Link href="/today">
          <Button variant="outline" size="sm" className="h-8 text-xs">
            Go to Today
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      ),
      priority: 40,
    },
    // Prepare review checklist
    {
      icon: <Coffee className="h-4 w-4" />,
      title: "Prepare your review checklist",
      description: "Think about what you want to verify: tolerances, material choices, interface fits, thermal management. Having a checklist ready speeds up the Review stage.",
      priority: 20,
    },
  ]

  // Sort by priority (highest first), filter out completed
  const activeActivities = activities
    .filter((a) => !a.completed)
    .sort((a, b) => b.priority - a.priority)

  if (activeActivities.length === 0) return null

  return (
    <Card className="border-international-orange/20 bg-gradient-to-b from-international-orange-light/10 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 text-foreground">
          <Coffee className="h-4 w-4 text-international-orange" />
          While you wait
          <span className="text-xs font-normal text-muted-foreground">
            — generation is running on the server, you can safely navigate away
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Risk summary (expandable) */}
        {riskCount > 0 && <RiskSummary modules={modules} />}

        {/* Activity suggestions */}
        {activeActivities.map((activity, i) => (
          <Activity key={i} {...activity} />
        ))}
      </CardContent>
    </Card>
  )
}
