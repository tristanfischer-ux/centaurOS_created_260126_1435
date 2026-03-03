"use client"

/**
 * @file cad-lab-context.tsx — Shared state for The Forge multi-page pipeline.
 *
 * @description Extracts all stateful logic from the original monolithic page.tsx
 * into a React Context so that Concept, Build, and Review sub-route pages
 * can share a single source of truth.
 *
 * The provider is mounted in the platform layout (survives navigation) and
 * lazily initialized on first CAD Lab visit via initializeCadLab().
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
  prepareDecomposition,
  decomposeIntoModules,
  prefillDiagnostics,
  generateSystemAssembly,
  extractInterfaceContracts,
} from "@/actions/cad-lab"
import { buildCheckpointPromptSection } from "@/lib/cad-lab/checkpoint-prompt"
import { matchReferenceModel } from "@/actions/reference-models"
import { saveCadLabIntegratedAssembly, saveCadLabSystemIllustration, saveCadLabVisualStyle, saveCadLabInterfaceContracts, saveCadLabDiagnosticAnswers } from "@/actions/cad-lab-projects"
import type { ReferenceModel } from "@/actions/reference-models"
import {
  listCadLabProjects,
  loadCadLabProject,
  createCadLabProject,
  saveCadLabResearch,
  saveCadLabModules,
  saveCadLabProductOverview,
  saveCadLabProjectRfq,
  deleteCadLabProject,
  loadCadLabBatchStatus,
} from "@/actions/cad-lab-projects"
import { getProjectOrders } from "@/actions/manufacturing-orders"

import { generateCadLabSingleImageAction, generateCadLabSystemIllustrationAction, generateVisualStyleAction, fetchAndCropReferenceAction, analyseHeroForModulesAction, cropModuleRegionAction, uploadSharedImageAssetsAction, cleanupSharedImageAssetsAction } from "@/actions/cad-lab-images"
import type { ImageGenModuleInput } from "@/lib/cad-lab/module-to-module-spec-adapter"
import { toast } from "sonner"
import type { CadLabProjectSummary } from "@/actions/cad-lab-projects"
import type {
  CadLabResearchResult,
  CadLabModule,
  ClaudeModelId,
  CadLabDesignBrief,
  VisualStyleSpec,
  DecompositionCheckpoint,
  EarlyCostEstimate,
  InterfaceContract,
  SpecialistReview,
} from "@/lib/cad-lab-types"
import { requestDecompositionCheckpoints, reviseModulesFromCheckpoints } from "@/actions/cad-lab-reviews"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type { Sector } from "@/types/foundry"
import type { CadLabDomain } from "@/lib/cad-lab/domain-prompts"

// ─── Persistence key for last active project (restore on return) ─────

const CAD_LAB_ACTIVE_PROJECT_KEY = "forgeos:cad-lab:active-project"
const CAD_LAB_DRAFT_SUBJECT_KEY = "forgeos:cad-lab:draft-subject"

/** Maximum number of concurrent module generation requests */
const MAX_CONCURRENCY = 2

// ─── Extract executive summary from research report markdown ─────────

