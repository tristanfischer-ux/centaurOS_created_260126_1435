'use client'

import { useState } from 'react'

import { CheckCircle2 } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { LucideIcon } from 'lucide-react'

export interface WizardStep {
  /** Unique identifier for the step */
  id: string
  /** Display title for the step */
  title: string
  /** Icon component to display in the stepper */
  icon: LucideIcon
}

export interface WizardStepperProps {
  /** Array of step definitions */
  steps: WizardStep[]
  /** ID of the current active step */
  currentStep: string
  /** Array of completed step IDs */
  completedSteps: string[]
  /** Optional callback when a step is clicked */
  onStepClick?: (stepId: string) => void
  /** Whether steps can be clicked to navigate (default: false) */
  clickable?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * WizardStepper - Visual progress indicator for multi-step wizard dialogs.
 * 
 * @description Displays a horizontal stepper with icons showing progress
 * through a multi-step form. Uses international-orange branding for active
 * and completed states per design standards.
 * 
 * @component
 * 
 * @example
 * const STEPS: WizardStep[] = [
 *   { id: 'purpose', title: 'Purpose', icon: Compass },
 *   { id: 'audience', title: 'Audience', icon: Users },
 *   { id: 'impact', title: 'Impact', icon: Lightbulb },
 * ]
 * 
 * <WizardStepper
 *   steps={STEPS}
 *   currentStep="audience"
 *   completedSteps={['purpose']}
 * />
 */
export function WizardStepper({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
  clickable = false,
  className,
}: WizardStepperProps) {
  const currentIndex = steps.findIndex(s => s.id === currentStep)

  return (
    <div className={cn('flex items-center justify-center py-4', className)}>
      {steps.map((step, index) => {
        const isCompleted = completedSteps.includes(step.id)
        const isActive = step.id === currentStep
        const isPending = !isCompleted && !isActive
        const Icon = step.icon

        const handleClick = () => {
          if (clickable && onStepClick && (isCompleted || index <= currentIndex)) {
            onStepClick(step.id)
          }
        }

        return (
          <div key={step.id} className="flex items-center">
            {/* Step indicator */}
            <button
              type="button"
              onClick={handleClick}
              disabled={!clickable || (isPending && index > currentIndex)}
              className={cn(
                'flex flex-col items-center gap-1.5 transition-all duration-200',
                clickable && (isCompleted || index <= currentIndex) && 'cursor-pointer hover:scale-105',
                !clickable && 'cursor-default',
                isPending && index > currentIndex && 'cursor-not-allowed'
              )}
              aria-current={isActive ? 'step' : undefined}
            >
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200',
                  isActive && 'bg-international-orange text-white shadow-md',
                  isCompleted && 'bg-international-orange/20 text-international-orange',
                  isPending && 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>
              <span
                className={cn(
                  'text-xs font-medium transition-colors duration-200',
                  isActive && 'text-international-orange',
                  isCompleted && 'text-international-orange',
                  isPending && 'text-muted-foreground'
                )}
              >
                {step.title}
              </span>
            </button>

            {/* Connector line (not after last step) */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'mx-2 h-0.5 w-8 transition-colors duration-200',
                  index < currentIndex ? 'bg-international-orange' : 'bg-muted'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Hook to manage wizard step state.
 * 
 * @param steps - Array of step definitions
 * @param initialStep - ID of the initial step (defaults to first step)
 * @returns Step management utilities
 */
export function useWizardSteps(steps: WizardStep[], initialStep?: string) {
  const [currentStep, setCurrentStep] = useState(initialStep ?? steps[0]?.id ?? '')
  const [completedSteps, setCompletedSteps] = useState<string[]>([])

  const currentIndex = steps.findIndex(s => s.id === currentStep)
  const isFirstStep = currentIndex === 0
  const isLastStep = currentIndex === steps.length - 1

  const goToStep = (stepId: string) => {
    setCurrentStep(stepId)
  }

  const goNext = () => {
    if (currentIndex < steps.length - 1) {
      // Mark current as completed
      setCompletedSteps(prev => 
        prev.includes(currentStep) ? prev : [...prev, currentStep]
      )
      setCurrentStep(steps[currentIndex + 1].id)
    }
  }

  const goBack = () => {
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1].id)
    }
  }

  const reset = () => {
    setCurrentStep(steps[0]?.id ?? '')
    setCompletedSteps([])
  }

  return {
    currentStep,
    completedSteps,
    currentIndex,
    isFirstStep,
    isLastStep,
    goToStep,
    goNext,
    goBack,
    reset,
    setCompletedSteps,
  }
}

