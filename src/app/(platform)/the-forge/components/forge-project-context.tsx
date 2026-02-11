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
  runConvergenceStepAction,
  runPremiumAnalysisAction,
  matchPeopleAction,
  matchSuppliersAction,
  updateProjectMetadataAction,
} from "@/actions/xray"

import type { XRaySpec, ModuleSpec } from "../services/xray-schema"
import type { PersonMatch } from "../services/people"
import type { SupplierMatch } from "../services/suppliers"

// ─── Types ───────────────────────────────────────────────────────────

/** Pipeline stages for the Forge */
export type ForgeStage = "concept" | "dossier" | "people" | "supply_chain" | "contracting"

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
