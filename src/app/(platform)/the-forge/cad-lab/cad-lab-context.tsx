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
  useMemo,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react"

import { createClient } from "@/lib/supabase/client"
import {
  runCadLabResearch,
  generateCadLabInterface,
  generateCadLabModelSmart,
  prepareDecomposition,
  decomposeIntoModules,
  skeletonDecompose,
  expandModuleDetail,
  prefillDiagnostics,
  generateSystemAssembly,
  extractInterfaceContracts,
  executeCadQueryAction,
  refineCadQueryCodeAction,
} from "@/actions/cad-lab"
import { buildCheckpointPromptSection } from "@/lib/cad-lab/checkpoint-prompt"
import { matchReferenceModel } from "@/actions/reference-models"
import { saveCadLabIntegratedAssembly, saveCadLabSystemIllustration, saveCadLabVisualStyle, saveCadLabInterfaceContracts, saveCadLabDiagnosticAnswers, saveCadLabDiagnosticEnrichment, saveCadLabDecompositionConnections, saveCadLabUnifiedResult, saveCadLabDesignRevision, saveCadLabAiCostEstimates, saveCadLabReviewSkipped, saveCadLabPartCategoryOverrides, pollUnifiedResultAction } from "@/actions/cad-lab-projects"
import { estimateModuleCostsAi } from "@/actions/cad-lab-cost"
import { getTechniqueInsightsByProcess } from "@/actions/manufacturing-techniques"
import { useBackgroundOps } from "@/contexts/background-ops-context"
import type { DiagnosticEnrichment } from "@/lib/cad-lab/diagnostic-enrichment"
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

import { generateCadLabSingleImageAction, generateCadLabSystemIllustrationAction, generateVisualStyleAction, generateDesignSynthesisAction, generateProductIdentityAction, reconcileDesignAction, fetchAndCropReferenceAction, analyseHeroForModulesAction, cropModuleRegionAction, uploadSharedImageAssetsAction, cleanupSharedImageAssetsAction, flipCadLabImageForMirrorAction } from "@/actions/cad-lab-images"
import type { ImageGenModuleInput } from "@/lib/cad-lab/module-to-module-spec-adapter"
import { toast } from "sonner"
import type { CadLabProjectSummary } from "@/actions/cad-lab-projects"
import type {
  CadLabResearchResult,
  CadLabResult,
  CadLabModule,
  ClaudeModelId,
  CadLabDesignBrief,
  VisualStyleSpec,
  DecompositionCheckpoint,
  EarlyCostEstimate,
  InterfaceContract,
  ModuleConnection,
  SpecialistReview,
  AiCostEstimate,
  PartCategoryOverride,
  ABProvider,
  ProviderResult,
} from "@/lib/cad-lab-types"
import { requestDecompositionCheckpoints, reviseModulesFromCheckpoints, reviseModulesFromReviews } from "@/actions/cad-lab-reviews"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type { Sector } from "@/types/foundry"
import type { CadLabDomain } from "@/lib/cad-lab/domain-prompts"
import type { ReferenceImageFile, StoredReferenceImage } from "@/lib/cad-lab/reference-image-types"
import { uploadReferenceImages, saveReferenceImageUrls } from "@/actions/cad-lab-reference-images"
import type { ReferenceDocumentFile } from "@/lib/cad-lab/reference-document-types"
import { EXTRACTABLE_TYPES } from "@/lib/cad-lab/reference-document-types"
import { uploadReferenceDocuments, extractDocumentText, saveReferenceDocumentUrls } from "@/actions/cad-lab-reference-documents"
import { arrayBufferToBase64 } from "./components/reference-document-upload"

// ─── Persistence key for last active project (restore on return) ─────

const CAD_LAB_ACTIVE_PROJECT_KEY = "forgeos:cad-lab:active-project"
const CAD_LAB_DRAFT_SUBJECT_KEY = "forgeos:cad-lab:draft-subject"

/** Maximum number of concurrent module generation requests */
const MAX_CONCURRENCY = 2

// INTENT: Bump this whenever the cost estimation prompt changes materially.
// The fingerprint includes this version so stale DB-cached estimates auto-invalidate.
const COST_PROMPT_VERSION = 3

// ─── Extract executive summary from research report markdown ─────────

function extractExecutiveSummary(report: string): string | null {
  // Try exact "## Executive Summary" heading first
  const startMatch = report.match(/^##?\s+Executive\s+Summary/im)
  if (startMatch && startMatch.index !== undefined) {
    const afterHeading = report.slice(startMatch.index + startMatch[0].length)
    const nextHeading = afterHeading.search(/^##?\s/m)
    const body = nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading)
    const trimmed = body.trim()
    if (trimmed.length > 0) return trimmed
  }

  // Fallback: first substantial paragraph of the report (skip headings and short lines)
  const lines = report.split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length > 80 && !trimmed.startsWith("#")) return trimmed
  }

  // Last resort: first 500 chars of the report, stripped of markdown headings
  const stripped = report.replace(/^#+\s+.*/gm, "").trim()
  return stripped.length > 0 ? stripped.slice(0, 500) : null
}

// ─── Context Shape ───────────────────────────────────────────────────

type MilestoneType = "research" | "breakdown" | "generate" | "batch" | null

