/**
 * @file sample-project-preview.tsx — Interactive sample project preview
 *
 * @description Shows first-timers what a completed engineering package looks
 * like with hoverable module cards and deliverable tags. Reduces uncertainty
 * before they start by letting them explore what each piece means.
 *
 * @related
 * - forge-project-list.tsx (parent, renders this in empty state)
 * - forge-hover-explanations.tsx (ForgeHoverCard reused here)
 */

"use client"

import React from "react"
import { Eye, CheckCircle2, Layers, Box } from "lucide-react"
import { ForgeHoverCard } from "./forge-hover-explanations"

// ─── Sample Data ─────────────────────────────────────────────────────

const SAMPLE_MODULES = [
  {
    name: "Handle Assembly",
    dims: "120×45×30 mm",
    title: "Handle Assembly",
    description:
      "The main grip and structural frame that the user holds. This is typically the largest module and defines the overall ergonomics of the product.",
    detail:
      "Engineering outputs: 3D CAD model, FEA stress analysis, ergonomic validation, and DFM checks for the chosen manufacturing process.",
  },
  {
    name: "Lever Mechanism",
    dims: "85×20×15 mm",
    title: "Lever Mechanism",
    description:
      "The moving linkage that transfers force from the user's hand to the cap grip. Precision matters here — clearances and pivot geometry determine how smooth it feels.",
    detail:
      "Engineering outputs: kinematic analysis, fatigue life prediction, tolerance stack-up, and material selection for wear resistance.",
  },
  {
    name: "Cap Grip",
    dims: "40×40×25 mm",
    title: "Cap Grip",
    description:
      "The interface piece that contacts the bottle cap. Needs to grip securely without slipping or damaging the cap — surface texture and geometry are critical.",
    detail:
      "Engineering outputs: contact stress analysis, surface finish specification, and material compatibility check for food-safe requirements.",
  },
  {
    name: "Pivot Housing",
    dims: "30×30×20 mm",
    title: "Pivot Housing",
    description:
      "The rotating joint enclosure that connects the lever to the handle. Houses the pivot pin and any springs or detent mechanisms.",
    detail:
      "Engineering outputs: bearing selection, assembly clearance analysis, and snap-fit or fastener specification for the pivot connection.",
  },
]

const SAMPLE_DELIVERABLES = [
  {
    label: "STEP + STL files",
    title: "STEP + STL Files",
    description:
      "Industry-standard 3D CAD files for every module. STEP files open in any professional CAD software (SolidWorks, Fusion 360, FreeCAD). STL files are ready for 3D printing.",
    detail:
      "STEP preserves exact mathematical geometry for manufacturing. STL is a triangle mesh for prototyping. You get both so you can prototype fast and manufacture precisely.",
  },
  {
    label: "7 orthographic views",
    title: "Orthographic Views",
    description:
      "Standard 2D engineering drawings showing your part from all angles — front, back, top, bottom, left, right, and isometric. Dimensioned and annotated.",
    detail:
      "These are the drawings a machinist or manufacturer reads to understand your part. They include critical dimensions, tolerances, and surface finish callouts.",
  },
  {
    label: "DFM analysis",
    title: "Design for Manufacturing (DFM) Analysis",
    description:
      "Automated checks that flag manufacturing issues before you send to a supplier — thin walls, unsupported overhangs, tight tolerances, and material constraints.",
    detail:
      "Catches the problems that would otherwise come back as \"we can't make this\" from your supplier. Saves weeks of back-and-forth redesign.",
  },
  {
    label: "Cost estimate",
    title: "Cost Estimate",
    description:
      "Per-module and total cost breakdown based on material, manufacturing process, volume, and supplier rates. Gives you a realistic budget before committing.",
    detail:
      "Includes material cost, tooling cost (if applicable), per-unit manufacturing cost, and lead time estimates. Updated as your design evolves.",
  },
  {
    label: "RFQ package",
    title: "Request for Quotation (RFQ) Package",
    description:
      "A complete document package you can send directly to suppliers to request pricing and timelines. Includes technical specs, drawings, quantities, and quality requirements.",
    detail:
      "A professional RFQ gets you faster, more accurate quotes. Suppliers know exactly what you need — no back-and-forth clarification emails.",
  },
]

// ─── Component ───────────────────────────────────────────────────────

export function SampleProjectPreview(): React.ReactNode {
  return (
    <div className="rounded-xl border bg-muted/20 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-international-orange" />
        <h3 className="text-sm font-semibold text-foreground">See what you&apos;ll get</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Here&apos;s what a completed engineering package looks like for a sample product — a &quot;Smart Bottle Opener&quot; with 4 modules.
      </p>

      {/* Sample modules */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {SAMPLE_MODULES.map((mod) => (
          <ForgeHoverCard
            key={mod.name}
            title={mod.title}
            description={mod.description}
            detail={mod.detail}
          >
            <div className="rounded-lg border bg-background p-3 space-y-1.5 cursor-help transition-colors hover:border-international-orange/40">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-md bg-status-success-light flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
                </div>
                <p className="text-xs font-medium text-foreground truncate">{mod.name}</p>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">{mod.dims}</p>
            </div>
          </ForgeHoverCard>
        ))}
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Layers className="h-3 w-3" /> 4 sub-assemblies
        </span>
        <span className="flex items-center gap-1">
          <Box className="h-3 w-3" /> 12 components
        </span>
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-status-success" /> All CAD generated
        </span>
      </div>

      {/* Deliverables */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">What you&apos;ll receive:</p>
        <div className="flex flex-wrap gap-1.5">
          {SAMPLE_DELIVERABLES.map((d) => (
            <ForgeHoverCard
              key={d.label}
              title={d.title}
              description={d.description}
              detail={d.detail}
            >
              <span className="text-xs bg-status-success-light text-status-success px-2 py-0.5 rounded-full font-medium cursor-help transition-colors hover:bg-status-success/20">
                {d.label}
              </span>
            </ForgeHoverCard>
          ))}
        </div>
      </div>
    </div>
  )
}
