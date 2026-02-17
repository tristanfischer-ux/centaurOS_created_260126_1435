'use client'

/**
 * TranscriptImportDialog - Multi-step wizard for importing raw text
 * (meeting transcripts, notes, brainstorms) into strategic objectives,
 * operational objectives, and tasks.
 *
 * @description Three-step wizard:
 * 1. Input: Paste raw text
 * 2. Review: Edit parsed plan, handle duplicates, adjust dates
 * 3. Confirm: Summary of what will be created
 *
 * @component
 *
 * @example
 * <TranscriptImportDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   onComplete={() => router.refresh()}
 * />
 */

import { useState, useCallback } from 'react'
import {
  FileText, Target, CheckCircle2, ChevronLeft, ChevronRight,
  Loader2, AlertTriangle, Sparkles, Flag, Calendar, AlertCircle,
  Copy, Trash2, ArrowRight,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  parseTranscriptToStrategy,
  persistStrategicPlan,
} from '@/actions/transcript-to-strategy'
import type {
  ParsedStrategicPlan,
  StrategyStrategicObjective,
  StrategyOperationalObjective,
  StrategyTask,
} from '@/actions/transcript-to-strategy'

// ============================================================================
// TYPES
// ============================================================================

type WizardStep = 'input' | 'review' | 'confirm'

interface TranscriptImportDialogProps {
  /** Controls whether the dialog is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Called after successful creation */
  onComplete?: () => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STEPS: { id: WizardStep; title: string; icon: React.ElementType }[] = [
  { id: 'input', title: 'Paste Text', icon: FileText },
  { id: 'review', title: 'Review Plan', icon: Target },
  { id: 'confirm', title: 'Create', icon: CheckCircle2 },
]

const MAX_INPUT_LENGTH = 50000

const PRIORITY_COLORS = {
  critical: 'bg-status-error-light text-status-error-dark',
  high: 'bg-status-warning-light text-status-warning-dark',
  medium: 'bg-status-info-light text-status-info-dark',
  low: 'bg-muted text-muted-foreground',
} satisfies Record<string, string>

const SEVERITY_COLORS = {
  high: 'border-l-status-error',
  medium: 'border-l-status-warning',
  low: 'border-l-status-info',
} satisfies Record<string, string>

// ============================================================================
// COMPONENT
// ============================================================================

export function TranscriptImportDialog({
  open,
  onOpenChange,
  onComplete,
}: TranscriptImportDialogProps) {
  // ── Wizard state ──
  const [currentStep, setCurrentStep] = useState<WizardStep>('input')
  const [rawText, setRawText] = useState('')
  const [plan, setPlan] = useState<ParsedStrategicPlan | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isPersisting, setIsPersisting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep)
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === STEPS.length - 1

