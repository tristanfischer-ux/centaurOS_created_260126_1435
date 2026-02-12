"use client"

/**
 * @file page.tsx — CAD Lab: Claude-powered parametric CAD generation.
 *
 * @description Three-step flow following CLAUDE_CAD_INSTRUCTIONS:
 *   Step 1: Research — web search + Claude synthesis → editable report
 *   Step 2: Interface Definition — Claude generates text-only engineering plan
 *   Step 3: Generate — Claude writes complete CadQuery code → Modal executes
 *
 * Not linked from navigation. Access via /the-forge/cad-lab (behind platform auth).
 */

import { useState, useCallback, useEffect, useRef } from "react"
import {
  Loader2,
  Code2,
  Box,
  Timer,
  Zap,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Globe,
  ExternalLink,
  Search,
  ArrowRight,
  RotateCcw,
  Copy,
  Check,
  Maximize2,
  Ruler,
  Download,
  Printer,
  Factory,
  Info,
  Save,
  FolderOpen,
  Plus,
  Trash2,
  Clock,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import {
  runCadLabResearch,
  generateCadLabInterface,
  generateCadLabModel,
  decomposeIntoModules,
} from "@/actions/cad-lab"
import {
  listCadLabProjects,
  loadCadLabProject,
  createCadLabProject,
  saveCadLabResearch,
  saveCadLabInterface,
  saveCadLabResult,
  saveCadLabModules,
  deleteCadLabProject,
} from "@/actions/cad-lab-projects"
import type { CadLabProjectSummary } from "@/actions/cad-lab-projects"
import { CLAUDE_MODELS } from "@/lib/cad-lab-types"
import { STLViewer } from "@/components/cad/stl-viewer"
import { Markdown } from "@/components/ui/markdown"
import { SECTOR_LABELS } from "@/types/foundry"
import type { Sector } from "@/types/foundry"

import { CadLabAnalysisDashboard } from "@/components/cad/cad-lab-analysis-dashboard"
import { CadLabTimeline } from "@/components/cad/cad-lab-timeline"
import { CadLabRiskRegister } from "@/components/cad/cad-lab-risk-register"
import { CadLabDiagnostics } from "@/components/cad/cad-lab-diagnostics"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import { CadLabReviewPackage } from "@/components/cad/cad-lab-review-package"
import { CadLabPeople } from "@/components/cad/cad-lab-people"
import { CadLabSupplyChain } from "@/components/cad/cad-lab-supply-chain"
import { CadLabContracting } from "@/components/cad/cad-lab-contracting"

import type {
  CadLabResult,
  CadLabResearchResult,
  CadLabInterfaceResult,
  CadLabModule,
  ClaudeModelId,
} from "@/lib/cad-lab-types"

export default function CadLabPage(): React.ReactNode {
  // ── Project persistence state ──
  const [projects, setProjects] = useState<CadLabProjectSummary[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [showProjects, setShowProjects] = useState(false)
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)

  // ── Foundry sector (for component library filtering) ──
  const [sector, setSector] = useState<Sector | null>(null)

  useEffect(() => {
    async function fetchSector(): Promise<void> {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('foundry_id')
          .eq('id', user.id)
          .single()
        if (!profile?.foundry_id) return

        const { data: foundry } = await supabase
          .from('foundries')
          .select('sector')
          .eq('id', profile.foundry_id)
          .single()

        if (foundry?.sector) setSector(foundry.sector as Sector)
      } catch {
        // Non-critical — sector badge won't display
      }
    }
    fetchSector()
  }, [])

  // ── Input state ──
  const [subject, setSubject] = useState("")
  const [modelId, setModelId] = useState<ClaudeModelId>("claude-opus-4-6")

  // ── Step 1: Research state ──
  const [isResearching, setIsResearching] = useState(false)
  const [researchResult, setResearchResult] = useState<CadLabResearchResult | null>(null)
  const [editableReport, setEditableReport] = useState("")
  const [showSources, setShowSources] = useState(false)

  // ── Step 2: Interface Definition state ──
  const [isGeneratingInterface, setIsGeneratingInterface] = useState(false)
  const [interfaceResult, setInterfaceResult] = useState<CadLabInterfaceResult | null>(null)
  const [editableInterface, setEditableInterface] = useState("")

  // ── Step 3: Generation state ──
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<CadLabResult | null>(null)
  const [showCode, setShowCode] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  // ── View state ──
  type ViewTab = "3d" | "iso" | "exploded" | "front" | "back" | "left" | "right" | "top"
  const [fullscreenView, setFullscreenView] = useState<string | null>(null)
  const [activeViewTab, setActiveViewTab] = useState<ViewTab>("3d")

  // ── Module decomposition state ──
  const [isDecomposing, setIsDecomposing] = useState(false)
  const [modules, setModules] = useState<CadLabModule[]>([])
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null)
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null)
  const [diagnosticAnswers, setDiagnosticAnswers] = useState<DiagnosticAnswers>({})

  // ── Project List: Load projects on mount ──
  const refreshProjects = useCallback(async () => {
    setIsLoadingProjects(true)
    try {
      const res = await listCadLabProjects()
      if ("projects" in res) {
        setProjects(res.projects)
      }
    } catch {
      // Non-critical — project list just won't load
    } finally {
      setIsLoadingProjects(false)
    }
  }, [])

  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])

  // ── Create or get project for auto-save ──
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
    try {
      const res = await decomposeIntoModules(subject, editableReport, modelId)
      if (res.success && res.modules.length > 0) {
        setModules(res.modules)
        // Auto-save modules
        if (activeProjectId) {
          await saveCadLabModules(activeProjectId, res.modules)
          setLastSaved(new Date().toISOString())
          refreshProjects()
        }
      }
    } catch (err) {
      console.error("[CAD-LAB] Decomposition failed:", err)
    } finally {
      setIsDecomposing(false)
    }
  }, [editableReport, subject, modelId, activeProjectId, refreshProjects])

  // ── Generate CAD for a specific module ──
  const handleModuleGenerate = useCallback(async (moduleId: string, step: "interface" | "generate") => {
    const mod = modules.find((m) => m.id === moduleId)
    if (!mod) return

    setActiveModuleId(moduleId)

    if (step === "interface") {
      // Generate interface definition for this module
      const moduleResearchText = mod.moduleResearch || `Module: ${mod.name}\nPurpose: ${mod.purpose}\nKey Parts: ${mod.keyParts.join(", ")}\nDescription: ${mod.description}\n\nFrom parent research:\n${editableReport}`

      try {
        const res = await generateCadLabInterface(
          `${mod.name} — ${mod.purpose}`,
          moduleResearchText,
          modelId,
        )
        if (res.success) {
          setModules((prev) =>
            prev.map((m) =>
              m.id === moduleId
                ? { ...m, interfaceDefinition: res.interfaceDefinition, status: "interface_ready" as const }
                : m,
            ),
          )
          // Auto-save
          if (activeProjectId) {
            const updatedModules = modules.map((m) =>
              m.id === moduleId
                ? { ...m, interfaceDefinition: res.interfaceDefinition, status: "interface_ready" as const }
                : m,
            )
            await saveCadLabModules(activeProjectId, updatedModules)
            setLastSaved(new Date().toISOString())
          }
        }
      } catch (err) {
        console.error("[CAD-LAB] Module interface generation failed:", err)
      }
    } else if (step === "generate") {
      // Generate CadQuery code for this module
      const moduleResearchText = mod.moduleResearch || `Module: ${mod.name}\nPurpose: ${mod.purpose}\nKey Parts: ${mod.keyParts.join(", ")}\nDescription: ${mod.description}\n\nFrom parent research:\n${editableReport}`

      try {
        const res = await generateCadLabModel(
          `${mod.name} — ${mod.purpose}`,
          moduleResearchText,
          mod.interfaceDefinition || "",
          modelId,
        )
        // Strip binary data for module storage
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { stlData, stepData, ...resultWithoutBinary } = res
        setModules((prev) =>
          prev.map((m) =>
            m.id === moduleId
              ? { ...m, result: resultWithoutBinary, code: res.code, status: "generated" as const }
              : m,
          ),
        )
        // Auto-save
        if (activeProjectId) {
          const updatedModules = modules.map((m) =>
            m.id === moduleId
              ? { ...m, result: resultWithoutBinary, code: res.code, status: "generated" as const }
              : m,
          )
          await saveCadLabModules(activeProjectId, updatedModules)
          setLastSaved(new Date().toISOString())
        }
      } catch (err) {
        console.error("[CAD-LAB] Module CAD generation failed:", err)
      }
    }

    setActiveModuleId(null)
  }, [modules, editableReport, modelId, activeProjectId])

  // ── Step 1: Research ──
  const handleResearch = useCallback(async () => {
    setIsResearching(true)
    setResearchResult(null)
    setInterfaceResult(null)
    setResult(null)
    setEditableReport("")
    setEditableInterface("")
    try {
      const res = await runCadLabResearch(subject)
      setResearchResult(res)
      setEditableReport(res.report)

      // Auto-save: create project if needed, then save research
      if (res.success) {
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
  }, [subject, ensureProject, refreshProjects])

  // ── Step 2: Interface Definition ──
  const handleGenerateInterface = useCallback(async () => {
    setIsGeneratingInterface(true)
    setInterfaceResult(null)
    setResult(null)
    setEditableInterface("")
    try {
      const res = await generateCadLabInterface(subject, editableReport, modelId)
      setInterfaceResult(res)
      setEditableInterface(res.interfaceDefinition)

      // Auto-save interface definition
      if (res.success && activeProjectId) {
        setIsSaving(true)
        await saveCadLabInterface(activeProjectId, res.interfaceDefinition)
        setLastSaved(new Date().toISOString())
        setIsSaving(false)
      }
    } catch (err) {
      setInterfaceResult({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
        interfaceDefinition: "",
        generationTime: 0,
        tokensIn: 0,
        tokensOut: 0,
      })
    } finally {
      setIsGeneratingInterface(false)
    }
  }, [subject, editableReport, modelId, activeProjectId])

  // ── Step 3: Generate Code + Execute ──
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    setResult(null)
    try {
      const res = await generateCadLabModel(
        subject,
        editableReport,
        editableInterface,
        modelId,
      )
      setResult(res)

      // Auto-save generation result
      if (activeProjectId) {
        setIsSaving(true)
        await saveCadLabResult(activeProjectId, res)
        setLastSaved(new Date().toISOString())
        setIsSaving(false)
        refreshProjects()
      }
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      })
    } finally {
      setIsGenerating(false)
    }
  }, [subject, editableReport, editableInterface, modelId, activeProjectId, refreshProjects])

  // ── Copy code to clipboard ──
  const handleCopyCode = useCallback(async () => {
    if (!result?.code) return
    try {
      await navigator.clipboard.writeText(result.code)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy code:", err)
    }
  }, [result?.code])

  // ── Reset ──
  const handleReset = useCallback(() => {
    setResearchResult(null)
    setInterfaceResult(null)
    setResult(null)
    setEditableReport("")
    setEditableInterface("")
    setActiveProjectId(null)
    setLastSaved(null)
    setModules([])
    setExpandedModuleId(null)
    setActiveModuleId(null)
    setDiagnosticAnswers({})
  }, [])

  // ── Load a saved project ──
  const handleLoadProject = useCallback(async (projectId: string) => {
    try {
      const res = await loadCadLabProject(projectId)
      if ("error" in res) return

      const p = res.project

      // Restore all state from the loaded project
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

      if (p.interfaceDefinition) {
        setInterfaceResult({
          success: true,
          interfaceDefinition: p.interfaceDefinition,
          generationTime: 0,
          tokensIn: 0,
          tokensOut: 0,
        })
        setEditableInterface(p.interfaceDefinition)
      } else {
        setInterfaceResult(null)
        setEditableInterface("")
      }

      if (p.result) {
        setResult(p.result as CadLabResult)
      } else {
        setResult(null)
      }

      if (p.modules && p.modules.length > 0) {
        setModules(p.modules)
      } else {
        setModules([])
      }

      setLastSaved(p.updatedAt)
      setShowProjects(false)
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

  const hasResearch = researchResult?.success && editableReport.trim().length > 0
  const hasInterface = interfaceResult?.success && editableInterface.trim().length > 0
  const isAnyLoading = isResearching || isGeneratingInterface || isGenerating || isDecomposing

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-muted">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 rounded-full bg-international-orange" />
            <h1 className="text-2xl font-bold text-foreground">CAD Lab</h1>
            <span className="text-xs font-mono bg-muted text-muted-foreground px-2 py-1 rounded">
              CLAUDE PIPELINE
            </span>
            {sector && (
              <span className="flex items-center gap-1.5 text-xs font-medium bg-international-orange-light text-international-orange px-2.5 py-1 rounded">
                <Factory className="h-3 w-3" />
                {SECTOR_LABELS[sector]} components active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Save status indicator */}
            {activeProjectId && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {isSaving ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Saving...</>
                ) : lastSaved ? (
                  <><Save className="h-3 w-3 text-status-success" /> Saved</>
                ) : null}
              </span>
            )}
            <Button
              variant={showProjects ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setShowProjects(!showProjects)
                if (!showProjects) refreshProjects()
              }}
              className="gap-1.5"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Projects{projects.length > 0 ? ` (${projects.length})` : ""}
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Research → Interface Definition → Generate. Following the CadQuery methodology exactly.
        </p>
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Component properties are engineering estimates from training data. Verify critical values against manufacturer datasheets.</span>
        </div>
      </div>

      {/* Project list panel */}
      {showProjects && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Saved Projects
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  handleReset()
                  setShowProjects(false)
                }}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                New Project
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingProjects ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : projects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No saved projects yet. Start researching a product and it will be saved automatically.
              </p>
            ) : (
              <div className="space-y-2">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className={`flex items-center justify-between p-3 rounded-md border cursor-pointer transition-colors hover:bg-muted/50 ${
                      activeProjectId === project.id ? "border-international-orange bg-international-orange-light/30" : "border-muted"
                    }`}
                    onClick={() => handleLoadProject(project.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {project.name}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                          project.status === "generated"
                            ? "bg-status-success-light text-status-success"
                            : project.status === "interface_ready"
                              ? "bg-status-info-light text-status-info"
                              : project.status === "researched"
                                ? "bg-status-warning-light text-status-warning"
                                : "bg-muted text-muted-foreground"
                        }`}>
                          {project.status.replace("_", " ")}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(project.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteProject(project.id)
                      }}
                      aria-label="Delete project"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Model selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="subject">What do you want to model?</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Nespresso capsule auto-reloader, DJI Mavic Air 2 drone"
                disabled={isAnyLoading}
              />
            </div>
            <div className="w-64 space-y-2">
              <Label htmlFor="model">Claude Model</Label>
              <select
                id="model"
                value={modelId}
                onChange={(e) => setModelId(e.target.value as ClaudeModelId)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={isAnyLoading}
              >
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* STEP 1: RESEARCH                                               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Step 1: Research Real Dimensions
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
              onClick={handleResearch}
              disabled={isAnyLoading || !subject.trim()}
              variant={hasResearch ? "secondary" : "default"}
            >
              {isResearching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Researching...
                </>
              ) : hasResearch ? (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Re-Research
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Research Product
                </>
              )}
            </Button>
            {hasResearch && (
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Start Over
              </Button>
            )}
          </div>

          {/* Research error */}
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
            {/* Formatted markdown display */}
            <div className="border rounded-md p-4 bg-muted/30">
              <Markdown content={editableReport} className="text-sm text-foreground" />
            </div>

            {/* Editable textarea (collapsible) */}
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

      {/* ── Research Sources (expandable) ── */}
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
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Web Sources
                  </p>
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

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODULE DECOMPOSITION (optional, after research)                */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {hasResearch && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Box className="h-4 w-4" />
              Module Decomposition
              {modules.length > 0 && (
                <span className="text-xs font-normal text-status-success flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {modules.length} modules
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Break this product into physical sub-assemblies. Each module can then be modelled separately with its own CAD pipeline.
            </p>
            <Button
              onClick={handleDecompose}
              disabled={isAnyLoading || isDecomposing || !hasResearch}
              variant={modules.length > 0 ? "secondary" : "outline"}
            >
              {isDecomposing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Decomposing...
                </>
              ) : modules.length > 0 ? (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Re-decompose
                </>
              ) : (
                <>
                  <Box className="h-4 w-4 mr-2" />
                  Decompose into Modules
                </>
              )}
            </Button>

            {/* Module list */}
            {modules.length > 0 && (
              <div className="space-y-2 mt-4">
                {modules.map((mod) => (
                  <div
                    key={mod.id}
                    className="border rounded-md overflow-hidden"
                  >
                    {/* Module header (always visible) */}
                    <button
                      onClick={() => setExpandedModuleId(expandedModuleId === mod.id ? null : mod.id)}
                      className="flex items-center justify-between w-full p-3 text-left hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
                          mod.status === "generated"
                            ? "bg-status-success"
                            : mod.status === "interface_ready"
                              ? "bg-status-info"
                              : "bg-muted-foreground"
                        }`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{mod.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{mod.purpose}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">{mod.leadWeeks}w lead</span>
                        <span className="text-xs font-mono text-muted-foreground">{mod.keyParts.length} parts</span>
                        {expandedModuleId === mod.id ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Expanded module detail */}
                    {expandedModuleId === mod.id && (
                      <div className="border-t p-4 space-y-4 bg-muted/20">
                        {/* Description */}
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</p>
                          <p className="text-sm text-foreground">{mod.description}</p>
                        </div>

                        {/* IO Flow */}
                        <div className="flex items-center gap-4 text-xs">
                          <div>
                            <p className="font-semibold text-muted-foreground mb-1">Inputs</p>
                            {mod.inputs.map((inp, i) => (
                              <span key={i} className="inline-block bg-muted px-2 py-0.5 rounded mr-1 mb-1 font-mono">{inp}</span>
                            ))}
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <p className="font-semibold text-muted-foreground mb-1">Outputs</p>
                            {mod.outputs.map((out, i) => (
                              <span key={i} className="inline-block bg-muted px-2 py-0.5 rounded mr-1 mb-1 font-mono">{out}</span>
                            ))}
                          </div>
                        </div>

                        {/* Key Parts */}
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Key Components</p>
                          <div className="flex flex-wrap gap-1.5">
                            {mod.keyParts.map((part, i) => (
                              <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                                {part}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Risks & Unknowns */}
                        {(mod.failureModes.length > 0 || mod.unknowns.length > 0) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {mod.failureModes.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Failure Modes</p>
                                <ul className="space-y-1">
                                  {mod.failureModes.map((fm, i) => (
                                    <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                                      <AlertTriangle className="h-3 w-3 text-status-warning flex-shrink-0 mt-0.5" />
                                      {fm}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {mod.unknowns.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Unknowns</p>
                                <ul className="space-y-1">
                                  {mod.unknowns.map((u, i) => (
                                    <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                                      <Info className="h-3 w-3 text-status-info flex-shrink-0 mt-0.5" />
                                      {u}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Module CAD pipeline actions */}
                        <div className="flex items-center gap-2 pt-2 border-t border-muted">
                          {mod.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleModuleGenerate(mod.id, "interface")}
                              disabled={activeModuleId !== null}
                            >
                              {activeModuleId === mod.id ? (
                                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Generating Interface...</>
                              ) : (
                                <><Ruler className="h-3.5 w-3.5 mr-1.5" /> Generate Interface</>
                              )}
                            </Button>
                          )}
                          {mod.status === "interface_ready" && (
                            <>
                              <span className="text-xs text-status-success flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Interface ready
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleModuleGenerate(mod.id, "generate")}
                                disabled={activeModuleId !== null}
                              >
                                {activeModuleId === mod.id ? (
                                  <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Generating CAD...</>
                                ) : (
                                  <><ArrowRight className="h-3.5 w-3.5 mr-1.5" /> Generate CAD</>
                                )}
                              </Button>
                            </>
                          )}
                          {mod.status === "generated" && (
                            <span className="text-xs text-status-success flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> CAD generated
                              {mod.result?.bbox && (
                                <span className="text-muted-foreground ml-2">
                                  {mod.result.bbox.xLen}×{mod.result.bbox.yLen}×{mod.result.bbox.zLen}mm
                                </span>
                              )}
                            </span>
                          )}
                        </div>

                        {/* Module interface definition (if generated) */}
                        {mod.interfaceDefinition && (
                          <details className="border rounded-md">
                            <summary className="cursor-pointer p-2 text-xs font-medium hover:bg-muted/50 transition-colors">
                              View interface definition
                            </summary>
                            <div className="p-3 border-t">
                              <pre className="text-xs font-mono whitespace-pre-wrap text-foreground">
                                {mod.interfaceDefinition}
                              </pre>
                            </div>
                          </details>
                        )}

                        {/* Module SVG preview (if generated) */}
                        {mod.result?.svgIso && (
                          <div className="bg-muted rounded-lg p-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={mod.result.svgIso} alt={`${mod.name} isometric view`} className="w-full" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ENGINEERING ANALYSIS (after modules, shows generated metrics)   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {modules.length > 0 && (
        <CadLabAnalysisDashboard
          modules={modules}
          projectName={subject}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* PROJECT TIMELINE (Gantt-style lead time visualization)          */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {modules.length > 0 && (
        <CadLabTimeline modules={modules} />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* RISK REGISTER (failure modes, unknowns, DFM issues)            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {modules.length > 0 && (
        <CadLabRiskRegister modules={modules} />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ENGINEERING DIAGNOSTICS (gating questionnaire per module)       */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {modules.length > 0 && (
        <CadLabDiagnostics
          modules={modules}
          answers={diagnosticAnswers}
          onAnswersChange={setDiagnosticAnswers}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* REVIEW PACKAGE (engineering summary document)                   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {modules.length > 0 && (
        <CadLabReviewPackage
          modules={modules}
          projectName={subject}
          researchReport={editableReport}
          diagnosticAnswers={diagnosticAnswers}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* PEOPLE MATCHING (expert disciplines per module)                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {modules.length > 0 && (
        <CadLabPeople
          modules={modules}
          diagnosticAnswers={diagnosticAnswers}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* SUPPLY CHAIN (manufacturing requirements per module)            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {modules.length > 0 && (
        <CadLabSupplyChain
          modules={modules}
          diagnosticAnswers={diagnosticAnswers}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* CONTRACTING (RFQ, SOW, NDA generation)                         */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {modules.length > 0 && (
        <CadLabContracting
          modules={modules}
          projectName={subject}
          diagnosticAnswers={diagnosticAnswers}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* STEP 2: INTERFACE DEFINITION                                   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {hasResearch && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Ruler className="h-4 w-4" />
              Step 2: Interface Definition
              {interfaceResult?.success && (
                <span className="text-xs font-normal text-status-success flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Complete ({(interfaceResult.generationTime / 1000).toFixed(1)}s)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This is the most important step. Text-only engineering plan: space budget, component placement,
              connection map, and validation checklist. No code yet.
            </p>
            <Button
              onClick={handleGenerateInterface}
              disabled={isAnyLoading || !hasResearch}
              variant={hasInterface ? "secondary" : "default"}
            >
              {isGeneratingInterface ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Generating Interface Definition...
                </>
              ) : hasInterface ? (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Regenerate Interface
                </>
              ) : (
                <>
                  <Ruler className="h-4 w-4 mr-2" />
                  Generate Interface Definition
                </>
              )}
            </Button>

            {/* Interface error */}
            {interfaceResult && !interfaceResult.success && interfaceResult.error && (
              <div className="p-3 bg-status-error-light rounded text-sm text-destructive font-mono">
                {interfaceResult.error}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Interface Definition (editable) ── */}
      {hasInterface && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Interface Definition
              <span className="text-xs font-normal text-muted-foreground">
                (review — if the numbers don't add up in text, they won't add up in 3D)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Formatted display */}
            <div className="border rounded-md p-4 bg-muted/30">
              <pre className="text-xs font-mono whitespace-pre-wrap text-foreground">
                {editableInterface}
              </pre>
            </div>

            {/* Editable (collapsible) */}
            <details className="border rounded-md">
              <summary className="cursor-pointer p-3 text-sm font-medium hover:bg-muted/50 transition-colors">
                Edit interface definition
              </summary>
              <div className="p-3 border-t">
                <Textarea
                  value={editableInterface}
                  onChange={(e) => setEditableInterface(e.target.value)}
                  className="font-mono text-xs min-h-[400px]"
                  disabled={isAnyLoading}
                />
              </div>
            </details>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* STEP 3: GENERATE                                               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {hasInterface && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              Step 3: Generate CadQuery Code
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Claude generates the complete CadQuery script in a single pass, then Modal executes it
              to produce STEP + STL + SVG exports.
            </p>
            <Button
              onClick={handleGenerate}
              disabled={isAnyLoading || !hasInterface}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Generating + Executing (~60s)...
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Generate Model
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* RESULTS                                                        */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {result && (
        <div className="space-y-6">
          {/* Error */}
          {result.error && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-sm text-destructive font-mono whitespace-pre-wrap">
                  {result.error}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Validation warnings */}
          {result.validationWarnings && result.validationWarnings.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="p-3 bg-status-warning-light rounded text-xs font-mono text-status-warning-dark space-y-1">
                  <p className="font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Post-execution warnings:
                  </p>
                  {result.validationWarnings.map((w, i) => (
                    <p key={i}>- {w}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Views (3D + 2D Projections) */}
          {(result.stlData || result.svgIso || result.svgFront || result.svgTop) && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Box className="h-4 w-4" />
                    Views
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {result.stepData && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload("model.step", result.stepData!, false)}
                        className="gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        STEP
                      </Button>
                    )}
                    {result.stlData && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload("model.stl", result.stlData!)}
                        className="gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        STL
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFullscreenView(activeViewTab)}
                      className="gap-1.5"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                      Fullscreen
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={activeViewTab} onValueChange={(v) => setActiveViewTab(v as ViewTab)}>
                  <TabsList className="flex w-full overflow-x-auto">
                    {result.stlData && <TabsTrigger value="3d" className="flex-1">3D Model</TabsTrigger>}
                    {result.svgIso && <TabsTrigger value="iso" className="flex-1">Isometric</TabsTrigger>}
                    {result.svgExploded && <TabsTrigger value="exploded" className="flex-1">Exploded</TabsTrigger>}
                    {result.svgFront && <TabsTrigger value="front" className="flex-1">Front</TabsTrigger>}
                    {result.svgBack && <TabsTrigger value="back" className="flex-1">Back</TabsTrigger>}
                    {result.svgLeft && <TabsTrigger value="left" className="flex-1">Left</TabsTrigger>}
                    {result.svgRight && <TabsTrigger value="right" className="flex-1">Right</TabsTrigger>}
                    {result.svgTop && <TabsTrigger value="top" className="flex-1">Top</TabsTrigger>}
                  </TabsList>

                  {result.stlData && (
                    <TabsContent value="3d" className="mt-4">
                      <div className="h-[500px] bg-muted/30 rounded-lg overflow-hidden">
                        <STLViewer stlData={result.stlData} />
                      </div>
                    </TabsContent>
                  )}

                  {result.svgIso && (
                    <TabsContent value="iso" className="mt-4">
                      <SvgView src={result.svgIso} alt="Isometric view" onClick={() => setFullscreenView("iso")} />
                    </TabsContent>
                  )}

                  {result.svgExploded && (
                    <TabsContent value="exploded" className="mt-4">
                      <SvgView src={result.svgExploded} alt="Exploded isometric view" onClick={() => setFullscreenView("exploded")} />
                    </TabsContent>
                  )}

                  {result.svgFront && (
                    <TabsContent value="front" className="mt-4">
                      <SvgView src={result.svgFront} alt="Front view" onClick={() => setFullscreenView("front")} />
                    </TabsContent>
                  )}

                  {result.svgBack && (
                    <TabsContent value="back" className="mt-4">
                      <SvgView src={result.svgBack} alt="Back view" onClick={() => setFullscreenView("back")} />
                    </TabsContent>
                  )}

                  {result.svgLeft && (
                    <TabsContent value="left" className="mt-4">
                      <SvgView src={result.svgLeft} alt="Left view" onClick={() => setFullscreenView("left")} />
                    </TabsContent>
                  )}

                  {result.svgRight && (
                    <TabsContent value="right" className="mt-4">
                      <SvgView src={result.svgRight} alt="Right view" onClick={() => setFullscreenView("right")} />
                    </TabsContent>
                  )}

                  {result.svgTop && (
                    <TabsContent value="top" className="mt-4">
                      <SvgView src={result.svgTop} alt="Top view" onClick={() => setFullscreenView("top")} />
                    </TabsContent>
                  )}
                </Tabs>
              </CardContent>
            </Card>
          )}

          {/* Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {result.bbox && (
                  <Metric
                    icon={<Box className="h-3.5 w-3.5" />}
                    label="Bounding Box"
                    value={`${result.bbox.xLen} × ${result.bbox.yLen} × ${result.bbox.zLen} mm`}
                  />
                )}
                {result.stepSize != null && (
                  <Metric
                    icon={<Box className="h-3.5 w-3.5" />}
                    label="STEP Size"
                    value={result.stepSize > 1024 ? `${(result.stepSize / 1024).toFixed(1)} MB` : `${result.stepSize} KB`}
                  />
                )}
                {result.stlSize != null && (
                  <Metric
                    icon={<Box className="h-3.5 w-3.5" />}
                    label="STL Size"
                    value={result.stlSize > 1024 ? `${(result.stlSize / 1024).toFixed(1)} MB` : `${result.stlSize} KB`}
                  />
                )}
                {result.fillRatio != null && (
                  <Metric label="Fill Ratio" value={`${result.fillRatio}%`} />
                )}
                {result.massGrams != null && (
                  <Metric label="Mass" value={`${result.massGrams} g`} />
                )}
                {result.codeLines != null && (
                  <Metric
                    icon={<Code2 className="h-3.5 w-3.5" />}
                    label="Code Lines"
                    value={`${result.codeLines}`}
                  />
                )}
                {result.modelUsed && (
                  <Metric label="Model" value={result.modelUsed.replace("claude-", "").replace(/-\d+$/, "")} />
                )}
                {result.generationTime != null && (
                  <Metric
                    icon={<Timer className="h-3.5 w-3.5" />}
                    label="Pipeline Time"
                    value={`${(result.generationTime / 1000).toFixed(1)}s`}
                  />
                )}
                {result.modalTime != null && (
                  <Metric
                    icon={<Timer className="h-3.5 w-3.5" />}
                    label="Modal Time"
                    value={`${(result.modalTime / 1000).toFixed(1)}s`}
                  />
                )}
                {result.tokensIn != null && (
                  <Metric label="Tokens In" value={`${result.tokensIn.toLocaleString()}`} />
                )}
                {result.tokensOut != null && (
                  <Metric label="Tokens Out" value={`${result.tokensOut.toLocaleString()}`} />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Manufacturability Analysis */}
          {result.dfm && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  Manufacturability (DFM)
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${result.dfm.printable ? "bg-status-success-light text-status-success" : "bg-status-error-light text-destructive"}`}>
                    {result.dfm.printable ? "PRINTABLE" : "NOT PRINTABLE"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Metric
                    icon={<Timer className="h-3.5 w-3.5" />}
                    label="Est. Print Time"
                    value={result.dfm.estimatedPrintTimeMin > 60
                      ? `${(result.dfm.estimatedPrintTimeMin / 60).toFixed(1)} hrs`
                      : `${result.dfm.estimatedPrintTimeMin} min`
                    }
                  />
                  <Metric
                    label="Est. Material"
                    value={`${result.dfm.estimatedMaterialG} g`}
                  />
                  <Metric
                    label="Support Volume"
                    value={`~${result.dfm.supportVolumePct}%`}
                  />
                  {result.massProperties && (
                    <Metric
                      label="Surface Area"
                      value={result.massProperties.surfaceAreaMm2 > 0
                        ? `${Math.round(result.massProperties.surfaceAreaMm2).toLocaleString()} mm²`
                        : "N/A"
                      }
                    />
                  )}
                </div>

                {result.dfm.compatiblePrinters.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Compatible Printers</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.dfm.compatiblePrinters.map((printer) => (
                        <span
                          key={printer}
                          className="text-xs font-mono bg-muted px-2 py-0.5 rounded"
                        >
                          {printer}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {result.massProperties && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Center of Gravity</p>
                    <p className="text-xs font-mono text-foreground">
                      ({result.massProperties.centerOfGravity[0].toFixed(1)}, {result.massProperties.centerOfGravity[1].toFixed(1)}, {result.massProperties.centerOfGravity[2].toFixed(1)}) mm
                    </p>
                  </div>
                )}

                {result.dfm.issues.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Issues</p>
                    {result.dfm.issues.map((issue, i) => (
                      <div
                        key={i}
                        className={`p-2 rounded text-xs font-mono ${
                          issue.severity === "critical"
                            ? "bg-status-error-light text-destructive"
                            : issue.severity === "warning"
                              ? "bg-status-warning-light text-status-warning-dark"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <span className="font-semibold uppercase">{issue.severity}:</span> {issue.message}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Code */}
          {result.code && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Code2 className="h-4 w-4" />
                    Generated CadQuery Code
                    <span className="text-xs font-normal text-muted-foreground">
                      ({result.codeLines} lines)
                    </span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyCode}
                      className="gap-1.5"
                    >
                      {codeCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </>
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowCode(!showCode)}>
                      {showCode ? "Hide" : "Show"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {showCode && (
                <CardContent>
                  <pre className="text-xs font-mono bg-muted p-4 rounded-lg overflow-auto max-h-[500px] whitespace-pre-wrap">
                    {result.code}
                  </pre>
                </CardContent>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ── Fullscreen overlay ── */}
      {fullscreenView && result && (
        <FullscreenOverlay
          view={fullscreenView}
          result={result}
          onClose={() => setFullscreenView(null)}
        />
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Formats an ISO timestamp into a human-readable relative time string.
 *
 * @param isoDate - ISO 8601 timestamp
 * @returns Relative time string (e.g., "2 hours ago", "yesterday")
 */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString()
}

// ─── Sub-components ──────────────────────────────────────────────────

/**
 * Metric — displays a labeled value in the metrics grid.
 */
function Metric({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: string
}): React.ReactNode {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-sm font-semibold text-foreground font-mono">{value}</p>
    </div>
  )
}

/**
 * InlineSvg — decodes a base64 SVG data URI, renders it inline,
 * and refits the viewBox using the browser's native bounding-box computation.
 *
 * @description Fixes CadQuery's SVG exporter which often produces SVGs with
 * incorrect viewBoxes (content stuck in a corner of a large canvas). Uses
 * getBBox() on individual drawing elements for pixel-perfect content detection,
 * skipping background rects that would throw off the calculation.
 *
 * @param src - base64 SVG data URI (data:image/svg+xml;base64,...)
 * @param alt - accessible label for the image
 * @param className - container CSS classes
 * @param onClick - optional click handler
 */
function InlineSvg({
  src,
  alt,
  className,
  onClick,
}: {
  src: string
  alt: string
  className?: string
  onClick?: (e: React.MouseEvent) => void
}): React.ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Decode base64 data URI → raw SVG string
    const base64Match = src.match(/^data:image\/svg\+xml;base64,(.+)$/)
    if (!base64Match) {
      container.innerHTML = ""
      return
    }

    let decoded: string
    try {
      decoded = atob(base64Match[1])
    } catch {
      container.innerHTML = ""
      return
    }

    // Parse SVG via DOMParser
    const parser = new DOMParser()
    const doc = parser.parseFromString(decoded, "image/svg+xml")
    const parsedSvg = doc.documentElement

    // Abort if parse failed or result isn't SVG
    if (parsedSvg.querySelector("parsererror") || parsedSvg.tagName !== "svg") {
      container.innerHTML = ""
      return
    }

    // SECURITY: Remove any script elements
    parsedSvg.querySelectorAll("script").forEach((s) => s.remove())

    // Insert into container (hidden until viewBox is corrected)
    container.innerHTML = ""
    const svgNode = document.importNode(parsedSvg, true) as unknown as SVGSVGElement
    svgNode.style.width = "100%"
    svgNode.style.height = "100%"
    svgNode.style.opacity = "0"
    svgNode.setAttribute("preserveAspectRatio", "xMidYMid meet")
    container.appendChild(svgNode)

    // Refit viewBox using the browser's native bounding-box computation.
    // Double-rAF ensures the SVG is fully laid out before measuring.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          // Compute tight bounding box from drawing elements only.
          // Skip <rect> which may be a background fill that would
          // encompass the entire canvas and defeat the purpose.
          const drawingEls = svgNode.querySelectorAll(
            "path, line, circle, polyline, polygon, ellipse"
          )
          let minX = Infinity
          let minY = Infinity
          let maxX = -Infinity
          let maxY = -Infinity
          let hasContent = false

          drawingEls.forEach((el) => {
            try {
              const bbox = (el as SVGGraphicsElement).getBBox()
              if (bbox.width > 0 || bbox.height > 0) {
                minX = Math.min(minX, bbox.x)
                minY = Math.min(minY, bbox.y)
                maxX = Math.max(maxX, bbox.x + bbox.width)
                maxY = Math.max(maxY, bbox.y + bbox.height)
                hasContent = true
              }
            } catch {
              // Individual element getBBox can fail if not rendered
            }
          })

          if (hasContent) {
            const contentW = maxX - minX
            const contentH = maxY - minY
            if (contentW > 0.01 && contentH > 0.01) {
              const padX = contentW * 0.1
              const padY = contentH * 0.1
              svgNode.setAttribute(
                "viewBox",
                `${minX - padX} ${minY - padY} ${contentW + 2 * padX} ${contentH + 2 * padY}`
              )
            }
          }
        } catch {
          // Leave viewBox as-is if measurement fails
        }

        // Reveal the SVG now that viewBox is corrected
        svgNode.style.opacity = "1"
        svgNode.style.transition = "opacity 150ms ease-in"
      })
    })

    return () => {
      container.innerHTML = ""
    }
  }, [src])

  return (
    <div
      ref={containerRef}
      className={className}
      onClick={onClick}
      role="img"
      aria-label={alt}
    />
  )
}

/**
 * SvgView — renders an SVG engineering drawing in a clickable container.
 *
 * @description Wrapper around InlineSvg for orthographic/isometric SVG views.
 * Clicking opens the fullscreen overlay.
 */
function SvgView({
  src,
  alt,
  onClick,
}: {
  src: string
  alt: string
  onClick: () => void
}): React.ReactNode {
  return (
    <InlineSvg
      src={src}
      alt={alt}
      className="bg-muted/30 rounded-lg p-4 h-[500px] cursor-pointer hover:opacity-90 transition-opacity"
      onClick={onClick}
    />
  )
}

/**
 * FullscreenOverlay — renders a full-viewport overlay for any view tab.
 *
 * @description Supports 3D STL viewer and all SVG orthographic views.
 * Maps view name to the corresponding SVG data URI from the result.
 */
function FullscreenOverlay({
  view,
  result,
  onClose,
}: {
  view: string
  result: CadLabResult
  onClose: () => void
}): React.ReactNode {
  /** Map of SVG view names to their data URIs */
  const svgMap: Record<string, string | undefined> = {
    iso: result.svgIso,
    exploded: result.svgExploded,
    front: result.svgFront,
    back: result.svgBack,
    left: result.svgLeft,
    right: result.svgRight,
    top: result.svgTop,
  }

  const svgSrc = svgMap[view]

  return (
    <div
      className="fixed inset-0 z-50 bg-background/95 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors text-sm font-mono"
        onClick={onClose}
      >
        ESC to close
      </button>
      {view === "3d" && result.stlData ? (
        <div className="w-full h-full" onClick={(e) => e.stopPropagation()}>
          <STLViewer stlData={result.stlData} />
        </div>
      ) : svgSrc ? (
        <InlineSvg
          src={svgSrc}
          alt={`${view} view`}
          className="w-full h-full"
        />
      ) : null}
    </div>
  )
}
