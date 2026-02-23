"use client"

/**
 * @file manufacturing-insight-card.tsx — Process-specific manufacturing knowledge.
 *
 * @description Static lookup tables mapping diagnostic answers to factory-relevant
 * questions and specification gaps. Reveals what users don't know they don't know
 * about their chosen manufacturing process, material, and tolerance class.
 */

import { AlertTriangle, HelpCircle, Lightbulb } from "lucide-react"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"

// ─── Process-Specific Factory Questions ──────────────────────────────

const PROCESS_QUESTIONS: Record<string, string[]> = {
  "CNC Machining": [
    "What is the minimum internal corner radius? (Endmill diameter sets the limit — typically ≥1mm)",
    "Are there features requiring 5-axis access? (Undercuts, compound angles, internal channels)",
    "What surface roughness (Ra) do you need? (As-machined ~Ra 3.2μm, fine finish ~Ra 0.8μm)",
    "What alloy temper do you need? (e.g., 6061-T6 vs 6061-T651 — affects machinability and strength)",
    "Do any holes need threading? Specify thread standard, pitch, and class of fit (e.g., M4×0.7-6H)",
  ],
  "Sheet Metal": [
    "What is the minimum bend radius for your material/thickness? (Typically ≥1× material thickness)",
    "Are there features near bends? (Keep holes/slots ≥2× material thickness from bend lines)",
    "Do you need hardware inserts? (PEM nuts, standoffs — specify before fabrication)",
    "What is the grain direction requirement? (Bending parallel vs perpendicular to grain affects cracking)",
    "Specify flat pattern tolerance — sheet metal parts accumulate error across multiple bends",
  ],
  "Injection Molding": [
    "What draft angle is applied to all vertical walls? (Minimum 1° for textured, 0.5° for polished)",
    "Is wall thickness uniform? (Variations >15% cause sink marks and warping)",
    "Where will the gate be located? (Gate vestige leaves a mark — specify which face is acceptable)",
    "Are there undercuts requiring side actions or lifters? (Each adds $2-10k to tooling cost)",
    "What is the expected tool life? (P20 steel ~500k shots, H13 hardened ~1M+ shots)",
  ],
  "Casting": [
    "What is the minimum wall thickness for your casting process? (Sand: ~4mm, Die: ~1mm, Investment: ~1.5mm)",
    "Are there internal cavities requiring cores? (Specify core type and how it will be removed)",
    "What is the acceptable porosity level? (ASTM E505 or customer-specific acceptance criteria)",
    "Is heat treatment required post-casting? (T6 for aluminum, normalize for steel)",
    "What is the parting line location? (Flash/witness line will be visible — specify cosmetic surfaces)",
  ],
  "FDM 3D Print": [
    "What layer height do you need? (0.2mm standard, 0.1mm fine — affects surface finish and print time)",
    "What infill percentage and pattern? (20% gyroid for general use, 50%+ for structural loads)",
    "Which orientation minimizes support material? (Overhangs >45° need support — mark critical surfaces)",
    "Is the part functional or cosmetic? (Post-processing: sanding, vapor smoothing, or priming changes cost)",
    "What temperature will the part see? (PLA softens at 60°C, PETG at 80°C, ABS at 100°C)",
  ],
  "SLA/Resin Print": [
    "What resin type? (Standard, tough, flexible, high-temp, castable — each has different properties)",
    "Is UV stability required? (Standard resins yellow and become brittle in sunlight)",
    "What is the minimum feature size? (Typically 0.1-0.2mm for SLA, limited by laser spot size)",
    "Will the part be used for investment casting patterns? (Specify burnout-compatible resin)",
    "Post-cure requirements? (UV + heat post-cure affects final mechanical properties significantly)",
  ],
  "SLS/Powder Print": [
    "What material? (Nylon PA12 standard, PA11 for flexibility, glass-filled for stiffness)",
    "Is the part going into a food-contact or medical application? (Requires specific material certifications)",
    "What is the minimum wall thickness? (Typically 0.7-1.0mm for SLS nylon)",
    "Is dyeing required? (SLS parts are naturally white/grey — dyeing is a separate post-process)",
    "Accuracy expectation? (SLS typical: ±0.3mm for first 100mm, ±0.3% thereafter)",
  ],
  "Manual/Assembly": [
    "What is the assembly sequence? (Document the order — some steps are irreversible)",
    "What fasteners are used? (Specify grade, length, torque spec, and thread-locking compound if needed)",
    "Are there alignment features or jigs needed? (Precision assembly may need fixtures)",
    "What adhesives are used? (Specify cure time, temperature range, and surface prep requirements)",
    "What is the acceptance test procedure? (How do you verify the assembled product works?)",
  ],
  Other: [
    "What manufacturing process are you actually using? (The factory needs to know to quote accurately)",
    "What post-processing is required? (Heat treatment, coating, plating, painting, assembly)",
    "What inspection method will be used? (CMM, go/no-go gauges, visual, functional test)",
    "What certifications does the end product require? (CE, FCC, UL, ISO 13485, AS9100)",
    "What is the expected annual volume? (Determines whether tooling investment is justified)",
  ],
}

