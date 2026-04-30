/**
 * @file forge-project-context.tsx — React context for shared Forge project state
 *
 * @description Slim provider that composes focused hooks for persistence,
 * pipeline, images, and matching. Provides the unified ForgeProjectContextValue
 * to all stage pages within a forge project.
 *
 * @related
 * - Layout: src/app/(platform)/the-forge/[id]/layout.tsx
 * - Hooks: ./hooks/use-forge-persist.ts, use-forge-pipeline.ts, etc.
 * - Server actions: src/actions/xray.ts
 * - Schema: src/app/(platform)/the-forge/services/xray-schema.ts
 */

"use client"

import React, { createContext, useContext, useState, useCallback, useMemo } from "react"

import { toast } from "sonner"

import {
  refineScanAction,
  refineModuleAction,
  deriveProcessClassAction,
  updateProjectMetadataAction,
} from "@/actions/xray"

import type { XRaySpec, ModuleSpec } from "../services/xray-schema"
import type { PersonMatch } from "../services/people"
import type { SupplierMatch } from "../services/suppliers"
import type { ConvergenceEvaluation, ProposedChange } from "../services/convergence-controller"

import { useForgePersist } from "./hooks/use-forge-persist"
import { useForgePipeline } from "./hooks/use-forge-pipeline"
import { useForgeImages } from "./hooks/use-forge-images"
import { useForgeMatching } from "./hooks/use-forge-matching"

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

/** Scan processing lifecycle status */
export type ScanStatus = "idle" | "scanning" | "complete"

/** Full project data loaded from DB */
export interface ForgeProject {
  scanId: string
  foundryId: string
  spec: XRaySpec
  name: string | null
  stage: ForgeStage
  idea: string
  status: string
  scanStatus: ScanStatus
  thumbnailUrl: string | null
  /** Research report from concept research (Gemini Search + GPT-5.5) */
  researchReport: {
    report: string
    sources: Array<{ uri: string; title: string }>
    savedAt: string
  } | null
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

  // ── Image generation ──
  handleGenerateImages: () => void
  isGeneratingImages: boolean
  /** True when system image is done and module images are still generating */
  isGeneratingModuleImages: boolean

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

  // ── Design change feedback ──
  handleApplyDesignChanges: (changes: Array<{ moduleId: string; parameter: string; newValue: string }>) => Promise<boolean>

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
  /** Background scan status from DB (idle | scanning | complete) */
  scanStatus: ScanStatus

