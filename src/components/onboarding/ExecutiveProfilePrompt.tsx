'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { UserCircle, ArrowRight, X } from 'lucide-react'
import Link from 'next/link'

const PROFILE_PROMPT_KEY = 'forgeos:executive:profile_prompt_dismissed'

interface ExecutiveProfilePromptProps {
  userRole?: string
  hasCompletedProfile?: boolean
  onComplete?: () => void
  /** When false, the nudge is suppressed until the onboarding modal finishes */
  onboardingCompleted?: boolean
}

/**
 * Banner that prompts executives and apprentices to complete their marketplace profile.
 * Replaces the old modal approach - redirects to /my-profile for a guided experience.
 */
export function ExecutiveProfilePrompt({
  userRole,
  hasCompletedProfile = false,
  onboardingCompleted,
}: ExecutiveProfilePromptProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    // Don't show until the onboarding modal is finished
    if (onboardingCompleted === false) return
    // Only show for Executives and Apprentices
    if (userRole !== 'Executive' && userRole !== 'Apprentice') return
    // Don't show if profile is already completed
    if (hasCompletedProfile) return
    
    // Check localStorage for dismissal
    try {
      const dismissed = localStorage.getItem(PROFILE_PROMPT_KEY)
      if (dismissed) {
        // Check if dismissal was recent (within 7 days)
        const dismissedAt = new Date(dismissed)
        const daysSinceDismissed = (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24)
        if (daysSinceDismissed < 7) return
      }
    } catch {
      // localStorage not available
    }

    // Show after a brief delay
    const timer = setTimeout(() => setIsVisible(true), 2000)
    return () => clearTimeout(timer)
  }, [userRole, hasCompletedProfile, onboardingCompleted])

  function handleDismiss() {
    setIsDismissed(true)
    try {
      localStorage.setItem(PROFILE_PROMPT_KEY, new Date().toISOString())
    } catch {
      // localStorage not available
    }
    setTimeout(() => setIsVisible(false), 300)
  }

  if (!isVisible) return null

  return (
    <div 
      className={`fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 transition-all duration-300 ${
        isDismissed ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
      }`}
    >
      <div className="bg-card rounded-lg border border-international-orange/20 shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-international-orange/10 border border-international-orange/20 flex items-center justify-center flex-shrink-0">
            <UserCircle className="h-5 w-5 text-international-orange" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              Complete your profile
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              A complete profile helps companies find and hire you. 
              Set up your headline, bio, rates, and skills.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Link
                href="/provider-portal"
                className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-md bg-international-orange hover:bg-international-orange/90 text-white transition-colors"
              >
                Set Up Profile
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Link>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleDismiss}
                className="h-8 text-xs text-muted-foreground"
              >
                Later
              </Button>
            </div>
          </div>
          <button 
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
