'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { 
    Target, 
    CheckSquare, 
    Users, 
    Store, 
    ArrowRight,
    Sparkles,
    Lightbulb,
    Clock,
    LayoutGrid
} from 'lucide-react'

interface OnboardingStep {
    id: string
    title: string
    description: string
    icon: React.ComponentType<{ className?: string }>
    tip?: string
}

const ONBOARDING_STEPS: OnboardingStep[] = [
    {
        id: 'welcome',
        title: 'Welcome to CentaurOS',
        description: 'Your command center for building and running modern organizations. Let\'s take a quick tour of the key features.',
        icon: Sparkles,
    },
    {
        id: 'objectives',
        title: 'Set Strategic Objectives',
        description: 'Define what success looks like. Objectives help align your team around common goals and track progress automatically.',
        icon: Target,
        tip: 'Start with 1-3 objectives to keep focus. You can add more as you grow.',
    },
    {
        id: 'tasks',
        title: 'Manage Tasks',
        description: 'Break objectives into actionable tasks. Assign them to team members, set deadlines, and track completion.',
        icon: CheckSquare,
        tip: 'Use the quick-add shortcut (N) to create tasks faster.',
    },
    {
        id: 'team',
        title: 'Build Your Team',
        description: 'Invite team members, define roles, and see who\'s working on what. Everyone stays aligned.',
        icon: Users,
        tip: 'Executive and Founder roles have approval capabilities for key decisions.',
    },
    {
        id: 'marketplace',
        title: 'Access the Marketplace',
        description: 'Find people, products, and AI tools to augment your team. Compare options and book directly.',
        icon: Store,
        tip: 'Use AI Search to describe what you need in natural language.',
    },
    {
        id: 'complete',
        title: 'You\'re Ready!',
        description: 'You\'ve got the basics. Explore at your own pace, and use Cmd+K to quickly navigate anywhere.',
        icon: Lightbulb,
    },
]

const STORAGE_KEY = 'centauros:onboarding:completed'

interface OnboardingWelcomeProps {
    /** Force show the onboarding even if previously completed */
    forceShow?: boolean
    /** Callback when onboarding is completed */
    onComplete?: () => void
}

export function OnboardingWelcome({ forceShow = false, onComplete }: OnboardingWelcomeProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [currentStep, setCurrentStep] = useState(0)

    useEffect(() => {
        if (forceShow) {
            setIsOpen(true)
            return
        }

        // Check if user has seen onboarding
        try {
            const completed = localStorage.getItem(STORAGE_KEY)
            if (!completed) {
                // Delay showing to not interrupt initial page load
                const timer = setTimeout(() => setIsOpen(true), 1000)
                return () => clearTimeout(timer)
            }
        } catch {
            // localStorage not available
        }
    }, [forceShow])

    const handleComplete = () => {
        try {
            localStorage.setItem(STORAGE_KEY, 'true')
        } catch {
            // localStorage not available
        }
        setIsOpen(false)
        onComplete?.()
    }

    const handleNext = () => {
        if (currentStep < ONBOARDING_STEPS.length - 1) {
            setCurrentStep(prev => prev + 1)
        } else {
            handleComplete()
        }
    }

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1)
        }
    }

    const handleSkip = () => {
        handleComplete()
    }

    const step = ONBOARDING_STEPS[currentStep]
    const StepIcon = step.icon
    const progress = ((currentStep + 1) / ONBOARDING_STEPS.length) * 100
    const isLastStep = currentStep === ONBOARDING_STEPS.length - 1

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="flex items-center justify-between mb-2">
                        <Badge variant="secondary" className="text-xs">
                            {currentStep + 1} of {ONBOARDING_STEPS.length}
                        </Badge>
                        {!isLastStep && (
                            <Button variant="ghost" size="sm" onClick={handleSkip} className="text-xs">
                                Skip tour
                            </Button>
                        )}
                    </div>
                    <Progress value={progress} className="h-1 mb-4" />
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <StepIcon className="h-6 w-6 text-primary" />
                    </div>
                    <DialogTitle className="text-xl">{step.title}</DialogTitle>
                    <DialogDescription className="text-base">
                        {step.description}
                    </DialogDescription>
                </DialogHeader>

                {step.tip && (
                    <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
                        <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-sm text-muted-foreground">{step.tip}</p>
                    </div>
                )}

                <DialogFooter className="flex-row justify-between sm:justify-between gap-2 mt-4">
                    <Button
                        variant="secondary"
                        onClick={handlePrev}
                        disabled={currentStep === 0}
                        className="flex-1 sm:flex-initial"
                    >
                        Back
                    </Button>
                    <Button onClick={handleNext} className="flex-1 sm:flex-initial">
                        {isLastStep ? (
                            <>Get Started</>
                        ) : (
                            <>
                                Next
                                <ArrowRight className="h-4 w-4 ml-1" />
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Feature tooltip for contextual help on first visit to a page.
 * Use this for page-specific tips that appear once.
 */
export function FeatureTip({ 
    id, 
    title, 
    description,
    children,
    align = 'left'
}: { 
    id: string
    title: string
    description: string
    children: React.ReactNode
    align?: 'left' | 'right'
}) {
    const [dismissed, setDismissed] = useState(true)
    const storageKey = `centauros:tip:${id}`

    useEffect(() => {
        try {
            const seen = localStorage.getItem(storageKey)
            if (!seen) {
                setDismissed(false)
            }
        } catch {
            // localStorage not available
        }
    }, [storageKey])

    const handleDismiss = () => {
        try {
            localStorage.setItem(storageKey, 'true')
        } catch {
            // localStorage not available
        }
        setDismissed(true)
    }

    if (dismissed) return <>{children}</>

    const alignmentClass = align === 'right' ? 'right-0' : 'left-0'
    const arrowAlignmentClass = align === 'right' ? 'right-4' : 'left-4'

    return (
        <div className="relative">
            {children}
            <div className={`absolute top-full ${alignmentClass} mt-2 z-50 w-72 p-4 bg-white border-2 border-international-orange rounded-lg shadow-xl animate-in fade-in-50 slide-in-from-top-2`}>
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="font-semibold text-sm text-slate-900">{title}</p>
                        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{description}</p>
                    </div>
                    <button 
                        onClick={handleDismiss}
                        className="text-xs text-international-orange hover:text-international-orange-hover font-medium shrink-0 px-2 py-1 hover:bg-orange-50 rounded transition-colors"
                    >
                        Got it
                    </button>
                </div>
                <div className={`absolute -top-1.5 ${arrowAlignmentClass} w-3 h-3 bg-white border-l-2 border-t-2 border-international-orange rotate-45`} />
            </div>
        </div>
    )
}