function extractExecutiveSummary(report: string): string | null {
  const startMatch = report.match(/^##\s+Executive\s+Summary/im)
  if (!startMatch || startMatch.index === undefined) return null
  const afterHeading = report.slice(startMatch.index + startMatch[0].length)
  const nextHeading = afterHeading.search(/^##\s/m)
  const body = nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading)
  const trimmed = body.trim()
  return trimmed.length > 0 ? trimmed : null
}

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
  saveError: boolean
  refreshProjects: () => Promise<void>
  handleLoadProject: (projectId: string) => Promise<void>
  handleDeleteProject: (projectId: string) => Promise<void>
  linkRfqToProject: (rfqId: string) => Promise<void>

  // Foundry sector
  sector: Sector | null

  // Reference model (instant visual match from subject)
  referenceModel: ReferenceModel | null

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
  freshResearchRef: React.RefObject<boolean>
  handleResearch: () => Promise<void>
  handleReset: () => void

  // Module decomposition
  isDecomposing: boolean
  decompositionError: string | null
  modules: CadLabModule[]
  setModules: Dispatch<SetStateAction<CadLabModule[]>>
  expandedModuleId: string | null
  setExpandedModuleId: (v: string | null) => void
  generatingModuleIds: Set<string>
  diagnosticAnswers: DiagnosticAnswers
  setDiagnosticAnswers: Dispatch<SetStateAction<DiagnosticAnswers>>
  aiPrefilled: boolean
  handleDecompose: () => Promise<void>
  handleModuleGenerate: (moduleId: string, step: "interface" | "generate") => Promise<void>
  handleGenerateSingleModule: (moduleId: string) => Promise<void>
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

  // Image generation (Gemini blueprint illustrations)
  isGeneratingImages: boolean
  handleGenerateModuleImages: (modules: CadLabModule[], explicitProjectId?: string, visualStyle?: VisualStyleSpec, referenceBase64?: string) => Promise<void>
  handleRefreshModuleImages: () => Promise<void>

  // Progressive module reveal
  revealedModuleIds: Set<string>

  // Visual style (persisted for retry consistency)
  visualStyle: VisualStyleSpec | null

  // System illustration (research report banner)
  systemIllustrationUrl: string | null
  systemIllustrationStatus: "idle" | "generating" | "complete" | "failed"
  systemIllustrationError: string | null
  handleRetryIllustration: () => void

  // Integration (combined system assembly)
  integratedAssemblyStlUrl: string | null
  integratedAssemblyStepUrl: string | null
  isIntegrating: boolean
  integrationError: string | null
  integrationAssemblyCode: string | null
  setIntegrationError: (v: string | null) => void
  handleGenerateIntegration: () => Promise<void>

  // Decomposition checkpoints
  checkpoints: Record<string, DecompositionCheckpoint> | null
  isCheckpointing: boolean

  // Checkpoint revision (auto-revise flagged modules after acknowledgment)
  isRevising: boolean
  revisedModuleIds: Set<string>
  checkpointAcknowledged: boolean
  handleAcknowledgeCheckpoints: () => void

  // Product overview (editable executive summary)
  productOverview: string
  setProductOverview: (v: string) => void

  // Module editing
  handleUpdateModule: (updated: CadLabModule) => void

  // P9: Early cost estimates (keyed by moduleId)
  earlyCostEstimates: Record<string, EarlyCostEstimate>

  // P1: Interface contracts
  interfaceContracts: InterfaceContract[]
  isExtractingContracts: boolean
  unmatchedPorts: { outputs: Array<{ moduleId: string; portName: string }>; inputs: Array<{ moduleId: string; portName: string }> }

  // Pipeline stage tracking (4-stage flow)
  specifiedModuleCount: number
  manufacturingOrderCount: number
  refreshManufacturingOrderCount: () => Promise<void>
  isSpecificationComplete: boolean
  projectReviewVerdicts: Record<string, Record<string, SpecialistReview>>

  // Lazy initialization (provider mounted at platform level, init on first CAD Lab visit)
  initialized: boolean
  initializeCadLab: () => void

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
  const [saveError, setSaveError] = useState(false)

  // ── Lazy initialization (no-op until first CAD Lab visit) ──
  const [initialized, setInitialized] = useState(false)
  const initializeCadLab = useCallback(() => {
    if (initialized) return
    setInitialized(true)
  }, [initialized])

  // ── Foundry sector ──
  const [sector, setSector] = useState<Sector | null>(null)

  useEffect(() => {
    if (!initialized) return
    async function fetchSector(): Promise<void> {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: profile } = await supabase.from("profiles").select("foundry_id").eq("id", user.id).single()
        if (!profile?.foundry_id) return
        const { data: foundry } = await supabase.from("foundries").select("sector").eq("id", profile.foundry_id).single()
        if (foundry?.sector) setSector(foundry.sector as Sector)
      } catch (err) {
        console.error("[CAD-LAB] Foundry sector fetch failed:", err)
      }
    }
    fetchSector()
  }, [initialized])

  // ── Input state ──
  const [subject, setSubject] = useState("")
  const [modelId, setModelId] = useState<ClaudeModelId>("claude-sonnet-4-6")

  // Persist draft subject so it survives navigation before Research is triggered
  useEffect(() => {
    if (typeof window === "undefined") return
    const t = setTimeout(() => {
      if (subject.trim()) {
        localStorage.setItem(CAD_LAB_DRAFT_SUBJECT_KEY, subject)
      } else {
        localStorage.removeItem(CAD_LAB_DRAFT_SUBJECT_KEY)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [subject])

  // Restore draft subject on init (project load will override if one exists)
  useEffect(() => {
    if (!initialized) return
    if (typeof window === "undefined") return
    const stored = localStorage.getItem(CAD_LAB_DRAFT_SUBJECT_KEY)
    if (stored) setSubject(stored)
  }, [initialized])

  // ── Reference model (matched from subject for instant 3D preview) ──
  const [referenceModel, setReferenceModel] = useState<ReferenceModel | null>(null)
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
  const [decompositionError, setDecompositionError] = useState<string | null>(null)
  // J6: Cache detected domain so per-module generation reuses it (no redundant Claude calls)
  const [detectedDomain, setDetectedDomain] = useState<CadLabDomain | null>(null)
  const [modules, setModules] = useState<CadLabModule[]>([])
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null)
  const [generatingModuleIds, setGeneratingModuleIds] = useState<Set<string>>(new Set())

  const startGenerating = useCallback((id: string) => {
    setGeneratingModuleIds((prev) => new Set(prev).add(id))
  }, [])

  const stopGenerating = useCallback((id: string) => {
    setGeneratingModuleIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])
  const [diagnosticAnswers, setDiagnosticAnswers] = useState<DiagnosticAnswers>({})
  const diagnosticAnswersRef = useRef<DiagnosticAnswers>({})
  useEffect(() => { diagnosticAnswersRef.current = diagnosticAnswers }, [diagnosticAnswers])
  const [aiPrefilled, setAiPrefilled] = useState(false)

  // ── Batch pipeline state ──
  const [isBatchRunning, setIsBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState<Record<string, "queued" | "interface" | "generating" | "done" | "error">>({})
  // Track how many modules are actively running (for concurrency limiting)
  const activeModuleCountRef = useRef(0)
  // Synchronous double-click guard — prevents duplicate handler invocations
  // between click and React re-render (before disabled prop takes effect)
  const generatingGuardRef = useRef(new Set<string>())

  // Shared concurrency gate — blocks until a generation slot is available
  const waitForSlot = useCallback((): Promise<void> => {
    if (activeModuleCountRef.current < MAX_CONCURRENCY) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (activeModuleCountRef.current < MAX_CONCURRENCY) {
          clearInterval(check)
          resolve()
        }
      }, 200)
    })
  }, [])

  // Ref for batch reconnection polling interval (so cleanup always works)
  const batchPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Image generation state (Gemini blueprint illustrations) ──
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)

  // ── Progressive module reveal ──
  const [revealedModuleIds, setRevealedModuleIds] = useState<Set<string>>(new Set())

  // ── Visual style (shared across all illustration retries) ──
  const [visualStyle, setVisualStyle] = useState<VisualStyleSpec | null>(null)

  // ── System illustration (research report banner) ──
  const [systemIllustrationUrl, setSystemIllustrationUrl] = useState<string | null>(null)
  const [systemIllustrationStatus, setSystemIllustrationStatus] = useState<"idle" | "generating" | "complete" | "failed">("idle")
  const [systemIllustrationError, setSystemIllustrationError] = useState<string | null>(null)

  // ── Progress storytelling ──
  const [progressLines, setProgressLines] = useState<string[]>([])
  const [milestone, setMilestone] = useState<MilestoneType>(null)

  // ── Integration (combined assembly) ──
  const [integratedAssemblyStlUrl, setIntegratedAssemblyStlUrl] = useState<string | null>(null)
  const [integratedAssemblyStepUrl, setIntegratedAssemblyStepUrl] = useState<string | null>(null)
  const [isIntegrating, setIsIntegrating] = useState(false)
  const [integrationError, setIntegrationError] = useState<string | null>(null)
  const [integrationAssemblyCode, setIntegrationAssemblyCode] = useState<string | null>(null)

  // ── Decomposition checkpoints ──
  const [checkpoints, setCheckpoints] = useState<Record<string, DecompositionCheckpoint> | null>(null)
  const [isCheckpointing, setIsCheckpointing] = useState(false)

  // P9: Early cost estimates keyed by moduleId
  const [earlyCostEstimates, setEarlyCostEstimates] = useState<Record<string, EarlyCostEstimate>>({})

  // P1: Interface contracts between modules
  const [interfaceContracts, setInterfaceContracts] = useState<InterfaceContract[]>([])
  const [isExtractingContracts, setIsExtractingContracts] = useState(false)
  const [unmatchedPorts, setUnmatchedPorts] = useState<{ outputs: Array<{ moduleId: string; portName: string }>; inputs: Array<{ moduleId: string; portName: string }> }>({ outputs: [], inputs: [] })
  const [isRevising, setIsRevising] = useState(false)
  const [revisedModuleIds, setRevisedModuleIds] = useState<Set<string>>(new Set())
  const [checkpointAcknowledged, setCheckpointAcknowledged] = useState(false)

  // ── Product overview (editable executive summary) ──
  const [productOverview, setProductOverview] = useState("")

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
  const isAnyLoading = isResearching || isDecomposing || isBatchRunning || generatingModuleIds.size > 0 || isGeneratingImages
  const generatedModuleCount = modules.filter((m) => m.status === "generated").length
  const specifiedModuleCount = modules.filter((m) => m.status === "specified" || m.status === "generated").length
  const [manufacturingOrderCount, setManufacturingOrderCount] = useState(0)
  const isSpecificationComplete = specifiedModuleCount > 0 && specifiedModuleCount === modules.length
  const projectReviewVerdicts: Record<string, Record<string, SpecialistReview>> = {}
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
    setProgressLines((prev) => {
      const next = [...prev, line]
      return next.length > 200 ? next.slice(-200) : next
    })
  }, [])

  // ── Refs to read current state without stale closures ──
  const modulesRef = useRef<CadLabModule[]>(modules)
  useEffect(() => { modulesRef.current = modules }, [modules])

  const productOverviewRef = useRef(productOverview)
  useEffect(() => { productOverviewRef.current = productOverview }, [productOverview])

  // INTENT: Ref-mirror of activeProjectId so the unmount cleanup closure
  // can read the current value (closures capture stale state).
  const activeProjectIdRef = useRef(activeProjectId)
  useEffect(() => { activeProjectIdRef.current = activeProjectId }, [activeProjectId])

  // INTENT: Prevents auto-restore from firing twice in React StrictMode.
  const autoRestoreRef = useRef(false)

  // INTENT: Tracks whether research JUST completed in this session (vs loaded from a saved project).
  // Only set to true at the end of handleResearch — never during handleLoadProject.
  const freshResearchRef = useRef(false)

  const savePendingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedSaveModules = useCallback(() => {
    if (!activeProjectId) return
    if (savePendingRef.current) clearTimeout(savePendingRef.current)
    savePendingRef.current = setTimeout(async () => {
      savePendingRef.current = null
      const res = await saveCadLabModules(activeProjectId, JSON.stringify(modulesRef.current))
      if ("error" in res) {
        console.error("[CAD-LAB] Debounced save failed:", res.error)
        setSaveError(true)
        // Retry once after 2s
        setTimeout(async () => {
          const retryRes = await saveCadLabModules(activeProjectId, JSON.stringify(modulesRef.current))
          if ("error" in retryRes) {
            setSaveError(true)
            toast.error("Changes couldn't be saved — check your connection")
          } else {
            setSaveError(false)
            setLastSaved(new Date().toISOString())
          }
        }, 2000)
      } else {
        setSaveError(false)
        setLastSaved(new Date().toISOString())
      }
    }, 500)
  }, [activeProjectId])

  // ── Debounced DB save for product overview ──
  const overviewPendingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedSaveOverview = useCallback((text: string) => {
    if (!activeProjectId) return
    if (overviewPendingRef.current) clearTimeout(overviewPendingRef.current)
    overviewPendingRef.current = setTimeout(async () => {
      overviewPendingRef.current = null
      try {
        await saveCadLabProductOverview(activeProjectId, text)
        setSaveError(false)
        setLastSaved(new Date().toISOString())
      } catch {
        console.error("[CAD-LAB] Debounced overview save failed")
        setSaveError(true)
        // Retry once after 2s
        setTimeout(async () => {
          try {
            await saveCadLabProductOverview(activeProjectId, text)
            setSaveError(false)
            setLastSaved(new Date().toISOString())
          } catch {
            setSaveError(true)
            toast.error("Changes couldn't be saved — check your connection")
          }
        }, 2000)
      }
    }, 800)
  }, [activeProjectId])

  // Wrapped setter that also triggers debounced save
  const setProductOverviewAndSave = useCallback((text: string) => {
    setProductOverview(text)
    debouncedSaveOverview(text)
  }, [debouncedSaveOverview])

  // ── Update a single module (for inline editing) ──
  const handleUpdateModule = useCallback((updated: CadLabModule) => {
    setModules((prev) => prev.map((m) => m.id === updated.id ? updated : m))
    debouncedSaveModules()
  }, [debouncedSaveModules])

  // ── Debounced save: diagnostic answers ──
  const diagPendingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedSaveDiagnostics = useCallback(() => {
    if (!activeProjectId) return
    if (diagPendingRef.current) clearTimeout(diagPendingRef.current)
    diagPendingRef.current = setTimeout(async () => {
      diagPendingRef.current = null
      const res = await saveCadLabDiagnosticAnswers(activeProjectId, diagnosticAnswersRef.current)
      if ("error" in res) {
        console.error("[CAD-LAB] Debounced diagnostic save failed:", res.error)
        setSaveError(true)
        // Retry once after 2s
        setTimeout(async () => {
          const retryRes = await saveCadLabDiagnosticAnswers(activeProjectId, diagnosticAnswersRef.current)
          if ("error" in retryRes) {
            setSaveError(true)
            toast.error("Diagnostic answers couldn't be saved — check your connection")
          } else {
            setSaveError(false)
            setLastSaved(new Date().toISOString())
          }
        }, 2000)
      } else {
        setSaveError(false)
        setLastSaved(new Date().toISOString())
      }
    }, 500)
  }, [activeProjectId])

  // Auto-save diagnostic answers when they change
  const diagAnswerCountRef = useRef(0)
  useEffect(() => {
    // INTENT: Skip the initial empty render and only save after user edits
    const keyCount = Object.keys(diagnosticAnswers).length
    if (keyCount === 0 && diagAnswerCountRef.current === 0) return
    diagAnswerCountRef.current = keyCount
    debouncedSaveDiagnostics()
  }, [diagnosticAnswers, debouncedSaveDiagnostics])

  // INTENT: Flush (not drop) pending debounced saves on unmount so navigating
  // away doesn't silently discard unsaved edits. Fire-and-forget is fine here —
  // the server action will persist even after the component is gone.
  useEffect(() => {
    return () => {
      const pid = activeProjectIdRef.current
      if (savePendingRef.current) {
        clearTimeout(savePendingRef.current)
        savePendingRef.current = null
        if (pid) {
          saveCadLabModules(pid, JSON.stringify(modulesRef.current)).catch(() => { /* best-effort */ })
        }
      }
      if (overviewPendingRef.current) {
        clearTimeout(overviewPendingRef.current)
        overviewPendingRef.current = null
        if (pid) {
          saveCadLabProductOverview(pid, productOverviewRef.current).catch(() => { /* best-effort */ })
        }
      }
      if (diagPendingRef.current) {
        clearTimeout(diagPendingRef.current)
        diagPendingRef.current = null
        if (pid) {
          saveCadLabDiagnosticAnswers(pid, diagnosticAnswersRef.current).catch(() => { /* best-effort */ })
        }
      }
    }
  }, [])

  // ── Manufacturing order count ──
  const refreshManufacturingOrderCount = useCallback(async () => {
    const pid = activeProjectId
    if (!pid) {
      setManufacturingOrderCount(0)
      return
    }
    const res = await getProjectOrders(pid)
    if ("orders" in res) {
      setManufacturingOrderCount(res.orders.length)
    } else {
      console.error("[CAD-LAB] Failed to fetch manufacturing orders:", res.error)
    }
  }, [activeProjectId])

  // ── Project List ──
  const refreshProjects = useCallback(async () => {
    setIsLoadingProjects(true)
    try {
      const res = await listCadLabProjects()
      if ("projects" in res) setProjects(res.projects)
    } catch (err) {
      console.error("[CAD-LAB] Failed to refresh projects:", err)
    } finally {
      setIsLoadingProjects(false)
    }
  }, [])

  useEffect(() => { if (initialized) refreshProjects() }, [initialized, refreshProjects])

  // Match reference model when subject changes (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!subject.trim()) {
        setReferenceModel(null)
        return
      }
      const match = await matchReferenceModel(subject)
      setReferenceModel(match ?? null)
    }, 400)
    return () => clearTimeout(t)
  }, [subject])

  // Persist active project ID so returning users can restore (cleared only on explicit reset)
  useEffect(() => {
    if (typeof window === "undefined") return
    if (activeProjectId) {
      localStorage.setItem(CAD_LAB_ACTIVE_PROJECT_KEY, activeProjectId)
    }
  }, [activeProjectId])

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
      console.error("[CAD-LAB] ensureProject returned error:", "error" in res ? res.error : "unknown")
    } catch (err) {
      console.error("[CAD-LAB] Failed to create project for auto-save:", err)
    }
    return null
  }, [activeProjectId, subject, modelId])

  // ── Decompose into modules ──
  const handleDecompose = useCallback(async () => {
    if (!editableReport.trim()) return
    setIsDecomposing(true)
    setDecompositionError(null)
    setProgressLines([])

    // INTENT: Reframe the wait as impressive speed rather than a long delay.
    addProgressLine("This work normally takes 1\u20132 weeks of systems engineering \u2014 it\u2019ll be ready in about 5\u201310 minutes")

    // ── Phase 1: Preparation (real ~1-2s Claude call for domain detection) ──
    addProgressLine("Analysing research report to detect engineering domain...")

    let domainHint: Parameters<typeof decomposeIntoModules>[3]
    try {
      const prep = await prepareDecomposition(subject, editableReport)
      domainHint = prep.domain
      // J6: Cache domain for reuse in per-module generation requests
      setDetectedDomain(prep.domain)
      addProgressLine(`Engineering domain: ${prep.domainLabel}`)
      addProgressLine(`Decomposition prompt prepared — ~${prep.estimatedInputTokens.toLocaleString()} input tokens`)
    } catch {
      // Non-fatal — proceed without domain hint, decomposeIntoModules will detect itself
      addProgressLine("Domain detection skipped — proceeding with auto-detect")
    }

    // ── Phase 2: API call (real wait, with truthful padding timers) ──
    addProgressLine(`Research report: ${Math.round(editableReport.length / 1000)}K characters`)
    addProgressLine(`Applied ${domainHint ?? "auto-detected"} domain constraints to analysis`)
    addProgressLine("Decomposing into physical sub-assemblies...")

    // INTENT: These timers convey how much real engineering work is being compressed
    // into minutes. Spaced across ~75s to cover the typical blocking API call duration.
    const paddingTimers: ReturnType<typeof setTimeout>[] = []
    paddingTimers.push(setTimeout(() => addProgressLine("Cross-referencing product architecture against manufacturing databases"), 5000))
    paddingTimers.push(setTimeout(() => addProgressLine("Identifying independent sub-assemblies \u2014 this step alone typically takes a senior engineer 2\u20133 days"), 10000))
    paddingTimers.push(setTimeout(() => addProgressLine("Evaluating manufacturing processes: CNC, injection moulding, sheet metal, casting, 3D print"), 16000))
    paddingTimers.push(setTimeout(() => addProgressLine("Mapping interfaces and dependencies between sub-assemblies"), 22000))
    paddingTimers.push(setTimeout(() => addProgressLine("Calculating lead times and identifying the critical-path module"), 28000))
    paddingTimers.push(setTimeout(() => addProgressLine("Analysing failure modes and open engineering risks per module"), 35000))
    paddingTimers.push(setTimeout(() => addProgressLine("Validating dimensional compatibility across all module interfaces"), 42000))
    paddingTimers.push(setTimeout(() => addProgressLine("Assigning manufacturing processes and materials to each component"), 50000))
    paddingTimers.push(setTimeout(() => addProgressLine("Finalising bill of materials structure \u2014 nearly there"), 60000))
    paddingTimers.push(setTimeout(() => addProgressLine("Complex product \u2014 still processing. This depth of analysis is what makes the output useful."), 75000))

    const apiStart = Date.now()

    // INTENT: Client-side safety timeout. If the server action silently dies (e.g. Vercel
    // kills the function), the await never resolves and the UI hangs forever. This races
    // the API call against a deadline just above the server-side budget.
    // DECISION: 280s = just above server chain. Server chain is Sonnet+Gemini parallel(150s) + OpenAI(120s) = 270s.
    // The real timeouts are server-side — this is just a safety net for silent server death.
    const CLIENT_TIMEOUT_MS = 280_000 // 280s — safety net, just above server 270s chain
    const clientTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Decomposition timed out — please try again")), CLIENT_TIMEOUT_MS),
    )

    try {
      const res = await Promise.race([
        decomposeIntoModules(subject, editableReport, modelId, domainHint),
        clientTimeout,
      ])
      // Clear any pending padding timers now that the real result is in
      paddingTimers.forEach(clearTimeout)

      const elapsed = ((Date.now() - apiStart) / 1000).toFixed(1)

      if (res.success && res.modules.length > 0) {
        setModules(res.modules)
        setRevealedModuleIds(new Set(res.modules.map(m => m.id))) // Reveal immediately so text is visible while images generate
        setMilestone("breakdown")

        // Seed product overview from executive summary (fires exactly once — on decomposition)
        if (!productOverviewRef.current) {
          const summary = extractExecutiveSummary(editableReport)
          if (summary) {
            setProductOverview(summary)
            if (activeProjectId) {
              saveCadLabProductOverview(activeProjectId, summary).catch(() => {
                console.error("[CAD-LAB] Failed to persist seeded overview")
              })
            }
          }
        }

        // Build a rich summary from the actual result data
        const totalParts = res.modules.reduce((s, m) => s + m.keyParts.length, 0)
        const criticalPath = Math.max(...res.modules.map((m) => m.leadWeeks))
        const totalRisks = res.modules.reduce((s, m) => s + m.failureModes.length + m.unknowns.length, 0)
        const criticalModule = res.modules.find(m => m.leadWeeks === criticalPath)

        // ── Phase 3: Real results + module names so user sees WHAT was found ──
        setProgressLines([
          `Response received in ${elapsed}s (${res.tokensOut.toLocaleString()} tokens generated)`,
          `Parsed ${res.modules.length} physical modules from response`,
          `${totalParts} components mapped across all sub-assemblies`,
          `Critical path: ${criticalPath} weeks${criticalModule ? ` (${criticalModule.name})` : ""}`,
          ...(totalRisks > 0 ? [`${totalRisks} risk items flagged for engineering review`] : []),
          "",
          "Sub-assemblies identified:",
          ...res.modules.map((m, i) => `  ${i + 1}. ${m.name}`),
          "",
          "Now generating illustrations for each sub-assembly...",
        ])
        if (activeProjectId) {
          const saveRes = await saveCadLabModules(activeProjectId, JSON.stringify(res.modules))
          if ("error" in saveRes) {
            console.error("[CAD-LAB] Failed to save modules:", saveRes.error)
            toast.error("Modules mapped but failed to save — your changes may be lost on reload")
          } else {
            setLastSaved(new Date().toISOString())
          }
          refreshProjects()
        }
        // Smart diagnostics pre-fill (background)
        prefillDiagnostics(res.modules, editableReport, modelId)
          .then((prefillRes) => {
            if (!activeProjectIdRef.current) return
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

        // P1: Extract interface contracts (non-blocking background task)
        if (res.modules.length >= 2) {
          setIsExtractingContracts(true)
          extractInterfaceContracts(res.modules, editableReport, modelId)
            .then((contractRes) => {
              if (!activeProjectIdRef.current) return
              setInterfaceContracts(contractRes.contracts)
              setUnmatchedPorts({ outputs: contractRes.unmatchedOutputs, inputs: contractRes.unmatchedInputs })
              setIsExtractingContracts(false)
              if (activeProjectId) {
                saveCadLabInterfaceContracts(activeProjectId, contractRes)
                  .catch((e) => console.error("[CAD-LAB] Failed to persist interface contracts:", e))
              }
            })
            .catch((e) => {
              if (!activeProjectIdRef.current) return
              console.error("[CAD-LAB] Interface contract extraction failed:", e)
              setIsExtractingContracts(false)
            })
        }

        // Generate shared visual style for cohesive illustrations (~1-2s),
        // then trigger image generation with it. Non-blocking overall.
        const imagesPipeline = async () => {
          // INTENT: Set illustration status immediately so the hero card shows "Generating..."
          // as soon as decomposition finishes, eliminating the visual gap before visual style resolves.
          if (activeProjectId) {
            setSystemIllustrationStatus("generating")
            setSystemIllustrationError(null)
          }
          // FLOW: visual style → system illustration (Pass 1) → module images (Pass 2, uses reference)
          let visualStyle: VisualStyleSpec | undefined
          try {
            const styleRes = await generateVisualStyleAction(
              subject,
              res.modules.map((m) => ({ name: m.name, purpose: m.purpose })),
              extractExecutiveSummary(editableReport)?.slice(0, 800) ?? editableReport.slice(0, 800),
            )
            if (!activeProjectIdRef.current) return
            if ("visualStyle" in styleRes) {
              visualStyle = styleRes.visualStyle
              setVisualStyle(visualStyle)
              if (activeProjectId) {
                saveCadLabVisualStyle(activeProjectId, visualStyle)
                  .catch((e) => console.error("[CAD-LAB] Failed to persist visual style:", e))
              }
            }
          } catch {
            // Non-critical — images still generate, just without coordinated style
          }

          // FLOW: Pass 1 — generate system illustration FIRST, then prepare it
          // as full-resolution reference ONCE for use as Gemini multimodal reference in Pass 2.
          let referenceBase64: string | undefined
          const moduleCrops = new Map<string, string>()
          if (activeProjectId) {
            try {
              const illRes = await generateCadLabSystemIllustrationAction(
                activeProjectId,
                subject,
                res.modules.map((m) => m.name),
                res.modules.map((m) => m.purpose),
                visualStyle,
                extractExecutiveSummary(editableReport)?.slice(0, 600),
              )
              if (!activeProjectIdRef.current) return
              if ("url" in illRes) {
                setSystemIllustrationUrl(illRes.url)
                setSystemIllustrationStatus("complete")
                saveCadLabSystemIllustration(activeProjectId!, illRes.url)
                  .catch((e) => console.error("[CAD-LAB] Failed to persist system illustration URL:", e))

                // INTENT: Fetch + prepare the hero as full-resolution reference ONCE
                // so all module images share the same base64 without redundant fetches.
                try {
                  const cropRes = await fetchAndCropReferenceAction(illRes.url)
                  if ("base64" in cropRes) {
                    referenceBase64 = cropRes.base64
                  }
                } catch {
                  // Non-critical — module images still generate via text-only path
                }

                // Layer 2: Analyse hero for per-module bounding boxes, then crop each
                if (referenceBase64) {
                  try {
                    const bbRes = await analyseHeroForModulesAction(referenceBase64, res.modules.map(m => m.name))
                    if ("boxes" in bbRes && Object.keys(bbRes.boxes).length > 0) {
                      // Crop each module's region in parallel
                      const cropPromises = res.modules.map(async (mod) => {
                        const box = bbRes.boxes[mod.name]
                        if (!box) return { id: mod.id, crop: undefined }
                        try {
                          const cropResult = await cropModuleRegionAction(referenceBase64!, box)
                          if ("base64" in cropResult) {
                            return { id: mod.id, crop: cropResult.base64 }
                          }
                        } catch { /* ignore individual crop failures */ }
                        return { id: mod.id, crop: undefined }
                      })
                      const cropResults = await Promise.all(cropPromises)
                      for (const cr of cropResults) {
                        if (cr.crop) moduleCrops.set(cr.id, cr.crop)
                      }
                    }
                  } catch {
                    // Non-critical — modules still generate with full-hero-only reference
                  }
                }
              } else {
                console.error("[CAD-LAB] System illustration failed:", "error" in illRes ? illRes.error : "unknown")
                setSystemIllustrationStatus("failed")
                setSystemIllustrationError("error" in illRes ? (illRes as { error: string }).error : "Generation failed")
              }
            } catch (e) {
              if (!activeProjectIdRef.current) return
              console.error("[CAD-LAB] System illustration failed:", e)
              setSystemIllustrationStatus("failed")
              setSystemIllustrationError(e instanceof Error ? e.message : "Generation failed")
            }
          }

          // Pass 2 — module images, with reference base64 + per-module crops if available
          handleGenerateModuleImages(res.modules, activeProjectId ?? undefined, visualStyle, referenceBase64, moduleCrops)
            .catch(() => { /* Non-critical — images are enhancement, not blocker */ })
        }
        imagesPipeline()
          .catch(() => { /* Non-critical — images are enhancement, not blocker */ })

        // Decomposition checkpoints — non-blocking (same pattern as imagesPipeline)
        if (activeProjectId) {
          setIsCheckpointing(true)
          requestDecompositionCheckpoints({
            projectId: activeProjectId,
            projectSubject: subject,
            modules: res.modules,
            researchReport: editableReport,
          })
            .then((checkpointRes) => {
              if (!activeProjectIdRef.current) return
              if ("checkpoints" in checkpointRes) {
                setCheckpoints(checkpointRes.checkpoints)
              }
            })
            .catch((e) => console.error("[CAD-LAB] Checkpoint failed:", e))
            .finally(() => { if (activeProjectIdRef.current) setIsCheckpointing(false) })
        }
      } else {
        // Decomposition returned but failed — show the user why
        paddingTimers.forEach(clearTimeout)
        const errorMsg = res.error
          ? String(res.error)
          : "Decomposition returned no modules"
        setProgressLines([
          `Response received in ${elapsed}s`,
          `Decomposition failed: ${errorMsg}`,
        ])
        setDecompositionError(errorMsg)
        toast.error(errorMsg)
      }
    } catch (err) {
      paddingTimers.forEach(clearTimeout)
      console.error("[CAD-LAB] Decomposition failed:", err)
      const catchMsg = err instanceof Error ? err.message : "Decomposition failed"
      setDecompositionError(catchMsg)
      setProgressLines([`Decomposition failed: ${catchMsg}`])
      toast.error(catchMsg)
    } finally {
      setIsDecomposing(false)
    }
  }, [editableReport, subject, modelId, activeProjectId, refreshProjects, addProgressLine])

  // ── Generate Gemini blueprint images for modules (progressive reveal) ──
  const handleGenerateModuleImages = useCallback(async (modulesToProcess: CadLabModule[], explicitProjectId?: string, visualStyle?: VisualStyleSpec, referenceBase64?: string, moduleCrops?: Map<string, string>) => {
    const projectId = explicitProjectId ?? activeProjectId
    if (modulesToProcess.length === 0 || !projectId) return
    setIsGeneratingImages(true)

    // Immediately set all modules to "generating" image status in local state
    setModules((prev) =>
      prev.map((m) => {
        const isTarget = modulesToProcess.some((t) => t.id === m.id)
        return isTarget ? { ...m, imageStatus: "generating" as const } : m
      }),
    )

    toast.info(`Generating ${modulesToProcess.length} blueprint illustrations...`)

    // INTENT: Upload shared assets (reference PNG ~500-800KB, visual style ~1-3KB) to
    // Supabase Storage ONCE so each module call fetches them server-side (~10ms) instead
    // of sending redundant base64 through React Flight per call.
    let referenceUrl: string | undefined
    let visualStyleUrl: string | undefined
    if (referenceBase64 || visualStyle) {
      try {
        const uploadRes = await uploadSharedImageAssetsAction(projectId, referenceBase64, visualStyle)
        if ("referenceUrl" in uploadRes) {
          referenceUrl = uploadRes.referenceUrl
          visualStyleUrl = uploadRes.visualStyleUrl
        }
      } catch {
        // Non-critical — fall back to inline base64/object
      }
    }

    // Per-module safety timeout (30s) — reveal module even if image hasn't resolved
    const moduleTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
    for (const mod of modulesToProcess) {
      const timeout = setTimeout(() => {
        setRevealedModuleIds((prev) => {
          if (prev.has(mod.id)) return prev
          const next = new Set(prev)
          next.add(mod.id)
          return next
        })
      }, 30_000)
      moduleTimeouts.set(mod.id, timeout)
    }

    // Process sequentially to avoid React Flight "Maximum array nesting exceeded"
    // when multiple large base64 payloads are serialized concurrently
    let completedCount = 0

    const revealModule = (moduleId: string): void => {
      // Clear safety timeout since we're revealing now
      const timeout = moduleTimeouts.get(moduleId)
      if (timeout) {
        clearTimeout(timeout)
        moduleTimeouts.delete(moduleId)
      }
      setRevealedModuleIds((prev) => {
        const next = new Set(prev)
        next.add(moduleId)
        return next
      })
    }

    // DECISION: Pass URLs when available (drops per-call payload from ~800KB to ~200-300KB).
    // Falls back to raw base64/object if upload failed.
    const effectiveVisualStyle = visualStyleUrl ?? visualStyle
    const effectiveReference = referenceUrl ?? referenceBase64

    const generateOne = async (mod: CadLabModule): Promise<void> => {
      try {
        // INTENT: Strip heavy data (SVGs, code, research, templateMatchResult) to stay under
        // the 4 MB Next.js bodySizeLimit. The image server action only needs identity + text
        // fields for prompt construction.
        const slimMod: ImageGenModuleInput = {
          id: mod.id,
          name: mod.name,
          purpose: mod.purpose,
          inputs: mod.inputs,
          outputs: mod.outputs,
          keyParts: mod.keyParts,
          leadWeeks: mod.leadWeeks,
          description: mod.description,
          whyItMatters: mod.whyItMatters,
          failureModes: mod.failureModes,
          unknowns: mod.unknowns,
          moduleImagePrompt: mod.moduleImagePrompt,
          imageStatus: mod.imageStatus,
        }
        const moduleCrop = moduleCrops?.get(mod.id)
        const res = await generateCadLabSingleImageAction(projectId, slimMod, effectiveVisualStyle, effectiveReference, moduleCrop)
        if ("imageStatus" in res) {
          setModules((prev) =>
            prev.map((m) => (m.id === mod.id ? { ...m, imageUrl: res.imageUrl, imageStatus: res.imageStatus, imageError: res.imageError } : m)),
          )
          if (res.imageStatus === "complete") completedCount++
        } else if ("error" in res) {
          setModules((prev) =>
            prev.map((m) => (m.id === mod.id ? { ...m, imageStatus: "failed" as const, imageError: res.error } : m)),
          )
        }
        revealModule(mod.id)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Image generation failed"
        console.error(`[CAD-LAB] Image generation failed for ${mod.name}:`, err)
        setModules((prev) =>
          prev.map((m) => (m.id === mod.id ? { ...m, imageStatus: "failed" as const, imageError: errorMsg } : m)),
        )
        revealModule(mod.id)
      }
    }

    // INTENT: Process one at a time — concurrent large base64 payloads trigger
    // React Flight's "Maximum array nesting exceeded" serialization limit.
    // Retry (single module, no base64) always worked; this aligns bulk gen to match.
    try {
      for (let i = 0; i < modulesToProcess.length; i++) {
        await generateOne(modulesToProcess[i])
        // Small delay between calls to let React Flight serialization settle
        if (i < modulesToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
    } finally {
      // Clean up shared assets from Storage regardless of success/failure
      if (referenceUrl || visualStyleUrl) {
        cleanupSharedImageAssetsAction(projectId).catch(() => { /* Non-critical */ })
      }
    }

    // Clear any remaining safety timeouts
    for (const timeout of moduleTimeouts.values()) {
      clearTimeout(timeout)
    }
    moduleTimeouts.clear()

    // Final persist
    // INTENT: Read latest modules via pure updater, then save OUTSIDE setState
    // to avoid triggering Router update during render (server actions dispatch
    // router actions in Next.js, which is illegal inside a setState updater).
    let snapshot: CadLabModule[] = []
    setModules((current) => { snapshot = current; return current })
    saveCadLabModules(projectId, JSON.stringify(snapshot))
      .then(() => setLastSaved(new Date().toISOString()))
      .catch(() => { /* Non-critical */ })

    if (completedCount > 0) {
      toast.success(`Generated ${completedCount}/${modulesToProcess.length} blueprint illustrations`)
    } else if (modulesToProcess.length > 0) {
      toast.error("All blueprint illustrations failed to generate. Check your API key or try again.")
    }
    setIsGeneratingImages(false)
  }, [activeProjectId])

  // ── Refresh module images using current diagnostic specs ──
  // INTENT: Called from the Specify finalize card. Regenerates blueprint illustrations
  // using the existing visualStyle and systemIllustrationUrl so the images reflect
  // the user's refined manufacturing/material choices.
  const handleRefreshModuleImages = useCallback(async () => {
    if (modules.length === 0) return
    await handleGenerateModuleImages(
      modules,
      activeProjectId ?? undefined,
      visualStyle ?? undefined,
    )
  }, [modules, activeProjectId, visualStyle, handleGenerateModuleImages])

  // ── Generate CAD for a specific module ──
  const handleModuleGenerate = useCallback(async (moduleId: string, step: "interface" | "generate") => {
    const mod = modules.find((m) => m.id === moduleId)
    if (!mod) return
    if (generatingGuardRef.current.has(moduleId)) return
    generatingGuardRef.current.add(moduleId)

    startGenerating(moduleId)

    // Concurrency gate — queue if slots are full
    if (activeModuleCountRef.current >= MAX_CONCURRENCY) {
      toast.info(`${mod.name} queued — waiting for a generation slot...`, { duration: 3000 })
    }
    await waitForSlot()
    activeModuleCountRef.current++

    const moduleResearchText = mod.moduleResearch ||
      `Module: ${mod.name}\nPurpose: ${mod.purpose}\nKey Parts: ${mod.keyParts.join(", ")}\nDescription: ${mod.description}\n\nFrom parent research:\n${editableReport}`

    try {
      if (step === "interface") {
        try {
          addProgressLine(`Planning dimensions for ${mod.name}...`)
          const cpContext = buildCheckpointPromptSection(checkpoints, moduleId) || undefined
          const res = await generateCadLabInterface(`${mod.name} — ${mod.purpose}`, moduleResearchText, modelId, cpContext)
          if (res.success) {
            let updated: CadLabModule[] | null = null
            setModules((prev) => {
              updated = prev.map((m) =>
                m.id === moduleId ? { ...m, interfaceDefinition: res.interfaceDefinition, status: "interface_ready" as const } : m,
              )
              return updated
            })
            debouncedSaveModules()
            addProgressLine(`Dimensions planned for ${mod.name}!`)
          } else {
            addProgressLine(`Failed to plan dimensions for ${mod.name}.`)
          }
        } catch (err) {
          console.error("[CAD-LAB] Module interface generation failed:", err)
          addProgressLine(`Failed to plan dimensions for ${mod.name}: ${err instanceof Error ? err.message : "Unknown error"}`)
        }
      } else {
        try {
          if (!activeProjectId) throw new Error("Project not initialized")

          addProgressLine(`Generating CAD model for ${mod.name}...`)

          // P5: Request SSE stream for live progress updates
          // J6: Pass cached domain to avoid redundant Claude detection calls
          const response = await fetch("/api/cad-lab/generate-module", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            body: JSON.stringify({
              projectId: activeProjectId,
              moduleId,
              ...(detectedDomain && { domainHint: detectedDomain }),
            }),
          })

          if (!response.ok) {
            const errBody = await response.json().catch(() => ({ error: "Unknown error" })) as { error?: string }
            throw new Error(errBody.error || `HTTP ${response.status}`)
          }

          // P5: Read SSE stream and update batchProgress at each event
          if (response.headers.get("content-type")?.includes("text/event-stream") && response.body) {
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""

            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })

              // Parse complete SSE messages from buffer
              const messages = buffer.split("\n\n")
              buffer = messages.pop() ?? "" // Keep incomplete message in buffer

              for (const msg of messages) {
                for (const line of msg.split("\n")) {
                  if (!line.startsWith("data: ")) continue
                  try {
                    const event = JSON.parse(line.slice(6)) as { type: string; step?: string; module?: CadLabModule; message?: string; estimate?: EarlyCostEstimate }
                    if (event.type === "status") {
                      const stepLabel = event.step === "interface" ? "interface" as const
                        : event.step === "upload" ? "generating" as const
                        : "generating" as const
                      setBatchProgress((prev) => ({ ...prev, [moduleId]: stepLabel }))
                      if (event.step === "interface") addProgressLine(`Planning dimensions for ${mod.name}...`)
                      else if (event.step === "codegen") addProgressLine(`Generating code for ${mod.name}...`)
                      else if (event.step === "modal") addProgressLine(`Executing CAD for ${mod.name}...`)
                      else if (event.step === "upload") addProgressLine(`Uploading files for ${mod.name}...`)
                    } else if (event.type === "cost_estimate" && event.estimate) {
                      // P9: Store early cost estimate
                      setEarlyCostEstimates((prev) => ({ ...prev, [moduleId]: event.estimate! }))
                    } else if (event.type === "complete" && event.module) {
                      setModules((prev) => prev.map((m) => (m.id === moduleId ? event.module! : m)))
                      debouncedSaveModules()
                      addProgressLine(`${mod.name} generated successfully!`)
                      setExpandedModuleId(moduleId)
                    } else if (event.type === "error") {
                      throw new Error(event.message || "Generation failed")
                    }
                  } catch (parseErr) {
                    if (parseErr instanceof Error && parseErr.message !== "Generation failed") {
                      // JSON parse error — skip this line
                    } else {
                      throw parseErr
                    }
                  }
                }
              }
            }
          } else {
            // Fallback: non-SSE response (backward compat)
            const data = await response.json() as { done: boolean; module: CadLabModule }
            setModules((prev) => prev.map((m) => (m.id === moduleId ? data.module : m)))
            debouncedSaveModules()
            addProgressLine(`${mod.name} generated successfully!`)
            setExpandedModuleId(moduleId)
          }
        } catch (err) {
          console.error("[CAD-LAB] Module CAD generation failed:", err)
          addProgressLine(`Failed to generate ${mod.name}: ${err instanceof Error ? err.message : "Unknown error"}`)
        }
      }
    } finally {
      activeModuleCountRef.current--
      generatingGuardRef.current.delete(moduleId)
      stopGenerating(moduleId)
    }
  }, [modules, editableReport, modelId, activeProjectId, checkpoints, addProgressLine, startGenerating, stopGenerating, waitForSlot, debouncedSaveModules, detectedDomain])

  /**
   * Single-click handler that runs the full pipeline for one module
   * (interface definition -> CAD generation) without needing the user
   * to click two separate buttons.
   *
   * @param moduleId - The module to generate
   */
  const handleGenerateSingleModule = useCallback(async (moduleId: string) => {
    const mod = modules.find((m) => m.id === moduleId)
    if (!mod || !activeProjectId) return
    if (generatingGuardRef.current.has(moduleId)) return
    generatingGuardRef.current.add(moduleId)

    startGenerating(moduleId)

    // Concurrency gate — queue if slots are full
    if (activeModuleCountRef.current >= MAX_CONCURRENCY) {
      toast.info(`${mod.name} queued — waiting for a generation slot...`, { duration: 3000 })
    }
    await waitForSlot()
    activeModuleCountRef.current++

    addProgressLine(`Starting pipeline for ${mod.name}...`)

    const moduleResearchText = mod.moduleResearch ||
      `Module: ${mod.name}\nPurpose: ${mod.purpose}\nKey Parts: ${mod.keyParts.join(", ")}\nDescription: ${mod.description}\n\nFrom parent research:\n${editableReport}`

    try {
      // Step 1: Interface definition (if not already done)
      let latestModules: CadLabModule[] | null = null
      if (mod.status === "pending") {
        addProgressLine(`Planning dimensions for ${mod.name}...`)
        const cpContext = buildCheckpointPromptSection(checkpoints, moduleId) || undefined
        const res = await generateCadLabInterface(`${mod.name} — ${mod.purpose}`, moduleResearchText, modelId, cpContext)
        if (res.success) {
          setModules((prev) => {
            latestModules = prev.map((m) =>
              m.id === moduleId ? { ...m, interfaceDefinition: res.interfaceDefinition, status: "interface_ready" as const } : m,
            )
            return latestModules
          })
          debouncedSaveModules()
          addProgressLine(`Dimensions planned for ${mod.name}. Generating CAD...`)
        } else {
          addProgressLine(`Failed to plan dimensions for ${mod.name}.`)
          return
        }
      }

      // Step 2: CAD generation
      // J6: Pass cached domain to avoid redundant Claude detection calls
      addProgressLine(`Generating CAD model for ${mod.name}...`)
      const response = await fetch("/api/cad-lab/generate-module", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: activeProjectId,
          moduleId,
          ...(detectedDomain && { domainHint: detectedDomain }),
        }),
      })

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: "Unknown error" })) as { error?: string }
        throw new Error(errBody.error || `HTTP ${response.status}`)
      }

      const data = await response.json() as { done: boolean; module: CadLabModule }
      setModules((prev) => {
        latestModules = prev.map((m) => (m.id === moduleId ? data.module : m))
        return latestModules
      })
      debouncedSaveModules()
      addProgressLine(`${mod.name} generated successfully!`)
      setExpandedModuleId(moduleId)
    } catch (err) {
      console.error("[CAD-LAB] Single module generation failed:", err)
      addProgressLine(`Failed to generate ${mod.name}: ${err instanceof Error ? err.message : "Unknown error"}`)

      // Mark module as failed in status
      setModules((prev) =>
        prev.map((m) =>
          m.id === moduleId ? { ...m, status: "failed" as const } : m,
        ),
      )
    } finally {
      activeModuleCountRef.current--
      generatingGuardRef.current.delete(moduleId)
      stopGenerating(moduleId)
    }
  }, [modules, editableReport, modelId, activeProjectId, checkpoints, addProgressLine, startGenerating, stopGenerating, waitForSlot, debouncedSaveModules, detectedDomain])

  // ── Detect running batch on project load ──
  // If user reloads while modules were generating, check DB for any
  // modules that are still in progress and start polling to catch completions.
  useEffect(() => {
    if (!activeProjectId || modules.length === 0) return

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

          // Clear any stale interval from a previous effect run
          if (batchPollIntervalRef.current) {
            clearInterval(batchPollIntervalRef.current)
            batchPollIntervalRef.current = null
          }

          // Start lightweight polling to detect completions from in-flight requests
          batchPollIntervalRef.current = setInterval(async () => {
            if (cancelled) {
              if (batchPollIntervalRef.current) clearInterval(batchPollIntervalRef.current)
              batchPollIntervalRef.current = null
              return
            }
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
                if (batchPollIntervalRef.current) clearInterval(batchPollIntervalRef.current)
                batchPollIntervalRef.current = null
                // Reload full modules from DB
                const projRes = await loadCadLabProject(activeProjectId)
                if (!("error" in projRes) && projRes.project.modules) {
                  setModules(projRes.project.modules)
                }
                setLastSaved(new Date().toISOString())
                setIsBatchRunning(false)
                setBatchProgress({})
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

    // Cleanup: stop polling on unmount or dependency change.
    // Using ref ensures cleanup works even if the interval was set
    // asynchronously after the initial render.
    return () => {
      cancelled = true
      if (batchPollIntervalRef.current) {
        clearInterval(batchPollIntervalRef.current)
        batchPollIntervalRef.current = null
      }
    }
  }, [activeProjectId, modules.length])

  // ── Per-module generation with client-side concurrency limit ──

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

    // Client-side concurrency limiter (uses shared waitForSlot)
    let completedCount = modules.filter((m) => m.status === "generated").length
    let errorCount = 0

    const RETRYABLE_STATUSES = new Set([500, 502, 503, 529])

    const generateOne = async (mod: CadLabModule, index: number): Promise<void> => {
      // INTENT: Stagger launches to avoid API burst pressure (429 cascades).
      // With MAX_CONCURRENCY=2 and 2 Claude calls per module, this keeps us
      // within standard Anthropic rate limits.
      if (index > 0) await new Promise((r) => setTimeout(r, 1500 * index))
      await waitForSlot()
      activeModuleCountRef.current++

      // Mark as generating in UI
      setBatchProgress((prev) => ({ ...prev, [mod.id]: "generating" }))

      try {
        const MAX_ATTEMPTS = 2
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          try {
            // J6: Pass cached domain to avoid redundant Claude detection calls
            const res = await fetch("/api/cad-lab/generate-module", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                projectId: activeProjectId,
                moduleId: mod.id,
                ...(detectedDomain && { domainHint: detectedDomain }),
              }),
            })

            if (!res.ok) {
              const errBody = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string }
              const httpStatus = res.status
              // Auto-retry once on transient server errors
              if (attempt === 0 && RETRYABLE_STATUSES.has(httpStatus)) {
                addProgressLine(`${mod.name} failed (attempt 1), retrying in 3s...`)
                await new Promise((r) => setTimeout(r, 3000))
                continue
              }
              throw new Error(errBody.error || `HTTP ${httpStatus}`)
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

            // Auto-expand and scroll to the completed module
            setExpandedModuleId(mod.id)
            requestAnimationFrame(() => {
              const el = document.getElementById(`module-${mod.id}`)
              el?.scrollIntoView({ behavior: "smooth", block: "start" })
            })

            // Request notification permission after the first success (less disruptive)
            if (completedCount === 1 && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
              Notification.requestPermission().catch(() => { /* Non-critical */ })
            }
            return // Success — exit the retry loop
          } catch (err) {
            // On last attempt, surface the error
            if (attempt === MAX_ATTEMPTS - 1) throw err
          }
        }
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
      await Promise.allSettled(pending.map((mod, i) => generateOne(mod, i)))
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
      setBatchProgress({})

      if (errorCount === 0) {
        setMilestone("batch")
        addProgressLine(`All ${pending.length} modules generated successfully.`)
        sendNotification("The Forge — All Modules Generated", `${pending.length} modules for "${subject}" are ready. View results now.`)
        toast.success(`All ${pending.length} modules generated successfully`)
      } else {
        const successCount = completedCount - (modules.length - pending.length)
        addProgressLine(
          `Batch finished — ${successCount}/${pending.length} modules generated, ${errorCount} failed.`,
        )
        toast.warning(`${successCount} of ${pending.length} modules generated — ${errorCount} failed`, {
          description: "Use Retry All Failed to try again.",
          duration: 8000,
        })
        sendNotification("The Forge — Batch Finished", `${errorCount} module(s) failed for "${subject}". Check results.`)
      }
    }
  }, [modules, isBatchRunning, activeProjectId, addProgressLine, sendNotification, subject, waitForSlot, detectedDomain])

  // ── Retry system illustration ──
  const handleRetryIllustration = useCallback(() => {
    if (!activeProjectId) return
    setSystemIllustrationStatus("generating")
    setSystemIllustrationError(null)
    generateCadLabSystemIllustrationAction(
      activeProjectId,
      subject,
      modules.map((m) => m.name),
      modules.map((m) => m.purpose),
      visualStyle ?? undefined,
    )
      .then((illRes) => {
        if ("url" in illRes) {
          setSystemIllustrationUrl(illRes.url)
          setSystemIllustrationStatus("complete")
          saveCadLabSystemIllustration(activeProjectId!, illRes.url)
            .catch((e) => console.error("[CAD-LAB] Failed to persist system illustration URL:", e))
        } else {
          console.error("[CAD-LAB] System illustration retry failed:", "error" in illRes ? illRes.error : "unknown")
          setSystemIllustrationStatus("failed")
          setSystemIllustrationError("error" in illRes ? (illRes as { error: string }).error : "Generation failed")
        }
      })
      .catch((e) => {
        console.error("[CAD-LAB] System illustration retry failed:", e)
        setSystemIllustrationStatus("failed")
        setSystemIllustrationError(e instanceof Error ? e.message : "Generation failed")
      })
  }, [activeProjectId, subject, modules, visualStyle])

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
    setSystemIllustrationStatus("idle")
    setSystemIllustrationUrl(null)
    setSystemIllustrationError(null)

    addProgressLine("Searching engineering databases for real-world specifications...")
    const researchTimers: ReturnType<typeof setTimeout>[] = []
    researchTimers.push(setTimeout(() => addProgressLine("Querying Thingiverse and GrabCAD for reference CAD models..."), 3000))
    researchTimers.push(setTimeout(() => addProgressLine("Cross-referencing manufacturer datasheets and published specs..."), 6000))
    researchTimers.push(setTimeout(() => addProgressLine("Identifying material candidates and manufacturing constraints..."), 9000))
    researchTimers.push(setTimeout(() => addProgressLine("Synthesising engineering report from all sources..."), 13000))
    researchTimers.push(setTimeout(() => addProgressLine("Extracting key dimensions, tolerances, and interface constraints..."), 17000))
    researchTimers.push(setTimeout(() => addProgressLine("Validating specifications against industry standards..."), 22000))

    try {
      const res = await runCadLabResearch(subject, {
        designBrief,
        assumptionNotes,
      })
      researchTimers.forEach(clearTimeout)

      setProgressLines([
        `Found ${res.sources.length} web sources with engineering data`,
        `Found ${res.referenceModels.length} reference CAD models`,
        `Report complete — ${res.report.length.toLocaleString()} characters`,
        `Research time: ${(res.researchTime / 1000).toFixed(1)}s`,
      ])

      setResearchResult(res)
      setEditableReport(res.report)

      // Seed product overview immediately so it's visible while illustration generates
      if (!productOverviewRef.current) {
        const summary = extractExecutiveSummary(res.report)
        if (summary) {
          setProductOverview(summary)
        }
      }

      if (res.success) {
        setMilestone("research")
        freshResearchRef.current = true // INTENT: must be set BEFORE any await so the auto-decompose effect sees it when React flushes the batch
        const projId = await ensureProject()
        if (projId) {
          setIsSaving(true)
          await saveCadLabResearch(projId, res)
          // Persist seeded overview alongside research
          if (!productOverviewRef.current) {
            const summary = extractExecutiveSummary(res.report)
            if (summary) {
              setProductOverview(summary)
              saveCadLabProductOverview(projId, summary).catch(() => {
                console.error("[CAD-LAB] Failed to persist seeded overview")
              })
            }
          }
          setLastSaved(new Date().toISOString())
          setIsSaving(false)
          refreshProjects()

          // DECISION: No illustration here — wait until handleDecompose runs so the
          // system illustration is generated with full module context (names + purposes).
          // The image pipeline in handleDecompose already handles: visual style → system
          // illustration (with modules) → module images (referencing hero).

        }
      }
    } catch (err) {
      researchTimers.forEach(clearTimeout)
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
    // Flush any pending debounced save before clearing state
    if (savePendingRef.current) {
      clearTimeout(savePendingRef.current)
      savePendingRef.current = null
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem(CAD_LAB_ACTIVE_PROJECT_KEY)
      localStorage.removeItem(CAD_LAB_DRAFT_SUBJECT_KEY)
    }
    setSubject("")
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
    setDecompositionError(null)
    setExpandedModuleId(null)
    setGeneratingModuleIds(new Set())
    setDiagnosticAnswers({})
    setProgressLines([])
    setBatchProgress({})
    setAiPrefilled(false)
    setMilestone(null)
    setIntegratedAssemblyStlUrl(null)
    setIntegratedAssemblyStepUrl(null)
    setIntegrationError(null)
    setRevealedModuleIds(new Set())
    setVisualStyle(null)
    setSystemIllustrationUrl(null)
    setSystemIllustrationStatus("idle")
    setCheckpoints(null)
    setProductOverview("")
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
        // INTENT: Failed image statuses are transient (API timeouts, stale errors, etc.)
        // and shouldn't persist across sessions — clear them so users see pending skeletons
        // instead of stale error messages. Only imageUrl (successful results) persists.
        const cleanedModules = p.modules.map(m =>
          m.imageStatus === "failed"
            ? { ...m, imageStatus: undefined, imageError: undefined }
            : m
        )
        setModules(cleanedModules)
        // All loaded modules are immediately revealed (no progressive reveal for saved projects)
        setRevealedModuleIds(new Set(p.modules.map((m) => m.id)))
        // Recompute revisedModuleIds and acknowledgment from persisted conceptSnapshot
        const modulesWithSnapshots = p.modules.filter((m) => m.conceptSnapshot)
        setRevisedModuleIds(new Set(modulesWithSnapshots.map((m) => m.id)))
        setCheckpointAcknowledged(modulesWithSnapshots.length > 0)
      } else {
        setModules([])
        setRevealedModuleIds(new Set())
        setRevisedModuleIds(new Set())
        setCheckpointAcknowledged(false)
      }

      setLastSaved(p.updatedAt)
      setShowProjects(false)
      setDecompositionError(null)
      setMilestone(null)
      setProgressLines([])
      setVisualStyle(p.visualStyle ?? null)
      setSystemIllustrationUrl(p.systemIllustrationUrl ?? null)
      setSystemIllustrationStatus(p.systemIllustrationUrl ? "complete" : "idle")
      setSystemIllustrationError(null)
      setIntegratedAssemblyStlUrl(p.integratedAssemblyStlUrl ?? null)
      setIntegratedAssemblyStepUrl(p.integratedAssemblyStepUrl ?? null)
      setCheckpoints(p.checkpoints ?? null)
      setProductOverview(p.productOverview ?? "")
      // P1: Load persisted interface contracts + unmatched ports
      setInterfaceContracts(p.interfaceContracts?.contracts ?? [])
      setUnmatchedPorts({
        outputs: p.interfaceContracts?.unmatchedOutputs ?? [],
        inputs: p.interfaceContracts?.unmatchedInputs ?? [],
      })
      // Restore diagnostic answers from database
      if (p.diagnosticAnswers && Object.keys(p.diagnosticAnswers).length > 0) {
        setDiagnosticAnswers(p.diagnosticAnswers)
      }

      // Fetch manufacturing order count for this project
      const ordersRes = await getProjectOrders(projectId)
      if ("orders" in ordersRes) {
        setManufacturingOrderCount(ordersRes.orders.length)
      }
    } catch {
      console.error("[CAD-LAB] Failed to load project")
    }
  }, [])

  // INTENT: Restore the last active project when the provider remounts after
  // navigation. Without this, navigating away and back leaves a blank canvas
  // because activeProjectId initializes to null and nothing triggers a load.
  // Guarded by autoRestoreRef to prevent double-fire in React StrictMode.
  useEffect(() => {
    if (!initialized) return
    if (autoRestoreRef.current) return
    autoRestoreRef.current = true
    if (typeof window === "undefined") return
    const storedProjectId = localStorage.getItem(CAD_LAB_ACTIVE_PROJECT_KEY)
    if (storedProjectId) {
      handleLoadProject(storedProjectId)
    }
  }, [initialized, handleLoadProject])

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

  // ── Generate integrated assembly ──
  const handleGenerateIntegration = useCallback(async () => {
    if (!activeProjectId) return
    setIntegrationError(null)
    setIntegrationAssemblyCode(null)
    setIsIntegrating(true)
    try {
      const res = await generateSystemAssembly(activeProjectId)
      setIntegrationAssemblyCode(res.assemblyCode ?? null)
      if (res.success) {
        const saveRes = await saveCadLabIntegratedAssembly(activeProjectId, res.stlUrl, res.stepUrl, res.assemblyCode)
        if (!("error" in saveRes)) {
          setIntegratedAssemblyStlUrl(res.stlUrl)
          setIntegratedAssemblyStepUrl(res.stepUrl)
          setLastSaved(new Date().toISOString())
          refreshProjects()
        } else {
          setIntegrationError(saveRes.error)
        }
      } else {
        setIntegrationError(res.error)
      }
    } finally {
      setIsIntegrating(false)
    }
  }, [activeProjectId, refreshProjects])

  // ── Checkpoint acknowledgment + auto-revision ──
  // DECISION: Combined into one context-level handler so acknowledgment persists
  // across page navigation and double-revision is prevented by checking conceptSnapshot.
  const handleAcknowledgeCheckpoints = useCallback(() => {
    if (checkpointAcknowledged || isRevising) return
    setCheckpointAcknowledged(true)

    // Fire-and-forget revision — UI shows spinner via isRevising
    if (!checkpoints) return
    // Guard: if modules already have snapshots, revision already happened (e.g. loaded from DB)
    const alreadyRevised = modulesRef.current.some((m) => m.conceptSnapshot)
    if (alreadyRevised) return

    setIsRevising(true)
    reviseModulesFromCheckpoints({
      modules: modulesRef.current,
      checkpoints,
      researchReport: editableReport,
      projectSubject: subject,
    }).then((revised) => {
      const revisedIds = Object.keys(revised)
      if (revisedIds.length === 0) return

      setModules((prev) =>
        prev.map((mod) => {
          const fields = revised[mod.id]
          if (!fields) return mod
          // GUARD: Never overwrite an existing snapshot (prevents double-revision)
          if (mod.conceptSnapshot) return { ...mod, ...fields }
          return {
            ...mod,
            conceptSnapshot: {
              purpose: mod.purpose,
              description: mod.description,
              keyParts: [...mod.keyParts],
              whyItMatters: mod.whyItMatters,
              failureModes: [...mod.failureModes],
              unknowns: [...mod.unknowns],
            },
            purpose: fields.purpose,
            description: fields.description,
            keyParts: fields.keyParts,
            whyItMatters: fields.whyItMatters,
            failureModes: fields.failureModes,
            unknowns: fields.unknowns,
          }
        }),
      )
      debouncedSaveModules()
      setRevisedModuleIds(new Set(revisedIds))
      toast.success(`${revisedIds.length} module${revisedIds.length === 1 ? "" : "s"} revised with specialist feedback`)
    }).catch((err) => {
      console.error("[CAD-LAB] Checkpoint revision failed:", err)
      toast.error("Module revision failed — proceeding with original descriptions")
    }).finally(() => {
      setIsRevising(false)
    })
  }, [checkpointAcknowledged, isRevising, checkpoints, editableReport, subject, debouncedSaveModules])

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
    isLoadingProjects, isSaving, lastSaved, saveError,
    refreshProjects, handleLoadProject, handleDeleteProject, linkRfqToProject,
    sector,
    referenceModel,
    subject, setSubject, modelId, setModelId,
    designBrief, setDesignBrief, assumptionNotes, setAssumptionNotes, designReadinessPct,
    isResearching, researchResult, editableReport, setEditableReport,
    showSources, setShowSources, hasResearch, freshResearchRef,
    handleResearch, handleReset,
    isDecomposing, decompositionError, modules, setModules,
    expandedModuleId, setExpandedModuleId, generatingModuleIds,
    diagnosticAnswers, setDiagnosticAnswers, aiPrefilled,
    handleDecompose, handleModuleGenerate, handleGenerateSingleModule, handleGenerateAllModules,
    isBatchRunning, batchProgress,
    isGeneratingImages, handleGenerateModuleImages, handleRefreshModuleImages,
    revealedModuleIds,
    visualStyle,
    systemIllustrationUrl, systemIllustrationStatus, systemIllustrationError, handleRetryIllustration,
    progressLines, milestone, setMilestone,
    isAnyLoading, generatedModuleCount, riskCount, diagCompletedCount,
    integratedAssemblyStlUrl, integratedAssemblyStepUrl, isIntegrating, integrationError, integrationAssemblyCode, setIntegrationError, handleGenerateIntegration,
    checkpoints, isCheckpointing,
    isRevising, revisedModuleIds, checkpointAcknowledged, handleAcknowledgeCheckpoints,
    productOverview, setProductOverview: setProductOverviewAndSave,
    handleUpdateModule,
    earlyCostEstimates,
    interfaceContracts,
    isExtractingContracts,
    unmatchedPorts,
    specifiedModuleCount,
    manufacturingOrderCount,
    refreshManufacturingOrderCount,
    isSpecificationComplete,
    projectReviewVerdicts,
    initialized,
    initializeCadLab,
    handleDownload,
  }

  return <CadLabContext.Provider value={value}>{children}</CadLabContext.Provider>
}
