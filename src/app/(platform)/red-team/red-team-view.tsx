"use client"

/**
 * @file red-team-view.tsx — Red Team Debate UI
 *
 * @description Interactive page for launching and viewing multi-LLM debates.
 * Input form → generation with progress → rendered debate document with
 * export options and one-click task/objective creation.
 */

import { useState, useCallback, useTransition } from "react"
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
} from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { generateRedTeamDebate } from "@/actions/red-team-debate"
import { DEBATE_PERSONAS } from "@/lib/red-team/prompts"
import type {
  RedTeamDebateDocument,
  DebateRound,
  FactCheck,
  DebateRole,
} from "@/lib/red-team/types"

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
  const [isPending, startTransition] = useTransition()
  const [debate, setDebate] = useState<RedTeamDebateDocument | null>(null)
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set())
  const [createdObjectives, setCreatedObjectives] = useState<Set<number>>(new Set())
  const [createdTasks, setCreatedTasks] = useState<Set<number>>(new Set())

  const handleGenerate = useCallback(() => {
    if (!topic.trim() || topic.trim().length < 10) {
      toast.error("Topic must be at least 10 characters")
      return
    }

    startTransition(async () => {
      const result = await generateRedTeamDebate({
        topic: topic.trim(),
        context: context.trim() || undefined,
      })

      if (result.success && result.document) {
        setDebate(result.document)
        // Expand all rounds by default
        setExpandedRounds(new Set(result.document.rounds.map(r => r.roundNumber)))
        toast.success(`Debate complete in ${Math.round(result.document.totalDuration / 1000)}s`)
      } else {
        toast.error(result.error || "Failed to generate debate")
      }
    })
  }, [topic, context])

  const toggleRound = useCallback((roundNumber: number) => {
    setExpandedRounds(prev => {
      const next = new Set(prev)
      if (next.has(roundNumber)) next.delete(roundNumber)
      else next.add(roundNumber)
      return next
    })
  }, [])

  const handleNewDebate = useCallback(() => {
    setDebate(null)
    setTopic("")
    setContext("")
    setShowContext(false)
    setExpandedRounds(new Set())
    setCreatedObjectives(new Set())
    setCreatedTasks(new Set())
  }, [])

  // ─── Input State ────────────────────────────────────────────
  if (!debate && !isPending) {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-international-orange/10">
              <Swords className="h-5 w-5 text-international-orange" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Red Team Debate</h1>
              <p className="text-sm text-muted-foreground">Stress-test decisions with 5 different AI models</p>
            </div>
          </div>
        </div>

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
              <p className="text-xs text-muted-foreground">Be specific. The more detail you provide, the better the debate.</p>
            </div>

            <div>
              <button
                onClick={() => setShowContext(!showContext)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                {showContext ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Add context (business plan, market data, etc.)
              </button>
              <AnimatePresence>
                {showContext && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <textarea
                      value={context}
                      onChange={e => setContext(e.target.value)}
                      placeholder="Paste any relevant context — business plan excerpt, market research, financial data, competitor analysis..."
                      rows={6}
                      className="w-full mt-3 rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-international-orange/30 resize-none"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Debater lineup */}
            <div className="pt-2 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Debaters</p>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                {DEBATE_PERSONAS.map(p => (
                  <div key={p.role} className={cn("rounded-lg border p-2.5 text-center", ROLE_COLORS[p.role])}>
                    <p className="text-xs font-bold uppercase tracking-wider">{p.label}</p>
                    <p className="text-xs font-medium text-foreground mt-0.5">{p.characterName}</p>
                    <p className="text-[10px] text-muted-foreground">{p.modelId.split("-").slice(0, 2).join("-")}</p>
                  </div>
                ))}
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={!topic.trim() || topic.trim().length < 10}
              className="w-full bg-international-orange hover:bg-international-orange/90 text-white h-12 text-sm font-semibold"
            >
              <Swords className="h-4 w-4 mr-2" />
              Launch Debate
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Generating State ───────────────────────────────────────
  if (isPending) {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-international-orange/10">
            <Swords className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Red Team Debate</h1>
            <p className="text-sm text-muted-foreground">Generating multi-model debate...</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-8 pb-8">
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="relative">
                <Loader2 className="h-12 w-12 text-international-orange animate-spin" />
              </div>
              <div className="space-y-2 max-w-md">
                <p className="text-lg font-semibold text-foreground">Debate in progress</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Researching the topic, then running 5 rounds with 5 different AI models.
                  Fact-checking claims between rounds. This takes 2-4 minutes.
                </p>
              </div>
              <div className="grid grid-cols-5 gap-2 w-full max-w-md">
                {DEBATE_PERSONAS.map((p, i) => (
                  <motion.div
                    key={p.role}
                    className={cn("rounded-lg border p-2 text-center", ROLE_COLORS[p.role])}
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
                  >
                    <p className="text-[10px] font-bold uppercase">{p.label}</p>
                    <p className="text-[10px] text-muted-foreground">{p.characterName}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Results State ──────────────────────────────────────────
  if (!debate) return <div />

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-international-orange/10">
            <Swords className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Red Team Debate</h1>
            <p className="text-sm text-muted-foreground">
              Generated in {Math.round(debate.totalDuration / 1000)}s using 5 models
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleNewDebate}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New Debate
          </Button>
        </div>
      </div>

      {/* Topic */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Topic</p>
          <p className="text-foreground font-medium">{debate.topic}</p>
          {debate.context && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-3">{debate.context}</p>
          )}
        </CardContent>
      </Card>

      {/* Debaters */}
      <div className="grid grid-cols-5 gap-2">
        {debate.personas.map(p => (
          <div key={p.role} className={cn("rounded-lg border p-3 text-center", ROLE_COLORS[p.role])}>
            <p className="text-xs font-bold uppercase tracking-wider">{p.label}</p>
            <p className="text-sm font-semibold text-foreground mt-1">{p.characterName}</p>
            <p className="text-[10px] text-muted-foreground">{p.characterTitle}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{p.modelId}</p>
          </div>
        ))}
      </div>

      {/* Rounds */}
      {debate.rounds.map(round => (
        <RoundCard
          key={round.roundNumber}
          round={round}
          isExpanded={expandedRounds.has(round.roundNumber)}
          onToggle={() => toggleRound(round.roundNumber)}
        />
      ))}

      {/* Key Tensions */}
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
                    <th className="text-left py-2 pr-3 font-semibold text-muted-foreground">Dimension</th>
                    {DEBATE_PERSONAS.map(p => (
                      <th key={p.role} className="text-left py-2 px-2 font-semibold text-muted-foreground">
                        {p.characterName}
                      </th>
                    ))}
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

      {/* Verdict */}
      <Card className="border-2 border-international-orange/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Swords className="h-4 w-4 text-international-orange" />
            Verdict
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none text-foreground">
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{debate.verdict}</div>
          </div>
        </CardContent>
      </Card>

      {/* Suggested Actions */}
      {(debate.suggestedObjectives.length > 0 || debate.suggestedTasks.length > 0 || debate.suggestedRiskMitigations.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Recommended Actions</CardTitle>
            <p className="text-sm text-muted-foreground">Generated from the debate findings. Click to create in ForgeOS.</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Objectives */}
            {debate.suggestedObjectives.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-international-orange" />
                  <p className="text-sm font-semibold text-foreground">Objectives</p>
                </div>
                {debate.suggestedObjectives.map((obj, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-card">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{obj.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{obj.description}</p>
                      {obj.targetDate && <p className="text-xs text-muted-foreground mt-0.5">Target: {obj.targetDate}</p>}
                    </div>
                    {createdObjectives.has(i) ? (
                      <Badge variant="success" className="shrink-0">Created</Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          setCreatedObjectives(prev => new Set([...prev, i]))
                          toast.success(`Objective "${obj.title}" created`)
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Create
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Tasks */}
            {debate.suggestedTasks.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-electric-blue" />
                  <p className="text-sm font-semibold text-foreground">Tasks</p>
                </div>
                {debate.suggestedTasks.map((task, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-card">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{task.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                      {task.function && <Badge variant="secondary" className="mt-1 text-[10px]">{task.function}</Badge>}
                    </div>
                    {createdTasks.has(i) ? (
                      <Badge variant="success" className="shrink-0">Created</Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          setCreatedTasks(prev => new Set([...prev, i]))
                          toast.success(`Task "${task.title}" created`)
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Create
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Risk Mitigations */}
            {debate.suggestedRiskMitigations.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-warning" />
                  <p className="text-sm font-semibold text-foreground">Risk Mitigations</p>
                </div>
                {debate.suggestedRiskMitigations.map((risk, i) => (
                  <div key={i} className="p-3 rounded-lg border bg-card">
                    <p className="text-sm font-medium text-foreground">{risk.risk}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{risk.mitigation}</p>
                    {risk.owner && <Badge variant="secondary" className="mt-1 text-[10px]">{risk.owner}</Badge>}
                  </div>
                ))}
              </div>
            )}
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
}: {
  round: DebateRound
  isExpanded: boolean
  onToggle: () => void
}): React.ReactElement {
  return (
    <Card>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <div>
            <p className="text-sm font-semibold text-foreground">Round {round.roundNumber}</p>
            <p className="text-xs text-muted-foreground">{round.question}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {round.factChecks.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {round.factChecks.length} fact-checks
            </Badge>
          )}
          <div className="flex -space-x-1">
            {round.arguments.map(arg => (
              <div
                key={arg.role}
                className={cn("w-6 h-6 rounded-full border-2 border-background flex items-center justify-center text-[8px] font-bold", ROLE_BADGE_COLORS[arg.role])}
                title={arg.characterName}
              >
                {arg.characterName[0]}
              </div>
            ))}
          </div>
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
              {round.arguments.map(arg => (
                <div key={arg.role} className={cn("rounded-lg border p-4", ROLE_COLORS[arg.role])}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-[10px] font-bold", ROLE_BADGE_COLORS[arg.role])}>
                        {DEBATE_PERSONAS.find(p => p.role === arg.role)?.label}
                      </Badge>
                      <span className="text-sm font-semibold text-foreground">{arg.characterName}</span>
                      <span className="text-[10px] text-muted-foreground">via {arg.modelId}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{(arg.duration / 1000).toFixed(1)}s</span>
                  </div>
                  <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{arg.content}</div>
                </div>
              ))}

              {/* Fact Checks */}
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
