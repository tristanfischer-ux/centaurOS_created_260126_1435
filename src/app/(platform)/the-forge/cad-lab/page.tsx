"use client"

/**
 * @file page.tsx — The Forge: Research stage (Stage 1).
 *
 * @description Landing page for The Forge pipeline. Shows hero content
 * and quick-start templates before research, and the editable research
 * report + sources after research completes. Auto-triggers decomposition
 * and navigates to /build once modules are mapped.
 */

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Loader2,
  Search,
  Box,
  FileText,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Globe,
  ExternalLink,
  RotateCcw,
  Download,
  Printer,
  Ruler,
  ArrowRight,
  BarChart3,
  Factory,
  Scale,
  ShieldCheck,
  ClipboardList,
  ShoppingCart,
  ClipboardCheck,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Markdown } from "@/components/ui/markdown"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CLAUDE_MODELS } from "@/lib/cad-lab-types"
import type { ClaudeModelId } from "@/lib/cad-lab-types"

import { useCadLab } from "./cad-lab-context"

// ─── Quick-start templates ───────────────────────────────────────────

const QUICK_START_TEMPLATES = [
  { id: "cubesat", label: "CubeSat Bus", subject: "1U CubeSat structural bus frame (100×100×100mm) with PC-104 avionics stack mounting, solar panel rail interfaces, and deployment switch cutout per CDS rev 14", image: "/cad-lab/templates/cubesat.png", complexity: "Aerospace" },
  { id: "rocket", label: "Rocket Thrust Mount", subject: "Bipropellant rocket engine thrust structure with gimbal bearing attachment points, regenerative cooling channel interfaces, and propellant feed-through ports for 5kN class engine", image: "/cad-lab/templates/rocket-mount.png", complexity: "Aerospace" },
  { id: "ev-battery", label: "EV Battery Module", subject: "Prismatic cell battery module enclosure with liquid cooling channels, BMS mounting plate, thermal runaway vent ports, and HV busbar connectors for 400V architecture", image: "/cad-lab/templates/ev-battery.png", complexity: "Automotive" },
  { id: "robotic-arm", label: "Robotic Arm Joint", subject: "6-DOF robotic arm wrist joint with harmonic drive gear housing, precision encoder mount, cable passthrough channels, and force-torque sensor interface", image: "/cad-lab/templates/robotic-arm.png", complexity: "Robotics" },
  { id: "reaction-wheel", label: "Reaction Wheel", subject: "Satellite reaction wheel assembly with precision flywheel housing, BLDC motor mount, optical encoder interface, and vibration-isolated mounting flange", image: "/cad-lab/templates/reaction-wheel.png", complexity: "Aerospace" },
  { id: "heavy-drone", label: "Heavy-Lift Drone", subject: "Octocopter heavy-lift drone frame with coaxial motor mounts, central payload bay with 3-axis gimbal interface, retractable landing gear, and folding arm hinges in carbon fiber", image: "/cad-lab/templates/heavy-drone.png", complexity: "UAV" },
] as const

// ─── Pipeline preview shown during research wait ─────────────────────

const PIPELINE_STAGES = [
  { icon: Search, label: "Research", desc: "Real-world specs from datasheets" },
  { icon: Box, label: "Build", desc: "Parametric CAD for each module" },
  { icon: BarChart3, label: "Analysis", desc: "Risk register & timeline" },
  { icon: ShoppingCart, label: "Procurement", desc: "Costs & supply chain" },
  { icon: ClipboardCheck, label: "Review", desc: "Supplier-ready package" },
]

const TARGET_PROCESS_OPTIONS = [
  "CNC Machining",
  "Sheet Metal",
  "Injection Molding",
  "Casting",
  "FDM 3D Print",
  "SLS/Powder Print",
  "Manual Assembly",
  "Undecided",
] as const

const TARGET_MATERIAL_OPTIONS = [
  "Aluminium",
  "Steel/Stainless",
  "ABS/Nylon",
  "PLA/PETG",
  "Carbon Fiber Composite",
  "Copper/Brass",
  "Titanium",
  "Undecided",
] as const

const TOLERANCE_OPTIONS = [
  "±1mm (concept)",
  "±0.5mm (standard)",
  "±0.1mm (precision)",
  "±0.05mm (tight fit)",
  "Undecided",
] as const

