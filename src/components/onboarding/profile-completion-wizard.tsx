'use client'

/**
 * @file profile-completion-wizard.tsx
 *
 * @description Mandatory 4-step profile completion wizard that fires after
 * the company name step in unified onboarding. Collects headline, bio,
 * skills, industries, experience, and availability — the minimum fields
 * needed for recruits matching.
 *
 * Users can skip and complete later from My Profile.
 * Draft auto-saves on each step transition to survive page refresh.
 */

import { useState, useCallback, useEffect, useRef, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  ArrowRight,
  ArrowLeft,
  User,
  Sparkles,
  Briefcase,
  Clock,
  X,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { completeProfileWizard } from '@/actions/complete-profile-wizard'
import { updateOnboardingData } from '@/actions/onboarding'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

import type { OnboardingData } from '@/actions/onboarding'

// ── Types ──────────────────────────────────────────────────────────────

interface ProfileCompletionWizardProps {
  open: boolean
  userRole?: string
  onboardingData: OnboardingData | null
}

type WizardStep = 'identity' | 'expertise' | 'experience' | 'availability'
const STEPS: WizardStep[] = ['identity', 'expertise', 'experience', 'availability']

const STEP_LABELS: Record<WizardStep, { title: string; subtitle: string; icon: typeof User }> = {
  identity: { title: 'Your Professional Identity', subtitle: 'Tell us a bit about yourself — you can always change this later', icon: User },
  expertise: { title: 'Your Expertise', subtitle: 'What you bring to the table', icon: Sparkles },
  experience: { title: 'Your Experience', subtitle: 'Your professional background', icon: Briefcase },
  availability: { title: 'Your Availability', subtitle: 'How much time you can give', icon: Clock },
}

// ── Suggestion Lists ───────────────────────────────────────────────────

// ── Executive Role Options ─────────────────────────────────────────────
// INTENT: Structured role selection for marketplace subcategory. Users pick
// their functional area so founders can filter by "I need a fractional CFO"
// rather than browsing generic "Fractional Executive" listings.

const EXECUTIVE_ROLE_OPTIONS = [
  { value: 'CFO', label: 'CFO / Finance Director' },
  { value: 'CTO', label: 'CTO / Technical Director' },
  { value: 'COO', label: 'COO / Operations Director' },
  { value: 'CMO', label: 'CMO / Marketing Director' },
  { value: 'VP Engineering', label: 'VP Engineering' },
  { value: 'VP Manufacturing', label: 'VP Manufacturing' },
  { value: 'VP Supply Chain', label: 'VP Supply Chain' },
  { value: 'VP Sales', label: 'VP Sales / Commercial Director' },
  { value: 'VP Product', label: 'VP Product' },
  { value: 'VP HR', label: 'VP HR / People Director' },
  { value: 'General Counsel', label: 'General Counsel / Legal Director' },
  { value: 'Board Advisor', label: 'Board Advisor / NED' },
  { value: 'Other', label: 'Other' },
]

const SKILL_SUGGESTIONS = [
  'Financial Planning', 'Fundraising', 'FP&A', 'Treasury',
  'Operations', 'Supply Chain', 'Manufacturing', 'Lean',
  'Software Engineering', 'DevOps', 'Firmware', 'Architecture',
  'Sales', 'Business Development', 'Revenue Operations',
  'Marketing', 'Growth', 'Brand Strategy', 'SEO',
  'Talent Acquisition', 'People Operations', 'HR',
  'Legal', 'Compliance', 'IP', 'Contracts',
  'Product Management', 'UX Design', 'Product Strategy',
]

const INDUSTRY_SUGGESTIONS = [
  'Manufacturing', 'Engineering', 'Aerospace', 'Defence',
  'Automotive', 'Energy', 'CleanTech', 'HealthTech',
  'FinTech', 'SaaS', 'Hardware', 'IoT',
  'Construction', 'Food & Beverage', 'Retail',
  'Logistics', 'Agriculture', 'Education',
  'Life Sciences', 'Biotech', 'Medtech',
]

const EXPERIENCE_RANGES = [
  { value: 1, label: '0–2 years' },
  { value: 3, label: '3–5 years' },
  { value: 7, label: '5–10 years' },
  { value: 12, label: '10–15 years' },
  { value: 17, label: '15–20 years' },
  { value: 25, label: '20+ years' },
]

const APPRENTICE_EXPERIENCE_RANGES = [
  { value: 0, label: 'Still studying' },
  { value: 1, label: 'Less than 1 year' },
  { value: 2, label: '1–3 years' },
  { value: 4, label: '3–5 years' },
  { value: 7, label: '5+ years' },
]

const AVAILABILITY_OPTIONS = [
  { value: 'full-time', label: 'Full-time', desc: '40+ hours/week' },
  { value: 'part-time', label: 'Part-time', desc: '10–30 hours/week' },
  { value: 'advisory', label: 'Advisory only', desc: '2–8 hours/week' },
  { value: 'project-based', label: 'Project-based', desc: 'Flexible commitment' },
]

// ── Animation ──────────────────────────────────────────────────────────

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction < 0 ? 300 : -300, opacity: 0 }),
}

