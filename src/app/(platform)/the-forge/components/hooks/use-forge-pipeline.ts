"use client"

/**
 * @file use-forge-pipeline.ts — Full engineering analysis pipeline orchestration.
 *
 * @description Manages individual analysis operations (mass/DFM, structural,
 * thermal, topology, convergence, premium) and the full sequential pipeline.
 * Also handles engineering review creation and design change application.
 */

import { useState, useCallback } from "react"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import { useBackgroundOps } from "@/contexts/background-ops-context"

import {
  analyzeModulesAction,
  runStructuralAnalysisAction,
  runThermalAnalysisAction,
  runTopologyOptimizationAction,
  runConvergenceStepAction,
  runPremiumAnalysisAction,
  createEngineeringReviewAction,
  applyDesignChangesAction,
} from "@/actions/xray"

import type { XRaySpec } from "../../services/xray-schema"
import type {
  PipelineProgress,
  PipelineStageStatus,
  PipelineStageId,
} from "../forge-project-context"
import type { ConvergenceEvaluation } from "../../services/convergence-controller"

interface UseForgePipelineOptions {
  scanId: string
  specRef: React.MutableRefObject<XRaySpec>
  setSpecDirect: (next: XRaySpec) => void
}

export interface UseForgePipelineReturn {
  handleRunAnalysis: () => Promise<void>
  handleRunStructural: () => Promise<void>
  handleRunConvergence: () => Promise<void>
  handleRunPremium: () => Promise<void>
  handleRunFullPipeline: () => Promise<void>
  handleCreateReviewObjective: () => Promise<string | null>
  handleApplyDesignChanges: (changes: Array<{ moduleId: string; parameter: string; newValue: string }>) => Promise<boolean>
  dismissPipelineChanges: () => void
  isAnalyzing: boolean
  isRunningStructural: boolean
  isRunningConvergence: boolean
  isRunningPremium: boolean
  pipelineProgress: PipelineProgress
}

const INITIAL_PIPELINE_STAGES: PipelineStageStatus[] = [
  { id: "mass_dfm", label: "Mass & DFM", status: "pending" },
  { id: "structural", label: "Structural FEA", status: "pending" },
  { id: "thermal", label: "Thermal Analysis", status: "pending" },
  { id: "topology", label: "Topology Optimization", status: "pending" },
  { id: "convergence", label: "Convergence Check", status: "pending" },
]

/**
 * useForgePipeline — Engineering analysis pipeline with sequential stage execution.
 */
