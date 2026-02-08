'use client'

/**
 * @file create-foundry-dialog.tsx
 * 
 * @description Multi-step wizard dialog for creating a new foundry (business).
 * Enables Apprentices and Executives to start their own business from within
 * the platform without re-registering. Follows the wizard pattern standard.
 * 
 * @component CreateFoundryDialog
 * 
 * @example
 * <CreateFoundryDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 * />
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Building2,
  Rocket,
  Target,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Briefcase,
  Lightbulb,
  TrendingUp,
  DollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createFoundry } from '@/actions/foundry'
import { toast } from 'sonner'

interface CreateFoundryDialogProps {
  /** Whether dialog is open */
  open: boolean
  /** Callback to close dialog */
  onOpenChange: (open: boolean) => void
}

type FormStep = 'name' | 'stage' | 'next_steps'

const STEPS: { id: FormStep; title: string; icon: React.ElementType }[] = [
  { id: 'name', title: 'Your Business', icon: Building2 },
  { id: 'stage', title: 'Your Stage', icon: Rocket },
  { id: 'next_steps', title: 'Get Started', icon: Target },
]

const INDUSTRIES = [
  { value: 'technology', label: 'Technology' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'finance', label: 'Finance' },
  { value: 'education', label: 'Education' },
  { value: 'ecommerce', label: 'E-Commerce' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'creative', label: 'Creative & Design' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'food', label: 'Food & Beverage' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'other', label: 'Other' },
] as const

const STAGES = [
  { value: 'idea', label: 'Just an idea', icon: Lightbulb, description: 'Exploring a concept, haven\'t started yet' },
  { value: 'side_project', label: 'Side project', icon: Briefcase, description: 'Working on it alongside my main role' },
  { value: 'full_time', label: 'Going full-time', icon: TrendingUp, description: 'Committed and building actively' },
  { value: 'revenue', label: 'Earning revenue', icon: DollarSign, description: 'Already making money from this' },
] as const

const COMPANY_NAME_LIMIT = 100

/**
 * CreateFoundryDialog - Multi-step wizard for starting your own business
 * 
 * @description Guides users through 3 steps to create their own foundry:
 * 1. Name & Industry - What's your business called?
 * 2. Stage - Where are you in your journey?
 * 3. Next Steps - What do you want to do first?
 */
