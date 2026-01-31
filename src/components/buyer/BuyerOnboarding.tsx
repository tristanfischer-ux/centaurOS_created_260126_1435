'use client'

import { useState } from 'react'
import {
    ShieldCheck,
    Star,
    CreditCard,
    MessageSquare,
    X,
    ChevronRight,
    ChevronLeft,
    CheckCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

// ==========================================
// ONBOARDING STEPS
// ==========================================

interface OnboardingStep {
    id: string
    title: string
    description: string
    icon: typeof ShieldCheck
    content: React.ReactNode
}

const ONBOARDING_STEPS: OnboardingStep[] = [
    {
        id: 'escrow',
        title: 'How Escrow Works',
        description: 'Your payments are protected',
        icon: ShieldCheck,
        content: (
            <div className="space-y-4">
                <p className="text-muted-foreground">
                    When you book a provider, your payment is held securely in escrow - 
                    it&apos;s never released until you&apos;re satisfied with the work.
                </p>
                <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                        <div className="w-6 h-6 rounded-full bg-status-info-light text-status-info flex items-center justify-center text-sm font-medium flex-shrink-0">
                            1
                        </div>
                        <div>
                            <p className="font-medium">You Pay</p>
                            <p className="text-sm text-muted-foreground">
                                Make your payment when booking - funds are held securely by our payment partner.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                        <div className="w-6 h-6 rounded-full bg-status-info-light text-status-info flex items-center justify-center text-sm font-medium flex-shrink-0">
                            2
                        </div>
                        <div>
                            <p className="font-medium">Work Begins</p>
                            <p className="text-sm text-muted-foreground">
                                The provider starts working, knowing funds are secured.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                        <div className="w-6 h-6 rounded-full bg-status-success-light text-status-success flex items-center justify-center text-sm font-medium flex-shrink-0">
                            3
                        </div>
                        <div>
                            <p className="font-medium">You Approve</p>
                            <p className="text-sm text-muted-foreground">
                                Review the deliverables and approve to release payment.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'trust',
        title: 'Trust Signals Explained',
        description: 'How to evaluate providers',
        icon: Star,
        content: (
            <div className="space-y-4">
                <p className="text-muted-foreground">
                    We verify providers and collect feedback to help you make informed decisions.
                </p>
                <div className="grid gap-3">
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <div className="w-10 h-10 rounded-lg bg-status-warning-light flex items-center justify-center">
                            <Star className="h-5 w-5 text-status-warning" />
                        </div>
                        <div>
                            <p className="font-medium">Ratings & Reviews</p>
                            <p className="text-sm text-muted-foreground">
                                Verified reviews from past clients
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <div className="w-10 h-10 rounded-lg bg-status-info-light flex items-center justify-center">
                            <CheckCircle className="h-5 w-5 text-status-info" />
                        </div>
                        <div>
                            <p className="font-medium">Verified Identity</p>
                            <p className="text-sm text-muted-foreground">
                                ID and business verification completed
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <div className="w-10 h-10 rounded-lg bg-status-success-light flex items-center justify-center">
                            <ShieldCheck className="h-5 w-5 text-status-success" />
                        </div>
                        <div>
                            <p className="font-medium">Badges & Certifications</p>
                            <p className="text-sm text-muted-foreground">
                                Skills and qualifications verified
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'payment',
        title: 'Payment Process',
        description: 'Secure and simple payments',
        icon: CreditCard,
        content: (
            <div className="space-y-4">
                <p className="text-muted-foreground">
                    We support all major payment methods with enterprise-grade security.
                </p>
                <div className="space-y-3">
                    <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="font-medium mb-1">Accepted Payment Methods</p>
                        <p className="text-sm text-muted-foreground">
                            Credit/debit cards (Visa, Mastercard, Amex), bank transfers, 
                            and invoicing for enterprise accounts.
                        </p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="font-medium mb-1">Transparent Pricing</p>
                        <p className="text-sm text-muted-foreground">
                            All fees are shown upfront - no hidden charges. The platform fee 
                            covers escrow protection, support, and dispute resolution.
                        </p>
                    </div>
                    <div className="p-3 bg-status-info-light rounded-lg border border-status-info">
                        <p className="font-medium mb-1 text-status-info-dark">Powered by Stripe</p>
                        <p className="text-sm text-status-info">
                            Your payment details are handled by Stripe, trusted by millions 
                            of businesses worldwide. We never store your card information.
                        </p>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'communication',
        title: 'Stay Connected',
        description: 'Easy communication with providers',
        icon: MessageSquare,
        content: (
            <div className="space-y-4">
                <p className="text-muted-foreground">
                    Keep in touch with your providers throughout the engagement.
                </p>
                <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                        <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                            <p className="font-medium">Direct Messaging</p>
                            <p className="text-sm text-muted-foreground">
                                Message providers directly from your order dashboard. 
                                All communication is logged for your records.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                        <CheckCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                            <p className="font-medium">Status Updates</p>
                            <p className="text-sm text-muted-foreground">
                                Get notified when your order status changes - 
                                work started, milestones completed, and more.
                            </p>
                        </div>
                    </div>
                </div>
                <div className="p-3 bg-status-success-light rounded-lg border border-status-success">
                    <p className="text-sm text-status-success-dark">
                        <strong>Tip:</strong> Communicate clearly about your requirements 
                        before booking to ensure the best outcome.
                    </p>
                </div>
            </div>
        )
    }
]

// ==========================================
// STORAGE KEY
// ==========================================

const ONBOARDING_STORAGE_KEY = 'buyer-onboarding-completed'

// ==========================================
// PROPS
// ==========================================

interface BuyerOnboardingProps {
    onComplete?: () => void
    forceShow?: boolean
    className?: string
}

// ==========================================
// COMPONENT
// ==========================================

export function BuyerOnboarding({
    onComplete,
    forceShow = false,
    className
}: BuyerOnboardingProps) {
    // Track if onboarding has been completed (from localStorage)
    const [hasCompleted, setHasCompleted] = useState(() => {
        if (typeof window === 'undefined') return false
        return !!localStorage.getItem(ONBOARDING_STORAGE_KEY)
    })
    const [currentStepIndex, setCurrentStepIndex] = useState(0)
    
    // Compute visibility from props and state
    const isVisible = forceShow || !hasCompleted

    // Handle completion
    const handleComplete = () => {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
        setHasCompleted(true)
        onComplete?.()
    }

    // Handle dismiss
    const handleDismiss = () => {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
        setHasCompleted(true)
    }

    // Navigation
    const goNext = () => {
        if (currentStepIndex < ONBOARDING_STEPS.length - 1) {
            setCurrentStepIndex(prev => prev + 1)
        } else {
            handleComplete()
        }
    }

    const goBack = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(prev => prev - 1)
        }
    }

    if (!isVisible) return null

    const currentStep = ONBOARDING_STEPS[currentStepIndex]
    const StepIcon = currentStep.icon
    const progressPercent = ((currentStepIndex + 1) / ONBOARDING_STEPS.length) * 100
    const isLastStep = currentStepIndex === ONBOARDING_STEPS.length - 1

    return (
        <Card className={cn("relative overflow-hidden", className)}>
            {/* Close Button */}
            <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10"
                onClick={handleDismiss}
            >
                <X className="h-4 w-4" />
            </Button>

            <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <StepIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-lg">{currentStep.title}</CardTitle>
                        <CardDescription>{currentStep.description}</CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Progress */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Step {currentStepIndex + 1} of {ONBOARDING_STEPS.length}</span>
                        <span>{Math.round(progressPercent)}% complete</span>
                    </div>
                    <Progress value={progressPercent} className="h-2" />
                </div>

                {/* Step Content */}
                <div className="py-2">
                    {currentStep.content}
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between pt-4 border-t">
                    <Button
                        variant="secondary"
                        onClick={goBack}
                        disabled={currentStepIndex === 0}
                    >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Back
                    </Button>

                    {/* Step Indicators */}
                    <div className="flex gap-1.5">
                        {ONBOARDING_STEPS.map((step, index) => (
                            <button
                                key={step.id}
                                onClick={() => setCurrentStepIndex(index)}
                                className={cn(
                                    "w-2 h-2 rounded-full transition-colors",
                                    index === currentStepIndex 
                                        ? "bg-primary" 
                                        : "bg-muted hover:bg-muted-foreground/20"
                                )}
                            />
                        ))}
                    </div>

                    <Button onClick={goNext}>
                        {isLastStep ? (
                            <>
                                Get Started
                                <CheckCircle className="h-4 w-4 ml-1" />
                            </>
                        ) : (
                            <>
                                Next
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

// ==========================================
// COMPACT BANNER VARIANT
// ==========================================

interface BuyerOnboardingBannerProps {
    onGetStarted?: () => void
    className?: string
}

export function BuyerOnboardingBanner({
    onGetStarted,
    className
}: BuyerOnboardingBannerProps) {
    // Initialize based on localStorage
    const getInitialDismissed = () => {
        if (typeof window === 'undefined') return false
        const completed = localStorage.getItem(ONBOARDING_STORAGE_KEY)
        return !!completed
    }
    
    const [isDismissed, setIsDismissed] = useState(getInitialDismissed)

    if (isDismissed) return null

    return (
        <Card className={cn("border bg-status-info-light", className)}>
            <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-status-info-light flex items-center justify-center">
                            <ShieldCheck className="h-5 w-5 text-status-info" />
                        </div>
                        <div>
                            <p className="font-medium text-status-info-dark">New to the marketplace?</p>
                            <p className="text-sm text-status-info-dark">
                                Learn how escrow, payments, and provider verification work.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                                localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
                                setIsDismissed(true)
                            }}
                            className="border text-status-info-dark hover:bg-status-info-light"
                        >
                            Dismiss
                        </Button>
                        <Button
                            size="sm"
                            onClick={onGetStarted}
                            className="bg-status-info hover:bg-status-info/90"
                        >
                            Learn More
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

export default BuyerOnboarding