export function useForgePipeline({
  scanId,
  specRef,
  setSpecDirect,
}: UseForgePipelineOptions): UseForgePipelineReturn {
  const pathname = usePathname()
  const { startOp, updateOp: updateBgOp, completeOp, failOp } = useBackgroundOps()

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isRunningStructural, setIsRunningStructural] = useState(false)
  const [isRunningConvergence, setIsRunningConvergence] = useState(false)
  const [isRunningPremium, setIsRunningPremium] = useState(false)

  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress>({
    isRunning: false,
    stages: INITIAL_PIPELINE_STAGES,
  })

  const handleRunAnalysis = useCallback(async (): Promise<void> => {
    setIsAnalyzing(true)
    toast.info("Running engineering analysis...")
    try {
      const result = await analyzeModulesAction(scanId)
      if ("error" in result) { toast.error(result.error); return }
      setSpecDirect(result.spec)
      toast.success("Engineering analysis complete")
    } catch (error) {
      toast.error("Engineering analysis failed")
      console.error("[Forge] Analysis error:", error instanceof Error ? error.message : "Unknown")
    } finally {
      setIsAnalyzing(false)
    }
  }, [scanId, setSpecDirect])

  const handleRunStructural = useCallback(async (): Promise<void> => {
    setIsRunningStructural(true)
    toast.info("Running structural FEA...")
    try {
      const result = await runStructuralAnalysisAction(scanId)
      if ("error" in result) { toast.error(result.error); return }
      setSpecDirect(result.spec)
      if ("persistError" in result) {
        toast.warning("Results computed but failed to save. Please refresh and retry.")
      } else {
        toast.success("Structural FEA complete")
      }
    } catch {
      toast.error("Structural FEA failed")
    } finally {
      setIsRunningStructural(false)
    }
  }, [scanId, setSpecDirect])

  const handleRunConvergence = useCallback(async (): Promise<void> => {
    setIsRunningConvergence(true)
    toast.info("Evaluating convergence criteria...")
    try {
      const result = await runConvergenceStepAction(scanId)
      if ("error" in result) { toast.error(result.error); return }
      setSpecDirect(result.spec)
      if ("persistError" in result) {
        toast.warning("Results computed but failed to save. Please refresh and retry.")
      } else if (result.evaluation.isConverged) {
        toast.success("All convergence criteria met!")
      } else {
        toast.info(`${result.evaluation.proposedChanges.length} changes proposed`)
      }
    } catch {
      toast.error("Convergence evaluation failed")
    } finally {
      setIsRunningConvergence(false)
    }
  }, [scanId, setSpecDirect])

  const handleRunPremium = useCallback(async (): Promise<void> => {
    setIsRunningPremium(true)
    toast.info("Running premium analyses...")
    try {
      const result = await runPremiumAnalysisAction(scanId, ["emi", "fatigue", "impact"])
      if ("error" in result) { toast.error(result.error); return }
      setSpecDirect(result.spec)
      if ("persistError" in result) {
        toast.warning("Results computed but failed to save. Please refresh and retry.")
      } else {
        toast.success("Premium analyses complete!")
      }
    } catch {
      toast.error("Premium analysis failed")
    } finally {
      setIsRunningPremium(false)
    }
  }, [scanId, setSpecDirect])

  const handleRunFullPipeline = useCallback(async (): Promise<void> => {
    setPipelineProgress({ isRunning: true, stages: INITIAL_PIPELINE_STAGES.map((s) => ({ ...s })) })

    // FLOW: Register with global background ops so progress survives navigation
    const bgOpId = startOp("Full pipeline analysis", pathname)

    // Functional updater avoids stale closure over a mutable local array
    const updateStage = (id: PipelineStageId, update: Partial<PipelineStageStatus>): void => {
      setPipelineProgress((prev) => ({
        ...prev,
        stages: prev.stages.map((s) => (s.id === id ? { ...s, ...update } : s)),
      }))
    }

    // Progress mapping: 5 stages × 20% each
    const STAGE_PROGRESS: Record<string, number> = {
      mass_dfm: 0,
      structural: 20,
      thermal: 40,
      topology: 60,
      convergence: 80,
    }

    type StageRunner = { id: PipelineStageId; label: string; run: () => Promise<{ spec: XRaySpec } | { error: string }> }
    const stageRunners: StageRunner[] = [
      { id: "mass_dfm", label: "Mass & DFM", run: () => analyzeModulesAction(scanId) },
      { id: "structural", label: "Structural FEA", run: () => runStructuralAnalysisAction(scanId) },
      { id: "thermal", label: "Thermal Analysis", run: () => runThermalAnalysisAction(scanId) },
      { id: "topology", label: "Topology Optimization", run: () => runTopologyOptimizationAction(scanId) },
    ]

    let hasError = false

    try {
      // Stages 1-4: sequential analysis passes
      for (const stage of stageRunners) {
        updateStage(stage.id, { status: "running" })
        updateBgOp(bgOpId, { progress: STAGE_PROGRESS[stage.id], stepLabel: stage.label })
        toast.info(`Pipeline: Running ${stage.label}...`)
        try {
          const r = await stage.run()
          if ("error" in r) {
            updateStage(stage.id, { status: "error", error: r.error })
            hasError = true
          } else {
            setSpecDirect(r.spec)
            updateStage(stage.id, { status: "complete" })
            if ("persistError" in r) toast.warning(`${stage.label}: Results computed but failed to save.`)
          }
        } catch (err) {
          updateStage(stage.id, { status: "error", error: err instanceof Error ? err.message : "Unknown" })
          hasError = true
        }
        // Abort pipeline on first error — downstream stages depend on prior results
        if (hasError) {
          failOp(bgOpId, `Pipeline stopped: ${stage.label} failed`)
          return
        }
      }

      // Stage 5: Convergence evaluation
      updateStage("convergence", { status: "running" })
      updateBgOp(bgOpId, { progress: STAGE_PROGRESS.convergence, stepLabel: "Convergence Check" })
      toast.info("Pipeline: Evaluating convergence criteria...")
      try {
        const r = await runConvergenceStepAction(scanId)
        if ("error" in r) {
          updateStage("convergence", { status: "error", error: r.error })
          failOp(bgOpId, "Convergence evaluation failed")
        } else {
          setSpecDirect(r.spec)
          updateStage("convergence", { status: "complete" })
          if ("persistError" in r) toast.warning("Convergence: Results computed but failed to save.")

          setPipelineProgress((prev) => ({
            ...prev,
            convergenceResult: r.evaluation,
            proposedChanges: r.evaluation.proposedChanges,
          }))

          if (r.evaluation.isConverged) {
            completeOp(bgOpId, "Full analysis pipeline complete — all criteria met!")
          } else {
            completeOp(bgOpId, `Pipeline complete — ${r.evaluation.proposedChanges.length} design changes proposed`)
          }
        }
      } catch (err) {
        updateStage("convergence", { status: "error", error: err instanceof Error ? err.message : "Unknown" })
        failOp(bgOpId, "Convergence evaluation failed")
      }
    } finally {
      setPipelineProgress((prev) => ({ ...prev, isRunning: false }))
    }
  }, [scanId, setSpecDirect, pathname, startOp, updateBgOp, completeOp, failOp])

  const dismissPipelineChanges = useCallback((): void => {
    setPipelineProgress((prev) => ({
      ...prev,
      convergenceResult: undefined,
      proposedChanges: undefined,
    }))
  }, [])

  const handleCreateReviewObjective = useCallback(async (): Promise<string | null> => {
    try {
      const result = await createEngineeringReviewAction(
        scanId,
        pipelineProgress.convergenceResult as ConvergenceEvaluation | undefined,
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

  const handleApplyDesignChanges = useCallback(async (
    changes: Array<{ moduleId: string; parameter: string; newValue: string }>,
  ): Promise<boolean> => {
    try {
      const result = await applyDesignChangesAction(scanId, changes)
      if ("error" in result) {
        toast.error(result.error)
        return false
      }
      setSpecDirect(result.spec)
      toast.success(
        `${result.appliedCount} parameter${result.appliedCount !== 1 ? "s" : ""} updated. ` +
        `Run the full pipeline again to re-analyze with the new values.`,
      )
      return true
    } catch (error) {
      toast.error("Failed to apply design changes")
      console.error("[Forge] Design change error:", error instanceof Error ? error.message : "Unknown")
      return false
    }
  }, [scanId, setSpecDirect])

  return {
    handleRunAnalysis,
    handleRunStructural,
    handleRunConvergence,
    handleRunPremium,
    handleRunFullPipeline,
    handleCreateReviewObjective,
    handleApplyDesignChanges,
    dismissPipelineChanges,
    isAnalyzing,
    isRunningStructural,
    isRunningConvergence,
    isRunningPremium,
    pipelineProgress,
  }
}
