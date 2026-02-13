'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles } from 'lucide-react'

const WELCOME_BACK_KEY = 'forgeos_welcome_back_shown'
const ONBOARDING_KEY = 'forgeos_onboarding_completed'

/** How long before auto-dismiss (ms) */
const AUTO_DISMISS_MS = 8000

interface WelcomeBackBannerProps {
  /** User's display name */
  userName: string
}

/**
 * WelcomeBackBanner -- Warm, animated welcome for returning users.
 *
 * @description Shows a brief animated banner after login for returning users
 * (not first-time -- those get the full onboarding). Auto-dismisses after
 * 8 seconds. Only shows once per session.
 */
export function WelcomeBackBanner({ userName }: WelcomeBackBannerProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Only show for returning users who have completed onboarding
    const hasOnboarded = localStorage.getItem(ONBOARDING_KEY)
    const alreadyShown = sessionStorage.getItem(WELCOME_BACK_KEY)

    if (hasOnboarded && !alreadyShown) {
      // Delay to let the page settle
      const showTimer = setTimeout(() => {
        setIsVisible(true)
        sessionStorage.setItem(WELCOME_BACK_KEY, 'true')
      }, 1500)

      return () => clearTimeout(showTimer)
    }
  }, [])

  useEffect(() => {
    if (!isVisible) return

    const dismissTimer = setTimeout(() => {
      setIsVisible(false)
    }, AUTO_DISMISS_MS)

    return () => clearTimeout(dismissTimer)
  }, [isVisible])

  const firstName = userName?.split(' ')[0] || 'builder'

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -20, height: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="mb-6"
        >
          <div className="relative bg-international-orange/5 border border-international-orange/20 rounded-xl px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-international-orange/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-international-orange" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Welcome back, {firstName}.
              </p>
              <p className="text-xs text-muted-foreground">
                Your forge is warm and ready. Let&apos;s build something great today.
              </p>
            </div>

            <button
              onClick={() => setIsVisible(false)}
              className="shrink-0 p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss welcome message"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Auto-dismiss progress bar */}
            <motion.div
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
              className="absolute bottom-0 left-0 h-0.5 bg-international-orange/30 rounded-full"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
