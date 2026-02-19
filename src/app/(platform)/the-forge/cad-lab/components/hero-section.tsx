"use client"

/**
 * @file hero-section.tsx — Primary input area for The Forge pipeline.
 *
 * @description Focused entry point: a single prominent input for describing
 * what to build, an inline Research button, and quick-start templates.
 * Replaces the previous marketing-heavy hero with a clean action-first layout.
 */

import { useState, useMemo } from "react"
import Image from "next/image"
import { Search, ArrowRight, Loader2, RotateCcw, Box, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BriefSpecialistDialog } from "@/app/(platform)/agents/brief-specialist-dialog"
import { getSpecialistById } from "@/app/(platform)/agents/specialists-data"
import { ReferenceModelViewer } from "./reference-model-viewer"
import type { ReferenceModel } from "@/actions/reference-models"

// ─── Example prompt chips ────────────────────────────────────────────

const EXAMPLE_PROMPTS = [
  "CubeSat frame",
  "Drone arm bracket",
  "Reaction wheel housing",
  "EV battery enclosure",
  "Robotic gripper",
]

// ─── Quick-start templates ───────────────────────────────────────────

const QUICK_START_TEMPLATES = [
  { id: "cubesat", label: "CubeSat Bus", subject: "1U CubeSat structural bus frame (100×100×100mm) with PC-104 avionics stack mounting, solar panel rail interfaces, and deployment switch cutout per CDS rev 14", image: "/cad-lab/templates/cubesat.png", complexity: "Aerospace" },
  { id: "rocket", label: "Rocket Thrust Mount", subject: "Bipropellant rocket engine thrust structure with gimbal bearing attachment points, regenerative cooling channel interfaces, and propellant feed-through ports for 5kN class engine", image: "/cad-lab/templates/rocket-mount.png", complexity: "Aerospace" },
  { id: "ev-battery", label: "EV Battery Module", subject: "Prismatic cell battery module enclosure with liquid cooling channels, BMS mounting plate, thermal runaway vent ports, and HV busbar connectors for 400V architecture", image: "/cad-lab/templates/ev-battery.png", complexity: "Automotive" },
  { id: "robotic-arm", label: "Robotic Arm Joint", subject: "6-DOF robotic arm wrist joint with harmonic drive gear housing, precision encoder mount, cable passthrough channels, and force-torque sensor interface", image: "/cad-lab/templates/robotic-arm.png", complexity: "Robotics" },
  { id: "reaction-wheel", label: "Reaction Wheel", subject: "Satellite reaction wheel assembly with precision flywheel housing, BLDC motor mount, optical encoder interface, and vibration-isolated mounting flange", image: "/cad-lab/templates/reaction-wheel.png", complexity: "Aerospace" },
  { id: "heavy-drone", label: "Heavy-Lift Drone", subject: "Octocopter heavy-lift drone frame with coaxial motor mounts, central payload bay with 3-axis gimbal interface, retractable landing gear, and folding arm hinges in carbon fiber", image: "/cad-lab/templates/heavy-drone.png", complexity: "UAV" },
] as const

// ─── Component ───────────────────────────────────────────────────────

interface HeroSectionProps {
  /** Current product subject text */
  subject: string
  /** Callback to update the subject input */
  setSubject: (value: string) => void
  /** Matched reference model for instant visual (from matchReferenceModel) */
  referenceModel?: ReferenceModel | null
  /** Whether any operation is currently loading */
  isAnyLoading: boolean
  /** Whether research is currently in progress */
  isResearching: boolean
  /** Whether research has already completed */
  hasResearch: boolean
  /** Trigger the research action */
  onResearch: () => void
  /** Callback when a quick-start template is selected */
  onSelectTemplate: (subject: string) => void
}

/**
 * HeroSection — Focused entry point with product input, research button,
 * and quick-start templates. No marketing fluff — just the action.
 */
export function HeroSection({
  subject,
  setSubject,
  referenceModel,
  isAnyLoading,
  isResearching,
  hasResearch,
  onResearch,
  onSelectTemplate,
}: HeroSectionProps): React.ReactNode {
  const subjectTrimmed = subject.trim().length > 0
  const [isSpecialistOpen, setIsSpecialistOpen] = useState(false)
  const fang = useMemo(() => getSpecialistById("vp-manufacturing"), [])

  const specialistContext = subject.trim()
    ? `The user is designing a product in The Forge. So far they've described it as: "${subject}". Help them refine this into a clear, manufacturing-focused engineering brief — think about materials, process, tolerance, and scale.`
    : `The user is about to describe a product they want to build in The Forge engineering pipeline. Help them think through what to build and how to describe it clearly for manufacturing research.`

  return (
    <div className="space-y-6">
      {/* Primary input card */}
      <div className="rounded-xl border bg-card p-6 sm:p-8 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            What do you want to build?
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Describe any physical product or sub-assembly. The system will research real-world
            specs and generate concept-level parametric CAD to help you explore ideas—always
            have outputs checked by qualified people; use the marketplace to recruit experts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., 1U CubeSat bus structure, EV battery module enclosure, 6-DOF robotic arm joint"
              className="pl-10 h-12 text-base"
              disabled={isAnyLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && subjectTrimmed && !isAnyLoading) {
                  onResearch()
                }
              }}
            />
          </div>
          <Button
            id="research-btn"
            onClick={onResearch}
            disabled={isAnyLoading || !subjectTrimmed}
            size="lg"
            variant={hasResearch ? "secondary" : "default"}
            className="gap-2 h-12 px-6 shrink-0"
          >
            {isResearching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Researching...
              </>
            ) : hasResearch ? (
              <>
                <RotateCcw className="h-4 w-4" />
                Re-Research
              </>
            ) : (
              <>
                Research
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>

        {/* Example prompt chips */}
        {!hasResearch && !isResearching && !subjectTrimmed && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Try:</span>
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => setSubject(prompt)}
                className="text-xs px-2.5 py-1 rounded-full border border-muted bg-muted/50 text-muted-foreground hover:border-international-orange/40 hover:text-foreground transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        {!hasResearch && !isResearching && fang && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setIsSpecialistOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Sparkles className="h-3 w-3 text-international-orange" />
              Not sure how to describe it? Ask {fang.name}
            </button>
          </div>
        )}

        {referenceModel && !hasResearch && (
          <>
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Box className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <span className="text-sm font-medium text-foreground">Reference: {referenceModel.name}</span>
                {referenceModel.description && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{referenceModel.description}</p>
                )}
              </div>
            </div>
            <div className="pt-2">
              <ReferenceModelViewer stlUrl={referenceModel.stlUrl} minHeight={220} />
            </div>
          </>
        )}
      </div>

      {/* Quick-start templates */}
      {!hasResearch && !isResearching && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Or start from a template:
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {QUICK_START_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelectTemplate(t.subject)}
                className="group flex flex-col items-center gap-2 p-3 rounded-lg border border-muted bg-card hover:border-international-orange/50 hover:bg-international-orange-light/10 transition-all text-center cursor-pointer"
              >
                <Image
                  src={t.image}
                  alt={t.label}
                  width={80}
                  height={80}
                  className="rounded-md group-hover:scale-105 transition-transform"
                />
                <span className="text-xs font-medium text-foreground">{t.label}</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                  {t.complexity}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {fang && (
        <BriefSpecialistDialog
          specialist={fang}
          open={isSpecialistOpen}
          onOpenChange={setIsSpecialistOpen}
          handoffContext={specialistContext}
          contextLabel="Design Brief"
        />
      )}
    </div>
  )
}