  // ── Persist feedback ──
  /** Non-null when last persist failed (e.g. network error) */
  persistError: string | null
  /** True when spec changes are being saved (debounced persist in progress) */
  isSaving: boolean
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

// ─── Provider ────────────────────────────────────────────────────────

interface ForgeProjectProviderProps {
  /** Initial project data loaded from DB in the server component */
  initialProject: ForgeProject
  children: React.ReactNode
}

/**
 * ForgeProjectProvider — Composes focused hooks into a unified context.
 *
 * @description Slim provider that wires together persistence, pipeline,
 * image generation, and matching hooks. Also manages project metadata,
 * scan refine, and module refine operations directly.
 *
 * @param initialProject - Project data loaded from DB in server component
 */
export function ForgeProjectProvider({
  initialProject,
  children,
}: ForgeProjectProviderProps): React.ReactNode {
  const [project, setProject] = useState<ForgeProject>(initialProject)
  const [isScanning, setIsScanning] = useState(false)

  const scanId = project.scanId

  // ── Compose hooks ──
  const persist = useForgePersist({ initialProject })
  const pipeline = useForgePipeline({ scanId, specRef: persist.specRef, setSpecDirect: persist.setSpecDirect })
  const images = useForgeImages({ scanId, specRef: persist.specRef, setSpecDirect: persist.setSpecDirect, isMountedRef: persist.isMountedRef })
  const matching = useForgeMatching({ scanId, specRef: persist.specRef, isMountedRef: persist.isMountedRef })

  // ── Refine scan ──
  const handleRefineScan = useCallback(async (updatedIdea: string): Promise<void> => {
    const trimmed = (updatedIdea || "").trim() || "New machine concept"
    setIsScanning(true)
    toast.info("Creating concept — you can navigate away and come back.", { duration: 5000 })

    const existingResearch = project.researchReport?.report

    refineScanAction(scanId, trimmed, persist.specRef.current, existingResearch)
      .then((result) => {
        if ("error" in result) {
          toast.error(result.error)
          setIsScanning(false)
          return
        }
        persist.setSpecDirect(result.spec)
        setIsScanning(false)
        toast.success(`Refined: ${result.spec.modules.length} modules updated`)
        images.handleGenerateImages()
      })
      .catch((error) => {
        toast.error("Refine failed. Please try again.")
        console.error("[Forge] Refine error:", error instanceof Error ? error.message : "Unknown")
        setIsScanning(false)
      })
  }, [scanId, images, persist, project.researchReport])

  // ── Refine module ──
  const handleRefineModule = useCallback(async (editedModule: ModuleSpec): Promise<ModuleSpec> => {
    const result = await refineModuleAction(scanId, editedModule, persist.specRef.current)
    if ("error" in result) {
      toast.error(result.error)
      throw new Error(result.error)
    }
    return result.module
  }, [scanId, persist.specRef])

  // ── Derive process class ──
  const handleDeriveProcessClass = useCallback(async (moduleId: string, answers: Record<string, string>): Promise<void> => {
    try {
      const result = await deriveProcessClassAction(scanId, moduleId, answers)
      if ("error" in result) { toast.error(result.error); return }
      persist.setSpecDirect(result.spec)
      toast.success("Process class derived")
    } catch (error) {
      toast.error("Failed to derive process class")
      console.error("[Forge] Diagnostic error:", error instanceof Error ? error.message : "Unknown")
    }
  }, [scanId, persist])

  // ── Project metadata ──
  const updateProjectName = useCallback(async (name: string): Promise<void> => {
    const result = await updateProjectMetadataAction(scanId, { name })
    if ("error" in result) { toast.error(result.error); return }
    setProject((prev) => ({ ...prev, name }))
  }, [scanId])

  const updateProjectStage = useCallback(async (stage: ForgeStage): Promise<void> => {
    const result = await updateProjectMetadataAction(scanId, { stage })
    if ("error" in result) { toast.error(result.error); return }
    setProject((prev) => ({ ...prev, stage }))
  }, [scanId])

  // ── Memoized context value ──
  const memoizedValue = useMemo<ForgeProjectContextValue>(
    () => ({
      project,
      spec: persist.spec,
      scanId,
      setSpec: persist.setSpec,
      handleModuleUpdate: persist.handleModuleUpdate,
      handleAssignSupplier: persist.handleAssignSupplier,
      handleRefineScan,
      handleRefineModule,
      handleDeriveProcessClass,
      handleGenerateImages: images.handleGenerateImages,
      isGeneratingImages: images.isGeneratingImages,
      isGeneratingModuleImages: images.isGeneratingImages && persist.spec.systemImageStatus === "complete",
      ...pipeline,
      ...matching,
      updateProjectName,
      updateProjectStage,
      isScanning,
      scanStatus: persist.scanStatus,
      persistError: persist.persistError,
      isSaving: persist.isSaving,
    }),
    [
      project,
      persist.spec,
      scanId,
      persist.setSpec,
      persist.handleModuleUpdate,
      persist.handleAssignSupplier,
      persist.scanStatus,
      persist.persistError,
      persist.isSaving,
      handleRefineScan,
      handleRefineModule,
      handleDeriveProcessClass,
      images.handleGenerateImages,
      images.isGeneratingImages,
      pipeline,
      matching,
      updateProjectName,
      updateProjectStage,
      isScanning,
    ],
  )

  return (
    <ForgeProjectContext.Provider value={memoizedValue}>
      {children}
    </ForgeProjectContext.Provider>
  )
}
