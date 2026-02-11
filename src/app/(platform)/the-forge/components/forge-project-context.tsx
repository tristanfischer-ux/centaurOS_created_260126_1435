/**
 * @file forge-project-context.tsx — React context for shared Forge project state
 *
 * @description Provides the XRaySpec, scanId, and mutation handlers to all
 * stage pages within a forge project. Loaded once in the [id]/layout.tsx,
 * consumed by concept/dossier/people/supply-chain/contracting pages.
 *
 * @related
 * - Layout: src/app/(platform)/the-forge/[id]/layout.tsx
 * - Server actions: src/actions/xray.ts
 * - Schema: src/app/(platform)/the-forge/services/xray-schema.ts
 */

"use client"

import React, { createContext, useContext, useState, useCallback, useRef } from "react"

import { toast } from "sonner"

import {
  updateScanSpecAction,
  refineScanAction,
  refineModuleAction,
  deriveProcessClassAction,
  generateImagesAction,
  generateCadModelsAction,
  analyzeModulesAction,
  runStructuralAnalysisAction,
  runThermalAnalysisAction,
  runTopologyOptimizationAction,
  runConvergenceStepAction,
  runPremiumAnalysisAction,
  createEngineeringReviewAction,
  matchPeopleAction,
  matchSuppliersAction,
  updateProjectMetadataAction,
} from "@/actions/xray"

import type { XRaySpec, ModuleSpec } from "../services/xray-schema"
import type { PersonMatch } from "../services/people"
import type { SupplierMatch } from "../services/suppliers"
import type { ConvergenceEvaluation, ProposedChange } from "../services/convergence-controller"

// ─── Types ───────────────────────────────────────────────────────────

/** Pipeline stages for the Forge */
export type ForgeStage = "concept" | "dossier" | "people" | "supply_chain" | "contracting"

/** Stages of the full engineering analysis pipeline */
export type PipelineStageId = "mass_dfm" | "structural" | "thermal" | "topology" | "convergence"

/** Status of a single pipeline stage */
export interface PipelineStageStatus {
  id: PipelineStageId
  label: string
  status: "pending" | "running" | "complete" | "error" | "skipped"
  error?: string
}

/** Overall pipeline progress */
export interface PipelineProgress {
  isRunning: boolean
  stages: PipelineStageStatus[]
  /** Convergence evaluation returned after pipeline completes */
  convergenceResult?: ConvergenceEvaluation
  /** Proposed design changes from the convergence step */
  proposedChanges?: ProposedChange[]
}

/** Full project data loaded from DB */
export interface ForgeProject {
  scanId: string
  spec: XRaySpec
  name: string | null
  stage: ForgeStage
  idea: string
  status: string
  thumbnailUrl: string | null
  createdAt: string
  updatedAt: string
}

/** Context value exposed to consumer components */
export interface ForgeProjectContextValue {
  // ── Project data ──
  project: ForgeProject
  spec: XRaySpec
  scanId: string

  // ── Spec mutations ──
  setSpec: (next: XRaySpec) => void
  handleModuleUpdate: (updated: ModuleSpec) => void
  handleAssignSupplier: (moduleId: string, supplierName: string) => void

  // ── Scan operations ──
  handleRefineScan: (updatedIdea: string) => Promise<void>
  handleRefineModule: (editedModule: ModuleSpec) => Promise<ModuleSpec>
  handleDeriveProcessClass: (moduleId: string, answers: Record<string, string>) => Promise<void>

  // ── Image/CAD generation ──
  handleGenerateImages: () => void
  handleGenerateCadModel: (moduleId: string) => Promise<void>
  isGeneratingImages: boolean

  // ── Engineering analysis ──
  handleRunAnalysis: () => Promise<void>
  handleRunStructural: () => Promise<void>
  handleRunConvergence: () => Promise<void>
  handleRunPremium: () => Promise<void>
  isAnalyzing: boolean
  isRunningStructural: boolean
  isRunningConvergence: boolean
  isRunningPremium: boolean

