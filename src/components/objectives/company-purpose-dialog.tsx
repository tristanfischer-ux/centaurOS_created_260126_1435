'use client'

/**
 * @file company-purpose-dialog.tsx
 * 
 * @description Multi-step questionnaire dialog for defining company purpose, mission, and vision.
 * Guides founders through 4 steps to articulate why their company exists.
 * 
 * @component CompanyPurposeDialog
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
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Compass,
  Users,
  Lightbulb,
  Rocket,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateFoundryPurpose } from '@/actions/foundry'
import type { FoundryPurposeData, PurposeQuestionnaire } from '@/types/foundry'
import { toast } from 'sonner'

interface CompanyPurposeDialogProps {
  /** Whether dialog is open */
  open: boolean
  /** Callback to close dialog */
  onOpenChange: (open: boolean) => void
  /** Current purpose data (for editing) */
  initialData: FoundryPurposeData | null
  /** Foundry ID to update */
  foundryId: string
  /** Current user ID */
  userId: string
}

type FormStep = 'core' | 'audience' | 'differentiation' | 'vision' | 'review'

const STEPS: { id: FormStep; title: string; icon: React.ElementType }[] = [
  { id: 'core', title: 'Core Purpose', icon: Compass },
  { id: 'audience', title: 'Problem & Audience', icon: Users },
  { id: 'differentiation', title: 'Differentiation', icon: Lightbulb },
  { id: 'vision', title: 'Vision', icon: Rocket },
  { id: 'review', title: 'Review & Refine', icon: CheckCircle2 },
]

const CHARACTER_LIMITS = {
  whyExists: 500,
  problemSolved: 400,
  whoServed: 300,
  uniqueValue: 400,
  fiveYearVision: 500,
  purpose: 200,
  mission: 200,
  vision: 200,
}

/**
 * CompanyPurposeDialog - Multi-step wizard for defining company purpose
 * 
 * @description Guides founders through a 4-step questionnaire to define their
 * company's purpose, mission, and vision. Auto-generates synthesized statements
 * from responses with option to refine.
 * 
 * **Steps:**
 * 1. Core Purpose - Why does your company exist?
 * 2. Problem & Audience - What problem? For whom?
 * 3. Differentiation - What makes you unique?
 * 4. Vision - Where will you be in 5 years?
 * 5. Review & Refine - Edit synthesized statements
 * 
 * @example
 * <CompanyPurposeDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   initialData={foundry?.purpose_data}
 *   foundryId={foundryId}
 *   userId={userId}
 * />
 */
