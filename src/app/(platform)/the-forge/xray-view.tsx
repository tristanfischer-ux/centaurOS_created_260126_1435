/**
 * @file xray-view.tsx — Main "The Forge" product dossier view (formerly Product X-Ray)
 *
 * @description Single-page scrollable product dossier that tells the story
 * of a product decomposition: idea → blueprint → architecture → modules →
 * timeline → risks → team → supply chain → diagnostic.
 *
 * Consolidates the best of v1 (interview system, RFQ) and v2 (narrative
 * layout, 3D CAD, engineering analysis) into a single unified page.
 *
 * @related
 * - Server actions: src/actions/xray.ts
 * - Schema: src/app/(platform)/the-forge/services/xray-schema.ts
 */

"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"

import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

import {
  scanIdeaAction,
  refineScanAction,
  refineModuleAction,
  deriveProcessClassAction,
  updateScanSpecAction,
  matchPeopleAction,
  matchSuppliersAction,
  generateImagesAction,
  generateCadModelsAction,
  analyzeModulesAction,
  runStructuralAnalysisAction,
  runConvergenceStepAction,
  runPremiumAnalysisAction,
} from "@/actions/xray"

import { ScanHero } from "./components/scan-hero"
import { SystemBlueprint } from "./components/system-blueprint"
import { ExecutiveDashboard } from "./components/executive-dashboard"
import { ModuleExplorer } from "./components/module-explorer"
import { TimelineView } from "./components/timeline-view"
import { RiskRegister } from "./components/risk-register"
import { TeamMap } from "./components/team-map"
import { SupplyChain } from "./components/supply-chain"
import { DiagnosticCenter } from "./components/diagnostic-center"
import { EngineeringSummary } from "./components/engineering-summary"
import { InterviewPanel } from "./components/interview-panel"
import { EditModuleDialog } from "./components/edit-module-dialog"
import { RfqSection } from "./components/rfq-section"

import type { XRaySpec, ModuleSpec } from "./services/xray-schema"
import type { PersonMatch } from "./services/people"
import type { SupplierMatch } from "./services/suppliers"

// ─── localStorage persistence ─────────────────────────────────────────

const STORAGE_KEY = "xray-workbench-state"
const LEGACY_STORAGE_KEY = "xray-v2-workbench-state"

interface PersistedState {
  spec: XRaySpec
  scanId?: string
  savedAt: string
}

function readPersistedState(): PersistedState | null {
  if (typeof window === "undefined") return null
  try {
    let raw = localStorage.getItem(STORAGE_KEY)
    // Fallback: migrate from legacy v2 key if new key is empty
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (raw) {
        localStorage.setItem(STORAGE_KEY, raw)
        localStorage.removeItem(LEGACY_STORAGE_KEY)
      }
    }
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (parsed && typeof parsed.spec === "object") return parsed
    return null
  } catch {
    console.warn("[XRay] Failed to parse persisted state, starting fresh.")
    return null
  }
}

function writePersistedState(state: PersistedState): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.warn("[XRay] Failed to persist state:", error instanceof Error ? error.message : "Unknown")
  }
}

// ─── Empty spec factory ───────────────────────────────────────────────