// ─── Material Knowledge ─────────────────────────────────────────────

const MATERIAL_GAPS: Record<string, { needsTemper: boolean; temperNote: string; alternatives: string; certQuestion: string }> = {
  "Aluminum 6061": {
    needsTemper: true,
    temperNote: "Specify temper: T6 (heat-treated, strongest), T651 (stress-relieved, best for machining), O (annealed, most formable).",
    alternatives: "Consider 7075-T6 for higher strength, 5052 for better corrosion resistance, or 2024-T3 for fatigue.",
    certQuestion: "Request mill cert to ISO 10204 3.1B. For aerospace: DFARS/ITAR compliance and AMS specification.",
  },
  "Steel (mild)": {
    needsTemper: true,
    temperNote: "Specify grade: 1018 (general purpose), 1045 (higher strength, heat-treatable), A36 (structural).",
    alternatives: "Consider 4140 for heat-treated strength, 12L14 for best machinability, or S7 for impact resistance.",
    certQuestion: "Request mill cert. For structural: specify ASTM standard (A36, A572). For heat-treated: specify hardness range (HRC).",
  },
  "Stainless Steel": {
    needsTemper: true,
    temperNote: "Specify grade: 304 (general, non-magnetic), 316 (marine/chemical), 17-4PH (high-strength, heat-treatable).",
    alternatives: "304L for welding (low carbon prevents sensitization). 303 for best machinability. 440C for hardness.",
    certQuestion: "Request mill cert with chemical composition. For food/medical: specify surface finish (Ra ≤0.8μm) and passivation.",
  },
  Titanium: {
    needsTemper: true,
    temperNote: "Specify grade: Grade 2 (commercially pure, best formability), Grade 5 / Ti-6Al-4V (highest strength-to-weight).",
    alternatives: "Grade 2 for corrosion resistance at lower cost. Grade 23 (ELI) for medical implants. Grade 9 for tubing.",
    certQuestion: "Request cert per AMS 4928 (bar) or AMS 4911 (sheet). Medical: require ASTM F136 compliance.",
  },
  "Copper/Brass": {
    needsTemper: true,
    temperNote: "Specify alloy: C110 copper (electrical), C360 brass (best machinability), C932 bronze (bearings).",
    alternatives: "Beryllium copper (C172) for springs. Phosphor bronze (C510) for fatigue resistance. Tellurium copper for machining.",
    certQuestion: "Request chemical composition cert. For electrical: specify conductivity requirement (% IACS).",
  },
  "PLA/PETG": {
    needsTemper: false,
    temperNote: "PLA: biodegradable, low heat resistance (60°C). PETG: chemical resistant, higher temp (80°C). Not interchangeable.",
    alternatives: "For higher temps: ABS (100°C) or ASA (UV-stable outdoor). For flexibility: TPU. For strength: Nylon/CF-Nylon.",
    certQuestion: "For food contact: request FDA-compliant filament. For medical devices: biocompatibility testing (ISO 10993).",
  },
  "ABS/Nylon": {
    needsTemper: false,
    temperNote: "ABS: good impact resistance, can be vapor-smoothed. Nylon: best mechanical properties, hygroscopic (absorbs moisture).",
    alternatives: "Nylon 6/6 for injection molding. PA12 for SLS. Glass-filled nylon for stiffness. PC-ABS for impact + heat.",
    certQuestion: "For automotive: UL94 V-0 flame rating. Specify moisture conditioning requirements for nylon parts.",
  },
  "Carbon Fiber": {
    needsTemper: false,
    temperNote: "Specify layup: unidirectional (max stiffness one direction), woven (balanced), chopped (isotropic, lower cost).",
    alternatives: "Fiberglass for lower cost. Kevlar for impact resistance. Basalt fiber for temperature resistance.",
    certQuestion: "Specify fiber type (T300, T700), resin system (epoxy, vinyl ester), and cure schedule. Request mechanical test certs.",
  },
  "Resin (standard)": {
    needsTemper: false,
    temperNote: "Standard resin yellows in UV. Specify tough resin for functional parts, flexible for gaskets, high-temp for 200°C+.",
    alternatives: "Dental resin for biocompat. Castable resin for investment casting. Ceramic-filled for stiffness.",
    certQuestion: "Request TDS (Technical Data Sheet) with cured mechanical properties. For medical: biocompatibility per ISO 10993.",
  },
  "Wood/Plywood": {
    needsTemper: false,
    temperNote: "Specify species and grade. Baltic birch plywood for precision. MDF for uniformity. Solid hardwood for aesthetics.",
    alternatives: "Bamboo plywood for sustainability. HDPE/Corian for waterproof alternatives. Phenolic for electrical insulation.",
    certQuestion: "For structural: specify grade per PS 1 (plywood) or NHLA (hardwood). For indoor: formaldehyde emission class.",
  },
  Other: {
    needsTemper: false,
    temperNote: "Specify the exact material with grade, condition, and any post-treatment requirements.",
    alternatives: "Work with your supplier to identify the right material for your application requirements.",
    certQuestion: "Request material data sheet and test certifications appropriate for your industry standards.",
  },
}

