'use client'

/**
 * @file unified-onboarding.tsx
 *
 * @description 2-step unified onboarding modal (Welcome → Intent) that hands
 * off to Cal's guided tour for team_builders or redirects suppliers to
 * /supplier-portal.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  ArrowRight,
  Package,
  Building2,
  Sparkles,
  Hammer,
  Shield,
  Scale,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { setAccountType, updateOnboardingData } from '@/actions/onboarding'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { GuidedTour } from './guided-tour'

import type { OnboardingData } from '@/actions/onboarding'

type AccountType = 'team_builder' | 'supplier'
// DECISION: Added 'how-it-works' step between welcome and intent to pre-empt
// IP/risk/clarity concerns before the user commits to an intent path.
type OnboardingStep = 'welcome' | 'how-it-works' | 'intent'

const STEPS: OnboardingStep[] = ['welcome', 'how-it-works', 'intent']

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
 * UnifiedOnboarding — 2-step full-screen onboarding (Welcome → Intent).
 *
 * @description Team builders are handed off to Cal's guided tour after intent
 * selection. Suppliers redirect to /supplier-portal. Persists state to
 * Supabase onboarding_data JSONB. Migrates existing localStorage flags on
 * first mount.
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

  // Escape key to dismiss — disabled when guided tour is active (it has its
  // own Escape handler). Without this guard, both fire and double-write to DB (RT-02).
  useEffect(() => {
    if (!open || showGuidedTour) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleSkip()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, showGuidedTour, handleSkip])

  // GOTCHA: Stable callback ref prevents GuidedTour's useCallback chain from
  // re-registering keyboard handlers on every parent render (RT2-06).
  const handleTourComplete = useCallback(() => setOpen(false), [])

  if (!open) return null

  // FLOW: When team_builder is selected, hand off to Cal's guided tour
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
        // Swipe down to dismiss — threshold of 100px
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

      {/* Step content — m-auto on child centers when space allows, scrolls naturally when it doesn't */}
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
                    onClick={() => goToStep('intent')}
                    className="bg-international-orange hover:bg-international-orange/90 text-white px-10 py-6 h-auto text-sm uppercase tracking-widest font-semibold shadow-lg"
                  >
                    Continue
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </motion.div>
              </div>
            )}

            {/* STEP 3: Intent */}
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
                      I am a founder
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Build your team, set objectives, and bring your product to life with expert support.
                    </p>
                  </motion.button>

                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
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
                      I am a supplier
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      List your manufacturing capabilities, respond to RFQs, and win new customers.
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