  // ── Full pipeline ──
  handleRunFullPipeline: () => Promise<void>
  pipelineProgress: PipelineProgress
  dismissPipelineChanges: () => void

  // ── Engineering review bridge ──
  handleCreateReviewObjective: () => Promise<string | null>

  // ── People matching ──
  people: PersonMatch[]
  isPeopleLoading: boolean
  loadPeople: (forceRefresh?: boolean) => void

  // ── Supplier matching ──
  suppliersByModule: Record<string, SupplierMatch[]>
  isSuppliersLoading: boolean
  loadSuppliers: (forceRefresh?: boolean) => void

  // ── Project metadata ──
  updateProjectName: (name: string) => Promise<void>
  updateProjectStage: (stage: ForgeStage) => Promise<void>

  // ── Scanning state ──
  isScanning: boolean
}

// ─── Context ─────────────────────────────────────────────────────────

const ForgeProjectContext = createContext<ForgeProjectContextValue | null>(null)

/**
 * Hook to access the forge project context.
 *
 * @description Must be used within a ForgeProjectProvider.
 * @returns The forge project context value
 * @throws Error if used outside of ForgeProjectProvider
 */
export function useForgeProject(): ForgeProjectContextValue {
  const ctx = useContext(ForgeProjectContext)
  if (!ctx) {
    throw new Error("useForgeProject must be used within a ForgeProjectProvider")
  }
  return ctx
}

// ─── Helpers ─────────────────────────────────────────────────────────

function findGatingModule(modules: ModuleSpec[]): ModuleSpec | undefined {
  return modules.find((m) => m.isGatingModule) ?? modules.find((m) => m.id === "react")
}

function isGatingDiagComplete(spec: XRaySpec): boolean {
  const gating = findGatingModule(spec.modules)
  if (!gating) return true
  if (gating.diagnostic?.derivedProcessClass) return true
  return false
}

// ─── Provider ────────────────────────────────────────────────────────

interface ForgeProjectProviderProps {
  /** Initial project data loaded from DB in the server component */
  initialProject: ForgeProject
  children: React.ReactNode
}

/**
 * ForgeProjectProvider — Wraps stage pages with shared project state.
 *
 * @description Manages spec state, mutation handlers, and async operations
 * (image gen, analysis, people/supplier matching) for all stage pages.
 * Initialized with server-loaded data, then manages client-side updates.
 *
 * @param initialProject - Project data loaded from DB in server component
 */