// ─── Tolerance → Cost/Supplier Impact ───────────────────────────────

const TOLERANCE_INSIGHTS: Record<string, string> = {
  "Loose (±1mm)": "Most suppliers can achieve this. Low cost. Suitable for non-critical fits and enclosures. No special inspection needed.",
  "Standard (±0.5mm)": "Standard CNC/sheet metal tolerance. Wide supplier pool. Basic CMM or caliper inspection sufficient.",
  "Precision (±0.1mm)": "Requires quality CNC with good fixturing. Moderate cost premium (20-50%). CMM inspection recommended. Fewer suppliers qualify.",
  "Tight (±0.05mm)": "Requires precision grinding or jig boring. Significant cost premium (2-5×). Full CMM report required. Limited supplier pool.",
  "Ultra-tight (±0.01mm)": "Requires grinding, lapping, or EDM. Very high cost (5-20×). 100% CMM inspection. Few suppliers worldwide. Expect long lead times.",
}

// ─── Surface Finish → Ra Mapping ────────────────────────────────────

const FINISH_RA_MAP: Record<string, string> = {
  "As-manufactured": "CNC: ~Ra 3.2μm. FDM: ~Ra 12-15μm (layer lines). Sheet metal: ~Ra 1.6μm. Specify if appearance matters.",
  "Sanded/Deburred": "~Ra 1.6-3.2μm. Manual labor cost. Specify which edges need deburring and acceptable radius.",
  "Painted/Coated": "Substrate prep to ~Ra 1.6μm recommended. Specify paint type (powder coat vs wet spray), thickness, color (RAL/Pantone), and adhesion test.",
  Anodized: "Type II (decorative, 5-25μm): good color options. Type III (hardcoat, 25-75μm): wear resistant but limited colors. Specify type and thickness.",
  Polished: "Mirror finish: Ra ≤0.1μm. Requires multiple grits (up to 2000+). Very labor-intensive. Specify required Ra value.",
  Plated: "Specify: nickel (corrosion), chrome (hardness), zinc (sacrificial corrosion), gold (conductivity). Include thickness and standard (e.g., ASTM B633).",
  "N/A": "No finish specified. The factory will deliver as-manufactured unless told otherwise.",
}

