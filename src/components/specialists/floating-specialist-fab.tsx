"use client"

/**
 * @file floating-specialist-fab.tsx
 *
 * @description Global floating action button that shows the most relevant
 * AI specialist for the current page. On desktop (lg+), toggles the
 * persistent advisor panel. On mobile, opens the dialog modal.
 *
 * @related
 * - Route mapping: src/lib/route-specialist-map.ts
 * - AdvisorPanel: src/components/specialists/advisor-panel.tsx
 * - AdvisorPanelProvider: src/contexts/advisor-panel-context.tsx
 * - BriefSpecialistDialog: src/app/(platform)/agents/brief-specialist-dialog.tsx
 * - Screen context: src/contexts/screen-context.tsx
 */

import { useState, useCallback, useMemo, useEffect } from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { MessageSquare, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BriefSpecialistDialog } from "@/app/(platform)/agents/brief-specialist-dialog"
import { getSpecialistById } from "@/app/(platform)/agents/specialists-data"
import { useScreenContext } from "@/contexts/screen-context"
import { useAdvisorPanel } from "@/contexts/advisor-panel-context"
import { getSpecialistForRoute } from "@/lib/route-specialist-map"
import { serializeContext } from "./types"
import type { Specialist } from "@/app/(platform)/agents/specialists-data"

/** Handoff state when switching specialists from within the mobile dialog */
interface HandoffState {
  context: string | null
  referredBy: string | null
}

/** Check if viewport is desktop (lg breakpoint = 1024px) */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)")
    setIsDesktop(mql.matches)
    const handler = (e: MediaQueryListEvent): void => setIsDesktop(e.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [])
  return isDesktop
}

export function FloatingSpecialistFAB(): React.ReactElement | null {
  const pathname = usePathname()
  const { screenContext } = useScreenContext()
  const advisorPanel = useAdvisorPanel()
  const isDesktop = useIsDesktop()

  // Mobile-only state: dialog for small screens
  const [mobileDialogOpen, setMobileDialogOpen] = useState(false)
  const [mobileActiveSpecialist, setMobileActiveSpecialist] = useState<Specialist | null>(null)
  const [mobileHandoff, setMobileHandoff] = useState<HandoffState>({ context: null, referredBy: null })

  const [mounted, setMounted] = useState(false)
  const [hasUnreadInsights, setHasUnreadInsights] = useState(false)

  // Entrance delay to avoid flash on navigation
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 200)
    return () => clearTimeout(t)
  }, [])

  // Check for unread specialist insights periodically
  useEffect(() => {
    let cancelled = false

    async function checkInsights(): Promise<void> {
      try {
        const { getUnreadInsightCount } = await import("@/actions/agent-insights")
        const count = await getUnreadInsightCount()
        if (!cancelled) {
          setHasUnreadInsights(count > 0)
        }
      } catch {
        // Non-critical
      }
    }

    const initialTimer = setTimeout(checkInsights, 3000)
    const interval = setInterval(checkInsights, 5 * 60 * 1000)

    return () => {
      cancelled = true
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [pathname])

  const { specialistId } = useMemo(
    () => getSpecialistForRoute(pathname ?? "/"),
    [pathname],
  )
  const specialist = useMemo(
    () => getSpecialistById(specialistId),
    [specialistId],
  )

  const pageContext = useMemo(
    () => ({
      type: "general" as const,
      title: screenContext.pageTitle,
      description: screenContext.summary,
    }),
    [screenContext.pageTitle, screenContext.summary],
  )
  const entityContext = serializeContext(pageContext)

  const handleClick = useCallback(() => {
    setHasUnreadInsights(false)

    if (isDesktop) {
      // Desktop: toggle the persistent panel
      advisorPanel.togglePanel(specialistId)
    } else {
      // Mobile: open the dialog modal
      setMobileHandoff({ context: null, referredBy: null })
      setMobileActiveSpecialist(specialist ?? null)
      setMobileDialogOpen(true)
    }
  }, [isDesktop, advisorPanel, specialistId, specialist])

  const handleMobileSwitchSpecialist = useCallback(
    (newId: string, handoffCtx?: string) => {
      const spec = getSpecialistById(newId)
      if (spec) {
        const fromName = mobileActiveSpecialist?.name ?? null
        setMobileHandoff({
          context: handoffCtx ?? null,
          referredBy: handoffCtx ? fromName : null,
        })
        setMobileActiveSpecialist(spec)
        setMobileDialogOpen(true)
      }
    },
    [mobileActiveSpecialist?.name],
  )

  // Hide on /agents — the specialists hub doesn't need a redundant FAB
  if (pathname === "/agents" || pathname?.startsWith("/agents/")) {
    return null
  }
  if (!specialist) {
    return null
  }

  const isPanelOpen = isDesktop && advisorPanel.isOpen

  return (
    <>
      <div
        className={cn(
          "fixed z-[200] transition-all duration-200 ease-out",
          "bottom-24 right-4 sm:bottom-6 sm:right-6",
          mounted ? "opacity-100 scale-100" : "opacity-0 scale-95",
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleClick}
              aria-label={`Ask ${specialist.name} - ${specialist.title}${hasUnreadInsights ? " (has new insights)" : ""}`}
              className={cn(
                "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                "bg-background border shadow-lg",
                "hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "transition-transform duration-200",
                isPanelOpen && "ring-2 ring-international-orange ring-offset-2",
                hasUnreadInsights && !isPanelOpen && "ring-2 ring-international-orange/50 ring-offset-1",
              )}
            >
              {specialist.avatarImage ? (
                <div className="relative h-10 w-10 overflow-hidden rounded-full">
                  <Image
                    src={specialist.avatarImage}
                    alt={specialist.name}
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                </div>
              ) : (
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
              )}
              {/* Proactive insight indicator */}
              {hasUnreadInsights && !isPanelOpen && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-international-orange shadow-sm">
                  <Sparkles className="h-2.5 w-2.5 text-white animate-pulse" />
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {hasUnreadInsights
              ? `${specialist.name} has something to share`
              : isPanelOpen
                ? `Close ${specialist.name}`
                : `Ask ${specialist.name} — ${specialist.title}`
            }
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Mobile-only: Dialog fallback for small screens */}
      {mobileActiveSpecialist && !isDesktop ? (
        <BriefSpecialistDialog
          specialist={mobileActiveSpecialist}
          open={mobileDialogOpen}
          onOpenChange={setMobileDialogOpen}
          onSwitchSpecialist={handleMobileSwitchSpecialist}
          handoffContext={mobileHandoff.context ?? entityContext}
          referredBy={mobileHandoff.referredBy}
          contextLabel={screenContext.pageTitle}
        />
      ) : null}
    </>
  )
}
