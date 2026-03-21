'use client'

/**
 * @file unified-onboarding.tsx
 *
 * @description 3-step unified onboarding modal replacing the old 5-step
 * OnboardingModal + SetupWizard + MarketplaceOnboarding trio.
 *
 * Steps: Welcome → Intent → First Look (marketplace "aha moment")
 * Supplier intent redirects to /supplier-portal after step 2.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  ArrowRight,
  Package,
  Building2,
  Sparkles,
  Store,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { setAccountType, updateOnboardingData, getOnboardingAhaListings } from '@/actions/onboarding'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { GuidedTour } from './guided-tour'

import type { OnboardingData } from '@/actions/onboarding'

type AccountType = 'team_builder' | 'supplier'
type OnboardingStep = 'welcome' | 'intent' | 'firstlook'

const STEPS: OnboardingStep[] = ['welcome', 'intent', 'firstlook']

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
}

/**
 * UnifiedOnboarding — 3-step full-screen onboarding.
 *
 * @description Replaces the previous 5-step OnboardingModal with a streamlined
 * 3-step flow: Welcome → Intent → First Look (marketplace "aha moment").
 * Persists state to Supabase onboarding_data JSONB. Migrates existing
 * localStorage flags on first mount.
 */
export function UnifiedOnboarding({
  userRole,
  accountType: initialAccountType,
  onboardingData,
}: UnifiedOnboardingProps) {
  const [open, setOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome')
  const [direction, setDirection] = useState(1)
  const [isSavingIntent, setIsSavingIntent] = useState(false)
  const [selectedIntent, setSelectedIntent] = useState<AccountType | null>(initialAccountType ?? null)
  const [ahaListings, setAhaListings] = useState<{ title: string; category: string; id: string }[]>([])
  const [loadingListings, setLoadingListings] = useState(false)
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
          // Silently migrate to DB — only clear localStorage on success
          updateOnboardingData({
            onboarding_modal_completed: true,
            has_completed_onboarding: true,
            onboarding_completed_at: new Date().toISOString(),
          }).then((result) => {
            if (result.success) {
              localStorage.removeItem('forgeos_onboarding_completed')
              localStorage.removeItem('forgeos_intent_selected')
            }
          }).catch(() => {
            // Best-effort — localStorage keys remain for retry on next visit
          })
          return // Don't show modal — user already onboarded
        }
        if (lsCompleted) {
          // Already in both — just clean up localStorage
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
    [currentStep],
  )

  const handleIntentSelection = async (intent: AccountType) => {
    setSelectedIntent(intent)
    setIsSavingIntent(true)

    try {
      const result = await setAccountType(intent)
      if ('success' in result) {
        if (intent === 'supplier') {
          await handleComplete()
          toast.success('Welcome! Redirecting to your Supplier Portal...')
          router.push('/supplier-portal')
          return
        }

        // DECISION: Launch Cal's guided tour instead of marketplace aha moment.
        // The tour walks users through the 5 most compelling features.
        setShowGuidedTour(true)
      } else {
        toast.error('Failed to save your selection. Please try again.')
      }
    } catch (error) {
      console.error('[UnifiedOnboarding] Failed to set account type:', error)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsSavingIntent(false)
    }
  }

  const handleComplete = async () => {
    // INTENT: Always close the modal. The DB write is best-effort — trapping
    // the user on a full-screen overlay is worse than re-showing it once.
    try {
      await updateOnboardingData({
        onboarding_modal_completed: true,
        has_completed_onboarding: true,
        onboarding_completed_at: new Date().toISOString(),
      })
    } catch (error) {
      console.error('[UnifiedOnboarding] Failed to persist completion:', error)
    }
    setOpen(false)
  }

  const handleSkip = useCallback(() => {
    setOpen(false)
    // Fire-and-forget — modal is already closed
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
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleSkip()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handleSkip])

  if (!open) return null

  // FLOW: When team_builder is selected, hand off to Cal's guided tour
  if (showGuidedTour) {
    return <GuidedTour onComplete={() => setOpen(false)} />
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-background"
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
        className="absolute top-6 right-4 sm:right-8 pt-safe z-20 text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest"
      >
        Skip tour
      </motion.button>

      {/* Step content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-6 sm:px-8">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="w-full max-w-2xl text-center"
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
                    onClick={() => goToStep('intent')}
                    className="bg-international-orange hover:bg-international-orange/90 text-white px-10 py-6 h-auto text-sm uppercase tracking-widest font-semibold shadow-lg"
                  >
                    Let&apos;s go
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </motion.div>
              </div>
            )}

            {/* STEP 2: Intent */}
            {currentStep === 'intent' && (
              <div className="space-y-8">
                <div className="space-y-4">
                  <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight">
                    What brings you here?
                  </h2>
                  <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
                    This helps us personalise your experience from the start.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    whileHover={{ y: -4, boxShadow: '0 12px 24px -8px rgba(0,0,0,0.1)' }}
                    onClick={() => handleIntentSelection('supplier')}
                    disabled={isSavingIntent}
                    className={cn(
                      'group relative p-6 rounded-xl border-2 transition-all duration-200 text-left',
                      selectedIntent === 'supplier'
                        ? 'border-international-orange bg-international-orange/5'
                        : 'border-muted bg-card hover:border-international-orange/50',
                      isSavingIntent && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <div className="w-12 h-12 rounded-full bg-international-orange/10 flex items-center justify-center mb-4">
                      <Package className="w-6 h-6 text-international-orange" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      I sell products or services
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      List your offerings, respond to requests, and manage orders.
                    </p>
                  </motion.button>

                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    whileHover={{ y: -4, boxShadow: '0 12px 24px -8px rgba(0,0,0,0.1)' }}
                    onClick={() => handleIntentSelection('team_builder')}
                    disabled={isSavingIntent}
                    className={cn(
                      'group relative p-6 rounded-xl border-2 transition-all duration-200 text-left',
                      selectedIntent === 'team_builder'
                        ? 'border-electric-blue bg-electric-blue/5'
                        : 'border-muted bg-card hover:border-electric-blue/50',
                      isSavingIntent && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <div className="w-12 h-12 rounded-full bg-electric-blue/10 flex items-center justify-center mb-4">
                      <Building2 className="w-6 h-6 text-electric-blue" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      I build and manage teams
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Define objectives, assign tasks, and collaborate with intelligent workflows.
                    </p>
                  </motion.button>
                </div>

                {isSavingIntent && (
                  <p className="text-sm text-muted-foreground animate-pulse">
                    Personalising your experience...
                  </p>
                )}
              </div>
            )}

            {/* STEP 3: First Look — marketplace "aha moment" */}
            {currentStep === 'firstlook' && (
              <div className="space-y-8">
                <div className="space-y-4">
                  <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight">
                    Here&apos;s what&apos;s waiting for you
                  </h2>
                  <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
                    Real resources from the marketplace, matched to your industry.
                  </p>
                </div>

                {loadingListings ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-pulse text-sm text-muted-foreground">
                      Finding relevant listings...
                    </div>
                  </div>
                ) : ahaListings.length > 0 ? (
                  <div className="grid gap-3 max-w-lg mx-auto">
                    {ahaListings.map((listing, i) => (
                      <motion.div
                        key={listing.id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + i * 0.1 }}
                        className="flex items-center gap-4 p-4 rounded-xl bg-card border text-left"
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-international-orange/10 shrink-0">
                          <Store className="w-5 h-5 text-international-orange" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {listing.title}
                          </p>
                          <p className="text-xs text-muted-foreground">{listing.category}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6">
                    <p className="text-sm text-muted-foreground">
                      The marketplace is growing daily. Explore it once you&apos;re inside.
                    </p>
                  </div>
                )}

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={handleComplete}
                    className="bg-international-orange hover:bg-international-orange/90 text-white px-12 py-6 h-auto text-sm uppercase tracking-widest font-semibold shadow-lg"
                  >
                    Enter the Forge
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </motion.div>

                <button
                  type="button"
                  onClick={async () => {
                    await handleComplete()
                    router.push('/marketplace')
                  }}
                  className="text-xs text-muted-foreground hover:text-international-orange transition-colors"
                >
                  Browse the full marketplace
                </button>
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
