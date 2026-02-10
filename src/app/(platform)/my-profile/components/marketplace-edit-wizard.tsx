'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Briefcase, User, PoundSterling, MapPin, Sparkles,
  ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateMarketplaceProfile, generateBioTemplate } from '@/actions/profile-hub'
import { typography } from '@/lib/design-system'

/**
 * MarketplaceEditWizard - Multi-step dialog for editing provider profile.
 *
 * @description 4-step wizard following the wizard-pattern-standards:
 * 1. Headline & Bio
 * 2. Rates & Experience
 * 3. Location & Links
 * 4. Skills & Specializations
 *
 * @component
 */

const STEPS = [
  { id: 'headline' as const, title: 'Headline & Bio', icon: Briefcase },
  { id: 'rates' as const, title: 'Rates & Experience', icon: PoundSterling },
  { id: 'location' as const, title: 'Location & Links', icon: MapPin },
  { id: 'skills' as const, title: 'Skills', icon: Sparkles },
]

type StepId = typeof STEPS[number]['id']

interface MarketplaceEditWizardProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onOpenChange: (open: boolean) => void
  /** Current provider profile data for pre-filling */
  providerProfile: {
    headline: string | null
    bio: string | null
    day_rate: number | null
    currency: string | null
    years_experience: number | null
    location: string | null
    timezone: string | null
    linkedin_url: string | null
    website_url: string | null
    specializations: string[] | null
  } | null
  /** User role for bio template generation */
  userRole: string
}

interface FormState {
  headline: string
  bio: string
  dayRate: string
  currency: string
  yearsExperience: string
  location: string
  timezone: string
  linkedinUrl: string
  websiteUrl: string
  specializations: string
}

