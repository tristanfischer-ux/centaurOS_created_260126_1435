'use client'

/**
 * @file company-profile-prompt.tsx
 * 
 * @description Dismissible banner prompting founders to set up their company profile.
 * Shown when foundry has no company_profile data. Dismissible via localStorage.
 * Links to the Company Profile dialog in Settings.
 * 
 * @component CompanyProfilePrompt
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Sparkles, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'company-profile-prompt-dismissed'

interface CompanyProfilePromptProps {
  /** Whether the foundry has company profile data */
  hasCompanyProfile: boolean
  /** Whether the current user is a founder (only founders see this) */
  isFounder: boolean
  /** Optional className for positioning */
  className?: string
}

export function CompanyProfilePrompt({
  hasCompanyProfile,
  isFounder,
  className,
}: CompanyProfilePromptProps) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(true) // Start hidden to avoid flash

  useEffect(() => {
    // Only show if not dismissed, no profile, and user is founder
    const wasDismissed = localStorage.getItem(DISMISS_KEY) === 'true'
    setDismissed(wasDismissed)
  }, [])

  // Don't render if: has profile, not founder, or dismissed
  if (hasCompanyProfile || !isFounder || dismissed) {
    return null
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true')
    setDismissed(true)
  }

  return (
    <div
      className={cn(
        'relative flex items-center gap-3 p-4 rounded-lg',
        'bg-international-orange-light border border-international-orange/20',
        'animate-in fade-in slide-in-from-top-2 duration-300',
        className
      )}
      role="status"
      aria-label="Set up your company profile"
    >
      <Sparkles className="h-5 w-5 text-international-orange flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          Tell us about your company
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Adding your company stage, team size, and funding status helps our AI give you more relevant recommendations.
        </p>
      </div>
      <Button
        size="sm"
        className="bg-international-orange hover:bg-international-orange-hover flex-shrink-0"
        onClick={() => router.push('/settings')}
      >
        Set up
        <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
      </Button>
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
