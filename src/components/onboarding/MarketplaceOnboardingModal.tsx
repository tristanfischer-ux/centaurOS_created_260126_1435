'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { MarketCard } from '@/components/marketplace/market-card'
import { 
    Store, 
    Sparkles, 
    Rocket,
    ArrowRight,
    ArrowLeft,
    Search,
    ShoppingCart,
    FileText
} from 'lucide-react'
import { MarketplaceListing } from '@/actions/marketplace'
import { completeMarketplaceOnboarding } from '@/actions/onboarding'
import { useRouter } from 'next/navigation'

interface OnboardingStep {
    id: string
    title: string
    description: string
    icon: React.ComponentType<{ className?: string }>
}

const ONBOARDING_STEPS: OnboardingStep[] = [
    {
        id: 'welcome',
        title: 'Welcome to Your Marketplace',
        description: 'Access the world\'s most capable people, products, and AI tools. Find what you need to build faster.',
        icon: Store,
    },
    {
        id: 'recommendations',
        title: 'Recommended for You',
        description: 'Based on your role, here are some listings that might help you get started.',
        icon: Sparkles,
    },
    {
        id: 'action',
        title: 'Take Your First Action',
        description: 'Save a listing for later, create an RFQ, or use AI search to find exactly what you need.',
        icon: Rocket,
    },
]

interface MarketplaceOnboardingModalProps {
    /** Recommended listings to show in step 2 */
    recommendations?: MarketplaceListing[]
    /** User role for personalized copy */
    userRole?: 'Executive' | 'Apprentice' | 'Founder' | 'AI_Agent'
    /** Callback when onboarding is completed */
    onComplete?: () => void
    /** Force show the modal even if previously completed */
    forceShow?: boolean
}

