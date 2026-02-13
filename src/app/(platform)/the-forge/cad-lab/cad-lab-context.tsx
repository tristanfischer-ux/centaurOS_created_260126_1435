"use client"

/**
 * @file cad-lab-context.tsx — Shared state for the CAD Lab multi-page pipeline.
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
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react"

import { createClient } from "@/lib/supabase/client"
import {
  runCadLabResearch,
  generateCadLabInterface,
  generateCadLabModel,
  decomposeIntoModules,
  prefillDiagnostics,
} from "@/actions/cad-lab"
import {
  listCadLabProjects,
  loadCadLabProject,
  createCadLabProject,
  saveCadLabResearch,
  saveCadLabModules,
  deleteCadLabProject,
} from "@/actions/cad-lab-projects"

import type { CadLabProjectSummary } from "@/actions/cad-lab-projects"
import type {
  CadLabResearchResult,
  CadLabModule,
  ClaudeModelId,
} from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type { Sector } from "@/types/foundry"

// ─── Context Shape ───────────────────────────────────────────────────

type MilestoneType = "research" | "breakdown" | "generate" | "batch" | null

export interface CadLabContextValue {
  // Project persistence
  projects: CadLabProjectSummary[]
  activeProjectId: string | null
  showProjects: boolean
  setShowProjects: (v: boolean) => void
  isLoadingProjects: boolean
  isSaving: boolean
  lastSaved: string | null
  refreshProjects: () => Promise<void>
  handleLoadProject: (projectId: string) => Promise<void>
  handleDeleteProject: (projectId: string) => Promise<void>

  // Foundry sector
  sector: Sector | null

  // Input
  subject: string
  setSubject: (v: string) => void
  modelId: ClaudeModelId
  setModelId: (v: ClaudeModelId) => void

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
 * useCadLab — access shared CAD Lab state from any sub-route page.
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

  // ── Progress storytelling ──
  const [progressLines, setProgressLines] = useState<string[]>([])
  const [milestone, setMilestone] = useState<MilestoneType>(null)

  // ── Computed ──
  const hasResearch = !!(researchResult?.success && editableReport.trim().length > 0)
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
        const res = await generateCadLabModel(`${mod.name} — ${mod.purpose}`, moduleResearchText, mod.interfaceDefinition || "", modelId)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { stlData, stepData, ...resultWithoutBinary } = res
        const updated = modules.map((m) =>
          m.id === moduleId ? { ...m, result: resultWithoutBinary, code: res.code, status: "generated" as const } : m,
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

  // ── Batch generate all modules (parallel with concurrency limit) ──
  const handleGenerateAllModules = useCallback(async () => {
    if (modules.length === 0 || isBatchRunning) return
    setIsBatchRunning(true)
    setProgressLines([])
    addProgressLine("Starting full pipeline across all modules...")

    const progress: Record<string, "queued" | "interface" | "generating" | "done" | "error"> = {}
    for (const mod of modules) {
      progress[mod.id] = mod.status === "generated" ? "done" : "queued"
    }
    setBatchProgress({ ...progress })

    // Shared mutable module array — each worker updates its own module by id
    let currentModules = [...modules]
    const CONCURRENCY = 2

    /**
     * Generates a single module through its full pipeline (interface + CAD).
     * Updates shared state and progress as it completes each step.
     */
    const generateOneModule = async (mod: CadLabModule): Promise<void> => {
      let localMod = { ...mod }

      // Interface step (if needed)
      if (localMod.status === "pending") {
        progress[mod.id] = "interface"
        setBatchProgress({ ...progress })
        addProgressLine(`${mod.name}: generating interface definition...`)

        const moduleResearchText = localMod.moduleResearch ||
          `Module: ${localMod.name}\nPurpose: ${localMod.purpose}\nKey Parts: ${localMod.keyParts.join(", ")}\nDescription: ${localMod.description}\n\nFrom parent research:\n${editableReport}`

        try {
          const res = await generateCadLabInterface(`${localMod.name} — ${localMod.purpose}`, moduleResearchText, modelId)
          if (res.success) {
            localMod = { ...localMod, interfaceDefinition: res.interfaceDefinition, status: "interface_ready" as const }
            currentModules = currentModules.map((m) => m.id === mod.id ? localMod : m)
            setModules([...currentModules])
          } else {
            progress[mod.id] = "error"
            setBatchProgress({ ...progress })
            return
          }
        } catch {
          progress[mod.id] = "error"
          setBatchProgress({ ...progress })
          return
        }
      }

      // CAD generation step
      progress[mod.id] = "generating"
      setBatchProgress({ ...progress })
      addProgressLine(`${localMod.name}: generating parametric CAD...`)

      const moduleResearchText = localMod.moduleResearch ||
        `Module: ${localMod.name}\nPurpose: ${localMod.purpose}\nKey Parts: ${localMod.keyParts.join(", ")}\nDescription: ${localMod.description}\n\nFrom parent research:\n${editableReport}`

      try {
        const res = await generateCadLabModel(`${localMod.name} — ${localMod.purpose}`, moduleResearchText, localMod.interfaceDefinition || "", modelId)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { stlData, stepData, ...resultWithoutBinary } = res
        localMod = { ...localMod, result: resultWithoutBinary, code: res.code, status: "generated" as const }
        currentModules = currentModules.map((m) => m.id === mod.id ? localMod : m)
        setModules([...currentModules])
        progress[mod.id] = "done"
        setBatchProgress({ ...progress })
        addProgressLine(`${localMod.name}: complete — ${res.bbox ? `${res.bbox.xLen}×${res.bbox.yLen}×${res.bbox.zLen}mm` : "done"}`)
      } catch {
        progress[mod.id] = "error"
        setBatchProgress({ ...progress })
        addProgressLine(`${localMod.name}: generation failed`)
        return
      }

      // Incremental save — persist after each module so progress survives page navigation
      if (activeProjectId) {
        await saveCadLabModules(activeProjectId, currentModules)
        setLastSaved(new Date().toISOString())
      }
    }

    // Run modules through a concurrency-limited pool (semaphore pattern)
    const pending = modules.filter((m) => m.status !== "generated")

    let activeCount = 0
    let resolveSlot: (() => void) | null = null

    const waitForSlot = (): Promise<void> => {
      if (activeCount < CONCURRENCY) return Promise.resolve()
      return new Promise<void>((resolve) => { resolveSlot = resolve })
    }

    const releaseSlot = (): void => {
      activeCount--
      if (resolveSlot) {
        const r = resolveSlot
        resolveSlot = null
        r()
      }
    }

    const tasks: Promise<void>[] = []

    for (const mod of pending) {
      await waitForSlot()
      activeCount++
      tasks.push(
        generateOneModule(mod).finally(releaseSlot),
      )
    }

    // Wait for all in-flight modules to finish
    await Promise.allSettled(tasks)

    const doneCount = Object.values(progress).filter((s) => s === "done").length
    if (doneCount === modules.length) {
      setMilestone("batch")
    }

    setIsBatchRunning(false)
  }, [modules, isBatchRunning, editableReport, modelId, activeProjectId, addProgressLine])

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
      const res = await runCadLabResearch(subject)
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
  }, [subject, ensureProject, refreshProjects, addProgressLine])

  // ── Reset ──
  const handleReset = useCallback(() => {
    setResearchResult(null)
    setEditableReport("")
    setActiveProjectId(null)
    setLastSaved(null)
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

      if (p.research) {
        setResearchResult({
          success: true,
          report: p.research.report,
          sources: p.research.sources,
          referenceModels: p.research.referenceModels,
          researchTime: p.research.researchTime,
        })
        setEditableReport(p.research.report)
      } else {
        setResearchResult(null)
        setEditableReport("")
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
          setLastSaved(null)
        }
      }
    } catch {
      console.error("[CAD-LAB] Failed to delete project")
    }
  }, [activeProjectId])

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
    projects, activeProjectId, showProjects, setShowProjects,
    isLoadingProjects, isSaving, lastSaved,
    refreshProjects, handleLoadProject, handleDeleteProject,
    sector,
    subject, setSubject, modelId, setModelId,
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
