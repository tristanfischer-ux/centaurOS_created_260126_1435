'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle, Target, Users, Sparkles, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

const ONBOARDING_KEY = 'centauros_onboarding_completed'

const steps = [
  {
    title: 'Welcome to CentaurOS!',
    description: 'Your AI-powered strategic task management platform. Let\'s get you started with a quick tour.',
    icon: Sparkles,
    color: 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400'
  },
  {
    title: 'Create Objectives',
    description: 'Objectives are your strategic goals. Break them down into actionable tasks and track progress toward your mission.',
    icon: Target,
    color: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
  },
  {
    title: 'Manage Tasks',
    description: 'Tasks can be assigned to team members or AI agents. Use the voice input feature to quickly create tasks by speaking.',
    icon: CheckCircle,
    color: 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400'
  },
  {
    title: 'Collaborate with Your Team',
    description: 'Invite team members, create teams, and collaborate in real-time. Use @mentions to notify colleagues.',
    icon: Users,
    color: 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400'
  }
]

export function OnboardingModal() {
  const [open, setOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    // Check if user has completed onboarding
    const hasCompleted = localStorage.getItem(ONBOARDING_KEY)
    if (!hasCompleted) {
      // Small delay to let the page load first
      setTimeout(() => setOpen(true), 500)
    }
  }, [])

  const handleComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true')
    setOpen(false)
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // If dialog is being closed, mark onboarding as completed
      localStorage.setItem(ONBOARDING_KEY, 'true')
    }
    setOpen(isOpen)
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const step = steps[currentStep]
  const Icon = step.icon

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-white">
        {/* Accessibility: Hidden title for screen readers */}
        <VisuallyHidden>
          <DialogTitle>{step.title}</DialogTitle>
        </VisuallyHidden>

        <div className="relative">
          {/* Progress dots */}
          <div className="absolute top-4 left-4 flex gap-1.5">
            {steps.map((_, index) => (
              <div
                key={index}
                className={cn(
                  'w-2 h-2 rounded-full transition-colors',
                  index === currentStep 
                    ? 'bg-foreground' 
                    : 'bg-muted-foreground/30'
                )}
              />
            ))}
          </div>

          {/* Content */}
          <div className="pt-16 pb-8 px-8 text-center">
            <div className={cn(
              'w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center',
              step.color
            )}>
              <Icon className="w-10 h-10" />
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-3">
              {step.title}
            </h2>
            <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
              {step.description}
            </p>

            <div className="flex gap-4 justify-center">
              {currentStep > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setCurrentStep(currentStep - 1)}
                >
                  Back
                </Button>
              )}
              <Button onClick={handleNext} className="min-w-[120px]">
                {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