export function MarketplaceOnboardingModal({ 
    recommendations = [],
    userRole = 'Apprentice',
    onComplete,
    forceShow = false
}: MarketplaceOnboardingModalProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [currentStep, setCurrentStep] = useState(0)
    const [isCompleting, setIsCompleting] = useState(false)
    const router = useRouter()

    // Check if user has completed marketplace onboarding
    useEffect(() => {
        if (forceShow) {
            setIsOpen(true)
            return
        }

        // Check localStorage for completed status
        try {
            const completed = localStorage.getItem('centauros:marketplace:onboarding:completed')
            if (!completed) {
                // Delay showing to not interrupt page load
                const timer = setTimeout(() => setIsOpen(true), 800)
                return () => clearTimeout(timer)
            }
        } catch {
            // localStorage not available
        }
    }, [forceShow])

    const handleComplete = async () => {
        setIsCompleting(true)
        try {
            // Mark as completed in localStorage
            localStorage.setItem('centauros:marketplace:onboarding:completed', 'true')
            
            // Call server action to update profile
            await completeMarketplaceOnboarding()
            
            setIsOpen(false)
            onComplete?.()
        } catch (error) {
            console.error('Failed to complete onboarding:', error)
        } finally {
            setIsCompleting(false)
        }
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

    // Get role-specific welcome copy
    const getRoleSpecificCopy = () => {
        switch (userRole) {
            case 'Executive':
                return 'As an Executive, you can approve purchases, book talent, and find the resources to execute your vision.'
            case 'Founder':
                return 'As a Founder, you have the power to rapidly scale your team with the best people, products, and AI agents in the world.'
            case 'Apprentice':
                return 'As an Apprentice, you can explore available resources, suggest additions to your team, and learn from the best.'
            default:
                return 'Access the world\'s most capable people, products, and AI tools. Find what you need to build faster.'
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center justify-between mb-2">
                        <Badge variant="secondary" className="text-xs">
                            Step {currentStep + 1} of {ONBOARDING_STEPS.length}
                        </Badge>
                        <Button variant="ghost" size="sm" onClick={handleSkip} className="text-xs">
                            Skip tour
                        </Button>
                    </div>
                    <Progress value={progress} className="h-1 mb-4" />
                    
                    {/* Navigation buttons at top */}
                    <div className="flex items-center justify-between gap-2 mb-4">
                        <Button
                            variant="secondary"
                            onClick={handlePrev}
                            disabled={currentStep === 0}
                            size="sm"
                        >
                            <ArrowLeft className="h-4 w-4 mr-1" />
                            Back
                        </Button>
                        <Button 
                            onClick={handleNext} 
                            size="sm"
                            disabled={isCompleting}
                        >
                            {isLastStep ? (
                                <>
                                    Start Building
                                    <Rocket className="h-4 w-4 ml-1" />
                                </>
                            ) : (
                                <>
                                    Next
                                    <ArrowRight className="h-4 w-4 ml-1" />
                                </>
                            )}
                        </Button>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <StepIcon className="h-6 w-6 text-primary" />
                    </div>
                    <DialogTitle className="text-xl">{step.title}</DialogTitle>
                    <DialogDescription className="text-base">
                        {currentStep === 0 ? getRoleSpecificCopy() : step.description}
                    </DialogDescription>
                </DialogHeader>

                {/* Step-specific content */}
                <div className="py-4">
                    {currentStep === 0 && <WelcomeContent userRole={userRole} />}
                    {currentStep === 1 && <RecommendationsContent recommendations={recommendations} />}
                    {currentStep === 2 && <ActionContent />}
                </div>
            </DialogContent>
        </Dialog>
    )
}

// Step 1: Welcome Content
function WelcomeContent({ userRole }: { userRole: string }) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 border rounded-lg bg-stone-50 border-stone-200">
                    <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center mb-2">
                        <Store className="h-4 w-4 text-stone-700" />
                    </div>
                    <h4 className="font-semibold text-sm mb-1">People</h4>
                    <p className="text-xs text-muted-foreground">
                        Engineers, designers, and specialists ready to join your team
                    </p>
                </div>

                <div className="p-4 border rounded-lg bg-slate-50 border-slate-200">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                        <ShoppingCart className="h-4 w-4 text-slate-700" />
                    </div>
                    <h4 className="font-semibold text-sm mb-1">Products</h4>
                    <p className="text-xs text-muted-foreground">
                        Manufacturing capacity, hardware, and physical resources
                    </p>
                </div>

                <div className="p-4 border rounded-lg bg-violet-50 border-violet-200">
                    <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center mb-2">
                        <Sparkles className="h-4 w-4 text-violet-700" />
                    </div>
                    <h4 className="font-semibold text-sm mb-1">AI Tools</h4>
                    <p className="text-xs text-muted-foreground">
                        Agents, assistants, and automation to augment your team
                    </p>
                </div>
            </div>

            <div className="p-4 bg-muted rounded-lg border">
                <div className="flex items-start gap-2">
                    <Search className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div>
                        <p className="text-sm font-medium mb-1">Pro Tip: Use AI Search</p>
                        <p className="text-xs text-muted-foreground">
                            Describe what you need in natural language. Our AI will find the best matches from thousands of listings.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

// Step 2: Recommendations Content
function RecommendationsContent({ recommendations }: { recommendations: MarketplaceListing[] }) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [expandedId, setExpandedId] = useState<string | null>(null)

    const handleToggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    const handleToggleExpand = (id: string) => {
        setExpandedId(prev => prev === id ? null : id)
    }

    if (!recommendations || recommendations.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">
                    No recommendations yet. Explore the marketplace to discover what's available!
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
                These listings match your needs. Click "More" to see details or "Compare" to add them to comparison.
            </p>
            {recommendations.slice(0, 3).map(listing => (
                <MarketCard
                    key={listing.id}
                    listing={listing}
                    isSelected={selectedIds.has(listing.id)}
                    onToggleSelect={handleToggleSelect}
                    isExpanded={expandedId === listing.id}
                    onToggleExpandAll={() => handleToggleExpand(listing.id)}
                />
            ))}
        </div>
    )
}

// Step 3: Action Content
function ActionContent() {
    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
                Ready to get started? Here are the key actions you can take in the marketplace:
            </p>

            <div className="space-y-3">
                <div className="p-4 border rounded-lg hover:border-primary/50 transition-colors cursor-pointer">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <ShoppingCart className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-sm mb-1">Save Resources</h4>
                            <p className="text-xs text-muted-foreground">
                                Save providers and tools for quick access later. View them anytime in "Saved Resources".
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-4 border rounded-lg hover:border-primary/50 transition-colors cursor-pointer">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-sm mb-1">Create an RFQ</h4>
                            <p className="text-xs text-muted-foreground">
                                Request For Quote - describe your needs and get competitive proposals from multiple providers.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-4 border rounded-lg hover:border-primary/50 transition-colors cursor-pointer">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Search className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-sm mb-1">Use AI Search</h4>
                            <p className="text-xs text-muted-foreground">
                                Describe what you need in natural language and let AI find the best matches across all categories.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 mt-6">
                <div className="flex items-start gap-2">
                    <Rocket className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div>
                        <p className="text-sm font-medium mb-1">You're All Set!</p>
                        <p className="text-xs text-muted-foreground">
                            Click "Start Building" to explore the full marketplace and start adding resources to your team.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
