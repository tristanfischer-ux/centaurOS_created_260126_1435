'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createMarketplacePresence } from '@/actions/marketplace-setup'
import { createClient } from '@/lib/supabase/client'
import {
  User,
  Briefcase,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  SkipForward,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/design-system'
import { toast } from 'sonner'

/**
 * Step definitions for the marketplace listing wizard.
 */
const STEPS = [
  { id: 'headline', title: 'Your Role', icon: User },
  { id: 'details', title: 'About You', icon: Briefcase },
  { id: 'confirm', title: 'Done', icon: CheckCircle2 },
] as const

type StepId = (typeof STEPS)[number]['id']

/**
 * Marketplace Setup Wizard — shown to Executives and Apprentices after email
 * verification to create their presence in the People marketplace.
 *
 * @description A 2-step wizard (headline + details) that creates a marketplace
 * listing linked to the user's auto-created provider profile. Includes a skip
 * button for users who want to set this up later.
 */
export default function MarketplaceSetupPage(): React.ReactElement {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<StepId>('headline')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('')

  // Form data
  const [headline, setHeadline] = useState('')
  const [description, setDescription] = useState('')
  const [skills, setSkills] = useState('')
  const [availability, setAvailability] = useState('Available')

  // Fetch user role to pre-populate
  useEffect(() => {
    async function fetchRole(): Promise<void> {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .single()

      if (profile?.role) {
        setUserRole(profile.role)
        const defaultHeadline = profile.role === 'Executive'
          ? 'Fractional Executive'
          : 'Apprentice Engineer'
        setHeadline(defaultHeadline)
      }
    }
    fetchRole()
  }, [])

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep)
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStep === 'confirm'

  /** Validate the current step before proceeding. */
  function validateCurrentStep(): boolean {
    setError(null)
    if (currentStep === 'headline') {
      if (!headline.trim()) {
        setError('Please enter a headline for your listing')
        return false
      }
    }
    return true
  }

  /** Go to the next step in the wizard. */
  function goToNextStep(): void {
    if (!validateCurrentStep()) return
    const nextIndex = currentStepIndex + 1
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id)
      setError(null)
    }
  }

  /** Go back one step. */
  function goToPrevStep(): void {
    const prevIndex = currentStepIndex - 1
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id)
      setError(null)
    }
  }

  /** Submit the form to create the marketplace listing. */
  async function handleSubmit(): Promise<void> {
    setIsSubmitting(true)
    setError(null)

    const formData = new FormData()
    formData.set('headline', headline)
    formData.set('description', description)
    formData.set('skills', skills)
    formData.set('availability', availability)

    const result = await createMarketplacePresence(formData)

    if (result.success) {
      setCurrentStep('confirm')
      toast.success('Your marketplace listing is live!')
    } else {
      setError(result.error || 'Something went wrong')
    }

    setIsSubmitting(false)
  }

  /** Skip the wizard and go straight to the platform. */
  function handleSkip(): void {
    router.push('/updates')
  }

  /** Navigate to the platform after completing setup. */
  function handleFinish(): void {
    router.push('/updates')
  }

  return (
    <div className="max-w-2xl mx-auto py-8 sm:py-12">
      {/* Page Header */}
      <div className="mb-8">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>Set Up Your Marketplace Presence</h1>
        </div>
        <p className={typography.pageSubtitle}>
          Founders browse the Recruits marketplace to find talent. Create your listing
          so they can discover you and invite you to their company.
        </p>
      </div>

      {/* Progress Stepper */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((step, index) => {
          const Icon = step.icon
          const isActive = step.id === currentStep
          const isCompleted = index < currentStepIndex

          return (
            <div key={step.id} className={cn('flex items-center gap-2 flex-1', index > 0 && 'pl-2')}>
              {index > 0 && (
                <div
                  className={cn(
                    'h-0.5 flex-1',
                    isCompleted ? 'bg-international-orange' : 'bg-muted'
                  )}
                />
              )}
              <div
                className={cn(
                  'flex items-center justify-center rounded-full h-8 w-8 transition-colors shrink-0',
                  isActive && 'bg-international-orange text-white',
                  isCompleted && !isActive && 'bg-orange-100 text-international-orange',
                  !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span
                className={cn(
                  'text-xs font-medium hidden sm:block',
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {step.title}
              </span>
            </div>
          )
        })}
      </div>

      {/* Step Content */}
      <Card>
        <CardContent className="pt-6">
          {/* Error */}
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Step 1: Headline */}
          {currentStep === 'headline' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">What do you do?</h3>
                <p className="text-sm text-muted-foreground">
                  Think of this as your one-liner. Founders will see this when browsing
                  the Recruits marketplace.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="headline">
                  Your headline <span className="text-destructive" aria-label="required">*</span>
                </Label>
                <Input
                  id="headline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder={userRole === 'Executive' ? 'e.g. Fractional CTO — Hardware Startups' : 'e.g. CAD Engineer — SolidWorks & Fusion 360'}
                  maxLength={100}
                  aria-required="true"
                />
                <p className="text-xs text-muted-foreground">
                  {headline.length} / 100 characters
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="availability">Availability</Label>
                <Input
                  id="availability"
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                  placeholder="e.g. 20 hrs/week, Immediate, Flexible"
                />
              </div>
            </div>
          )}

          {/* Step 2: Description + Skills */}
          {currentStep === 'details' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">Tell founders about yourself</h3>
                <p className="text-sm text-muted-foreground">
                  A short bio and your key skills help founders find the right match.
                  Don&apos;t overthink it — you can update this anytime.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Short bio</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. 15 years scaling hardware startups from prototype to production. Previously VP Engineering at..."
                  rows={4}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground">
                  {description.length} / 500 characters
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="skills">Key skills (comma-separated)</Label>
                <Input
                  id="skills"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="e.g. Product Strategy, CAD, Supply Chain, Fundraising"
                />
                <p className="text-xs text-muted-foreground">
                  Separate each skill with a comma
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Confirmation */}
          {currentStep === 'confirm' && (
            <div className="space-y-6 text-center py-8">
              <div className="w-16 h-16 rounded-full bg-status-success-light flex items-center justify-center mx-auto">
                <Sparkles className="h-8 w-8 text-status-success" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">You&apos;re Live!</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Your listing is now visible in the Recruits marketplace.
                  Founders can discover you and invite you to join their company.
                </p>
              </div>
              <Button onClick={handleFinish} className="min-w-[200px]">
                Go to Dashboard
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Footer (not shown on confirm step) */}
      {currentStep !== 'confirm' && (
        <div className="flex items-center justify-between mt-6">
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <Button variant="secondary" onClick={goToPrevStep}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
            <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
              <SkipForward className="h-4 w-4 mr-2" />
              Skip for now
            </Button>
          </div>

          {currentStep === 'details' ? (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Listing'}
              <CheckCircle2 className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={goToNextStep}>
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
