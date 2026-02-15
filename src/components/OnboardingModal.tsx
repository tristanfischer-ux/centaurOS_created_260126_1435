'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  ArrowRight,
  Target,
  Users,
  Factory,
  Package,
  Building2,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createSampleData, createApprenticeTrainingTasks, setAccountType } from '@/actions/onboarding'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ConfettiCelebration } from '@/components/onboarding/ConfettiCelebration'
import { VideoWalkthrough } from '@/components/ui/video-walkthrough'
import { VIDEOS } from '@/lib/video-urls'

const ONBOARDING_KEY = 'forgeos_onboarding_completed'
const INTENT_SELECTED_KEY = 'forgeos_intent_selected'

type AccountType = 'team_builder' | 'supplier'
type OnboardingStep = 'welcome' | 'command' | 'intent' | 'firstmove' | 'celebration'

const STEPS: OnboardingStep[] = ['welcome', 'command', 'intent', 'firstmove', 'celebration']

/**
 * Step background images mapped to each onboarding step.
 */
const STEP_IMAGES: Record<OnboardingStep, string> = {
  welcome: '/images/onboarding/onboarding-step-welcome.png',
  command: '/images/onboarding/onboarding-step-command.png',
  intent: '/images/onboarding/onboarding-step-path.png',
  firstmove: '/images/onboarding/onboarding-step-firstmove.png',
  celebration: '/images/onboarding/onboarding-step-celebration.png',
}

/**
 * Slide transition variants for step changes.
 */
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

interface OnboardingModalProps {
  userRole?: 'Founder' | 'Executive' | 'Apprentice' | 'AI_Agent' | string
  accountType?: AccountType | null
}

/**
 * OnboardingModal -- Full-screen immersive onboarding experience.
 *
 * @description Replaces the previous small dialog with a full-screen,
 * five-step animated experience: Welcome, Command Center preview,
 * Intent selection, First Move action, and Celebration.
 *
 * Each step has a custom background image, Framer Motion transitions,
 * and progressive disclosure of the platform's capabilities.
 */