export function CreateFoundryDialog({
  open,
  onOpenChange,
}: CreateFoundryDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Form state
  const [companyName, setCompanyName] = useState('')
  const [industry, setIndustry] = useState<string | null>(null)
  const [stage, setStage] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<FormStep>('name')
  const [error, setError] = useState<string | null>(null)

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep)
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === STEPS.length - 1

  function resetForm(): void {
    setCompanyName('')
    setIndustry(null)
    setStage(null)
    setCurrentStep('name')
    setError(null)
  }

  function handleClose(): void {
    if (!isPending) {
      resetForm()
      onOpenChange(false)
    }
  }

  function validateStep(step: FormStep): boolean {
    setError(null)
    switch (step) {
      case 'name':
        if (!companyName.trim()) {
          setError('Please enter your business name')
          return false
        }
        if (companyName.trim().length > COMPANY_NAME_LIMIT) {
          setError(`Business name must be ${COMPANY_NAME_LIMIT} characters or less`)
          return false
        }
        return true
      case 'stage':
        // Stage is optional, always valid
        return true
      case 'next_steps':
        return true
      default:
        return true
    }
  }

  function goToNextStep(): void {
    if (!validateStep(currentStep)) return
    const nextIndex = currentStepIndex + 1
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id)
      setError(null)
    }
  }

  function goToPrevStep(): void {
    const prevIndex = currentStepIndex - 1
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id)
      setError(null)
    }
  }

  function handleSubmit(firstAction?: string): void {
    if (!validateStep('name')) {
      setCurrentStep('name')
      return
    }

    startTransition(async () => {
      const result = await createFoundry(companyName.trim(), industry, stage)

      if (!result.success) {
        setError(result.error || 'Failed to create your business')
        return
      }

      toast.success('Your business has been created!', {
        description: `Welcome to ${companyName.trim()}. You're now the founder.`,
      })

      resetForm()
      onOpenChange(false)

      // Navigate based on what the user wants to do first
      switch (firstAction) {
        case 'objectives':
          router.push('/new-objectives')
          break
        case 'marketplace':
          router.push('/marketplace')
          break
        case 'money_map':
          router.push('/money-map')
          break
        case 'launchpad':
          router.push('/launchpad')
          break
        default:
          router.refresh()
          break
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="md" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Start Your Business</DialogTitle>
        </DialogHeader>

        {/* Visual Progress Stepper */}
        <div className="flex items-center gap-2 mb-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            const isActive = step.id === currentStep
            const isCompleted = index < currentStepIndex

            return (
              <div key={step.id} className={cn('flex items-center gap-2 flex-1', index > 0 && 'pl-2')}>
                {/* Connector line */}
                {index > 0 && (
                  <div className={cn(
                    'h-0.5 flex-1',
                    isCompleted ? 'bg-international-orange' : 'bg-muted'
                  )} />
                )}
                {/* Step icon */}
                <div className={cn(
                  'flex items-center justify-center rounded-full h-8 w-8 transition-colors flex-shrink-0',
                  isActive && 'bg-international-orange text-background',
                  isCompleted && !isActive && 'bg-orange-100 text-international-orange',
                  !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                )}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            )
          })}
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Step Content */}
        <div className="min-h-[280px]">
          {currentStep === 'name' && (
            <StepName
              companyName={companyName}
              onCompanyNameChange={setCompanyName}
              industry={industry}
              onIndustryChange={setIndustry}
              nameLimit={COMPANY_NAME_LIMIT}
            />
          )}

          {currentStep === 'stage' && (
            <StepStage
              stage={stage}
              onStageChange={setStage}
            />
          )}

          {currentStep === 'next_steps' && (
            <StepNextSteps
              companyName={companyName}
              onSubmit={handleSubmit}
              isPending={isPending}
            />
          )}
        </div>

        {/* Navigation Footer */}
        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <Button
              variant="secondary"
              onClick={isFirstStep ? handleClose : goToPrevStep}
              disabled={isPending}
            >
              {isFirstStep ? 'Cancel' : (
                <>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Back
                </>
              )}
            </Button>

            {isLastStep ? (
              <Button
                onClick={() => handleSubmit()}
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Create My Business
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

// --- Step Components ---

interface StepNameProps {
  companyName: string
  onCompanyNameChange: (value: string) => void
  industry: string | null
  onIndustryChange: (value: string | null) => void
  nameLimit: number
}

function StepName({ companyName, onCompanyNameChange, industry, onIndustryChange, nameLimit }: StepNameProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">
          What&apos;s your business called?
        </h3>
        <p className="text-sm text-muted-foreground">
          Don&apos;t worry if you&apos;re not sure yet — you can change this later.
          This creates your own workspace alongside your current roles.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="company-name">
          Business name <span className="text-destructive" aria-label="required">*</span>
        </Label>
        <Input
          id="company-name"
          value={companyName}
          onChange={(e) => onCompanyNameChange(e.target.value)}
          placeholder="e.g., Smith Consulting, Bright Ideas Ltd"
          maxLength={nameLimit}
          autoFocus
          aria-required
        />
        <p className="text-xs text-muted-foreground">
          {companyName.length} / {nameLimit} characters
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="industry">Industry</Label>
        <div className="grid grid-cols-3 gap-2">
          {INDUSTRIES.map((ind) => (
            <button
              key={ind.value}
              type="button"
              onClick={() => onIndustryChange(industry === ind.value ? null : ind.value)}
              className={cn(
                'px-3 py-2 text-xs font-medium rounded-md border transition-colors text-center',
                industry === ind.value
                  ? 'bg-international-orange text-background border-international-orange'
                  : 'bg-background text-foreground border hover:bg-muted'
              )}
            >
              {ind.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

interface StepStageProps {
  stage: string | null
  onStageChange: (value: string | null) => void
}

function StepStage({ stage, onStageChange }: StepStageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">
          Where are you in your journey?
        </h3>
        <p className="text-sm text-muted-foreground">
          This helps us tailor your experience. No pressure — every great business
          starts somewhere.
        </p>
      </div>

      <div className="space-y-3">
        {STAGES.map((s) => {
          const Icon = s.icon
          const isSelected = stage === s.value
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onStageChange(isSelected ? null : s.value)}
              className={cn(
                'w-full flex items-start gap-4 p-4 rounded-xl border transition-all text-left',
                isSelected
                  ? 'bg-orange-50 border-international-orange shadow-sm'
                  : 'bg-background border hover:bg-muted hover:shadow-sm'
              )}
            >
              <div className={cn(
                'flex items-center justify-center h-10 w-10 rounded-lg flex-shrink-0',
                isSelected
                  ? 'bg-international-orange text-background'
                  : 'bg-muted text-muted-foreground'
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className={cn(
                  'text-sm font-semibold',
                  isSelected ? 'text-international-orange' : 'text-foreground'
                )}>
                  {s.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {s.description}
                </p>
              </div>
              {isSelected && (
                <CheckCircle2 className="h-5 w-5 text-international-orange flex-shrink-0 ml-auto mt-2" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface StepNextStepsProps {
  companyName: string
  onSubmit: (firstAction?: string) => void
  isPending: boolean
}

function StepNextSteps({ companyName, onSubmit, isPending }: StepNextStepsProps) {
  const NEXT_ACTIONS = [
    {
      id: 'objectives',
      label: 'Set my first objective',
      description: 'Define what you want to achieve',
      icon: Target,
    },
    {
      id: 'marketplace',
      label: 'Find help on the Marketplace',
      description: 'Browse experts, services, and products',
      icon: Briefcase,
    },
    {
      id: 'money_map',
      label: 'Plan my finances',
      description: 'Map out revenue and costs',
      icon: DollarSign,
    },
    {
      id: 'launchpad',
      label: 'Follow the Launch Checklist',
      description: 'Step-by-step guide to get started',
      icon: Rocket,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">
          Welcome to {companyName.trim() || 'your business'}!
        </h3>
        <p className="text-sm text-muted-foreground">
          Your workspace is ready. What would you like to do first?
          You can always switch between this and your other workspaces.
        </p>
      </div>

      <div className="space-y-2">
        {NEXT_ACTIONS.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => onSubmit(action.id)}
              disabled={isPending}
              className={cn(
                'w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left',
                'bg-background hover:bg-muted hover:shadow-sm',
                isPending && 'opacity-50 pointer-events-none'
              )}
            >
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-orange-50 text-international-orange flex-shrink-0">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{action.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-auto" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
