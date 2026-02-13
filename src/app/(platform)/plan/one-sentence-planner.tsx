/**
 * OneSentencePlanner — The "magic moment" of ForgeOS Plan section.
 *
 * @description A single input field where users describe their goal in one sentence
 * and AI generates a complete strategic plan with phases, tasks, timeline, and risks.
 * Includes an animated plan-building visualization that makes the generation feel magical.
 *
 * @component
 *
 * @example
 * <OneSentencePlanner />
 */

"use client"

import { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence, type Variants } from "framer-motion"
import {
  Sparkles,
  ArrowRight,
  Loader2,
  Target,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Zap,
  ChevronDown,
  ChevronUp,
  Rocket,
  X,
  CalendarClock,
  Copy,
  ShieldAlert,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  generatePlanFromSentence,
  applyGeneratedPlan,
  type GeneratedPlan,
  type GeneratedPhase,
} from "@/actions/plan-generator"
import { useCelebration } from "@/hooks/useCelebration"

// ─── Constants ────────────────────────────────────────────────────

const EXAMPLE_PROMPTS = [
  "Launch a direct-to-consumer coffee brand by September",
  "Raise a $500K seed round in the next 3 months",
  "Hire our first 3 employees and set up HR systems",
  "Build and launch an MVP mobile app in 8 weeks",
  "Open a second retail location by end of year",
] as const

const GENERATING_MESSAGES = [
  "Analyzing your goal...",
  "Building your timeline...",
  "Creating phases and tasks...",
  "Identifying risks and quick wins...",
  "Polishing your plan...",
] as const

// ─── Animation Variants ──────────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
}

const resultVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.2 },
  },
}

const phaseVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  }),
}

// ─── Component ────────────────────────────────────────────────────

