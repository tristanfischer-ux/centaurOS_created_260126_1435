"use client"

/**
 * @file red-team-view.tsx — Red Team Debate UI with SSE streaming (v2)
 *
 * @description Interactive page for launching and viewing multi-LLM debates.
 * Connects to /api/red-team/generate via EventSource for real-time streaming.
 * Includes: interactive debate with user interjections between rounds,
 * health pre-check, cost display, evidence tooltips, comparison view,
 * debate history, real action creation, and DOCX export.
 */

import { useState, useCallback, useEffect, useRef, useMemo, Fragment } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Swords,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileDown,
  Plus,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Target,
  ListChecks,
  ShieldAlert,
  History,
  Clock,
  DollarSign,
  Send,
  SkipForward,
  GitCompareArrows,
  X,
  Wifi,
  WifiOff,
} from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { DEBATE_PERSONAS } from "@/lib/red-team/prompts"
import { listRedTeamDebates, loadRedTeamDebate, createRedTeamActions, checkStrategicMatch, createNewStrategicObjective } from "@/actions/red-team-debate"
import type {
  RedTeamDebateDocument,
  DebateRound,
  FactCheck,
  DebateRole,
} from "@/lib/red-team/types"
import type { DebateHistoryItem } from "@/actions/red-team-debate"
import { SpecialistBriefingHero } from '@/components/specialists/specialist-briefing-hero'

// ─── Constants ──────────────────────────────────────────────────

const ROLE_COLORS: Record<DebateRole, string> = {
  bull: "border-success/30 bg-success/5",
  bear: "border-destructive/30 bg-destructive/5",
  realist: "border-electric-blue/30 bg-electric-blue/5",
  disruptor: "border-warning/30 bg-warning/5",
  wildcard: "border-info/30 bg-info/5",
}

const ROLE_BADGE_COLORS: Record<DebateRole, string> = {
  bull: "bg-success/10 text-success border-success/20",
  bear: "bg-destructive/10 text-destructive border-destructive/20",
  realist: "bg-electric-blue/10 text-electric-blue border-electric-blue/20",
  disruptor: "bg-warning/10 text-warning border-warning/20",
  wildcard: "bg-info/10 text-info border-info/20",
}

const VERDICT_ICONS: Record<FactCheck["verdict"], typeof CheckCircle2> = {
  verified: CheckCircle2,
  corrected: AlertTriangle,
  disputed: XCircle,
  unverified: HelpCircle,
}

const VERDICT_COLORS: Record<FactCheck["verdict"], string> = {
  verified: "text-success",
  corrected: "text-warning",
  disputed: "text-destructive",
  unverified: "text-muted-foreground",
}

/** Required providers for Red Team debates */
const REQUIRED_PROVIDERS = ["Anthropic", "OpenAI", "Google", "Qwen"] as const

// ─── Types ──────────────────────────────────────────────────────

interface ProviderHealth {
  provider: string
  model: string
  status: "ok" | "error" | "not_configured"
  responseMs: number | null
  error?: string
}

interface HealthCheckResult {
  status: "healthy" | "degraded"
  providers: ProviderHealth[]
  summary: string
}

/** State payload from server for interactive resume */
interface ResumeState {
  priorRounds: DebateRound[]
  priorTranscript: string
  evidencePack: string
  evidenceItems?: { label: string; content: string }[]
  customQuestions: string[]
  userInputs: Record<number, string>
  totalCostSoFar: number
  debateId: string
}

// ─── Evidence Tooltip Rendering ─────────────────────────────────

/**
 * Renders argument text with clickable [R1], [R2], etc. evidence tooltips.
 * Replaces each [Rn] with a hoverable span that shows the evidence content.
 */
function renderWithEvidenceTooltips(
  text: string,
  evidenceItems?: { label: string; content: string }[],
): React.ReactNode {
  if (!evidenceItems || evidenceItems.length === 0) return text

  const parts = text.split(/(\[R\d+\])/)
  if (parts.length <= 1) return text

  return parts.map((part, i) => {
    const match = part.match(/^\[R(\d+)\]$/)
    if (!match) return <Fragment key={i}>{part}</Fragment>

    const refIndex = parseInt(match[1], 10) - 1
    const item = evidenceItems[refIndex]
    if (!item) return <Fragment key={i}>{part}</Fragment>

    return (
      <EvidenceTooltip key={i} label={item.label} content={item.content} refTag={part} />
    )
  })
}

function EvidenceTooltip({ label, content, refTag }: { label: string; content: string; refTag: string }): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const tooltipRef = useRef<HTMLSpanElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [isOpen])

  return (
    <span ref={tooltipRef} className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-bold bg-international-orange/10 text-international-orange hover:bg-international-orange/20 transition-colors cursor-pointer"
      >
        {refTag}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-[300] bottom-full left-0 mb-1 w-72 rounded-lg border bg-card shadow-lg p-3"
          >
            <p className="text-[10px] font-bold text-international-orange uppercase tracking-wider mb-1">{refTag} {label}</p>
            <p className="text-xs text-foreground leading-relaxed line-clamp-6">{content}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}

