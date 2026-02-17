'use client'

/**
 * AutoGenerateMilestonesDialog - 3-step wizard for AI-generating milestones,
 * tasks, and dependencies for an existing strategic goal.
 *
 * @description Three-step wizard:
 * 1. Configure: Shows goal info, optional user guidance prompt, generate button
 * 2. Review: AI-generated plan with collapsible phases, tasks, risks
 * 3. Confirm: Summary of what will be created
 *
 * @component
 *
 * @example
 * <AutoGenerateMilestonesDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   goalId="uuid-here"
 *   goalTitle="Raise 60M Funding"
 *   goalDeadline="2026-05-15"
 *   goalDescription="Series B funding round"
 *   onComplete={() => router.refresh()}
 * />
 */

import { useState, useCallback, useMemo } from 'react'
import {
  Sparkles, Eye, CheckCircle2, ChevronLeft, ChevronRight,
  Loader2, AlertTriangle, Flag, Calendar, AlertCircle,
  ChevronDown, ChevronUp, ShieldAlert, Lightbulb, Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { generateMilestonePlan, applyMilestonePlan } from '@/actions/canvas'
import type { StrategicPlan, StrategicPlanPhase } from '@/types/strategic-planner'

// ============================================================================
// TYPES
// ============================================================================

type WizardStep = 'configure' | 'review' | 'confirm'

interface AutoGenerateMilestonesDialogProps {
  /** Controls whether the dialog is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** UUID of the strategic goal */
  goalId: string
  /** Title of the strategic goal */
  goalTitle: string
  /** ISO date string for the goal deadline */
  goalDeadline: string
  /** Optional description */
  goalDescription?: string | null
  /** Called after successful creation */
  onComplete?: () => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STEPS: { id: WizardStep; title: string; icon: React.ElementType }[] = [
  { id: 'configure', title: 'Configure', icon: Sparkles },
  { id: 'review', title: 'Review Plan', icon: Eye },
  { id: 'confirm', title: 'Confirm', icon: CheckCircle2 },
]

const RISK_COLORS = {
  Low: 'success' as const,
  Medium: 'warning' as const,
  High: 'error' as const,
}

const SEVERITY_BORDER = {
  high: 'border-l-status-error',
  medium: 'border-l-status-warning',
  low: 'border-l-status-info',
} satisfies Record<string, string>

const GENERATION_STEPS = [
  'Analyzing your goal...',
  'Building milestone structure...',
  'Scheduling tasks and dependencies...',
  'Identifying risks and resource gaps...',
  'Finalizing plan...',
]

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Dialog for auto-generating milestones and tasks for a strategic goal.
 *
 * @param props - Dialog configuration including goal details
 */
export function AutoGenerateMilestonesDialog({
  open,
  onOpenChange,
  goalId,
  goalTitle,
  goalDeadline,
  goalDescription,
  onComplete,
}: AutoGenerateMilestonesDialogProps) {
  // ── Wizard state ──
  const [currentStep, setCurrentStep] = useState<WizardStep>('configure')
  const [userPrompt, setUserPrompt] = useState('')
  const [plan, setPlan] = useState<StrategicPlan | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPersisting, setIsPersisting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generationStep, setGenerationStep] = useState(0)
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set())
  const [skippedPhases, setSkippedPhases] = useState<Set<number>>(new Set())
  const [skippedTasks, setSkippedTasks] = useState<Set<string>>(new Set())

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep)
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === STEPS.length - 1

  // ── Computed stats ──
  const planStats = useMemo(() => {
    if (!plan) return null
    const activePhases = plan.phases.filter((_, i) => !skippedPhases.has(i))
    const activeTasks = activePhases.flatMap((phase, _phaseIdx) => {
      const originalIdx = plan.phases.indexOf(phase)
      return phase.tasks.filter((t) => !skippedTasks.has(`${originalIdx}-${t.title}`))
    })
    const dependencies = activeTasks.reduce(
      (sum, t) => sum + (t.dependsOn?.length || 0), 0
    )
    return {
      milestones: activePhases.length,
      tasks: activeTasks.length,
      dependencies,
      risks: plan.risks?.length || 0,
      resourceGaps: plan.resourceGaps?.length || 0,
    }
  }, [plan, skippedPhases, skippedTasks])

  // ── Reset state when dialog closes ──
  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setCurrentStep('configure')
      setUserPrompt('')
      setPlan(null)
      setError(null)
      setIsGenerating(false)
      setIsPersisting(false)
      setGenerationStep(0)
      setExpandedPhases(new Set())
      setSkippedPhases(new Set())
      setSkippedTasks(new Set())
    }
    onOpenChange(isOpen)
  }, [onOpenChange])

  // ── Generate plan ──
  const handleGenerate = useCallback(async () => {
    setError(null)
    setIsGenerating(true)
    setGenerationStep(0)

    // Simulate stepped progress while AI works
    const interval = setInterval(() => {
      setGenerationStep((prev) => Math.min(prev + 1, GENERATION_STEPS.length - 1))
    }, 2500)

    try {
      const result = await generateMilestonePlan(goalId, userPrompt || undefined)

      clearInterval(interval)
      setGenerationStep(GENERATION_STEPS.length - 1)

      if (result.error) {
        setError(result.error)
        return
      }

      if (!result.plan) {
        setError('No plan was generated. Please try again.')
        return
      }

      setPlan(result.plan)
      // Expand all phases by default
      setExpandedPhases(new Set(result.plan.phases.map((_, i) => i)))
      setCurrentStep('review')
    } catch (err) {
      clearInterval(interval)
      const message = err instanceof Error ? err.message : 'Failed to generate plan'
      console.error('[AutoGenerateMilestones] Generation failed:', { error: message })
      setError(message)
    } finally {
      setIsGenerating(false)
    }
  }, [goalId, userPrompt])

  // ── Apply plan ──
  const handleApply = useCallback(async () => {
    if (!plan) return

    // Build filtered plan excluding skipped items
    const filteredPlan: StrategicPlan = {
      ...plan,
      phases: plan.phases
        .filter((_, i) => !skippedPhases.has(i))
        .map((phase, _newIdx) => {
          const originalIdx = plan.phases.indexOf(phase)
          return {
            ...phase,
            tasks: phase.tasks.filter(
              (t) => !skippedTasks.has(`${originalIdx}-${t.title}`)
            ),
          }
        })
        .filter((phase) => phase.tasks.length > 0),
    }

    if (filteredPlan.phases.length === 0) {
      setError('All phases have been skipped. Please keep at least one.')
      return
    }

    setError(null)
    setIsPersisting(true)

    try {
      const result = await applyMilestonePlan(goalId, filteredPlan)

      if ('error' in result && result.error) {
        setError(result.error)
        return
      }

      if ('milestonesCreated' in result) {
        toast.success('Plan created successfully', {
          description: `${result.milestonesCreated} milestones and ${result.tasksCreated} tasks created`,
        })
      }

      handleOpenChange(false)
      onComplete?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply plan'
      console.error('[AutoGenerateMilestones] Apply failed:', { error: message })
      setError(message)
    } finally {
      setIsPersisting(false)
    }
  }, [plan, skippedPhases, skippedTasks, goalId, handleOpenChange, onComplete])

  // ── Phase toggle ──
  const togglePhaseExpand = useCallback((index: number) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index); else next.add(index)
      return next
    })
  }, [])

  const togglePhaseSkip = useCallback((index: number) => {
    setSkippedPhases((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index); else next.add(index)
      return next
    })
  }, [])

  const toggleTaskSkip = useCallback((phaseIdx: number, taskTitle: string) => {
    const key = `${phaseIdx}-${taskTitle}`
    setSkippedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }, [])

  // ── Navigation ──
  const goBack = useCallback(() => {
    if (currentStep === 'confirm') setCurrentStep('review')
    else if (currentStep === 'review') setCurrentStep('configure')
  }, [currentStep])

  const goNext = useCallback(() => {
    if (currentStep === 'review') setCurrentStep('confirm')
  }, [currentStep])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-international-orange" />
            Auto-Generate Plan
          </DialogTitle>
          <DialogDescription>
            AI will create milestones, tasks, and dependencies for your strategic goal.
          </DialogDescription>
        </DialogHeader>

        {/* ── Progress Stepper ── */}
        <div className="flex items-center gap-2 px-1">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            const isActive = step.id === currentStep
            const isCompleted = index < currentStepIndex

            return (
              <div key={step.id} className={cn('flex items-center gap-2 flex-1', index > 0 && 'pl-2')}>
                {index > 0 && (
                  <div className={cn(
                    'h-0.5 flex-1 transition-colors',
                    isCompleted ? 'bg-international-orange' : 'bg-muted'
                  )} />
                )}
                <div className={cn(
                  'flex items-center justify-center rounded-full h-8 w-8 transition-colors flex-shrink-0',
                  isActive && 'bg-international-orange text-background',
                  isCompleted && !isActive && 'bg-international-orange-light text-international-orange',
                  !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className={cn(
                  'text-xs font-medium hidden sm:inline whitespace-nowrap',
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {step.title}
                </span>
              </div>
            )
          })}
        </div>

        {/* ── Error ── */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* ── Step Content ── */}
        <ScrollArea className="flex-1 max-h-[60vh]">
          <div className="px-1 py-2">
            {/* STEP 1: CONFIGURE */}
            {currentStep === 'configure' && (
              <div className="space-y-6">
                {/* Goal summary */}
                <Card className="rounded-xl border">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 text-international-orange" />
                      <h3 className="font-semibold text-foreground">{goalTitle}</h3>
                    </div>
                    {goalDescription && (
                      <p className="text-sm text-muted-foreground">{goalDescription}</p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Target: {new Date(goalDeadline).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'long', day: 'numeric',
                      })}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* User guidance */}
                <div className="space-y-2">
                  <Label htmlFor="user-prompt" className="text-sm font-medium">
                    Any specific guidance for the AI?
                  </Label>
                  <Textarea
                    id="user-prompt"
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    placeholder="e.g., Focus on legal and financial preparation first. We already have a pitch deck."
                    rows={3}
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground">
                    {userPrompt.length} / 500 characters (optional)
                  </p>
                </div>

                {/* Generation progress */}
                {isGenerating && (
                  <Card className="rounded-xl border bg-muted/30">
                    <CardContent className="pt-6">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
                          <span className="text-sm font-medium text-foreground">
                            Generating your plan...
                          </span>
                        </div>
                        <div className="space-y-2">
                          {GENERATION_STEPS.map((step, idx) => (
                            <div
                              key={step}
                              className={cn(
                                'flex items-center gap-2 text-sm transition-all duration-300',
                                idx <= generationStep
                                  ? 'text-foreground opacity-100'
                                  : 'text-muted-foreground opacity-40'
                              )}
                            >
                              {idx < generationStep ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-status-success flex-shrink-0" />
                              ) : idx === generationStep ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-international-orange flex-shrink-0" />
                              ) : (
                                <div className="h-3.5 w-3.5 rounded-full border border-muted flex-shrink-0" />
                              )}
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>
                        {/* Progress bar */}
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-international-orange transition-all duration-500"
                            style={{ width: `${((generationStep + 1) / GENERATION_STEPS.length) * 100}%` }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* STEP 2: REVIEW */}
            {currentStep === 'review' && plan && (
              <div className="space-y-6">
                {/* Phase cards */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Milestones & Tasks ({plan.phases.length} phases)
                  </h3>
                  {plan.phases.map((phase, phaseIdx) => (
                    <PhaseCard
                      key={phaseIdx}
                      phase={phase}
                      phaseIdx={phaseIdx}
                      isExpanded={expandedPhases.has(phaseIdx)}
                      isSkipped={skippedPhases.has(phaseIdx)}
                      skippedTasks={skippedTasks}
                      onToggleExpand={() => togglePhaseExpand(phaseIdx)}
                      onToggleSkip={() => togglePhaseSkip(phaseIdx)}
                      onToggleTaskSkip={(title) => toggleTaskSkip(phaseIdx, title)}
                    />
                  ))}
                </div>

                {/* Risks */}
                {plan.risks && plan.risks.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <ShieldAlert className="h-4 w-4 text-status-warning" />
                      Identified Risks ({plan.risks.length})
                    </h3>
                    <div className="space-y-2">
                      {plan.risks.map((risk, idx) => (
                        <Card key={idx} className={cn('rounded-lg border-l-4', SEVERITY_BORDER[risk.severity])}>
                          <CardContent className="py-3 px-4">
                            <p className="text-sm font-medium text-foreground">{risk.description}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Mitigation: {risk.mitigation}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resource Gaps */}
                {plan.resourceGaps && plan.resourceGaps.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Users className="h-4 w-4 text-status-info" />
                      Resource Gaps ({plan.resourceGaps.length})
                    </h3>
                    <div className="space-y-2">
                      {plan.resourceGaps.map((gap, idx) => (
                        <Card key={idx} className="rounded-lg">
                          <CardContent className="py-3 px-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">{gap.role}</span>
                              <Badge variant={gap.priority === 'critical' ? 'destructive' : gap.priority === 'recommended' ? 'warning' : 'secondary'}>
                                {gap.priority}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{gap.reason}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggestions */}
                {plan.suggestions && plan.suggestions.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Lightbulb className="h-4 w-4 text-status-warning" />
                      AI Suggestions ({plan.suggestions.length})
                    </h3>
                    <div className="space-y-2">
                      {plan.suggestions.map((suggestion) => (
                        <Card key={suggestion.id} className="rounded-lg bg-status-warning-light/30">
                          <CardContent className="py-3 px-4">
                            <p className="text-sm text-foreground">{suggestion.message}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: CONFIRM */}
            {currentStep === 'confirm' && planStats && (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center rounded-full bg-status-success-light p-4">
                    <CheckCircle2 className="h-8 w-8 text-status-success" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    Ready to create your plan
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    The following will be created under &ldquo;{goalTitle}&rdquo;
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Milestones" value={planStats.milestones} />
                  <StatCard label="Tasks" value={planStats.tasks} />
                  <StatCard label="Dependencies" value={planStats.dependencies} />
                  <StatCard label="Risks Identified" value={planStats.risks} />
                </div>

                {planStats.resourceGaps > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {planStats.resourceGaps} resource gap{planStats.resourceGaps !== 1 ? 's' : ''} identified.
                      You may want to address these after creation.
                    </AlertDescription>
                  </Alert>
                )}

                {isPersisting && (
                  <div className="flex items-center justify-center gap-2 py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-international-orange" />
                    <span className="text-sm font-medium text-muted-foreground">
                      Creating milestones and tasks...
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ── Footer Navigation ── */}
        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <Button
              variant="secondary"
              onClick={isFirstStep ? () => handleOpenChange(false) : goBack}
              disabled={isGenerating || isPersisting}
            >
              {isFirstStep ? (
                'Cancel'
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </>
              )}
            </Button>

            {currentStep === 'configure' && (
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="bg-international-orange hover:bg-international-orange-hover"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Plan
                  </>
                )}
              </Button>
            )}

            {currentStep === 'review' && (
              <Button
                onClick={goNext}
                className="bg-international-orange hover:bg-international-orange-hover"
              >
                Continue
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}

            {currentStep === 'confirm' && (
              <Button
                onClick={handleApply}
                disabled={isPersisting}
                className="bg-international-orange hover:bg-international-orange-hover"
              >
                {isPersisting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Create Plan
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function PhaseCard({
  phase,
  phaseIdx,
  isExpanded,
  isSkipped,
  skippedTasks,
  onToggleExpand,
  onToggleSkip,
  onToggleTaskSkip,
}: {
  phase: StrategicPlanPhase
  phaseIdx: number
  isExpanded: boolean
  isSkipped: boolean
  skippedTasks: Set<string>
  onToggleExpand: () => void
  onToggleSkip: () => void
  onToggleTaskSkip: (title: string) => void
}) {
  const activeTasks = phase.tasks.filter(
    (t) => !skippedTasks.has(`${phaseIdx}-${t.title}`)
  )

  return (
    <Card className={cn(
      'rounded-xl border transition-opacity',
      isSkipped && 'opacity-50'
    )}>
      <CardContent className="py-3 px-4 space-y-3">
        {/* Phase header */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="flex items-center gap-2 min-w-0 flex-1 text-left"
            onClick={onToggleExpand}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-foreground truncate">
                {phase.title}
              </h4>
              <p className="text-xs text-muted-foreground">
                {phase.startDate} &rarr; {phase.endDate} &middot; {activeTasks.length}/{phase.tasks.length} tasks
              </p>
            </div>
          </button>
          <div className="flex items-center gap-2 flex-shrink-0">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={!isSkipped}
                onCheckedChange={() => onToggleSkip()}
                aria-label={`Include ${phase.title}`}
              />
              Include
            </label>
          </div>
        </div>

        {/* Phase description */}
        {isExpanded && !isSkipped && (
          <>
            {phase.description && (
              <p className="text-xs text-muted-foreground pl-6">{phase.description}</p>
            )}

            {/* Task list */}
            <div className="space-y-1.5 pl-6">
              {phase.tasks.map((task) => {
                const taskKey = `${phaseIdx}-${task.title}`
                const isTaskSkipped = skippedTasks.has(taskKey)

                return (
                  <div
                    key={taskKey}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border px-3 py-2 transition-opacity',
                      isTaskSkipped && 'opacity-40'
                    )}
                  >
                    <Checkbox
                      checked={!isTaskSkipped}
                      onCheckedChange={() => onToggleTaskSkip(task.title)}
                      aria-label={`Include task: ${task.title}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{task.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {task.startDate} &rarr; {task.endDate}
                        {task.suggestedRole && (
                          <span className="ml-2">&middot; {task.suggestedRole}</span>
                        )}
                      </p>
                    </div>
                    <StatusBadge
                      status={RISK_COLORS[task.riskLevel]}
                      size="sm"
                    >
                      {task.riskLevel}
                    </StatusBadge>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border px-4 py-3 text-center">
      <div className="text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
    </div>
  )
}
