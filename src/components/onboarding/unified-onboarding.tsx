'use client'

/**
 * @file unified-onboarding.tsx
 *
 * @description Five-step onboarding modal for the founder-first architecture:
 *   Welcome → How It Works → Company Name → Fractional Executive opt-in → Supplier opt-in.
 *
 * Every user is a founder of their own foundry. On top of that, they are asked
 * two opt-in questions:
 *   - Fractional executive: recommended. Flips profiles.is_fractional_executive and
 *     triggers the provider profile wizard afterwards (Phase 5).
 *   - Supplier: optional. Flips profiles.is_supplier, which reveals the Supplier
 *     Portal section in the sidebar (Phase 3).
 *
 * Both opt-ins default to deferred ("Not now") — neither blocks completion.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ArrowRight,
  Building2,
  Sparkles,
  Hammer,
  Shield,
  Scale,
  Users,
  Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { setAccountType, setOptInFlags, updateOnboardingData } from '@/actions/onboarding'
import { convertSandboxToCompany } from '@/actions/create-company'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { GuidedTour } from './guided-tour'

import type { OnboardingData } from '@/actions/onboarding'

type AccountType = 'team_builder' | 'supplier'
type OnboardingStep = 'welcome' | 'how-it-works' | 'company-name' | 'fractional-executive' | 'supplier-opt-in'

const ALL_STEPS: OnboardingStep[] = ['welcome', 'how-it-works', 'company-name', 'fractional-executive', 'supplier-opt-in']
const STEPS_WITHOUT_COMPANY: OnboardingStep[] = ['welcome', 'how-it-works', 'fractional-executive', 'supplier-opt-in']

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
  }),
}

interface UnifiedOnboardingProps {
  userRole?: 'Founder' | 'Executive' | 'Apprentice' | 'AI_Agent' | string
  accountType?: AccountType | null
  onboardingData?: OnboardingData | null
  /** If the foundry already has a real (non-sandbox) name, skip the company-name step. */
  foundryName?: string | null
  foundryIsSandbox?: boolean
}

/**
 * UnifiedOnboarding — 3-step full-screen onboarding (Welcome → How It Works → Company Name).
 *
 * @description Every executive names their company during onboarding. Their sandbox
 * foundry is converted in-place to a real company. After completion, they are informed
 * about marketplace visibility and handed off to Cal's guided tour.
 */
