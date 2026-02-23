"use client"

/**
 * @file cad-lab-factory-guide.tsx — Factory Conversation Guide.
 *
 * @description Prepares users for expert and factory conversations by
 * surfacing material rationale, tolerance stack-up awareness, process-specific
 * DFM checklists, and generated questions to ask suppliers. All derived from
 * existing module data and diagnostic answers — no new API calls.
 */

import { useMemo } from "react"
import {
  MessageSquare,
  FlaskConical,
  Ruler,
  Wrench,
  HelpCircle,
  CheckSquare,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"

// ─── Material Rationale ─────────────────────────────────────────────

const MATERIAL_RATIONALE: Record<string, { why: string; askFactory: string[] }> = {
  "Aluminum 6061": {
    why: "Versatile, excellent machinability, good corrosion resistance, and widely available. The default choice for CNC-machined structural parts.",
    askFactory: [
      "What temper do you recommend for my application? (T6 for strength, T651 for flatness after machining)",
      "Can you supply material with mill certification to ISO 10204 3.1B?",
      "What is your typical lead time for 6061 bar/plate in my dimensions?",
    ],
  },
  "Steel (mild)": {
    why: "Low cost, easy to weld, and heat-treatable. Best for structural parts where weight is not critical.",
    askFactory: [
      "Which grade do you stock? (1018 for general, 1045 for strength, A36 for structural)",
      "Will this need heat treatment? If so, what hardness range (HRC)?",
      "What welding process will you use and do your welders have certifications?",
    ],
  },
  "Stainless Steel": {
    why: "Corrosion resistant without coatings. Higher cost than mild steel but essential for food, medical, and marine applications.",
    askFactory: [
      "Which grade? (304 general, 316 for chloride/marine, 17-4PH for strength)",
      "Will this be passivated after machining? What standard?",
      "For food/medical: what surface finish Ra can you achieve?",
    ],
  },
  Titanium: {
    why: "Highest strength-to-weight ratio of any metal. Biocompatible. Extremely expensive to machine — only use where weight or biocompatibility demands it.",
    askFactory: [
      "Do you have experience machining titanium? (Requires rigid setup, specific tooling, and coolant strategy)",
      "What is your material certification capability? (AMS 4928 for bar, ASTM F136 for medical)",
      "Can you quote both Grade 2 (pure) and Grade 5 (Ti-6Al-4V) for comparison?",
    ],
  },
  "PLA/PETG": {
    why: "Lowest cost 3D printing materials. PLA for prototypes and visual models. PETG for functional parts needing chemical resistance.",
    askFactory: [
      "What brand/grade filament do you use? (Quality varies significantly between manufacturers)",
      "Can you provide material TDS showing mechanical properties for the specific filament?",
      "What is your post-processing capability? (Sanding, vapor smoothing, painting)",
    ],
  },
  "ABS/Nylon": {
    why: "ABS for impact resistance and vapor-smoothable finish. Nylon for best-in-class mechanical properties in plastics, but hygroscopic.",
    askFactory: [
      "For nylon: how do you control moisture? (Dry filament before printing, controlled environment)",
      "What infill and orientation do you recommend for my load case?",
      "Can you do functional testing (snap fits, living hinges, press fits)?",
    ],
  },
  "Carbon Fiber": {
    why: "Extreme stiffness-to-weight ratio. Used where weight savings justify 10-50× the cost of aluminum. Complex manufacturing.",
    askFactory: [
      "What layup method? (Prepreg autoclave vs wet layup vs chopped fiber molding)",
      "What fiber and resin system? (T300/epoxy, T700/vinyl ester, etc.)",
      "Can you provide laminate analysis (ABD matrix) for my load case?",
    ],
  },
  "Copper/Brass": {
    why: "Copper for electrical/thermal conductivity. Brass for machinability and corrosion resistance. Both are expensive.",
    askFactory: [
      "What alloy specifically? (C110 copper, C360 free-machining brass, C932 bearing bronze)",
      "For electrical applications: what conductivity specification (% IACS)?",
      "Are you experienced with the gummy chip formation of copper machining?",
    ],
  },
}

// ─── DFM Checklist by Process ───────────────────────────────────────

const DFM_CHECKLISTS: Record<string, string[]> = {
  "CNC Machining": [
    "Internal corner radii ≥ endmill radius (typically ≥1mm for general, ≥3mm for pockets)",
    "Avoid deep pockets: depth-to-width ratio ≤4:1 (deeper requires specialty tooling)",
    "Minimum wall thickness: 0.8mm for aluminum, 0.5mm for steel",
    "Thread depth ≤ 2× nominal diameter (deeper threads risk tap breakage)",
    "Specify which surfaces are datum references for inspection",
    "Avoid internal features that require EDM or wire-cut (adds cost and lead time)",
    "Include approach/runout space for grinding operations on tight-tolerance features",
  ],
  "Sheet Metal": [
    "Bend radius ≥ material thickness (minimum: 0.5mm for most materials)",
    "Holes/slots ≥ 2× material thickness from bend lines",
    "Minimum flange length: 4× material thickness",
    "Uniform material thickness throughout the part (no mix of gauges)",
    "Grain direction matters for bends: perpendicular to grain prevents cracking",
    "Include bend relief notches at intersecting bends",
    "Specify inside or outside dimensions for bent features",
  ],
  "Injection Molding": [
    "Uniform wall thickness (variations ≤15% to prevent sink marks and warping)",
    "Draft angle: minimum 0.5° for smooth surfaces, 1°+ for textured",
    "Rib thickness: 50-70% of adjoining wall thickness",
    "Boss outer diameter: 2× inner diameter, connected to walls with ribs",
    "Gate location: specify which surface can have gate vestige",
    "Undercuts: each side action adds $2-10k to tooling cost",
    "Core-out thick sections to maintain wall uniformity",
  ],
  Casting: [
    "Minimum wall thickness: 4mm for sand casting, 1mm for die casting, 1.5mm for investment",
    "Draft angle: 1-3° for external surfaces, more for internal",
    "Fillet all interior corners: minimum 1mm radius (reduces stress risers and improves flow)",
    "Avoid sharp transitions between thick and thin sections",
    "Specify parting line location preference (cosmetic surfaces should be single-piece mold side)",
    "Internal cavities: specify core type and removal method",
    "Machining allowance: add 1-3mm stock to surfaces requiring precision",
  ],
  "FDM 3D Print": [
    "Overhangs: keep below 45° or design for supports (mark support-contact surfaces)",
    "Bridge length: keep unsupported horizontal spans under 10mm",
    "Minimum wall thickness: 1.2mm for structural, 0.8mm for non-load-bearing",
    "Hole orientation: vertical holes print rounder than horizontal ones",
    "Layer adhesion is weakest in Z — orient critical load paths in XY plane",
    "Clearance for moving parts: minimum 0.4mm gap for FDM",
    "Text/logos: minimum 0.5mm emboss/deboss depth, 1mm character height",
  ],
  "SLA/Resin Print": [
    "Minimum feature size: 0.1-0.2mm (limited by laser spot size)",
    "Drain holes: include for hollow sections to remove uncured resin",
    "Wall thickness: minimum 0.6mm for rigid resins",
    "Support orientation: place supports on non-cosmetic surfaces",
    "Post-cure: specify UV + heat cure cycle for final mechanical properties",
  ],
  "SLS/Powder Print": [
    "Minimum wall thickness: 0.7-1.0mm for nylon PA12",
    "Escape holes: include for trapped powder removal in hollow parts",
    "Clearance for assemblies: minimum 0.5mm gap",
    "Accuracy: ±0.3mm for first 100mm, ±0.3% beyond",
    "Surface finish: naturally grainy (~Ra 12μm) — specify dyeing/polishing if needed",
  ],
}

// ─── Component ──────────────────────────────────────────────────────

interface CadLabFactoryGuideProps {
  modules: CadLabModule[]
  diagnosticAnswers?: DiagnosticAnswers
}

export function CadLabFactoryGuide({
  modules,
  diagnosticAnswers,
}: CadLabFactoryGuideProps): React.ReactNode {
  // Derive unique processes and materials across all modules
  const { processes, materials, supplierQuestions } = useMemo(() => {
    const procSet = new Set<string>()
    const matSet = new Set<string>()
    const questions: string[] = []

    for (const mod of modules) {
      const answers = diagnosticAnswers?.[mod.id]
      if (!answers) continue

      if (answers.mfg_process) procSet.add(answers.mfg_process)
      if (answers.material) matSet.add(answers.material)

      // Generate module-specific supplier questions
      const material = answers.material
      const tolerance = answers.tolerance
      const batchSize = answers.batch_size

      if (material) {
        questions.push(`Request material certification for ${material} — specify the standard your industry requires.`)
      }
      if (tolerance && (tolerance.includes("Tight") || tolerance.includes("Ultra-tight"))) {
        questions.push(`For "${mod.name}": confirm which features actually need ${tolerance}. Blanket tight tolerances multiply cost.`)
      }
      if (batchSize) {
        questions.push(`Ask about lead time for ${batchSize} units of "${mod.name}" including any tooling.`)
      }
    }

    // Add cross-module questions
    if (modules.length > 1) {
      questions.push("Ask about assembly: can the supplier assemble the modules, or do you need a separate assembly house?")
      questions.push("Request a first article inspection (FAI) for the first production run before committing to the full batch.")
    }

    return {
      processes: Array.from(procSet),
      materials: Array.from(matSet),
      supplierQuestions: [...new Set(questions)], // dedupe
    }
  }, [modules, diagnosticAnswers])

  if (!diagnosticAnswers || Object.keys(diagnosticAnswers).length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Factory Conversation Guide
          <span className="text-xs font-normal text-muted-foreground">
            What to know before talking to suppliers
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          This guide prepares you for conversations with factories and engineering experts.
          Every section below addresses questions that suppliers will ask — knowing the answers
          in advance demonstrates that you understand your own design.
        </p>

        {/* Material Selection Rationale */}
        {materials.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <FlaskConical className="h-3.5 w-3.5" />
              Material Selection
            </p>
            {materials.map((mat) => {
              const info = MATERIAL_RATIONALE[mat]
              if (!info) return null
              return (
                <div key={mat} className="border rounded-lg p-3 space-y-2">
                  <p className="text-sm font-semibold text-foreground">{mat}</p>
                  <p className="text-xs text-muted-foreground">{info.why}</p>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground">Ask your supplier:</p>
                    {info.askFactory.map((q, i) => (
                      <p key={i} className="text-xs text-muted-foreground pl-4 relative">
                        <span className="absolute left-0 text-international-orange font-mono">{i + 1}.</span>
                        {q}
                      </p>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Tolerance Stack-Up Awareness */}
        {modules.length > 1 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <Ruler className="h-3.5 w-3.5" />
              Tolerance Stack-Up
            </p>
            <div className="border rounded-lg p-3 space-y-2 bg-status-warning-light/5">
              <p className="text-xs text-foreground font-medium">
                With {modules.length} modules that interface with each other, tolerance stack-up is a real risk.
              </p>
              <p className="text-xs text-muted-foreground">
                Each module has its own tolerance band. Where modules connect (mounting holes, mating surfaces, press fits),
                the worst-case stack-up is the sum of all individual tolerances. A ±0.1mm tolerance on 5 stacked features
                means ±0.5mm total variation at the assembly level.
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Ask your machinist:</span> &quot;For the interfaces between these modules,
                should we tighten the tolerance on the datum features and loosen it on non-critical features?&quot;
                This saves cost while maintaining assembly fit.
              </p>
            </div>
          </div>
        )}

        {/* Process-Specific DFM Checklist */}
        {processes.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <Wrench className="h-3.5 w-3.5" />
              DFM Checklist by Process
            </p>
            {processes.map((proc) => {
              const checklist = DFM_CHECKLISTS[proc]
              if (!checklist) return null
              return (
                <div key={proc} className="border rounded-lg p-3 space-y-2">
                  <p className="text-sm font-semibold text-foreground">{proc}</p>
                  <div className="space-y-1.5">
                    {checklist.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <CheckSquare className="h-3 w-3 text-status-info flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Questions to Ask Your Supplier */}
        {supplierQuestions.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <HelpCircle className="h-3.5 w-3.5" />
              Questions to Ask Your Supplier
            </p>
            <div className="border rounded-lg p-3 space-y-2">
              <p className="text-xs text-muted-foreground mb-2">
                These are generated from your specific module data and diagnostic answers.
                Knowing the answers before you talk to a factory shows preparation.
              </p>
              {supplierQuestions.slice(0, 12).map((q, i) => (
                <p key={i} className="text-xs text-foreground pl-5 relative leading-relaxed">
                  <span className="absolute left-0 text-international-orange font-mono font-bold">{i + 1}.</span>
                  {q}
                </p>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground border-t pt-3">
          This guide is derived from your diagnostic answers and module specifications.
          Update diagnostics to refine these recommendations. Review all items before
          contacting suppliers.
        </p>
      </CardContent>
    </Card>
  )
}
