"use client"

/**
 * @file brief-section.tsx — Section 1: What are you building?
 *
 * INTENT: Combines the hero input (from hero-section.tsx) and the
 * manufacturing preferences (from design-intake-form.tsx) into one
 * unified input area. The user describes their product and optionally
 * specifies manufacturing details before kicking off research.
 *
 * DECISION: Kept the template quick-start cards because they dramatically
 * lower the barrier to entry. Dropped the reference model preview from
 * the brief — it appears in the Research section instead.
 */

import { useState, useMemo, useEffect, useRef } from "react"
import Image from "next/image"
import {
  Search,
  ArrowRight,
  Loader2,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Box,
  Factory,
  Ruler,
  Scale,
  ShieldCheck,
  FileText,
  Settings2,
  Layers,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BriefSpecialistDialog } from "@/app/(platform)/agents/brief-specialist-dialog"
import { getSpecialistById } from "@/app/(platform)/agents/specialists-data"
import { CLAUDE_MODELS } from "@/lib/cad-lab-types"
import type { ClaudeModelId } from "@/lib/cad-lab-types"

import { useCadLab } from "../../cad-lab/cad-lab-context"

// ─── Constants ────────────────────────────────────────────────────────

const EXAMPLE_PROMPTS = [
  "CubeSat frame",
  "Drone arm bracket",
  "Reaction wheel housing",
  "EV battery enclosure",
  "Robotic gripper",
]

const QUICK_START_TEMPLATES = [
  { id: "cubesat", label: "CubeSat Bus", subject: "1U CubeSat structural bus frame (100×100×100mm) with PC-104 avionics stack mounting, solar panel rail interfaces, and deployment switch cutout per CDS rev 14", image: "/cad-lab/templates/cubesat.png", complexity: "Aerospace" },
  { id: "rocket", label: "Rocket Thrust Mount", subject: "Bipropellant rocket engine thrust structure with gimbal bearing attachment points, regenerative cooling channel interfaces, and propellant feed-through ports for 5kN class engine", image: "/cad-lab/templates/rocket-mount.png", complexity: "Aerospace" },
  { id: "ev-battery", label: "EV Battery Module", subject: "Prismatic cell battery module enclosure with liquid cooling channels, BMS mounting plate, thermal runaway vent ports, and HV busbar connectors for 400V architecture", image: "/cad-lab/templates/ev-battery.png", complexity: "Automotive" },
  { id: "robotic-arm", label: "Robotic Arm Joint", subject: "6-DOF robotic arm wrist joint with harmonic drive gear housing, precision encoder mount, cable passthrough channels, and force-torque sensor interface", image: "/cad-lab/templates/robotic-arm.png", complexity: "Robotics" },
  { id: "reaction-wheel", label: "Reaction Wheel", subject: "Satellite reaction wheel assembly with precision flywheel housing, BLDC motor mount, optical encoder interface, and vibration-isolated mounting flange", image: "/cad-lab/templates/reaction-wheel.png", complexity: "Aerospace" },
  { id: "heavy-drone", label: "Heavy-Lift Drone", subject: "Octocopter heavy-lift drone frame with coaxial motor mounts, central payload bay with 3-axis gimbal interface, retractable landing gear, and folding arm hinges in carbon fiber", image: "/cad-lab/templates/heavy-drone.png", complexity: "UAV" },
] as const

const TARGET_PROCESS_OPTIONS = [
  "CNC Machining", "Sheet Metal", "Injection Molding", "Casting",
  "FDM 3D Print", "SLS/Powder Print", "Manual Assembly", "Undecided",
] as const

const TARGET_MATERIAL_OPTIONS = [
  "Aluminium", "Steel/Stainless", "ABS/Nylon", "PLA/PETG",
  "Carbon Fiber Composite", "Copper/Brass", "Titanium", "Undecided",
] as const

const TOLERANCE_OPTIONS = [
  "±1mm (concept)", "±0.5mm (standard)", "±0.1mm (precision)",
  "±0.05mm (tight fit)", "Undecided",
] as const

const QUANTITY_OPTIONS = [
  "Prototype (1-5)", "Pilot (10-100)", "Low-volume (100-1000)",
  "Production (1000+)", "Undecided",
] as const

// ─── Component ────────────────────────────────────────────────────────

