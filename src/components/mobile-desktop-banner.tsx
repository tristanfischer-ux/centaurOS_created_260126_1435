'use client'

/**
 * @file mobile-desktop-banner.tsx
 *
 * @description Dismissible banner shown on mobile viewports recommending
 * desktop for the best ForgeOS experience. Stores dismissal in localStorage
 * with a 7-day re-show interval.
 *
 * FLOW: Rendered in platform layout, hidden on sm+ via Tailwind.
 */

import { useState, useEffect } from 'react'
import { Monitor, X } from 'lucide-react'

const STORAGE_KEY = 'forgeos_desktop_banner_dismissed'
const RE_SHOW_DAYS = 7

/**
 * MobileDesktopBanner — nudge mobile users toward desktop.
 *
 * @description Shows a slim, dismissible info bar on mobile only. Does NOT
 * block usage. Re-shows after 7 days so returning users get a reminder.
 */
export function MobileDesktopBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY)
      if (dismissed) {
        const dismissedAt = new Date(dismissed).getTime()
        const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24)
        if (daysSince < RE_SHOW_DAYS) return
      }
      setVisible(true)
    } catch {
      // localStorage unavailable — show banner
      setVisible(true)
    }
  }, [])

  const handleDismiss = () => {
    setVisible(false)
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString())
    } catch {
      // Best-effort
    }
  }

  if (!visible) return null

  return (
    <div className="sm:hidden flex items-center gap-3 px-4 py-3 mb-4 rounded-lg bg-muted border text-foreground">
      <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="text-xs leading-relaxed flex-1">
        ForgeOS works best on desktop. Some features are limited on mobile.
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
