'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { 
  CheckCircle2, 
  ArrowRight, 
  Package, 
  FileText, 
  Search, 
  LayoutDashboard 
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

const SUPPLIER_ONBOARDING_KEY = 'forgeos_supplier_onboarding_completed'

const supplierSteps = [
  {
    title: 'Welcome to the Forge',
    description: 'Your dedicated portal for managing your marketplace presence. You\'ll find everything here — orders, requests for quotes, analytics, and your listing.',
    icon: Package,
    color: 'text-international-orange'
  },
  {
    title: 'Build a Great Profile',
    description: 'Go to "My Profile" to set up your marketplace presence. Add a compelling headline, detailed description, professional photos, and competitive pricing. Complete profiles get 5x more views.',
    icon: FileText,
    color: 'text-international-orange'
  },
  {
    title: 'Get Discovered by Buyers',
    description: 'Buyers will find you through search, categories, and RFQs (Requests for Quote). Respond quickly and professionally — your response rate affects your ranking.',
    icon: Search,
    color: 'text-international-orange'
  },
  {
    title: 'Grow Your Business',
    description: 'Track orders, manage capacity, view analytics, and build your reputation through reviews. The more you deliver, the higher you rank.',
    icon: LayoutDashboard,
    color: 'text-international-orange'
  }
]

interface SupplierOnboardingModalProps {
  forceOpen?: boolean
}

export function SupplierOnboardingModal({ forceOpen }: SupplierOnboardingModalProps) {
  const [open, setOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    // Check if user has completed supplier onboarding
    const hasCompleted = localStorage.getItem(SUPPLIER_ONBOARDING_KEY)
    if (!hasCompleted || forceOpen) {
      // Small delay to let the page load first
      setTimeout(() => setOpen(true), 500)
    }
  }, [forceOpen])

  const handleComplete = () => {
    localStorage.setItem(SUPPLIER_ONBOARDING_KEY, 'true')
    setOpen(false)
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // If dialog is being closed, mark onboarding as completed
      localStorage.setItem(SUPPLIER_ONBOARDING_KEY, 'true')
    }
    setOpen(isOpen)
  }

  const handleNext = () => {
    if (currentStep < supplierSteps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const step = supplierSteps[currentStep]
  const Icon = step.icon

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm" className="p-0 overflow-hidden bg-background border-none shadow-brand-lg">
        {/* Accessibility: Hidden title for screen readers */}
        <VisuallyHidden>
          <DialogTitle>{step.title}</DialogTitle>
        </VisuallyHidden>

        <div className="relative overflow-hidden bg-background">

          {/* Progress Indicator - Line Style */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-muted">
            <div
              className="h-full bg-international-orange transition-all duration-500 ease-in-out"
              style={{ width: `${((currentStep + 1) / supplierSteps.length) * 100}%` }}
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
                  "min-w-[140px] h-11 text-xs uppercase tracking-widest font-semibold bg-foreground text-background hover:bg-international-orange transition-colors duration-300 shadow-lg",
                  currentStep === supplierSteps.length - 1 && "bg-international-orange hover:bg-international-orange/90"
                )}
              >
                {currentStep === supplierSteps.length - 1 ? 'Get Started' : 'Next Step'}
                <ArrowRight className="w-3 h-3 ml-2" />
              </Button>
            </div>

            <div className="mt-8 flex justify-center gap-2">
              {supplierSteps.map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-colors duration-300",
                    index === currentStep ? "bg-muted-foreground" : "bg-muted"
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