export function BriefSection(): React.ReactNode {
  const {
    subject, setSubject,
    modelId, setModelId,
    designBrief, setDesignBrief,
    assumptionNotes, setAssumptionNotes,
    designReadinessPct,
    isAnyLoading, isResearching, hasResearch,
    handleResearch, handleReset,
    modules, isDecomposing,
    handleDecompose, editableReport,
  } = useCadLab()

  const [showManufacturing, setShowManufacturing] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isSpecialistOpen, setIsSpecialistOpen] = useState(false)
  const fang = useMemo(() => getSpecialistById("vp-manufacturing"), [])
  const pendingTemplateRef = useRef(false)
  const subjectTrimmed = subject.trim().length > 0

  const specialistContext = subject.trim()
    ? `The user is designing a product in The Forge. So far they've described it as: "${subject}". Help them refine this into a clear, manufacturing-focused engineering brief.`
    : `The user is about to describe a product they want to build. Help them think through what to build and how to describe it clearly for manufacturing research.`

  function handleSelectTemplate(templateSubject: string): void {
    setSubject(templateSubject)
    pendingTemplateRef.current = true
  }

  useEffect(() => {
    if (pendingTemplateRef.current && subject.trim()) {
      pendingTemplateRef.current = false
      handleResearch()
    }
  }, [subject, handleResearch])

  // Auto-trigger decomposition after research completes
  useEffect(() => {
    if (hasResearch && modules.length === 0 && !isDecomposing && editableReport.trim()) {
      handleDecompose()
    }
  }, [hasResearch, modules.length, isDecomposing, editableReport, handleDecompose])

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-international-orange text-white text-xs font-bold">
            1
          </div>
          <h2 className="text-lg font-semibold text-foreground">What do you want to build?</h2>
        </div>
        <p className="text-sm text-muted-foreground ml-9">
          Describe any physical product or sub-assembly. The system will research real-world
          specs and generate parametric CAD.
        </p>
      </div>

      {/* Input card — hidden once research completes, to save vertical space */}
      {!hasResearch && (
        <>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="studio-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g., 1U CubeSat bus structure, EV battery module enclosure, 6-DOF robotic arm joint"
                    className="pl-10 h-12 text-base"
                    disabled={isAnyLoading}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && subjectTrimmed && !isAnyLoading) {
                        handleResearch()
                      }
                    }}
                  />
                </div>
                <Button
                  onClick={handleResearch}
                  disabled={isAnyLoading || !subjectTrimmed}
                  size="lg"
                  className="gap-2 h-12 px-6 shrink-0"
                >
                  {isResearching ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Researching...</>
                  ) : (
                    <>Research <ArrowRight className="h-4 w-4" /></>
                  )}
                </Button>
              </div>

              {/* Example chips */}
              {!isResearching && !subjectTrimmed && (
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

              {/* Specialist help */}
              {!isResearching && fang && (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setIsSpecialistOpen(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Sparkles className="h-3 w-3 text-international-orange" />
                    Not sure? Ask {fang.name}
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Collapsible manufacturing details */}
          <Card>
            <button
              onClick={() => setShowManufacturing(!showManufacturing)}
              className="w-full text-left p-4 sm:p-6 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors rounded-xl"
              aria-expanded={showManufacturing}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Manufacturing details
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Improve research accuracy and build toward a supplier-ready RFQ
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden sm:flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-international-orange rounded-full transition-all duration-500"
                      style={{ width: `${designReadinessPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{designReadinessPct}%</span>
                </div>
                {showManufacturing ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {showManufacturing && (
              <CardContent className="pt-0 pb-6 px-4 sm:px-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="studio-use-case" className="flex items-center gap-1.5">
                      <Ruler className="h-3.5 w-3.5" /> Use case & critical dimensions
                    </Label>
                    <Textarea
                      id="studio-use-case"
                      value={designBrief.useCase}
                      onChange={(e) => setDesignBrief((prev) => ({ ...prev, useCase: e.target.value }))}
                      placeholder="e.g. Outdoor heavy-lift UAV payload mount, 300×220×120mm envelope"
                      className="min-h-[84px]"
                      disabled={isAnyLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="studio-compliance" className="flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5" /> Compliance and constraints
                    </Label>
                    <Textarea
                      id="studio-compliance"
                      value={designBrief.complianceNotes}
                      onChange={(e) => setDesignBrief((prev) => ({ ...prev, complianceNotes: e.target.value }))}
                      placeholder="e.g. IP54, RoHS, food-safe surfaces"
                      className="min-h-[84px]"
                      disabled={isAnyLoading}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Factory className="h-3.5 w-3.5" /> Process</Label>
                    <Select value={designBrief.targetProcess} onValueChange={(v) => setDesignBrief((prev) => ({ ...prev, targetProcess: v }))} disabled={isAnyLoading}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{TARGET_PROCESS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Box className="h-3.5 w-3.5" /> Material</Label>
                    <Select value={designBrief.targetMaterial} onValueChange={(v) => setDesignBrief((prev) => ({ ...prev, targetMaterial: v }))} disabled={isAnyLoading}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{TARGET_MATERIAL_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Scale className="h-3.5 w-3.5" /> Tolerance</Label>
                    <Select value={designBrief.toleranceTarget} onValueChange={(v) => setDesignBrief((prev) => ({ ...prev, toleranceTarget: v }))} disabled={isAnyLoading}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{TOLERANCE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Select value={designBrief.quantityTarget} onValueChange={(v) => setDesignBrief((prev) => ({ ...prev, quantityTarget: v }))} disabled={isAnyLoading}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{QUANTITY_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="studio-assumptions">Known assumptions or non-negotiables</Label>
                  <Textarea
                    id="studio-assumptions"
                    value={assumptionNotes}
                    onChange={(e) => setAssumptionNotes(e.target.value)}
                    placeholder="e.g. Must fit existing M3 bolt pattern at 60mm PCD"
                    className="min-h-[72px]"
                    disabled={isAnyLoading}
                  />
                </div>

                {/* Advanced: Model selector */}
                <div className="border-t pt-4">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    <span className="font-medium">Advanced settings</span>
                    {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                  {showAdvanced && (
                    <div className="mt-3 max-w-xs space-y-2">
                      <Label htmlFor="studio-model">Claude Model</Label>
                      <Select value={modelId} onValueChange={(v) => setModelId(v as ClaudeModelId)} disabled={isAnyLoading}>
                        <SelectTrigger id="studio-model"><SelectValue /></SelectTrigger>
                        <SelectContent>{CLAUDE_MODELS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Quick-start templates */}
          {!isResearching && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Or start from a template:</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {QUICK_START_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTemplate(t.subject)}
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
        </>
      )}

      {/* Compact summary when research is done */}
      {hasResearch && (
        <Card className="bg-status-success-light/10 border-status-success/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status-success-light">
                  <Layers className="h-4 w-4 text-status-success" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{subject}</p>
                  <p className="text-xs text-muted-foreground">Research complete &middot; {modules.length} sub-assemblies</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => {
                handleReset()
                window.scrollTo({ top: 0, behavior: "smooth" })
              }}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Start over
              </Button>
            </div>
          </CardContent>
        </Card>
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
