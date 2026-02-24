'use client'

/**
 * @file goal-wizard-dialog.tsx
 *
 * @description Multi-step wizard for creating a strategic goal with
 * auto-generated milestones and ghost objectives/tasks. Three steps:
 *
 * 1. Define Your Goal — name, target date, type, success criteria
 * 2. Milestone Spine — toggle/preview auto-calculated milestones
 * 3. Suggested Work — AI-suggested ghost objectives + tasks
 *
 * Follows the same wizard stepper pattern as CompanyPurposeDialog.
 *
 * @component GoalWizardDialog
 *
 * @example
 * <GoalWizardDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   onGoalCreated={(goalId) => setSelectedGoalId(goalId)}
 * />
 *
 * @related
 * - Pattern: src/components/objectives/company-purpose-dialog.tsx
 * - Server actions: src/actions/canvas.ts
 * - Types: src/types/canvas.ts
 */

import { useState, useTransition, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputWithSpeech } from '@/components/ui/input-with-speech'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TextareaWithSpeech } from '@/components/ui/textarea-with-speech'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePickerWithShortcuts } from '@/components/ui/date-picker-with-shortcuts'
import {
  Target,
  Milestone as MilestoneIcon,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Info,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import {
  createStrategicGoal,
  createMilestones,
  createCanvasObjective,
  createCanvasTask,
} from '@/actions/canvas'
import { GOAL_TYPES, type GoalType } from '@/types/canvas'

// ============================================================================
// TYPES
// ============================================================================

interface GoalWizardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after goal + milestones + ghosts are created */
  onGoalCreated?: (goalId: string) => void
}

type WizardStep = 'define' | 'milestones' | 'suggestions'

// ============================================================================
// STEP DEFINITIONS
// ============================================================================

const STEPS: { id: WizardStep; title: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'define', title: 'Define Your Goal', icon: Target },
  { id: 'milestones', title: 'Milestone Spine', icon: MilestoneIcon },
  { id: 'suggestions', title: 'Suggested Work', icon: Sparkles },
]

// ============================================================================
// FUNDRAISE MILESTONE TEMPLATE
// ============================================================================

const FUNDRAISE_MILESTONES_FULL = [
  'Deck + narrative complete',
  'Investor list finalized',
  'Outreach launched',
  'Initial meetings booked',
  'Partner meetings complete',
  'Diligence & data room complete',
  'Term sheet agreed',
  'Close round',
] as const

const FUNDRAISE_MILESTONES_COMPRESSED = [
  'Deck + narrative complete',
  'Investor list finalized',
  'Initial meetings booked',
  'Term sheet agreed',
  'Close round',
] as const

const FUNDRAISE_MILESTONES_MINIMAL = [
  'Deck + narrative complete',
  'Term sheet agreed',
  'Close round',
] as const

// ============================================================================
// GHOST TEMPLATE — FUNDRAISE
// ============================================================================

interface GhostTaskTemplate {
  title: string
  checked: boolean
}

interface GhostObjectiveTemplate {
  title: string
  linkedMilestone: string
  checked: boolean
  tasks: GhostTaskTemplate[]
}

function buildFundraiseGhosts(): GhostObjectiveTemplate[] {
  return [
    {
      title: 'Narrative & positioning',
      linkedMilestone: 'Deck + narrative complete',
      checked: true,
      tasks: [
        { title: 'Define fundraising story and why-now', checked: true },
        { title: 'Competitive landscape + differentiation', checked: true },
      ],
    },
    {
      title: 'Deck & materials',
      linkedMilestone: 'Deck + narrative complete',
      checked: true,
      tasks: [
        { title: 'Draft pitch deck v1', checked: true },
        { title: 'Prepare financial model + assumptions', checked: true },
        { title: 'Create metrics/KPI pack', checked: true },
      ],
    },
    {
      title: 'Data room readiness',
      linkedMilestone: 'Diligence & data room complete',
      checked: true,
      tasks: [
        {
          title:
            'Assemble legal docs (cap table, articles, prior financings)',
          checked: true,
        },
        {
          title: 'Assemble commercial docs (contracts, pipeline)',
          checked: true,
        },
      ],
    },
    {
      title: 'Investor targeting',
      linkedMilestone: 'Investor list finalized',
      checked: true,
      tasks: [
        { title: 'Build target investor list (tiers 1–3)', checked: true },
        { title: 'Find warm intro paths', checked: true },
      ],
    },
    {
      title: 'Outreach & pipeline',
      linkedMilestone: 'Outreach launched',
      checked: true,
      tasks: [
        { title: 'Outreach messaging + email sequences', checked: true },
        { title: 'Schedule initial meetings', checked: true },
      ],
    },
    {
      title: 'Process management',
      linkedMilestone: 'Partner meetings complete',
      checked: true,
      tasks: [
        { title: 'Weekly investor pipeline review', checked: true },
        { title: 'Q&A log and diligence tracker', checked: true },
      ],
    },
  ]
}