// ── Tag Input Component ────────────────────────────────────────────────

function TagInput({
  value,
  onChange,
  suggestions,
  placeholder,
  maxTags = 10,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions: string[]
  placeholder: string
  maxTags?: number
}) {
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Show all unselected suggestions, filtered by typed text if any
  const availableSuggestions = suggestions.filter(s => !value.includes(s))
  const filteredDropdown = inputValue.length > 0
    ? availableSuggestions.filter(s => s.toLowerCase().includes(inputValue.toLowerCase())).slice(0, 6)
    : []

  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim()
    if (trimmed && !value.includes(trimmed) && value.length < maxTags) {
      onChange([...value, trimmed])
    }
    setInputValue('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }, [value, onChange, maxTags])

  const removeTag = useCallback((tag: string) => {
    onChange(value.filter(t => t !== tag))
  }, [value, onChange])

  // INTENT: Flush any typed-but-not-entered text before parent validates.
  // Called by the wizard's goNext before checking required minimums.
  const flushInput = useCallback(() => {
    if (inputValue.trim()) {
      addTag(inputValue)
    }
  }, [inputValue, addTag])

  // Expose flush via ref so parent can call it
  useEffect(() => {
    if (inputRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (inputRef.current as any).__flushTag = flushInput
    }
  }, [flushInput])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
        {value.map(tag => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove ${tag}`}
              className="ml-0.5 rounded-full hover:bg-muted p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="relative">
        <Input
          ref={inputRef}
          data-tag-input="true"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setShowSuggestions(true)
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              if (inputValue.trim()) addTag(inputValue)
            }
            if (e.key === 'Backspace' && !inputValue && value.length) {
              removeTag(value[value.length - 1])
            }
          }}
          placeholder={value.length >= maxTags ? `Maximum ${maxTags} tags` : placeholder}
          disabled={value.length >= maxTags}
          className="bg-card"
        />
        {showSuggestions && filteredDropdown.length > 0 && (
          <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-lg py-1">
            {filteredDropdown.map(s => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); addTag(s) }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* INTENT: Always show clickable suggestion chips (not just when empty).
          Users can click these instead of typing. Chips that are already selected are hidden. */}
      {availableSuggestions.length > 0 && value.length < maxTags && (
        <div className="flex flex-wrap gap-1.5">
          {availableSuggestions.slice(0, 12).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="text-xs px-2.5 py-1.5 rounded-full border border-dashed border-border text-muted-foreground hover:border-international-orange hover:text-international-orange hover:bg-international-orange/5 transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────

export function ProfileCompletionWizard({
  open,
  userRole,
  onboardingData,
}: ProfileCompletionWizardProps) {
  const router = useRouter()
  const [stepIndex, setStepIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const hydrated = useRef(false)

  // ── Form State ────────────────────────────────────────────────────
  const [executiveRole, setExecutiveRole] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [headline, setHeadline] = useState('')
  const [bio, setBio] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [industries, setIndustries] = useState<string[]>([])
  const [yearsExperience, setYearsExperience] = useState<number | null>(null)
  const [expertiseAreas, setExpertiseAreas] = useState<string[]>([])
  const [availabilityType, setAvailabilityType] = useState('')
  const [hoursPerWeek, setHoursPerWeek] = useState<number | null>(null)
  const [dayRate, setDayRate] = useState<number | null>(null)

  // ── Hydrate from draft ────────────────────────────────────────────
  useEffect(() => {
    if (hydrated.current) return
    const draft = onboardingData?.profile_wizard_draft
    if (draft) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((draft as any).executive_role) setExecutiveRole((draft as any).executive_role)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((draft as any).linkedin_url) setLinkedinUrl((draft as any).linkedin_url)
      if (draft.headline) setHeadline(draft.headline)
      if (draft.bio) setBio(draft.bio)
      if (draft.skills) setSkills(draft.skills)
      if (draft.industries) setIndustries(draft.industries)
      if (draft.years_experience != null) setYearsExperience(draft.years_experience)
      if (draft.expertise_areas) setExpertiseAreas(draft.expertise_areas)
      if (draft.availability_type) setAvailabilityType(draft.availability_type)
      if (draft.availability_hours_per_week != null) setHoursPerWeek(draft.availability_hours_per_week)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((draft as any).day_rate != null) setDayRate((draft as any).day_rate)
      if (draft.current_step != null) setStepIndex(draft.current_step)
    }
    hydrated.current = true
  }, [onboardingData])

  // ── Draft Save ────────────────────────────────────────────────────
  const saveDraft = useCallback(async (nextStep: number) => {
    updateOnboardingData({
      profile_wizard_draft: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        executive_role: executiveRole || undefined,
        linkedin_url: linkedinUrl || undefined,
        headline, bio, skills, industries,
        years_experience: yearsExperience ?? undefined,
        expertise_areas: expertiseAreas,
        availability_type: availabilityType,
        availability_hours_per_week: hoursPerWeek ?? undefined,
        day_rate: dayRate ?? undefined,
        current_step: nextStep,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }).catch(() => {}) // Non-blocking
  }, [executiveRole, linkedinUrl, headline, bio, skills, industries, yearsExperience, expertiseAreas, availabilityType, hoursPerWeek, dayRate])

  // ── Navigation ────────────────────────────────────────────────────
  const currentStep = STEPS[stepIndex]
  const progressPercent = ((stepIndex + 1) / STEPS.length) * 100

  const validateStep = useCallback((): boolean => {
    const newErrors: Record<string, string> = {}

    if (currentStep === 'identity') {
      // DECISION: Allow empty — users can skip and fill later. Only validate max length.
      if (headline.trim().length > 120) newErrors.headline = 'Headline must be under 120 characters'
      if (bio.trim().length > 500) newErrors.bio = 'Bio must be under 500 characters'
      // Validate LinkedIn URL format if provided
      if (linkedinUrl.trim() && !linkedinUrl.trim().match(/^https?:\/\/(www\.)?linkedin\.com\/in\//i)) {
        newErrors.linkedinUrl = 'Please enter a valid LinkedIn profile URL (linkedin.com/in/...)'
      }
    }
    if (currentStep === 'expertise') {
      // DECISION: Allow empty — users can add skills later from My Profile.
    }
    if (currentStep === 'experience') {
      if (yearsExperience == null) newErrors.yearsExperience = 'Please select your experience level'
    }
    if (currentStep === 'availability') {
      if (!availabilityType) newErrors.availabilityType = 'Please select your availability'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [currentStep, headline, bio, linkedinUrl, skills, industries, yearsExperience, availabilityType])

  const goNext = useCallback(async () => {
    // INTENT: Auto-add any typed-but-not-entered text in tag inputs before validating.
    // Users often type a skill then click Continue without pressing Enter.
    document.querySelectorAll<HTMLInputElement>('input[data-tag-input]').forEach(el => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((el as any).__flushTag) (el as any).__flushTag()
    })
    // Wait one tick for state to update after flush
    await new Promise(r => setTimeout(r, 0))

    if (!validateStep()) return

    if (stepIndex < STEPS.length - 1) {
      setDirection(1)
      const next = stepIndex + 1
      setStepIndex(next)
      setErrors({})
      saveDraft(next)
    } else {
      // Final submit
      setIsSubmitting(true)
      const result = await completeProfileWizard({
        executive_role: executiveRole || undefined,
        linkedin_url: linkedinUrl.trim() || undefined,
        headline: headline.trim(),
        bio: bio.trim(),
        skills,
        industries,
        years_experience: yearsExperience!,
        expertise_areas: expertiseAreas,
        availability_type: availabilityType,
        availability_hours_per_week: hoursPerWeek,
        day_rate: dayRate,
      })

      if (result.error) {
        toast.error(result.error)
        setIsSubmitting(false)
        return
      }

      setIsCompleted(true)
      toast.success('Profile complete! You\'re now visible to companies looking for talent.')
      router.refresh()
    }
  }, [stepIndex, validateStep, saveDraft, executiveRole, linkedinUrl, headline, bio, skills, industries, yearsExperience, expertiseAreas, availabilityType, hoursPerWeek, dayRate, router])

  const goBack = useCallback(() => {
    if (stepIndex > 0) {
      setDirection(-1)
      setStepIndex(stepIndex - 1)
      setErrors({})
    }
  }, [stepIndex])

  const handleSkip = useCallback(async () => {
    try {
      await updateOnboardingData({ profile_wizard_completed: true })
      toast.success('You can complete your profile anytime from My Profile')
      router.refresh()
    } catch {
      toast.error('Failed to skip. Please try again.')
    }
  }, [router])

  // ACCESSIBILITY: Focus trap — keep keyboard users inside the wizard
  const wizardRef = useRef<HTMLDivElement>(null)
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !wizardRef.current) return
    const focusable = wizardRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }, [])

  // ACCESSIBILITY: Auto-focus first input on step change
  useEffect(() => {
    if (!wizardRef.current) return
    const timer = setTimeout(() => {
      const firstInput = wizardRef.current?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled])')
      firstInput?.focus()
    }, 350) // after animation completes
    return () => clearTimeout(timer)
  }, [stepIndex])

  if (!open || isCompleted) return null

  const stepInfo = STEP_LABELS[currentStep]
  const StepIcon = stepInfo.icon
  const isApprentice = userRole === 'Apprentice'
  const experienceRanges = isApprentice ? APPRENTICE_EXPERIENCE_RANGES : EXPERIENCE_RANGES

  return (
    // GOTCHA: Outer container scrolls. Inner wrapper uses min-h-full + flex
    // so content centres vertically when it fits and scrolls when it doesn't.
    // Previously `flex items-center justify-center` on the fixed container
    // with no overflow pushed the Continue button off-screen whenever the
    // identity step grew (e.g. when a LinkedIn URL reveals the reference
    // banner + extra helper paragraphs). Reported by CB 2026-04-21.
    <div ref={wizardRef} role="dialog" aria-modal="true" aria-label="Complete your profile" className="fixed inset-0 z-50 overflow-y-auto bg-background" onKeyDown={handleKeyDown}>
      {/* Progress bar — sticky so it stays visible when the dialog scrolls */}
      <div className="sticky top-0 left-0 right-0 h-1 bg-muted z-10" role="progressbar" aria-valuenow={stepIndex + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
        <motion.div
          className="h-full bg-international-orange"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Step counter — announced to screen readers on change */}
      <div className="absolute top-6 right-8 text-sm text-muted-foreground z-10" aria-live="polite" aria-atomic="true">
        Step {stepIndex + 1} of {STEPS.length}
      </div>

      {/* Scroll wrapper — centres content when it fits, flows when it doesn't */}
      <div className="flex min-h-full items-center justify-center px-6 py-10">
      {/* Content */}
      <div className="w-full max-w-lg">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            {/* Step header */}
            <div className="text-center mb-8">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-international-orange/10 mb-4"
              >
                <StepIcon className="h-6 w-6 text-international-orange" />
              </motion.div>
              <h2 className="text-2xl font-semibold text-foreground">{stepInfo.title}</h2>
              <p className="text-muted-foreground mt-1">{stepInfo.subtitle}</p>
            </div>

            {/* Step content */}
            <div className="space-y-5">
              {currentStep === 'identity' && (
                <>
                  {/* Executive role selector — primary differentiator for marketplace discovery */}
                  {(userRole === 'Executive' || !userRole) && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        What best describes your role?
                      </label>
                      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Executive role">
                        {EXECUTIVE_ROLE_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={executiveRole === opt.value}
                            onClick={() => {
                              setExecutiveRole(opt.value)
                              // INTENT: Auto-populate headline from role selection as a starting point.
                              // Users can edit it afterwards. Only set if headline is empty or was
                              // previously auto-set from another role selection.
                              const autoHeadlines = EXECUTIVE_ROLE_OPTIONS.map(o => `Fractional ${o.value}`)
                              if (!headline || autoHeadlines.includes(headline)) {
                                setHeadline(opt.value === 'Other' ? '' : `Fractional ${opt.value}`)
                              }
                            }}
                            className={cn(
                              "px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-left",
                              executiveRole === opt.value
                                ? "border-international-orange bg-international-orange/10 text-international-orange"
                                : "border-border bg-card text-foreground hover:border-international-orange/50"
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {errors.executiveRole && <p className="text-sm text-destructive mt-1" role="alert">{errors.executiveRole}</p>}
                    </div>
                  )}

                  {/* INTENT: If LinkedIn URL is provided, show a persistent reference banner
                      prompting them to open LinkedIn in a separate tab for reference */}
                  {linkedinUrl.trim() && /linkedin\.com\/in\//i.test(linkedinUrl) && (
                    <div className="flex items-center gap-3 rounded-lg border border-international-orange/20 bg-international-orange/5 px-4 py-2.5">
                      <span className="text-xs text-foreground">
                        Use your LinkedIn profile as a reference for the fields below.
                      </span>
                      <a
                        href={linkedinUrl.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs font-medium text-international-orange hover:underline"
                      >
                        Open LinkedIn ↗
                      </a>
                    </div>
                  )}

                  <div>
                    <label htmlFor="headline" className="block text-sm font-medium text-foreground mb-1.5">
                      Your headline
                    </label>
                    <p className="text-xs text-muted-foreground mb-2">
                      {linkedinUrl.trim()
                        ? 'Your LinkedIn headline is a good starting point. Click an example or write your own:'
                        : 'Click an example to get started, or write your own:'}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {[
                        'Founder building [product type]',
                        'CTO & Technical Co-founder',
                        'Fractional CFO | SaaS & Manufacturing',
                      ].map((example) => (
                        <button
                          key={example}
                          type="button"
                          onClick={() => { setHeadline(example); setErrors(prev => ({ ...prev, headline: '' })) }}
                          className="text-xs px-2.5 py-1.5 rounded-full border border-dashed border-border text-muted-foreground hover:border-international-orange hover:text-international-orange hover:bg-international-orange/5 transition-colors"
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                    <Input
                      id="headline"
                      value={headline}
                      onChange={(e) => { setHeadline(e.target.value); setErrors(prev => ({ ...prev, headline: '' })) }}
                      placeholder="e.g., CFO & Finance Leader | SaaS & Manufacturing"
                      maxLength={120}
                      className={cn("bg-card", errors.headline && "border-destructive")}
                      aria-invalid={!!errors.headline}
                      aria-describedby={errors.headline ? 'headline-error' : undefined}
                    />
                    <div className="flex justify-between mt-1">
                      {errors.headline ? (
                        <p id="headline-error" className="text-sm text-destructive" role="alert">{errors.headline}</p>
                      ) : <span />}
                      <span className="text-xs text-muted-foreground">{headline.length}/120</span>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="bio" className="block text-sm font-medium text-foreground mb-1.5">
                      About you
                    </label>
                    {linkedinUrl.trim() && (
                      <p className="text-xs text-muted-foreground mb-2">
                        Your LinkedIn About section is a good starting point — copy and adapt it here.
                      </p>
                    )}
                    <textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => { setBio(e.target.value); setErrors(prev => ({ ...prev, bio: '' })) }}
                      placeholder="Describe your professional background and what you bring to companies you work with..."
                      maxLength={500}
                      rows={4}
                      className={cn(
                        "flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm",
                        "placeholder:text-muted-foreground focus-visible:outline-none",
                        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        "resize-none",
                        errors.bio && "border-destructive"
                      )}
                      aria-invalid={!!errors.bio}
                      aria-describedby={errors.bio ? 'bio-error' : undefined}
                    />
                    <div className="flex justify-between mt-1">
                      {errors.bio ? (
                        <p id="bio-error" className="text-sm text-destructive" role="alert">{errors.bio}</p>
                      ) : <span />}
                      <span className="text-xs text-muted-foreground">{bio.length}/500</span>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="linkedinUrl" className="block text-sm font-medium text-foreground mb-1.5">
                      LinkedIn profile
                    </label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Add your LinkedIn URL so founders can view your full background. You can use your LinkedIn profile as a reference when completing the fields below.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        id="linkedinUrl"
                        value={linkedinUrl}
                        onChange={(e) => { setLinkedinUrl(e.target.value); setErrors(prev => ({ ...prev, linkedinUrl: '' })) }}
                        placeholder="https://linkedin.com/in/your-name"
                        className={cn("bg-card flex-1", errors.linkedinUrl && "border-destructive")}
                        aria-invalid={!!errors.linkedinUrl}
                        aria-describedby={errors.linkedinUrl ? 'linkedin-error' : undefined}
                      />
                      {linkedinUrl.trim() && /linkedin\.com\/in\//i.test(linkedinUrl) && (
                        <a
                          href={linkedinUrl.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center shrink-0 h-10 px-3 rounded-md border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors"
                        >
                          Open LinkedIn ↗
                        </a>
                      )}
                    </div>
                    {errors.linkedinUrl && (
                      <p id="linkedin-error" className="text-sm text-destructive mt-1" role="alert">{errors.linkedinUrl}</p>
                    )}
                  </div>
                </>
              )}

              {currentStep === 'expertise' && (
                <>
                  {linkedinUrl.trim() && /linkedin\.com\/in\//i.test(linkedinUrl) && (
                    <div className="flex items-center gap-3 rounded-lg border border-international-orange/20 bg-international-orange/5 px-4 py-2.5">
                      <span className="text-xs text-foreground">
                        Your LinkedIn Skills section is a useful reference here.
                      </span>
                      <a
                        href={linkedinUrl.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs font-medium text-international-orange hover:underline"
                      >
                        Open LinkedIn ↗
                      </a>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Your skills
                    </label>
                    <TagInput
                      value={skills}
                      onChange={(v) => { setSkills(v); setErrors(prev => ({ ...prev, skills: '' })) }}
                      suggestions={SKILL_SUGGESTIONS}
                      placeholder="Type a skill and press Enter..."
                    />
                    {errors.skills && <p className="text-sm text-destructive mt-1" role="alert">{errors.skills}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Industries you know
                    </label>
                    <TagInput
                      value={industries}
                      onChange={(v) => { setIndustries(v); setErrors(prev => ({ ...prev, industries: '' })) }}
                      suggestions={INDUSTRY_SUGGESTIONS}
                      placeholder="Type an industry and press Enter..."
                    />
                    {errors.industries && <p className="text-sm text-destructive mt-1" role="alert">{errors.industries}</p>}
                  </div>
                </>
              )}

              {currentStep === 'experience' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Years of experience
                    </label>
                    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Years of experience" aria-required="true">
                      {experienceRanges.map(range => (
                        <button
                          key={range.value}
                          type="button"
                          role="radio"
                          aria-checked={yearsExperience === range.value}
                          onClick={() => { setYearsExperience(range.value); setErrors(prev => ({ ...prev, yearsExperience: '' })) }}
                          className={cn(
                            "px-4 py-3 rounded-lg border text-sm font-medium transition-all",
                            yearsExperience === range.value
                              ? "border-international-orange bg-international-orange/10 text-international-orange"
                              : "border-border bg-card text-foreground hover:border-international-orange/50"
                          )}
                        >
                          {range.label}
                        </button>
                      ))}
                    </div>
                    {errors.yearsExperience && <p className="text-sm text-destructive mt-1" role="alert">{errors.yearsExperience}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Areas of expertise <span className="text-muted-foreground font-normal">(optional)</span>
                    </label>
                    <TagInput
                      value={expertiseAreas}
                      onChange={setExpertiseAreas}
                      suggestions={['Strategy', 'Turnaround', 'M&A', 'IPO Readiness', 'Scale-up', 'Digital Transformation', 'Restructuring', 'International Expansion']}
                      placeholder="e.g., Scale-up, M&A..."
                      maxTags={6}
                    />
                  </div>
                </>
              )}

              {currentStep === 'availability' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      {userRole === 'Founder'
                        ? 'How much time can you give beyond your company?'
                        : 'How available are you?'}
                    </label>
                    <div className="space-y-2" role="radiogroup" aria-label="Availability" aria-required="true">
                      {AVAILABILITY_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={availabilityType === opt.value}
                          onClick={() => { setAvailabilityType(opt.value); setErrors(prev => ({ ...prev, availabilityType: '' })) }}
                          className={cn(
                            "w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-all text-left",
                            availabilityType === opt.value
                              ? "border-international-orange bg-international-orange/10"
                              : "border-border bg-card hover:border-international-orange/50"
                          )}
                        >
                          <span className="font-medium text-foreground">{opt.label}</span>
                          <span className="text-muted-foreground">{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                    {errors.availabilityType && <p className="text-sm text-destructive mt-1" role="alert">{errors.availabilityType}</p>}
                  </div>
                  {(availabilityType === 'part-time' || availabilityType === 'advisory') && (
                    <div>
                      <label htmlFor="hours" className="block text-sm font-medium text-foreground mb-1.5">
                        Hours per week
                      </label>
                      <Input
                        id="hours"
                        type="number"
                        min={1}
                        max={40}
                        value={hoursPerWeek ?? ''}
                        onChange={(e) => setHoursPerWeek(e.target.value ? parseInt(e.target.value) : null)}
                        placeholder={availabilityType === 'advisory' ? '2-8' : '10-30'}
                        className="bg-card w-32"
                      />
                    </div>
                  )}
                  <div>
                    <label htmlFor="dayRate" className="block text-sm font-medium text-foreground mb-1.5">
                      Day rate <span className="text-muted-foreground font-normal">(optional, £)</span>
                    </label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Setting a rate lets companies book you directly from the marketplace.
                    </p>
                    <Input
                      id="dayRate"
                      type="number"
                      min={0}
                      max={10000}
                      value={dayRate ?? ''}
                      onChange={(e) => setDayRate(e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="e.g. 750"
                      className="bg-card w-40"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Navigation */}
            <div className="flex flex-col items-center gap-3 mt-8">
              <div className="flex justify-between w-full">
                {stepIndex > 0 ? (
                  <Button
                    variant="ghost"
                    onClick={goBack}
                    className="gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                ) : <div />}

                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    onClick={goNext}
                    disabled={isSubmitting}
                    className="gap-2 bg-international-orange hover:bg-international-orange/90 text-white px-6"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : stepIndex < STEPS.length - 1 ? (
                      <>
                        Continue <ArrowRight className="h-4 w-4" />
                      </>
                    ) : (
                      <>
                        Complete Profile <Sparkles className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </motion.div>
              </div>
              <button
                type="button"
                onClick={handleSkip}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip for now — complete later from My Profile
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      </div>
    </div>
  )
}