export function OnboardingModal({ userRole, accountType: initialAccountType }: OnboardingModalProps) {
  const [open, setOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome')
  const [direction, setDirection] = useState(1)
  const [isCreatingSampleData, setIsCreatingSampleData] = useState(false)
  const [selectedIntent, setSelectedIntent] = useState<AccountType | null>(initialAccountType ?? null)
  const [isSavingIntent, setIsSavingIntent] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const router = useRouter()

  const currentStepIndex = STEPS.indexOf(currentStep)
  const progressPercent = ((currentStepIndex + 1) / STEPS.length) * 100

  useEffect(() => {
    const hasCompleted = localStorage.getItem(ONBOARDING_KEY)
    if (!hasCompleted) {
      setTimeout(() => setOpen(true), 800)
    }
  }, [])

  const goToStep = useCallback((step: OnboardingStep) => {
    const newIndex = STEPS.indexOf(step)
    const oldIndex = STEPS.indexOf(currentStep)
    setDirection(newIndex > oldIndex ? 1 : -1)
    setCurrentStep(step)
  }, [currentStep])

  const goNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1
    if (nextIndex < STEPS.length) {
      setDirection(1)
      setCurrentStep(STEPS[nextIndex])
    }
  }, [currentStepIndex])

  const goBack = useCallback(() => {
    const prevIndex = currentStepIndex - 1
    if (prevIndex >= 0) {
      setDirection(-1)
      setCurrentStep(STEPS[prevIndex])
    }
  }, [currentStepIndex])

  const handleIntentSelection = async (intent: AccountType) => {
    setSelectedIntent(intent)
    setIsSavingIntent(true)

    try {
      const result = await setAccountType(intent)
      if (result.success) {
        localStorage.setItem(INTENT_SELECTED_KEY, intent)

        if (intent === 'supplier') {
          localStorage.setItem(ONBOARDING_KEY, 'true')
          setOpen(false)
          toast.success('Welcome! Redirecting to your Supplier Portal...')
          router.push('/supplier-portal')
          return
        }

        // Move to first-move step
        goToStep('firstmove')
      } else {
        toast.error('Failed to save your selection. Please try again.')
      }
    } catch (error) {
      console.error('[Onboarding] Failed to set account type:', error)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsSavingIntent(false)
    }
  }

  const handleFirstMove = async () => {
    setIsCreatingSampleData(true)

    try {
      if (userRole === 'Founder') {
        const result = await createSampleData()
        if (result.success) {
          toast.success('Your foundry is ready with sample objectives and tasks!')
        }
      } else if (userRole === 'Apprentice') {
        const result = await createApprenticeTrainingTasks()
        if (result.success) {
          toast.success('Your toolkit is ready! Training tasks have been assigned.')
        }
      }
    } catch (error) {
      console.error('[Onboarding] Failed to create sample data:', error)
    } finally {
      setIsCreatingSampleData(false)
      goToStep('celebration')
      setShowConfetti(true)
    }
  }

  const handleComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true')
    setOpen(false)
  }

  const handleSkip = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true')
    setOpen(false)
  }

  if (!open) return null

  return (
    <>
      {showConfetti && <ConfettiCelebration />}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-background"
      >
        {/* Background image for current step */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0"
          >
            <Image
              src={STEP_IMAGES[currentStep]}
              alt=""
              fill
              className="object-cover opacity-15"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/90 to-background" />
          </motion.div>
        </AnimatePresence>

        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-muted z-10">
          <motion.div
            className="h-full bg-international-orange"
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        {/* Skip link (available after step 2) */}
        {currentStepIndex >= 2 && currentStep !== 'celebration' && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={handleSkip}
            className="absolute top-6 right-8 z-20 text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest"
          >
            Skip tour
          </motion.button>
        )}

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
                      Welcome to something
                      <br />
                      <span className="text-international-orange">different.</span>
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
                      {userRole === 'Founder'
                        ? "You're about to run your venture at a speed most founders only dream about."
                        : userRole === 'Executive'
                        ? "You're joining a cadre of executives who deploy expertise across multiple ventures."
                        : userRole === 'Apprentice'
                        ? "You're not junior. You're a founder-in-training with a 10x toolkit."
                        : "You're joining a community that's redefining how hardware gets built."}
                    </p>
                  </div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
                  >
                    <span className="w-2 h-2 rounded-full bg-international-orange animate-pulse" />
                    Joining 100 founding members building the future
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      onClick={goNext}
                      className="bg-international-orange hover:bg-international-orange/90 text-white px-10 py-6 h-auto text-sm uppercase tracking-widest font-semibold shadow-lg"
                    >
                      Show me what&apos;s possible
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </motion.div>
                </div>
              )}

              {/* STEP 2: Command Center */}
              {currentStep === 'command' && (
                <div className="space-y-8">
                  <div className="space-y-4">
                    <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight">
                      Your command centre
                    </h2>
                    <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
                      Everything you need to build at software speed, in one place.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto">
                    {[
                      {
                        icon: Target,
                        title: 'Set objectives',
                        desc: 'That cascade into actionable tasks',
                      },
                      {
                        icon: Users,
                        title: 'Fractional teams',
                        desc: 'Access experts on demand',
                      },
                      {
                        icon: Factory,
                        title: 'Manufacturing',
                        desc: '78+ techniques at your fingertips',
                      },
                    ].map((item, i) => (
                      <motion.div
                        key={item.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 + i * 0.15 }}
                        className="p-5 rounded-xl bg-card border text-left space-y-3"
                      >
                        <div className="w-10 h-10 rounded-full bg-international-orange/10 flex items-center justify-center">
                          <item.icon className="w-5 h-5 text-international-orange" />
                        </div>
                        <h3 className="font-semibold text-foreground text-sm">{item.title}</h3>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </motion.div>
                    ))}
                  </div>

                  <div className="flex items-center justify-center gap-4 pt-4">
                    <Button
                      variant="ghost"
                      onClick={goBack}
                      className="text-muted-foreground"
                    >
                      Back
                    </Button>
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        onClick={goNext}
                        className="bg-international-orange hover:bg-international-orange/90 text-white px-8 py-5 h-auto text-sm uppercase tracking-widest font-semibold"
                      >
                        Continue
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </motion.div>
                  </div>
                </div>
              )}

              {/* STEP 3: Intent Selection */}
              {currentStep === 'intent' && (
                <div className="space-y-8">
                  <div className="space-y-4">
                    <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight">
                      What brings you here?
                    </h2>
                    <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
                      Tell us so we can personalise your experience from the start.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
                    {/* Supplier Option */}
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
                        isSavingIntent && 'opacity-50 cursor-not-allowed'
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

                    {/* Team Builder Option */}
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
                        isSavingIntent && 'opacity-50 cursor-not-allowed'
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

                  <Button
                    variant="ghost"
                    onClick={goBack}
                    className="text-muted-foreground"
                  >
                    Back
                  </Button>
                </div>
              )}

              {/* STEP 4: First Move */}
              {currentStep === 'firstmove' && (
                <div className="space-y-8">
                  <div className="space-y-4">
                    <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight">
                      Make your first move
                    </h2>
                    <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
                      {userRole === 'Founder'
                        ? "We'll set up your foundry with sample objectives and tasks so you can see ForgeOS in action."
                        : userRole === 'Apprentice'
                        ? "We'll assign your first training tasks so you can start building immediately."
                        : "Let's get your workspace ready with everything you need to hit the ground running."}
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-4">
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        onClick={handleFirstMove}
                        disabled={isCreatingSampleData}
                        className="bg-international-orange hover:bg-international-orange/90 text-white px-10 py-6 h-auto text-sm uppercase tracking-widest font-semibold shadow-lg"
                      >
                        {isCreatingSampleData ? (
                          <>
                            <span className="animate-pulse">Setting up your forge...</span>
                          </>
                        ) : (
                          <>
                            {userRole === 'Founder'
                              ? 'Set up my foundry'
                              : userRole === 'Apprentice'
                              ? 'Start my training'
                              : 'Prepare my workspace'}
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </motion.div>

                    <button
                      onClick={() => {
                        goToStep('celebration')
                        setShowConfetti(true)
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Skip this step
                    </button>
                  </div>

                  <Button
                    variant="ghost"
                    onClick={goBack}
                    className="text-muted-foreground"
                  >
                    Back
                  </Button>
                </div>
              )}

              {/* STEP 5: Celebration */}
              {currentStep === 'celebration' && (
                <div className="space-y-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                    className="w-24 h-24 rounded-full mx-auto flex items-center justify-center bg-international-orange/10 border-2 border-international-orange/20"
                  >
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.5, type: 'spring' }}
                      className="text-5xl"
                      role="img"
                      aria-label="celebration"
                    >
                      🔥
                    </motion.span>
                  </motion.div>

                  <div className="space-y-4">
                    <motion.h2
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="text-4xl sm:text-5xl font-display font-bold text-foreground tracking-tight"
                    >
                      You&apos;re in.
                    </motion.h2>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="text-lg text-muted-foreground max-w-md mx-auto leading-relaxed"
                    >
                      Welcome to Fractional Forge.
                      <br />
                      Let&apos;s build something extraordinary.
                    </motion.p>
                  </div>

                  {/* Platform Overview Video */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="max-w-sm mx-auto"
                  >
                    <VideoWalkthrough
                      videoUrl={VIDEOS.platformOverview.videoUrl}
                      thumbnailUrl={VIDEOS.platformOverview.thumbnailUrl}
                      title="Quick Platform Tour"
                      description="60 seconds to see everything ForgeOS can do"
                      duration={VIDEOS.platformOverview.duration}
                      mode="modal"
                    />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.9 }}
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
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Step dots */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-2 z-10">
          {STEPS.map((step, index) => (
            <div
              key={step}
              className={cn(
                'h-1.5 rounded-full transition-all duration-500',
                index === currentStepIndex
                  ? 'w-8 bg-international-orange'
                  : index < currentStepIndex
                  ? 'w-2 bg-international-orange/40'
                  : 'w-2 bg-muted-foreground/20'
              )}
            />
          ))}
        </div>
      </motion.div>
    </>
  )
}