function newEmptySpec(idea: string): XRaySpec {
  return { idea, function: "", assumptions: [], materials: [], processes: [], validation: [], modules: [] }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function findGatingModule(modules: ModuleSpec[]): ModuleSpec | undefined {
  return modules.find((m) => m.isGatingModule) ?? modules.find((m) => m.id === "react")
}

function isGatingDiagComplete(spec: XRaySpec): boolean {
  const gating = findGatingModule(spec.modules)
  if (!gating) return true
  if (gating.diagnostic?.derivedProcessClass) return true
  return false
}

// ─── Main view ────────────────────────────────────────────────────────

/**
 * XRayView — The Product Dossier.
 *
 * @description Orchestrates the full X-Ray v2 page: scan workflow,
 * state management, image generation, people/supplier matching,
 * and renders all dossier sections in narrative order.
 */
export function XRayView(): React.ReactNode {
  const [spec, setSpecInternal] = useState<XRaySpec>(() => newEmptySpec(""))
  const [scanId, setScanId] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  // Interview state (ported from v1)
  const [interviewModule, setInterviewModule] = useState<ModuleSpec | null>(null)

  // Edit module dialog state
  const [editingModule, setEditingModule] = useState<ModuleSpec | null>(null)

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isRunningStructural, setIsRunningStructural] = useState(false)
  const [isRunningConvergence, setIsRunningConvergence] = useState(false)
  const [isRunningPremium, setIsRunningPremium] = useState(false)

  // People / supplier matching state
  const [people, setPeople] = useState<PersonMatch[]>([])
  const [isPeopleLoading, setIsPeopleLoading] = useState(false)
  const [suppliersByModule, setSuppliersByModule] = useState<Record<string, SupplierMatch[]>>({})
  const [isSuppliersLoading, setIsSuppliersLoading] = useState(false)

  const specRef = useRef<XRaySpec | null>(null)

  // Persist on every spec change
  const setSpec = useCallback((next: XRaySpec) => {
    setSpecInternal(next)
    specRef.current = next
    writePersistedState({ spec: next, scanId: scanId ?? undefined, savedAt: new Date().toISOString() })
  }, [scanId])

  // Restore from localStorage
  useEffect(() => {
    const persisted = readPersistedState()
    if (persisted) {
      setSpecInternal(persisted.spec)
      specRef.current = persisted.spec
      if (persisted.scanId) setScanId(persisted.scanId)
    }
    setIsHydrated(true)
  }, [])

  // Persist scanId changes
  useEffect(() => {
    if (!isHydrated || !specRef.current) return
    writePersistedState({ spec: specRef.current, scanId: scanId ?? undefined, savedAt: new Date().toISOString() })
  }, [scanId, isHydrated])

  // ── Persist spec to DB when scanId exists ───────────────────────────
  const persistSpec = useCallback(async (nextSpec: XRaySpec): Promise<void> => {
    if (!scanId) return
    try {
      await updateScanSpecAction(scanId, nextSpec)
    } catch (error) {
      console.warn("[XRay] Failed to persist spec:", error instanceof Error ? error.message : "Unknown")
    }
  }, [scanId])

  // ── Scan ────────────────────────────────────────────────────────────
  const handleScan = useCallback(async (idea: string): Promise<void> => {
    const trimmed = (idea || "").trim() || "New machine concept"
    setIsScanning(true)
    try {
      const result = await scanIdeaAction(trimmed)
      if ("error" in result) { toast.error(result.error); return }
      setScanId(result.scanId)
      setSpec(result.spec)
      toast.success(`Scan complete: ${result.spec.modules.length} modules identified`)

      // Trigger image generation in background
      setIsGeneratingImages(true)
      toast.info("Generating blueprint images...")
      generateImagesAction(result.scanId)
        .then((imgResult) => {
          if ("spec" in imgResult) {
            setSpec(imgResult.spec)
            const successCount = imgResult.spec.modules.filter(m => m.imageStatus === "complete").length
            if (successCount > 0) toast.success(`Generated ${successCount}/${imgResult.spec.modules.length} blueprint images`)
            if (imgResult.spec.systemImageStatus === "complete") toast.success("System diagram generated")
          } else {
            toast.error(imgResult.error || "Image generation failed")
          }
        })
        .catch((err) => {
          toast.error("Image generation failed")
          console.error("[XRay] Image error:", err)
        })
        .finally(() => setIsGeneratingImages(false))
    } catch (error) {
      toast.error("Scan failed. Please try again.")
      console.error("[XRay] Scan error:", error instanceof Error ? error.message : "Unknown")
    } finally {
      setIsScanning(false)
    }
  }, [setSpec])

  // ── Refine scan (update existing spec with edited idea via AI) ─────
  const handleRefineScan = useCallback(async (updatedIdea: string): Promise<void> => {
    if (!scanId) {
      // No existing scan — fall back to fresh scan
      return handleScan(updatedIdea)
    }

    const trimmed = (updatedIdea || "").trim() || "New machine concept"
    setIsScanning(true)
    try {
      const result = await refineScanAction(scanId, trimmed, spec)
      if ("error" in result) { toast.error(result.error); return }
      setScanId(result.scanId)
      setSpec(result.spec)
      toast.success(`Refined: ${result.spec.modules.length} modules updated`)

      // Trigger image generation for modules that need new images
      const needsImages = result.spec.modules.some((m) => m.imageStatus === "pending")
      if (needsImages) {
        setIsGeneratingImages(true)
        toast.info("Generating blueprint images for updated modules...")
        generateImagesAction(result.scanId)
          .then((imgResult) => {
            if ("spec" in imgResult) {
              setSpec(imgResult.spec)
              const successCount = imgResult.spec.modules.filter(m => m.imageStatus === "complete").length
              if (successCount > 0) toast.success(`Generated ${successCount} blueprint images`)
            }
          })
          .catch((err) => {
            toast.error("Image generation failed")
            console.error("[XRay] Image error:", err)
          })
          .finally(() => setIsGeneratingImages(false))
      }
    } catch (error) {
      toast.error("Refine failed. Please try again.")
      console.error("[XRay] Refine error:", error instanceof Error ? error.message : "Unknown")
    } finally {
      setIsScanning(false)
    }
  }, [scanId, spec, setSpec, handleScan])

  // ── Refine module (AI-assisted improvement of a single module) ─────
  const handleRefineModule = useCallback(async (editedModule: ModuleSpec): Promise<ModuleSpec> => {
    if (!scanId) {
      throw new Error("No scan ID available for module refinement")
    }

    const result = await refineModuleAction(scanId, editedModule, spec)
    if ("error" in result) {
      toast.error(result.error)
      throw new Error(result.error)
    }

    return result.module
  }, [scanId, spec])

  // ── Generate images manually ────────────────────────────────────────
  const handleGenerateImages = useCallback((): void => {
    if (!scanId) { toast.error("Scan first"); return }
    setIsGeneratingImages(true)
    toast.info("Generating blueprint images...")
    generateImagesAction(scanId)
      .then((imgResult) => {
        if ("spec" in imgResult) {
          setSpec(imgResult.spec)
          const successCount = imgResult.spec.modules.filter(m => m.imageStatus === "complete").length
          if (successCount > 0) toast.success(`Generated ${successCount} blueprint images`)
          if (imgResult.spec.systemImageStatus === "complete") toast.success("System diagram generated")
        } else {
          toast.error(imgResult.error || "Image generation failed")
        }
      })
      .catch((err) => {
        toast.error("Image generation failed")
        console.error("[XRay] Image error:", err)
      })
      .finally(() => setIsGeneratingImages(false))
  }, [scanId, setSpec])

  // ── Diagnostic ──────────────────────────────────────────────────────
  const handleDeriveProcessClass = useCallback(async (moduleId: string, answers: Record<string, string>): Promise<void> => {
    if (!scanId) return
    try {
      const result = await deriveProcessClassAction(scanId, moduleId, answers)
      if ("error" in result) { toast.error(result.error); return }
      setSpec(result.spec)
      toast.success("Process class derived")
    } catch (error) {
      toast.error("Failed to derive process class")
      console.error("[XRay] Diagnostic error:", error instanceof Error ? error.message : "Unknown")
    }
  }, [scanId, setSpec])

  // ── Module update (interview / diagnostic save) ─────────────────────
  const handleModuleUpdate = useCallback((updated: ModuleSpec): void => {
    const next = { ...spec, modules: spec.modules.map((m) => (m.id === updated.id ? updated : m)) }
    setSpec(next)
    persistSpec(next)
  }, [spec, setSpec, persistSpec])

  // ── CAD model generation (per-module, opt-in) ──────────────────────
  const handleGenerateCadModel = useCallback(async (moduleId: string): Promise<void> => {
    if (!scanId) { toast.error("Scan first"); return }
    toast.info("Generating 3D CAD model — this may take up to 2 minutes...")
    try {
      const result = await generateCadModelsAction(scanId, [moduleId])
      if ("error" in result) { toast.error(result.error); return }
      setSpec(result.spec)
      const targetModule = result.spec.modules.find((m) => m.id === moduleId)
      if (targetModule?.cadModel?.status === "complete") {
        toast.success(`3D model generated for ${targetModule.name}`)
      } else if (targetModule?.cadModel?.status === "failed") {
        toast.error(`3D model generation failed for ${targetModule.name}`)
      }
    } catch (error) {
      toast.error("CAD model generation failed")
      console.error("[XRay] CAD generation error:", error instanceof Error ? error.message : "Unknown")
    }
  }, [scanId, setSpec])

  // ── Engineering analysis ────────────────────────────────────────────
  const handleRunAnalysis = useCallback(async (): Promise<void> => {
    if (!scanId) { toast.error("Scan first"); return }
    setIsAnalyzing(true)
    toast.info("Running engineering analysis on all CAD models...")
    try {
      const result = await analyzeModulesAction(scanId)
      if ("error" in result) { toast.error(result.error); return }
      setSpec(result.spec)
      const analyzed = result.spec.modules.filter((m) => m.cadModel?.analysis?.massProperties).length
      toast.success(`Engineering analysis complete for ${analyzed} modules`)
    } catch (error) {
      toast.error("Engineering analysis failed")
      console.error("[XRay] Analysis error:", error instanceof Error ? error.message : "Unknown")
    } finally {
      setIsAnalyzing(false)
    }
  }, [scanId, setSpec])

  // ── Structural FEA ────────────────────────────────────────────────
  const handleRunStructural = useCallback(async (): Promise<void> => {
    if (!scanId) { toast.error("Scan first"); return }
    setIsRunningStructural(true)
    toast.info("Running structural FEA on modules with CAD models...")
    try {
      const result = await runStructuralAnalysisAction(scanId)
      if ("error" in result) { toast.error(result.error); return }
      setSpec(result.spec)
      const passed = result.spec.modules.filter(
        (m) => (m.cadModel?.analysis?.structural?.safetyFactor ?? 0) >= 1.5,
      ).length
      const total = result.spec.modules.filter(
        (m) => m.cadModel?.analysis?.structural,
      ).length
      toast.success(`Structural FEA complete: ${passed}/${total} modules pass`)
    } catch (error) {
      toast.error("Structural FEA failed")
      console.error("[XRay] FEA error:", error instanceof Error ? error.message : "Unknown")
    } finally {
      setIsRunningStructural(false)
    }
  }, [scanId, setSpec])

  // ── Convergence step ──────────────────────────────────────────────
  const handleRunConvergence = useCallback(async (): Promise<void> => {
    if (!scanId) { toast.error("Scan first"); return }
    setIsRunningConvergence(true)
    toast.info("Evaluating convergence criteria...")
    try {
      const result = await runConvergenceStepAction(scanId)
      if ("error" in result) { toast.error(result.error); return }
      setSpec(result.spec)
      const { evaluation, shouldContinue } = result
      if (evaluation.isConverged) {
        toast.success("All convergence criteria met! Design is optimized.")
      } else if (!shouldContinue) {
        toast.warning("Max iterations reached. Review proposed changes.")
      } else {
        const failing = evaluation.totalCount - evaluation.metCount
        toast.info(`${evaluation.proposedChanges.length} changes proposed. ${failing} criteria need improvement.`)
      }
    } catch (error) {
      toast.error("Convergence evaluation failed")
      console.error("[XRay] Convergence error:", error instanceof Error ? error.message : "Unknown")
    } finally {
      setIsRunningConvergence(false)
    }
  }, [scanId, setSpec])

  /** Run all premium analyses (EMI, Fatigue, Impact) on all modules */
  const handleRunPremium = useCallback(async (): Promise<void> => {
    if (!scanId) { toast.error("Scan first"); return }
    setIsRunningPremium(true)
    toast.info("Running premium analyses (EMI, Fatigue, Impact)...")
    try {
      const result = await runPremiumAnalysisAction(scanId, ["emi", "fatigue", "impact"])
      if ("error" in result) { toast.error(result.error); return }
      setSpec(result.spec)
      toast.success("Premium analyses complete!")
    } catch (error) {
      toast.error("Premium analysis failed")
      console.error("[XRay] Premium analysis error:", error instanceof Error ? error.message : "Unknown")
    } finally {
      setIsRunningPremium(false)
    }
  }, [scanId, setSpec])

  // ── People matching ─────────────────────────────────────────────────
  const loadPeople = useCallback((forceRefresh = false): void => {
    if (spec.modules.length === 0) return
    setIsPeopleLoading(true)
    matchPeopleAction(scanId, spec.modules, forceRefresh)
      .then((result) => {
        if ("people" in result) setPeople(result.people)
        else console.error("[XRay] People error:", result.error)
      })
      .catch((err) => console.error("[XRay] People error:", err))
      .finally(() => setIsPeopleLoading(false))
  }, [scanId, spec.modules])

  // ── Supplier matching ───────────────────────────────────────────────
  const loadSuppliers = useCallback((forceRefresh = false): void => {
    const diagComplete = isGatingDiagComplete(spec)
    if (!diagComplete || spec.modules.length === 0) return
    setIsSuppliersLoading(true)
    matchSuppliersAction(scanId, spec.modules, diagComplete, forceRefresh)
      .then((result) => {
        if ("suppliersByModule" in result) setSuppliersByModule(result.suppliersByModule)
        else console.error("[XRay] Supplier error:", result.error)
      })
      .catch((err) => console.error("[XRay] Supplier error:", err))
      .finally(() => setIsSuppliersLoading(false))
  }, [scanId, spec])

  // ── Supplier assignment ─────────────────────────────────────────────
  const handleAssignSupplier = useCallback((moduleId: string, supplierName: string): void => {
    const next = { ...spec, modules: spec.modules.map((m) => (m.id === moduleId ? { ...m, supplier: supplierName } : m)) }
    setSpec(next)
    persistSpec(next)
  }, [spec, setSpec, persistSpec])

  // Auto-load people/suppliers when modules change
  useEffect(() => {
    if (!isHydrated || spec.modules.length === 0) return
    loadPeople(false)
    if (isGatingDiagComplete(spec)) loadSuppliers(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, spec.modules.length])

  const hasModules = spec.modules.length > 0
  const diagComplete = isGatingDiagComplete(spec)

  if (!isHydrated) {
    return (
      <div className="space-y-8">
        <PageHeader />
        <div className="h-96 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading workbench...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader />

      {/* Section 1: Scan Hero */}
      <ScanHero
        idea={spec.idea}
        functionStatement={spec.function}
        isScanning={isScanning}
        hasExistingSpec={spec.modules.length > 0}
        onScan={handleScan}
        onRefine={handleRefineScan}
        onIdeaChange={(idea) => setSpec({ ...spec, idea })}
      />

      {isScanning && <ScanningPlaceholder />}

      {!isScanning && hasModules && (
        <>
          {/* Section 2: System Blueprint (Hero Image + Module Status Grid) */}
          <SystemBlueprint
            spec={spec}
            systemImageUrl={spec.systemImageUrl}
            systemImageStatus={spec.systemImageStatus}
            isGeneratingImages={isGeneratingImages}
            hasImages={spec.modules.some(m => m.imageStatus === "complete")}
            onGenerateImages={handleGenerateImages}
            canGenerate={!!scanId}
          />

          {/* Section 3: Executive Dashboard */}
          <ExecutiveDashboard spec={spec} />

          {/* Section 4: Module Explorer (with blueprint images + 3D models) */}
          <ModuleExplorer
            spec={spec}
            onModuleUpdate={handleModuleUpdate}
            scanId={scanId}
            onDeriveProcessClass={handleDeriveProcessClass}
            onGenerateCadModel={handleGenerateCadModel}
            onOpenInterview={setInterviewModule}
            onEditModule={setEditingModule}
          />

          {/* Section 5b: Engineering Analysis Summary */}
          <EngineeringSummary
            spec={spec}
            onRunAnalysis={handleRunAnalysis}
            isAnalyzing={isAnalyzing}
            onRunStructural={handleRunStructural}
            isRunningStructural={isRunningStructural}
            onRunConvergence={handleRunConvergence}
            isRunningConvergence={isRunningConvergence}
            onRunPremium={handleRunPremium}
            isRunningPremium={isRunningPremium}
          />

          {/* Section 6: Timeline */}
          <TimelineView spec={spec} />

          {/* Section 7: Risk Register */}
          <RiskRegister spec={spec} />

          {/* Section 8: Team Map */}
          <TeamMap
            spec={spec}
            people={people}
            isPeopleLoading={isPeopleLoading}
            onRefreshPeople={() => loadPeople(true)}
          />

          {/* Section 9: Supply Chain */}
          <SupplyChain
            spec={spec}
            diagComplete={diagComplete}
            suppliersByModule={suppliersByModule}
            isSuppliersLoading={isSuppliersLoading}
            onRefreshSuppliers={() => loadSuppliers(true)}
            onAssignSupplier={handleAssignSupplier}
          />

          {/* Section 10: Diagnostic Center */}
          <DiagnosticCenter
            spec={spec}
            scanId={scanId}
            onModuleUpdate={handleModuleUpdate}
            onDeriveProcessClass={handleDeriveProcessClass}
          />

          {/* Section 11: RFQ (Request for Quotation) */}
          <RfqSection spec={spec} />

          {/* Interview Panel Dialog (opens on top of dossier) */}
          {interviewModule && (
            <InterviewPanel
              module={interviewModule}
              open={!!interviewModule}
              onClose={() => setInterviewModule(null)}
              onSave={handleModuleUpdate}
            />
          )}

          {/* Edit Module Dialog (manual editing + AI refine) */}
          {editingModule && (
            <EditModuleDialog
              module={editingModule}
              spec={spec}
              scanId={scanId}
              open={!!editingModule}
              onClose={() => setEditingModule(null)}
              onSave={handleModuleUpdate}
              onRefineWithAI={handleRefineModule}
            />
          )}
        </>
      )}
    </div>
  )
}

// ─── Page Header ─────────────────────────────────────────────────────

function PageHeader(): React.ReactNode {
  return (
    <div className="pb-4 border-b border-muted">
      <div className={typography.pageHeader}>
        <div className={typography.pageHeaderAccent} />
        <h1 className={typography.h1}>The Forge</h1>
      </div>
      <p className={cn(typography.pageSubtitle, "mt-1")}>
        Scan a product concept into a buildable engineering dossier — then connect with experts and suppliers to make it real.
      </p>
    </div>
  )
}

// ─── Scanning Placeholder ────────────────────────────────────────────

function ScanningPlaceholder(): React.ReactNode {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-[300px] rounded-xl bg-muted/40 flex items-center justify-center">
        <p className="text-sm text-muted-foreground font-medium">Scanning your idea...</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted/30" />
        ))}
      </div>
      <div className="h-48 rounded-xl bg-muted/30" />
    </div>
  )
}
