"use client"

/**
 * @file cad-lab-context.tsx — Shared state for The Forge multi-page pipeline.
 *
 * @description Extracts all stateful logic from the original monolithic page.tsx
 * into a React Context so that Research, Build, Analysis, Procurement, and
 * Review sub-route pages can share a single source of truth.
 *
 * The provider is mounted in layout.tsx and wraps all child routes.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react"

import { createClient } from "@/lib/supabase/client"
import {
  runCadLabResearch,
  generateCadLabInterface,
  decomposeIntoModules,
  prefillDiagnostics,
} from "@/actions/cad-lab"
import {
  listCadLabProjects,
  loadCadLabProject,
  createCadLabProject,
  saveCadLabResearch,
  saveCadLabModules,
  saveCadLabProjectRfq,
  deleteCadLabProject,
  loadCadLabBatchStatus,
} from "@/actions/cad-lab-projects"

import type { CadLabProjectSummary } from "@/actions/cad-lab-projects"
import type {
  CadLabResearchResult,
  CadLabModule,
  ClaudeModelId,
  CadLabDesignBrief,
} from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type { Sector } from "@/types/foundry"

// ─── Context Shape ───────────────────────────────────────────────────

type MilestoneType = "research" | "breakdown" | "generate" | "batch" | null

export interface CadLabContextValue {
  // Project persistence
  projects: CadLabProjectSummary[]
  activeProjectId: string | null
  linkedRfqId: string | null
  showProjects: boolean
  setShowProjects: (v: boolean) => void
  isLoadingProjects: boolean
  isSaving: boolean
  lastSaved: string | null
  refreshProjects: () => Promise<void>
  handleLoadProject: (projectId: string) => Promise<void>
  handleDeleteProject: (projectId: string) => Promise<void>
  linkRfqToProject: (rfqId: string) => Promise<void>

  // Foundry sector
  sector: Sector | null

  // Input
  subject: string
  setSubject: (v: string) => void
  modelId: ClaudeModelId
  setModelId: (v: ClaudeModelId) => void
  designBrief: CadLabDesignBrief
  setDesignBrief: Dispatch<SetStateAction<CadLabDesignBrief>>
  assumptionNotes: string
  setAssumptionNotes: (v: string) => void
  designReadinessPct: number

  // Research
  isResearching: boolean
  researchResult: CadLabResearchResult | null
  editableReport: string
  setEditableReport: (v: string) => void
  showSources: boolean
  setShowSources: (v: boolean) => void
  hasResearch: boolean
  handleResearch: () => Promise<void>
  handleReset: () => void

  // Module decomposition
  isDecomposing: boolean
  modules: CadLabModule[]
  setModules: Dispatch<SetStateAction<CadLabModule[]>>
  expandedModuleId: string | null
  setExpandedModuleId: (v: string | null) => void
  activeModuleId: string | null
  diagnosticAnswers: DiagnosticAnswers
  setDiagnosticAnswers: Dispatch<SetStateAction<DiagnosticAnswers>>
  aiPrefilled: boolean
  handleDecompose: () => Promise<void>
  handleModuleGenerate: (moduleId: string, step: "interface" | "generate") => Promise<void>
  handleGenerateAllModules: () => Promise<void>

  // Batch pipeline
  isBatchRunning: boolean
  batchProgress: Record<string, "queued" | "interface" | "generating" | "done" | "error">

  // Progress & milestones
  progressLines: string[]
  milestone: MilestoneType
  setMilestone: (v: MilestoneType) => void

  // Computed
  isAnyLoading: boolean
  generatedModuleCount: number
  riskCount: number
  diagCompletedCount: number

  // Utility
  handleDownload: (filename: string, base64Data: string, isBinary?: boolean) => void
}

// ─── Context ─────────────────────────────────────────────────────────

const CadLabContext = createContext<CadLabContextValue | null>(null)

/**
 * useCadLab — access shared The Forge state from any sub-route page.
 *
 * @throws If used outside of CadLabProvider
 */
