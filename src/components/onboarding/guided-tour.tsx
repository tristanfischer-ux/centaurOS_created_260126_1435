'use client'

/**
 * @file guided-tour.tsx
 *
 * @description Cal-narrated 5-stop guided tour for new users. Shows the most
 * compelling ForgeOS features: Team Orbit, AI Specialists, Investor Database,
 * The Forge, and Marketplace. Cal (Chief-of-Staff AI) provides contextual
 * commentary at each stop.
 *
 * FLOW: Launched from UnifiedOnboarding after the welcome step. Each stop
 * shows a feature preview with Cal's narration. Completion is tracked in
 * onboarding_data JSONB.
 */

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  ArrowRight,
  Users,
  Bot,
  TrendingUp,
  Hammer,
  Store,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateOnboardingData } from '@/actions/onboarding'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface TourStop {
  id: string
  title: string
  subtitle: string
  calMessage: string
  icon: React.ReactNode
  route: string
  accentColor: string
  accentBg: string
}

const TOUR_STOPS: TourStop[] = [
  {
    id: 'team',
    title: 'Your Team',
    subtitle: 'See how you fit in',
    calMessage:
      "First things first — let me show you your team. You'll see yourself at the centre, with your team around you and Fractional Executives available in the outer ring. You're not building alone.",
    icon: <Users className="w-6 h-6" />,
    route: '/team',
    accentColor: 'text-electric-blue',
    accentBg: 'bg-electric-blue/10',
  },
  {
    id: 'specialists',
    title: 'Your AI Team',
    subtitle: '9 specialists, ready now',
    calMessage:
      "This is your AI team — nine specialists covering strategy, finance, legal, sales, marketing, hiring, operations, and engineering. We work around the clock. I'm Cal, your Chief of Staff, and I coordinate the lot of us.",
    icon: <Bot className="w-6 h-6" />,
    route: '/agents',
    accentColor: 'text-info',
    accentBg: 'bg-info/10',
  },
  {
    id: 'investors',
    title: 'Investor Database',
    subtitle: 'Access to capital',
    calMessage:
      "Here's your investor database — hundreds of UK VC and PE firms, pre-researched with fund sizes, sector focus, and contact details. When you're ready to raise, the intel is already here.",
    icon: <TrendingUp className="w-6 h-6" />,
    route: '/investors',
    accentColor: 'text-success',
    accentBg: 'bg-success/10',
  },
  {
    id: 'forge',
    title: 'The Forge',
    subtitle: 'Design and build products',
    calMessage:
      "The Forge is where ideas become real products. We've loaded a few demo designs so you can see how it works — from concept to bill of materials to supplier sourcing. Start one of your own whenever you're ready.",
    icon: <Hammer className="w-6 h-6" />,
    route: '/the-forge',
    accentColor: 'text-international-orange',
    accentBg: 'bg-international-orange/10',
  },
  {
    id: 'marketplace',
    title: 'Marketplace',
    subtitle: 'Everything you need to build',
    calMessage:
      "Finally, the marketplace — manufacturers, component suppliers, fractional executives, and service providers, all vetted and ready. This is your supply chain, on demand.",
    icon: <Store className="w-6 h-6" />,
    route: '/marketplace',
    accentColor: 'text-warning',
    accentBg: 'bg-warning/10',
  },
]

interface GuidedTourProps {
  onComplete: () => void
}

/**
 * GuidedTour — Cal-narrated 5-stop feature walkthrough.
 *
 * @description Full-screen overlay that introduces new users to the 5 most
 * compelling ForgeOS features. Cal provides contextual narration at each stop.
 * Tracks completion in onboarding_data JSONB.
 */