export function MarketplaceEditWizard({
  open,
  onOpenChange,
  providerProfile,
  userRole,
}: MarketplaceEditWizardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentStep, setCurrentStep] = useState<StepId>('headline')
  const [error, setError] = useState<string | null>(null)

  const [formState, setFormState] = useState<FormState>({
    headline: providerProfile?.headline || '',
    bio: providerProfile?.bio || '',
    dayRate: providerProfile?.day_rate?.toString() || '',
    currency: providerProfile?.currency || 'GBP',
    yearsExperience: providerProfile?.years_experience?.toString() || '',
    location: providerProfile?.location || '',
    timezone: providerProfile?.timezone || '',
    linkedinUrl: providerProfile?.linkedin_url || '',
    websiteUrl: providerProfile?.website_url || '',
    specializations: providerProfile?.specializations?.join(', ') || '',
  })

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep)
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === STEPS.length - 1

  function updateField(field: keyof FormState, value: string): void {
    setFormState(prev => ({ ...prev, [field]: value }))
    if (error) setError(null)
  }

  function validateStep(step: StepId): boolean {
    switch (step) {
      case 'headline':
        if (formState.headline && formState.headline.length > 100) {
          setError('Headline must be 100 characters or less')
          return false
        }
        if (formState.bio && formState.bio.length > 2000) {
          setError('Bio must be 2000 characters or less')
          return false
        }
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
      focusFirstInput()
    }
  }

  function goToPrevStep(): void {
    const prevIndex = currentStepIndex - 1
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id)
      setError(null)
    }
  }

  function focusFirstInput(): void {
    setTimeout(() => {
      const firstInput = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        '[data-wizard-field] input:not([disabled]), [data-wizard-field] textarea:not([disabled])'
      )
      firstInput?.focus()
    }, 100)
  }

  function handleSubmit(): void {
    if (!validateStep(currentStep)) return

    startTransition(async () => {
      const formData = new FormData()
      formData.set('headline', formState.headline)
      formData.set('bio', formState.bio)
      if (formState.dayRate) formData.set('dayRate', formState.dayRate)
      formData.set('currency', formState.currency)
      if (formState.yearsExperience) formData.set('yearsExperience', formState.yearsExperience)
      formData.set('location', formState.location)
      formData.set('timezone', formState.timezone)
      formData.set('linkedinUrl', formState.linkedinUrl)
      formData.set('websiteUrl', formState.websiteUrl)
      formData.set('specializations', formState.specializations)

      const result = await updateMarketplaceProfile(formData)
      if (result.success) {
        onOpenChange(false)
        router.refresh()
      } else {
        setError(result.error || 'Failed to save profile')
      }
    })
  }

  async function handleGenerateBio(): Promise<void> {
    const template = await generateBioTemplate(userRole)
    updateField('bio', template)
  }

  function handleClose(): void {
    onOpenChange(false)
    // Reset step on close
    setTimeout(() => setCurrentStep('headline'), 300)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Marketplace Profile</DialogTitle>
        </DialogHeader>

        {/* Visual Stepper */}
        <div className="flex items-center gap-1 px-1 py-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            const isActive = step.id === currentStep
            const isCompleted = index < currentStepIndex

            return (
              <div key={step.id} className="flex items-center flex-1">
                {/* Connector line */}
                {index > 0 && (
                  <div className={cn(
                    'h-0.5 flex-1 mr-2',
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

        {/* Error alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-1 py-2" data-wizard-field>
          {currentStep === 'headline' && (
            <StepHeadlineBio
              headline={formState.headline}
              bio={formState.bio}
              onHeadlineChange={(v) => updateField('headline', v)}
              onBioChange={(v) => updateField('bio', v)}
              onGenerateBio={handleGenerateBio}
            />
          )}
          {currentStep === 'rates' && (
            <StepRatesExperience
              dayRate={formState.dayRate}
              currency={formState.currency}
              yearsExperience={formState.yearsExperience}
              onDayRateChange={(v) => updateField('dayRate', v)}
              onCurrencyChange={(v) => updateField('currency', v)}
              onYearsChange={(v) => updateField('yearsExperience', v)}
            />
          )}
          {currentStep === 'location' && (
            <StepLocationLinks
              location={formState.location}
              timezone={formState.timezone}
              linkedinUrl={formState.linkedinUrl}
              websiteUrl={formState.websiteUrl}
              onLocationChange={(v) => updateField('location', v)}
              onTimezoneChange={(v) => updateField('timezone', v)}
              onLinkedinChange={(v) => updateField('linkedinUrl', v)}
              onWebsiteChange={(v) => updateField('websiteUrl', v)}
            />
          )}
          {currentStep === 'skills' && (
            <StepSkills
              specializations={formState.specializations}
              onSpecializationsChange={(v) => updateField('specializations', v)}
            />
          )}
        </div>

        {/* Navigation footer */}
        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <Button
              variant="secondary"
              onClick={isFirstStep ? handleClose : goToPrevStep}
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
                className="bg-international-orange hover:bg-international-orange/90"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Save Profile
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

/* ─── Step Components ──────────────────────────────────────────────── */

function StepHeadlineBio({
  headline,
  bio,
  onHeadlineChange,
  onBioChange,
  onGenerateBio,
}: {
  headline: string
  bio: string
  onHeadlineChange: (v: string) => void
  onBioChange: (v: string) => void
  onGenerateBio: () => void
}) {
  return (
    <div className="space-y-6">
      {/* Headline */}
      <div className="space-y-3">
        <div>
          <h3 className={typography.wizardStepTitle}>What do you do?</h3>
          <p className={typography.wizardStepDescription}>
            Your headline is the first thing buyers see. Make it specific and compelling.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wizard-headline">
            Professional Headline
          </Label>
          <Input
            id="wizard-headline"
            value={headline}
            onChange={(e) => onHeadlineChange(e.target.value)}
            placeholder='e.g., "Fractional CFO | Helping hardware startups scale from seed to Series B"'
            maxLength={100}
          />
          <p className={typography.wizardCharacterCount}>
            {headline.length} / 100 characters
          </p>
        </div>
      </div>

      {/* Bio */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className={typography.wizardStepTitle}>Tell your story</h3>
            <p className={typography.wizardStepDescription}>
              What problems do you solve? What makes you different? Aim for 150-300 words.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onGenerateBio}>
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Template
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wizard-bio">
            About You
          </Label>
          <Textarea
            id="wizard-bio"
            value={bio}
            onChange={(e) => onBioChange(e.target.value)}
            placeholder="I help [type of company] achieve [outcome] by [method]..."
            rows={8}
            maxLength={2000}
          />
          <p className={typography.wizardCharacterCount}>
            {bio.length} / 2000 characters
          </p>
        </div>
      </div>
    </div>
  )
}

function StepRatesExperience({
  dayRate,
  currency,
  yearsExperience,
  onDayRateChange,
  onCurrencyChange,
  onYearsChange,
}: {
  dayRate: string
  currency: string
  yearsExperience: string
  onDayRateChange: (v: string) => void
  onCurrencyChange: (v: string) => void
  onYearsChange: (v: string) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className={typography.wizardStepTitle}>What do you charge?</h3>
        <p className={typography.wizardStepDescription}>
          Setting rates helps buyers filter and find you quickly.
          Executives in your category typically charge GBP 800-1,500/day.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="wizard-dayRate">Day Rate</Label>
          <Input
            id="wizard-dayRate"
            type="number"
            value={dayRate}
            onChange={(e) => onDayRateChange(e.target.value)}
            placeholder="1000"
            min={0}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wizard-currency">Currency</Label>
          <select
            id="wizard-currency"
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="GBP">GBP (£)</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wizard-years">Years of Experience</Label>
          <Input
            id="wizard-years"
            type="number"
            value={yearsExperience}
            onChange={(e) => onYearsChange(e.target.value)}
            placeholder="10"
            min={0}
            max={50}
          />
        </div>
      </div>
    </div>
  )
}

function StepLocationLinks({
  location,
  timezone,
  linkedinUrl,
  websiteUrl,
  onLocationChange,
  onTimezoneChange,
  onLinkedinChange,
  onWebsiteChange,
}: {
  location: string
  timezone: string
  linkedinUrl: string
  websiteUrl: string
  onLocationChange: (v: string) => void
  onTimezoneChange: (v: string) => void
  onLinkedinChange: (v: string) => void
  onWebsiteChange: (v: string) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className={typography.wizardStepTitle}>Where are you based?</h3>
        <p className={typography.wizardStepDescription}>
          Your location helps with timezone matching. Adding LinkedIn adds credibility.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="wizard-location" className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3" /> Location
          </Label>
          <Input
            id="wizard-location"
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            placeholder="London, UK"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wizard-timezone" className="flex items-center gap-1.5">
            Timezone
          </Label>
          <Input
            id="wizard-timezone"
            value={timezone}
            onChange={(e) => onTimezoneChange(e.target.value)}
            placeholder="Europe/London"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wizard-linkedin" className="flex items-center gap-1.5">
            LinkedIn URL
          </Label>
          <Input
            id="wizard-linkedin"
            type="url"
            value={linkedinUrl}
            onChange={(e) => onLinkedinChange(e.target.value)}
            placeholder="https://linkedin.com/in/yourname"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wizard-website" className="flex items-center gap-1.5">
            Website
          </Label>
          <Input
            id="wizard-website"
            type="url"
            value={websiteUrl}
            onChange={(e) => onWebsiteChange(e.target.value)}
            placeholder="https://yoursite.com"
          />
        </div>
      </div>
    </div>
  )
}

function StepSkills({
  specializations,
  onSpecializationsChange,
}: {
  specializations: string
  onSpecializationsChange: (v: string) => void
}) {
  const skillCount = specializations.split(',').map(s => s.trim()).filter(Boolean).length

  return (
    <div className="space-y-6">
      <div>
        <h3 className={typography.wizardStepTitle}>What are your specializations?</h3>
        <p className={typography.wizardStepDescription}>
          Add skills separated by commas. These help buyers find you when searching.
          Aim for 3-5 specific specializations.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="wizard-skills">
          Specializations
        </Label>
        <Textarea
          id="wizard-skills"
          value={specializations}
          onChange={(e) => onSpecializationsChange(e.target.value)}
          placeholder="Financial Planning, Fundraising, Board Management, M&A"
          rows={4}
        />
        <p className={typography.wizardCharacterCount}>
          {skillCount} {skillCount === 1 ? 'skill' : 'skills'} added
        </p>
      </div>

      {/* Preview */}
      {skillCount > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Preview
          </p>
          <div className="flex flex-wrap gap-1.5">
            {specializations.split(',').map(s => s.trim()).filter(Boolean).map((skill) => (
              <span
                key={skill}
                className="text-xs px-2.5 py-1 bg-secondary text-secondary-foreground rounded-md font-medium"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
