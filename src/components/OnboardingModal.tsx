'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Target, Zap, ArrowRight, LayoutDashboard, Users, Sparkles, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { createSampleData, createApprenticeTrainingTasks } from '@/actions/onboarding'
import { toast } from 'sonner'

const ONBOARDING_KEY = 'centauros_onboarding_completed'

// Role-specific step configurations
const founderSteps = [
  {
    title: 'Welcome, Founder',
    description: 'Your command center for building at software speed. We\'ve prepared your foundry and are ready to help you scale.',
    icon: LayoutDashboard,
    color: 'text-orange-600'
  },
  {
    title: 'Define Your Strategy',
    description: 'Set strategic Objectives that cascade into actionable tasks. Your team will align around your vision automatically.',
    icon: Target,
    color: 'text-orange-600'
  },
  {
    title: 'Build Your Team',
    description: 'Access fractional Executives and AI-amplified Apprentices from the Marketplace. Scale up or down on demand.',
    icon: Users,
    color: 'text-orange-600'
  },
  {
    title: 'Your Foundry is Ready',
    description: 'We\'ve created your first objective and sample tasks to get you started. Build atoms at the speed of bits.',
    icon: CheckCircle2,
    color: 'text-orange-600'
  }
]

const executiveSteps = [
  {
    title: 'Welcome to the Cadre',
    description: 'Deploy your expertise across multiple ventures. No politics, no bureaucracy—just high-impact work.',
    icon: LayoutDashboard,
    color: 'text-orange-600'
  },
  {
    title: 'Your Portfolio Awaits',
    description: 'Work with multiple startups simultaneously. Each engagement is tracked, and your impact is measured.',
    icon: Target,
    color: 'text-orange-600'
  },
  {
    title: 'AI-Amplified Teams',
    description: 'Lead teams of Apprentices with 10x output. The Marketplace connects you with the tools you need.',
    icon: Sparkles,
    color: 'text-orange-600'
  },
  {
    title: 'Ready to Execute',
    description: 'Your dashboard shows pending approvals and team status. Start building with the founders who need you.',
    icon: CheckCircle2,
    color: 'text-orange-600'
  }
]

const apprenticeSteps = [
  {
    title: 'Welcome to the Guild',
    description: 'You\'re not junior—you\'re a Founder-in-Training. Your Digital Body awaits.',
    icon: GraduationCap,
    color: 'text-orange-600'
  },
  {
    title: 'Your Digital Body',
    description: 'The Centaur OS gives you a 10x multiplier on your output. AI tools and workflows designed for builders.',
    icon: Sparkles,
    color: 'text-orange-600'
  },
  {
    title: 'Learn by Doing',
    description: 'Ship real work in your first month. Direct mentorship from Executives who\'ve built before.',
    icon: Target,
    color: 'text-orange-600'
  },
  {
    title: 'Your Training Begins',
    description: 'We\'ve assigned your first tasks. Complete them to progress on the Founder track.',
    icon: CheckCircle2,
    color: 'text-orange-600'
  }
]

const defaultSteps = [
  {
    title: 'Welcome to the Foundry',
    description: 'Your central command for high-velocity creation. CentaurOS combines human ingenuity with AI precision.',
    icon: LayoutDashboard,
    color: 'text-orange-600'
  },
  {
    title: 'Define Your Mission',
    description: 'Set strategic Objectives that cascade into actionable tasks. Orchestrate your vision from the top down.',
    icon: Target,
    color: 'text-orange-600'
  },
  {
    title: 'Hybrid Execution',
    description: 'Assign tasks to human experts or autonomous AI agents. The work happens where it needs to happen.',
    icon: Zap,
    color: 'text-orange-600'
  },
  {
    title: 'The Renaissance is Here',
    description: 'You are now ready to build atoms at the speed of bits. Enter the Foundry and begin.',
    icon: CheckCircle2,
    color: 'text-orange-600'
  }
]