// ─── Component ──────────────────────────────────────────────────────

interface ManufacturingInsightCardProps {
  /** Diagnostic answers for this specific module */
  moduleAnswers?: Record<string, string>
  /** Whether to show in compact mode (fewer details) */
  compact?: boolean
}

export function ManufacturingInsightCard({
  moduleAnswers,
  compact = false,
}: ManufacturingInsightCardProps): React.ReactNode {
  if (!moduleAnswers || Object.keys(moduleAnswers).length === 0) {
    return (
      <div className="border border-dashed rounded-lg p-3 text-xs text-muted-foreground flex items-center gap-2">
        <HelpCircle className="h-3.5 w-3.5 flex-shrink-0" />
        Complete diagnostics to see process-specific questions your factory will ask.
      </div>
    )
  }

  const process = moduleAnswers.mfg_process
  const material = moduleAnswers.material
  const tolerance = moduleAnswers.tolerance
  const finish = moduleAnswers.finish

  const processQuestions = process ? PROCESS_QUESTIONS[process] || PROCESS_QUESTIONS.Other : null
  const materialInfo = material ? MATERIAL_GAPS[material] || MATERIAL_GAPS.Other : null
  const toleranceInsight = tolerance ? TOLERANCE_INSIGHTS[tolerance] : null
  const finishInsight = finish ? FINISH_RA_MAP[finish] : null

  // Identify gaps — things that are specified but underspecified
  const gaps: string[] = []
  if (materialInfo?.needsTemper && material && !material.includes("-T") && !material.includes("Grade")) {
    gaps.push(`Material "${material}" needs a temper/grade designation for the factory to quote accurately.`)
  }
  if (finish && finish !== "N/A" && finish !== "As-manufactured") {
    gaps.push(`Surface finish "${finish}" needs a specific Ra value or coating thickness for the factory.`)
  }
  if (tolerance === "Tight (±0.05mm)" || tolerance === "Ultra-tight (±0.01mm)") {
    gaps.push("Tight tolerances apply to which features specifically? Blanket tight tolerance dramatically increases cost.")
  }

  return (
    <div className="space-y-3">
      {/* Spec gaps — things the user should fix before sending to factory */}
      {gaps.length > 0 && (
        <div className="border border-status-warning/30 rounded-lg p-3 space-y-2 bg-status-warning-light/10">
          <p className="text-xs font-semibold text-status-warning-dark flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Specification Gaps
          </p>
          <ul className="space-y-1">
            {gaps.map((gap, i) => (
              <li key={i} className="text-xs text-foreground">{gap}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Process-specific questions */}
      {processQuestions && (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5 text-international-orange" />
            Questions Your Factory Will Ask ({process})
          </p>
          <ul className="space-y-1.5">
            {(compact ? processQuestions.slice(0, 3) : processQuestions).map((q, i) => (
              <li key={i} className="text-xs text-muted-foreground leading-relaxed pl-5 relative">
                <span className="absolute left-0 text-international-orange font-mono">{i + 1}.</span>
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Material knowledge */}
      {materialInfo && !compact && (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-status-info" />
            Material: {material}
          </p>
          <p className="text-xs text-muted-foreground">{materialInfo.temperNote}</p>
          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Alternatives:</span> {materialInfo.alternatives}</p>
          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Certification:</span> {materialInfo.certQuestion}</p>
        </div>
      )}

      {/* Tolerance and finish insights */}
      {(toleranceInsight || finishInsight) && !compact && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {toleranceInsight && (
            <div className="border rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-foreground">Tolerance: {tolerance}</p>
              <p className="text-xs text-muted-foreground">{toleranceInsight}</p>
            </div>
          )}
          {finishInsight && (
            <div className="border rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-foreground">Finish: {finish}</p>
              <p className="text-xs text-muted-foreground">{finishInsight}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