export function CompanyPurposeDialog({
  open,
  onOpenChange,
  initialData,
  foundryId,
  userId,
}: CompanyPurposeDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentStep, setCurrentStep] = useState<FormStep>('core')
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState<{
    questionnaire: Partial<PurposeQuestionnaire>
    purpose: string
    mission: string
    vision: string
  }>({
    questionnaire: initialData?.questionnaire || {
      whyExists: '',
      problemSolved: '',
      whoServed: '',
      uniqueValue: '',
      fiveYearVision: '',
    },
    purpose: initialData?.purpose || '',
    mission: initialData?.mission || '',
    vision: initialData?.vision || '',
  })

  const updateField = <K extends keyof PurposeQuestionnaire>(
    field: K,
    value: PurposeQuestionnaire[K]
  ) => {
    setFormData((prev) => ({
      ...prev,
      questionnaire: { ...prev.questionnaire, [field]: value },
    }))
    if (error) setError(null)
  }

  const updateSynthesized = (field: 'purpose' | 'mission' | 'vision', value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (error) setError(null)
  }

  const validateStep = (step: FormStep): boolean => {
    const q = formData.questionnaire
    
    switch (step) {
      case 'core':
        if (!q.whyExists?.trim()) {
          setError('Please explain why your company exists')
          return false
        }
        return true
      case 'audience':
        if (!q.problemSolved?.trim()) {
          setError('Please describe the problem you solve')
          return false
        }
        if (!q.whoServed?.trim()) {
          setError('Please describe who you serve')
          return false
        }
        return true
      case 'differentiation':
        if (!q.uniqueValue?.trim()) {
          setError('Please describe what makes you unique')
          return false
        }
        return true
      case 'vision':
        if (!q.fiveYearVision?.trim()) {
          setError('Please describe your 5-year vision')
          return false
        }
        return true
      case 'review':
        if (!formData.purpose?.trim()) {
          setError('Please provide a purpose statement')
          return false
        }
        return true
      default:
        return true
    }
  }

  const goToNextStep = () => {
    if (!validateStep(currentStep)) return

    const currentIndex = STEPS.findIndex((s) => s.id === currentStep)
    if (currentIndex < STEPS.length - 1) {
      const nextStep = STEPS[currentIndex + 1].id
      
      // Auto-generate synthesized statements when moving to review
      if (nextStep === 'review' && !formData.purpose) {
        synthesizeStatements()
      }
      
      setCurrentStep(nextStep)
      setError(null)
      
      // Focus first field in next step
      setTimeout(() => {
        const firstInput = document.querySelector<HTMLTextAreaElement>(
          'textarea:not([disabled])'
        )
        firstInput?.focus()
      }, 100)
    }
  }

  const goToPrevStep = () => {
    const currentIndex = STEPS.findIndex((s) => s.id === currentStep)
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1].id)
      setError(null)
    }
  }

  // Simple synthesis based on questionnaire responses
  const synthesizeStatements = () => {
    const q = formData.questionnaire

    // Purpose: Core "why" statement
    const purpose = `${q.whyExists?.split('.')[0]}.` // First sentence
    
    // Mission: What we do and for whom
    const mission = `We ${q.problemSolved?.toLowerCase().replace('we ', '').replace('i ', '')} for ${q.whoServed?.toLowerCase()}.`
    
    // Vision: 5-year future state
    const vision = q.fiveYearVision || ''

    setFormData((prev) => ({
      ...prev,
      purpose: purpose || prev.purpose,
      mission: mission || prev.mission,
      vision: vision || prev.vision,
    }))
  }

  const handleSubmit = async () => {
    if (!validateStep('review')) return

    console.log('[CompanyPurposeDialog] Starting submit with foundryId:', foundryId)
    console.log('[CompanyPurposeDialog] Purpose text:', formData.purpose?.substring(0, 50))

    startTransition(async () => {
      try {
        const purposeData: FoundryPurposeData = {
          purpose: formData.purpose,
          mission: formData.mission || null,
          vision: formData.vision || null,
          questionnaire: formData.questionnaire as PurposeQuestionnaire,
          updatedAt: new Date().toISOString(),
          updatedBy: userId,
        }

        console.log('[CompanyPurposeDialog] Calling updateFoundryPurpose action...')
        const result = await updateFoundryPurpose(foundryId, purposeData)
        console.log('[CompanyPurposeDialog] Action result:', result)

        if (result.success) {
          toast.success('Company purpose updated successfully')
          onOpenChange(false)
          router.refresh()
        } else {
          setError(result.error || 'Failed to update purpose')
        }
      } catch (err) {
        setError('An unexpected error occurred')
        console.error('[CompanyPurposeDialog] Submit error:', err)
      }
    })
  }

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep)
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === STEPS.length - 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-international-orange" />
            {initialData ? 'Edit Company Purpose' : 'Define Your Company Purpose'}
          </DialogTitle>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-4">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            const isActive = step.id === currentStep
            const isCompleted = index < currentStepIndex

            return (
              <div
                key={step.id}
                className={cn(
                  'flex items-center gap-2 flex-1',
                  index > 0 && 'pl-2'
                )}
              >
                {index > 0 && (
                  <div
                    className={cn(
                      'h-0.5 flex-1',
                      isCompleted
                        ? 'bg-international-orange'
                        : 'bg-muted'
                    )}
                  />
                )}
                <div
                  className={cn(
                    'flex items-center justify-center rounded-full',
                    'h-8 w-8 transition-colors',
                    isActive && 'bg-international-orange text-white',
                    isCompleted && !isActive && 'bg-orange-100 text-international-orange',
                    !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            )
          })}
        </div>

        {/* Step content */}
        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {currentStep === 'core' && (
            <StepCore
              value={formData.questionnaire.whyExists || ''}
              onChange={(value) => updateField('whyExists', value)}
              limit={CHARACTER_LIMITS.whyExists}
            />
          )}

          {currentStep === 'audience' && (
            <StepAudience
              problemSolved={formData.questionnaire.problemSolved || ''}
              whoServed={formData.questionnaire.whoServed || ''}
              onProblemChange={(value) => updateField('problemSolved', value)}
              onAudienceChange={(value) => updateField('whoServed', value)}
              problemLimit={CHARACTER_LIMITS.problemSolved}
              audienceLimit={CHARACTER_LIMITS.whoServed}
            />
          )}

          {currentStep === 'differentiation' && (
            <StepDifferentiation
              value={formData.questionnaire.uniqueValue || ''}
              onChange={(value) => updateField('uniqueValue', value)}
              limit={CHARACTER_LIMITS.uniqueValue}
            />
          )}

          {currentStep === 'vision' && (
            <StepVision
              value={formData.questionnaire.fiveYearVision || ''}
              onChange={(value) => updateField('fiveYearVision', value)}
              limit={CHARACTER_LIMITS.fiveYearVision}
            />
          )}

          {currentStep === 'review' && (
            <StepReview
              purpose={formData.purpose}
              mission={formData.mission}
              vision={formData.vision}
              onPurposeChange={(value) => updateSynthesized('purpose', value)}
              onMissionChange={(value) => updateSynthesized('mission', value)}
              onVisionChange={(value) => updateSynthesized('vision', value)}
              purposeLimit={CHARACTER_LIMITS.purpose}
              missionLimit={CHARACTER_LIMITS.mission}
              visionLimit={CHARACTER_LIMITS.vision}
            />
          )}
        </div>

        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <Button
              type="button"
              variant="secondary"
              onClick={isFirstStep ? () => onOpenChange(false) : goToPrevStep}
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
                className="bg-international-orange hover:bg-international-orange-hover"
              >
                {isPending ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Save Purpose
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={goToNextStep}
                disabled={isPending}
              >
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

// Step 1: Core Purpose
function StepCore({
  value,
  onChange,
  limit,
}: {
  value: string
  onChange: (value: string) => void
  limit: number
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Why does your company exist?</h3>
        <p className="text-sm text-muted-foreground">
          Think beyond profit. What change do you want to make in the world? What gets you out of bed every day?
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="whyExists">
          Your answer <span className="text-destructive" aria-label="required">*</span>
        </Label>
        <Textarea
          id="whyExists"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="We exist to..."
          rows={6}
          maxLength={limit}
          aria-required="true"
          aria-describedby="whyExists-help"
        />
        <p id="whyExists-help" className="text-xs text-muted-foreground">
          {value.length} / {limit} characters
        </p>
      </div>
    </div>
  )
}

// Step 2: Problem & Audience
function StepAudience({
  problemSolved,
  whoServed,
  onProblemChange,
  onAudienceChange,
  problemLimit,
  audienceLimit,
}: {
  problemSolved: string
  whoServed: string
  onProblemChange: (value: string) => void
  onAudienceChange: (value: string) => void
  problemLimit: number
  audienceLimit: number
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">What problem are you solving?</h3>
          <p className="text-sm text-muted-foreground">
            Describe the specific pain point or opportunity you're addressing.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="problemSolved">
            Problem <span className="text-destructive" aria-label="required">*</span>
          </Label>
          <Textarea
            id="problemSolved"
            value={problemSolved}
            onChange={(e) => onProblemChange(e.target.value)}
            placeholder="The problem we solve is..."
            rows={4}
            maxLength={problemLimit}
            aria-required="true"
          />
          <p className="text-xs text-muted-foreground">
            {problemSolved.length} / {problemLimit} characters
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">Who are you solving it for?</h3>
          <p className="text-sm text-muted-foreground">
            Be specific about your target audience.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="whoServed">
            Target audience <span className="text-destructive" aria-label="required">*</span>
          </Label>
          <Textarea
            id="whoServed"
            value={whoServed}
            onChange={(e) => onAudienceChange(e.target.value)}
            placeholder="We serve..."
            rows={4}
            maxLength={audienceLimit}
            aria-required="true"
          />
          <p className="text-xs text-muted-foreground">
            {whoServed.length} / {audienceLimit} characters
          </p>
        </div>
      </div>
    </div>
  )
}

// Step 3: Differentiation
function StepDifferentiation({
  value,
  onChange,
  limit,
}: {
  value: string
  onChange: (value: string) => void
  limit: number
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">What makes your approach unique?</h3>
        <p className="text-sm text-muted-foreground">
          What do you do differently than alternatives? What's your unfair advantage?
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="uniqueValue">
          Your unique value <span className="text-destructive" aria-label="required">*</span>
        </Label>
        <Textarea
          id="uniqueValue"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="What makes us different is..."
          rows={6}
          maxLength={limit}
          aria-required="true"
        />
        <p className="text-xs text-muted-foreground">
          {value.length} / {limit} characters
        </p>
      </div>
    </div>
  )
}

// Step 4: Vision
function StepVision({
  value,
  onChange,
  limit,
}: {
  value: string
  onChange: (value: string) => void
  limit: number
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Where will your company be in 5 years?</h3>
        <p className="text-sm text-muted-foreground">
          Describe the future state you're working toward. What does success look like?
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="fiveYearVision">
          5-year vision <span className="text-destructive" aria-label="required">*</span>
        </Label>
        <Textarea
          id="fiveYearVision"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="In 5 years, we will..."
          rows={6}
          maxLength={limit}
          aria-required="true"
        />
        <p className="text-xs text-muted-foreground">
          {value.length} / {limit} characters
        </p>
      </div>
    </div>
  )
}

// Step 5: Review & Refine
function StepReview({
  purpose,
  mission,
  vision,
  onPurposeChange,
  onMissionChange,
  onVisionChange,
  purposeLimit,
  missionLimit,
  visionLimit,
}: {
  purpose: string
  mission: string
  vision: string
  onPurposeChange: (value: string) => void
  onMissionChange: (value: string) => void
  onVisionChange: (value: string) => void
  purposeLimit: number
  missionLimit: number
  visionLimit: number
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Review and refine your purpose</h3>
        <p className="text-sm text-muted-foreground">
          We've synthesized your answers below. Feel free to edit and refine these statements.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="purpose">
          Purpose (The "why") <span className="text-destructive" aria-label="required">*</span>
        </Label>
        <Textarea
          id="purpose"
          value={purpose}
          onChange={(e) => onPurposeChange(e.target.value)}
          placeholder="Why we exist..."
          rows={3}
          maxLength={purposeLimit}
          aria-required="true"
          aria-describedby="purpose-help"
        />
        <p id="purpose-help" className="text-xs text-muted-foreground">
          {purpose.length} / {purposeLimit} characters · Shown prominently on Objectives page
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mission">Mission (What we do)</Label>
        <Textarea
          id="mission"
          value={mission}
          onChange={(e) => onMissionChange(e.target.value)}
          placeholder="What we do and for whom..."
          rows={2}
          maxLength={missionLimit}
        />
        <p className="text-xs text-muted-foreground">
          {mission.length} / {missionLimit} characters · Optional
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="vision">Vision (Where we're going)</Label>
        <Textarea
          id="vision"
          value={vision}
          onChange={(e) => onVisionChange(e.target.value)}
          placeholder="The future state we're working toward..."
          rows={2}
          maxLength={visionLimit}
        />
        <p className="text-xs text-muted-foreground">
          {vision.length} / {visionLimit} characters · Optional
        </p>
      </div>
    </div>
  )
}
