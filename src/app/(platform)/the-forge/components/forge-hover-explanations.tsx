/**
 * @file forge-hover-explanations.tsx — Shared hover explanation components & content
 *
 * @description Centralized explanatory content and reusable hover components
 * used across all Forge sections (Concept through Contracting). Provides
 * plain-English explanations for engineering terms, metrics, and concepts
 * so users feel informed and delighted — not confused.
 *
 * @related
 * - engineering-summary.tsx (Analysis tab has its own inline explanations)
 * - module-explorer.tsx, system-blueprint.tsx, etc. (consumers)
 */

"use client"

import React from "react"

import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Reusable Hover Components ───────────────────────────────────────

/**
 * ForgeHoverCard — Rich hover explanation with title, description, and optional detail.
 *
 * @description Wraps any element and shows a rich tooltip on hover. Used for
 * section headers, metrics, badges, and any element where a user might
 * think "what does this mean?"
 *
 * @param props.children - The element to wrap (must accept ref via asChild)
 * @param props.title - Bold heading for the explanation
 * @param props.description - Main explanation text
 * @param props.detail - Optional extra context shown below a divider
 * @param props.side - Which side to show the popover (default: "bottom")
 * @param props.align - Alignment relative to trigger (default: "start")
 */
export function ForgeHoverCard({
  children,
  title,
  description,
  detail,
  side = "bottom",
  align = "start",
}: {
  children: React.ReactNode
  title: string
  description: string
  detail?: string
  side?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
}): React.ReactNode {
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-80" align={align} side={side}>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          {detail && (
            <p className="text-xs leading-relaxed text-muted-foreground border-t pt-2 mt-2">
              {detail}
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

/**
 * ForgeInfoTip — Small info icon with a tooltip explanation.
 *
 * @description Inline (?) icon that shows a brief explanation on hover.
 * Use for labels and section headers where you want the explanation
 * to be optional and non-intrusive.
 */
export function ForgeInfoTip({
  text,
  side = "bottom",
  className,
}: {
  text: string
  side?: "top" | "bottom" | "left" | "right"
  className?: string
}): React.ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className={cn("h-3 w-3 text-muted-foreground/60 cursor-help inline-block shrink-0", className)} />
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-[280px]">
        <p className="text-xs leading-relaxed">{text}</p>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * ForgeSectionHeader — Section header with built-in hover explanation.
 *
 * @description Wraps a section header label with a HoverCard explanation.
 * Shows the info icon inline so users know they can hover for more info.
 * Use for uppercase section headers like "KEY COMPONENTS", "ACCEPTANCE TESTS", etc.
 */
export function ForgeSectionHeader({
  children,
  title,
  description,
  detail,
}: {
  children: React.ReactNode
  title: string
  description: string
  detail?: string
}): React.ReactNode {
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span className="inline-flex items-center gap-1.5 cursor-help">
          {children}
          <Info className="h-3 w-3 text-muted-foreground/50" />
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-80" align="start" side="bottom">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          {detail && (
            <p className="text-xs leading-relaxed text-muted-foreground border-t pt-2 mt-2">
              {detail}
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

// ─── Centralized Explanation Content ─────────────────────────────────
// All user-facing descriptions in one place for consistency and future i18n.

export const FORGE_EXPLANATIONS = {
  // ── Concept Page ──
  gatingModule: {
    title: "Gating Module",
    description:
      "This is the single most important module in your design. It defines the core engineering challenge — until it's specified, supplier quotes and timelines for everything else are unreliable.",
    detail:
      "Think of it as the bottleneck: the one part that every other decision depends on. Specify it first to unlock the rest of your supply chain.",
  },
  criticalPath: {
    title: "Critical Path",
    description:
      "The longest lead time across all your modules. This is the minimum time from order to delivery — everything else finishes sooner.",
    detail:
      "In project management, the critical path determines your launch date. Shortening it means finding faster suppliers or simplifying the slowest module.",
  },
  leadTime: {
    title: "Lead Time",
    description:
      "How long it takes from placing an order to receiving the finished part. Includes manufacturing, testing, and shipping.",
    detail:
      "Longer lead times mean you need to plan further ahead. The module with the longest lead time defines your critical path.",
  },
  keyComponents: {
    title: "Key Components",
    description:
      "The specific physical parts this module needs — pumps, sensors, filters, bearings, etc. These are the items you'll need to source or manufacture.",
    detail:
      "Each component will need a supplier, specification, and cost estimate. The more components, the more complex the procurement.",
  },
  acceptanceTests: {
    title: "Acceptance Tests",
    description:
      "The checks you'll run to verify this module works correctly. These are the minimum criteria for signing off on a delivered part.",
    detail:
      "Good acceptance tests catch problems before assembly. They become part of your quality assurance process and supplier contracts.",
  },
  processFlow: {
    title: "Process Flow",
    description:
      "What goes in and what comes out of this module. Maps the physical inputs (materials, energy, signals) to outputs, showing how it fits into the overall system.",
    detail:
      "Understanding I/O ensures modules connect correctly. If one module's output doesn't match the next module's input, you have an integration problem.",
  },
  riskIndicators: {
    title: "Risk Indicators",
    description:
      "Known ways this module could fail, plus open questions that need answers. Identifying risks early saves time and money — you can design around them before manufacturing.",
    detail:
      "Orange dots are known failure modes from similar designs. Red dots are risks derived from your specific diagnostic answers.",
  },
  derivedProcessClass: {
    title: "Derived Process Class",
    description:
      "The manufacturing method determined by your diagnostic answers — e.g., 'CNC machining', 'injection molding', '3D printing'. This drives supplier matching and cost estimates.",
    detail:
      "Different process classes have very different costs, lead times, and minimum order quantities. Getting this right is essential for accurate procurement.",
  },
  expertQuestions: {
    title: "Expert Questions by Discipline",
    description:
      "Technical questions grouped by engineering discipline (mechanical, electrical, software, etc.). Answering these collapses the design space — each answer eliminates options and narrows toward a buildable design.",
    detail:
      "These are the questions a specialist would ask in a design review. Answering them yourself speeds up the process; leaving them open signals where you need expert help.",
  },
  unknownsToResolve: {
    title: "Unknowns to Resolve",
    description:
      "Open questions that don't have answers yet. Each unknown is a decision that needs to be made before this module can be fully specified.",
    detail:
      "Unknowns are different from risks — they're not things that might go wrong, they're things you haven't decided yet. Resolving them unlocks more accurate cost and timeline estimates.",
  },

  // ── Module Explorer (Dossier > Modules) ──
  massProperties: {
    title: "Mass Properties",
    description:
      "Physical weight and volume calculated from the 3D CAD model. Tells you exactly how heavy and large this part is before you build it.",
    detail:
      "Mass affects shipping cost, material cost, and user experience. Volume affects print time and material usage. Both are critical for cost estimation.",
  },
  boundingBox: {
    title: "Bounding Box",
    description:
      "The smallest rectangular box that completely contains the part. Tells you the maximum dimensions — how big the part is at its widest, tallest, and deepest.",
    detail:
      "Important for packaging, printer bed size (does it fit?), and assembly clearance. Expressed as width × height × depth in millimeters.",
  },
  centerOfGravity: {
    title: "Center of Gravity",
    description:
      "The balance point of this part. Where the weight is concentrated. A CG far from the geometric center means the part may feel unbalanced.",
    detail:
      "Expressed as X, Y, Z coordinates in millimeters from the model origin. Critical for assemblies where balance matters (anything handheld, rotating, or load-bearing).",
  },
  dfmCheck: {
    title: "Design for Manufacturing (DFM)",
    description:
      "Checks whether this part can be manufactured using 3D printing without critical issues. Looks for overhangs, thin walls, unsupported features, and material constraints.",
    detail:
      "Printable = ready to send to a printer. Not printable = needs redesign. Issues include: walls too thin (will break), overhangs too steep (will sag), features too small (won't resolve).",
  },
  feaAnalysis: {
    title: "Finite Element Analysis (FEA)",
    description:
      "Computer simulation of real-world forces on your part — gravity, pressure, user loads. Divides the part into thousands of tiny elements and calculates stress in each one.",
    detail:
      "This is the same method used by aerospace and automotive engineers to test designs before building them. It finds the weak spots so you can reinforce them.",
  },
  safetyFactor: {
    title: "Safety Factor",
    description:
      "How much stronger the part is than it needs to be. A safety factor of 2.0 means the part can handle twice the expected load before failing.",
    detail:
      "Above 2.0 = excellent (overbuilt). 1.5–2.0 = adequate (meets standards). Below 1.5 = risky (may fail under expected loads). Industry minimum is typically 1.5.",
  },
  vonMisesStress: {
    title: "Von Mises Stress",
    description:
      "A single number that combines all the different types of stress (tension, compression, shear) into one comparable value. Higher means more stressed.",
    detail:
      "Named after Richard von Mises. Measured in MPa (megapascals). Compare this to the material's yield strength to know how close to failure the part is.",
  },
  stressHotspots: {
    title: "Stress Hotspots",
    description:
      "The specific locations on the part where stress is highest — the places most likely to fail. These are the areas to reinforce or redesign.",
    detail:
      "Hotspots often occur at sharp corners, thin sections, or where loads concentrate. Adding fillets (rounded edges) or increasing wall thickness can fix them.",
  },
  emiShielding: {
    title: "EMI Shielding",
    description:
      "Electromagnetic Interference shielding effectiveness — how well the enclosure blocks radio waves and electronic noise from interfering with internal electronics.",
    detail:
      "Measured in decibels (dB) at specific frequencies. Higher is better. Important for any product with sensitive electronics near motors, power supplies, or wireless components.",
  },
  fatigueLife: {
    title: "Fatigue Life",
    description:
      "How many times the part can be stressed before it cracks — like bending a paper clip back and forth until it breaks. Predicts long-term durability under repeated loading.",
    detail:
      "Measured in cycles to failure. 'Infinite life' means the stress is below the endurance limit and the part will last indefinitely under normal use.",
  },
  impactResistance: {
    title: "Impact Resistance",
    description:
      "Can this part survive being dropped, bumped, or crashed? Estimates energy absorption capacity — how much impact force the part can handle before failing.",
    detail:
      "Rated as excellent/adequate/marginal/insufficient. Safety factor above 1.5 means the part absorbs significantly more energy than a typical drop or impact would deliver.",
  },
  stepFile: {
    title: "STEP File",
    description:
      "An industry-standard 3D CAD file format (Standard for the Exchange of Product Data). Opens in any professional CAD software — SolidWorks, Fusion 360, FreeCAD, etc.",
    detail:
      "STEP files preserve exact geometry with mathematical precision. Use this for manufacturing, further engineering, or sending to a machining shop.",
  },
  stlFile: {
    title: "STL File",
    description:
      "A 3D file format used for 3D printing (STereoLithography). Represents the surface as a mesh of triangles — ready to send directly to a 3D printer.",
    detail:
      "STL files are simpler than STEP but lose some precision. Best for 3D printing, prototyping, and visual review. Not ideal for CNC machining.",
  },

  // ── Timeline ──
  timeline: {
    title: "Timeline Overview",
    description:
      "A Gantt-style visualization showing how long each module takes to procure. The longest bar is your critical path — the minimum time to get all parts.",
    detail:
      "Bars are proportional to lead time in weeks. The orange bar is the critical path. To ship faster, focus on shortening the longest lead time.",
  },

  // ── Risk Register ──
  riskRegister: {
    title: "Risk Register",
    description:
      "A complete inventory of everything that could go wrong, aggregated across all modules. Three types: known failure modes, open unknowns, and risks derived from your diagnostic answers.",
    detail:
      "Professional engineering teams maintain risk registers to track and mitigate problems before they become expensive. Review this early and often.",
  },
  failureMode: {
    title: "Failure Mode",
    description:
      "A specific way this component could fail — e.g., 'bearing seizure', 'seal degradation', 'thermal runaway'. Known from industry experience with similar designs.",
    detail:
      "Addressing failure modes early (through design changes, material selection, or testing) is far cheaper than discovering them after manufacturing.",
  },
  unknown: {
    title: "Unknown / Open Question",
    description:
      "Something that hasn't been decided yet. Not a risk per se, but a decision that needs to be made before the design can be finalized.",
    detail:
      "Unknowns create uncertainty in cost and timeline estimates. The more unknowns you resolve through the diagnostic process, the more accurate your quotes become.",
  },
  derivedRisk: {
    title: "Derived Risk",
    description:
      "A risk identified from your specific diagnostic answers — unique to your design choices. These emerge when the AI analyzes the combination of options you selected.",
    detail:
      "For example, choosing a specific material + high temperature operation might create a thermal expansion risk that wouldn't exist with different choices.",
  },

  // ── Diagnostics ──
  gatingDiagnostic: {
    title: "Gating Diagnostic",
    description:
      "A focused questionnaire for your most critical module. Your answers determine the manufacturing process class, which unlocks accurate supplier matching and cost estimates.",
    detail:
      "This is the single highest-leverage activity in the design process. Completing it transforms vague estimates into actionable procurement data.",
  },
  supplierMatching: {
    title: "Supplier Matching",
    description:
      "The system finds suppliers whose capabilities match your module requirements. More specific diagnostic answers = more precise matches.",
  },

  // ── Review Package ──
  executiveSummary: {
    title: "Executive Summary",
    description:
      "A reviewer-friendly overview of all engineering analysis results. Shows the overall pass/fail verdict and key metrics so decision-makers can quickly assess design readiness.",
    detail:
      "This is the same information a design review board would want to see. Green = proceed, yellow = review needed, red = redesign required.",
  },
  convergenceAnalysis: {
    title: "Convergence Analysis",
    description:
      "Did the AI design optimizer successfully meet all engineering criteria? Shows iteration history and which criteria are met vs. still failing.",
    detail:
      "Converged = all criteria met, design is optimized. Max iterations = optimizer couldn't solve everything — manual review needed for remaining issues.",
  },
  thermalAnalysis: {
    title: "Thermal Analysis",
    description:
      "Temperature distribution across the part during operation. Checks whether any area exceeds the material's temperature limit.",
    detail:
      "Hot spots can cause material degradation, warping, or failure. Especially important for parts near heat sources (motors, power electronics, friction surfaces).",
  },
  actionItems: {
    title: "Action Items",
    description:
      "Specific things that need human decision or intervention — design changes, material substitutions, or further testing. These are flagged by the analysis pipeline.",
    detail:
      "Critical items block manufacturing. Warning items should be addressed but aren't showstoppers. Info items are nice-to-know optimizations.",
  },

  // ── People / Team Map ──
  teamCapabilities: {
    title: "Team & Capabilities",
    description:
      "Shows which engineering disciplines your project needs, based on the expert questions identified during concept analysis. Matched experts from the marketplace are shown below.",
    detail:
      "Each discipline has a set of questions that a specialist in that field would need to answer. The number of questions indicates depth of expertise needed.",
  },
  expertMatching: {
    title: "Expert Matching",
    description:
      "The platform searches the marketplace for professionals whose skills match your project's discipline requirements. Matches are ranked by relevance.",
    detail:
      "Verified experts have been credential-checked. Response time and hire count help you pick people who are available and proven.",
  },

  // ── Supply Chain ──
  supplyChain: {
    title: "Supply Chain",
    description:
      "Potential suppliers matched to each module based on capabilities, process class, and requirements. Click a supplier card to assign them to a module.",
    detail:
      "Completing the gating diagnostic makes matches more precise because the system knows your exact manufacturing process. Without it, matches are broader.",
  },
  processClass: {
    title: "Process Class",
    description:
      "The manufacturing method for your product — e.g., 'CNC machining', 'injection molding', 'SLA 3D printing'. Determined by your gating diagnostic answers.",
    detail:
      "Different process classes have dramatically different costs, lead times, and minimum quantities. Getting this right is essential for accurate procurement.",
  },
  supplierVerified: {
    title: "Verified Supplier",
    description:
      "This supplier has been credential-checked and their capabilities confirmed. Verified suppliers tend to be more reliable with quotes and delivery.",
  },
  warranty: {
    title: "Warranty Period",
    description:
      "How long the supplier guarantees the part against defects after delivery. Longer warranties indicate higher confidence in their work.",
  },

  // ── Contracting ──
  rfqPack: {
    title: "Request for Quotation (RFQ) Pack",
    description:
      "A formal document package sent to suppliers asking them to quote a price, timeline, and terms for manufacturing your modules. Generated from your project data.",
    detail:
      "A good RFQ pack includes: technical specifications, quantities, quality requirements, delivery terms, and submission deadline. It's the starting point for procurement.",
  },
  sow: {
    title: "Statement of Work (SOW)",
    description:
      "A detailed contract document that defines exactly what the supplier will deliver, when, at what quality standard, and under what terms.",
    detail:
      "SOWs protect both parties. They include: scope of work, deliverables, acceptance criteria, payment schedule, and change management process.",
  },
  nda: {
    title: "Non-Disclosure Agreement (NDA)",
    description:
      "A legal agreement that protects your intellectual property when sharing technical details with suppliers. Prevents them from sharing your design with competitors.",
    detail:
      "Essential before sharing detailed CAD files, process specifications, or proprietary designs with any supplier. Standard practice in manufacturing procurement.",
  },
  rfqReadiness: {
    title: "RFQ Readiness",
    description:
      "A checklist of prerequisites for sending out a Request for Quotation. All items should be green before you ask suppliers to quote — incomplete data leads to inaccurate quotes.",
    detail:
      "Process class, supplier assignments, and cost estimates are the foundation. Without them, suppliers will pad their quotes with uncertainty margins.",
  },
  moduleReadiness: {
    title: "Module Readiness",
    description:
      "Per-module procurement status. Shows which modules have suppliers assigned, cost estimates, and contracts generated.",
    detail:
      "Green = fully ready for procurement. Missing indicators show what's still needed before you can place an order for that module.",
  },
} as const