export function UnifiedOnboarding({
  userRole,
  accountType: initialAccountType,
  onboardingData,
  foundryName,
  foundryIsSandbox,
}: UnifiedOnboardingProps) {
  // Skip company-name step if the foundry already has a real (non-sandbox) name.
  // A sandbox name starts with "sandbox-" or matches "{Name}'s Company".
  const hasRealFoundry = (() => {
    if (foundryIsSandbox === false) return true
    if (!foundryName) return false
    if (foundryName.startsWith('sandbox-')) return false
    if (/^.+'s Company$/.test(foundryName)) return false
    return true
  })()

  const STEPS = hasRealFoundry ? STEPS_WITHOUT_COMPANY : ALL_STEPS

  const [open, setOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome')
  const [direction, setDirection] = useState(1)
  const [isSaving, setIsSaving] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [companyError, setCompanyError] = useState<string | null>(null)
  const [showGuidedTour, setShowGuidedTour] = useState(false)
  const migrationRanRef = useRef(false)
  const router = useRouter()

  const currentStepIndex = STEPS.indexOf(currentStep)
  const progressPercent = ((currentStepIndex + 1) / STEPS.length) * 100

  // Determine if onboarding should show
  useEffect(() => {
    const dbCompleted =
      onboardingData?.onboarding_modal_completed === true ||
      onboardingData?.has_completed_onboarding === true

    // One-time migration: localStorage → DB (deduped via ref)
    if (!migrationRanRef.current) {
      migrationRanRef.current = true
      try {
        const lsCompleted = localStorage.getItem('forgeos_onboarding_completed') === 'true'
        if (lsCompleted && !dbCompleted) {
          updateOnboardingData({
            onboarding_modal_completed: true,
            has_completed_onboarding: true,
            onboarding_completed_at: new Date().toISOString(),
          }).then((result) => {
            if (result.success) {
              localStorage.removeItem('forgeos_onboarding_completed')
              localStorage.removeItem('forgeos_intent_selected')
            }
          }).catch(() => {})
          return
        }
        if (lsCompleted) {
          localStorage.removeItem('forgeos_onboarding_completed')
          localStorage.removeItem('forgeos_intent_selected')
          return
        }
      } catch {
        // localStorage unavailable
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    if (!dbCompleted) {
      timer = setTimeout(() => setOpen(true), 800)
    }
    return () => { if (timer) clearTimeout(timer) }
  }, [onboardingData])

  const goToStep = useCallback(
    (step: OnboardingStep) => {
      const newIndex = STEPS.indexOf(step)
      const oldIndex = STEPS.indexOf(currentStep)
      setDirection(newIndex > oldIndex ? 1 : -1)
      setCurrentStep(step)
    },
    [currentStep, STEPS],
  )

  // Company name submission — converts sandbox to real company, then advances
  // to the fractional-executive opt-in step (not straight to completion).
  const handleCreateCompany = async () => {
    const trimmed = companyName.trim()
    if (trimmed.length < 2) {
      setCompanyError('Company name must be at least 2 characters')
      return
    }

    setIsSaving(true)
    setCompanyError(null)

    try {
      await setAccountType('team_builder')
      const result = await convertSandboxToCompany({ companyName: trimmed })
      if (!result.success) {
        setCompanyError(result.error)
        setIsSaving(false)
        return
      }
      setIsSaving(false)
      goToStep('fractional-executive')
    } catch (error) {
      console.error('[UnifiedOnboarding] Failed to create company:', error)
      toast.error('Something went wrong. Please try again.')
      setIsSaving(false)
    }
  }

  // Fractional executive opt-in — "Yes, list me" or "Not now". Either path
  // advances to the supplier opt-in step.
  const handleFractionalExecutiveChoice = async (optIn: boolean) => {
    setIsSaving(true)
    try {
      await setOptInFlags({ is_fractional_executive: optIn })
      setIsSaving(false)
      goToStep('supplier-opt-in')
    } catch (error) {
      console.error('[UnifiedOnboarding] Failed to set fractional executive flag:', error)
      toast.error('Something went wrong. Please try again.')
      setIsSaving(false)
    }
  }

  // Supplier opt-in — "Yes" or "Not now". Either path completes onboarding.
  const handleSupplierChoice = async (optIn: boolean) => {
    setIsSaving(true)
    try {
      await setOptInFlags({ is_supplier: optIn })
      await updateOnboardingData({
        onboarding_modal_completed: true,
        has_completed_onboarding: true,
        onboarding_completed_at: new Date().toISOString(),
        intent_selection: 'setup_company',
      })
      setOpen(false)
      router.refresh()
    } catch (error) {
      console.error('[UnifiedOnboarding] Failed to complete onboarding:', error)
      toast.error('Something went wrong. Please try again.')
      setIsSaving(false)
    }
  }

  const handleSkip = useCallback(() => {
    setOpen(false)
    updateOnboardingData({
      onboarding_modal_completed: true,
      has_completed_onboarding: true,
      onboarding_completed_at: new Date().toISOString(),
    }).catch((error) => {
      console.error('[UnifiedOnboarding] Failed to persist skip:', error)
    })
  }, [])

  // Escape key to dismiss
  useEffect(() => {
    if (!open || showGuidedTour) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleSkip()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, showGuidedTour, handleSkip])

  const handleTourComplete = useCallback(() => setOpen(false), [])

  if (!open) return null

  if (showGuidedTour) {
    return <GuidedTour onComplete={handleTourComplete} />
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 100 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.3}
      onDragEnd={(_e, info) => {
        if (info.offset.y > 100) handleSkip()
      }}
      className="fixed inset-0 z-50 bg-background touch-pan-x"
    >
      {/* Background image */}
      <div className="absolute inset-0">
        <Image
          src="/images/onboarding/onboarding-step-welcome.png"
          alt=""
          fill
          className="object-cover opacity-15"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/90 to-background" />
      </div>

      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-muted z-10">
        <motion.div
          className="h-full bg-international-orange"
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Skip link */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={handleSkip}
        className="absolute top-6 right-4 sm:right-8 pt-safe z-20 text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        Skip tour
      </motion.button>

      {/* Step content */}
      <div className="relative z-10 h-full flex flex-col items-center px-6 sm:px-8 overflow-y-auto">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="w-full max-w-2xl text-center my-auto"
          >
            {/* STEP 1: Welcome */}
            {currentStep === 'welcome' && (
              <div className="space-y-8">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.6 }}
                  className="w-20 h-20 rounded-full mx-auto flex items-center justify-center bg-international-orange/10 border border-international-orange/20"
                >
                  <Sparkles className="w-10 h-10 text-international-orange" />
                </motion.div>

                <div className="space-y-4">
                  <h1 className="text-4xl sm:text-5xl font-display font-bold text-foreground tracking-tight">
                    Welcome to
                    <br />
                    <span className="text-international-orange">ForgeOS.</span>
                  </h1>
                  <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
                    {userRole === 'Founder'
                      ? "You're about to run your venture at a speed most founders only dream about."
                      : userRole === 'Executive'
                        ? "You're joining a cadre of executives who deploy expertise across multiple ventures."
                        : userRole === 'Apprentice'
                          ? "You're not junior. You're a founder-in-training with a 10x toolkit."
                          : "The operating system for building physical products at software speed."}
                  </p>
                </div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={() => goToStep('how-it-works')}
                    className="bg-international-orange hover:bg-international-orange/90 text-white px-10 py-6 h-auto text-sm uppercase tracking-widest font-semibold shadow-lg"
                  >
                    Let&apos;s go
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </motion.div>
              </div>
            )}

            {/* STEP 2: How It Works — trust & clarity */}
            {currentStep === 'how-it-works' && (
              <div className="space-y-8">
                <div className="space-y-4">
                  <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight">
                    How We Protect You
                  </h2>
                  <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
                    Three things to know before you start.
                  </p>
                </div>

                <div className="max-w-md mx-auto space-y-4 text-left">
                  {[
                    {
                      icon: Hammer,
                      title: 'Build products without a factory',
                      desc: 'We connect you with expert teams and manufacturing capacity.',
                    },
                    {
                      icon: Shield,
                      title: 'Your IP stays yours. Always.',
                      desc: 'Every design belongs to you. Confidentiality agreements protect everything you share.',
                    },
                    {
                      icon: Scale,
                      title: 'Clear responsibility',
                      desc: 'Factories liable for manufacturing quality. You own your designs. Written terms for every engagement.',
                    },
                  ].map((item, i) => (
                    <motion.div
                      key={item.title}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 * i }}
                      className="flex items-start gap-4 p-4 rounded-xl bg-card border"
                    >
                      <div className="w-10 h-10 rounded-full bg-international-orange/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <item.icon className="w-5 h-5 text-international-orange" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground mb-1">
                          {item.title}
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={hasRealFoundry ? async () => {
                      setIsSaving(true)
                      try {
                        await setAccountType('team_builder')
                        setIsSaving(false)
                        goToStep('fractional-executive')
                      } catch (error) {
                        console.error('[UnifiedOnboarding] Failed to set account type:', error)
                        toast.error('Something went wrong. Please try again.')
                        setIsSaving(false)
                      }
                    } : () => goToStep('company-name')}
                    disabled={isSaving}
                    className="bg-international-orange hover:bg-international-orange/90 text-white px-10 py-6 h-auto text-sm uppercase tracking-widest font-semibold shadow-lg"
                  >
                    {isSaving ? 'Setting up...' : 'Continue'}
                    {!isSaving && <ArrowRight className="w-4 h-4 ml-2" />}
                  </Button>
                </motion.div>
              </div>
            )}

            {/* STEP 3: Company Name */}
            {currentStep === 'company-name' && (
              <div className="space-y-8">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.4 }}
                  className="w-16 h-16 rounded-full mx-auto flex items-center justify-center bg-electric-blue/10 border border-electric-blue/20"
                >
                  <Building2 className="w-8 h-8 text-electric-blue" />
                </motion.div>

                <div className="space-y-4">
                  <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight">
                    What&apos;s your company called?
                  </h2>
                  <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
                    We&apos;ll name your workspace after it. You can change this anytime in Settings.
                  </p>
                </div>

                <div className="max-w-sm mx-auto space-y-4">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <Input
                      value={companyName}
                      onChange={(e) => {
                        setCompanyName(e.target.value)
                        if (companyError) setCompanyError(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && companyName.trim().length >= 2) {
                          handleCreateCompany()
                        }
                      }}
                      placeholder="e.g. Acme Robotics"
                      className={cn(
                        "text-center text-lg h-14",
                        companyError && "border-destructive",
                      )}
                      autoFocus
                      disabled={isSaving}
                    />
                    {companyError && (
                      <p className="text-sm text-destructive mt-2">{companyError}</p>
                    )}
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      onClick={handleCreateCompany}
                      disabled={isSaving || companyName.trim().length < 2}
                      className="bg-international-orange hover:bg-international-orange/90 text-white px-10 py-6 h-auto text-sm uppercase tracking-widest font-semibold shadow-lg w-full"
                    >
                      {isSaving ? 'Setting up...' : 'Continue'}
                      {!isSaving && <ArrowRight className="w-4 h-4 ml-2" />}
                    </Button>
                  </motion.div>
                </div>

                {isSaving && (
                  <p className="text-sm text-muted-foreground animate-pulse">
                    Setting up your workspace...
                  </p>
                )}
              </div>
            )}

            {/* STEP 4: Fractional Executive opt-in */}
            {currentStep === 'fractional-executive' && (
              <div className="space-y-8">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.4 }}
                  className="w-16 h-16 rounded-full mx-auto flex items-center justify-center bg-international-orange/10 border border-international-orange/20"
                >
                  <Users className="w-8 h-8 text-international-orange" />
                </motion.div>

                <div className="space-y-4">
                  <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight">
                    Would you like to be listed as a fractional executive?
                  </h2>
                  <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
                    This is the same workspace, plus a public profile that lets other
                    companies on the platform find and engage you. You set your day rate.
                    You can opt out at any time from your profile.
                  </p>
                  <p className="text-sm text-international-orange max-w-lg mx-auto">
                    Recommended — it is how most people on ForgeOS make the platform pay
                    for itself.
                  </p>
                </div>

                <div className="max-w-sm mx-auto space-y-3">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      onClick={() => handleFractionalExecutiveChoice(true)}
                      disabled={isSaving}
                      className="bg-international-orange hover:bg-international-orange/90 text-white px-10 py-6 h-auto text-sm uppercase tracking-widest font-semibold shadow-lg w-full"
                    >
                      {isSaving ? 'Saving...' : 'Yes, list me'}
                      {!isSaving && <ArrowRight className="w-4 h-4 ml-2" />}
                    </Button>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    <Button
                      variant="ghost"
                      onClick={() => handleFractionalExecutiveChoice(false)}
                      disabled={isSaving}
                      className="text-sm text-muted-foreground hover:text-foreground w-full"
                    >
                      Not now
                    </Button>
                  </motion.div>
                </div>
              </div>
            )}

            {/* STEP 5: Supplier opt-in */}
            {currentStep === 'supplier-opt-in' && (
              <div className="space-y-8">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.4 }}
                  className="w-16 h-16 rounded-full mx-auto flex items-center justify-center bg-electric-blue/10 border border-electric-blue/20"
                >
                  <Package className="w-8 h-8 text-electric-blue" />
                </motion.div>

                <div className="space-y-4">
                  <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight">
                    Are you also a supplier?
                  </h2>
                  <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
                    If your company makes or sells goods or services that other founders
                    on ForgeOS might buy, you can turn on the Supplier Portal section.
                    It adds a sidebar area for managing your listing, orders, RFQs and
                    settings. You can switch it on later from Settings.
                  </p>
                </div>

                <div className="max-w-sm mx-auto space-y-3">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      onClick={() => handleSupplierChoice(true)}
                      disabled={isSaving}
                      className="bg-electric-blue hover:bg-electric-blue/90 text-white px-10 py-6 h-auto text-sm uppercase tracking-widest font-semibold shadow-lg w-full"
                    >
                      {isSaving ? 'Saving...' : 'Yes, I am a supplier'}
                      {!isSaving && <ArrowRight className="w-4 h-4 ml-2" />}
                    </Button>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    <Button
                      variant="ghost"
                      onClick={() => handleSupplierChoice(false)}
                      disabled={isSaving}
                      className="text-sm text-muted-foreground hover:text-foreground w-full"
                    >
                      Not now
                    </Button>
                  </motion.div>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* Step dots */}
      <div className="absolute bottom-8 pb-safe left-0 right-0 flex justify-center gap-2 z-10">
        {STEPS.map((step, index) => (
          <div
            key={step}
            className={cn(
              'h-1.5 rounded-full transition-all duration-500',
              index === currentStepIndex
                ? 'w-8 bg-international-orange'
                : index < currentStepIndex
                  ? 'w-2 bg-international-orange/40'
                  : 'w-2 bg-muted-foreground/20',
            )}
          />
        ))}
      </div>
    </motion.div>
  )
}