interface OnboardingModalProps {
  userRole?: 'Founder' | 'Executive' | 'Apprentice' | 'AI_Agent' | string
}

export function OnboardingModal({ userRole }: OnboardingModalProps) {
  const [open, setOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [isCreatingSampleData, setIsCreatingSampleData] = useState(false)

  // Select steps based on role
  const steps = userRole === 'Founder' ? founderSteps 
    : userRole === 'Executive' ? executiveSteps 
    : userRole === 'Apprentice' ? apprenticeSteps 
    : defaultSteps

  useEffect(() => {
    // Check if user has completed onboarding
    const hasCompleted = localStorage.getItem(ONBOARDING_KEY)
    if (!hasCompleted) {
      // Small delay to let the page load first
      setTimeout(() => setOpen(true), 1000)
    }
  }, [])

  const handleComplete = async () => {
    // For Founders, create sample data to populate their dashboard
    if (userRole === 'Founder') {
      setIsCreatingSampleData(true)
      try {
        const result = await createSampleData()
        if (result.success) {
          toast.success('Your foundry is ready with sample objectives and tasks!')
        }
      } catch (error) {
        console.error('Failed to create sample data:', error)
      } finally {
        setIsCreatingSampleData(false)
      }
    }
    
    // For Apprentices, create their training tasks
    if (userRole === 'Apprentice') {
      setIsCreatingSampleData(true)
      try {
        const result = await createApprenticeTrainingTasks()
        if (result.success) {
          toast.success('Your Digital Body is ready! Training tasks have been assigned.')
        }
      } catch (error) {
        console.error('Failed to create training tasks:', error)
      } finally {
        setIsCreatingSampleData(false)
      }
    }
    
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
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden bg-background border-none shadow-brand-lg">
        {/* Accessibility: Hidden title for screen readers */}
        <VisuallyHidden>
          <DialogTitle>{step.title}</DialogTitle>
        </VisuallyHidden>

        <div className="relative overflow-hidden">
          {/* Subtle Industrial Grid Background */}
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[linear-gradient(#000_1px,transparent_1px),linear-gradient(90deg,#000_1px,transparent_1px)] bg-[length:24px_24px]"
          />

          {/* Progress Indicator - Line Style */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-muted">
            <div
              className="h-full bg-orange-600 transition-all duration-500 ease-in-out"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>

          {/* Content */}
          <div className="pt-16 pb-10 px-10 text-center relative z-10 font-sans">
            <div className={cn(
              'w-20 h-20 rounded-full mx-auto mb-8 flex items-center justify-center bg-muted border border-slate-100 shadow-sm',
              step.color
            )}>
              <Icon className="w-8 h-8" strokeWidth={1.5} />
            </div>

            <h2 className="text-3xl font-display font-medium text-foreground mb-4 tracking-tight">
              {step.title}
            </h2>
            <p className="text-muted-foreground mb-10 max-w-sm mx-auto leading-relaxed text-sm">
              {step.description}
            </p>

            <div className="flex gap-4 justify-center items-center">
              {currentStep > 0 && (
                <Button
                  variant="ghost"
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="text-muted-foreground hover:text-muted-foreground hover:bg-transparent px-6"
                >
                  Back
                </Button>
              )}
              <Button
                onClick={handleNext}
                className={cn(
                  "min-w-[140px] h-11 text-xs uppercase tracking-widest font-semibold bg-slate-900 text-white hover:bg-orange-600 transition-colors duration-300 shadow-lg",
                  currentStep === steps.length - 1 && "bg-orange-600 hover:bg-orange-500"
                )}
              >
                {currentStep === steps.length - 1 ? 'Enter Foundry' : 'Next Step'}
                <ArrowRight className="w-3 h-3 ml-2" />
              </Button>
            </div>

            <div className="mt-8 flex justify-center gap-2">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-colors duration-300",
                    index === currentStep ? "bg-slate-300" : "bg-muted"
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