export function GuidedTour({ onComplete }: GuidedTourProps) {
  const [currentStop, setCurrentStop] = useState(0)
  const [direction, setDirection] = useState(1)
  const router = useRouter()

  const stop = TOUR_STOPS[currentStop]
  const isLastStop = currentStop === TOUR_STOPS.length - 1
  const progressPercent = ((currentStop + 1) / TOUR_STOPS.length) * 100

  const handleComplete = useCallback(async () => {
    // INTENT: Close immediately, persist completion best-effort
    onComplete()
    try {
      await updateOnboardingData({
        onboarding_modal_completed: true,
        has_completed_onboarding: true,
        onboarding_completed_at: new Date().toISOString(),
      })
    } catch (error) {
      console.error('[GuidedTour] Failed to persist completion:', error)
    }
  }, [onComplete])

  const handleSkip = useCallback(() => {
    onComplete()
    updateOnboardingData({
      onboarding_modal_completed: true,
      has_completed_onboarding: true,
      onboarding_completed_at: new Date().toISOString(),
    }).catch((error) => {
      console.error('[GuidedTour] Failed to persist skip:', error)
    })
  }, [onComplete])

  // GOTCHA: handleComplete must be defined before handleNext — forward reference
  // causes TDZ error. handleComplete must also be in deps to avoid stale closure
  // on last-stop click (RT-01).
  const handleNext = useCallback(() => {
    if (isLastStop) {
      handleComplete()
    } else {
      setDirection(1)
      setCurrentStop(prev => prev + 1)
    }
  }, [isLastStop, handleComplete])

  const handleBack = useCallback(() => {
    if (currentStop > 0) {
      setDirection(-1)
      setCurrentStop(prev => prev - 1)
    }
  }, [currentStop])

  const handleGoToFeature = useCallback(async () => {
    await handleComplete()
    router.push(stop.route)
  }, [handleComplete, router, stop.route])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext()
      else if (e.key === 'ArrowLeft') handleBack()
      else if (e.key === 'Escape') handleSkip()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNext, handleBack, handleSkip])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background"
    >
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-muted z-10">
        <motion.div
          className="h-full bg-international-orange"
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Skip button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={handleSkip}
        className="absolute top-6 right-4 sm:right-8 pt-safe z-20 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Skip tour"
      >
        <X className="w-5 h-5" />
      </motion.button>

      {/* Main content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-6 sm:px-8">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStop}
            custom={direction}
            initial={{ x: direction > 0 ? 300 : -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction < 0 ? 300 : -300, opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="w-full max-w-2xl"
          >
            {/* Feature icon and title */}
            <div className="text-center space-y-6 mb-10">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.4 }}
                className={cn(
                  'w-16 h-16 rounded-2xl mx-auto flex items-center justify-center',
                  stop.accentBg,
                )}
              >
                <span className={stop.accentColor}>{stop.icon}</span>
              </motion.div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
                  Stop {currentStop + 1} of {TOUR_STOPS.length}
                </p>
                <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight">
                  {stop.title}
                </h2>
                <p className="text-muted-foreground text-lg">{stop.subtitle}</p>
              </div>
            </div>

            {/* Cal's message */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="flex gap-4 items-start p-5 rounded-xl bg-card border max-w-lg mx-auto mb-10"
            >
              <div className="shrink-0 w-10 h-10 rounded-full overflow-hidden border-2 border-international-orange/20">
                <Image
                  src="/images/specialists/chief-of-staff.png"
                  alt="Cal"
                  width={40}
                  height={40}
                  className="object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-international-orange mb-1">
                  Cal, Chief of Staff
                </p>
                <p className="text-sm text-foreground leading-relaxed">
                  {stop.calMessage}
                </p>
              </div>
            </motion.div>

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="flex gap-3">
                {currentStop > 0 && (
                  <Button
                    variant="ghost"
                    onClick={handleBack}
                    className="text-sm uppercase tracking-widest"
                  >
                    Back
                  </Button>
                )}
                <Button
                  onClick={handleNext}
                  className="bg-international-orange hover:bg-international-orange/90 text-white px-10 py-6 h-auto text-sm uppercase tracking-widest font-semibold shadow-lg"
                >
                  {isLastStop ? 'Enter the Forge' : 'Next'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>

              <button
                type="button"
                onClick={handleGoToFeature}
                className={cn(
                  'text-xs transition-colors',
                  stop.accentColor,
                  'hover:underline',
                )}
              >
                Go to {stop.title} now
              </button>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Stop dots */}
      <div className="absolute bottom-8 pb-safe left-0 right-0 flex justify-center gap-2 z-10">
        {TOUR_STOPS.map((s, index) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setDirection(index > currentStop ? 1 : -1)
              setCurrentStop(index)
            }}
            className={cn(
              'h-1.5 rounded-full transition-all duration-500',
              index === currentStop
                ? 'w-8 bg-international-orange'
                : index < currentStop
                  ? 'w-2 bg-international-orange/40'
                  : 'w-2 bg-muted-foreground/20',
            )}
            aria-label={`Go to ${s.title}`}
          />
        ))}
      </div>
    </motion.div>
  )
}