export interface ImageGenProgress {
  completed: number
  total: number
  failed: number
  phase?: "generating" | "retrying"
}

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

  // Model attribution (which LLM produced research + decomposition)
  researchModelUsed: string | null
  decompositionModelUsed: string | null

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
  diagnosticEnrichment: DiagnosticEnrichment
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
  imageGenProgress: ImageGenProgress | null
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

  // AI-powered cost estimates (keyed by moduleId)
  aiCostEstimates: Record<string, AiCostEstimate>
  isEstimatingCosts: boolean
  costEstimationError: string | null

  // Part classification overrides (keyed by "${moduleId}::${partName}")
  partCategoryOverrides: Record<string, PartCategoryOverride>
  setPartCategoryOverride: (partKey: string, override: PartCategoryOverride) => void
  clearPartCategoryOverride: (partKey: string) => void

  // Decomposition connections (highest-fidelity edge source)
  decompositionConnections: ModuleConnection[]

  // P1: Interface contracts
  interfaceContracts: InterfaceContract[]
  isExtractingContracts: boolean
  unmatchedPorts: { outputs: Array<{ moduleId: string; portName: string }>; inputs: Array<{ moduleId: string; portName: string }> }

  // Specialist reviews (lifted from pages for persistence across navigation)
  moduleReviews: Record<string, SpecialistReview[]>
  handleReviewComplete: (moduleId: string, review: SpecialistReview) => void
  pendingReviewKeys: Set<string>
  markReviewPending: (moduleId: string, specialistId: string) => void
  clearReviewPending: (moduleId: string, specialistId: string) => void
  isApplyingReviewRevisions: boolean
  handleApplyReviewRevisions: (acceptedIssues: Array<{
    moduleId: string
    moduleName: string
    specialistName: string
    issue: { severity: string; category: string; message: string; suggestion?: string }
  }>) => Promise<void>

  // Pipeline stage tracking (4-stage flow)
  specifiedModuleCount: number
  manufacturingOrderCount: number
  refreshManufacturingOrderCount: () => Promise<void>
  isSpecificationComplete: boolean
  projectReviewVerdicts: Record<string, Record<string, SpecialistReview>>

  // Interactive code workbench
  handleExecuteModuleCode: (moduleId: string, code: string) => Promise<void>
  handleRefineModuleCode: (moduleId: string, currentCode: string, instruction: string) => Promise<string | null>

  // Unified model generation (single model for entire product)
  unifiedResult: CadLabResult | null
  unifiedCode: string | null
  isGeneratingUnified: boolean
  handleGenerateUnifiedModel: () => Promise<void>
  handleExecuteUnifiedCode: (code: string) => Promise<void>
  handleRefineUnifiedCode: (currentCode: string, instruction: string) => Promise<string | null>

  // Specialist review gating (three-state finalization)
  reviewSkipped: boolean
  allModulesReviewed: boolean
  handleSkipReviews: () => void

  // Design revision (post-specialist-review versioning)
  designRevision: number
  imagesStale: boolean
  isRegeneratingImages: boolean
  /** Escape hatch when regeneration fails persistently — marks images current without regenerating. */
  markImagesCurrentManually: () => void
  handleRegenerateDrawingsAfterRevision: () => Promise<void>

  /** Directly trigger cost re-estimation (bypasses effect system to avoid cascading re-renders) */
  reEstimateCosts: () => void

  // Provider A/B comparison
  providerResults: Record<string, ProviderResult>
  isComparingProviders: boolean
  handleCompareProviders: (providers: ABProvider[]) => Promise<void>

  // Tripo 3D preview (Design tab)
  tripoPreviewUrl: string | null
  tripoPreviewStatus: "idle" | "generating" | "complete" | "failed"
  tripoPreviewError: string | null
  handleGenerateTripoPreview: () => void

  // Lazy initialization (provider mounted at platform level, init on first CAD Lab visit)
  initialized: boolean
  initializeCadLab: () => void

  // Per-module re-expansion (reload sparse modules without full re-decomposition)
  reExpandingModuleIds: Set<string>
  handleReExpandModule: (moduleId: string) => Promise<void>

  // Design brief interview (Max CTO guided Q&A)
  interviewPhase: "idle" | "interviewing" | "synthesizing" | "complete"
  setInterviewPhase: Dispatch<SetStateAction<"idle" | "interviewing" | "synthesizing" | "complete">>

  // Reference images (user-uploaded sketches/photos)
  referenceImages: ReferenceImageFile[]
  setReferenceImages: Dispatch<SetStateAction<ReferenceImageFile[]>>

  // Reference documents (user-uploaded spec sheets, datasheets, CAD files)
  referenceDocuments: ReferenceDocumentFile[]
  setReferenceDocuments: Dispatch<SetStateAction<ReferenceDocumentFile[]>>
  /** Concatenated extracted specs from all completed documents, capped at 15K chars */
  documentContext: string

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
  const [modelId, setModelId] = useState<ClaudeModelId>("claude-opus-4-6")

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

  // ── Design brief interview phase ──
  const [interviewPhase, setInterviewPhase] = useState<"idle" | "interviewing" | "synthesizing" | "complete">("idle")

  // ── Research state ──
  const [isResearching, setIsResearching] = useState(false)
  const [researchResult, setResearchResult] = useState<CadLabResearchResult | null>(null)
  const [editableReport, setEditableReport] = useState("")
  const [showSources, setShowSources] = useState(false)

  // ── Model attribution (which LLM produced research + decomposition) ──
  const [researchModelUsed, setResearchModelUsed] = useState<string | null>(null)
  const [decompositionModelUsed, setDecompositionModelUsed] = useState<string | null>(null)

  // ── Module state ──
  const [isDecomposing, setIsDecomposing] = useState(false)
  const [decompositionError, setDecompositionError] = useState<string | null>(null)
  // J6: Cache detected domain so per-module generation reuses it (no redundant Claude calls)
  const [detectedDomain, setDetectedDomain] = useState<CadLabDomain | null>(null)
  const [modules, setModules] = useState<CadLabModule[]>([])
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null)
  const [generatingModuleIds, setGeneratingModuleIds] = useState<Set<string>>(new Set())
  const [reExpandingModuleIds, setReExpandingModuleIds] = useState<Set<string>>(new Set())

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
  const [diagnosticEnrichment, setDiagnosticEnrichment] = useState<DiagnosticEnrichment>({})
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
    return new Promise<void>((resolve, reject) => {
      const TIMEOUT_MS = 120_000 // 2 minutes max wait
      const start = Date.now()
      const check = setInterval(() => {
        if (activeModuleCountRef.current < MAX_CONCURRENCY) {
          clearInterval(check)
          resolve()
        } else if (Date.now() - start > TIMEOUT_MS) {
          clearInterval(check)
          reject(new Error("Generation slot timeout — previous generation may be stuck. Try refreshing."))
        }
      }, 200)
    })
  }, [])

  // Ref for batch reconnection polling interval (so cleanup always works)
  const batchPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Image generation state (Gemini blueprint illustrations) ──
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)
  const [imageGenProgress, setImageGenProgress] = useState<ImageGenProgress | null>(null)

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

  // ── Unified model generation ──
  const [unifiedResult, setUnifiedResult] = useState<CadLabResult | null>(null)
  const [unifiedCode, setUnifiedCode] = useState<string | null>(null)
  const [isGeneratingUnified, setIsGeneratingUnified] = useState(false)
  // INTENT: Synchronous double-click guard — prevents duplicate handler invocations
  // between click and React re-render (before disabled prop takes effect)
  const unifiedGuardRef = useRef(false)
  // INTENT: Polling refs for background-resilient generation — when SSE breaks
  // (e.g. navigation), we poll the DB until the server-side route persists the result.
  const unifiedPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const unifiedBgOpIdRef = useRef<string | null>(null)
  const { startOp, updateOp, completeOp, failOp } = useBackgroundOps()

  // ── Reference images (user-uploaded sketches/photos) ──
  const [referenceImages, setReferenceImages] = useState<ReferenceImageFile[]>([])
  const referenceImagesRef = useRef(referenceImages)
  useEffect(() => { referenceImagesRef.current = referenceImages }, [referenceImages])

  // ── Reference documents (user-uploaded spec sheets, datasheets, CAD files) ──
  const [referenceDocuments, setReferenceDocuments] = useState<ReferenceDocumentFile[]>([])
  const referenceDocumentsRef = useRef(referenceDocuments)
  useEffect(() => { referenceDocumentsRef.current = referenceDocuments }, [referenceDocuments])

  // INTENT: Computed concatenation of all extracted specs, capped at 15K chars.
  // Exposed on context so pipeline stages can inject into prompts.
  const documentContext = useMemo(() => {
    const specs = referenceDocuments
      .filter(d => d.extractionStatus === "complete" && d.extractedSpecs?.trim())
      .map(d => `### ${d.name}\n${d.extractedSpecs}`)
      .join("\n\n")
    return specs.length > 15_000 ? specs.slice(0, 15_000) + "\n\n[Document context truncated]" : specs
  }, [referenceDocuments])

  // ── Provider A/B comparison ──
  const [providerResults, setProviderResults] = useState<Record<string, ProviderResult>>({})
  const [isComparingProviders, setIsComparingProviders] = useState(false)

  // ── Tripo 3D preview (Design tab) ──
  const [tripoPreviewUrl, setTripoPreviewUrl] = useState<string | null>(null)
  const [tripoPreviewStatus, setTripoPreviewStatus] = useState<"idle" | "generating" | "complete" | "failed">("idle")
  const [tripoPreviewError, setTripoPreviewError] = useState<string | null>(null)
  const tripoAbortRef = useRef<AbortController | null>(null)
  const tripoGuardRef = useRef(false)

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

  // AI cost estimates (keyed by moduleId)
  const [aiCostEstimates, setAiCostEstimates] = useState<Record<string, AiCostEstimate>>({})
  const [isEstimatingCosts, setIsEstimatingCosts] = useState(false)
  const [costEstimationError, setCostEstimationError] = useState<string | null>(null)
  const aiCostFingerprintRef = useRef<string>("")

  // Part classification overrides (keyed by "${moduleId}::${partName}")
  const [partCategoryOverrides, setPartCategoryOverrides] = useState<Record<string, PartCategoryOverride>>({})

  // Decomposition connections (AI-declared inter-module topology)
  const [decompositionConnections, setDecompositionConnections] = useState<ModuleConnection[]>([])

  // P1: Interface contracts between modules
  const [interfaceContracts, setInterfaceContracts] = useState<InterfaceContract[]>([])
  const [isExtractingContracts, setIsExtractingContracts] = useState(false)
  const [unmatchedPorts, setUnmatchedPorts] = useState<{ outputs: Array<{ moduleId: string; portName: string }>; inputs: Array<{ moduleId: string; portName: string }> }>({ outputs: [], inputs: [] })
  const [isRevising, setIsRevising] = useState(false)
  const [revisedModuleIds, setRevisedModuleIds] = useState<Set<string>>(new Set())
  const [checkpointAcknowledged, setCheckpointAcknowledged] = useState(false)

  // ── Design revision (post-specialist-review versioning) ──
  const [designRevision, setDesignRevision] = useState(1)
  const [imagesGeneratedAtRevision, setImagesGeneratedAtRevision] = useState(1)
  const [isRegeneratingImages, setIsRegeneratingImages] = useState(false)
  const imagesStale = designRevision > imagesGeneratedAtRevision

  // Ref-mirror for closures
  const designRevisionRef = useRef(designRevision)
  useEffect(() => { designRevisionRef.current = designRevision }, [designRevision])

  // INTENT: Ref for handleRegenerateDrawingsAfterRevision so handleApplyReviewRevisions
  // can auto-chain drawing regen without a forward-reference TDZ issue in deps.
  const regenDrawingsRef = useRef<(() => Promise<void>) | null>(null)

  // INTENT: Ref for handleRetryIllustration so handleRefreshModuleImages can
  // trigger hero generation when the system illustration is missing, without
  // taking a forward reference on a callback declared later in the file.
  const retryIllustrationRef = useRef<(() => void) | null>(null)

  // ── Specialist reviews (lifted from Build/Specify pages for persistence) ──
  const [moduleReviews, setModuleReviews] = useState<Record<string, SpecialistReview[]>>({})
  const [pendingReviewKeys, setPendingReviewKeys] = useState<Set<string>>(new Set())

  const markReviewPending = useCallback((moduleId: string, specialistId: string) => {
    setPendingReviewKeys(prev => new Set(prev).add(`${moduleId}:${specialistId}`))
  }, [])

  const clearReviewPending = useCallback((moduleId: string, specialistId: string) => {
    setPendingReviewKeys(prev => {
      const next = new Set(prev)
      next.delete(`${moduleId}:${specialistId}`)
      return next
    })
  }, [])

  const handleReviewComplete = useCallback((moduleId: string, review: SpecialistReview) => {
    setModuleReviews(prev => {
      const existing = prev[moduleId] ?? []
      const filtered = existing.filter(r => r.specialistId !== review.specialistId)
      return { ...prev, [moduleId]: [...filtered, review] }
    })
    setPendingReviewKeys(prev => {
      const next = new Set(prev)
      next.delete(`${moduleId}:${review.specialistId}`)
      return next
    })
  }, [])

  // ── Review gating (three-state finalization) ──
  const [reviewSkipped, setReviewSkipped] = useState(false)

  // INTENT: True when every module has at least one specialist review
  const allModulesReviewed = modules.length > 0 && modules.every(m => {
    const reviews = moduleReviews[m.id]
    return reviews && reviews.length > 0
  })

  const handleSkipReviews = useCallback(() => {
    setReviewSkipped(true)
    if (activeProjectIdRef.current) {
      saveCadLabReviewSkipped(activeProjectIdRef.current, true)
        .catch(err => console.error("[CAD-LAB] Failed to save review skipped:", err))
    }
  }, [])

  // ── Apply review revisions (AI-driven rewriting from accepted issues) ──
  const [isApplyingReviewRevisions, setIsApplyingReviewRevisions] = useState(false)
  const handleApplyReviewRevisions = useCallback(async (acceptedIssues: Array<{
    moduleId: string
    moduleName: string
    specialistName: string
    issue: { severity: string; category: string; message: string; suggestion?: string }
  }>) => {
    if (acceptedIssues.length === 0) return
    setIsApplyingReviewRevisions(true)

    try {
      const revised = await reviseModulesFromReviews({
        modules: modulesRef.current,
        acceptedIssues,
        diagnosticAnswers: diagnosticAnswersRef.current,
        projectSubject: subject,
      })

      // GOTCHA: withAIGate returns { error, limitReached } when quota exhausted,
      // cast as the return type. Detect this before treating as module revisions.
      const revAsAny = revised as Record<string, unknown>
      if ('error' in revAsAny && typeof revAsAny.error === 'string') {
        toast.error(revAsAny.error as string)
        return
      }

      if (Object.keys(revised).length === 0) {
        toast.error("Revision failed — no modules were updated")
        return
      }

      // Update modules with revised fields + snapshot for redline diff
      setModules(prev => prev.map(m => {
        const rev = revised[m.id]
        if (!rev) return m
        return {
          ...m,
          conceptSnapshot: {
            purpose: m.purpose,
            description: m.description,
            keyParts: [...m.keyParts],
            whyItMatters: m.whyItMatters,
            failureModes: [...m.failureModes],
            unknowns: [...m.unknowns],
          },
          purpose: rev.purpose,
          description: rev.description,
          keyParts: rev.keyParts,
          whyItMatters: rev.whyItMatters,
          failureModes: rev.failureModes,
          unknowns: rev.unknowns,
          revisionNumber: (m.revisionNumber ?? 1) + 1,
          lastRevisionSource: "review" as const,
        }
      }))

      // Track which modules were revised
      setRevisedModuleIds(new Set(Object.keys(revised)))

      // Save updated modules to DB
      if (activeProjectIdRef.current) {
        // INTENT: Read the updated modules from the ref after setModules has flushed
        setTimeout(async () => {
          if (activeProjectIdRef.current) {
            const saveRes = await saveCadLabModules(activeProjectIdRef.current, JSON.stringify(modulesRef.current))
            if ("error" in saveRes) {
              console.error("[CAD-LAB] Failed to save revised modules:", saveRes.error)
            } else {
              setLastSaved(new Date().toISOString())
            }
          }
        }, 100)
      }

      const revisedCount = Object.keys(revised).length

      // INTENT: Bump project-level design revision so images become stale
      const nextRevision = designRevisionRef.current + 1
      setDesignRevision(nextRevision)
      if (activeProjectIdRef.current) {
        saveCadLabDesignRevision(activeProjectIdRef.current, nextRevision, imagesGeneratedAtRevision)
          .catch(err => console.error("[CAD-LAB] Failed to save design revision:", err))
      }

      // INTENT: If user previously skipped reviews but then applies revisions,
      // reset the skip flag so the flow re-evaluates properly (reviews are now done, not skipped)
      setReviewSkipped(false)
      if (activeProjectIdRef.current) {
        saveCadLabReviewSkipped(activeProjectIdRef.current, false).catch(console.error)
      }

      toast.success(`${revisedCount} module${revisedCount !== 1 ? "s" : ""} revised — regenerating drawings...`)
      // INTENT: Auto-chain drawing regeneration after revisions.
      // 200ms delay lets setModules flush so modulesRef.current has revised data.
      // Uses ref to avoid forward-reference TDZ issue (function defined later in file).
      setTimeout(() => regenDrawingsRef.current?.(), 200)
    } catch (err) {
      console.error("[CAD-LAB] Review revision failed:", err)
      toast.error("Revision failed — please try again")
    } finally {
      setIsApplyingReviewRevisions(false)
    }
  }, [subject, imagesGeneratedAtRevision])

  // ── Product overview (editable executive summary) ──
  const [productOverview, setProductOverview] = useState("")

  // INTENT: Direct re-estimation callable from Source page refresh — bypasses the effect
  // system to avoid cascading re-renders that trigger the Specify redirect gate.
  const reEstimateCosts = useCallback(() => {
    const pid = activeProjectIdRef.current
    if (!pid || modules.length === 0) { console.warn("[CAD-LAB] reEstimateCosts: no project or modules"); return }
    if (isEstimatingCosts) { console.warn("[CAD-LAB] reEstimateCosts: already running"); return }
    aiCostFingerprintRef.current = ""
    setIsEstimatingCosts(true)
    setCostEstimationError(null)

    const uniqueProcesses = [...new Set(
      modules.map((m) => diagnosticAnswers[m.id]?.mfg_process).filter(Boolean) as string[]
    )]
    Promise.all(uniqueProcesses.map(async (proc) => {
      const insights = await getTechniqueInsightsByProcess(proc)
      return [proc, insights] as const
    }))
      .then((entries) => {
        const techniqueInsights: Record<string, import("@/actions/manufacturing-techniques").ProcessInsights> = {}
        for (const [proc, ins] of entries) {
          if (ins) techniqueInsights[proc] = ins
        }
        return estimateModuleCostsAi(
          modules, diagnosticAnswers, editableReport.slice(0, 2000),
          productOverview || undefined,
          Object.keys(techniqueInsights).length > 0 ? techniqueInsights : undefined,
        )
      })
      .then((res) => {
        if (res.success) {
          setAiCostEstimates(res.estimates)
          setCostEstimationError(null)
          if (pid) saveCadLabAiCostEstimates(pid, { ...res.estimates, _promptVersion: COST_PROMPT_VERSION } as unknown as Record<string, AiCostEstimate>).catch(console.error)
          // Update fingerprint so auto-trigger doesn't re-fire
          aiCostFingerprintRef.current = `v${COST_PROMPT_VERSION}:` + modules.map((m) => {
            const a = diagnosticAnswers[m.id] || {}
            return `${m.id}:${m.purpose?.slice(0, 50)}|${m.description?.slice(0, 50)}|${m.keyParts?.length}|${a.mfg_process}|${a.material}|${a.tolerance}|${a.finish}|${a.environment}|${a.batch_size}`
          }).join(";")
        } else {
          console.warn("[CAD-LAB] AI cost re-estimation failed:", res.error)
          setCostEstimationError(res.error)
        }
      })
      .catch((err) => {
        console.error("[CAD-LAB] AI cost re-estimation exception:", err)
        setCostEstimationError(err instanceof Error ? err.message : "Unknown error")
      })
      .finally(() => setIsEstimatingCosts(false))
  }, [modules, diagnosticAnswers, isEstimatingCosts, editableReport, productOverview])

  // ── Part classification override handlers ──
  const setPartCategoryOverride = useCallback((partKey: string, override: PartCategoryOverride) => {
    setPartCategoryOverrides((prev) => {
      const next = { ...prev, [partKey]: override }
      const pid = activeProjectIdRef.current
      if (pid) saveCadLabPartCategoryOverrides(pid, next).catch(console.error)
      return next
    })
  }, [])

  const clearPartCategoryOverride = useCallback((partKey: string) => {
    setPartCategoryOverrides((prev) => {
      const next = { ...prev }
      delete next[partKey]
      const pid = activeProjectIdRef.current
      if (pid) saveCadLabPartCategoryOverrides(pid, next).catch(console.error)
      return next
    })
  }, [])

  // ── AI cost estimation auto-trigger ──
  // INTENT: Only estimate costs after reviews are done — costings tab requires it.
  // The fingerprint includes module content, so post-revision changes auto-trigger re-estimation.
  useEffect(() => {
    if (!activeProjectIdRef.current || modules.length === 0 || isEstimatingCosts) return
    const allComplete = modules.every((mod) => {
      const answers = diagnosticAnswers[mod.id]
      if (!answers) return false
      return ["mfg_process", "material", "tolerance", "finish", "environment", "batch_size"]
        .every((k) => answers[k] && answers[k].trim().length > 0)
    })
    if (!allComplete) return
    // INTENT: Include module content (purpose, description, keyParts) in fingerprint
    // so that when handleApplyReviewRevisions rewrites modules, the fingerprint changes
    // and AI cost estimation re-fires automatically.
    const fp = `v${COST_PROMPT_VERSION}:` + modules.map((m) => {
      const a = diagnosticAnswers[m.id] || {}
      return `${m.id}:${m.purpose?.slice(0, 50)}|${m.description?.slice(0, 50)}|${m.keyParts?.length}|${a.mfg_process}|${a.material}|${a.tolerance}|${a.finish}|${a.environment}|${a.batch_size}`
    }).join(";")
    if (fp === aiCostFingerprintRef.current) return
    aiCostFingerprintRef.current = fp
    const pid = activeProjectIdRef.current
    setIsEstimatingCosts(true)
    setCostEstimationError(null)

    // INTENT: Fetch technique insights per unique process to ground cost estimates.
    // Runs in parallel per process, then passes merged map to Haiku.
    const uniqueProcesses = [...new Set(
      modules.map((m) => diagnosticAnswers[m.id]?.mfg_process).filter(Boolean) as string[]
    )]
    const insightsPromises = uniqueProcesses.map(async (proc) => {
      const insights = await getTechniqueInsightsByProcess(proc)
      return [proc, insights] as const
    })

    Promise.all(insightsPromises)
      .then((entries) => {
        const techniqueInsights: Record<string, import("@/actions/manufacturing-techniques").ProcessInsights> = {}
        for (const [proc, ins] of entries) {
          if (ins) techniqueInsights[proc] = ins
        }
        return estimateModuleCostsAi(
          modules, diagnosticAnswers, editableReport.slice(0, 2000),
          productOverview || undefined,
          Object.keys(techniqueInsights).length > 0 ? techniqueInsights : undefined,
        )
      })
      .then((res) => {
        if (res.success) {
          setAiCostEstimates(res.estimates)
          setCostEstimationError(null)
          if (pid) saveCadLabAiCostEstimates(pid, { ...res.estimates, _promptVersion: COST_PROMPT_VERSION } as unknown as Record<string, AiCostEstimate>).catch(console.error)
        } else {
          console.warn("[CAD-LAB] AI cost estimation failed:", res.error)
          setCostEstimationError(res.error)
        }
      })
      .catch((err) => {
        console.error("[CAD-LAB] AI cost estimation exception:", err)
        setCostEstimationError(err instanceof Error ? err.message : "Unknown error")
      })
      .finally(() => setIsEstimatingCosts(false))
  }, [modules, diagnosticAnswers, isEstimatingCosts, editableReport, productOverview])

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

  // INTENT: Ref-mirror of isGeneratingImages so post-await re-entrancy checks
  // (e.g. handleRetryIllustration chaining module regen) see the current value.
  const isGeneratingImagesRef = useRef(false)
  useEffect(() => { isGeneratingImagesRef.current = isGeneratingImages }, [isGeneratingImages])

  // INTENT: Synchronous guard against concurrent hero illustration retries.
  // Mirrors the existing isGeneratingImagesRef pattern — setState doesn't
  // flush synchronously, so React batching allows a double-click through the
  // gap. Set at entry, cleared when the retry settles (success, failure, or
  // unexpected error).
  const systemIllustrationStatusRef = useRef<"idle" | "generating" | "complete" | "failed">("idle")
  useEffect(() => { systemIllustrationStatusRef.current = systemIllustrationStatus }, [systemIllustrationStatus])

  // INTENT: Synchronous guard against concurrent "Regenerate illustrations"
  // clicks on the Specify stale-drawings card. See handleRegenerateDrawingsAfterRevision.
  const isRegeneratingImagesRef = useRef(false)
  useEffect(() => { isRegeneratingImagesRef.current = isRegeneratingImages }, [isRegeneratingImages])

  // INTENT: Prevents auto-restore from firing twice in React StrictMode.
  const isRestoringRef = useRef(false)

  // INTENT: Tracks whether research JUST completed in this session (vs loaded from a saved project).
  // Only set to true at the end of handleResearch — never during handleLoadProject.
  const freshResearchRef = useRef(false)

  // SECURITY: Prevents concurrent research calls from causing duplicate uploads + state corruption.
  // React's setIsResearching(true) doesn't flush synchronously — a second call can slip through
  // between setState and the next render. This ref is synchronous and blocks immediately.
  const researchInFlightRef = useRef(false)

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

  // ── Re-expand a single module (reload sparse data without full re-decomposition) ──
  const handleReExpandModule = useCallback(async (moduleId: string) => {
    const currentModules = modulesRef.current
    const target = currentModules.find((m) => m.id === moduleId)
    if (!target) return

    // INTENT: Reconstruct SkeletonModule[] from current modules — SkeletonModule is a strict subset
    const skeletons = currentModules.map((m) => ({
      id: m.id,
      name: m.name,
      purpose: m.purpose,
      inputs: m.inputs,
      outputs: m.outputs,
    }))

    setReExpandingModuleIds((prev) => new Set(prev).add(moduleId))

    try {
      const expRes = await expandModuleDetail(
        skeletons,
        moduleId,
        subject,
        editableReport,
        modelId,
        detectedDomain ?? undefined,
        visualStyle?.consistencyBrief,
        documentContext || undefined,
      )

      if (expRes.success && expRes.expansion) {
        // INTENT: Quality gate — if the expansion returns no meaningful data,
        // treat it as a failure. Prevents misleading "success" toast when the AI
        // returned an empty/garbage response.
        const exp = expRes.expansion
        const hasSubstance = (exp.description?.length ?? 0) > 10 || exp.keyParts.length > 0 || exp.failureModes.length > 0
        if (!hasSubstance) {
          console.warn(`[CAD-LAB] Re-expansion returned empty data for ${target.name}`)
          toast.error(`Re-expansion returned no data for ${target.name} — try again in a moment`)
          return
        }

        setModules((prev) => prev.map((m) =>
          m.id === moduleId
            ? {
                ...m,
                description: exp.description,
                keyParts: exp.keyParts,
                failureModes: exp.failureModes,
                unknowns: exp.unknowns,
                whyItMatters: exp.whyItMatters,
                leadWeeks: exp.leadWeeks,
                ...(exp.estimatedMassKg ? { estimatedMassKg: exp.estimatedMassKg } : {}),
              }
            : m
        ))
        debouncedSaveModules()
        toast.success(`${target.name} specifications loaded`)
      } else {
        console.error(`[CAD-LAB] Re-expansion failed for ${target.name}:`, expRes.error)
        toast.error(`Failed to re-expand ${target.name} — ${expRes.error ?? "try again"}`)
      }
    } catch (err) {
      console.error(`[CAD-LAB] Re-expansion error for ${target.name}:`, err)
      toast.error(`Failed to re-expand ${target.name}`)
    } finally {
      setReExpandingModuleIds((prev) => {
        const next = new Set(prev)
        next.delete(moduleId)
        return next
      })
    }
  }, [subject, editableReport, modelId, detectedDomain, visualStyle?.consistencyBrief, debouncedSaveModules, documentContext])

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

  // ── Decompose into modules (progressive: skeleton → expand → images) ──
  const handleDecompose = useCallback(async () => {
    if (!editableReport.trim()) return
    setIsDecomposing(true)
    setDecompositionError(null)
    setProgressLines([])

    addProgressLine("This work normally takes 1\u20132 weeks of systems engineering \u2014 it\u2019ll be ready in about 5\u201310 minutes")

    // ── Phase 1: Preparation (domain detection, ~instant) ──
    addProgressLine("Analysing research report to detect engineering domain...")

    let domainHint: CadLabDomain | undefined
    try {
      const prep = await prepareDecomposition(subject, editableReport)
      domainHint = prep.domain
      setDetectedDomain(prep.domain)
      addProgressLine(`Engineering domain: ${prep.domainLabel}`)
    } catch {
      addProgressLine("Domain detection skipped — proceeding with auto-detect")
    }

    addProgressLine(`Research report: ${Math.round(editableReport.length / 1000)}K characters`)
    addProgressLine("Identifying physical sub-assemblies (skeleton pass)...")

    const apiStart = Date.now()

    try {
      // ── Phase 1: Skeleton decomposition + product identity (parallel, ~60s) ──
      addProgressLine("Establishing product design identity...")
      const [skeletonRes, identityRes] = await Promise.all([
        skeletonDecompose(subject, editableReport, modelId, domainHint, documentContext || undefined),
        generateProductIdentityAction(subject, editableReport),
      ])
      const skeletonElapsed = ((Date.now() - apiStart) / 1000).toFixed(1)

      // Extract product identity for guided expansion (graceful degradation if it failed)
      const productIdentity = "visualStyle" in identityRes ? identityRes.visualStyle : undefined
      const consistencyBrief = productIdentity?.consistencyBrief
      if (productIdentity) {
        addProgressLine(`Design identity established: ${productIdentity.designLanguage ?? "unknown"}`)
      } else {
        console.warn("[CAD-LAB] Product identity failed — proceeding without consistency brief")
        addProgressLine("Design identity unavailable — expanding without constraints...")
      }

      // FALLBACK: If skeleton fails, fall back to the existing full decomposition
      if (!skeletonRes.success || skeletonRes.modules.length === 0) {
        addProgressLine(`Skeleton pass failed (${skeletonRes.error ?? "no modules"}) — falling back to full decomposition...`)

        // INTENT: Padding timers for the longer full-decomposition fallback
        const paddingTimers: ReturnType<typeof setTimeout>[] = []
        paddingTimers.push(setTimeout(() => addProgressLine("Cross-referencing product architecture against manufacturing databases"), 5000))
        paddingTimers.push(setTimeout(() => addProgressLine("Evaluating manufacturing processes and materials"), 16000))
        paddingTimers.push(setTimeout(() => addProgressLine("Mapping interfaces between sub-assemblies"), 28000))
        paddingTimers.push(setTimeout(() => addProgressLine("Finalising bill of materials structure"), 50000))
        paddingTimers.push(setTimeout(() => addProgressLine("Complex product — still processing"), 75000))

        const CLIENT_TIMEOUT_MS = 280_000
        const clientTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Decomposition timed out — please try again")), CLIENT_TIMEOUT_MS),
        )

        const fallbackRes = await Promise.race([
          decomposeIntoModules(subject, editableReport, modelId, domainHint),
          clientTimeout,
        ])
        paddingTimers.forEach(clearTimeout)

        const fallbackElapsed = ((Date.now() - apiStart) / 1000).toFixed(1)

        if (!fallbackRes.success || fallbackRes.modules.length === 0) {
          const errorMsg = fallbackRes.error ?? "Decomposition returned no modules"
          setProgressLines([`Response received in ${fallbackElapsed}s`, `Decomposition failed: ${errorMsg}`])
          setDecompositionError(errorMsg)
          toast.error(errorMsg)
          return
        }

        // Fallback succeeded — use full modules directly (same as old path)
        setModules(fallbackRes.modules)
        if (fallbackRes.modelUsed) setDecompositionModelUsed(fallbackRes.modelUsed)
        setRevealedModuleIds(new Set(fallbackRes.modules.map(m => m.id)))
        setMilestone("breakdown")

        if (fallbackRes.connections && fallbackRes.connections.length > 0) {
          setDecompositionConnections(fallbackRes.connections)
          if (activeProjectId) saveCadLabDecompositionConnections(activeProjectId, fallbackRes.connections).catch(() => {})
        }

        if (!productOverviewRef.current) {
          const summary = extractExecutiveSummary(editableReport)
          if (summary) {
            setProductOverview(summary)
            if (activeProjectId) saveCadLabProductOverview(activeProjectId, summary).catch(() => {})
          }
        }

        const totalParts = fallbackRes.modules.reduce((s, m) => s + m.keyParts.length, 0)
        const criticalPath = Math.max(...fallbackRes.modules.map((m) => m.leadWeeks))
        const criticalModule = fallbackRes.modules.find(m => m.leadWeeks === criticalPath)

        setProgressLines([
          `Identified ${fallbackRes.modules.length} sub-assemblies in ${fallbackElapsed}s (fallback path)`,
          `${totalParts} components mapped across all sub-assemblies`,
          `Critical path: ${criticalPath} weeks${criticalModule ? ` (${criticalModule.name})` : ""}`,
          "", "Sub-assemblies identified:",
          ...fallbackRes.modules.map((m, i) => `  ${i + 1}. ${m.name}`),
          "", "Now generating illustrations for each sub-assembly...",
        ])

        if (activeProjectId) {
          const saveRes = await saveCadLabModules(activeProjectId, JSON.stringify(fallbackRes.modules))
          if ("error" in saveRes) {
            toast.error("Modules mapped but failed to save")
          } else {
            setLastSaved(new Date().toISOString())
          }
          refreshProjects()
        }

        // Fire background tasks with full fallback modules
        const fallbackModules = fallbackRes.modules
        prefillDiagnostics(fallbackModules, editableReport, modelId)
          .then((prefillRes) => {
            if (!activeProjectIdRef.current) return
            if (prefillRes.success && Object.keys(prefillRes.answers).length > 0) {
              setDiagnosticAnswers((prev) => {
                const merged = { ...prefillRes.answers }
                for (const [mid, existing] of Object.entries(prev)) merged[mid] = { ...(merged[mid] || {}), ...existing }
                return merged
              })
              setAiPrefilled(true)
              if (prefillRes.enrichment && Object.keys(prefillRes.enrichment).length > 0) {
                setDiagnosticEnrichment(prefillRes.enrichment)
                if (activeProjectIdRef.current) saveCadLabDiagnosticEnrichment(activeProjectIdRef.current, prefillRes.enrichment).catch(() => {})
              }
            }
          }).catch(() => {})

        if (fallbackModules.length >= 2) {
          setIsExtractingContracts(true)
          extractInterfaceContracts(fallbackModules, editableReport, modelId)
            .then((contractRes) => {
              if (!activeProjectIdRef.current) return
              setInterfaceContracts(contractRes.contracts)
              setUnmatchedPorts({ outputs: contractRes.unmatchedOutputs, inputs: contractRes.unmatchedInputs })
              setIsExtractingContracts(false)
              if (activeProjectId) saveCadLabInterfaceContracts(activeProjectId, contractRes).catch(() => {})
            })
            .catch(() => { if (activeProjectIdRef.current) setIsExtractingContracts(false) })
        }

        // Images pipeline (same as before)
        const fallbackImagesPipeline = async () => {
          if (activeProjectId) { setSystemIllustrationStatus("generating"); setSystemIllustrationError(null) }
          // Collect user reference image URLs for AI pipeline
          const refImageUrls = referenceImagesRef.current.filter(i => i.uploaded && i.storageUrl).map(i => i.storageUrl!)
          let visualStyle: VisualStyleSpec | undefined
          try {
            const styleRes = await generateVisualStyleAction(subject, fallbackModules.map(m => ({ name: m.name, purpose: m.purpose })), extractExecutiveSummary(editableReport)?.slice(0, 800) ?? editableReport.slice(0, 800), refImageUrls.length > 0 ? refImageUrls : undefined, documentContext || undefined)
            if (!activeProjectIdRef.current) return
            if ("visualStyle" in styleRes) { visualStyle = styleRes.visualStyle; setVisualStyle(visualStyle); if (activeProjectId) saveCadLabVisualStyle(activeProjectId, visualStyle).catch(() => {}) }
          } catch { /* Non-critical */ }

          let referenceBase64: string | undefined
          let fallbackHeroUrl: string | undefined
          const moduleCrops = new Map<string, string>()
          if (activeProjectId) {
            try {
              const illRes = await generateCadLabSystemIllustrationAction(activeProjectId, subject, fallbackModules.map(m => m.name), fallbackModules.map(m => m.purpose), visualStyle, extractExecutiveSummary(editableReport)?.slice(0, 600), undefined, refImageUrls.length > 0 ? refImageUrls : undefined)
              if (!activeProjectIdRef.current) return
              if ("url" in illRes) {
                fallbackHeroUrl = illRes.url
                setSystemIllustrationUrl(illRes.url); setSystemIllustrationStatus("complete")
                saveCadLabSystemIllustration(activeProjectId!, illRes.url).catch(() => {})
                try { const cropRes = await fetchAndCropReferenceAction(illRes.url); if ("base64" in cropRes) referenceBase64 = cropRes.base64 } catch { /* Non-critical */ }
                if (referenceBase64) {
                  try {
                    const bbRes = await analyseHeroForModulesAction(referenceBase64, fallbackModules.map(m => m.name))
                    if ("boxes" in bbRes && Object.keys(bbRes.boxes).length > 0) {
                      const cropResults = await Promise.all(fallbackModules.map(async (mod) => {
                        const box = bbRes.boxes[mod.name]; if (!box) return { id: mod.id, crop: undefined }
                        try { const cr = await cropModuleRegionAction(referenceBase64!, box); if ("base64" in cr) return { id: mod.id, crop: cr.base64 } } catch { /* skip */ }
                        return { id: mod.id, crop: undefined }
                      }))
                      for (const cr of cropResults) { if (cr.crop) moduleCrops.set(cr.id, cr.crop) }
                    }
                  } catch { /* Non-critical */ }
                }
              } else { setSystemIllustrationStatus("failed"); setSystemIllustrationError("error" in illRes ? (illRes as { error: string }).error : "Generation failed") }
            } catch (e) { if (!activeProjectIdRef.current) return; setSystemIllustrationStatus("failed"); setSystemIllustrationError(e instanceof Error ? e.message : "Generation failed") }
          }
          // INTENT: Guard with ref (not state) to prevent stale closure from silently skipping
          // image generation. Previously used `activeProjectId ?? undefined` which captured
          // stale null from the state value, causing handleGenerateModuleImages to silently return.
          const currentProjectId = activeProjectIdRef.current
          if (currentProjectId) {
            // DECISION: Strip heroImagePrompt — only needed for system illustration, not per-module images
            const perModuleStyle = visualStyle ? { ...visualStyle, heroImagePrompt: undefined } : undefined
            handleGenerateModuleImages(fallbackModules, currentProjectId, perModuleStyle, referenceBase64, moduleCrops, fallbackHeroUrl)
              .catch((e) => console.error("[CAD-LAB] Fallback image pipeline failed:", e))
          } else {
            console.warn("[CAD-LAB] Skipping image generation — no active project ID")
          }
        }
        fallbackImagesPipeline().catch((e) => console.error("[CAD-LAB] Fallback images pipeline error:", e))

        if (activeProjectId) {
          setIsCheckpointing(true)
          requestDecompositionCheckpoints({ projectId: activeProjectId, projectSubject: subject, modules: fallbackModules, researchReport: editableReport })
            .then((cr) => { if (activeProjectIdRef.current && "checkpoints" in cr) setCheckpoints(cr.checkpoints) })
            .catch(() => {}).finally(() => { if (activeProjectIdRef.current) setIsCheckpointing(false) })
        }

        return // Fallback path complete
      }

      // ── Skeleton succeeded — progressive flow ──
      setDecompositionModelUsed("Opus")

      // Show skeleton module names immediately
      setProgressLines([
        `Identified ${skeletonRes.modules.length} sub-assemblies in ${skeletonElapsed}s`,
        "",
        "Sub-assemblies identified:",
        ...skeletonRes.modules.map((m, i) => `  ${i + 1}. ${m.name}`),
        "",
        `Expanding ${skeletonRes.modules[0].name} (1/${skeletonRes.modules.length})...`,
      ])

      // Convert skeleton modules to CadLabModule shells (skeleton data only, empty details)
      const skeletonAsCadModules: CadLabModule[] = skeletonRes.modules.map((sm) => ({
        id: sm.id,
        name: sm.name,
        purpose: sm.purpose,
        inputs: sm.inputs,
        outputs: sm.outputs,
        keyParts: [],
        leadWeeks: 0,
        description: "",
        whyItMatters: "",
        failureModes: [],
        unknowns: [],
        status: "pending" as const,
        revisionNumber: 1,
        ...(sm.mirrorOf ? { mirrorOf: sm.mirrorOf } : {}),
      }))

      setModules(skeletonAsCadModules)
      setRevealedModuleIds(new Set(skeletonAsCadModules.map(m => m.id)))
      setMilestone("breakdown")

      // Persist connections from skeleton
      if (skeletonRes.connections && skeletonRes.connections.length > 0) {
        setDecompositionConnections(skeletonRes.connections)
        if (activeProjectIdRef.current) saveCadLabDecompositionConnections(activeProjectIdRef.current, skeletonRes.connections).catch(() => {})
      }

      // Seed product overview
      if (!productOverviewRef.current) {
        const summary = extractExecutiveSummary(editableReport)
        if (summary) {
          setProductOverview(summary)
          if (activeProjectIdRef.current) saveCadLabProductOverview(activeProjectIdRef.current, summary).catch(() => {})
        }
      }

      // Save skeleton modules immediately
      if (activeProjectIdRef.current) {
        const saveRes = await saveCadLabModules(activeProjectIdRef.current, JSON.stringify(skeletonAsCadModules))
        if ("error" in saveRes) {
          toast.error("Modules mapped but failed to save")
        } else {
          setLastSaved(new Date().toISOString())
        }
        refreshProjects()
      }

      // ── Phase 2: Concurrent tracks (text expansion + background tasks) ──

      // Track C: Background tasks (fire-and-forget)
      // INTENT: Checkpoints can start with skeleton data — no need to wait for expansions.
      if (activeProjectId) {
        setIsCheckpointing(true)
        requestDecompositionCheckpoints({
          projectId: activeProjectId,
          projectSubject: subject,
          modules: skeletonAsCadModules,
          researchReport: editableReport,
        })
          .then((cr) => { if (activeProjectIdRef.current && "checkpoints" in cr) setCheckpoints(cr.checkpoints) })
          .catch(() => {})
          .finally(() => { if (activeProjectIdRef.current) setIsCheckpointing(false) })
      }

      // Track A: Sequential module expansion (TEXT ONLY — no images yet)
      const expandedModules: CadLabModule[] = [...skeletonAsCadModules]

      for (let i = 0; i < skeletonRes.modules.length; i++) {
        const skeleton = skeletonRes.modules[i]
        if (!activeProjectIdRef.current) break // Stale closure guard

        // INTENT: Mirror modules copy their primary's expansion — same keyParts, description,
        // failureModes. Saves an LLM call and ensures content consistency.
        if (skeleton.mirrorOf) {
          const primaryIdx = skeletonRes.modules.findIndex(m => m.id === skeleton.mirrorOf)
          if (primaryIdx !== -1 && expandedModules[primaryIdx].keyParts.length > 0) {
            const primary = expandedModules[primaryIdx]
            expandedModules[i] = {
              ...expandedModules[i],
              keyParts: [...primary.keyParts],
              leadWeeks: primary.leadWeeks,
              estimatedMassKg: primary.estimatedMassKg,
              description: primary.description,
              whyItMatters: primary.whyItMatters,
              failureModes: [...primary.failureModes],
              unknowns: [...primary.unknowns],
            }
            addProgressLine(`  ${skeleton.name} mirrored from ${skeletonRes.modules[primaryIdx].name}`)
            if (activeProjectIdRef.current) {
              const exp = expandedModules[i]
              setModules((prev) => prev.map((m) =>
                m.id === exp.id
                  ? { ...m, keyParts: exp.keyParts, leadWeeks: exp.leadWeeks, description: exp.description, whyItMatters: exp.whyItMatters, failureModes: exp.failureModes, unknowns: exp.unknowns, ...(exp.estimatedMassKg ? { estimatedMassKg: exp.estimatedMassKg } : {}) }
                  : m
              ))
            }
            continue
          }
          // Fallback: primary not yet expanded (ordering edge case) — expand normally
        }

        addProgressLine(`Expanding ${skeleton.name} (${i + 1}/${skeletonRes.modules.length})...`)

        const expRes = await expandModuleDetail(
          skeletonRes.modules,
          skeleton.id,
          subject,
          editableReport,
          modelId,
          domainHint,
          consistencyBrief,
          documentContext || undefined,
        )

        if (expRes.success && expRes.expansion) {
          expandedModules[i] = {
            ...expandedModules[i],
            keyParts: expRes.expansion.keyParts,
            leadWeeks: expRes.expansion.leadWeeks,
            description: expRes.expansion.description,
            whyItMatters: expRes.expansion.whyItMatters,
            failureModes: expRes.expansion.failureModes,
            unknowns: expRes.expansion.unknowns,
            ...(expRes.expansion.estimatedMassKg ? { estimatedMassKg: expRes.expansion.estimatedMassKg } : {}),
          }

          addProgressLine(`  ${skeleton.name} expanded — ${expRes.expansion.keyParts.length} components`)

          if (activeProjectIdRef.current) {
            const exp = expandedModules[i]
            setModules((prev) => prev.map((m) =>
              m.id === exp.id
                ? { ...m, keyParts: exp.keyParts, leadWeeks: exp.leadWeeks, description: exp.description, whyItMatters: exp.whyItMatters, failureModes: exp.failureModes, unknowns: exp.unknowns, ...(exp.estimatedMassKg ? { estimatedMassKg: exp.estimatedMassKg } : {}) }
                : m
            ))
          }
        } else {
          console.error(`[CAD-LAB] Expansion failed for ${skeleton.name}:`, expRes.error)
          addProgressLine(`  ${skeleton.name} expansion failed — skeleton data preserved`)
        }
      }

      addProgressLine("")
      addProgressLine(`All ${skeletonRes.modules.length} modules expanded`)

      // INTENT: Save expanded modules BEFORE reconciliation — prevents data loss if later steps fail
      if (activeProjectIdRef.current) {
        saveCadLabModules(activeProjectIdRef.current, JSON.stringify(expandedModules)).catch((err) =>
          console.error("[CAD-LAB] Post-expansion save failed:", err)
        )
      }

      // ── Phase 3: Sequential image pipeline (after ALL text expansions) ──

      // 3a: Cross-module reconciliation — reviews all expanded modules + product identity
      addProgressLine("Reconciling cross-module design consistency...")
      let style: VisualStyleSpec | undefined

      if (activeProjectIdRef.current) {
        try {
          const reconcileRes = await reconcileDesignAction(
            subject,
            expandedModules.map(m => ({
              id: m.id, name: m.name, purpose: m.purpose, description: m.description,
              keyParts: m.keyParts, inputs: m.inputs, outputs: m.outputs,
            })),
            skeletonRes.connections,
            extractExecutiveSummary(editableReport)?.slice(0, 2000) ?? editableReport.slice(0, 2000),
            productIdentity,
          )
          if (!activeProjectIdRef.current) { /* stale */ }
          else if ("visualStyle" in reconcileRes) {
            style = reconcileRes.visualStyle
            setVisualStyle(style)
            saveCadLabVisualStyle(activeProjectIdRef.current, style).catch(() => {})

            // Apply module patches (light-touch corrections) + per-module image prompts
            const patchCount = Object.keys(reconcileRes.modulePatch).length
            const promptCount = Object.keys(reconcileRes.perModuleImagePrompts).length
            if (patchCount > 0 || promptCount > 0) {
              setModules(prev => prev.map(m => {
                const patch = reconcileRes.modulePatch[m.id]
                const imagePrompt = reconcileRes.perModuleImagePrompts[m.id]
                if (!patch && !imagePrompt) return m
                return {
                  ...m,
                  ...(patch?.description && { description: patch.description }),
                  ...(imagePrompt && { moduleImagePrompt: imagePrompt }),
                }
              }))
              // Also update expandedModules local array so diagnostics use corrected data
              for (const mod of expandedModules) {
                const patch = reconcileRes.modulePatch[mod.id]
                if (patch?.description) mod.description = patch.description
                const imagePrompt = reconcileRes.perModuleImagePrompts[mod.id]
                if (imagePrompt) mod.moduleImagePrompt = imagePrompt
              }
            }

            // Save modules again after reconciliation patches + moduleImagePrompts
            if (activeProjectIdRef.current) {
              saveCadLabModules(activeProjectIdRef.current, JSON.stringify(expandedModules)).catch((err) =>
                console.error("[CAD-LAB] Post-reconciliation save failed:", err)
              )
            }

            addProgressLine(`Design reconciled${patchCount > 0 ? ` — ${patchCount} modules corrected` : ""} — generating system illustration...`)
          } else {
            console.warn("[CAD-LAB] Reconciliation failed, falling back to Sonnet visual style")
            addProgressLine("Reconciliation unavailable — falling back to quick visual style...")
          }
        } catch {
          console.warn("[CAD-LAB] Reconciliation threw, falling back to Sonnet visual style")
          addProgressLine("Reconciliation unavailable — falling back to quick visual style...")
        }

        // Fallback: use Sonnet visual style if reconciliation failed
        if (!style && activeProjectIdRef.current) {
          const refUrls = referenceImagesRef.current.filter(i => i.uploaded && i.storageUrl).map(i => i.storageUrl!)
          try {
            const styleRes = await generateVisualStyleAction(
              subject,
              skeletonRes.modules.map((m) => ({ name: m.name, purpose: m.purpose })),
              extractExecutiveSummary(editableReport)?.slice(0, 800) ?? editableReport.slice(0, 800),
              refUrls.length > 0 ? refUrls : undefined,
              documentContext || undefined,
            )
            if ("visualStyle" in styleRes) {
              style = styleRes.visualStyle
              setVisualStyle(style)
              saveCadLabVisualStyle(activeProjectIdRef.current!, style).catch(() => {})
              addProgressLine("Visual style generated — generating system illustration...")
            }
          } catch { /* Non-critical */ }
        }
      }

      // INTENT: Fire diagnostics after reconciliation (before images) so they use
      // corrected module data. Still fire-and-forget (non-blocking).
      const finalModulesForDiagnostics = expandedModules
      prefillDiagnostics(finalModulesForDiagnostics, editableReport, modelId)
        .then((prefillRes) => {
          if (!activeProjectIdRef.current) return
          if (prefillRes.success && Object.keys(prefillRes.answers).length > 0) {
            setDiagnosticAnswers((prev) => {
              const merged = { ...prefillRes.answers }
              for (const [mid, existing] of Object.entries(prev)) merged[mid] = { ...(merged[mid] || {}), ...existing }
              return merged
            })
            setAiPrefilled(true)
            if (prefillRes.enrichment && Object.keys(prefillRes.enrichment).length > 0) {
              setDiagnosticEnrichment(prefillRes.enrichment)
              if (activeProjectIdRef.current) saveCadLabDiagnosticEnrichment(activeProjectIdRef.current, prefillRes.enrichment).catch(() => {})
            }
          }
        }).catch(() => {})

      if (finalModulesForDiagnostics.length >= 2) {
        setIsExtractingContracts(true)
        extractInterfaceContracts(finalModulesForDiagnostics, editableReport, modelId)
          .then((contractRes) => {
            if (!activeProjectIdRef.current) return
            setInterfaceContracts(contractRes.contracts)
            setUnmatchedPorts({ outputs: contractRes.unmatchedOutputs, inputs: contractRes.unmatchedInputs })
            setIsExtractingContracts(false)
            if (activeProjectIdRef.current) saveCadLabInterfaceContracts(activeProjectIdRef.current, contractRes).catch(() => {})
          })
          .catch(() => { if (activeProjectIdRef.current) setIsExtractingContracts(false) })
      }

      // 3b: Hero image generation — uses Opus-crafted prompt when available
      let illustrationUrl: string | undefined
      const heroRefUrls = referenceImagesRef.current.filter(i => i.uploaded && i.storageUrl).map(i => i.storageUrl!)
      if (activeProjectIdRef.current) {
        setSystemIllustrationStatus("generating"); setSystemIllustrationError(null)
        try {
          const illRes = await generateCadLabSystemIllustrationAction(
            activeProjectIdRef.current, subject,
            expandedModules.map(m => m.name),
            expandedModules.map(m => m.purpose),
            style,
            extractExecutiveSummary(editableReport)?.slice(0, 600),
            style?.heroImagePrompt,
            heroRefUrls.length > 0 ? heroRefUrls : undefined,
          )
          if (!activeProjectIdRef.current) { /* stale */ }
          else if ("url" in illRes) {
            illustrationUrl = illRes.url
            setSystemIllustrationUrl(illRes.url); setSystemIllustrationStatus("complete")
            saveCadLabSystemIllustration(activeProjectIdRef.current!, illRes.url).catch(() => {})
            addProgressLine("System illustration complete — preparing module image references...")
          } else {
            setSystemIllustrationStatus("failed")
            setSystemIllustrationError("error" in illRes ? (illRes as { error: string }).error : "Generation failed")
            addProgressLine("System illustration failed — proceeding with module images...")
          }
        } catch (e) {
          if (activeProjectIdRef.current) {
            setSystemIllustrationStatus("failed")
            setSystemIllustrationError(e instanceof Error ? e.message : "Generation failed")
            addProgressLine("System illustration failed — proceeding with module images...")
          }
        }
      }

      // 3c: Reference prep — crop hero + bounding boxes + module crops
      let referenceBase64: string | undefined
      const moduleCrops = new Map<string, string>()

      if (illustrationUrl) {
        try {
          const cropRes = await fetchAndCropReferenceAction(illustrationUrl)
          if ("base64" in cropRes) referenceBase64 = cropRes.base64
        } catch { /* Non-critical — images generate without reference */ }

        if (referenceBase64) {
          try {
            const bbRes = await analyseHeroForModulesAction(
              referenceBase64,
              expandedModules.map(m => m.name),
            )
            if ("boxes" in bbRes && Object.keys(bbRes.boxes).length > 0) {
              const cropResults = await Promise.all(expandedModules.map(async (mod) => {
                const box = bbRes.boxes[mod.name]
                if (!box) return { id: mod.id, crop: undefined }
                try {
                  const cr = await cropModuleRegionAction(referenceBase64!, box)
                  if ("base64" in cr) return { id: mod.id, crop: cr.base64 }
                } catch { /* skip */ }
                return { id: mod.id, crop: undefined }
              }))
              for (const cr of cropResults) { if (cr.crop) moduleCrops.set(cr.id, cr.crop) }
            }
          } catch { /* Non-critical */ }
        }
      }

      // 3d + 3e: Per-module images via handleGenerateModuleImages
      // INTENT: handleGenerateModuleImages handles its own shared asset upload internally,
      // so we pass referenceBase64 and style directly — it will upload them once.
      // DECISION: Strip heroImagePrompt + perModuleImagePrompts — only needed for system illustration
      // and orchestration respectively, not per-module image calls. Reduces payload size.
      if (activeProjectIdRef.current) {
        addProgressLine("Generating module blueprint illustrations...")
        const perModuleStyle = style ? { ...style, heroImagePrompt: undefined, perModuleImagePrompts: undefined } : undefined
        await handleGenerateModuleImages(expandedModules, activeProjectIdRef.current, perModuleStyle, referenceBase64, moduleCrops, illustrationUrl)
      }

      // All expansions done — final save and summary
      const finalModules = expandedModules
      const totalParts = finalModules.reduce((s, m) => s + m.keyParts.length, 0)
      const criticalPath = Math.max(...finalModules.map(m => m.leadWeeks))
      const totalRisks = finalModules.reduce((s, m) => s + m.failureModes.length + m.unknowns.length, 0)
      const criticalModule = finalModules.find(m => m.leadWeeks === criticalPath)
      const totalElapsed = ((Date.now() - apiStart) / 1000).toFixed(1)

      addProgressLine("")
      addProgressLine(`All ${finalModules.length} modules expanded in ${totalElapsed}s`)
      addProgressLine(`${totalParts} components mapped across all sub-assemblies`)
      if (criticalPath > 0) addProgressLine(`Critical path: ${criticalPath} weeks${criticalModule ? ` (${criticalModule.name})` : ""}`)
      if (totalRisks > 0) addProgressLine(`${totalRisks} risk items flagged for engineering review`)

      // Final save — merge expansion data over the ref (which already holds imageUrl/imageStatus
      // written by handleGenerateModuleImages via setModules). Saving `finalModules` (the local
      // expandedModules JS array that the image pipeline never mutated) would race the pipeline's
      // own fire-and-forget save at line 2172 and, when it won, wipe out all image data — leaving
      // modules stuck at "pending" even though the PNGs sat complete in storage.
      if (activeProjectIdRef.current) {
        const merged = modulesRef.current.map((m) => {
          const exp = finalModules.find(e => e.id === m.id)
          if (!exp) return m
          return { ...m, keyParts: exp.keyParts, leadWeeks: exp.leadWeeks, description: exp.description, whyItMatters: exp.whyItMatters, failureModes: exp.failureModes, unknowns: exp.unknowns }
        })
        setModules(merged)
        modulesRef.current = merged // GOTCHA: useEffect ref sync runs after render; manually sync so the save below sees image fields
        const saveRes = await saveCadLabModules(activeProjectIdRef.current, JSON.stringify(merged))
        if ("error" in saveRes) {
          toast.error("Modules mapped but failed to save")
        } else {
          setLastSaved(new Date().toISOString())
        }
        refreshProjects()
      }

    } catch (err) {
      console.error("[CAD-LAB] Decomposition failed:", err)
      const catchMsg = err instanceof Error ? err.message : "Decomposition failed"
      setDecompositionError(catchMsg)
      setProgressLines([`Decomposition failed: ${catchMsg}`])
      toast.error(catchMsg)
    } finally {
      setIsDecomposing(false)
    }
  }, [editableReport, subject, modelId, activeProjectId, documentContext, refreshProjects, addProgressLine])

  // ── Generate Gemini blueprint images for modules (progressive reveal) ──
  const handleGenerateModuleImages = useCallback(async (modulesToProcess: CadLabModule[], explicitProjectId?: string, visualStyle?: VisualStyleSpec, referenceBase64?: string, moduleCrops?: Map<string, string>, heroUrl?: string) => {
    // SECURITY: Synchronous in-flight guard. Without this, double-clicking
    // any retry button fires concurrent pipelines that race on Supabase
    // upserts, duplicate AI cost, and last-write-wins the modules snapshot.
    if (isGeneratingImagesRef.current) {
      console.warn("[CAD-LAB] Image generation already in flight — ignoring duplicate call")
      return
    }
    const projectId = explicitProjectId ?? activeProjectId
    if (modulesToProcess.length === 0 || !projectId) {
      if (!projectId) console.warn("[CAD-LAB] handleGenerateModuleImages skipped — no project ID")
      return
    }
    isGeneratingImagesRef.current = true
    setIsGeneratingImages(true)
    setImageGenProgress({ completed: 0, total: modulesToProcess.length, failed: 0, phase: "generating" })

    // Register background op so progress survives navigation
    const bgOpId = startOp("Generating illustrations", "/the-forge/cad-lab")

    // Hoisted so the finally block can clean up leaked timers on unexpected throw
    const moduleTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

    // INTENT: Track image field updates per module as generation progresses.
    // Each setModules call inside generateOne also writes into this map, so the
    // final save can overlay known image data onto modulesRef.current. Without
    // this, the save reads modulesRef immediately after the last setModules —
    // React has not re-rendered yet, the useEffect ref sync has not fired, and
    // the last module's imageUrl/imageStatus is lost to the DB write. This
    // matches Rule 10 in cad-lab-react-patterns.md (sync refs after setState
    // in async functions), but uses an explicit overlay instead of touching
    // the ref directly so we never race a concurrent setModules writer.
    const imageUpdates = new Map<string, Partial<CadLabModule>>()

    try {
    // Immediately set all modules to "generating" image status in local state
    setModules((prev) =>
      prev.map((m) => {
        const isTarget = modulesToProcess.some((t) => t.id === m.id)
        return isTarget ? { ...m, imageStatus: "generating" as const } : m
      }),
    )

    // INTENT: Upload shared assets (reference PNG ~500-800KB, visual style ~1-3KB) to
    // Supabase Storage ONCE so each module call fetches them server-side (~10ms) instead
    // of sending redundant base64 through React Flight per call.
    // DECISION: Retry once on failure. If still fails, skip inline referenceBase64 (~800KB)
    // to avoid React Flight "Maximum array nesting exceeded" serialization error.
    let referenceUrl: string | undefined
    let visualStyleUrl: string | undefined
    if (referenceBase64 || visualStyle) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const uploadRes = await uploadSharedImageAssetsAction(projectId, referenceBase64, visualStyle)
          if ("referenceUrl" in uploadRes) {
            referenceUrl = uploadRes.referenceUrl
            visualStyleUrl = uploadRes.visualStyleUrl
            break
          }
        } catch (e) {
          if (attempt === 0) { await new Promise(r => setTimeout(r, 1000)); continue }
          console.warn("[CAD-LAB] Failed to upload shared image assets after retry:", e)
        }
      }
    }

    // Per-module safety timeout (30s) — reveal module even if image hasn't resolved
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
    // If upload failed, fall back to heroUrl (the system illustration URL already in Supabase
    // Storage) — the server action fetches it directly (~10ms same-region). This preserves
    // geometric consistency without sending ~800KB base64 through React Flight.
    // Never fall back to inline referenceBase64 — it triggers "Maximum array nesting exceeded".
    if (!referenceUrl && referenceBase64) {
      console.warn(`[CAD-LAB] Shared asset upload failed — falling back to hero URL${heroUrl ? ` (${heroUrl.slice(0, 60)}...)` : " (none available)"}`)
    }
    const effectiveVisualStyle = visualStyleUrl ?? visualStyle
    const effectiveReference = referenceUrl ?? heroUrl ?? undefined

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
          const update: Partial<CadLabModule> = {
            imageUrl: res.imageUrl,
            imageStatus: res.imageStatus,
            imageError: res.imageError,
            imageModelUsed: res.imageModelUsed,
          }
          imageUpdates.set(mod.id, update)
          setModules((prev) => prev.map((m) => (m.id === mod.id ? { ...m, ...update } : m)))
          if (res.imageStatus === "complete") {
            completedCount++
            setImageGenProgress(p => p ? { ...p, completed: p.completed + 1 } : p)
          } else if (res.imageStatus === "failed") {
            setImageGenProgress(p => p ? { ...p, completed: p.completed + 1, failed: p.failed + 1 } : p)
            // INTENT: Show actual error on first failure so user can diagnose
            if (res.imageError && completedCount === 0) {
              toast.error(`Image gen error: ${res.imageError.slice(0, 120)}`)
            }
          }
        } else if ("error" in res) {
          const update: Partial<CadLabModule> = { imageStatus: "failed" as const, imageError: res.error }
          imageUpdates.set(mod.id, update)
          setModules((prev) => prev.map((m) => (m.id === mod.id ? { ...m, ...update } : m)))
          setImageGenProgress(p => p ? { ...p, completed: p.completed + 1, failed: p.failed + 1 } : p)
          // INTENT: Show actual error on first failure so user can diagnose
          if (res.error && completedCount === 0) {
            toast.error(`Image gen error: ${res.error.slice(0, 120)}`)
          }
        }
        revealModule(mod.id)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Image generation failed"
        console.error(`[CAD-LAB] Image generation failed for ${mod.name}:`, err)
        const update: Partial<CadLabModule> = { imageStatus: "failed" as const, imageError: errorMsg }
        imageUpdates.set(mod.id, update)
        setModules((prev) => prev.map((m) => (m.id === mod.id ? { ...m, ...update } : m)))
        setImageGenProgress(p => p ? { ...p, completed: p.completed + 1, failed: p.failed + 1 } : p)
        revealModule(mod.id)
      }
    }

    // INTENT: Detect mirror pairs so we can horizontally flip the primary
    // module's image to produce the mirror module's asset — guarantees a true
    // left/right mirror (not an identical copy) and saves an API call.
    // Detection: (1) explicit mirrorOf field, (2) Left/Right name pattern
    // fallback. We look at BOTH modulesToProcess and the full modules list so
    // that retrying just the Right module alone still finds its Left twin.
    let modulesSnapshot: CadLabModule[] = []
    setModules((current) => { modulesSnapshot = current; return current })
    const fullModuleIndex = new Map<string, CadLabModule>(modulesSnapshot.map(m => [m.id, m]))
    for (const mod of modulesToProcess) {
      if (!fullModuleIndex.has(mod.id)) fullModuleIndex.set(mod.id, mod)
    }

    const mirrorMap = new Map<string, string>() // mirrorId → primaryId
    for (const mod of modulesToProcess) {
      if (mod.mirrorOf && fullModuleIndex.has(mod.mirrorOf)) {
        mirrorMap.set(mod.id, mod.mirrorOf)
      }
    }
    // Fallback: detect implicit mirror pairs via Left/Right naming pattern.
    // We scan the FULL module list for twins, not just modulesToProcess, so a
    // lone retry of a Right module can still locate its Left primary.
    if (mirrorMap.size === 0) {
      const byBaseName = new Map<string, CadLabModule[]>()
      for (const mod of fullModuleIndex.values()) {
        const match = mod.name.match(/^(Left|Right)\s+(.+)$/i)
        if (match) {
          const baseName = match[2]
          const group = byBaseName.get(baseName) ?? []
          group.push(mod)
          byBaseName.set(baseName, group)
        }
      }
      const processingIds = new Set(modulesToProcess.map(m => m.id))
      for (const [, group] of byBaseName) {
        if (group.length === 2) {
          const left = group.find(m => m.name.match(/^Left\s/i))
          const right = group.find(m => m.name.match(/^Right\s/i))
          // Only register the pair if the RIGHT side is actually in the batch
          // we're about to process — otherwise we'd needlessly orchestrate
          // mirror logic for a batch that doesn't contain any mirrors.
          if (left && right && processingIds.has(right.id)) {
            mirrorMap.set(right.id, left.id)
          }
        }
      }
    }

    // Reorder: primaries first, then mirrors (so primary image exists when we
    // flip it to produce the mirror)
    const primaryIds = new Set(mirrorMap.values())
    const mirrorIds = new Set(mirrorMap.keys())
    const orderedModules = [
      ...modulesToProcess.filter(m => !mirrorIds.has(m.id)), // primaries + non-mirror modules
      ...modulesToProcess.filter(m => mirrorIds.has(m.id)),  // mirrors last
    ]

    if (mirrorMap.size > 0) {
      console.log(`[CAD-LAB] Mirror pairs detected: ${[...mirrorMap.entries()].map(([m, p]) => `${m} → ${p}`).join(", ")}`)
    }

    // Track primary module image URLs for mirror flipping. Seeded with
    // already-completed primaries from the full module list so a retry of
    // just a Right module can flip the existing Left image without
    // regenerating anything.
    const primaryImageUrls = new Map<string, { url: string; model?: string }>()
    for (const primaryId of primaryIds) {
      if (modulesToProcess.some(m => m.id === primaryId)) continue // will be generated below
      const existing = fullModuleIndex.get(primaryId)
      if (existing?.imageStatus === "complete" && existing.imageUrl) {
        primaryImageUrls.set(primaryId, { url: existing.imageUrl, model: existing.imageModelUsed })
      }
    }

    // INTENT: Process one at a time — concurrent large base64 payloads trigger
    // React Flight's "Maximum array nesting exceeded" serialization limit.
    // Retry (single module, no base64) always worked; this aligns bulk gen to match.
    for (let i = 0; i < orderedModules.length; i++) {
      const mod = orderedModules[i]
      const primaryId = mirrorMap.get(mod.id)
      const primaryImage = primaryId ? primaryImageUrls.get(primaryId) : undefined

      // INTENT: If this module is a mirror and its primary succeeded, flip
      // the primary image horizontally (left↔right) and upload it as this
      // module's own asset. Previously we reused the primary URL verbatim
      // which made paired cards look literally identical; sharp.flop()
      // produces a true port/starboard mirror. On any failure we fall back
      // to the old URL-copy so we never ship worse than before.
      if (primaryImage && projectId) {
        let mirroredUrl = primaryImage.url
        let stepLabel = `${mod.name} (mirrored)`
        try {
          const flipRes = await flipCadLabImageForMirrorAction(projectId, mod.id, primaryImage.url)
          if ('imageUrl' in flipRes) {
            mirroredUrl = flipRes.imageUrl
            console.log(`[CAD-LAB] Flipped primary ${primaryId} → mirror ${mod.id}`)
          } else {
            console.warn(`[CAD-LAB] Flip failed for mirror ${mod.id}, falling back to URL copy: ${flipRes.error}`)
            stepLabel = `${mod.name} (mirrored, flip fallback)`
          }
        } catch (err) {
          console.warn(`[CAD-LAB] Flip threw for mirror ${mod.id}, falling back to URL copy`, err)
          stepLabel = `${mod.name} (mirrored, flip fallback)`
        }
        const update: Partial<CadLabModule> = {
          imageUrl: mirroredUrl,
          imageStatus: "complete" as const,
          imageModelUsed: primaryImage.model,
        }
        imageUpdates.set(mod.id, update)
        setModules((prev) => prev.map((m) => (m.id === mod.id ? { ...m, ...update } : m)))
        completedCount++
        setImageGenProgress(p => p ? { ...p, completed: p.completed + 1 } : p)
        updateOp(bgOpId, { progress: Math.round(((i + 1) / orderedModules.length) * 89), stepLabel })
        revealModule(mod.id)
      } else {
        await generateOne(mod)
        updateOp(bgOpId, { progress: Math.round(((i + 1) / orderedModules.length) * 89), stepLabel: mod.name })
        // If this is a primary, capture its URL for mirror reuse
        if (primaryIds.has(mod.id)) {
          let snap: CadLabModule[] = []
          setModules((current) => { snap = current; return current })
          const generated = snap.find(m => m.id === mod.id)
          if (generated?.imageStatus === "complete" && generated.imageUrl) {
            primaryImageUrls.set(mod.id, { url: generated.imageUrl, model: generated.imageModelUsed })
          }
        }
      }
      // Small delay between calls to let React Flight serialization settle
      if (i < orderedModules.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    // INTENT: Auto-retry failed modules once with backoff. Skip if ALL failed
    // (systemic issue like missing API key — retrying won't help).
    // GOTCHA: Read failures from imageUpdates, not a setModules(updater)
    // snapshot — the updater pattern is deferred by React 18 batching and
    // yields an empty array (Rule 9 in cad-lab-react-patterns.md).
    const failedModules = modulesToProcess.filter(mod =>
      imageUpdates.get(mod.id)?.imageStatus === "failed"
    )
    if (failedModules.length > 0 && failedModules.length < modulesToProcess.length) {
      setImageGenProgress({ completed: 0, total: failedModules.length, failed: 0, phase: "retrying" })
      updateOp(bgOpId, { progress: 90, stepLabel: "Retrying failed modules…" })
      await new Promise(resolve => setTimeout(resolve, 2000))
      for (let ri = 0; ri < failedModules.length; ri++) {
        await generateOne(failedModules[ri])
        updateOp(bgOpId, { progress: 90 + Math.round(((ri + 1) / failedModules.length) * 10), stepLabel: `Retry: ${failedModules[ri].name}` })
      }
    }

    // INTENT: Clean up shared assets AFTER retry loop — retried modules still need
    // the shared reference/style URLs to be alive.
    if (referenceUrl || visualStyleUrl) {
      cleanupSharedImageAssetsAction(projectId).catch((e) => {
        console.warn("[CAD-LAB] Cleanup of shared image assets failed:", e)
      })
    }

    // Final persist — overlay the local imageUpdates map onto modulesRef.current.
    // GOTCHA: Reading modulesRef.current immediately after the last setModules
    // call yields a stale snapshot because useEffect ref sync only fires after
    // render, and there is no await between the final setModules and this save
    // (the main loop's 500ms yield only runs if i < orderedModules.length - 1).
    // The overlay pattern guarantees every image-update we have dispatched is
    // present in the save, regardless of React flush timing.
    const baseSnapshot = modulesRef.current
    const snapshot = baseSnapshot.length > 0
      ? baseSnapshot.map((m) => {
          const update = imageUpdates.get(m.id)
          return update ? { ...m, ...update } : m
        })
      : baseSnapshot
    // Sync the ref so any caller who reads it immediately after this function
    // (e.g. handleDecompose's final save) sees the image fields we just wrote.
    modulesRef.current = snapshot
    if (snapshot.length > 0) {
      saveCadLabModules(projectId, JSON.stringify(snapshot))
        .then((res) => {
          // GOTCHA: saveCadLabModules returns { error } on RLS/validation failure without throwing.
          // .then() fires regardless — must inspect the shape or the user sees a silent data-loss.
          if (res && "error" in res) {
            console.error("[CAD-LAB] Failed to save modules after image generation:", res.error)
            toast.error("Illustrations generated but failed to save — please try again")
            return
          }
          setLastSaved(new Date().toISOString())
        })
        .catch((err) => {
          console.error("[CAD-LAB] Failed to save modules after image generation:", err)
          toast.error("Illustrations generated but failed to save — please try again")
        })
    }

    // Recount after retries
    const finalCompleted = snapshot.filter(m =>
      modulesToProcess.some(t => t.id === m.id) && m.imageStatus === "complete"
    ).length
    if (finalCompleted > 0) {
      completeOp(bgOpId, `${finalCompleted}/${modulesToProcess.length} illustrations ready`)
      // INTENT: Mark images as current at the design revision when generation completed.
      // This covers both initial pipeline and regeneration flows.
      const currentRev = designRevisionRef.current
      setImagesGeneratedAtRevision(currentRev)
      if (projectId) {
        saveCadLabDesignRevision(projectId, currentRev, currentRev)
          .catch(err => console.error("[CAD-LAB] Failed to save images-at-revision:", err))
      }
    } else if (modulesToProcess.length > 0) {
      failOp(bgOpId, "All illustrations failed — check API key or retry")
    }
    } catch (unexpectedErr) {
      console.error("[CAD-LAB] Unexpected error in image generation pipeline:", unexpectedErr)
      failOp(bgOpId, "Illustration generation failed unexpectedly")

      // INTENT: Sweep remaining "generating" modules in this batch to "failed".
      // Otherwise a mid-pipeline throw leaves them stuck at "generating", and
      // the Images tab retry UI only matches ["pending", "failed", undefined] —
      // the user would be stranded with no recovery affordance.
      // See tasks/lessons.md 2026-04-17 — terminal error states must be visible.
      const targetIds = new Set(modulesToProcess.map(m => m.id))
      const errorMsg = unexpectedErr instanceof Error ? unexpectedErr.message : "Image generation interrupted"
      setModules(prev => prev.map(m =>
        targetIds.has(m.id) && m.imageStatus === "generating"
          ? { ...m, imageStatus: "failed" as const, imageError: errorMsg }
          : m
      ))
    } finally {
      // INTENT: Clear any leaked safety timeouts — if the try body threw before
      // the normal cleanup, these timers would fire on a potentially stale context.
      for (const timeout of moduleTimeouts.values()) {
        clearTimeout(timeout)
      }
      moduleTimeouts.clear()
    }
    setIsGeneratingImages(false)
    // Release the synchronous in-flight guard paired with the entry check.
    isGeneratingImagesRef.current = false
    setImageGenProgress(null)
  }, [activeProjectId, startOp, updateOp, completeOp, failOp])

  // ── Escape hatch: mark images current without regenerating ──
  // INTENT: If image regeneration fails persistently (API outage, quota
  // exhausted, etc.), users were trapped with imagesStale=true forever,
  // blocking the "Continue to Source" CTA on the Specify page. This
  // callback lets them manually mark the drawings as current at the
  // latest design revision — the visual won't match the revised spec but
  // the user can then proceed to Source and still work. Called from the
  // Specify review tab when imagesStale + regeneration has failed.
  const markImagesCurrentManually = useCallback(() => {
    const currentRev = designRevisionRef.current
    setImagesGeneratedAtRevision(currentRev)
    if (activeProjectId) {
      saveCadLabDesignRevision(activeProjectId, currentRev, currentRev).catch(err =>
        console.error("[CAD-LAB] Failed to persist manual imagesGeneratedAtRevision:", err),
      )
    }
    toast.info("Drawings marked current. The images may not match the revised spec until you regenerate them.")
  }, [activeProjectId])

  // ── Refresh module images using current diagnostic specs ──
  // INTENT: Called from the Specify finalize card. Regenerates blueprint illustrations
  // using the existing visualStyle and systemIllustrationUrl so the images reflect
  // the user's refined manufacturing/material choices.
  const handleRefreshModuleImages = useCallback(async () => {
    if (modules.length === 0) return
    // INTENT: If the system illustration (hero) was never generated for this
    // project, chain hero generation first via the ref-pinned
    // handleRetryIllustration — that helper persists the new URL and then
    // regenerates any failed/pending module images against the fresh hero,
    // which is what a user clicking "Generate Illustrations" with no hero
    // expects. A ref sidesteps the forward-reference issue (handleRetry-
    // Illustration is declared further down the file).
    if (!systemIllustrationUrl) {
      retryIllustrationRef.current?.()
      return
    }
    await handleGenerateModuleImages(
      modules,
      activeProjectId ?? undefined,
      visualStyle ?? undefined,
      undefined,                           // no referenceBase64 — upload will handle it
      undefined,                           // no moduleCrops — refresh doesn't re-analyze hero
      systemIllustrationUrl,                // hero URL for upload-failure fallback
    )
  }, [modules, activeProjectId, visualStyle, systemIllustrationUrl, handleGenerateModuleImages])

  // ── Regenerate drawings after specialist review revision ──
  // INTENT: Re-runs reconciliation to get updated perModuleImagePrompts from revised
  // specs, then regenerates per-module images. Skips hero regen (layout unchanged).
  const handleRegenerateDrawingsAfterRevision = useCallback(async () => {
    if (modules.length === 0 || !activeProjectId) return
    // SECURITY: Double-click guard on the Specify "Regenerate illustrations"
    // button. Each regen chain fires a 240s Opus reconcile call + a module
    // image pipeline; without this guard a second click fires another full
    // chain in parallel, duplicating cost + risking state races.
    if (isRegeneratingImagesRef.current) {
      console.warn("[CAD-LAB] Drawings regeneration already in flight — ignoring duplicate call")
      return
    }
    isRegeneratingImagesRef.current = true
    setIsRegeneratingImages(true)
    addProgressLine("Re-reconciling design for updated image prompts...")

    try {
      // Step 1: Re-run reconciliation with revised module data → new image prompts + visual style
      const currentModules = modulesRef.current.map(m => ({
        id: m.id, name: m.name, purpose: m.purpose, description: m.description,
        keyParts: m.keyParts, inputs: m.inputs, outputs: m.outputs,
      }))
      const reconcileRes = await reconcileDesignAction(
        subject,
        currentModules,
        decompositionConnections.length > 0 ? decompositionConnections : undefined,
        undefined,      // researchExcerpt — not needed for regen
        visualStyle ?? undefined,  // productIdentity — seed from existing style
      )

      if ("error" in reconcileRes) {
        console.warn("[CAD-LAB] Reconciliation failed during drawing regen, falling back to existing prompts:", reconcileRes.error)
        addProgressLine("Reconciliation failed — regenerating with existing prompts...")
        // Fallback: use existing style + prompts (still better than nothing)
        await handleRefreshModuleImages()
        return
      }

      // Step 2: Apply new moduleImagePrompts + updated visualStyle from reconciliation
      const { perModuleImagePrompts, visualStyle: newVisualStyle } = reconcileRes

      if (newVisualStyle) {
        setVisualStyle(newVisualStyle)
        await saveCadLabVisualStyle(activeProjectId, newVisualStyle)
      }

      if (perModuleImagePrompts && Object.keys(perModuleImagePrompts).length > 0) {
        setModules(prev => prev.map(m => {
          const prompt = perModuleImagePrompts[m.id]
          return prompt ? { ...m, moduleImagePrompt: prompt } : m
        }))
        // Persist updated modules with new image prompts
        setTimeout(async () => {
          if (activeProjectIdRef.current) {
            await saveCadLabModules(activeProjectIdRef.current, JSON.stringify(modulesRef.current))
          }
        }, 100)
      }

      addProgressLine("Generating updated blueprint illustrations...")

      // Step 3: Re-generate per-module images (skip hero — layout unchanged)
      await handleGenerateModuleImages(
        modulesRef.current,
        activeProjectId,
        newVisualStyle ?? visualStyle ?? undefined,
        undefined,                           // no referenceBase64
        undefined,                           // no moduleCrops
        systemIllustrationUrl ?? undefined,   // hero URL as reference
      )

      addProgressLine("Drawings updated to match revised specs.")
    } catch (err) {
      console.error("[CAD-LAB] Drawing regeneration failed:", err)
      toast.error("Drawing regeneration failed — try again")
    } finally {
      setIsRegeneratingImages(false)
      // Release the synchronous in-flight guard paired with the entry check.
      isRegeneratingImagesRef.current = false
    }
  }, [modules, activeProjectId, subject, decompositionConnections, visualStyle, systemIllustrationUrl, handleGenerateModuleImages, handleRefreshModuleImages, addProgressLine])

  // Sync ref so handleApplyReviewRevisions can auto-chain regen without forward-reference
  regenDrawingsRef.current = handleRegenerateDrawingsAfterRevision

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
              ...(documentContext && { documentContext }),
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

              // SECURITY: Guard against unbounded buffer accumulation
              if (buffer.length > 1_000_000) {
                console.warn("[CAD-LAB] SSE buffer exceeded 1MB, aborting")
                await reader.cancel()
                break
              }

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
  }, [modules, editableReport, modelId, activeProjectId, checkpoints, addProgressLine, startGenerating, stopGenerating, waitForSlot, debouncedSaveModules, detectedDomain, documentContext])

  /**
   * Single-click handler that runs the full pipeline for one module
   * (interface definition -> CAD generation) without needing the user
   * to click two separate buttons.
   *
   * @param moduleId - The module to generate
   */
  const handleGenerateSingleModule = useCallback(async (moduleId: string) => {
    const mod = modules.find((m) => m.id === moduleId)
    if (!mod) { toast.error("Module not found"); return }
    if (!activeProjectId) { toast.error("Project not initialized — try reloading the page"); return }
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
          toast.error(`Failed to plan dimensions for ${mod.name}`)
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
          ...(documentContext && { documentContext }),
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
  }, [modules, editableReport, modelId, activeProjectId, checkpoints, addProgressLine, startGenerating, stopGenerating, waitForSlot, debouncedSaveModules, detectedDomain, documentContext])

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
    if (modules.length === 0 || isBatchRunning) return
    if (!activeProjectId) { toast.error("Project not initialized — try reloading the page"); return }

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
                ...(documentContext && { documentContext }),
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
  }, [modules, isBatchRunning, activeProjectId, addProgressLine, sendNotification, subject, waitForSlot, detectedDomain, documentContext])

  // ── Retry system illustration ──
  // INTENT: If the original pipeline ran module images without a hero (because
  // hero failed), the module images were generated with no cross-module visual
  // reference and may look inconsistent. After a successful hero retry, we
  // offer to regenerate any failed/pending modules using the new hero, so the
  // Design tab isn't stranded in a half-broken state. See tasks/lessons.md
  // 2026-04-17 on recovery UI + terminal error states.
  const handleRetryIllustration = useCallback(() => {
    if (!activeProjectId) return
    // SECURITY: Double-click guard. Two concurrent hero retries race on the
    // same storage path and both eventually chain module-image regen.
    if (systemIllustrationStatusRef.current === "generating") {
      console.warn("[CAD-LAB] System illustration retry already in flight — ignoring duplicate call")
      return
    }
    systemIllustrationStatusRef.current = "generating"
    setSystemIllustrationStatus("generating")
    setSystemIllustrationError(null)
    generateCadLabSystemIllustrationAction(
      activeProjectId,
      subject,
      modules.map((m) => m.name),
      modules.map((m) => m.purpose),
      visualStyle ?? undefined,
    )
      .then(async (illRes) => {
        if ("url" in illRes) {
          setSystemIllustrationUrl(illRes.url)
          setSystemIllustrationStatus("complete")
          saveCadLabSystemIllustration(activeProjectId!, illRes.url)
            .catch((e) => console.error("[CAD-LAB] Failed to persist system illustration URL:", e))

          // INTENT: Offer module-image regen if any module is failed/pending.
          // Reads from the ref to avoid a stale snapshot across the await.
          const snapshot = modulesRef.current
          const needsRegen = snapshot.filter(
            (m) => m.imageStatus === "failed" || m.imageStatus === "pending" || !m.imageStatus,
          )
          if (needsRegen.length > 0 && !isGeneratingImagesRef.current) {
            toast.info(
              `Regenerating ${needsRegen.length} illustration${needsRegen.length === 1 ? "" : "s"} with the new hero image…`,
            )
            try {
              await handleGenerateModuleImages(
                needsRegen,
                activeProjectId,
                visualStyle ?? undefined,
                undefined,               // referenceBase64 — let upload handle it
                undefined,               // moduleCrops — none available here
                illRes.url,              // new hero URL
              )
            } catch (regenErr) {
              console.error("[CAD-LAB] Module regen after hero retry failed:", regenErr)
            }
          }
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
  }, [activeProjectId, subject, modules, visualStyle, handleGenerateModuleImages])

  // Sync ref so handleRefreshModuleImages can trigger hero gen without a TDZ
  // forward reference. See retryIllustrationRef declaration above.
  retryIllustrationRef.current = handleRetryIllustration

  // ── Research ──
  const handleResearch = useCallback(async () => {
    // SECURITY: Synchronous guard prevents concurrent research calls (React batching window)
    if (researchInFlightRef.current) {
      console.warn("[CAD-LAB] Research already in flight — ignoring duplicate call")
      return
    }
    researchInFlightRef.current = true
    setIsResearching(true)
    setResearchResult(null)
    setEditableReport("")
    setProgressLines([])
    setModules([])
    setDiagnosticAnswers({})
    setDiagnosticEnrichment({})
    setAiPrefilled(false)
    setBatchProgress({})
    setSystemIllustrationStatus("idle")
    setSystemIllustrationUrl(null)
    setSystemIllustrationError(null)

    const researchTimers: ReturnType<typeof setTimeout>[] = []

    try {
      // INTENT: ensureProject() early — needed for storage paths (uploads + extraction).
      // Idempotent: returns cached ID if project already exists.
      const projId = await ensureProject()

      // GOTCHA: If project creation fails but user uploaded files, warn them
      // that their uploads won't be included in research.
      if (!projId) {
        const hasPendingImages = referenceImagesRef.current.some(img => !img.uploaded)
        const hasPendingDocs = referenceDocumentsRef.current.some(doc => !doc.uploaded && doc.fileData)
        if (hasPendingImages || hasPendingDocs) {
          console.warn("[CAD-LAB] ensureProject() returned null — pending uploads will not be included in research")
          toast.error("Could not create project — uploaded files will not be included in research")
        }
      }

      // ── Upload reference images before research (no extraction needed) ──
      // GOTCHA: Capture ref snapshot ONCE before any state mutations to avoid
      // reading stale data after setReferenceImages calls.
      if (projId) {
        const currentImages = referenceImagesRef.current
        const pendingImages = currentImages.filter((img) => !img.uploaded)
        if (pendingImages.length > 0) {
          addProgressLine("Uploading reference images...")
          const uploadRes = await uploadReferenceImages(projId, pendingImages.map((img) => ({
            id: img.id, name: img.name, mimeType: img.mimeType, base64: img.base64, originalSize: img.originalSize,
          })))
          if ("error" in uploadRes) {
            console.error("[CAD-LAB] Reference image upload failed:", uploadRes.error)
            toast.error(`Reference image upload failed: ${uploadRes.error}`)
          } else if (uploadRes.stored.length > 0) {
            const storedMap = new Map(uploadRes.stored.map((s) => [s.id, s]))
            const updated = currentImages.map((img) => {
              const stored = storedMap.get(img.id)
              return stored ? { ...img, uploaded: true, storageUrl: stored.storageUrl } : img
            })
            setReferenceImages(updated)
            referenceImagesRef.current = updated // GOTCHA: useEffect ref sync won't fire mid-async
            const existingStored = currentImages
              .filter((img) => img.uploaded && img.storageUrl && !storedMap.has(img.id))
              .map((img) => ({ id: img.id, name: img.name, mimeType: img.mimeType, storageUrl: img.storageUrl!, originalSize: img.originalSize }))
            const imgSaveRes = await saveReferenceImageUrls(projId, [...existingStored, ...uploadRes.stored])
            if ("error" in imgSaveRes) {
              console.error("[CAD-LAB] Failed to save image metadata:", imgSaveRes.error)
              toast.error("Images uploaded but metadata save failed — they may not persist on reload")
            }
            if (uploadRes.failed.length > 0) {
              toast.error(`Some images failed: ${uploadRes.failed.join(", ")}`)
            }
          } else if (uploadRes.failed.length > 0) {
            // All images failed — stored is empty but failed is populated
            toast.error(`All image uploads failed: ${uploadRes.failed.join(", ")}`)
          }
        }
      }

      // ── Upload + extract reference documents BEFORE research ──
      // INTENT: Document specs must be available for the research prompt.
      // The old flow ran extraction AFTER research, so documentContext was always empty.
      if (projId) {
        const currentDocs = referenceDocumentsRef.current
        // SECURITY: Only upload docs that have fileData (skip cleared/null ones)
        const pendingDocs = currentDocs.filter((doc) => !doc.uploaded && doc.fileData)
        if (pendingDocs.length > 0) {
          addProgressLine("Uploading reference documents...")
          const docUploadRes = await uploadReferenceDocuments(projId, pendingDocs.map((doc) => ({
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            base64Data: arrayBufferToBase64(doc.fileData!),
            originalSize: doc.originalSize,
            fileType: doc.fileType,
          })))
          if ("error" in docUploadRes) {
            console.error("[CAD-LAB] Reference document upload failed:", docUploadRes.error)
            toast.error(`Document upload failed: ${docUploadRes.error}`)
          } else if (docUploadRes.stored.length > 0) {
            const docStoredMap = new Map(docUploadRes.stored.map((s) => [s.id, s]))
            let updatedDocs = currentDocs.map((doc) => {
              const stored = docStoredMap.get(doc.id)
              return stored ? { ...doc, uploaded: true, storageUrl: stored.storageUrl, fileData: null } : doc
            })
            setReferenceDocuments(updatedDocs)
            referenceDocumentsRef.current = updatedDocs // GOTCHA: useEffect ref sync won't fire mid-async

            // Extract text from each extractable document (parallel)
            const extractableDocs = docUploadRes.stored.filter((s) => EXTRACTABLE_TYPES.includes(s.fileType))
            if (extractableDocs.length > 0) {
              addProgressLine("Extracting specs from uploaded documents...")
              // Mark as extracting
              updatedDocs = updatedDocs.map((doc) => {
                if (extractableDocs.some((e) => e.id === doc.id)) {
                  return { ...doc, extractionStatus: "extracting" as const }
                }
                return doc
              })
              setReferenceDocuments(updatedDocs)
              referenceDocumentsRef.current = updatedDocs

              const extractResults = await Promise.allSettled(
                extractableDocs.map((doc) =>
                  extractDocumentText(projId, doc.id, doc.fileType)
                )
              )

              // Merge extraction results
              const extractMap = new Map<string, { extractedSpecs: string | null; status: "complete" | "failed" | "not_applicable" }>()
              extractResults.forEach((result, idx) => {
                const docId = extractableDocs[idx].id
                if (result.status === "fulfilled" && !("error" in result.value)) {
                  extractMap.set(docId, { extractedSpecs: result.value.extractedSpecs, status: result.value.status })
                } else {
                  extractMap.set(docId, { extractedSpecs: null, status: "failed" })
                }
              })

              updatedDocs = updatedDocs.map((doc) => {
                const extractResult = extractMap.get(doc.id)
                if (extractResult) {
                  return { ...doc, extractionStatus: extractResult.status, extractedSpecs: extractResult.extractedSpecs }
                }
                if (!EXTRACTABLE_TYPES.includes(doc.fileType) && doc.uploaded) {
                  return { ...doc, extractionStatus: "not_applicable" as const }
                }
                return doc
              })
              setReferenceDocuments(updatedDocs)
              referenceDocumentsRef.current = updatedDocs // GOTCHA: sync ref so freshDocumentContext reads extraction results
            } else {
              // Mark CAD-only docs as not_applicable
              updatedDocs = updatedDocs.map((doc) =>
                doc.uploaded && !EXTRACTABLE_TYPES.includes(doc.fileType)
                  ? { ...doc, extractionStatus: "not_applicable" as const }
                  : doc
              )
              setReferenceDocuments(updatedDocs)
              referenceDocumentsRef.current = updatedDocs
            }

            // Save all document metadata to DB
            const allStoredDocs = updatedDocs.filter((doc) => doc.uploaded && doc.storageUrl).map((doc) => ({
              id: doc.id,
              name: doc.name,
              mimeType: doc.mimeType,
              storageUrl: doc.storageUrl!,
              originalSize: doc.originalSize,
              fileType: doc.fileType,
              rawText: null, // rawText lives server-side only
              extractedSpecs: doc.extractedSpecs ?? null,
              extractionStatus: doc.extractionStatus,
              uploadedAt: new Date().toISOString(),
            }))
            const docSaveRes = await saveReferenceDocumentUrls(projId, allStoredDocs)
            if ("error" in docSaveRes) {
              console.error("[CAD-LAB] Failed to save document metadata:", docSaveRes.error)
              toast.error("Documents uploaded but metadata save failed — they may not persist on reload")
            }

            if (docUploadRes.failed.length > 0) {
              toast.error(`Some documents failed: ${docUploadRes.failed.join(", ")}`)
            }
          } else if (docUploadRes.failed.length > 0) {
            // All documents failed — stored is empty but failed is populated
            toast.error(`All document uploads failed: ${docUploadRes.failed.join(", ")}`)
          }
        }
      }

      // INTENT: Compute document context from extraction results inline.
      // Can't rely on useMemo (documentContext) mid-async — React state won't flush.
      // Re-read ref after mutations to get freshly-extracted specs.
      let freshDocumentContext = ""
      const finalDocs = referenceDocumentsRef.current
      const specs = finalDocs
        .filter(d => d.extractionStatus === "complete" && d.extractedSpecs)
        .map(d => `### ${d.name}\n${d.extractedSpecs}`)
        .join("\n\n")
      freshDocumentContext = specs.length > 15_000
        ? specs.slice(0, 15_000) + "\n\n[Document context truncated]"
        : specs

      // INTENT: Honest progress lines that describe what's actually happening.
      // Placed here (after upload/extraction) so messages match the actual phase.
      addProgressLine("Running web search for real-world specifications (Gemini Search)...")
      researchTimers.push(setTimeout(() => addProgressLine("Searching Thingiverse for reference CAD models..."), 3000))
      researchTimers.push(setTimeout(() => addProgressLine("Querying design standards database (220+ standards across 19 domains)..."), 8000))
      researchTimers.push(setTimeout(() => addProgressLine("Loading material properties and process constraints from engineering library..."), 12000))
      researchTimers.push(setTimeout(() => addProgressLine("Synthesising research report with Claude Opus..."), 18000))
      researchTimers.push(setTimeout(() => addProgressLine("This typically takes 20-40 seconds depending on product complexity..."), 25000))

      const res = await runCadLabResearch(subject, {
        designBrief,
        assumptionNotes,
        documentContext: freshDocumentContext || documentContext || undefined,
      })
      researchTimers.forEach(clearTimeout)

      const engLines: string[] = [
        `Found ${res.sources.length} web sources with engineering data`,
        `Found ${res.referenceModels.length} reference CAD models`,
        `Report complete — ${res.report.length.toLocaleString()} characters`,
        `Research time: ${(res.researchTime / 1000).toFixed(1)}s`,
      ]
      // Show engineering intelligence applied
      if (res.standardCodes?.length) {
        engLines.push(`Referenced ${res.standardCodes.length} design standards (${res.industryDomain?.replace(/_/g, " ") ?? "general"} domain)`)
      }
      if (res.engineeringData) {
        const ed = res.engineeringData
        if (ed.materialsApplied.length) engLines.push(`Applied ${ed.materialsApplied.length} verified material specifications`)
        if (ed.processesApplied.length) engLines.push(`Enforcing ${ed.processesApplied.join(", ")} process constraints`)
        if (ed.hardwareItemCount) engLines.push(`${ed.hardwareItemCount} ISO hardware specs available (bolts, bearings, washers)`)
      }
      setProgressLines(engLines)

      setResearchResult(res)
      setEditableReport(res.report)
      if (res.modelUsed) setResearchModelUsed(res.modelUsed)

      // Seed product overview immediately so it's visible while illustration generates
      if (!productOverviewRef.current) {
        const summary = extractExecutiveSummary(res.report)
        if (summary) {
          setProductOverview(summary)
          productOverviewRef.current = summary // INTENT: sync ref immediately so the post-ensureProject save sees it
        }
      }

      if (res.success) {
        setMilestone("research")
        freshResearchRef.current = true // INTENT: must be set BEFORE any await so the auto-decompose effect sees it when React flushes the batch
        if (projId) {
          // INTENT: Inner try/catch so a save failure doesn't destroy the successful
          // research result. The user waited 30+ seconds — don't nuke their report
          // just because the DB save failed.
          try {
            setIsSaving(true)
            await saveCadLabResearch(projId, res)
            // Persist seeded overview alongside research
            if (productOverviewRef.current) {
              saveCadLabProductOverview(projId, productOverviewRef.current).catch(() => {
                console.error("[CAD-LAB] Failed to persist seeded overview")
              })
            }
            setLastSaved(new Date().toISOString())
            refreshProjects()
          } catch (saveErr) {
            console.error("[CAD-LAB] Failed to save research to DB:", saveErr)
            toast.error("Research completed but failed to save — your results are still visible")
          } finally {
            setIsSaving(false)
          }

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
      // GOTCHA: If error occurred during extraction, docs may be stuck in "extracting"
      // status with a perpetual spinner. Reset them to "failed" so the UI reflects reality.
      setReferenceDocuments(prev => {
        const hasStuck = prev.some(d => d.extractionStatus === "extracting")
        if (!hasStuck) return prev
        const fixed = prev.map(d =>
          d.extractionStatus === "extracting" ? { ...d, extractionStatus: "failed" as const } : d
        )
        referenceDocumentsRef.current = fixed
        return fixed
      })
    } finally {
      setIsResearching(false)
      researchInFlightRef.current = false
    }
  }, [subject, designBrief, assumptionNotes, documentContext, ensureProject, refreshProjects, addProgressLine])

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
    setInterviewPhase("idle")
    setModules([])
    setResearchModelUsed(null)
    setDecompositionModelUsed(null)
    setDecompositionError(null)
    setExpandedModuleId(null)
    setGeneratingModuleIds(new Set())
    setDiagnosticAnswers({})
    setDiagnosticEnrichment({})
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
    setModuleReviews({})
    setProductOverview("")
    setUnifiedResult(null)
    setUnifiedCode(null)
    setProviderResults({})
    // Revoke preview URLs before clearing
    referenceImagesRef.current.forEach((img) => {
      if (img.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(img.previewUrl)
    })
    setReferenceImages([])
    setReferenceDocuments([])

    // INTENT: The previous reset missed 8 state slices that then leaked
    // across project boundaries. If a user loaded Project A, clicked
    // "new project" (handleReset), and started Project B, fields like
    // reviewSkipped / aiCostEstimates / revisedModuleIds were carried over
    // — meaning Project B could land with stale cost estimates keyed by
    // Project A's module ids, or skip-reviews state that made
    // canProceedToSource true before Project B had any reviews.
    // Add every non-blobbed state that persists across the reset.
    setReviewSkipped(false)
    setRevisedModuleIds(new Set())
    setCheckpointAcknowledged(false)
    setAiCostEstimates({})
    setPartCategoryOverrides({})
    setInterfaceContracts([])
    setDecompositionConnections([])
    setUnmatchedPorts({ outputs: [], inputs: [] })
    setImagesGeneratedAtRevision(1)
    setDesignRevision(1)
  }, [])

  // ── Load a saved project ──
  const handleLoadProject = useCallback(async (projectId: string) => {
    try {
      const res = await loadCadLabProject(projectId)
      if ("error" in res) return

      const p = res.project
      console.log("[CAD-LAB] Loaded project:", {
        id: p.id,
        subject: p.subject?.slice(0, 40),
        hasResearch: !!p.research,
        moduleCount: p.modules?.length ?? 0,
        hasVisualStyle: !!p.visualStyle,
        hasIllustration: !!p.systemIllustrationUrl,
        hasOverview: !!p.productOverview,
      })
      setSubject(p.subject)
      // DECISION: Do NOT restore modelId from saved project — Opus is the immutable default.
      // Loading a project should not override the user's current model selection.
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
        // INTENT: Preserve imageStatus="failed" on load so the card's Retry button
        // renders and users have a recovery path. Silently resetting to undefined
        // hid failures behind a "queued" skeleton with no way forward.
        setModules(p.modules)
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
      // Load decomposition connections
      setDecompositionConnections(p.decompositionConnections ?? [])
      // P1: Load persisted interface contracts + unmatched ports
      setInterfaceContracts(p.interfaceContracts?.contracts ?? [])
      setUnmatchedPorts({
        outputs: p.interfaceContracts?.unmatchedOutputs ?? [],
        inputs: p.interfaceContracts?.unmatchedInputs ?? [],
      })
      // Restore diagnostic answers + enrichment from database
      if (p.diagnosticAnswers && Object.keys(p.diagnosticAnswers).length > 0) {
        setDiagnosticAnswers(p.diagnosticAnswers)
      }
      if (p.diagnosticEnrichment && Object.keys(p.diagnosticEnrichment).length > 0) {
        setDiagnosticEnrichment(p.diagnosticEnrichment)
      }

      // Restore specialist reviews from database
      if (p.reviews && Object.keys(p.reviews).length > 0) {
        setModuleReviews(p.reviews)
      } else {
        setModuleReviews({})
      }

      // Restore AI cost estimates from database
      // INTENT: Version-aware restore — if the saved prompt version doesn't match the
      // current COST_PROMPT_VERSION, leave the fingerprint empty so the auto-trigger
      // re-fires with the updated prompt.
      if (p.aiCostEstimates && Object.keys(p.aiCostEstimates).length > 0) {
        const savedVersion = (p.aiCostEstimates as Record<string, unknown>)._promptVersion as number | undefined ?? 1
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _promptVersion, ...estimates } = p.aiCostEstimates as Record<string, unknown>
        setAiCostEstimates(estimates as Record<string, AiCostEstimate>)
        if (savedVersion === COST_PROMPT_VERSION && p.diagnosticAnswers && p.modules) {
          // Version matches — set fingerprint so auto-trigger skips
          aiCostFingerprintRef.current = `v${COST_PROMPT_VERSION}:` + p.modules.map((m) => {
            const a = p.diagnosticAnswers?.[m.id] || {}
            return `${m.id}:${m.purpose?.slice(0, 50)}|${m.description?.slice(0, 50)}|${m.keyParts?.length}|${a.mfg_process}|${a.material}|${a.tolerance}|${a.finish}|${a.environment}|${a.batch_size}`
          }).join(";")
        } else {
          // Version mismatch — leave fingerprint empty so auto-trigger fires
          console.log(`[CAD-LAB] Cost prompt version mismatch (saved=${savedVersion}, current=${COST_PROMPT_VERSION}) — will re-estimate`)
          aiCostFingerprintRef.current = ""
        }
      } else {
        setAiCostEstimates({})
      }

      // Restore part classification overrides
      setPartCategoryOverrides(
        (p.partCategoryOverrides && Object.keys(p.partCategoryOverrides).length > 0)
          ? p.partCategoryOverrides
          : {}
      )

      // Restore unified CAD result from database
      setUnifiedResult((p.unifiedResult as CadLabResult | null) ?? null)
      setUnifiedCode(p.unifiedCode ?? null)

      // Restore provider A/B comparison results
      setProviderResults(p.providerResults ?? {})

      // Restore Tripo preview from provider results if available
      const tripoResult = (p.providerResults ?? {})["tripo"]
      if (tripoResult?.status === "completed" && tripoResult.glbUrl) {
        setTripoPreviewUrl(tripoResult.glbUrl)
        setTripoPreviewStatus("complete")
        setTripoPreviewError(null)
      } else {
        setTripoPreviewUrl(null)
        setTripoPreviewStatus("idle")
        setTripoPreviewError(null)
      }

      // INTENT: Revoke old blob URLs before loading new project's images to prevent memory leak.
      // handleReset does this too, but handleLoadProject doesn't call handleReset.
      referenceImagesRef.current.forEach((img) => {
        if (img.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(img.previewUrl)
      })

      // Restore reference images from database
      // INTENT: Explicit field mapping from StoredReferenceImage → ReferenceImageFile
      // to avoid spreading DB fields that don't belong in client state.
      if (p.referenceImages && p.referenceImages.length > 0) {
        setReferenceImages(p.referenceImages.map((img) => ({
          id: img.id,
          name: img.name,
          mimeType: img.mimeType,
          storageUrl: img.storageUrl,
          originalSize: img.originalSize,
          base64: "", // Don't reload full base64 from storage
          previewUrl: img.storageUrl, // Use storage URL as preview
          uploaded: true,
        })))
      } else {
        setReferenceImages([])
      }

      // Restore reference documents from database
      if (p.referenceDocuments && p.referenceDocuments.length > 0) {
        setReferenceDocuments(p.referenceDocuments.map((doc) => ({
          id: doc.id,
          name: doc.name,
          mimeType: doc.mimeType,
          fileType: doc.fileType,
          fileData: null, // Don't reload binary data
          originalSize: doc.originalSize,
          uploaded: true,
          storageUrl: doc.storageUrl,
          extractionStatus: doc.extractionStatus,
          extractedSpecs: doc.extractedSpecs,
        })))
      } else {
        setReferenceDocuments([])
      }

      // Restore design revision state
      setDesignRevision(p.designRevision ?? 1)
      setImagesGeneratedAtRevision(p.imagesGeneratedAtRevision ?? 1)

      // Restore review-skipped flag
      setReviewSkipped(p.reviewSkipped ?? false)

      // Fetch manufacturing order count for this project
      const ordersRes = await getProjectOrders(projectId)
      if ("orders" in ordersRes) {
        setManufacturingOrderCount(ordersRes.orders.length)
      }

      // INTENT: Prevent the auto-decompose effect from re-triggering on project reload.
      // freshResearchRef is set true during handleResearch() to auto-decompose after
      // fresh research. Without this reset, loading a saved project with research
      // causes hasResearch to flip false→true, triggering handleDecompose() which
      // clears the restored state.
      freshResearchRef.current = false
    } catch {
      console.error("[CAD-LAB] Failed to load project")
    }
  }, [])

  // INTENT: Restore the last active project when the provider initializes or
  // when activeProjectId becomes null (state lost due to page reload, etc.).
  // Without this, navigating away and back leaves a blank canvas because
  // activeProjectId initializes to null and nothing triggers a load.
  //
  // DECISION: Uses activeProjectId in deps so it re-fires when state is lost.
  // The `isRestoringRef` guard stays true while the async load is in-flight,
  // preventing StrictMode double-fire without relying on fragile timers.
  useEffect(() => {
    if (!initialized) return
    if (typeof window === "undefined") return
    if (activeProjectId) return
    if (isRestoringRef.current) return

    const storedProjectId = localStorage.getItem(CAD_LAB_ACTIVE_PROJECT_KEY)
    if (storedProjectId) {
      isRestoringRef.current = true
      handleLoadProject(storedProjectId).finally(() => {
        isRestoringRef.current = false
      })
    }
  }, [initialized, activeProjectId, handleLoadProject])

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
      // GOTCHA: withAIGate returns { error, limitReached } when quota exhausted —
      // guard before iterating as module revisions (would corrupt state with fake IDs)
      const revAsAny = revised as Record<string, unknown>
      if (revAsAny && typeof revAsAny === "object" && "error" in revAsAny) {
        toast.error(String(revAsAny.error))
        setCheckpointAcknowledged(false) // allow retry
        return
      }

      const revisedIds = Object.keys(revised)
      if (revisedIds.length === 0) {
        toast.error("Module revision failed — no modules were updated")
        setCheckpointAcknowledged(false) // allow retry
        return
      }

      setModules((prev) =>
        prev.map((mod) => {
          const fields = revised[mod.id]
          if (!fields) return mod
          // GUARD: Never overwrite an existing snapshot (prevents double-revision)
          if (mod.conceptSnapshot) return {
            ...mod,
            ...fields,
            revisionNumber: (mod.revisionNumber ?? 1) + 1,
            lastRevisionSource: "checkpoint" as const,
          }
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
            revisionNumber: (mod.revisionNumber ?? 1) + 1,
            lastRevisionSource: "checkpoint" as const,
          }
        }),
      )
      debouncedSaveModules()
      setRevisedModuleIds(new Set(revisedIds))

      // INTENT: Bump project-level design revision so images become stale
      const nextRevision = designRevisionRef.current + 1
      setDesignRevision(nextRevision)
      if (activeProjectIdRef.current) {
        saveCadLabDesignRevision(activeProjectIdRef.current, nextRevision, imagesGeneratedAtRevision)
          .catch(err => console.error("[CAD-LAB] Failed to save design revision:", err))
      }

      const hasImages = modulesRef.current.some(m => m.imageUrl)
      toast.success(`${revisedIds.length} module${revisedIds.length === 1 ? "" : "s"} revised with specialist feedback${hasImages ? " — regenerating drawings..." : ""}`)

      // INTENT: Auto-chain drawing regeneration after checkpoint revisions (same as review handler)
      if (hasImages) {
        setTimeout(() => regenDrawingsRef.current?.(), 200)
      }
    }).catch((err) => {
      console.error("[CAD-LAB] Checkpoint revision failed:", err)
      toast.error("Module revision failed — proceeding with original descriptions")
      setCheckpointAcknowledged(false) // allow retry
    }).finally(() => {
      setIsRevising(false)
    })
  }, [checkpointAcknowledged, isRevising, checkpoints, editableReport, subject, debouncedSaveModules, imagesGeneratedAtRevision])

  // ── Interactive code workbench: execute edited code ──
  const handleExecuteModuleCode = useCallback(async (moduleId: string, code: string) => {
    if (!activeProjectIdRef.current) return

    const res = await executeCadQueryAction(code)
    if (!res.success) {
      toast.error(res.error)
      return
    }

    const { result: modalRes } = res

    // Patch the module's result in state with new execution data
    // INTENT: Merge new Modal results into existing result, preserving fields
    // the Modal response doesn't include (e.g., drawingPackage, visionScore)
    setModules((prev) =>
      prev.map((m) => {
        if (m.id !== moduleId) return m
        const existing = m.result ?? {} as Partial<CadLabResult>
        const patched = {
          ...existing,
          success: true as const,
          code,
          codeLines: code.split("\n").length,
          stlData: modalRes.stlData ?? (existing as CadLabResult).stlData,
          stepData: modalRes.stepData ?? (existing as CadLabResult).stepData,
          svgIso: modalRes.svgIso ?? (existing as CadLabResult).svgIso,
          svgTop: modalRes.svgTop ?? (existing as CadLabResult).svgTop,
          svgFront: modalRes.svgFront ?? (existing as CadLabResult).svgFront,
          svgBack: modalRes.svgBack ?? (existing as CadLabResult).svgBack,
          svgRight: modalRes.svgRight ?? (existing as CadLabResult).svgRight,
          svgLeft: modalRes.svgLeft ?? (existing as CadLabResult).svgLeft,
          svgExploded: modalRes.svgExploded ?? (existing as CadLabResult).svgExploded,
          bbox: modalRes.bbox ?? (existing as CadLabResult).bbox,
          massGrams: modalRes.massGrams ?? (existing as CadLabResult).massGrams,
          volumeMm3: modalRes.volumeMm3 ?? (existing as CadLabResult).volumeMm3,
          fillRatio: modalRes.fillRatio ?? (existing as CadLabResult).fillRatio,
          dfm: modalRes.dfm ?? (existing as CadLabResult).dfm,
        } as unknown as Omit<CadLabResult, "stlData" | "stepData">
        return { ...m, code, result: patched }
      }),
    )
    debouncedSaveModules()
    toast.success("Code executed successfully")
  }, [debouncedSaveModules])

  // ── Interactive code workbench: refine code with natural language ──
  // INTENT: Use modulesRef instead of modules to avoid stale closure (#4)
  const handleRefineModuleCode = useCallback(async (
    moduleId: string,
    currentCode: string,
    instruction: string,
  ): Promise<string | null> => {
    const mod = modulesRef.current.find((m) => m.id === moduleId)
    if (!mod) return null

    const res = await refineCadQueryCodeAction(currentCode, instruction, {
      name: mod.name,
      purpose: mod.purpose,
      description: mod.description,
    })

    if (!res.success) {
      toast.error(res.error)
      return null
    }

    return res.code
  }, [])

  // ── Unified model polling (background-resilient recovery) ──
  // INTENT: When the SSE stream breaks (navigation, network), the server-side route
  // continues and persists to DB. This polls the DB until the result appears.
  const startUnifiedResultPolling = useCallback((projectId: string) => {
    // Clear any existing poll
    if (unifiedPollIntervalRef.current) {
      clearInterval(unifiedPollIntervalRef.current)
    }

    let pollCount = 0
    const MAX_POLLS = 38 // ~5 min at 8s intervals
    const POLL_INTERVAL_MS = 8_000

    addProgressLine("SSE stream interrupted — polling server for result...")

    unifiedPollIntervalRef.current = setInterval(async () => {
      pollCount++
      if (pollCount > MAX_POLLS) {
        // Timeout — give up
        if (unifiedPollIntervalRef.current) clearInterval(unifiedPollIntervalRef.current)
        unifiedPollIntervalRef.current = null
        if (unifiedBgOpIdRef.current) failOp(unifiedBgOpIdRef.current, "Generation timed out")
        unifiedBgOpIdRef.current = null
        setIsGeneratingUnified(false)
        unifiedGuardRef.current = false
        addProgressLine("Generation timed out — please try again")
        toast.error("Generation timed out")
        return
      }

      try {
        const res = await pollUnifiedResultAction(projectId)
        if ("error" in res) {
          console.warn("[CAD-LAB] Poll error:", res.error)
          return // keep polling
        }
        if ("pending" in res) return // keep polling

        // Result found — hydrate state
        if (unifiedPollIntervalRef.current) clearInterval(unifiedPollIntervalRef.current)
        unifiedPollIntervalRef.current = null
        setUnifiedResult(res.result as CadLabResult)
        setUnifiedCode(res.code ?? null)
        if (unifiedBgOpIdRef.current) completeOp(unifiedBgOpIdRef.current, "CAD model ready")
        unifiedBgOpIdRef.current = null
        setIsGeneratingUnified(false)
        unifiedGuardRef.current = false
        addProgressLine("Unified model generated successfully!")
        sendNotification("CAD Model Ready", `Unified model for "${subject}" is ready`)
        toast.success("Unified CAD model generated")
      } catch (err) {
        console.warn("[CAD-LAB] Poll exception:", err)
        // keep polling — transient errors shouldn't abort
      }
    }, POLL_INTERVAL_MS)
  }, [subject, addProgressLine, sendNotification, completeOp, failOp])

  // ── Unified model generation ──
  // INTENT: Generates a single CadQuery model for the entire product. Integrates
  // with BackgroundOps so the progress pill persists across navigation. If the SSE
  // stream breaks, falls back to DB polling.
  const handleGenerateUnifiedModel = useCallback(async () => {
    if (unifiedGuardRef.current) return
    if (!activeProjectIdRef.current) {
      toast.error("Project not initialized — try reloading the page")
      return
    }
    if (modulesRef.current.length === 0) {
      toast.error("No modules to generate — decompose first")
      return
    }

    unifiedGuardRef.current = true
    setIsGeneratingUnified(true)
    // INTENT: Clear previous result so stale model isn't visible during regeneration
    setUnifiedResult(null)
    setUnifiedCode(null)
    addProgressLine("Starting unified model generation...")

    // Register background op so the indicator pill appears app-wide
    const bgOpId = startOp("Generating CAD Model", "/the-forge/cad-lab/cad")
    unifiedBgOpIdRef.current = bgOpId
    let sseCompleted = false

    try {
      const response = await fetch("/api/cad-lab/generate-unified", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          projectId: activeProjectIdRef.current,
          ...(detectedDomain && { domainHint: detectedDomain }),
        }),
      })

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: "Unknown error" })) as { error?: string }
        throw new Error(errBody.error || `HTTP ${response.status}`)
      }

      // FLOW: Read SSE stream — same pattern as handleModuleGenerate
      if (response.headers.get("content-type")?.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          // SECURITY: Guard against unbounded buffer accumulation
          if (buffer.length > 1_000_000) {
            console.warn("[CAD-LAB] SSE buffer exceeded 1MB, aborting")
            await reader.cancel()
            break
          }

          const messages = buffer.split("\n\n")
          buffer = messages.pop() ?? ""

          for (const msg of messages) {
            for (const line of msg.split("\n")) {
              if (!line.startsWith("data: ")) continue
              try {
                const event = JSON.parse(line.slice(6)) as { type: string; step?: string; message?: string; result?: CadLabResult; code?: string }
                if (event.type === "status") {
                  const stepLabels: Record<string, string> = {
                    interface: "Preparing geometry specification...",
                    codegen: "Generating CadQuery code...",
                    modal: "Executing CAD model...",
                    gencad: "Generating parametric model via GenCAD...",
                    upload: "Uploading assets...",
                  }
                  const label = event.step ? stepLabels[event.step] : undefined
                  if (label) {
                    addProgressLine(label)
                    if (unifiedBgOpIdRef.current) updateOp(unifiedBgOpIdRef.current, { stepLabel: label })
                  }
                } else if (event.type === "progress" && event.message) {
                  addProgressLine(event.message)
                } else if (event.type === "unified_complete" && event.result) {
                  sseCompleted = true
                  setUnifiedResult(event.result as CadLabResult)
                  setUnifiedCode(event.code ?? null)
                  addProgressLine("Unified model generated successfully!")
                  sendNotification("CAD Model Ready", `Unified model for "${subject}" is ready`)
                  toast.success("Unified CAD model generated")
                  if (unifiedBgOpIdRef.current) completeOp(unifiedBgOpIdRef.current, "CAD model ready")
                  unifiedBgOpIdRef.current = null
                } else if (event.type === "error") {
                  throw new Error(event.message || "Generation failed")
                }
              } catch (parseErr) {
                if (parseErr instanceof SyntaxError) {
                  // Actual JSON parse error — skip this malformed SSE line
                } else {
                  throw parseErr
                }
              }
            }
          }
        }
      } else {
        // Backward compat: non-SSE JSON response
        const data = await response.json() as { result?: CadLabResult; code?: string }
        if (data.result) {
          sseCompleted = true
          setUnifiedResult(data.result)
          setUnifiedCode(data.code ?? null)
          addProgressLine("Unified model generated successfully!")
          sendNotification("CAD Model Ready", `Unified model for "${subject}" is ready`)
          toast.success("Unified CAD model generated")
          if (unifiedBgOpIdRef.current) completeOp(unifiedBgOpIdRef.current, "CAD model ready")
          unifiedBgOpIdRef.current = null
        }
      }
    } catch (err) {
      console.error("[CAD-LAB] Unified generation SSE failed:", err)
      const msg = err instanceof Error ? err.message : "Unknown error"

      // DECISION: If the SSE stream broke but the server may still be running,
      // fall back to DB polling instead of immediately declaring failure.
      // Only truly fatal errors (HTTP 4xx, rate limit) skip polling.
      const isFatalError = msg.includes("HTTP 4") || msg.includes("Rate limit") || msg.includes("Invalid")
        || msg.includes("CAD generation failed") || msg.includes("No product illustration")
        || msg.includes("GENCAD_MODAL_URL not configured")
      if (!isFatalError && activeProjectIdRef.current) {
        addProgressLine(`Stream interrupted: ${msg}`)
        startUnifiedResultPolling(activeProjectIdRef.current)
        return // Don't reset isGeneratingUnified — polling will do it
      }

      addProgressLine(`Unified generation failed: ${msg}`)
      toast.error(`Generation failed: ${msg}`)
      if (unifiedBgOpIdRef.current) failOp(unifiedBgOpIdRef.current, msg)
      unifiedBgOpIdRef.current = null
    } finally {
      // GOTCHA: Only reset if NOT polling — polling will reset when it completes
      if (sseCompleted || !unifiedPollIntervalRef.current) {
        unifiedGuardRef.current = false
        setIsGeneratingUnified(false)
      }
    }
  }, [subject, detectedDomain, addProgressLine, sendNotification, startOp, updateOp, completeOp, failOp, startUnifiedResultPolling])

  // Cleanup: stop unified polling on unmount
  useEffect(() => {
    return () => {
      if (unifiedPollIntervalRef.current) {
        clearInterval(unifiedPollIntervalRef.current)
        unifiedPollIntervalRef.current = null
      }
    }
  }, [])

  // ── Provider A/B comparison ──
  // INTENT: Fires N parallel requests to generate-provider (one per provider).
  // Each streams SSE independently. Results populate providerResults incrementally.
  // INTENT: Ref for AbortController so we can cancel in-flight provider requests
  // when user navigates away or starts a new comparison.
  const compareAbortRef = useRef<AbortController | null>(null)

  const handleCompareProviders = useCallback(async (providers: ABProvider[]) => {
    if (!activeProjectIdRef.current || providers.length === 0) return

    // SECURITY: Cancel any in-flight comparison to prevent resource waste
    if (compareAbortRef.current) {
      compareAbortRef.current.abort()
    }
    const abortController = new AbortController()
    compareAbortRef.current = abortController

    setIsComparingProviders(true)

    // Initialize all providers as generating
    const initial: Record<string, ProviderResult> = {}
    for (const p of providers) {
      initial[p] = { provider: p, status: "generating" }
    }
    setProviderResults(initial)

    // Fire all provider requests in parallel
    const promises = providers.map(async (provider) => {
      try {
        const response = await fetch("/api/cad-lab/generate-provider", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            projectId: activeProjectIdRef.current,
            provider,
          }),
          signal: abortController.signal,
        })

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({ error: "Unknown error" })) as { error?: string }
          throw new Error(errBody.error || `HTTP ${response.status}`)
        }

        if (response.body) {
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""

          while (true) {
            if (abortController.signal.aborted) {
              await reader.cancel()
              break
            }
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            // SECURITY: Guard against unbounded buffer accumulation
            if (buffer.length > 1_000_000) {
              console.warn(`[PROVIDER-${provider}] SSE buffer exceeded 1MB, aborting`)
              await reader.cancel()
              break
            }

            const messages = buffer.split("\n\n")
            buffer = messages.pop() ?? ""

            for (const msg of messages) {
              for (const line of msg.split("\n")) {
                if (!line.startsWith("data: ")) continue
                try {
                  const event = JSON.parse(line.slice(6)) as {
                    type: string
                    provider?: string
                    result?: ProviderResult
                    error?: string
                    message?: string
                  }
                  if (event.type === "provider_complete" && event.result) {
                    setProviderResults((prev) => ({ ...prev, [provider]: event.result as ProviderResult }))
                  } else if (event.type === "provider_progress" && event.message) {
                    // INTENT: Show progress messages to user during generation
                    setProviderResults((prev) => ({
                      ...prev,
                      [provider]: { ...prev[provider], provider, status: "generating", progressMessage: event.message },
                    }))
                  } else if (event.type === "provider_error") {
                    setProviderResults((prev) => ({
                      ...prev,
                      [provider]: { provider, status: "failed", error: event.error ?? "Unknown error" },
                    }))
                  }
                } catch { /* skip malformed SSE */ }
              }
            }
          }
        }
      } catch (err) {
        // Don't report abort errors as failures
        if (err instanceof DOMException && err.name === "AbortError") return
        const msg = err instanceof Error ? err.message : "Unknown error"
        setProviderResults((prev) => ({
          ...prev,
          [provider]: { provider, status: "failed", error: msg },
        }))
      }
    })

    await Promise.allSettled(promises)
    // Only update isComparing if this is still the active comparison
    if (compareAbortRef.current === abortController) {
      setIsComparingProviders(false)
    }
  }, [])

  // ── Tripo 3D Preview handler (Design tab 2D/3D toggle) ──
  const handleGenerateTripoPreview = useCallback(() => {
    const projectId = activeProjectIdRef.current
    if (!projectId || tripoPreviewStatus === "generating") return

    // If Tripo was already generated via Compare Providers, reuse it
    const existing = providerResults["tripo"]
    if (existing?.status === "completed" && existing.glbUrl) {
      setTripoPreviewUrl(existing.glbUrl)
      setTripoPreviewStatus("complete")
      setTripoPreviewError(null)
      return
    }

    // SECURITY: Prevent duplicate concurrent Tripo requests
    if (tripoGuardRef.current) return
    tripoGuardRef.current = true

    // Cancel any in-flight preview request
    if (tripoAbortRef.current) {
      tripoAbortRef.current.abort()
    }
    const abortController = new AbortController()
    tripoAbortRef.current = abortController

    setTripoPreviewStatus("generating")
    setTripoPreviewError(null)

    // Fire SSE request (async IIFE to keep the callback sync for useCallback)
    ;(async () => {
      try {
        const response = await fetch("/api/cad-lab/generate-provider", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({ projectId, provider: "tripo" }),
          signal: abortController.signal,
        })

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({ error: "Unknown error" }))
          throw new Error(errBody.error || `HTTP ${response.status}`)
        }

        if (response.body) {
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""

          while (true) {
            if (abortController.signal.aborted) {
              await reader.cancel()
              break
            }
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            if (buffer.length > 1_000_000) {
              console.warn("[TRIPO-PREVIEW] SSE buffer exceeded 1MB, aborting")
              await reader.cancel()
              break
            }

            const messages = buffer.split("\n\n")
            buffer = messages.pop() ?? ""

            for (const msg of messages) {
              for (const line of msg.split("\n")) {
                if (!line.startsWith("data: ")) continue
                try {
                  const event = JSON.parse(line.slice(6))
                  if (event.type === "provider_complete" && event.result?.glbUrl) {
                    setTripoPreviewUrl(event.result.glbUrl)
                    setTripoPreviewStatus("complete")
                  } else if (event.type === "provider_error") {
                    setTripoPreviewStatus("failed")
                    setTripoPreviewError(event.error ?? "Generation failed")
                  }
                } catch { /* skip malformed SSE */ }
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        const msg = err instanceof Error ? err.message : "Unknown error"
        setTripoPreviewStatus("failed")
        setTripoPreviewError(msg)
      } finally {
        tripoGuardRef.current = false
      }
    })()
  }, [providerResults, tripoPreviewStatus])

  // INTENT: Execute edited unified code on Modal — mirrors handleExecuteModuleCode but
  // updates unifiedResult/unifiedCode instead of per-module state.
  // GOTCHA: Uses functional update `setUnifiedResult(prev => ...)` to avoid stale closure —
  // reading `unifiedResult` directly would be stale if called in rapid succession.
  const handleExecuteUnifiedCode = useCallback(async (code: string) => {
    try {
      const res = await executeCadQueryAction(code)
      if (!res.success) {
        toast.error(res.error)
        return
      }

      const { result: modalRes } = res
      // INTENT: Capture updated result for DB persistence after state update
      let updatedResult: CadLabResult | null = null
      setUnifiedResult((prev) => {
        const existing = prev ?? {} as Partial<CadLabResult>
        const next = {
          ...existing,
          success: true as const,
          code,
          codeLines: code.split("\n").length,
          stlData: modalRes.stlData ?? (existing as CadLabResult).stlData,
          stepData: modalRes.stepData ?? (existing as CadLabResult).stepData,
          svgIso: modalRes.svgIso ?? (existing as CadLabResult).svgIso,
          svgTop: modalRes.svgTop ?? (existing as CadLabResult).svgTop,
          svgFront: modalRes.svgFront ?? (existing as CadLabResult).svgFront,
          svgBack: modalRes.svgBack ?? (existing as CadLabResult).svgBack,
          svgRight: modalRes.svgRight ?? (existing as CadLabResult).svgRight,
          svgLeft: modalRes.svgLeft ?? (existing as CadLabResult).svgLeft,
          svgExploded: modalRes.svgExploded ?? (existing as CadLabResult).svgExploded,
          bbox: modalRes.bbox ?? (existing as CadLabResult).bbox,
          massGrams: modalRes.massGrams ?? (existing as CadLabResult).massGrams,
          volumeMm3: modalRes.volumeMm3 ?? (existing as CadLabResult).volumeMm3,
          fillRatio: modalRes.fillRatio ?? (existing as CadLabResult).fillRatio,
          dfm: modalRes.dfm ?? (existing as CadLabResult).dfm,
        } as unknown as CadLabResult
        updatedResult = next
        return next
      })
      setUnifiedCode(code)
      toast.success("Code executed successfully")

      // Persist to DB (fire-and-forget — don't block UI)
      const pid = activeProjectIdRef.current
      if (pid && updatedResult) {
        const { stlData: _s, stepData: _t, ...withoutBinary } = updatedResult as CadLabResult
        saveCadLabUnifiedResult(pid, withoutBinary, code).catch((err) =>
          console.warn("[CAD-LAB] Failed to persist unified result:", err),
        )
      }
    } catch (err) {
      console.error("[CAD-LAB] Unified code execution failed:", err)
      toast.error(err instanceof Error ? err.message : "Code execution failed")
    }
  }, [])

  // INTENT: Refine unified code with natural language instruction.
  const handleRefineUnifiedCode = useCallback(async (
    currentCode: string,
    instruction: string,
  ): Promise<string | null> => {
    const res = await refineCadQueryCodeAction(currentCode, instruction, {
      name: subject || "Unified Product",
      purpose: "Complete product assembly",
      description: productOverviewRef.current || subject,
    })

    if (!res.success) {
      toast.error(res.error)
      return null
    }

    return res.code
  }, [subject])

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
    interviewPhase, setInterviewPhase,
    isResearching, researchResult, editableReport, setEditableReport,
    showSources, setShowSources, hasResearch, freshResearchRef,
    handleResearch, handleReset,
    researchModelUsed, decompositionModelUsed,
    isDecomposing, decompositionError, modules, setModules,
    expandedModuleId, setExpandedModuleId, generatingModuleIds,
    diagnosticAnswers, setDiagnosticAnswers, diagnosticEnrichment, aiPrefilled,
    handleDecompose, handleModuleGenerate, handleGenerateSingleModule, handleGenerateAllModules,
    isBatchRunning, batchProgress,
    isGeneratingImages, imageGenProgress, handleGenerateModuleImages, handleRefreshModuleImages,
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
    aiCostEstimates,
    isEstimatingCosts,
    costEstimationError,
    partCategoryOverrides,
    setPartCategoryOverride,
    clearPartCategoryOverride,
    decompositionConnections,
    interfaceContracts,
    isExtractingContracts,
    unmatchedPorts,
    moduleReviews,
    handleReviewComplete,
    pendingReviewKeys,
    markReviewPending,
    clearReviewPending,
    isApplyingReviewRevisions,
    handleApplyReviewRevisions,
    specifiedModuleCount,
    manufacturingOrderCount,
    refreshManufacturingOrderCount,
    isSpecificationComplete,
    projectReviewVerdicts,
    handleExecuteModuleCode,
    handleRefineModuleCode,
    unifiedResult,
    unifiedCode,
    isGeneratingUnified,
    handleGenerateUnifiedModel,
    handleExecuteUnifiedCode,
    handleRefineUnifiedCode,
    reviewSkipped,
    allModulesReviewed,
    handleSkipReviews,
    designRevision,
    imagesStale,
    isRegeneratingImages,
    markImagesCurrentManually,
    handleRegenerateDrawingsAfterRevision,
    reEstimateCosts,
    reExpandingModuleIds,
    handleReExpandModule,
    providerResults,
    isComparingProviders,
    handleCompareProviders,
    tripoPreviewUrl,
    tripoPreviewStatus,
    tripoPreviewError,
    handleGenerateTripoPreview,
    referenceImages,
    setReferenceImages,
    referenceDocuments,
    setReferenceDocuments,
    documentContext,
    initialized,
    initializeCadLab,
    handleDownload,
  }

  return <CadLabContext.Provider value={value}>{children}</CadLabContext.Provider>
}
