"use client"

/**
 * @file floating-specialist-fab.tsx
 *
 * @description Global floating action button that shows the most relevant
 * AI specialist for the current page. Route-aware via getSpecialistForRoute.
 * Defaults to Chief of Staff (Cal) when no specific specialist matches.
 * Hidden on /agents (the specialists hub).
 *
 * @related
 * - Route mapping: src/lib/route-specialist-map.ts
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
import { getSpecialistForRoute } from "@/lib/route-specialist-map"
import { serializeContext } from "./types"
import type { Specialist } from "@/app/(platform)/agents/specialists-data"

/** Handoff state when switching specialists from within the dialog */
interface HandoffState {
  context: string | null
  referredBy: string | null
}

export function FloatingSpecialistFAB(): React.ReactElement | null {
  const pathname = usePathname()
  const { screenContext } = useScreenContext()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeSpecialist, setActiveSpecialist] = useState<Specialist | null>(
    null,
  )
  const [handoff, setHandoff] = useState<HandoffState>({
    context: null,
    referredBy: null,
  })
  const [mounted, setMounted] = useState(false)
  const [hasUnreadInsights, setHasUnreadInsights] = useState(false)

  // Entrance delay to avoid flash on navigation
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 200)
    return () => clearTimeout(t)
  }, [])

  // Check for unread specialist insights periodically (lightweight poll)
  useEffect(() => {
    let cancelled = false

    async function checkInsights(): Promise<void> {
      try {
        // Dynamic import to avoid SSR issues and keep bundle light
        const { getUnreadInsightCount } = await import("@/actions/agent-insights")
        const count = await getUnreadInsightCount()
        if (!cancelled) {
          setHasUnreadInsights(count > 0)
        }
      } catch {
        // Non-critical — silently ignore
      }
    }

    // Check once on mount after a delay, then every 5 minutes
    const initialTimer = setTimeout(checkInsights, 3000)
    const interval = setInterval(checkInsights, 5 * 60 * 1000)

    return () => {
      cancelled = true
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [pathname]) // Re-check when navigating

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

  const openDialog = useCallback(() => {
    setHandoff({ context: null, referredBy: null })
    setActiveSpecialist(specialist)
    setDialogOpen(true)
  }, [specialist])

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
          "bottom-24 right-4 sm:bottom-6 sm:right-6",
          mounted ? "opacity-100 scale-100" : "opacity-0 scale-95",
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => {
                openDialog()
                // Clear the indicator when the user opens the dialog
                setHasUnreadInsights(false)
              }}
              aria-label={`Ask ${specialist.name} - ${specialist.title}${hasUnreadInsights ? " (has new insights)" : ""}`}
              className={cn(
                "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                "bg-background border shadow-lg",
                "hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "transition-transform duration-200",
                dialogOpen && "ring-2 ring-international-orange ring-offset-2",
                hasUnreadInsights && !dialogOpen && "ring-2 ring-international-orange/50 ring-offset-1",
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
              {/* Proactive insight indicator — subtle sparkle when specialist has something to share */}
              {hasUnreadInsights && !dialogOpen && (
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
      </div>

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
