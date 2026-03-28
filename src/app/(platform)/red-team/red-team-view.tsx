"use client"

/**
 * @file red-team-view.tsx — Red Team Debate UI with SSE streaming
 *
 * @description Interactive page for launching and viewing multi-LLM debates.
 * Connects to /api/red-team/generate via EventSource for real-time streaming.
 * Includes debate history, real action creation, and DOCX export.
 */

import { useState, useCallback, useEffect, useRef } from "react"
import Link from "next/link"
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
} from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { DEBATE_PERSONAS } from "@/lib/red-team/prompts"
import { listRedTeamDebates, loadRedTeamDebate, createRedTeamActions } from "@/actions/red-team-debate"
import type {
  RedTeamDebateDocument,
  DebateRound,
  DebateArgument,
  FactCheck,
  DebateRole,
} from "@/lib/red-team/types"
import type { DebateHistoryItem } from "@/actions/red-team-debate"

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

  // Streaming state
  const [streamPhase, setStreamPhase] = useState("")
  const [streamMessage, setStreamMessage] = useState("")
  const [currentRound, setCurrentRound] = useState(0)
  const [currentPersona, setCurrentPersona] = useState<string | null>(null)
  const [streamingArgs, setStreamingArgs] = useState<Map<string, string>>(new Map())
  const [completedRounds, setCompletedRounds] = useState<DebateRound[]>([])
  const [evidencePack, setEvidencePack] = useState("")

  // History
  const [history, setHistory] = useState<DebateHistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  // Load history on mount
  useEffect(() => {
    listRedTeamDebates().then(setHistory).catch(() => {})
  }, [])

  // ─── SSE Streaming ──────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    if (!topic.trim() || topic.trim().length < 10) {
      toast.error("Topic must be at least 10 characters")
      return
    }

    setIsGenerating(true)
    setDebate(null)
    setStreamPhase("research")
    setStreamMessage("Starting research swarm...")
    setStreamingArgs(new Map())
    setCompletedRounds([])
    setCurrentRound(0)
    setCurrentPersona(null)
    setActionsCreated(false)
    setEvidencePack("")

    const controller = new AbortController()
    abortRef.current = controller

    fetch("/api/red-team/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: topic.trim(), context: context.trim() || undefined }),
      signal: controller.signal,
    }).then(async (response) => {
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
          } catch { /* skip malformed events */ }
        }
      }
    }).catch((err) => {
      if (err.name !== "AbortError") {
        toast.error("Debate connection lost")
        setIsGenerating(false)
      }
    })
  }, [topic, context])

  const handleSSEEvent = useCallback((event: Record<string, unknown>) => {
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
        setStreamMessage(`${event.characterName} (${(event.persona as string).toUpperCase()}) via ${event.modelId}...`)
        break

      case "chunk":
        setStreamingArgs(prev => {
          const key = `${event.round}-${event.persona}`
          const next = new Map(prev)
          next.set(key, (next.get(key) || "") + (event.chunk as string))
          return next
        })
        break

      case "persona_complete":
        setCurrentPersona(null)
        break

      case "fact_check_start":
        setStreamPhase("fact_check")
        setStreamMessage(`Fact-checking round ${event.round}...`)
        break

      case "fact_check_complete": {
        const checks = (event.checks || []) as FactCheck[]
        setCompletedRounds(prev => {
          const existing = prev.find(r => r.roundNumber === event.round)
          if (existing) {
            return prev.map(r => r.roundNumber === event.round ? { ...r, factChecks: checks } : r)
          }
          return prev
        })
        break
      }

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
        setExpandedRounds(new Set((event.document as RedTeamDebateDocument).rounds.map(r => r.roundNumber)))
        setIsGenerating(false)
        setStreamPhase("")
        toast.success(`Debate complete in ${Math.round((event.document as RedTeamDebateDocument).totalDuration / 1000)}s`)
        // Refresh history
        listRedTeamDebates().then(setHistory).catch(() => {})
        break

      case "error":
        toast.error(event.message as string)
        setIsGenerating(false)
        setStreamPhase("")
        break
    }
  }, [])

  const toggleRound = useCallback((roundNumber: number) => {
    setExpandedRounds(prev => {
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
  }, [])

  const handleLoadDebate = useCallback(async (id: string) => {
    setLoadingHistory(true)
    const doc = await loadRedTeamDebate(id)
    if (doc) {
      setDebate(doc)
      setTopic(doc.topic)
      setExpandedRounds(new Set(doc.rounds.map(r => r.roundNumber)))
      setShowHistory(false)
    } else {
      toast.error("Failed to load debate")
    }
    setLoadingHistory(false)
  }, [])

  const handleCreateAll = useCallback(async () => {
    if (!debate) return
    setIsCreatingActions(true)
    const result = await createRedTeamActions({
      topic: debate.topic,
      objectives: debate.suggestedObjectives,
      tasks: debate.suggestedTasks,
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

  // ─── Input State ────────────────────────────────────────────
  if (!debate && !isGenerating) {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-international-orange/10">
              <Swords className="h-5 w-5 text-international-orange" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Red Team Debate</h1>
              <p className="text-sm text-muted-foreground">Stress-test decisions with 5 different AI models</p>
            </div>
          </div>
          {history.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
              <History className="h-3.5 w-3.5 mr-1" /> History ({history.length})
            </Button>
          )}
        </div>

        {/* History */}
        <AnimatePresence>
          {showHistory && history.length > 0 && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              <Card>
                <CardContent className="pt-4 pb-4 space-y-2">
                  {history.map(h => (
                    <button
                      key={h.id}
                      onClick={() => handleLoadDebate(h.id)}
                      disabled={loadingHistory}
                      className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{h.topic}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" />
                          {new Date(h.generatedAt).toLocaleDateString()} {h.totalDuration ? `(${Math.round(h.totalDuration / 1000)}s)` : ""}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="debate-topic" className="text-sm font-medium text-foreground">
                What decision do you want to stress-test?
              </label>
              <textarea
                id="debate-topic"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g., Should we pivot from selling hardware to offering hardware-as-a-service with monthly subscriptions?"
                rows={4}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-international-orange/30 resize-none"
              />
            </div>

            <button onClick={() => setShowContext(!showContext)} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              {showContext ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Add context
            </button>
            <AnimatePresence>
              {showContext && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <textarea value={context} onChange={e => setContext(e.target.value)} placeholder="Paste relevant context..." rows={6} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-international-orange/30 resize-none" />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-5 gap-2 pt-2">
              {DEBATE_PERSONAS.map(p => (
                <div key={p.role} className={cn("rounded-lg border p-2.5 text-center", ROLE_COLORS[p.role])}>
                  <p className="text-xs font-bold uppercase tracking-wider">{p.label}</p>
                  <p className="text-xs font-medium text-foreground mt-0.5">{p.characterName}</p>
                  <p className="text-[10px] text-muted-foreground">{p.modelId.split("-").slice(0, 2).join("-")}</p>
                </div>
              ))}
            </div>

            <Button onClick={handleGenerate} disabled={!topic.trim() || topic.trim().length < 10} className="w-full bg-international-orange hover:bg-international-orange/90 text-white h-12 text-sm font-semibold">
              <Swords className="h-4 w-4 mr-2" /> Launch Debate
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Generating State (streaming) ───────────────────────────
  if (isGenerating) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-international-orange/10">
            <Loader2 className="h-5 w-5 text-international-orange animate-spin" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Debate in Progress</h1>
            <p className="text-sm text-muted-foreground">{streamMessage}</p>
          </div>
        </div>

        {/* Persona progress */}
        <div className="grid grid-cols-5 gap-2">
          {DEBATE_PERSONAS.map(p => {
            const isActive = currentPersona === p.role
            return (
              <div key={p.role} className={cn("rounded-lg border p-2 text-center transition-all", ROLE_COLORS[p.role], isActive && "ring-2 ring-international-orange")}>
                <p className="text-[10px] font-bold uppercase">{p.label}</p>
                <p className="text-[10px] text-foreground">{p.characterName}</p>
                {isActive && <Loader2 className="h-3 w-3 mx-auto mt-1 animate-spin text-international-orange" />}
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
              {DEBATE_PERSONAS.map(p => {
                const key = `${currentRound}-${p.role}`
                const text = streamingArgs.get(key)
                if (!text) return null
                return (
                  <div key={p.role} className={cn("rounded-lg border p-3", ROLE_COLORS[p.role])}>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={cn("text-[10px] font-bold", ROLE_BADGE_COLORS[p.role])}>{p.label}</Badge>
                      <span className="text-xs font-semibold text-foreground">{p.characterName}</span>
                    </div>
                    <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{text}</p>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        <Button variant="outline" size="sm" onClick={handleNewDebate}>Cancel</Button>
      </div>
    )
  }

  // ─── Results State ──────────────────────────────────────────
  if (!debate) return <div />

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-international-orange/10">
            <Swords className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Red Team Debate</h1>
            <p className="text-sm text-muted-foreground">Generated in {Math.round(debate.totalDuration / 1000)}s using 5 models</p>
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
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Topic</p>
          <p className="text-foreground font-medium">{debate.topic}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-5 gap-2">
        {debate.personas.map(p => (
          <div key={p.role} className={cn("rounded-lg border p-3 text-center", ROLE_COLORS[p.role])}>
            <p className="text-xs font-bold uppercase tracking-wider">{p.label}</p>
            <p className="text-sm font-semibold text-foreground mt-1">{p.characterName}</p>
            <p className="text-[10px] text-muted-foreground">{p.modelId}</p>
          </div>
        ))}
      </div>

      {debate.rounds.map(round => (
        <RoundCard key={round.roundNumber} round={round} isExpanded={expandedRounds.has(round.roundNumber)} onToggle={() => toggleRound(round.roundNumber)} />
      ))}

      {debate.tensions.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-lg">Key Tensions</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-3 font-semibold text-muted-foreground">Dimension</th>
                    {DEBATE_PERSONAS.map(p => <th key={p.role} className="text-left py-2 px-2 font-semibold text-muted-foreground">{p.characterName}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {debate.tensions.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">{row.dimension}</td>
                      <td className="py-2 px-2 text-muted-foreground">{row.bull}</td>
                      <td className="py-2 px-2 text-muted-foreground">{row.bear}</td>
                      <td className="py-2 px-2 text-muted-foreground">{row.realist}</td>
                      <td className="py-2 px-2 text-muted-foreground">{row.disruptor}</td>
                      <td className="py-2 px-2 text-muted-foreground">{row.wildcard}</td>
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
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{debate.verdict}</div>
        </CardContent>
      </Card>

      {(debate.suggestedObjectives.length > 0 || debate.suggestedTasks.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Recommended Actions</CardTitle>
              {!actionsCreated ? (
                <Button size="sm" onClick={handleCreateAll} disabled={isCreatingActions} className="bg-international-orange hover:bg-international-orange/90 text-white">
                  {isCreatingActions ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                  Create All
                </Button>
              ) : (
                <Badge variant="success">Created</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {debate.suggestedObjectives.map((obj, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                <Target className="h-4 w-4 text-international-orange mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{obj.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{obj.description}</p>
                </div>
              </div>
            ))}
            {debate.suggestedTasks.map((task, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                <ListChecks className="h-4 w-4 text-electric-blue mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{task.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                </div>
              </div>
            ))}
            {debate.suggestedRiskMitigations.map((risk, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                <ShieldAlert className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{risk.risk}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{risk.mitigation}</p>
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

function RoundCard({ round, isExpanded, onToggle }: { round: DebateRound; isExpanded: boolean; onToggle: () => void }): React.ReactElement {
  return (
    <Card>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors text-left">
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <div>
            <p className="text-sm font-semibold text-foreground">Round {round.roundNumber}</p>
            <p className="text-xs text-muted-foreground">{round.question}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {round.factChecks.length > 0 && <Badge variant="secondary" className="text-[10px]">{round.factChecks.length} fact-checks</Badge>}
        </div>
      </button>
      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <CardContent className="pt-0 space-y-4">
              {round.arguments.map(arg => (
                <div key={arg.role} className={cn("rounded-lg border p-4", ROLE_COLORS[arg.role as DebateRole])}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-[10px] font-bold", ROLE_BADGE_COLORS[arg.role as DebateRole])}>{DEBATE_PERSONAS.find(p => p.role === arg.role)?.label}</Badge>
                      <span className="text-sm font-semibold text-foreground">{arg.characterName}</span>
                      <span className="text-[10px] text-muted-foreground">via {arg.modelId}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{(arg.duration / 1000).toFixed(1)}s</span>
                  </div>
                  <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{arg.content}</div>
                </div>
              ))}
              {round.factChecks.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fact Checks</p>
                  {round.factChecks.map((fc, i) => {
                    const Icon = VERDICT_ICONS[fc.verdict]
                    return (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/30">
                        <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", VERDICT_COLORS[fc.verdict])} />
                        <div>
                          <p className="text-xs text-foreground">{fc.claim}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{fc.detail}</p>
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