const QUANTITY_OPTIONS = [
  "Prototype (1-5)",
  "Pilot (10-100)",
  "Low-volume (100-1000)",
  "Production (1000+)",
  "Undecided",
] as const

// ─── Page Component ──────────────────────────────────────────────────

export default function CadLabResearchPage(): React.ReactNode {
  const router = useRouter()
  const {
    subject, setSubject,
    modelId, setModelId,
    designBrief, setDesignBrief,
    assumptionNotes, setAssumptionNotes,
    designReadinessPct,
    isResearching, researchResult, editableReport, setEditableReport,
    showSources, setShowSources,
    hasResearch, isAnyLoading,
    handleResearch, handleReset, handleDecompose,
    modules, isDecomposing, milestone,
  } = useCadLab()

  // Auto-decompose after research completes (only if no modules yet)
  const hasAutoDecomposed = useRef(false)
  useEffect(() => {
    if (hasResearch && modules.length === 0 && !isDecomposing && !hasAutoDecomposed.current) {
      hasAutoDecomposed.current = true
      const timer = setTimeout(() => { handleDecompose() }, 1500)
      return () => clearTimeout(timer)
    }
  }, [hasResearch, modules.length, isDecomposing, handleDecompose])

  // Reset auto-decompose flag when starting fresh
  useEffect(() => {
    if (!hasResearch) hasAutoDecomposed.current = false
  }, [hasResearch])

  // Auto-navigate to /build after decompose completes
  useEffect(() => {
    if (milestone === "breakdown" && modules.length > 0) {
      const timer = setTimeout(() => {
        router.push("/the-forge/cad-lab/build")
      }, 2500) // Let milestone banner show briefly
      return () => clearTimeout(timer)
    }
  }, [milestone, modules.length, router])

  return (
    <div className="space-y-6">
      {/* ── Hero landing (before research) ── */}
      {!hasResearch && !isResearching && (
        <div className="space-y-8">
          {/* Hero banner */}
          <div className="relative rounded-xl overflow-hidden border border-muted">
            <Image
              src="/cad-lab/hero.png"
              alt="From idea to manufacturing-ready CAD"
              width={1200}
              height={400}
              className="w-full h-auto object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-transparent flex items-center">
              <div className="p-8 max-w-lg">
                <h2 className="text-2xl font-bold text-foreground leading-tight">
                  Parametric CAD from a single sentence
                </h2>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Describe any physical product. The system researches real-world specifications, generates
                  parametric CadQuery models with 7 orthographic projections, runs DFM analysis, and
                  delivers STEP + STL exports with center-of-gravity data.
                </p>
              </div>
            </div>
          </div>

          {/* Credibility stats bar */}
          <div className="flex items-center justify-center gap-6 py-3 px-4 rounded-lg bg-muted/50 border border-muted text-xs text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">256</span> Parametric Components
            <span className="text-muted">|</span>
            <span className="font-mono font-semibold text-foreground">15</span> Industry Sectors
            <span className="text-muted">|</span>
            <span className="font-mono font-semibold text-foreground">7</span> Projection Views
            <span className="text-muted">|</span>
            <span className="font-mono font-semibold text-foreground">STEP + STL</span> Export
          </div>

          {/* 5 Capability cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { icon: Search, title: "AI Research", desc: "Real-world specs from datasheets, reference designs, and engineering databases" },
              { icon: Box, title: "256 Components", desc: "Parametric library spanning CubeSats, EVs, drones, robotics, and more" },
              { icon: Printer, title: "DFM Analysis", desc: "Printability, support volume, material usage, and compatible printers" },
              { icon: Ruler, title: "Mass Properties", desc: "Bounding box, mass, volume, surface area, and center-of-gravity coordinates" },
              { icon: Download, title: "STEP + STL", desc: "Industry-standard exports compatible with SolidWorks, Fusion 360, and any slicer" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex flex-col items-center gap-2 p-4 rounded-lg border border-muted bg-card text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-international-orange-light">
                  <Icon className="h-5 w-5 text-international-orange" />
                </div>
                <h3 className="text-xs font-semibold text-foreground">{title}</h3>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          {/* Quick-start templates */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Quick Start — select an engineering template or describe your own product</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {QUICK_START_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSubject(t.subject)
                    setTimeout(() => {
                      const btn = document.getElementById("research-btn")
                      if (btn) btn.click()
                    }, 400)
                  }}
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
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                    {t.complexity}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Pipeline preview during research wait ── */}
      {isResearching && (
        <Card className="border-international-orange/20">
          <CardContent className="pt-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">What happens next</p>
            <div className="flex items-start gap-2">
              {PIPELINE_STAGES.map((stage, i) => {
                const Icon = stage.icon
                const isCurrent = i === 0
                return (
                  <div key={stage.label} className="flex items-start flex-1">
                    {i > 0 && <div className={`h-0.5 flex-1 mt-4 ${isCurrent ? "bg-international-orange" : "bg-muted"}`} />}
                    <div className="flex flex-col items-center gap-1.5 text-center">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isCurrent ? "bg-international-orange text-white" : "bg-muted text-muted-foreground"}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className={`text-[10px] font-medium ${isCurrent ? "text-international-orange" : "text-muted-foreground"}`}>
                        {stage.label}
                      </span>
                      <span className="text-[9px] text-muted-foreground leading-tight hidden sm:block">
                        {stage.desc}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Structured design intake ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Design Intake
            <span className="text-xs font-normal text-muted-foreground">
              RFQ readiness: {designReadinessPct}%
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-international-orange rounded-full transition-all duration-500"
              style={{ width: `${designReadinessPct}%` }}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="use-case" className="flex items-center gap-1.5">
                <Ruler className="h-3.5 w-3.5" /> Use case & critical dimensions
              </Label>
              <Textarea
                id="use-case"
                value={designBrief.useCase}
                onChange={(e) => setDesignBrief((prev) => ({ ...prev, useCase: e.target.value }))}
                placeholder="e.g. Outdoor heavy-lift UAV payload mount, 300×220×120mm envelope, must survive 20g shock"
                className="min-h-[84px]"
                disabled={isAnyLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="compliance" className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Compliance and constraints
              </Label>
              <Textarea
                id="compliance"
                value={designBrief.complianceNotes}
                onChange={(e) => setDesignBrief((prev) => ({ ...prev, complianceNotes: e.target.value }))}
                placeholder="e.g. IP54 ingress protection, ASTM F963 edges, RoHS, food-safe surfaces"
                className="min-h-[84px]"
                disabled={isAnyLoading}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target-process" className="flex items-center gap-1.5">
                <Factory className="h-3.5 w-3.5" /> Process
              </Label>
              <Select
                value={designBrief.targetProcess}
                onValueChange={(v) => setDesignBrief((prev) => ({ ...prev, targetProcess: v }))}
                disabled={isAnyLoading}
              >
                <SelectTrigger id="target-process">
                  <SelectValue placeholder="Select process" />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_PROCESS_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-material" className="flex items-center gap-1.5">
                <Box className="h-3.5 w-3.5" /> Material
              </Label>
              <Select
                value={designBrief.targetMaterial}
                onValueChange={(v) => setDesignBrief((prev) => ({ ...prev, targetMaterial: v }))}
                disabled={isAnyLoading}
              >
                <SelectTrigger id="target-material">
                  <SelectValue placeholder="Select material" />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_MATERIAL_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-tolerance" className="flex items-center gap-1.5">
                <Scale className="h-3.5 w-3.5" /> Tolerance
              </Label>
              <Select
                value={designBrief.toleranceTarget}
                onValueChange={(v) => setDesignBrief((prev) => ({ ...prev, toleranceTarget: v }))}
                disabled={isAnyLoading}
              >
                <SelectTrigger id="target-tolerance">
                  <SelectValue placeholder="Select tolerance" />
                </SelectTrigger>
                <SelectContent>
                  {TOLERANCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-quantity">Quantity target</Label>
              <Select
                value={designBrief.quantityTarget}
                onValueChange={(v) => setDesignBrief((prev) => ({ ...prev, quantityTarget: v }))}
                disabled={isAnyLoading}
              >
                <SelectTrigger id="target-quantity">
                  <SelectValue placeholder="Select quantity" />
                </SelectTrigger>
                <SelectContent>
                  {QUANTITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="assumptions">Known assumptions or non-negotiables (optional)</Label>
            <Textarea
              id="assumptions"
              value={assumptionNotes}
              onChange={(e) => setAssumptionNotes(e.target.value)}
              placeholder="e.g. Must fit existing M3 bolt pattern at 60mm PCD; supplier must support PPAP level 3"
              className="min-h-[72px]"
              disabled={isAnyLoading}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Model selector ── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="subject">Product or sub-assembly to engineer</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., 1U CubeSat bus structure, EV battery module enclosure, 6-DOF robotic arm joint"
                disabled={isAnyLoading}
              />
            </div>
            <div className="w-64 space-y-2">
              <Label htmlFor="model">Claude Model</Label>
              <Select
                value={modelId}
                onValueChange={(v) => setModelId(v as ClaudeModelId)}
                disabled={isAnyLoading}
              >
                <SelectTrigger id="model">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {CLAUDE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Research button ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Research Real Dimensions
            {researchResult?.success && (
              <span className="text-xs font-normal text-status-success flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Complete ({(researchResult.researchTime / 1000).toFixed(1)}s)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Before anything else, search for real-world reference dimensions. Never invent dimensions.
          </p>
          <div className="flex items-center gap-2">
            <Button
              id="research-btn"
              onClick={handleResearch}
              disabled={isAnyLoading || !subject.trim()}
              variant={hasResearch ? "secondary" : "default"}
            >
              {isResearching ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Researching...</>
              ) : hasResearch ? (
                <><RotateCcw className="h-4 w-4 mr-2" />Re-Research</>
              ) : (
                <><Search className="h-4 w-4 mr-2" />Research Product</>
              )}
            </Button>
            {hasResearch && (
              <Button variant="ghost" size="sm" onClick={handleReset}>Start Over</Button>
            )}
          </div>

          {researchResult && !researchResult.success && researchResult.error && (
            <div className="p-3 bg-status-error-light rounded text-sm text-destructive font-mono">
              {researchResult.error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Research Report (editable) ── */}
      {hasResearch && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Research Report
              <span className="text-xs font-normal text-muted-foreground">
                (review and edit dimensions before proceeding)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-md p-4 bg-muted/30">
              <Markdown content={editableReport} className="text-sm text-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">
              {editableReport.length.toLocaleString()} characters
            </p>
            <details className="border rounded-md">
              <summary className="cursor-pointer p-3 text-sm font-medium hover:bg-muted/50 transition-colors">
                Edit raw markdown
              </summary>
              <div className="p-3 border-t">
                <Textarea
                  value={editableReport}
                  onChange={(e) => setEditableReport(e.target.value)}
                  className="font-mono text-xs min-h-[400px]"
                  disabled={isAnyLoading}
                />
              </div>
            </details>
          </CardContent>
        </Card>
      )}

      {/* ── Research Sources ── */}
      {researchResult?.success &&
        ((researchResult.sources.length > 0) || (researchResult.referenceModels.length > 0)) && (
        <Card>
          <CardHeader>
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center justify-between w-full text-left"
            >
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Research Sources
                <span className="text-xs font-normal text-muted-foreground">
                  ({researchResult.sources.length} web + {researchResult.referenceModels.length} CAD refs)
                </span>
              </CardTitle>
              {showSources ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </CardHeader>
          {showSources && (
            <CardContent className="space-y-4">
              {researchResult.sources.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Web Sources</p>
                  <ul className="space-y-1">
                    {researchResult.sources.map((source, i) => (
                      <li key={i} className="text-xs font-mono flex items-start gap-1.5">
                        <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <a
                          href={source.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-electric-blue hover:underline truncate"
                        >
                          {source.title || source.uri}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Auto-decomposing indicator ── */}
      {hasResearch && modules.length === 0 && !isDecomposing && !isResearching && (
        <Card className="border-international-orange/20">
          <CardContent className="pt-6 flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
            <p className="text-sm text-muted-foreground">Preparing to map sub-assemblies...</p>
          </CardContent>
        </Card>
      )}

      {/* ── Proceed to Build (if modules exist but user is still on Research) ── */}
      {hasResearch && modules.length > 0 && (
        <Card className="border-international-orange/30 bg-gradient-to-r from-international-orange-light/10 to-background">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {modules.length} sub-assemblies mapped
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ready to generate parametric CAD for each module.
                </p>
              </div>
              <Button onClick={() => router.push("/the-forge/cad-lab/build")} className="gap-1.5">
                Continue to Build
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