export function useCadLab(): CadLabContextValue {
  const ctx = useContext(CadLabContext)
  if (!ctx) {
    throw new Error("[CadLab] useCadLab must be used within a CadLabProvider")
  }
  return ctx
}

// ─── Provider ────────────────────────────────────────────────────────

export function CadLabProvider({ children }: { children: ReactNode }): ReactNode {
  // ── Project persistence state ──
  const [projects, setProjects] = useState<CadLabProjectSummary[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [linkedRfqId, setLinkedRfqId] = useState<string | null>(null)
  const [showProjects, setShowProjects] = useState(false)
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)

  // ── Foundry sector ──
  const [sector, setSector] = useState<Sector | null>(null)

  useEffect(() => {
    async function fetchSector(): Promise<void> {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: profile } = await supabase.from("profiles").select("foundry_id").eq("id", user.id).single()
        if (!profile?.foundry_id) return
        const { data: foundry } = await supabase.from("foundries").select("sector").eq("id", profile.foundry_id).single()
        if (foundry?.sector) setSector(foundry.sector as Sector)
      } catch {
        // Non-critical
      }
    }
    fetchSector()
  }, [])

  // ── Input state ──
  const [subject, setSubject] = useState("")
  const [modelId, setModelId] = useState<ClaudeModelId>("claude-opus-4-6")
  const [designBrief, setDesignBrief] = useState<CadLabDesignBrief>({
    useCase: "",
    targetProcess: "",
    targetMaterial: "",
    toleranceTarget: "",
    quantityTarget: "",
    complianceNotes: "",
  })
  const [assumptionNotes, setAssumptionNotes] = useState("")

  // ── Research state ──
  const [isResearching, setIsResearching] = useState(false)
  const [researchResult, setResearchResult] = useState<CadLabResearchResult | null>(null)
  const [editableReport, setEditableReport] = useState("")
  const [showSources, setShowSources] = useState(false)

  // ── Module state ──
  const [isDecomposing, setIsDecomposing] = useState(false)
  const [modules, setModules] = useState<CadLabModule[]>([])
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null)
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null)
  const [diagnosticAnswers, setDiagnosticAnswers] = useState<DiagnosticAnswers>({})
  const [aiPrefilled, setAiPrefilled] = useState(false)

  // ── Batch pipeline state ──
  const [isBatchRunning, setIsBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState<Record<string, "queued" | "interface" | "generating" | "done" | "error">>({})
  // Track how many modules are actively running (for concurrency limiting)
  const activeModuleCountRef = useRef(0)

  // ── Progress storytelling ──
  const [progressLines, setProgressLines] = useState<string[]>([])
  const [milestone, setMilestone] = useState<MilestoneType>(null)

  // ── Browser notification helper ──
  const sendNotification = useCallback((title: string, body: string) => {
    try {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, icon: "/favicon.ico" })
      }
    } catch {
      // Non-critical — notification API not available
    }
  }, [])

  // ── Computed ──
  const hasResearch = !!(researchResult?.success && editableReport.trim().length > 0)
  const readinessFields = [
    designBrief.useCase,
    designBrief.targetProcess,
    designBrief.targetMaterial,
    designBrief.toleranceTarget,
    designBrief.quantityTarget,
  ]
  const designReadinessPct = Math.round((readinessFields.filter((v) => v.trim().length > 0).length / readinessFields.length) * 100)
  const isAnyLoading = isResearching || isDecomposing || isBatchRunning || activeModuleId !== null
  const generatedModuleCount = modules.filter((m) => m.status === "generated").length
  const riskCount = modules.reduce(
    (sum, m) => sum + m.failureModes.length + m.unknowns.length + (m.result?.dfm?.issues?.length ?? 0),
    0,
  )
  const diagCompletedCount = modules.filter((m) => {
    const answers = diagnosticAnswers[m.id]
    return answers && Object.keys(answers).length >= 6
  }).length

  // ── Progress helper ──
  const addProgressLine = useCallback((line: string) => {
    setProgressLines((prev) => [...prev, line])
  }, [])

  // ── Project List ──
  const refreshProjects = useCallback(async () => {
    setIsLoadingProjects(true)
    try {
      const res = await listCadLabProjects()
      if ("projects" in res) setProjects(res.projects)
    } catch {
      // Non-critical
    } finally {
      setIsLoadingProjects(false)
    }
  }, [])

  useEffect(() => { refreshProjects() }, [refreshProjects])

  // ── Ensure project exists for auto-save ──
  const ensureProject = useCallback(async (): Promise<string | null> => {
    if (activeProjectId) return activeProjectId
    if (!subject.trim()) return null
    try {
      const res = await createCadLabProject(subject, modelId)
      if ("projectId" in res) {
        setActiveProjectId(res.projectId)
        return res.projectId
      }
    } catch {
      console.error("[CAD-LAB] Failed to create project for auto-save")
    }
    return null
  }, [activeProjectId, subject, modelId])

  // ── Decompose into modules ──
  const handleDecompose = useCallback(async () => {
    if (!editableReport.trim()) return
    setIsDecomposing(true)
    setProgressLines([])
    addProgressLine("Running systems engineering analysis...")
    try {
      const res = await decomposeIntoModules(subject, editableReport, modelId)
      if (res.success && res.modules.length > 0) {
        setModules(res.modules)
        setMilestone("breakdown")
        setProgressLines([
          `Identified ${res.modules.length} sub-assemblies`,
          `Total lead time: ${Math.max(...res.modules.map((m) => m.leadWeeks))} weeks (critical path)`,
          `${res.modules.reduce((s, m) => s + m.keyParts.length, 0)} components mapped`,
        ])
        if (activeProjectId) {
          await saveCadLabModules(activeProjectId, res.modules)
          setLastSaved(new Date().toISOString())
          refreshProjects()
        }
        // Smart diagnostics pre-fill (background)
        prefillDiagnostics(res.modules, editableReport, modelId)
          .then((prefillRes) => {
            if (prefillRes.success && Object.keys(prefillRes.answers).length > 0) {
              setDiagnosticAnswers((prev) => {
                const merged = { ...prefillRes.answers }
                for (const [moduleId, existing] of Object.entries(prev)) {
                  merged[moduleId] = { ...(merged[moduleId] || {}), ...existing }
                }
                return merged
              })
              setAiPrefilled(true)
            }
          })
          .catch(() => { /* Non-critical */ })
      }
    } catch (err) {
      console.error("[CAD-LAB] Decomposition failed:", err)
      setProgressLines(["Decomposition failed — see error above"])
    } finally {
      setIsDecomposing(false)
    }
  }, [editableReport, subject, modelId, activeProjectId, refreshProjects, addProgressLine])

  // ── Generate CAD for a specific module ──
  const handleModuleGenerate = useCallback(async (moduleId: string, step: "interface" | "generate") => {
    const mod = modules.find((m) => m.id === moduleId)
    if (!mod) return
    setActiveModuleId(moduleId)

    const moduleResearchText = mod.moduleResearch ||
      `Module: ${mod.name}\nPurpose: ${mod.purpose}\nKey Parts: ${mod.keyParts.join(", ")}\nDescription: ${mod.description}\n\nFrom parent research:\n${editableReport}`

    if (step === "interface") {
      try {
        const res = await generateCadLabInterface(`${mod.name} — ${mod.purpose}`, moduleResearchText, modelId)
        if (res.success) {
          const updated = modules.map((m) =>
            m.id === moduleId ? { ...m, interfaceDefinition: res.interfaceDefinition, status: "interface_ready" as const } : m,
          )
          setModules(updated)
          if (activeProjectId) {
            await saveCadLabModules(activeProjectId, updated)
            setLastSaved(new Date().toISOString())
          }
        }
      } catch (err) {
        console.error("[CAD-LAB] Module interface generation failed:", err)
      }
    } else {
      try {
        if (!activeProjectId) throw new Error("Project not initialized")

        const response = await fetch("/api/cad-lab/generate-module", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: activeProjectId,
            moduleId,
          }),
        })

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({ error: "Unknown error" })) as { error?: string }
          throw new Error(errBody.error || `HTTP ${response.status}`)
        }

        const data = await response.json() as { done: boolean; module: CadLabModule }
        const updated = modules.map((m) =>
          m.id === moduleId ? data.module : m,
        )
        setModules(updated)
        if (activeProjectId) {
          await saveCadLabModules(activeProjectId, updated)
          setLastSaved(new Date().toISOString())
        }
      } catch (err) {
        console.error("[CAD-LAB] Module CAD generation failed:", err)
      }
    }
    setActiveModuleId(null)
  }, [modules, editableReport, modelId, activeProjectId])

  // ── Detect running batch on project load ──
  // If user reloads while modules were generating, check DB for any
  // modules that are still in progress and start polling to catch completions.
  useEffect(() => {
    if (!activeProjectId || modules.length === 0) return

    let pollInterval: ReturnType<typeof setInterval> | null = null
    let cancelled = false

    const checkBatchStatus = async (): Promise<void> => {
      try {
        const res = await loadCadLabBatchStatus(activeProjectId)
        if ("error" in res || cancelled) return

        if (res.batchStatus === "running") {
          // Batch was started but page was reloaded — mark as running
          setIsBatchRunning(true)
          const progress: Record<string, "queued" | "interface" | "generating" | "done" | "error"> = {}
          for (const [modId, status] of Object.entries(res.moduleStatuses)) {
            if (status === "generated") progress[modId] = "done"
            else if (status === "interface_ready") progress[modId] = "generating"
            else progress[modId] = "queued"
          }
          setBatchProgress(progress)
          setProgressLines([
            `Reconnected — ${res.generatedCount}/${res.totalCount} modules complete so far.`,
            "Waiting for remaining modules to finish...",
          ])

          // Start lightweight polling to detect completions from in-flight requests
          pollInterval = setInterval(async () => {
            if (cancelled) { if (pollInterval) clearInterval(pollInterval); return }
            try {
              const pollRes = await loadCadLabBatchStatus(activeProjectId)
              if ("error" in pollRes || cancelled) return

              const newProgress: Record<string, "queued" | "interface" | "generating" | "done" | "error"> = {}
              for (const [modId, st] of Object.entries(pollRes.moduleStatuses)) {
                if (st === "generated") newProgress[modId] = "done"
                else if (st === "interface_ready") newProgress[modId] = "generating"
                else newProgress[modId] = "queued"
              }
              setBatchProgress(newProgress)

              // Check if all modules are done
              const allDone = Object.values(pollRes.moduleStatuses).every(
                (s) => s === "generated",
              )
              const noneQueued = !Object.values(newProgress).some(
                (s) => s === "queued" || s === "interface" || s === "generating",
              )

              if (allDone || noneQueued || pollRes.batchStatus === "done" || pollRes.batchStatus === "error") {
                if (pollInterval) clearInterval(pollInterval)
                pollInterval = null
                // Reload full modules from DB
                const projRes = await loadCadLabProject(activeProjectId)
                if (!("error" in projRes) && projRes.project.modules) {
                  setModules(projRes.project.modules)
                }
                setLastSaved(new Date().toISOString())
                setIsBatchRunning(false)
                if (allDone) setMilestone("batch")
              }
            } catch {
              // Non-critical — next poll will retry
            }
          }, 5000)
        }
      } catch {
        // Non-critical
      }
    }

    checkBatchStatus()

    // Cleanup: stop polling on unmount or dependency change
    return () => {
      cancelled = true
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [activeProjectId, modules.length])

  // ── Per-module generation with client-side concurrency limit ──

  /** Maximum number of concurrent module generation requests */
  const MAX_CONCURRENCY = 3

  /**
   * Generates all pending modules by firing independent API requests.
   *
   * @description Each module gets its own serverless function invocation with
   * a full 5-minute timeout. A client-side concurrency limit of 3 prevents
   * overloading. As each module completes, the UI updates immediately — no
   * polling required. This replaces the monolithic batch endpoint.
   */
  const handleGenerateAllModules = useCallback(async () => {
    if (modules.length === 0 || isBatchRunning || !activeProjectId) return

    const pending = modules.filter((m) => m.status !== "generated")
    if (pending.length === 0) return

    setIsBatchRunning(true)
    setProgressLines([])
    addProgressLine(`Starting pipeline for ${pending.length} modules...`)

    // Request notification permission so we can alert when done
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => { /* Non-critical */ })
    }

    // Initialize progress UI — mark all non-generated as queued
    const progress: Record<string, "queued" | "interface" | "generating" | "done" | "error"> = {}
    for (const mod of modules) {
      progress[mod.id] = mod.status === "generated" ? "done" : "queued"
    }
    setBatchProgress({ ...progress })

    // Mark batch as running in DB (for reconnection detection)
    try {
      const supabase = createClient()
      await supabase
        .from("cad_lab_projects")
        .update({
          batch_status: "running",
          batch_started_at: new Date().toISOString(),
        })
        .eq("id", activeProjectId)
    } catch {
      // Non-critical — batch status is mainly for reconnection
    }

    addProgressLine("Each module runs independently — results appear as they complete.")

    // Client-side concurrency limiter
    let completedCount = modules.filter((m) => m.status === "generated").length
    let errorCount = 0
    activeModuleCountRef.current = 0

    const waitForSlot = (): Promise<void> => {
      if (activeModuleCountRef.current < MAX_CONCURRENCY) return Promise.resolve()
      return new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (activeModuleCountRef.current < MAX_CONCURRENCY) {
            clearInterval(check)
            resolve()
          }
        }, 200)
      })
    }

    const generateOne = async (mod: CadLabModule): Promise<void> => {
      await waitForSlot()
      activeModuleCountRef.current++

      // Mark as generating in UI
      setBatchProgress((prev) => ({ ...prev, [mod.id]: "generating" }))

      try {
        const res = await fetch("/api/cad-lab/generate-module", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: activeProjectId,
            moduleId: mod.id,
          }),
        })

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string }
          throw new Error(errBody.error || `HTTP ${res.status}`)
        }

        const data = await res.json() as { done: boolean; module: CadLabModule; elapsedMs: number }

        // Update module in local state immediately
        setModules((prev) =>
          prev.map((m) => (m.id === mod.id ? data.module : m)),
        )
        setBatchProgress((prev) => ({ ...prev, [mod.id]: "done" }))
        completedCount++
        addProgressLine(
          `${mod.name} complete (${(data.elapsedMs / 1000).toFixed(0)}s) — ${completedCount}/${modules.length} done`,
        )
      } catch (err) {
        console.error("[CAD-LAB] Module generation failed:", mod.name, err instanceof Error ? err.message : err)
        setBatchProgress((prev) => ({ ...prev, [mod.id]: "error" }))
        errorCount++
        addProgressLine(`${mod.name} failed: ${err instanceof Error ? err.message : "Unknown error"}`)
      } finally {
        activeModuleCountRef.current--
      }
    }

    // Fire all module generations (concurrency limited by waitForSlot)
    try {
      await Promise.allSettled(pending.map((mod) => generateOne(mod)))
    } finally {
      // Mark batch as complete in DB
      try {
        const supabase = createClient()
        await supabase
          .from("cad_lab_projects")
          .update({ batch_status: errorCount === pending.length ? "error" : "done" })
          .eq("id", activeProjectId)
      } catch {
        // Non-critical
      }

      setLastSaved(new Date().toISOString())
      setIsBatchRunning(false)

      if (errorCount === 0) {
        setMilestone("batch")
        addProgressLine(`All ${pending.length} modules generated successfully.`)
        sendNotification("The Forge — All Modules Generated", `${pending.length} modules for "${subject}" are ready. View results now.`)
      } else {
        addProgressLine(
          `Batch finished — ${completedCount - (modules.length - pending.length)}/${pending.length} modules generated, ${errorCount} failed.`,
        )
      }
    }
  }, [modules, isBatchRunning, activeProjectId, addProgressLine, sendNotification, subject])

  // ── Research ──
  const handleResearch = useCallback(async () => {
    setIsResearching(true)
    setResearchResult(null)
    setEditableReport("")
    setProgressLines([])
    setModules([])
    setDiagnosticAnswers({})
    setAiPrefilled(false)
    setBatchProgress({})

    addProgressLine("Searching for dimensional specifications...")
    const t1 = setTimeout(() => addProgressLine("Querying Thingiverse for reference CAD models..."), 3000)
    const t2 = setTimeout(() => addProgressLine("Cross-referencing engineering datasheets..."), 6000)
    const t3 = setTimeout(() => addProgressLine("Synthesising engineering report with Claude..."), 10000)
    const t4 = setTimeout(() => addProgressLine("Extracting key dimensions and constraints..."), 15000)

    try {
      const res = await runCadLabResearch(subject, {
        designBrief,
        assumptionNotes,
      })
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4)

      setProgressLines([
        `Found ${res.sources.length} web sources with engineering data`,
        `Found ${res.referenceModels.length} reference CAD models`,
        `Report complete — ${res.report.length.toLocaleString()} characters`,
        `Research time: ${(res.researchTime / 1000).toFixed(1)}s`,
      ])

      setResearchResult(res)
      setEditableReport(res.report)

      if (res.success) {
        setMilestone("research")
        const projId = await ensureProject()
        if (projId) {
          setIsSaving(true)
          await saveCadLabResearch(projId, res)
          setLastSaved(new Date().toISOString())
          setIsSaving(false)
          refreshProjects()
        }
      }
    } catch (err) {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4)
      setProgressLines(["Research failed — see error below"])
      setResearchResult({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
        report: "",
        sources: [],
        referenceModels: [],
        researchTime: 0,
      })
    } finally {
      setIsResearching(false)
    }
  }, [subject, designBrief, assumptionNotes, ensureProject, refreshProjects, addProgressLine])

  // ── Reset ──
  const handleReset = useCallback(() => {
    setResearchResult(null)
    setEditableReport("")
    setActiveProjectId(null)
    setLinkedRfqId(null)
    setLastSaved(null)
    setDesignBrief({
      useCase: "",
      targetProcess: "",
      targetMaterial: "",
      toleranceTarget: "",
      quantityTarget: "",
      complianceNotes: "",
    })
    setAssumptionNotes("")
    setModules([])
    setExpandedModuleId(null)
    setActiveModuleId(null)
    setDiagnosticAnswers({})
    setProgressLines([])
    setBatchProgress({})
    setAiPrefilled(false)
    setMilestone(null)
  }, [])

  // ── Load a saved project ──
  const handleLoadProject = useCallback(async (projectId: string) => {
    try {
      const res = await loadCadLabProject(projectId)
      if ("error" in res) return

      const p = res.project
      setSubject(p.subject)
      setModelId(p.modelId)
      setActiveProjectId(p.id)
      setLinkedRfqId(p.linkedRfqId)

      if (p.research) {
        setDesignBrief(p.research.designBrief ?? {
          useCase: "",
          targetProcess: "",
          targetMaterial: "",
          toleranceTarget: "",
          quantityTarget: "",
          complianceNotes: "",
        })
        setAssumptionNotes(p.research.assumptionNotes ?? "")
        setResearchResult({
          success: true,
          report: p.research.report,
          sources: p.research.sources,
          referenceModels: p.research.referenceModels,
          researchTime: p.research.researchTime,
          designBrief: p.research.designBrief,
          assumptionNotes: p.research.assumptionNotes,
        })
        setEditableReport(p.research.report)
      } else {
        setResearchResult(null)
        setEditableReport("")
        setDesignBrief({
          useCase: "",
          targetProcess: "",
          targetMaterial: "",
          toleranceTarget: "",
          quantityTarget: "",
          complianceNotes: "",
        })
        setAssumptionNotes("")
      }

      if (p.modules && p.modules.length > 0) {
        setModules(p.modules)
      } else {
        setModules([])
      }

      setLastSaved(p.updatedAt)
      setShowProjects(false)
      setMilestone(null)
      setProgressLines([])
    } catch {
      console.error("[CAD-LAB] Failed to load project")
    }
  }, [])

  // ── Delete a project ──
  const handleDeleteProject = useCallback(async (projectId: string) => {
    try {
      const res = await deleteCadLabProject(projectId)
      if ("success" in res) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId))
        if (activeProjectId === projectId) {
          setActiveProjectId(null)
          setLinkedRfqId(null)
          setLastSaved(null)
        }
      }
    } catch {
      console.error("[CAD-LAB] Failed to delete project")
    }
  }, [activeProjectId])

  // ── RFQ linkage ──
  const linkRfqToProject = useCallback(async (rfqId: string) => {
    if (!rfqId.trim()) return
    setLinkedRfqId(rfqId)
    if (!activeProjectId) return

    const res = await saveCadLabProjectRfq(activeProjectId, rfqId)
    if ("error" in res) {
      console.error("[CAD-LAB] Failed to persist RFQ linkage:", res.error)
      return
    }

    setLastSaved(new Date().toISOString())
    await refreshProjects()
  }, [activeProjectId, refreshProjects])

  // ── Download helper ──
  const handleDownload = useCallback((filename: string, base64Data: string, isBinary: boolean = true) => {
    try {
      const byteString = atob(base64Data)
      const bytes = new Uint8Array(byteString.length)
      for (let i = 0; i < byteString.length; i++) {
        bytes[i] = byteString.charCodeAt(i)
      }
      const mimeType = isBinary ? "application/octet-stream" : "application/step"
      const blob = new Blob([bytes], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("[CAD-LAB] Download failed:", err)
    }
  }, [])

  // ── Context value ──
  const value: CadLabContextValue = {
    projects, activeProjectId, linkedRfqId, showProjects, setShowProjects,
    isLoadingProjects, isSaving, lastSaved,
    refreshProjects, handleLoadProject, handleDeleteProject, linkRfqToProject,
    sector,
    subject, setSubject, modelId, setModelId,
    designBrief, setDesignBrief, assumptionNotes, setAssumptionNotes, designReadinessPct,
    isResearching, researchResult, editableReport, setEditableReport,
    showSources, setShowSources, hasResearch,
    handleResearch, handleReset,
    isDecomposing, modules, setModules,
    expandedModuleId, setExpandedModuleId, activeModuleId,
    diagnosticAnswers, setDiagnosticAnswers, aiPrefilled,
    handleDecompose, handleModuleGenerate, handleGenerateAllModules,
    isBatchRunning, batchProgress,
    progressLines, milestone, setMilestone,
    isAnyLoading, generatedModuleCount, riskCount, diagCompletedCount,
    handleDownload,
  }

  return <CadLabContext.Provider value={value}>{children}</CadLabContext.Provider>
}
