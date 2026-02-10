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
  User, FileText, Linkedin, Phone,
  ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateBasicProfile } from '@/actions/profile-hub'
import { typography } from '@/lib/design-system'

/**
 * EditProfileDialog - Multi-step wizard for editing basic profile fields.
 *
 * @description 2-step wizard accessible to ALL user roles (Founder, Executive, Apprentice).
 * Covers the basic profile fields on the `profiles` table:
 * 1. Name & Bio
 * 2. Contact & Links (phone, LinkedIn)
 *
 * @component
 */

const STEPS = [
  { id: 'basics' as const, title: 'Name & Bio', icon: User },
  { id: 'contact' as const, title: 'Contact & Links', icon: Linkedin },
]

type StepId = typeof STEPS[number]['id']

interface EditProfileDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onOpenChange: (open: boolean) => void
  /** Current profile data for pre-filling */
  profile: {
    id: string
    full_name: string | null
    bio: string | null
    phone_number: string | null
    linkedin_url: string | null
  }
}

interface FormState {
  fullName: string
  bio: string
  phoneNumber: string
  linkedinUrl: string
}

export function EditProfileDialog({
  open,
  onOpenChange,
  profile,
}: EditProfileDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentStep, setCurrentStep] = useState<StepId>('basics')
  const [error, setError] = useState<string | null>(null)

  const [formState, setFormState] = useState<FormState>({
    fullName: profile.full_name || '',
    bio: profile.bio || '',
    phoneNumber: profile.phone_number || '',
    linkedinUrl: profile.linkedin_url || '',
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
      case 'basics':
        if (!formState.fullName.trim()) {
          setError('Full name is required')
          return false
        }
        if (formState.bio.length > 2000) {
          setError('Bio must be 2000 characters or less')
          return false
        }
        return true
      case 'contact':
        if (formState.linkedinUrl && !formState.linkedinUrl.startsWith('http')) {
          setError('LinkedIn URL must start with https://')
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
        '[data-edit-profile-field] input:not([disabled]), [data-edit-profile-field] textarea:not([disabled])'
      )
      firstInput?.focus()
    }, 100)
  }

  function handleSubmit(): void {
    if (!validateStep(currentStep)) return

    startTransition(async () => {
      const result = await updateBasicProfile({
        fullName: formState.fullName.trim(),
        bio: formState.bio.trim() || null,
        phoneNumber: formState.phoneNumber.trim() || null,
        linkedinUrl: formState.linkedinUrl.trim() || null,
      })

      if (result.success) {
        onOpenChange(false)
        router.refresh()
      } else {
        setError(result.error || 'Failed to save profile')
      }
    })
  }

  function handleClose(): void {
    onOpenChange(false)
    setTimeout(() => setCurrentStep('basics'), 300)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="md" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>

        {/* Visual Stepper */}
        <div className="flex items-center gap-1 px-1 py-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            const isActive = step.id === currentStep
            const isCompleted = index < currentStepIndex

            return (
              <div key={step.id} className="flex items-center flex-1">
                {index > 0 && (
                  <div className={cn(
                    'h-0.5 flex-1 mr-2',
                    isCompleted ? 'bg-international-orange' : 'bg-muted'
                  )} />
                )}
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
        <div className="flex-1 overflow-y-auto px-1 py-2" data-edit-profile-field>
          {currentStep === 'basics' && (
            <StepNameBio
              fullName={formState.fullName}
              bio={formState.bio}
              onNameChange={(v) => updateField('fullName', v)}
              onBioChange={(v) => updateField('bio', v)}
            />
          )}
          {currentStep === 'contact' && (
            <StepContactLinks
              phoneNumber={formState.phoneNumber}
              linkedinUrl={formState.linkedinUrl}
              onPhoneChange={(v) => updateField('phoneNumber', v)}
              onLinkedinChange={(v) => updateField('linkedinUrl', v)}
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

function StepNameBio({
  fullName,
  bio,
  onNameChange,
  onBioChange,
}: {
  fullName: string
  bio: string
  onNameChange: (v: string) => void
  onBioChange: (v: string) => void
}) {
  return (
    <div className="space-y-6">
      {/* Full Name */}
      <div className="space-y-3">
        <div>
          <h3 className={typography.wizardStepTitle}>What's your name?</h3>
          <p className={typography.wizardStepDescription}>
            This is how you'll appear across the platform — in tasks, objectives, and your team page.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-fullName">
            Full Name <span className="text-destructive" aria-label="required">*</span>
          </Label>
          <Input
            id="edit-fullName"
            value={fullName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Jane Smith"
            aria-required
          />
        </div>
      </div>

      {/* Bio */}
      <div className="space-y-3">
        <div>
          <h3 className={typography.wizardStepTitle}>Tell people about yourself</h3>
          <p className={typography.wizardStepDescription}>
            A short bio helps your team and collaborators understand your background and expertise.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-bio">Bio</Label>
          <Textarea
            id="edit-bio"
            value={bio}
            onChange={(e) => onBioChange(e.target.value)}
            placeholder="A few sentences about your background, expertise, and what you're working on..."
            rows={6}
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

function StepContactLinks({
  phoneNumber,
  linkedinUrl,
  onPhoneChange,
  onLinkedinChange,
}: {
  phoneNumber: string
  linkedinUrl: string
  onPhoneChange: (v: string) => void
  onLinkedinChange: (v: string) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className={typography.wizardStepTitle}>How can people reach you?</h3>
        <p className={typography.wizardStepDescription}>
          Add your contact details so your team and collaborators can connect with you.
          All fields are optional.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="edit-phone" className="flex items-center gap-1.5">
            <Phone className="h-3 w-3" /> Phone Number
          </Label>
          <Input
            id="edit-phone"
            type="tel"
            value={phoneNumber}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="+44 7700 900000"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-linkedin" className="flex items-center gap-1.5">
            <Linkedin className="h-3 w-3" /> LinkedIn URL
          </Label>
          <Input
            id="edit-linkedin"
            type="url"
            value={linkedinUrl}
            onChange={(e) => onLinkedinChange(e.target.value)}
            placeholder="https://linkedin.com/in/yourname"
          />
          <p className="text-xs text-muted-foreground">
            Adding your LinkedIn helps others verify your background
          </p>
        </div>
      </div>
    </div>
  )
}