// ─── Component ──────────────────────────────────────────────────

export function RedTeamView(): React.ReactElement {
  const [topic, setTopic] = useState("")
  const [context, setContext] = useState("")
  const [showContext, setShowContext] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [debate, setDebate] = useState<RedTeamDebateDocument | null>(null)
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set())
  const [actionsCreated, setActionsCreated] = useState(false)
  const [isCreatingActions, setIsCreatingActions] = useState(false)
  const [showStrategicPrompt, setShowStrategicPrompt] = useState(false)
  const [newStrategicTitle, setNewStrategicTitle] = useState("")
  const [strategicMatch, setStrategicMatch] = useState<{ id: string; title: string } | null>(null)

  // File upload state
  const [uploadedFile, setUploadedFile] = useState<{ name: string; content: string } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Streaming state
  const [streamPhase, setStreamPhase] = useState("")
  const [streamMessage, setStreamMessage] = useState("")
  const [currentRound, setCurrentRound] = useState(0)
  const [currentPersona, setCurrentPersona] = useState<string | null>(null)
  const [streamingArgs, setStreamingArgs] = useState<Map<string, string>>(new Map())
  const [completedRounds, setCompletedRounds] = useState<DebateRound[]>([])
  const [evidencePack, setEvidencePack] = useState("")

  // Interactive debate state
  const [awaitingInput, setAwaitingInput] = useState(false)
  const [awaitingRound, setAwaitingRound] = useState(0)
  const [resumeState, setResumeState] = useState<ResumeState | null>(null)
  const [userInterjection, setUserInterjection] = useState("")

  // Health check
  const [healthStatus, setHealthStatus] = useState<HealthCheckResult | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthChecked, setHealthChecked] = useState(false)

  // History
  const [history, setHistory] = useState<DebateHistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Comparison
  const [compareMode, setCompareMode] = useState(false)
  const [compareSelection, setCompareSelection] = useState<string[]>([])
  const [compareDebates, setCompareDebates] = useState<[RedTeamDebateDocument, RedTeamDebateDocument] | null>(null)
  const [loadingCompare, setLoadingCompare] = useState(false)

  // Cost tracking during stream
  const [streamCost, setStreamCost] = useState(0)

  const abortRef = useRef<AbortController | null>(null)
  const interjectionInputRef = useRef<HTMLTextAreaElement>(null)

  // Load history + silent health check on mount
  useEffect(() => {
    listRedTeamDebates().then(setHistory).catch(() => {})
    // Silent health pre-check — only surfaces warning if something is down
    fetch("/api/health/ai").then(r => r.json()).then((data: HealthCheckResult) => {
      setHealthStatus(data)
      setHealthChecked(true)
    }).catch(() => {})
  }, [])

  // ─── Health Pre-check ─────────────────────────────────────────

  const runHealthCheck = useCallback(async () => {
    setHealthLoading(true)
    try {
      const res = await fetch("/api/health/ai")
      const data = (await res.json()) as HealthCheckResult
      setHealthStatus(data)
      setHealthChecked(true)
    } catch {
      setHealthStatus(null)
      setHealthChecked(true)
      toast.error("Could not reach health endpoint")
    } finally {
      setHealthLoading(false)
    }
  }, [])

  const unhealthyProviders = useMemo(() => {
    if (!healthStatus) return []
    return healthStatus.providers.filter(
      (p) => REQUIRED_PROVIDERS.includes(p.provider as typeof REQUIRED_PROVIDERS[number]) && p.status !== "ok",
    )
  }, [healthStatus])

  // ─── SSE Streaming ────────────────────────────────────────────

  const startStream = useCallback(
    (body: Record<string, unknown>) => {
      setIsGenerating(true)
      setAwaitingInput(false)
      setStreamPhase("research")
      setStreamMessage("Starting research swarm...")

      const controller = new AbortController()
      abortRef.current = controller

      fetch("/api/red-team/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok || !response.body) {
            toast.error("Failed to start debate")
            setIsGenerating(false)
            return
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() || ""

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue
              const jsonStr = line.slice(6)
              if (jsonStr === "[DONE]") continue

              try {
                const event = JSON.parse(jsonStr)
                handleSSEEvent(event)
              } catch {
                /* skip malformed events */
              }
            }
          }
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            toast.error("Debate connection lost")
            setIsGenerating(false)
          }
        })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const handleGenerate = useCallback(() => {
    if (!topic.trim() || topic.trim().length < 10) {
      toast.error("Topic must be at least 10 characters")
      return
    }

    setDebate(null)
    setStreamingArgs(new Map())
    setCompletedRounds([])
    setCurrentRound(0)
    setCurrentPersona(null)
    setActionsCreated(false)
    setEvidencePack("")
    setStreamCost(0)
    setResumeState(null)
    setUserInterjection("")

    // Combine typed context with uploaded file content
    const fullContext = [context.trim(), uploadedFile?.content].filter(Boolean).join("\n\n---\n\n") || undefined
    startStream({ topic: topic.trim(), context: fullContext })
  }, [topic, context, uploadedFile, startStream])

  const handleSSEEvent = useCallback(
    (event: Record<string, unknown>) => {
      const phase = event.phase as string

      switch (phase) {
        case "research":
          setStreamPhase("research")
          setStreamMessage(event.message as string)
          break

        case "evidence":
          setEvidencePack(event.data as string)
          break

        case "round_start":
          setCurrentRound(event.round as number)
          setStreamPhase("round")
          setStreamMessage(`Round ${event.round}: ${event.question}`)
          break

        case "persona_start":
          setCurrentPersona(event.persona as string)
          setStreamMessage(
            `${event.characterName} (${(event.persona as string).toUpperCase()}) is thinking...`,
          )
          break

        case "chunk":
          setStreamingArgs((prev) => {
            const key = `${event.round}-${event.persona}`
            const next = new Map(prev)
            next.set(key, (next.get(key) || "") + (event.chunk as string))
            return next
          })
          break

        case "persona_complete":
          setCurrentPersona(null)
          if (typeof event.costUsd === "number") {
            setStreamCost((prev) => prev + (event.costUsd as number))
          }
          break

        case "fact_check_start":
          setStreamPhase("fact_check")
          setStreamMessage(`Fact-checking round ${event.round}...`)
          break

        case "fact_check_complete": {
          const checks = (event.checks || []) as FactCheck[]
          setCompletedRounds((prev) => {
            const existing = prev.find((r) => r.roundNumber === event.round)
            if (existing) {
              return prev.map((r) =>
                r.roundNumber === event.round ? { ...r, factChecks: checks } : r,
              )
            }
            return prev
          })
          break
        }

        case "awaiting_input":
          // INTENT: Pause the debate and let the user add thoughts before next round
          setAwaitingInput(true)
          setAwaitingRound(event.round as number)
          setResumeState(event.state as ResumeState)
          setIsGenerating(false)
          setStreamPhase("awaiting_input")
          setStreamMessage(event.message as string)
          break

        case "user_input_recorded":
          // Server acknowledged our interjection — continue streaming
          break

        case "synthesis_start":
          setStreamPhase("synthesis")
          setStreamMessage("Writing verdict...")
          break

        case "synthesis_chunk":
          // Synthesis streams but we wait for the full document
          break

        case "actions_start":
          setStreamPhase("actions")
          setStreamMessage("Generating recommended actions...")
          break

        case "complete":
          setDebate(event.document as RedTeamDebateDocument)
          setExpandedRounds(
            new Set(
              (event.document as RedTeamDebateDocument).rounds.map((r) => r.roundNumber),
            ),
          )
          setIsGenerating(false)
          setStreamPhase("")
          setAwaitingInput(false)
          setResumeState(null)
          toast.success(
            `Debate complete in ${Math.round((event.document as RedTeamDebateDocument).totalDuration / 1000)}s`,
          )
          // Refresh history
          listRedTeamDebates().then(setHistory).catch(() => {})
          break

        case "error":
          toast.error(event.message as string)
          setIsGenerating(false)
          setStreamPhase("")
          break
      }
    },
    [],
  )

  // ─── Interactive Interjection ─────────────────────────────────

  const handleSubmitInterjection = useCallback(() => {
    if (!resumeState) return

    const input = userInterjection.trim()
    setUserInterjection("")

    startStream({
      topic: topic.trim(),
      context: context.trim() || undefined,
      resumeFromRound: awaitingRound,
      userInput: input || undefined,
      priorRounds: resumeState.priorRounds,
      priorTranscript: resumeState.priorTranscript,
      evidencePack: resumeState.evidencePack,
      evidenceItems: resumeState.evidenceItems,
      customQuestions: resumeState.customQuestions,
      userInputs: resumeState.userInputs,
      totalCostSoFar: resumeState.totalCostSoFar,
      debateId: resumeState.debateId,
    })
  }, [resumeState, userInterjection, topic, context, awaitingRound, startStream])

  const handleSkipInterjection = useCallback(() => {
    if (!resumeState) return
    setUserInterjection("")
    // INTENT: Skip sends no user input — don't call handleSubmitInterjection
    // because it would read the stale userInterjection state.
    startStream({
      topic: topic.trim(),
      context: context.trim() || undefined,
      resumeFromRound: awaitingRound,
      priorRounds: resumeState.priorRounds,
      priorTranscript: resumeState.priorTranscript,
      evidencePack: resumeState.evidencePack,
      evidenceItems: resumeState.evidenceItems,
      customQuestions: resumeState.customQuestions,
      userInputs: resumeState.userInputs,
      totalCostSoFar: resumeState.totalCostSoFar,
      debateId: resumeState.debateId,
    })
  }, [resumeState, topic, context, awaitingRound, startStream])

  // ─── Round Toggle ─────────────────────────────────────────────

  const toggleRound = useCallback((roundNumber: number) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev)
      if (next.has(roundNumber)) next.delete(roundNumber)
      else next.add(roundNumber)
      return next
    })
  }, [])

  const handleNewDebate = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
    setDebate(null)
    setTopic("")
    setContext("")
    setShowContext(false)
    setExpandedRounds(new Set())
    setActionsCreated(false)
    setIsGenerating(false)
    setStreamPhase("")
    setStreamingArgs(new Map())
    setCompletedRounds([])
    setAwaitingInput(false)
    setResumeState(null)
    setUserInterjection("")
    setStreamCost(0)
    setCompareDebates(null)
    setCompareMode(false)
    setCompareSelection([])
  }, [])

  const handleLoadDebate = useCallback(async (id: string) => {
    setLoadingHistory(true)
    try {
      const doc = await loadRedTeamDebate(id)
      if (doc) {
        setDebate(doc)
        setTopic(doc.topic)
        setExpandedRounds(new Set(doc.rounds.map((r) => r.roundNumber)))
        setShowHistory(false)
        setCompareDebates(null)
        setCompareMode(false)
        setCompareSelection([])
      } else {
        toast.error("Failed to load debate")
      }
    } catch {
      toast.error("Failed to load debate")
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  const handleCreateAll = useCallback(async () => {
    if (!debate) return
    setIsCreatingActions(true)

    // Check for strategic objective match first
    const objectiveTitle = debate.suggestedObjectives[0]?.title || `Red Team Follow-ups: ${debate.topic.slice(0, 80)}`
    const match = await checkStrategicMatch(objectiveTitle, debate.topic)

    if (match) {
      // Good match found — create with auto-link
      setStrategicMatch(match)
      const result = await createRedTeamActions({
        topic: debate.topic,
        objectives: debate.suggestedObjectives,
        tasks: debate.suggestedTasks,
        strategicObjectiveId: match.id,
      })
      if (result.success) {
        setActionsCreated(true)
        toast.success(`Created objective + ${result.taskCount} tasks — linked to "${match.title}"`)
      } else {
        toast.error(result.error || "Failed to create actions")
      }
      setIsCreatingActions(false)
    } else {
      // No match — ask user if they want to create a strategic objective
      setIsCreatingActions(false)
      setShowStrategicPrompt(true)
      setNewStrategicTitle(objectiveTitle)
    }
  }, [debate])

  const handleCreateWithNewStrategic = useCallback(async () => {
    if (!debate || !newStrategicTitle.trim()) return
    setIsCreatingActions(true)
    setShowStrategicPrompt(false)

    // Create the new strategic objective first
    const strategic = await createNewStrategicObjective(newStrategicTitle.trim())
    const result = await createRedTeamActions({
      topic: debate.topic,
      objectives: debate.suggestedObjectives,
      tasks: debate.suggestedTasks,
      strategicObjectiveId: strategic?.id || null,
    })
    if (result.success) {
      setActionsCreated(true)
      toast.success(`Created strategic objective + ${result.taskCount} tasks`)
    } else {
      toast.error(result.error || "Failed to create actions")
    }
    setIsCreatingActions(false)
  }, [debate, newStrategicTitle])

  const handleCreateWithoutStrategic = useCallback(async () => {
    if (!debate) return
    setIsCreatingActions(true)
    setShowStrategicPrompt(false)

    const result = await createRedTeamActions({
      topic: debate.topic,
      objectives: debate.suggestedObjectives,
      tasks: debate.suggestedTasks,
      strategicObjectiveId: null,
    })
    if (result.success) {
      setActionsCreated(true)
      toast.success(`Created objective + ${result.taskCount} tasks`)
    } else {
      toast.error(result.error || "Failed to create actions")
    }
    setIsCreatingActions(false)
  }, [debate])

  const handleExportDOCX = useCallback(async () => {
    if (!debate) return
    try {
      const { exportDebateAsDOCX } = await import("@/lib/red-team/export-debate")
      const blob = await exportDebateAsDOCX(debate)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `red-team-${debate.topic.slice(0, 30).replace(/[^a-z0-9]/gi, "-")}.docx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("DOCX downloaded")
    } catch (err) {
      toast.error("Export failed")
      console.error("[RedTeam] DOCX export failed:", err)
    }
  }, [debate])

  // ─── Comparison View ──────────────────────────────────────────

  const handleToggleCompareSelection = useCallback(
    (id: string) => {
      setCompareSelection((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id)
        if (prev.length >= 2) return [prev[1], id]
        return [...prev, id]
      })
    },
    [],
  )

  const handleStartCompare = useCallback(async () => {
    if (compareSelection.length !== 2) return
    setLoadingCompare(true)
    try {
      const [a, b] = await Promise.all(compareSelection.map((id) => loadRedTeamDebate(id)))
      if (a && b) {
        setCompareDebates([a, b])
        setShowHistory(false)
        setCompareMode(false)
        setDebate(null)
      } else {
        toast.error("Failed to load one or both debates")
      }
    } catch {
      toast.error("Comparison load failed")
    } finally {
      setLoadingCompare(false)
    }
  }, [compareSelection])

  // ─── Comparison View Render ───────────────────────────────────

  if (compareDebates) {
    const [debateA, debateB] = compareDebates
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-international-orange/10">
              <GitCompareArrows className="h-5 w-5 text-international-orange" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Debate Comparison</h1>
              <p className="text-sm text-muted-foreground">Side-by-side verdict and tensions</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setCompareDebates(null); setCompareSelection([]) }}>
            <X className="h-3.5 w-3.5 mr-1" /> Close
          </Button>
        </div>

        {/* Topics */}
        <div className="grid grid-cols-2 gap-4">
          {[debateA, debateB].map((d, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Debate {i + 1}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-foreground">{d.topic}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(d.generatedAt).toLocaleDateString()} — {Math.round(d.totalDuration / 1000)}s
                  {d.totalCostUsd != null && ` — $${d.totalCostUsd.toFixed(2)}`}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Verdicts */}
        <div className="grid grid-cols-2 gap-4">
          {[debateA, debateB].map((d, i) => (
            <Card key={i} className="border-2 border-international-orange/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Swords className="h-3.5 w-3.5 text-international-orange" /> Verdict
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap text-xs leading-relaxed text-foreground max-h-80 overflow-y-auto">
                  {d.verdict}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tensions side by side */}
        <div className="grid grid-cols-2 gap-4">
          {[debateA, debateB].map((d, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Key Tensions</CardTitle>
              </CardHeader>
              <CardContent>
                {d.tensions.length > 0 ? (
                  <div className="space-y-2">
                    {d.tensions.map((t, ti) => (
                      <div key={ti} className="p-2 rounded-md bg-muted/30">
                        <p className="text-xs font-semibold text-foreground">{t.dimension}</p>
                        <div className="grid grid-cols-5 gap-1 mt-1">
                          {(["bull", "bear", "realist", "disruptor", "wildcard"] as const).map((role) => (
                            <div key={role} className={cn("rounded p-1 text-[10px]", ROLE_COLORS[role])}>
                              <span className="font-bold uppercase">{role[0]}</span>: {t[role]}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No tensions recorded</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Button variant="outline" onClick={handleNewDebate}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New Debate
        </Button>
      </div>
    )
  }

  // ─── Input State ────────────────────────────────────────────

  if (!debate && !isGenerating && !awaitingInput) {
    return (
      <div className="space-y-8">
        <div className="flex items-start justify-between pb-4 border-b border-muted">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-1 rounded-full bg-international-orange" />
            <div>
              <h1 className="text-2xl font-display font-bold tracking-tight text-foreground">Red Team Debate</h1>
              <p className="text-sm text-muted-foreground">
                Stress-test decisions with 5 different AI models
              </p>
            </div>
          </div>
          {history.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="h-3.5 w-3.5 mr-1" /> History ({history.length})
            </Button>
          )}
        </div>

        <SpecialistBriefingHero
          specialistId="strategist"
          specialistName="Sage"
          specialistTitle="Strategy"
          narrative={null}
          fallbackMessage="Stress-test any decision by putting it through a multi-perspective debate. I'll help you surface blind spots before you commit."
          isLoading={false}
          severity="success"
          context={{ type: 'general', title: 'Red Team', description: 'Sage on red team.', metadata: {} }}
          storageKey="red-team"
        />

        {/* Health Warning Banner */}
        {healthChecked && unhealthyProviders.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-warning/30 bg-warning/5 p-3"
          >
            <div className="flex items-start gap-2">
              <WifiOff className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Some providers are unavailable
                </p>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {unhealthyProviders.map((p) => (
                    <Badge key={p.provider} variant="warning" className="text-[10px]">
                      {p.provider}: {p.status === "not_configured" ? "not configured" : p.error || "error"}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  The debate may fail or produce incomplete results.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Health check runs silently on mount — no success banner shown */}

        {/* History */}
        <AnimatePresence>
          {showHistory && history.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
            >
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Past Debates</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCompareMode(!compareMode)
                        setCompareSelection([])
                      }}
                    >
                      <GitCompareArrows className="h-3.5 w-3.5 mr-1" />
                      {compareMode ? "Cancel Compare" : "Compare"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-2 pb-4 space-y-2">
                  {history.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => {
                        if (compareMode) {
                          handleToggleCompareSelection(h.id)
                        } else {
                          handleLoadDebate(h.id)
                        }
                      }}
                      disabled={loadingHistory && !compareMode}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors flex items-center justify-between",
                        compareMode && compareSelection.includes(h.id) && "ring-2 ring-international-orange bg-international-orange/5",
                      )}
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        {compareMode && (
                          <div
                            className={cn(
                              "h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors",
                              compareSelection.includes(h.id)
                                ? "bg-international-orange border-international-orange"
                                : "border-input",
                            )}
                          >
                            {compareSelection.includes(h.id) && (
                              <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                            )}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {h.topic}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3" />
                            {new Date(h.generatedAt).toLocaleDateString()}{" "}
                            {h.totalDuration
                              ? `(${Math.round(h.totalDuration / 1000)}s)`
                              : ""}
                          </p>
                        </div>
                      </div>
                      {!compareMode && (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </button>
                  ))}

                  {compareMode && (
                    <div className="pt-2 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {compareSelection.length}/2 selected
                      </p>
                      <Button
                        size="sm"
                        onClick={handleStartCompare}
                        disabled={compareSelection.length !== 2 || loadingCompare}
                        className="bg-international-orange hover:bg-international-orange/90 text-white"
                      >
                        {loadingCompare ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <GitCompareArrows className="h-3.5 w-3.5 mr-1" />
                        )}
                        Compare Selected
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="debate-topic"
                className="text-sm font-medium text-foreground"
              >
                What decision do you want to stress-test?
              </label>
              <textarea
                id="debate-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Should we pivot from selling hardware to offering hardware-as-a-service with monthly subscriptions?"
                rows={4}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-international-orange/30 resize-none"
              />
            </div>

            {/* File upload drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragging(false)
                const file = e.dataTransfer.files[0]
                if (file && (file.type === "text/plain" || file.type === "text/markdown" || file.type === "text/csv" || file.name.endsWith(".md") || file.name.endsWith(".txt"))) {
                  file.text().then(text => {
                    setUploadedFile({ name: file.name, content: text.slice(0, 50000) })
                    toast.success(`Loaded ${file.name}`)
                  })
                } else if (file) {
                  toast.error("Drop a .txt, .md, or .csv file — PDFs and Word docs aren't supported yet")
                }
              }}
              className={cn(
                "rounded-lg border-2 border-dashed p-4 text-center transition-colors cursor-pointer",
                isDragging ? "border-international-orange bg-international-orange/5" : "border-muted hover:border-muted-foreground/30",
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    file.text().then(text => {
                      setUploadedFile({ name: file.name, content: text.slice(0, 50000) })
                      toast.success(`Loaded ${file.name}`)
                    })
                  }
                }}
              />
              {uploadedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="text-sm text-foreground font-medium">{uploadedFile.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); setUploadedFile(null) }} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Drop a document here to debate it — business plan, market research, strategy memo
                </p>
              )}
            </div>

            <button
              onClick={() => setShowContext(!showContext)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              {showContext ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              Add extra context
            </button>
            <AnimatePresence>
              {showContext && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  <textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="Paste additional context, numbers, or background..."
                    rows={4}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-international-orange/30 resize-none"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-5 gap-2 pt-2">
              {DEBATE_PERSONAS.map((p) => (
                <div
                  key={p.role}
                  className={cn(
                    "rounded-lg border p-2.5 text-center",
                    ROLE_COLORS[p.role],
                  )}
                >
                  <p className="text-xs font-bold uppercase tracking-wider">
                    {p.label}
                  </p>
                  <p className="text-xs font-medium text-foreground mt-0.5">
                    {p.characterName}
                  </p>
                </div>
              ))}
            </div>

            <Button
              onClick={handleGenerate}
              disabled={!topic.trim() || topic.trim().length < 10}
              className="w-full bg-international-orange hover:bg-international-orange/90 text-white h-12 text-sm font-semibold"
            >
              <Swords className="h-4 w-4 mr-2" /> Launch Debate
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Generating State (streaming) ─────────────────────────────

  if (isGenerating) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-international-orange/10">
              <Loader2 className="h-5 w-5 text-international-orange animate-spin" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Debate in Progress</h1>
              <p className="text-sm text-muted-foreground">{streamMessage}</p>
            </div>
          </div>
          {streamCost > 0 && (
            <Badge variant="secondary" className="text-xs">
              <DollarSign className="h-3 w-3 mr-0.5" />
              ${streamCost.toFixed(3)}
            </Badge>
          )}
        </div>

        {/* Persona progress */}
        <div className="grid grid-cols-5 gap-2">
          {DEBATE_PERSONAS.map((p) => {
            const isActive = currentPersona === p.role
            return (
              <div
                key={p.role}
                className={cn(
                  "rounded-lg border p-2 text-center transition-all",
                  ROLE_COLORS[p.role],
                  isActive && "ring-2 ring-international-orange",
                )}
              >
                <p className="text-[10px] font-bold uppercase">{p.label}</p>
                <p className="text-[10px] text-foreground">{p.characterName}</p>
                {isActive && (
                  <Loader2 className="h-3 w-3 mx-auto mt-1 animate-spin text-international-orange" />
                )}
              </div>
            )
          })}
        </div>

        {/* Streaming arguments */}
        {currentRound > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Round {currentRound}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {DEBATE_PERSONAS.map((p) => {
                const key = `${currentRound}-${p.role}`
                const text = streamingArgs.get(key)
                if (!text) return null
                return (
                  <div
                    key={p.role}
                    className={cn("rounded-lg border p-3", ROLE_COLORS[p.role])}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        className={cn(
                          "text-[10px] font-bold",
                          ROLE_BADGE_COLORS[p.role],
                        )}
                      >
                        {p.label}
                      </Badge>
                      <span className="text-xs font-semibold text-foreground">
                        {p.characterName}
                      </span>
                    </div>
                    <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                      {text}
                    </p>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        <Button variant="outline" size="sm" onClick={handleNewDebate}>
          Cancel
        </Button>
      </div>
    )
  }

  // ─── Awaiting Input State (interactive pause) ──────────────────

  if (awaitingInput && resumeState) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-international-orange/10">
              <Swords className="h-5 w-5 text-international-orange" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Round {awaitingRound} Complete</h1>
              <p className="text-sm text-muted-foreground">{streamMessage}</p>
            </div>
          </div>
          {resumeState.totalCostSoFar > 0 && (
            <Badge variant="secondary" className="text-xs">
              <DollarSign className="h-3 w-3 mr-0.5" />
              ${resumeState.totalCostSoFar.toFixed(3)} so far
            </Badge>
          )}
        </div>

        {/* Show completed rounds so far */}
        {resumeState.priorRounds.map((round) => (
          <RoundCard
            key={round.roundNumber}
            round={round}
            isExpanded={expandedRounds.has(round.roundNumber)}
            onToggle={() => toggleRound(round.roundNumber)}
          />
        ))}

        {/* User interjection input */}
        <Card className="border-2 border-international-orange/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Send className="h-3.5 w-3.5 text-international-orange" />
              Add your thoughts (or skip)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Steer the debate by adding context, correcting assumptions, or challenging a specific argument.
              The personas will incorporate your input in the next round.
            </p>
            <textarea
              ref={interjectionInputRef}
              value={userInterjection}
              onChange={(e) => setUserInterjection(e.target.value)}
              placeholder="e.g., The bear is wrong about our margins — we already negotiated 40% COGS reduction with the new supplier..."
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-international-orange/30 resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleSubmitInterjection()
                }
              }}
            />
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                Cmd+Enter to submit
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleSkipInterjection}>
                  <SkipForward className="h-3.5 w-3.5 mr-1" /> Skip
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmitInterjection}
                  disabled={!userInterjection.trim()}
                  className="bg-international-orange hover:bg-international-orange/90 text-white"
                >
                  <Send className="h-3.5 w-3.5 mr-1" /> Submit & Continue
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button variant="outline" size="sm" onClick={handleNewDebate}>
          Cancel Debate
        </Button>
      </div>
    )
  }

  // ─── Results State ────────────────────────────────────────────

  if (!debate) return <div />

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-international-orange/10">
            <Swords className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Red Team Debate</h1>
            <p className="text-sm text-muted-foreground">
              Generated in {Math.round(debate.totalDuration / 1000)}s using 5 models
              {debate.totalCostUsd != null && (
                <span className="ml-2 inline-flex items-center gap-0.5">
                  <DollarSign className="h-3 w-3" />
                  {debate.totalCostUsd.toFixed(2)}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportDOCX}>
            <FileDown className="h-3.5 w-3.5 mr-1" /> DOCX
          </Button>
          <Button variant="outline" size="sm" onClick={handleNewDebate}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
            Topic
          </p>
          <p className="text-foreground font-medium">{debate.topic}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-5 gap-2">
        {debate.personas.map((p) => (
          <div
            key={p.role}
            className={cn("rounded-lg border p-3 text-center", ROLE_COLORS[p.role])}
          >
            <p className="text-xs font-bold uppercase tracking-wider">{p.label}</p>
            <p className="text-sm font-semibold text-foreground mt-1">
              {p.characterName}
            </p>
            <p className="text-[10px] text-muted-foreground">{p.characterTitle}</p>
          </div>
        ))}
      </div>

      {/* User interjections summary */}
      {debate.userInputs && Object.keys(debate.userInputs).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Send className="h-3.5 w-3.5 text-international-orange" /> Your Interjections
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(debate.userInputs).map(([round, input]) => (
              <div key={round} className="p-2 rounded-md bg-international-orange/5 border border-international-orange/20">
                <p className="text-[10px] font-bold text-international-orange uppercase">After Round {round}</p>
                <p className="text-xs text-foreground mt-0.5">{input}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {debate.rounds.map((round) => (
        <RoundCard
          key={round.roundNumber}
          round={round}
          isExpanded={expandedRounds.has(round.roundNumber)}
          onToggle={() => toggleRound(round.roundNumber)}
          evidenceItems={debate.evidenceItems}
        />
      ))}

      {debate.tensions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Key Tensions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-3 font-semibold text-muted-foreground">
                      Dimension
                    </th>
                    {DEBATE_PERSONAS.map((p) => (
                      <th
                        key={p.role}
                        className="text-left py-2 px-2 font-semibold text-muted-foreground"
                      >
                        {p.characterName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {debate.tensions.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">
                        {row.dimension}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{row.bull}</td>
                      <td className="py-2 px-2 text-muted-foreground">{row.bear}</td>
                      <td className="py-2 px-2 text-muted-foreground">{row.realist}</td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {row.disruptor}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {row.wildcard}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-2 border-international-orange/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Swords className="h-4 w-4 text-international-orange" /> Verdict
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {debate.verdict}
          </div>
        </CardContent>
      </Card>

      {(debate.suggestedObjectives.length > 0 ||
        debate.suggestedTasks.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Recommended Actions</CardTitle>
              {!actionsCreated ? (
                <Button
                  size="sm"
                  onClick={handleCreateAll}
                  disabled={isCreatingActions}
                  className="bg-international-orange hover:bg-international-orange/90 text-white"
                >
                  {isCreatingActions ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 mr-1" />
                  )}
                  Create All
                </Button>
              ) : (
                <Badge variant="success">Created</Badge>
              )}
            </div>
          </CardHeader>

          {/* Strategic Objective Prompt — shown when no match found */}
          {showStrategicPrompt && (
            <div className="mx-6 mb-4 p-4 rounded-lg border-2 border-electric-blue/20 bg-electric-blue/[0.03] space-y-3">
              <p className="text-sm font-medium text-foreground">No matching strategic objective found</p>
              <p className="text-xs text-muted-foreground">Would you like to create a new strategic objective, or continue without one?</p>
              <div className="space-y-2">
                <input
                  value={newStrategicTitle}
                  onChange={e => setNewStrategicTitle(e.target.value)}
                  placeholder="Strategic objective title..."
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-electric-blue/30"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleCreateWithNewStrategic} disabled={!newStrategicTitle.trim()} className="bg-electric-blue hover:bg-electric-blue/90 text-white">
                    Create Strategic Objective + Actions
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCreateWithoutStrategic}>
                    Skip — Create Without
                  </Button>
                </div>
              </div>
            </div>
          )}

          <CardContent className="space-y-4">
            {debate.suggestedObjectives.map((obj, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card"
              >
                <Target className="h-4 w-4 text-international-orange mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{obj.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {obj.description}
                  </p>
                </div>
              </div>
            ))}
            {debate.suggestedTasks.map((task, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card"
              >
                <ListChecks className="h-4 w-4 text-electric-blue mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{task.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {task.description}
                  </p>
                </div>
              </div>
            ))}
            {debate.suggestedRiskMitigations.map((risk, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card"
              >
                <ShieldAlert className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{risk.risk}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {risk.mitigation}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Round Card ─────────────────────────────────────────────────

function RoundCard({
  round,
  isExpanded,
  onToggle,
  evidenceItems,
}: {
  round: DebateRound
  isExpanded: boolean
  onToggle: () => void
  evidenceItems?: { label: string; content: string }[]
}): React.ReactElement {
  return (
    <Card>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">
              Round {round.roundNumber}
            </p>
            <p className="text-xs text-muted-foreground">{round.question}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {round.factChecks.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {round.factChecks.length} fact-checks
            </Badge>
          )}
        </div>
      </button>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="pt-0 space-y-4">
              {round.arguments.map((arg) => (
                <div
                  key={arg.role}
                  className={cn(
                    "rounded-lg border p-4",
                    ROLE_COLORS[arg.role as DebateRole],
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={cn(
                          "text-[10px] font-bold",
                          ROLE_BADGE_COLORS[arg.role as DebateRole],
                        )}
                      >
                        {DEBATE_PERSONAS.find((p) => p.role === arg.role)?.label}
                      </Badge>
                      <span className="text-sm font-semibold text-foreground">
                        {arg.characterName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {DEBATE_PERSONAS.find(p => p.role === arg.role)?.characterTitle}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {arg.costUsd != null && arg.costUsd > 0 && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <DollarSign className="h-2.5 w-2.5" />
                          {arg.costUsd.toFixed(3)}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {(arg.duration / 1000).toFixed(1)}s
                      </span>
                    </div>
                  </div>
                  <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {renderWithEvidenceTooltips(arg.content, evidenceItems)}
                  </div>
                </div>
              ))}

              {/* User interjection after this round */}
              {round.userInput && (
                <div className="rounded-lg border border-international-orange/30 bg-international-orange/5 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="text-[10px] font-bold bg-international-orange/10 text-international-orange border-international-orange/20">
                      YOU
                    </Badge>
                    <span className="text-sm font-semibold text-foreground">Founder Interjection</span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{round.userInput}</p>
                </div>
              )}

              {round.factChecks.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Fact Checks
                  </p>
                  {round.factChecks.map((fc, i) => {
                    const Icon = VERDICT_ICONS[fc.verdict]
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2 rounded-md bg-muted/30"
                      >
                        <Icon
                          className={cn(
                            "h-3.5 w-3.5 mt-0.5 shrink-0",
                            VERDICT_COLORS[fc.verdict],
                          )}
                        />
                        <div>
                          <p className="text-xs text-foreground">{fc.claim}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {fc.detail}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