export function ForgeProjectProvider({
  initialProject,
  children,
}: ForgeProjectProviderProps): React.ReactNode {
  const [project, setProject] = useState<ForgeProject>(initialProject)
  const [spec, setSpecInternal] = useState<XRaySpec>(initialProject.spec)
  const [isScanning, setIsScanning] = useState(false)
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isRunningStructural, setIsRunningStructural] = useState(false)
  const [isRunningConvergence, setIsRunningConvergence] = useState(false)
  const [isRunningPremium, setIsRunningPremium] = useState(false)

  const [people, setPeople] = useState<PersonMatch[]>([])
  const [isPeopleLoading, setIsPeopleLoading] = useState(false)
  const [suppliersByModule, setSuppliersByModule] = useState<Record<string, SupplierMatch[]>>({})
  const [isSuppliersLoading, setIsSuppliersLoading] = useState(false)

  const specRef = useRef<XRaySpec>(initialProject.spec)
  const scanId = project.scanId

  // ── Persist spec to DB ──
  const persistSpec = useCallback(async (nextSpec: XRaySpec): Promise<void> => {
    try {
      await updateScanSpecAction(scanId, nextSpec)
    } catch (error) {
      console.warn("[Forge] Failed to persist spec:", error instanceof Error ? error.message : "Unknown")
    }
  }, [scanId])

  const setSpec = useCallback((next: XRaySpec) => {
    setSpecInternal(next)
    specRef.current = next
    persistSpec(next)
  }, [persistSpec])

  // ── Module update ──
  const handleModuleUpdate = useCallback((updated: ModuleSpec): void => {
    const next = { ...specRef.current, modules: specRef.current.modules.map((m) => (m.id === updated.id ? updated : m)) }
    setSpec(next)
  }, [setSpec])

  // ── Supplier assignment ──
  const handleAssignSupplier = useCallback((moduleId: string, supplierName: string): void => {
    const next = { ...specRef.current, modules: specRef.current.modules.map((m) => (m.id === moduleId ? { ...m, supplier: supplierName } : m)) }
    setSpec(next)
  }, [setSpec])

  // ── Refine scan ──
  const handleRefineScan = useCallback(async (updatedIdea: string): Promise<void> => {
    const trimmed = (updatedIdea || "").trim() || "New machine concept"
    setIsScanning(true)
    try {
      const result = await refineScanAction(scanId, trimmed, specRef.current)
      if ("error" in result) { toast.error(result.error); return }
      setSpecInternal(result.spec)
      specRef.current = result.spec
      toast.success(`Refined: ${result.spec.modules.length} modules updated`)
    } catch (error) {
      toast.error("Refine failed. Please try again.")
      console.error("[Forge] Refine error:", error instanceof Error ? error.message : "Unknown")
    } finally {
      setIsScanning(false)
    }
  }, [scanId])

  // ── Refine module ──
  const handleRefineModule = useCallback(async (editedModule: ModuleSpec): Promise<ModuleSpec> => {
    const result = await refineModuleAction(scanId, editedModule, specRef.current)
    if ("error" in result) {
      toast.error(result.error)
      throw new Error(result.error)
    }
    return result.module
  }, [scanId])

  // ── Derive process class ──
  const handleDeriveProcessClass = useCallback(async (moduleId: string, answers: Record<string, string>): Promise<void> => {
    try {
      const result = await deriveProcessClassAction(scanId, moduleId, answers)
      if ("error" in result) { toast.error(result.error); return }
      setSpecInternal(result.spec)
      specRef.current = result.spec
      toast.success("Process class derived")
    } catch (error) {
      toast.error("Failed to derive process class")
      console.error("[Forge] Diagnostic error:", error instanceof Error ? error.message : "Unknown")
    }
  }, [scanId])

  // ── Generate images ──
  const handleGenerateImages = useCallback((): void => {
    setIsGeneratingImages(true)
    toast.info("Generating blueprint images...")
    generateImagesAction(scanId)
      .then((imgResult) => {
        if ("spec" in imgResult) {
          setSpecInternal(imgResult.spec)
          specRef.current = imgResult.spec
          const successCount = imgResult.spec.modules.filter(m => m.imageStatus === "complete").length
          if (successCount > 0) toast.success(`Generated ${successCount} blueprint images`)

          // Update thumbnail from system image
          if (imgResult.spec.systemImageUrl) {
            updateProjectMetadataAction(scanId, { thumbnailUrl: imgResult.spec.systemImageUrl })
          }
        } else {
          toast.error(imgResult.error || "Image generation failed")
        }
      })
      .catch(() => toast.error("Image generation failed"))
      .finally(() => setIsGeneratingImages(false))
  }, [scanId])

  // ── Generate CAD model ──
  const handleGenerateCadModel = useCallback(async (moduleId: string): Promise<void> => {
    toast.info("Generating 3D CAD model — this may take up to 2 minutes...")
    try {
      const result = await generateCadModelsAction(scanId, [moduleId])
      if ("error" in result) { toast.error(result.error); return }
      setSpecInternal(result.spec)
      specRef.current = result.spec
      const targetModule = result.spec.modules.find((m) => m.id === moduleId)
      if (targetModule?.cadModel?.status === "complete") {
        toast.success(`3D model generated for ${targetModule.name}`)
      }
    } catch (error) {
      toast.error("CAD model generation failed")
      console.error("[Forge] CAD error:", error instanceof Error ? error.message : "Unknown")
    }
  }, [scanId])

  // ── Engineering analysis ──
  const handleRunAnalysis = useCallback(async (): Promise<void> => {
    setIsAnalyzing(true)
    toast.info("Running engineering analysis...")
    try {
      const result = await analyzeModulesAction(scanId)
      if ("error" in result) { toast.error(result.error); return }
      setSpecInternal(result.spec)
      specRef.current = result.spec
      toast.success("Engineering analysis complete")
    } catch (error) {
      toast.error("Engineering analysis failed")
      console.error("[Forge] Analysis error:", error instanceof Error ? error.message : "Unknown")
    } finally {
      setIsAnalyzing(false)
    }
  }, [scanId])

  const handleRunStructural = useCallback(async (): Promise<void> => {
    setIsRunningStructural(true)
    toast.info("Running structural FEA...")
    try {
      const result = await runStructuralAnalysisAction(scanId)
      if ("error" in result) { toast.error(result.error); return }
      setSpecInternal(result.spec)
      specRef.current = result.spec
      toast.success("Structural FEA complete")
    } catch (error) {
      toast.error("Structural FEA failed")
    } finally {
      setIsRunningStructural(false)
    }
  }, [scanId])

  const handleRunConvergence = useCallback(async (): Promise<void> => {
    setIsRunningConvergence(true)
    toast.info("Evaluating convergence criteria...")
    try {
      const result = await runConvergenceStepAction(scanId)
      if ("error" in result) { toast.error(result.error); return }
      setSpecInternal(result.spec)
      specRef.current = result.spec
      if (result.evaluation.isConverged) {
        toast.success("All convergence criteria met!")
      } else {
        toast.info(`${result.evaluation.proposedChanges.length} changes proposed`)
      }
    } catch (error) {
      toast.error("Convergence evaluation failed")
    } finally {
      setIsRunningConvergence(false)
    }
  }, [scanId])

  const handleRunPremium = useCallback(async (): Promise<void> => {
    setIsRunningPremium(true)
    toast.info("Running premium analyses...")
    try {
      const result = await runPremiumAnalysisAction(scanId, ["emi", "fatigue", "impact"])
      if ("error" in result) { toast.error(result.error); return }
      setSpecInternal(result.spec)
      specRef.current = result.spec
      toast.success("Premium analyses complete!")
    } catch (error) {
      toast.error("Premium analysis failed")
    } finally {
      setIsRunningPremium(false)
    }
  }, [scanId])

  // ── Full Engineering Pipeline ──
  const INITIAL_PIPELINE_STAGES: PipelineStageStatus[] = [
    { id: "mass_dfm", label: "Mass & DFM", status: "pending" },
    { id: "structural", label: "Structural FEA", status: "pending" },
    { id: "thermal", label: "Thermal Analysis", status: "pending" },
    { id: "topology", label: "Topology Optimization", status: "pending" },
    { id: "convergence", label: "Convergence Check", status: "pending" },
  ]

  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress>({
    isRunning: false,
    stages: INITIAL_PIPELINE_STAGES,
  })

  /**
   * Runs the full engineering analysis pipeline sequentially.
   *
   * @description Chains: mass/DFM → structural FEA → thermal → topology
   * optimization → convergence evaluation. Updates spec after each stage.
   * Each stage continues even if a prior stage fails (best-effort).
   * At the end, convergence evaluation proposes design changes if needed.
   */
  const handleRunFullPipeline = useCallback(async (): Promise<void> => {
    const stages = INITIAL_PIPELINE_STAGES.map((s) => ({ ...s }))
    setPipelineProgress({ isRunning: true, stages })

    const updateStage = (id: PipelineStageId, update: Partial<PipelineStageStatus>): void => {
      const idx = stages.findIndex((s) => s.id === id)
      if (idx >= 0) stages[idx] = { ...stages[idx], ...update }
      setPipelineProgress({ isRunning: true, stages: [...stages] })
    }

    const latestSpec = (): XRaySpec => specRef.current

    try {
      // Stage 1: Mass properties + DFM
      updateStage("mass_dfm", { status: "running" })
      toast.info("Pipeline: Running mass properties & DFM...")
      try {
        const r = await analyzeModulesAction(scanId)
        if ("error" in r) {
          updateStage("mass_dfm", { status: "error", error: r.error })
        } else {
          setSpecInternal(r.spec)
          specRef.current = r.spec
          updateStage("mass_dfm", { status: "complete" })
        }
      } catch (err) {
        updateStage("mass_dfm", { status: "error", error: err instanceof Error ? err.message : "Unknown" })
      }

      // Stage 2: Structural FEA
      updateStage("structural", { status: "running" })
      toast.info("Pipeline: Running structural FEA...")
      try {
        const r = await runStructuralAnalysisAction(scanId)
        if ("error" in r) {
          updateStage("structural", { status: "error", error: r.error })
        } else {
          setSpecInternal(r.spec)
          specRef.current = r.spec
          updateStage("structural", { status: "complete" })
        }
      } catch (err) {
        updateStage("structural", { status: "error", error: err instanceof Error ? err.message : "Unknown" })
      }

      // Stage 3: Thermal analysis
      updateStage("thermal", { status: "running" })
      toast.info("Pipeline: Running thermal analysis...")
      try {
        const r = await runThermalAnalysisAction(scanId)
        if ("error" in r) {
          updateStage("thermal", { status: "error", error: r.error })
        } else {
          setSpecInternal(r.spec)
          specRef.current = r.spec
          updateStage("thermal", { status: "complete" })
        }
      } catch (err) {
        updateStage("thermal", { status: "error", error: err instanceof Error ? err.message : "Unknown" })
      }

      // Stage 4: Topology optimization
      updateStage("topology", { status: "running" })
      toast.info("Pipeline: Running topology optimization...")
      try {
        const r = await runTopologyOptimizationAction(scanId)
        if ("error" in r) {
          updateStage("topology", { status: "error", error: r.error })
        } else {
          setSpecInternal(r.spec)
          specRef.current = r.spec
          updateStage("topology", { status: "complete" })
        }
      } catch (err) {
        updateStage("topology", { status: "error", error: err instanceof Error ? err.message : "Unknown" })
      }

      // Stage 5: Convergence evaluation
      updateStage("convergence", { status: "running" })
      toast.info("Pipeline: Evaluating convergence criteria...")
      try {
        const r = await runConvergenceStepAction(scanId)
        if ("error" in r) {
          updateStage("convergence", { status: "error", error: r.error })
        } else {
          setSpecInternal(r.spec)
          specRef.current = r.spec
          updateStage("convergence", { status: "complete" })

          // Store convergence results so the UI can show the review dialog
          setPipelineProgress((prev) => ({
            ...prev,
            convergenceResult: r.evaluation,
            proposedChanges: r.evaluation.proposedChanges,
          }))

          if (r.evaluation.isConverged) {
            toast.success("Full analysis pipeline complete — all criteria met!")
          } else {
            toast.info(
              `Pipeline complete — ${r.evaluation.proposedChanges.length} design changes proposed`,
            )
          }
        }
      } catch (err) {
        updateStage("convergence", { status: "error", error: err instanceof Error ? err.message : "Unknown" })
      }
    } finally {
      setPipelineProgress((prev) => ({
        ...prev,
        isRunning: false,
        stages: [...stages],
      }))
    }
  }, [scanId])

  /** Dismiss proposed changes (user chose to skip the review dialog) */
  const dismissPipelineChanges = useCallback((): void => {
    setPipelineProgress((prev) => ({
      ...prev,
      convergenceResult: undefined,
      proposedChanges: undefined,
    }))
  }, [])

  /**
   * Creates an engineering review Objective with Tasks from the current
   * analysis results. This bridges the AI pipeline into the human task system.
   *
   * @returns The created objective ID, or null if creation failed
   */
  const handleCreateReviewObjective = useCallback(async (): Promise<string | null> => {
    try {
      const result = await createEngineeringReviewAction(
        scanId,
        pipelineProgress.convergenceResult,
      )
      if ("error" in result) {
        toast.error(result.error)
        return null
      }
      toast.success(
        `Review objective created with ${result.analysisTaskCount} analysis task${result.analysisTaskCount !== 1 ? "s" : ""}` +
        (result.changeTaskCount > 0 ? ` and ${result.changeTaskCount} change task${result.changeTaskCount !== 1 ? "s" : ""}` : ""),
      )
      return result.objectiveId
    } catch (error) {
      toast.error("Failed to create review objective")
      console.error("[Forge] Review objective error:", error instanceof Error ? error.message : "Unknown")
      return null
    }
  }, [scanId, pipelineProgress.convergenceResult])

  // ── People matching ──
  const loadPeople = useCallback((forceRefresh = false): void => {
    if (specRef.current.modules.length === 0) return
    setIsPeopleLoading(true)
    matchPeopleAction(scanId, specRef.current.modules, forceRefresh)
      .then((result) => {
        if ("people" in result) setPeople(result.people)
        else console.error("[Forge] People error:", result.error)
      })
      .catch((err) => console.error("[Forge] People error:", err))
      .finally(() => setIsPeopleLoading(false))
  }, [scanId])

  // ── Supplier matching ──
  const loadSuppliers = useCallback((forceRefresh = false): void => {
    const diagComplete = isGatingDiagComplete(specRef.current)
    if (!diagComplete || specRef.current.modules.length === 0) return
    setIsSuppliersLoading(true)
    matchSuppliersAction(scanId, specRef.current.modules, diagComplete, forceRefresh)
      .then((result) => {
        if ("suppliersByModule" in result) setSuppliersByModule(result.suppliersByModule)
        else console.error("[Forge] Supplier error:", result.error)
      })
      .catch((err) => console.error("[Forge] Supplier error:", err))
      .finally(() => setIsSuppliersLoading(false))
  }, [scanId])

  // ── Project metadata ──
  const updateProjectName = useCallback(async (name: string): Promise<void> => {
    const result = await updateProjectMetadataAction(scanId, { name })
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    setProject((prev) => ({ ...prev, name }))
  }, [scanId])

  const updateProjectStage = useCallback(async (stage: ForgeStage): Promise<void> => {
    const result = await updateProjectMetadataAction(scanId, { stage })
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    setProject((prev) => ({ ...prev, stage }))
  }, [scanId])

  const value: ForgeProjectContextValue = {
    project,
    spec,
    scanId,
    setSpec,
    handleModuleUpdate,
    handleAssignSupplier,
    handleRefineScan,
    handleRefineModule,
    handleDeriveProcessClass,
    handleGenerateImages,
    handleGenerateCadModel,
    isGeneratingImages,
    handleRunAnalysis,
    handleRunStructural,
    handleRunConvergence,
    handleRunPremium,
    isAnalyzing,
    isRunningStructural,
    isRunningConvergence,
    isRunningPremium,
    handleRunFullPipeline,
    pipelineProgress,
    dismissPipelineChanges,
    handleCreateReviewObjective,
    people,
    isPeopleLoading,
    loadPeople,
    suppliersByModule,
    isSuppliersLoading,
    loadSuppliers,
    updateProjectName,
    updateProjectStage,
    isScanning,
  }

  return (
    <ForgeProjectContext.Provider value={value}>
      {children}
    </ForgeProjectContext.Provider>
  )
}