export function OneSentencePlanner(): React.ReactElement {
  const router = useRouter()
  const { fireConfetti } = useCelebration()
  const inputRef = useRef<HTMLInputElement>(null)

  const [sentence, setSentence] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingStep, setGeneratingStep] = useState(0)
  const [plan, setPlan] = useState<GeneratedPlan | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const [expandedPhase, setExpandedPhase] = useState<number | null>(0)

  /**
   * Generates a plan from the user's sentence.
   */
  const handleGenerate = useCallback(async () => {
    if (!sentence.trim() || isGenerating) return

    setIsGenerating(true)
    setPlan(null)
    setGeneratingStep(0)

    // Animate through generating messages
    const interval = setInterval(() => {
      setGeneratingStep((prev) => {
        if (prev < GENERATING_MESSAGES.length - 1) return prev + 1
        return prev
      })
    }, 1500)

    const result = await generatePlanFromSentence(sentence.trim())

    clearInterval(interval)
    setIsGenerating(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    if (result.plan) {
      setPlan(result.plan)
      setExpandedPhase(0)
    }
  }, [sentence, isGenerating])

  /**
   * Applies the generated plan to the database.
   */
  const handleApply = useCallback(async () => {
    if (!plan || isApplying) return

    setIsApplying(true)
    const result = await applyGeneratedPlan(plan)
    setIsApplying(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    fireConfetti()
    toast.success("Plan created! Redirecting to your objectives...", {
      duration: 3000,
    })

    // Navigate to objectives page after brief delay
    setTimeout(() => {
      router.push("/new-objectives")
    }, 1500)
  }, [plan, isApplying, fireConfetti, router])

  /**
   * Fills the input with an example prompt.
   */
  const handleExampleClick = useCallback((example: string) => {
    setSentence(example)
    inputRef.current?.focus()
  }, [])

  /**
   * Resets the planner to initial state.
   */
  const handleReset = useCallback(() => {
    setPlan(null)
    setSentence("")
    setExpandedPhase(null)
    inputRef.current?.focus()
  }, [])

  /**
   * Copies a formatted version of the plan to clipboard for sharing.
   */
  const handleSharePlan = useCallback((planData: GeneratedPlan) => {
    const sections: string[] = [
      `🎯 ${planData.title}`,
      '',
      planData.description,
      '',
    ]

    if (planData.suggestedDeadline) {
      const deadline = new Date(planData.suggestedDeadline).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      })
      sections.push(`📅 Target: ${deadline} (${planData.totalWeeks} weeks)`)
      sections.push('')
    }

    if (planData.quickWins.length > 0) {
      sections.push('⚡ Start right now:')
      planData.quickWins.forEach((w) => sections.push(`  • ${w}`))
      sections.push('')
    }

    planData.phases.forEach((phase, i) => {
      sections.push(`📋 Phase ${i + 1}: ${phase.title} (Weeks ${phase.startWeek}–${phase.endWeek})`)
      if (phase.description) sections.push(`   ${phase.description}`)
      phase.tasks.forEach((t) => {
        sections.push(`   ☐ ${t.title} — ${t.durationDays}d, ${t.suggestedRole}${t.riskLevel !== 'Low' ? ` ⚠️ ${t.riskLevel} risk` : ''}`)
      })
      sections.push('')
    })

    if (planData.keyRisks.length > 0) {
      sections.push('⚠️ Key risks:')
      planData.keyRisks.forEach((r) => sections.push(`  - ${r}`))
      sections.push('')
    }

    sections.push('— Generated by ForgeOS')

    navigator.clipboard.writeText(sections.join('\n'))
    toast.success('Plan copied to clipboard')
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleGenerate()
      }
    },
    [handleGenerate]
  )

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="w-full"
    >
      <Card className="border-2 border-dashed border-international-orange/20 bg-gradient-to-br from-background to-international-orange/[0.02] overflow-hidden">
        <CardContent className="pt-6">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-international-orange/10">
              <Sparkles className="h-4 w-4 text-international-orange" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                One sentence. Full plan.
              </h3>
              <p className="text-xs text-muted-foreground">
                Describe your goal and AI builds the entire strategy
              </p>
            </div>
          </div>

          {/* Input Area */}
          <div className="relative mb-3">
            <input
              ref={inputRef}
              type="text"
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Launch a DTC coffee brand by September..."
              disabled={isGenerating}
              className={cn(
                "w-full h-12 px-4 pr-12 rounded-xl border bg-background text-foreground",
                "placeholder:text-muted-foreground/60 text-sm",
                "focus:outline-none focus:ring-2 focus:ring-international-orange/30 focus:border-international-orange/50",
                "transition-all duration-200",
                isGenerating && "opacity-50"
              )}
              aria-label="Describe your goal in one sentence"
              maxLength={500}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={handleGenerate}
              disabled={!sentence.trim() || isGenerating}
              className="absolute right-1.5 top-1.5 h-9 w-9 rounded-lg hover:bg-international-orange/10"
              aria-label="Generate plan"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
              ) : (
                <ArrowRight className="h-4 w-4 text-international-orange" />
              )}
            </Button>
          </div>

          {/* Example Prompts */}
          {!plan && !isGenerating && (
            <div className="flex flex-wrap gap-1.5 mb-1">
              {EXAMPLE_PROMPTS.slice(0, 3).map((example) => (
                <button
                  key={example}
                  onClick={() => handleExampleClick(example)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border",
                    "text-muted-foreground hover:text-foreground hover:border-international-orange/30",
                    "transition-colors duration-200 cursor-pointer"
                  )}
                >
                  {example}
                </button>
              ))}
            </div>
          )}

          {/* Generating Animation */}
          <AnimatePresence mode="wait">
            {isGenerating && (
              <motion.div
                key="generating"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4"
              >
                <div className="flex items-center gap-3 py-4">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-international-orange/10 flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-international-orange animate-pulse" />
                    </div>
                    <div className="absolute inset-0 rounded-full border-2 border-international-orange/20 animate-ping" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Building your plan...
                    </p>
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={generatingStep}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="text-xs text-muted-foreground"
                      >
                        {GENERATING_MESSAGES[generatingStep]}
                      </motion.p>
                    </AnimatePresence>
                  </div>
                </div>

                {/* Progress dots */}
                <div className="flex gap-1.5 mt-2">
                  {GENERATING_MESSAGES.map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1 flex-1 rounded-full transition-colors duration-500",
                        i <= generatingStep
                          ? "bg-international-orange"
                          : "bg-muted"
                      )}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Generated Plan Preview */}
          <AnimatePresence mode="wait">
            {plan && !isGenerating && (
              <motion.div
                key="plan"
                variants={resultVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="mt-4 space-y-4"
              >
                {/* Plan Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-lg font-semibold text-foreground truncate">
                      {plan.title}
                    </h4>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {plan.description}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleReset}
                    className="shrink-0"
                    aria-label="Start over"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Suggested Deadline */}
                {plan.suggestedDeadline && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-electric-blue/5 border border-electric-blue/10">
                    <CalendarClock className="h-4 w-4 text-electric-blue shrink-0" />
                    <span className="text-sm text-foreground">
                      AI suggests completing by{" "}
                      <span className="font-semibold">
                        {new Date(plan.suggestedDeadline).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}({plan.totalWeeks} weeks)
                      </span>
                    </span>
                  </div>
                )}

                {/* Plan Stats */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="gap-1">
                    <Target className="h-3 w-3" />
                    {plan.phases.length} phases
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {plan.phases.reduce((s, p) => s + p.tasks.length, 0)} tasks
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Clock className="h-3 w-3" />
                    {plan.totalWeeks} weeks
                  </Badge>
                </div>

                {/* Quick Wins — show first for immediate value */}
                {plan.quickWins.length > 0 && (
                  <div className="bg-status-success-light/50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Zap className="h-3.5 w-3.5 text-status-success" />
                      <span className="text-xs font-semibold text-status-success uppercase tracking-wider">
                        Start right now
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {plan.quickWins.map((win, i) => (
                        <li
                          key={i}
                          className="text-xs text-foreground flex items-start gap-2"
                        >
                          <span className="text-status-success mt-0.5">
                            &bull;
                          </span>
                          {win}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Timeline Visualization */}
                <PlanTimeline phases={plan.phases} totalWeeks={plan.totalWeeks} />

                {/* Phase List */}
                <div className="space-y-2">
                  {plan.phases.map((phase, index) => (
                    <PhasePreviewCard
                      key={phase.title}
                      phase={phase}
                      index={index}
                      isExpanded={expandedPhase === index}
                      onToggle={() =>
                        setExpandedPhase(
                          expandedPhase === index ? null : index
                        )
                      }
                    />
                  ))}
                </div>

                {/* Key Risks */}
                {plan.keyRisks.length > 0 && (
                  <div className="bg-status-warning-light/50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <ShieldAlert className="h-3.5 w-3.5 text-status-warning" />
                      <span className="text-xs font-semibold text-status-warning uppercase tracking-wider">
                        Key risks to watch
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {plan.keyRisks.map((risk, i) => (
                        <li
                          key={i}
                          className="text-xs text-foreground flex items-start gap-2"
                        >
                          <AlertTriangle className="h-3 w-3 text-status-warning mt-0.5 shrink-0" />
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-3 pt-2">
                  <Button
                    onClick={handleApply}
                    disabled={isApplying}
                    className="flex-1 bg-international-orange hover:bg-international-orange/90 text-background"
                  >
                    {isApplying ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Creating plan...
                      </>
                    ) : (
                      <>
                        <Rocket className="h-4 w-4 mr-2" />
                        Create this plan
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleSharePlan(plan)}
                    className="gap-1.5"
                    aria-label="Copy plan to clipboard"
                  >
                    <Copy className="h-4 w-4" />
                    Share
                  </Button>
                  <Button variant="ghost" onClick={handleReset}>
                    Start over
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Phase Preview Card ───────────────────────────────────────────

interface PhasePreviewCardProps {
  /** Phase data */
  phase: GeneratedPhase
  /** Phase index (0-based) */
  index: number
  /** Whether the phase tasks are expanded */
  isExpanded: boolean
  /** Toggle expansion callback */
  onToggle: () => void
}

/**
 * Expandable phase card showing phase title, timeline, and tasks.
 */
function PhasePreviewCard({
  phase,
  index,
  isExpanded,
  onToggle,
}: PhasePreviewCardProps): React.ReactElement {
  const riskCount = phase.tasks.filter((t) => t.riskLevel !== "Low").length

  return (
    <motion.div
      custom={index}
      variants={phaseVariants}
      initial="hidden"
      animate="visible"
      className="rounded-lg border bg-background overflow-hidden"
    >
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 text-left",
          "hover:bg-muted/50 transition-colors"
        )}
        aria-expanded={isExpanded}
      >
        {/* Phase number */}
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-international-orange/10 text-international-orange text-xs font-bold shrink-0">
          {index + 1}
        </div>

        {/* Phase info */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {phase.title}
          </p>
          {phase.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {phase.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {phase.tasks.length} tasks &middot; Weeks {phase.startWeek}–
            {phase.endWeek}
            {riskCount > 0 && (
              <span className="text-status-warning ml-1">
                &middot; {riskCount} risk{riskCount !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>

        {/* Expand icon */}
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Task list */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-1.5 border-t pt-2">
              {phase.tasks.map((task, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-foreground font-medium">{task.title}</span>
                    <span className="text-muted-foreground ml-1">
                      &middot; {task.durationDays}d &middot;{" "}
                      {task.suggestedRole}
                    </span>
                    {task.description && (
                      <p className="text-muted-foreground mt-0.5 leading-relaxed">
                        {task.description}
                      </p>
                    )}
                  </div>
                  {task.riskLevel !== "Low" && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 py-0 shrink-0",
                        task.riskLevel === "High"
                          ? "text-destructive border-destructive/30"
                          : "text-status-warning border-status-warning/30"
                      )}
                    >
                      {task.riskLevel}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Plan Timeline Visualization ─────────────────────────────────

/** Phase colors for timeline bars */
const PHASE_COLORS = [
  "bg-international-orange",
  "bg-electric-blue",
  "bg-status-success",
  "bg-chart-4",
  "bg-chart-5",
  "bg-chart-6",
] as const

/**
 * PlanTimeline — Simple horizontal bar showing phases across weeks.
 *
 * @description A lightweight visual timeline that shows how phases
 * map to weeks, giving users an at-a-glance view of the plan structure.
 */
function PlanTimeline({
  phases,
  totalWeeks,
}: {
  phases: GeneratedPhase[]
  totalWeeks: number
}): React.ReactElement {
  if (totalWeeks <= 0) return <></>

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
        Timeline
      </p>
      <div className="relative h-6 rounded-full bg-muted overflow-hidden flex">
        {phases.map((phase, i) => {
          const widthPercent = ((phase.endWeek - phase.startWeek + 1) / totalWeeks) * 100
          const colorClass = PHASE_COLORS[i % PHASE_COLORS.length]

          return (
            <div
              key={phase.title}
              className={cn(
                "h-full flex items-center justify-center text-[10px] font-medium text-background truncate px-1",
                colorClass
              )}
              style={{ width: `${widthPercent}%` }}
              title={`Phase ${i + 1}: ${phase.title} (Weeks ${phase.startWeek}–${phase.endWeek})`}
            >
              {widthPercent > 15 ? `P${i + 1}` : ""}
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
        <span>Week 1</span>
        <span>Week {totalWeeks}</span>
      </div>
    </div>
  )
}
