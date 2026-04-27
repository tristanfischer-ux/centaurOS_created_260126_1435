"use client"

/**
 * @file floating-specialist-fab.tsx
 *
 * @description Global floating action button that surfaces the most relevant
 * specialist for the current page. Click opens BriefSpecialistDialog as a
 * centered modal on every viewport (desktop sidebar was removed Phase E).
 *
 * @related
 * - Route mapping: src/lib/route-specialist-map.ts
 * - BriefSpecialistDialog: src/app/(platform)/agents/brief-specialist-dialog.tsx
 * - Screen context: src/contexts/screen-context.tsx
 */

import { useState, useCallback, useMemo, useEffect } from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { MessageSquare, Sparkles, HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BriefSpecialistDialog } from "@/app/(platform)/agents/brief-specialist-dialog"
import { getSpecialistById } from "@/lib/agents/specialists-config"
import { useScreenContext } from "@/contexts/screen-context"
import { getSpecialistForRoute } from "@/lib/route-specialist-map"
import { serializeContext } from "./types"
import type { Specialist } from "@/lib/agents/specialists-config"

/** Handoff state when switching specialists from within the dialog */
interface HandoffState {
  context: string | null
  referredBy: string | null
}

export function FloatingSpecialistFAB(): React.ReactElement | null {
  const pathname = usePathname()
  const { screenContext } = useScreenContext()

  // Dialog state — used on every viewport now that the desktop sidebar is gone
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeSpecialist, setActiveSpecialist] = useState<Specialist | null>(null)
  const [handoff, setHandoff] = useState<HandoffState>({ context: null, referredBy: null })

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

  /** Standard click: open specialist for general conversation */
  const handleClick = useCallback(() => {
    setHasUnreadInsights(false)
    setHandoff({ context: null, referredBy: null })
    setActiveSpecialist(specialist ?? null)
    setDialogOpen(true)
  }, [specialist])

  /** "Guide me" click: open specialist in page guidance mode */
  const handleGuideMeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setHasUnreadInsights(false)

    const guidanceContext = `__GUIDE_MODE__\nThe user clicked "Guide me through this page". Walk them through what they can do on the ${screenContext.pageTitle} page. Use the page knowledge to give a friendly, step-by-step orientation. Start with the most important action, cover 2-3 more, then ask what they'd like to try first.`

    setHandoff({ context: guidanceContext, referredBy: null })
    setActiveSpecialist(specialist ?? null)
    setDialogOpen(true)
  }, [specialist, screenContext.pageTitle])

  const handleSwitchSpecialist = useCallback(
    (newId: string, handoffCtx?: string) => {
      const spec = getSpecialistById(newId)
      if (spec) {
        const fromName = activeSpecialist?.name ?? null
        setHandoff({
          context: handoffCtx ?? null,
          referredBy: handoffCtx ? fromName : null,
        })
        setActiveSpecialist(spec)
        setDialogOpen(true)
      }
    },
    [activeSpecialist?.name],
  )

  // Hide on /agents — the specialists hub doesn't need a redundant FAB
  if (pathname === "/agents" || pathname?.startsWith("/agents/")) {
    return null
  }
  if (!specialist) {
    return null
  }

  return (
    <>
      <div
        className={cn(
          "fixed z-[200] transition-all duration-200 ease-out",
          // Mobile: above the bottom-nav (~64px), left side so it doesn't
          // collide with the centered orange "+" FAB (which is also above
          // the bottom-nav). Desktop unchanged. Tristan 2026-04-27.
          "bottom-20 left-4 sm:bottom-6 sm:right-6 sm:left-auto",
          mounted ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none",
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
                hasUnreadInsights && "ring-2 ring-international-orange/50 ring-offset-1",
              )}
            >
              {specialist.avatarImage ? (
                <div className="relative h-10 w-10 overflow-hidden rounded-full">
                  <Image
                    src={specialist.avatarImage}
                    alt={specialist.name}
                    fill
                    unoptimized
                    className="object-cover"
                    sizes="40px"
                  />
                </div>
              ) : (
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
              )}
              {/* Proactive insight indicator */}
              {hasUnreadInsights && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-international-orange shadow-sm">
                  <Sparkles className="h-2.5 w-2.5 text-white animate-pulse" />
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {hasUnreadInsights
              ? `${specialist.name} has something to share`
              : `Ask ${specialist.name} — ${specialist.title}`
            }
          </TooltipContent>
        </Tooltip>

        {/* "Guide me" secondary action — small help badge */}
        {screenContext.availableActions && screenContext.availableActions.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleGuideMeClick}
                aria-label={mounted ? `Guide me through ${screenContext.pageTitle}` : "Guide me through this page"}
                className={cn(
                  "absolute -bottom-1 -left-1 flex h-6 w-6 items-center justify-center rounded-full",
                  "bg-international-orange text-white shadow-md",
                  "hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "transition-transform duration-200",
                )}
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              Guide me through this page
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Centered modal — replaces the deleted right-hand sidebar */}
      {activeSpecialist ? (
        <BriefSpecialistDialog
          specialist={activeSpecialist}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSwitchSpecialist={handleSwitchSpecialist}
          handoffContext={handoff.context ?? entityContext}
          referredBy={handoff.referredBy}
          contextLabel={screenContext.pageTitle}
        />
      ) : null}
    </>
  )
}