  // ── Reset state when dialog closes ──
  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setCurrentStep('input')
      setRawText('')
      setPlan(null)
      setError(null)
      setIsAnalyzing(false)
      setIsPersisting(false)
    }
    onOpenChange(isOpen)
  }, [onOpenChange])

  // ── Step 1 -> Step 2: Analyze text ──
  const handleAnalyze = useCallback(async () => {
    if (rawText.trim().length < 50) {
      setError('Please provide at least 50 characters of text to analyze.')
      return
    }

    setError(null)
    setIsAnalyzing(true)

    try {
      const result = await parseTranscriptToStrategy(rawText)

      if (result.error) {
        setError(result.error)
        return
      }

      if (!result.plan) {
        setError('No strategic plan could be extracted from this text.')
        return
      }

      // Set default actions: keep everything unless it's a duplicate
      const annotatedPlan = {
        ...result.plan,
        strategicObjectives: result.plan.strategicObjectives.map((so) => ({
          ...so,
          action: so.duplicateOf ? undefined : ('keep' as const),
          operationalObjectives: so.operationalObjectives.map((oo) => ({
            ...oo,
            action: oo.duplicateOf ? undefined : ('keep' as const),
            tasks: oo.tasks.map((t) => ({
              ...t,
              action: t.duplicateOf ? undefined : ('keep' as const),
            })),
          })),
        })),
      }

      setPlan(annotatedPlan)
      setCurrentStep('review')
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }, [rawText])

  // ── Step 2 -> Step 3: Validate review ──
  const handleGoToConfirm = useCallback(() => {
    if (!plan) return

    // Check that all duplicates have been resolved
    let hasUnresolved = false
    for (const so of plan.strategicObjectives) {
      if (so.duplicateOf && !so.action) { hasUnresolved = true; break }
      for (const oo of so.operationalObjectives) {
        if (oo.duplicateOf && !oo.action) { hasUnresolved = true; break }
        for (const t of oo.tasks) {
          if (t.duplicateOf && !t.action) { hasUnresolved = true; break }
        }
        if (hasUnresolved) break
      }
      if (hasUnresolved) break
    }

    if (hasUnresolved) {
      setError('Please resolve all duplicate flags before proceeding.')
      return
    }

    setError(null)
    setCurrentStep('confirm')
  }, [plan])

  // ── Step 3: Persist ──
  const handlePersist = useCallback(async () => {
    if (!plan) return

    setIsPersisting(true)
    setError(null)

    try {
      const result = await persistStrategicPlan(plan)

      if (result.error) {
        setError(result.error)
        return
      }

      toast.success(
        `Created ${result.strategicObjectiveIds.length} strategic objectives, ` +
        `${result.operationalObjectiveIds.length} operational objectives, ` +
        `and ${result.taskCount} tasks` +
        (result.skippedCount > 0 ? ` (${result.skippedCount} skipped)` : '')
      )

      handleOpenChange(false)
      onComplete?.()
    } catch {
      setError('Failed to create the strategic plan. Please try again.')
    } finally {
      setIsPersisting(false)
    }
  }, [plan, handleOpenChange, onComplete])

  // ── Plan mutation helpers ──
  const updateStrategicObjective = useCallback((
    soIndex: number,
    updater: (so: StrategyStrategicObjective) => StrategyStrategicObjective
  ) => {
    setPlan((prev) => {
      if (!prev) return prev
      const next = { ...prev }
      next.strategicObjectives = [...next.strategicObjectives]
      next.strategicObjectives[soIndex] = updater({ ...next.strategicObjectives[soIndex] })
      return next
    })
  }, [])

  const updateOperationalObjective = useCallback((
    soIndex: number,
    ooIndex: number,
    updater: (oo: StrategyOperationalObjective) => StrategyOperationalObjective
  ) => {
    updateStrategicObjective(soIndex, (so) => {
      const oos = [...so.operationalObjectives]
      oos[ooIndex] = updater({ ...oos[ooIndex] })
      return { ...so, operationalObjectives: oos }
    })
  }, [updateStrategicObjective])

  const updateTask = useCallback((
    soIndex: number,
    ooIndex: number,
    taskIndex: number,
    updater: (t: StrategyTask) => StrategyTask
  ) => {
    updateOperationalObjective(soIndex, ooIndex, (oo) => {
      const tasks = [...oo.tasks]
      tasks[taskIndex] = updater({ ...tasks[taskIndex] })
      return { ...oo, tasks }
    })
  }, [updateOperationalObjective])

  // ── Compute summary stats ──
  const summaryStats = plan ? (() => {
    let strategicCount = 0
    let operationalCount = 0
    let taskCount = 0
    let skippedCount = 0

    for (const so of plan.strategicObjectives) {
      if (so.action === 'skip') { skippedCount++; continue }
      strategicCount++
      for (const oo of so.operationalObjectives) {
        if (oo.action === 'skip') { skippedCount++; continue }
        operationalCount++
        for (const t of oo.tasks) {
          if (t.action === 'skip') { skippedCount++; continue }
          taskCount++
        }
      }
    }

    return { strategicCount, operationalCount, taskCount, skippedCount }
  })() : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import from Transcript</DialogTitle>
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
                  'flex items-center justify-center rounded-full h-8 w-8 shrink-0 transition-colors',
                  isActive && 'bg-international-orange text-white',
                  isCompleted && !isActive && 'bg-orange-100 text-international-orange',
                  !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className={cn(
                  'text-xs font-medium hidden sm:block',
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {step.title}
                </span>
              </div>
            )
          })}
        </div>

        {/* ── Error Display ── */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* ── Step Content ── */}
        <ScrollArea className="flex-1 max-h-[60vh]">
          <div className="p-1">
            {currentStep === 'input' && (
              <StepInput
                rawText={rawText}
                onRawTextChange={setRawText}
                maxLength={MAX_INPUT_LENGTH}
              />
            )}

            {currentStep === 'review' && plan && (
              <StepReview
                plan={plan}
                onUpdateStrategicObjective={updateStrategicObjective}
                onUpdateOperationalObjective={updateOperationalObjective}
                onUpdateTask={updateTask}
              />
            )}

            {currentStep === 'confirm' && plan && summaryStats && (
              <StepConfirm plan={plan} stats={summaryStats} />
            )}
          </div>
        </ScrollArea>

        {/* ── Footer Navigation ── */}
        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <Button
              variant="secondary"
              onClick={() => {
                setError(null)
                if (isFirstStep) {
                  handleOpenChange(false)
                } else {
                  const prevStep = STEPS[currentStepIndex - 1]
                  setCurrentStep(prevStep.id)
                }
              }}
              disabled={isAnalyzing || isPersisting}
            >
              {isFirstStep ? 'Cancel' : (
                <>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </>
              )}
            </Button>

            {currentStep === 'input' && (
              <Button
                onClick={handleAnalyze}
                disabled={isAnalyzing || rawText.trim().length < 50}
                className="bg-international-orange hover:bg-international-orange-hover"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Analyze Text
                  </>
                )}
              </Button>
            )}

            {currentStep === 'review' && (
              <Button
                onClick={handleGoToConfirm}
                className="bg-international-orange hover:bg-international-orange-hover"
              >
                Review Summary
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}

            {currentStep === 'confirm' && (
              <Button
                onClick={handlePersist}
                disabled={isPersisting}
                className="bg-international-orange hover:bg-international-orange-hover"
              >
                {isPersisting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Create All
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
// STEP 1: INPUT
// ============================================================================

function StepInput({
  rawText,
  onRawTextChange,
  maxLength,
}: {
  rawText: string
  onRawTextChange: (text: string) => void
  maxLength: number
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">
          Paste your transcript or notes
        </h3>
        <p className="text-sm text-muted-foreground">
          Paste a meeting transcript, brainstorm notes, or strategic discussion.
          The AI will extract strategic objectives, operational initiatives, and
          actionable tasks with dates.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="transcript-input">
          Raw text <span className="text-destructive" aria-label="required">*</span>
        </Label>
        <Textarea
          id="transcript-input"
          value={rawText}
          onChange={(e) => onRawTextChange(e.target.value)}
          placeholder="Paste your meeting transcript, notes, or strategic discussion here..."
          className="min-h-[300px] font-mono text-sm"
          maxLength={maxLength}
          aria-required
        />
        <p className="text-xs text-muted-foreground">
          {rawText.length.toLocaleString()} / {maxLength.toLocaleString()} characters
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// STEP 2: REVIEW
// ============================================================================

function StepReview({
  plan,
  onUpdateStrategicObjective,
  onUpdateOperationalObjective,
  onUpdateTask,
}: {
  plan: ParsedStrategicPlan
  onUpdateStrategicObjective: (i: number, updater: (so: StrategyStrategicObjective) => StrategyStrategicObjective) => void
  onUpdateOperationalObjective: (soI: number, ooI: number, updater: (oo: StrategyOperationalObjective) => StrategyOperationalObjective) => void
  onUpdateTask: (soI: number, ooI: number, tI: number, updater: (t: StrategyTask) => StrategyTask) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Review your strategic plan</h3>
        <p className="text-sm text-muted-foreground">
          Edit titles, adjust dates, and resolve any duplicate flags before creating.
        </p>
      </div>

      {/* Strategic Objectives */}
      {plan.strategicObjectives.map((so, soIndex) => (
        <div key={soIndex} className="space-y-4">
          {/* Strategic Objective Header */}
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Flag className="h-4 w-4 text-international-orange shrink-0" />
                <Input
                  value={so.title}
                  onChange={(e) => onUpdateStrategicObjective(soIndex, (s) => ({ ...s, title: e.target.value }))}
                  className="font-semibold text-base border-none bg-transparent p-0 h-auto focus-visible:ring-0"
                  aria-label="Strategic objective title"
                />
              </div>
              {so.action === 'skip' && (
                <Badge variant="secondary">Skipped</Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground pl-6">{so.description}</p>

            {/* Duplicate warning */}
            {so.duplicateOf && (
              <DuplicateWarning
                existingTitle={so.duplicateOf.title}
                similarity={so.duplicateOf.similarity}
                action={so.action}
                onActionChange={(action) => onUpdateStrategicObjective(soIndex, (s) => ({ ...s, action }))}
              />
            )}

            {/* Operational Objectives */}
            {so.action !== 'skip' && so.operationalObjectives.map((oo, ooIndex) => (
              <div key={ooIndex} className="ml-4 border-l-2 border-international-orange/20 pl-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Target className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Input
                      value={oo.title}
                      onChange={(e) => onUpdateOperationalObjective(soIndex, ooIndex, (o) => ({ ...o, title: e.target.value }))}
                      className="text-sm font-medium border-none bg-transparent p-0 h-auto focus-visible:ring-0"
                      aria-label="Operational objective title"
                    />
                  </div>
                  <Badge className={cn('text-xs shrink-0', PRIORITY_COLORS[oo.priority])}>
                    {oo.priority}
                  </Badge>
                </div>

                {/* Duplicate warning for operational objective */}
                {oo.duplicateOf && (
                  <DuplicateWarning
                    existingTitle={oo.duplicateOf.title}
                    similarity={oo.duplicateOf.similarity}
                    action={oo.action}
                    onActionChange={(action) => onUpdateOperationalObjective(soIndex, ooIndex, (o) => ({ ...o, action }))}
                  />
                )}

                {/* Tasks */}
                {oo.action !== 'skip' && (
                  <div className="space-y-2">
                    {oo.tasks.map((task, taskIndex) => (
                      <TaskRow
                        key={taskIndex}
                        task={task}
                        onUpdate={(updater) => onUpdateTask(soIndex, ooIndex, taskIndex, updater)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Blind Spots */}
      {plan.blindSpots && plan.blindSpots.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-status-warning" />
            Blind Spots & Risks
          </h4>
          {plan.blindSpots.map((spot, i) => (
            <div
              key={i}
              className={cn(
                'border-l-4 rounded-r-lg p-3 bg-muted/30',
                SEVERITY_COLORS[spot.severity]
              )}
            >
              <p className="text-sm font-medium">{spot.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{spot.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Key Decisions */}
      {plan.keyDecisions && plan.keyDecisions.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-status-info" />
            Key Decisions
          </h4>
          {plan.keyDecisions.map((decision, i) => (
            <div key={i} className="border rounded-lg p-3 bg-muted/30">
              <p className="text-sm">{decision.decision}</p>
              {(decision.owner || decision.deadline) && (
                <p className="text-xs text-muted-foreground mt-1">
                  {decision.owner && <span>Owner: {decision.owner}</span>}
                  {decision.owner && decision.deadline && <span> &middot; </span>}
                  {decision.deadline && <span>By: {decision.deadline}</span>}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// TASK ROW (within review step)
// ============================================================================

function TaskRow({
  task,
  onUpdate,
}: {
  task: StrategyTask
  onUpdate: (updater: (t: StrategyTask) => StrategyTask) => void
}) {
  const isSkipped = task.action === 'skip'

  return (
    <div className={cn(
      'border rounded-md p-3 space-y-2 transition-opacity',
      isSkipped && 'opacity-50'
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Input
            value={task.title}
            onChange={(e) => onUpdate((t) => ({ ...t, title: e.target.value }))}
            className="text-sm border-none bg-transparent p-0 h-auto focus-visible:ring-0"
            disabled={isSkipped}
            aria-label="Task title"
          />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className="text-xs">
            {task.risk_level}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onUpdate((t) => ({ ...t, action: t.action === 'skip' ? 'keep' : 'skip' }))}
            aria-label={isSkipped ? 'Include task' : 'Skip task'}
          >
            {isSkipped ? <ArrowRight className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />}
          </Button>
        </div>
      </div>

      {!isSkipped && (
        <>
          {/* Date pickers */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <Input
                type="date"
                value={task.start_date}
                onChange={(e) => onUpdate((t) => ({ ...t, start_date: e.target.value }))}
                className="h-7 text-xs w-[130px]"
                aria-label="Start date"
              />
            </div>
            <span className="text-muted-foreground">to</span>
            <Input
              type="date"
              value={task.end_date}
              onChange={(e) => onUpdate((t) => ({ ...t, end_date: e.target.value }))}
              className="h-7 text-xs w-[130px]"
              aria-label="End date"
            />
            {task.assignee_hint && (
              <span className="text-muted-foreground ml-auto truncate max-w-[150px]">
                {task.assignee_hint}
              </span>
            )}
          </div>

          {/* Duplicate warning */}
          {task.duplicateOf && (
            <DuplicateWarning
              existingTitle={task.duplicateOf.title}
              similarity={task.duplicateOf.similarity}
              action={task.action}
              onActionChange={(action) => onUpdate((t) => ({ ...t, action }))}
              compact
            />
          )}
        </>
      )}
    </div>
  )
}

// ============================================================================
// DUPLICATE WARNING
// ============================================================================

function DuplicateWarning({
  existingTitle,
  similarity,
  action,
  onActionChange,
  compact = false,
}: {
  existingTitle: string
  similarity: number
  action?: 'keep' | 'skip' | 'merge'
  onActionChange: (action: 'keep' | 'skip' | 'merge') => void
  compact?: boolean
}) {
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-md bg-status-warning-light p-2',
      compact ? 'text-xs' : 'text-sm'
    )}>
      <Copy className={cn('shrink-0 text-status-warning', compact ? 'h-3 w-3' : 'h-4 w-4')} />
      <span className="text-status-warning-dark min-w-0 truncate flex-1">
        Possible duplicate of &ldquo;{existingTitle}&rdquo; ({Math.round(similarity * 100)}% match)
      </span>
      <Select
        value={action || ''}
        onValueChange={(v) => onActionChange(v as 'keep' | 'skip' | 'merge')}
      >
        <SelectTrigger className={cn('w-[100px] shrink-0', compact ? 'h-6 text-xs' : 'h-8 text-xs')}>
          <SelectValue placeholder="Resolve" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="keep">Keep</SelectItem>
          <SelectItem value="skip">Skip</SelectItem>
          <SelectItem value="merge">Merge</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

// ============================================================================
// STEP 3: CONFIRM
// ============================================================================

function StepConfirm({
  plan,
  stats,
}: {
  plan: ParsedStrategicPlan
  stats: { strategicCount: number; operationalCount: number; taskCount: number; skippedCount: number }
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">
          Ready to create your strategic plan
        </h3>
        <p className="text-sm text-muted-foreground">
          Review the summary below and click &ldquo;Create All&rdquo; to add everything to your workspace.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Strategic Pillars"
          value={stats.strategicCount}
          icon={Flag}
          color="text-international-orange"
        />
        <SummaryCard
          label="Objectives"
          value={stats.operationalCount}
          icon={Target}
          color="text-electric-blue"
        />
        <SummaryCard
          label="Tasks"
          value={stats.taskCount}
          icon={CheckCircle2}
          color="text-status-success"
        />
        {stats.skippedCount > 0 && (
          <SummaryCard
            label="Skipped"
            value={stats.skippedCount}
            icon={Trash2}
            color="text-muted-foreground"
          />
        )}
      </div>

      {/* Breakdown */}
      <div className="space-y-3">
        {plan.strategicObjectives
          .filter((so) => so.action !== 'skip')
          .map((so, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-international-orange" />
                <span className="font-medium text-sm">{so.title}</span>
              </div>
              {so.operationalObjectives
                .filter((oo) => oo.action !== 'skip')
                .map((oo, j) => {
                  const activeTasks = oo.tasks.filter((t) => t.action !== 'skip')
                  return (
                    <div key={j} className="ml-6 flex items-center gap-2 text-sm text-muted-foreground">
                      <Target className="h-3 w-3" />
                      <span>{oo.title}</span>
                      <span className="ml-auto text-xs">{activeTasks.length} tasks</span>
                    </div>
                  )
                })}
            </div>
          ))}
      </div>

      {/* Blind spots note */}
      {plan.blindSpots && plan.blindSpots.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {plan.blindSpots.length} blind spot{plan.blindSpots.length !== 1 ? 's' : ''} will be saved
          as strategic risks on the first pillar.
        </p>
      )}
    </div>
  )
}

// ============================================================================
// SUMMARY CARD
// ============================================================================

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="border rounded-lg p-3 text-center space-y-1">
      <Icon className={cn('h-5 w-5 mx-auto', color)} />
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