// ============================================================================
// MILESTONE DATE CALCULATION
// ============================================================================

interface MilestoneEntry {
  title: string
  dueDate: Date
  enabled: boolean
}

type TimelineBand = 'normal' | 'compressed' | 'tight' | 'minimal'

/**
 * Calculate milestone due dates working backwards from the target date.
 *
 * @param targetDate - The goal's target date
 * @param goalType - The selected goal type
 * @returns Array of milestones with calculated dates and the timeline band
 */
function calculateMilestones(
  targetDate: Date,
  goalType: GoalType
): { milestones: MilestoneEntry[]; band: TimelineBand } {
  if (goalType !== 'Fundraise') {
    return { milestones: [], band: 'normal' }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(targetDate)
  target.setHours(0, 0, 0, 0)
  const totalDays = Math.max(
    1,
    Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  )

  let titles: readonly string[]
  let band: TimelineBand

  if (totalDays >= 112) {
    // 16+ weeks: full template, evenly spaced
    titles = FUNDRAISE_MILESTONES_FULL
    band = 'normal'
  } else if (totalDays >= 56) {
    // 8-16 weeks: full template, compressed
    titles = FUNDRAISE_MILESTONES_FULL
    band = 'compressed'
  } else if (totalDays >= 28) {
    // 4-8 weeks: simplified
    titles = FUNDRAISE_MILESTONES_COMPRESSED
    band = 'tight'
  } else {
    // < 4 weeks: minimal
    titles = FUNDRAISE_MILESTONES_MINIMAL
    band = 'minimal'
  }

  const count = titles.length
  // Space milestones evenly between today and target date
  const milestones: MilestoneEntry[] = titles.map((title, idx) => {
    // First milestone gets ~15% of range, last gets target date
    const fraction = (idx + 1) / count
    const daysFromNow = Math.round(totalDays * fraction)
    const dueDate = new Date(today)
    dueDate.setDate(dueDate.getDate() + daysFromNow)

    return {
      title,
      dueDate,
      enabled: true,
    }
  })

  return { milestones, band }
}

// ============================================================================
// DATE FORMATTING
// ============================================================================

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function GoalWizardDialog({
  open,
  onOpenChange,
  onGoalCreated,
}: GoalWizardDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [currentStep, setCurrentStep] = useState<WizardStep>('define')
  const [error, setError] = useState<string | null>(null)

  // Step 1 state
  const [goalName, setGoalName] = useState('')
  const [targetDate, setTargetDate] = useState<Date | undefined>(undefined)
  const [goalType, setGoalType] = useState<GoalType>('Fundraise')
  const [successCriteria, setSuccessCriteria] = useState('')

  // Step 2 state
  const [milestones, setMilestones] = useState<MilestoneEntry[]>([])
  const [timelineBand, setTimelineBand] = useState<TimelineBand>('normal')

  // Step 3 state
  const [ghosts, setGhosts] = useState<GhostObjectiveTemplate[]>([])
  const [expandedObjectives, setExpandedObjectives] = useState<Set<number>>(
    new Set()
  )

  // -- Step navigation helpers --
  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep)
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === STEPS.length - 1

  // -- Reset on close --
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        // Reset all state
        setCurrentStep('define')
        setError(null)
        setGoalName('')
        setTargetDate(undefined)
        setGoalType('Fundraise')
        setSuccessCriteria('')
        setMilestones([])
        setGhosts([])
        setExpandedObjectives(new Set())
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange]
  )

  // -- Validation --
  const validateStep = (step: WizardStep): boolean => {
    switch (step) {
      case 'define':
        if (!goalName.trim()) {
          setError('Please enter a goal name')
          return false
        }
        if (!targetDate) {
          setError('Please select a target date')
          return false
        }
        return true
      case 'milestones':
        // No hard validation — user can toggle off all milestones
        return true
      case 'suggestions':
        return true
      default:
        return true
    }
  }

  // -- Step transitions --
  const goToNextStep = () => {
    if (!validateStep(currentStep)) return
    setError(null)

    const nextIndex = currentStepIndex + 1
    if (nextIndex >= STEPS.length) return

    const nextStep = STEPS[nextIndex].id

    // Calculate milestones when leaving Step 1
    if (currentStep === 'define' && targetDate) {
      const result = calculateMilestones(targetDate, goalType)
      setMilestones(result.milestones)
      setTimelineBand(result.band)
    }

    // Build ghost suggestions when entering Step 3
    if (nextStep === 'suggestions' && goalType === 'Fundraise') {
      setGhosts(buildFundraiseGhosts())
      // Auto-expand all objectives
      setExpandedObjectives(
        new Set(buildFundraiseGhosts().map((_, i) => i))
      )
    }

    setCurrentStep(nextStep)

    // Focus first input in next step
    setTimeout(() => {
      const firstInput = document.querySelector<
        HTMLInputElement | HTMLTextAreaElement
      >('input:not([disabled]), textarea:not([disabled])')
      firstInput?.focus()
    }, 100)
  }

  const goToPrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(STEPS[currentStepIndex - 1].id)
      setError(null)
    }
  }

  // -- Milestone toggle --
  const toggleMilestone = (index: number) => {
    setMilestones((prev) =>
      prev.map((ms, i) =>
        i === index ? { ...ms, enabled: !ms.enabled } : ms
      )
    )
  }

  // -- Ghost toggles --
  const toggleGhostObjective = (objIdx: number) => {
    setGhosts((prev) =>
      prev.map((obj, i) => {
        if (i !== objIdx) return obj
        const nextChecked = !obj.checked
        return {
          ...obj,
          checked: nextChecked,
          tasks: obj.tasks.map((t) => ({ ...t, checked: nextChecked })),
        }
      })
    )
  }

  const toggleGhostTask = (objIdx: number, taskIdx: number) => {
    setGhosts((prev) =>
      prev.map((obj, i) => {
        if (i !== objIdx) return obj
        const newTasks = obj.tasks.map((t, ti) =>
          ti === taskIdx ? { ...t, checked: !t.checked } : t
        )
        // If any task is checked, the objective stays checked
        const anyChecked = newTasks.some((t) => t.checked)
        return { ...obj, tasks: newTasks, checked: anyChecked }
      })
    )
  }

  const toggleObjectiveExpand = (objIdx: number) => {
    setExpandedObjectives((prev) => {
      const next = new Set(prev)
      if (next.has(objIdx)) next.delete(objIdx)
      else next.add(objIdx)
      return next
    })
  }

  // -- Submit --
  const handleSubmit = async () => {
    startTransition(async () => {
      try {
        // 1. Create strategic goal
        const goalResult = await createStrategicGoal({
          title: goalName.trim(),
          goal_type: goalType,
          target_date: targetDate!.toISOString(),
          description: successCriteria.trim() || undefined,
        })

        if ('error' in goalResult) {
          setError(goalResult.error)
          return
        }

        const goalId = goalResult.data.id

        // 2. Create enabled milestones
        const enabledMilestones = milestones.filter((ms) => ms.enabled)
        const milestoneMap = new Map<string, string>() // title → id

        if (enabledMilestones.length > 0) {
          const msResult = await createMilestones(
            goalId,
            enabledMilestones.map((ms, idx) => ({
              title: ms.title,
              due_date: ms.dueDate.toISOString(),
              order_index: idx,
            }))
          )

          if ('error' in msResult) {
            // Goal created but milestones failed — still usable
            console.error(
              '[GoalWizard] Failed to create milestones:',
              msResult.error
            )
          } else {
            // Build title → milestone ID map for ghost linking
            for (const ms of msResult.data) {
              milestoneMap.set(ms.title, ms.id)
            }
          }
        }

        // 3. Create ghost objectives + tasks
        const checkedGhosts = ghosts.filter((g) => g.checked)

        for (const ghost of checkedGhosts) {
          // Find the milestone this ghost links to
          const milestoneId = milestoneMap.get(ghost.linkedMilestone)
          if (!milestoneId) continue // Milestone was toggled off or not found

          const objResult = await createCanvasObjective({
            title: ghost.title,
            milestone_id: milestoneId,
            is_ghost: true,
            ghost_source: 'template',
            ghost_rationale:
              'Auto-generated from Fundraise template',
          })

          if ('error' in objResult) {
            console.error(
              '[GoalWizard] Failed to create ghost objective:',
              ghost.title,
              objResult.error
            )
            continue
          }

          const objectiveId = objResult.data.id

          // Create checked tasks for this objective
          const checkedTasks = ghost.tasks.filter((t) => t.checked)
          for (const task of checkedTasks) {
            const taskResult = await createCanvasTask({
              title: task.title,
              objective_id: objectiveId,
              is_ghost: true,
              ghost_source: 'template',
              ghost_rationale:
                'Auto-generated from Fundraise template',
            })

            if ('error' in taskResult) {
              console.error(
                '[GoalWizard] Failed to create ghost task:',
                task.title,
                taskResult.error
              )
            }
          }
        }

        // 4. Success
        toast.success('Strategic goal created with timeline')
        handleOpenChange(false)
        onGoalCreated?.(goalId)
      } catch (err) {
        setError('An unexpected error occurred')
        console.error('[GoalWizard] Submit error:', err)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-international-orange" />
            Create Strategic Goal
          </DialogTitle>
        </DialogHeader>

        {/* ============================================================ */}
        {/* PROGRESS STEPPER                                              */}
        {/* ============================================================ */}
        <div className="flex items-center gap-2 mb-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            const isActive = step.id === currentStep
            const isCompleted = index < currentStepIndex

            return (
              <div
                key={step.id}
                className={cn(
                  'flex items-center gap-2 flex-1',
                  index > 0 && 'pl-2'
                )}
              >
                {index > 0 && (
                  <div
                    className={cn(
                      'h-0.5 flex-1',
                      isCompleted
                        ? 'bg-international-orange'
                        : 'bg-muted'
                    )}
                  />
                )}
                <div
                  className={cn(
                    'flex items-center justify-center rounded-full h-8 w-8 transition-colors',
                    isActive && 'bg-international-orange text-white',
                    isCompleted &&
                      !isActive &&
                      'bg-orange-100 text-international-orange',
                    !isActive &&
                      !isCompleted &&
                      'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            )
          })}
        </div>

        {/* ============================================================ */}
        {/* STEP CONTENT                                                  */}
        {/* ============================================================ */}
        <ScrollArea className="flex-1 max-h-[55vh]">
          <div className="space-y-4 py-2 pr-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* STEP 1: Define Your Goal */}
            {currentStep === 'define' && (
              <StepDefineGoal
                goalName={goalName}
                onGoalNameChange={setGoalName}
                targetDate={targetDate}
                onTargetDateChange={setTargetDate}
                goalType={goalType}
                onGoalTypeChange={setGoalType}
                successCriteria={successCriteria}
                onSuccessCriteriaChange={setSuccessCriteria}
              />
            )}

            {/* STEP 2: Milestone Spine */}
            {currentStep === 'milestones' && (
              <StepMilestoneSpine
                goalType={goalType}
                milestones={milestones}
                timelineBand={timelineBand}
                onToggle={toggleMilestone}
              />
            )}

            {/* STEP 3: Suggested Work */}
            {currentStep === 'suggestions' && (
              <StepSuggestedWork
                goalType={goalType}
                ghosts={ghosts}
                expandedObjectives={expandedObjectives}
                enabledMilestones={milestones
                  .filter((ms) => ms.enabled)
                  .map((ms) => ms.title)}
                onToggleObjective={toggleGhostObjective}
                onToggleTask={toggleGhostTask}
                onToggleExpand={toggleObjectiveExpand}
              />
            )}
          </div>
        </ScrollArea>

        {/* ============================================================ */}
        {/* FOOTER NAVIGATION                                             */}
        {/* ============================================================ */}
        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <Button
              type="button"
              variant="secondary"
              onClick={
                isFirstStep ? () => handleOpenChange(false) : goToPrevStep
              }
              disabled={isPending}
            >
              {isFirstStep ? (
                'Cancel'
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Back
                </>
              )}
            </Button>

            {isLastStep ? (
              <Button
                onClick={handleSubmit}
                disabled={isPending}
                className="bg-international-orange hover:bg-international-orange-hover"
              >
                {isPending ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Creating…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Create Goal
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={goToNextStep} disabled={isPending}>
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// STEP 1: DEFINE YOUR GOAL
// ============================================================================

function StepDefineGoal({
  goalName,
  onGoalNameChange,
  targetDate,
  onTargetDateChange,
  goalType,
  onGoalTypeChange,
  successCriteria,
  onSuccessCriteriaChange,
}: {
  goalName: string
  onGoalNameChange: (v: string) => void
  targetDate: Date | undefined
  onTargetDateChange: (v: Date | undefined) => void
  goalType: GoalType
  onGoalTypeChange: (v: GoalType) => void
  successCriteria: string
  onSuccessCriteriaChange: (v: string) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold mb-1">
          What's the big outcome you're working towards?
        </h3>
        <p className="text-sm text-muted-foreground">
          Define a clear strategic goal. We'll help you build a timeline working
          backwards from your target date.
        </p>
      </div>

      {/* Goal name */}
      <div className="space-y-2">
        <Label htmlFor="goal-name">
          Goal name{' '}
          <span className="text-destructive" aria-label="required">
            *
          </span>
        </Label>
        <InputWithSpeech
          enableSpeech
          id="goal-name"
          value={goalName}
          onChange={(e) => onGoalNameChange(e.target.value)}
          onSpeechTranscript={(text) => onGoalNameChange(goalName ? goalName + " " + text : text)}
          placeholder="e.g., Raise £2M Seed Round"
          maxLength={200}
          aria-required="true"
        />
        <p className="text-xs text-muted-foreground">
          {goalName.length} / 200 characters
        </p>
      </div>

      {/* Target date */}
      <div className="space-y-2">
        <Label>
          Target date{' '}
          <span className="text-destructive" aria-label="required">
            *
          </span>
        </Label>
        <DatePickerWithShortcuts
          date={targetDate}
          onDateChange={onTargetDateChange}
          placeholder="When do you want to achieve this?"
        />
      </div>

      {/* Goal type */}
      <div className="space-y-2">
        <Label htmlFor="goal-type">Goal type</Label>
        <Select
          value={goalType}
          onValueChange={(v) => onGoalTypeChange(v as GoalType)}
        >
          <SelectTrigger id="goal-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GOAL_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {goalType === 'Fundraise'
            ? 'Fundraise goals include milestone and task templates'
            : 'Custom templates coming soon — milestones can be added manually'}
        </p>
      </div>

      {/* Success criteria */}
      <div className="space-y-2">
        <Label htmlFor="success-criteria">Success criteria</Label>
        <TextareaWithSpeech
          enableSpeech
          id="success-criteria"
          value={successCriteria}
          onChange={(e) => onSuccessCriteriaChange(e.target.value)}
          onSpeechTranscript={(text) => onSuccessCriteriaChange(successCriteria ? successCriteria + " " + text : text)}
          placeholder="How will you know you've achieved this?"
          rows={3}
          maxLength={500}
        />
        <p className="text-xs text-muted-foreground">
          {successCriteria.length} / 500 characters · Optional
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// STEP 2: MILESTONE SPINE
// ============================================================================

function StepMilestoneSpine({
  goalType,
  milestones,
  timelineBand,
  onToggle,
}: {
  goalType: GoalType
  milestones: MilestoneEntry[]
  timelineBand: TimelineBand
  onToggle: (index: number) => void
}) {
  // Non-fundraise: show message
  if (goalType !== 'Fundraise') {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-1">Milestones</h3>
          <p className="text-sm text-muted-foreground">
            Custom goal — milestones will be added manually after creation.
          </p>
        </div>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            After creating this goal, you can add milestones directly on the
            Canvas timeline.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-1">
          These milestones will form your critical path
        </h3>
        <p className="text-sm text-muted-foreground">
          Toggle off any that don't apply. Dates are auto-calculated working
          backwards from your target.
        </p>
      </div>

      {/* Timeline band warnings */}
      {timelineBand === 'tight' && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Timeline compressed — template simplified to 5 key milestones.
          </AlertDescription>
        </Alert>
      )}
      {timelineBand === 'minimal' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Very tight timeline — only essential milestones included. Consider
            extending your target date.
          </AlertDescription>
        </Alert>
      )}

      {/* Milestone list */}
      <div className="space-y-2">
        {milestones.map((ms, idx) => (
          <label
            key={idx}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors',
              ms.enabled
                ? 'bg-background border-border hover:bg-muted/50'
                : 'bg-muted/30 border-border/50 opacity-60'
            )}
          >
            <Checkbox
              checked={ms.enabled}
              onCheckedChange={() => onToggle(idx)}
            />
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  'text-sm font-medium',
                  ms.enabled ? 'text-foreground' : 'text-muted-foreground line-through'
                )}
              >
                {ms.title}
              </p>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDate(ms.dueDate)}
            </span>
          </label>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {milestones.filter((m) => m.enabled).length} of {milestones.length}{' '}
        milestones enabled
      </p>
    </div>
  )
}

// ============================================================================
// STEP 3: SUGGESTED WORK (GHOST OBJECTIVES + TASKS)
// ============================================================================

function StepSuggestedWork({
  goalType,
  ghosts,
  expandedObjectives,
  enabledMilestones,
  onToggleObjective,
  onToggleTask,
  onToggleExpand,
}: {
  goalType: GoalType
  ghosts: GhostObjectiveTemplate[]
  expandedObjectives: Set<number>
  enabledMilestones: string[]
  onToggleObjective: (objIdx: number) => void
  onToggleTask: (objIdx: number, taskIdx: number) => void
  onToggleExpand: (objIdx: number) => void
}) {
  if (goalType !== 'Fundraise') {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-1">Suggested work</h3>
          <p className="text-sm text-muted-foreground">
            Templates for this goal type are coming soon. You can add objectives
            and tasks manually after creation.
          </p>
        </div>
      </div>
    )
  }

  // Filter ghosts to only those whose linked milestone is enabled
  const availableGhosts = ghosts.map((g, idx) => ({
    ...g,
    originalIndex: idx,
    milestoneEnabled: enabledMilestones.includes(g.linkedMilestone),
  }))

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-1">
          AI-suggested objectives and tasks
        </h3>
        <p className="text-sm text-muted-foreground">
          These will appear as suggestions (ghost nodes) on your Canvas. Accept
          or reject them anytime.
        </p>
      </div>

      <div className="space-y-2">
        {availableGhosts.map((ghost) => {
          const isExpanded = expandedObjectives.has(ghost.originalIndex)
          const isDisabled = !ghost.milestoneEnabled

          return (
            <div
              key={ghost.originalIndex}
              className={cn(
                'rounded-lg border transition-colors',
                isDisabled && 'opacity-40'
              )}
            >
              {/* Objective header */}
              <div
                className={cn(
                  'flex items-center gap-3 px-4 py-3',
                  !isDisabled && 'cursor-pointer hover:bg-muted/50'
                )}
              >
                <Checkbox
                  checked={ghost.checked && !isDisabled}
                  disabled={isDisabled}
                  onCheckedChange={() =>
                    onToggleObjective(ghost.originalIndex)
                  }
                />
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left"
                  onClick={() => onToggleExpand(ghost.originalIndex)}
                  disabled={isDisabled}
                >
                  <p className="text-sm font-medium text-foreground">
                    {ghost.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    → {ghost.linkedMilestone}
                    {isDisabled && ' (milestone disabled)'}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleExpand(ghost.originalIndex)}
                  className="text-muted-foreground"
                  disabled={isDisabled}
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Task list (expanded) */}
              {isExpanded && !isDisabled && (
                <div className="border-t px-4 py-2 space-y-1 bg-muted/20">
                  {ghost.tasks.map((task, taskIdx) => (
                    <label
                      key={taskIdx}
                      className="flex items-center gap-3 py-1.5 cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={task.checked}
                        onCheckedChange={() =>
                          onToggleTask(ghost.originalIndex, taskIdx)
                        }
                      />
                      <span
                        className={cn(
                          task.checked
                            ? 'text-foreground'
                            : 'text-muted-foreground line-through'
                        )}
                      >
                        {task.title}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {ghosts.filter((g) => g.checked).length} objectives ·{' '}
        {ghosts.reduce(
          (sum, g) => sum + g.tasks.filter((t) => t.checked).length,
          0
        )}{' '}
        tasks selected
      </p>
    </div>
  )
}
