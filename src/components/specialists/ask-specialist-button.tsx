"use client"

/**
 * @file ask-specialist-button.tsx
 *
 * @description The primary entry point for contextual specialist consultation.
 * Renders in three visual modes (button, chip, icon). On desktop (lg+),
 * opens the persistent advisor panel via context. On mobile, falls back
 * to the BriefSpecialistDialog modal.
 *
 * Used across Strategy, Objectives, Tasks, and other surfaces to give
 * users one-click access to specialist input.
 */

import { useState, useCallback, useEffect } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { MessageSquare, ChevronDown } from "lucide-react"
import { BriefSpecialistDialog } from "@/app/(platform)/agents/brief-specialist-dialog"
import { getSpecialistById } from "@/app/(platform)/agents/specialists-data"
import { useAdvisorPanel } from "@/contexts/advisor-panel-context"
import { SpecialistPicker } from "./specialist-picker"
import { serializeContext } from "./types"
import type { SpecialistContext, SpecialistButtonVariant } from "./types"
import type { Specialist } from "@/app/(platform)/agents/specialists-data"

// ─── Props ───────────────────────────────────────────────────────────────────

interface AskSpecialistButtonProps {
  /** Context about the current page / entity to pre-load into the conversation */
  context: SpecialistContext
  /** Pre-selected specialist ID. If omitted, shows a picker. */
  specialistId?: string
  /** Human name of the pre-selected specialist (for display) */
  specialistName?: string
  /** Visual variant */
  variant?: SpecialistButtonVariant
  /** Additional CSS classes */
  className?: string
  /** Override the button label. Defaults to "Ask [Name]" or "Ask a Specialist" */
  label?: string
}

/** Handoff state passed between specialists during a conversation switch */
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

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * AskSpecialistButton -- Contextual specialist consultation entry point.
 *
 * @description Renders as a button, chip, or icon. When clicked:
 * - Desktop (lg+): Opens the persistent advisor panel via context
 * - Mobile: Opens BriefSpecialistDialog as a centered modal
 * - If no specialist is pre-selected, shows a SpecialistPicker first
 */
export function AskSpecialistButton({
  context,
  specialistId,
  specialistName,
  variant = "button",
  className,
  label,
}: AskSpecialistButtonProps) {
  const advisorPanel = useAdvisorPanel()
  const isDesktop = useIsDesktop()

  // Mobile-only state: dialog fallback for small screens
  const [mobileDialogOpen, setMobileDialogOpen] = useState(false)
  const [mobileActiveSpecialist, setMobileActiveSpecialist] = useState<Specialist | null>(null)
  const [mobileHandoff, setMobileHandoff] = useState<HandoffState>({ context: null, referredBy: null })

  // Resolve pre-selected specialist
  const preselected = specialistId ? getSpecialistById(specialistId) : null
  const displayName = specialistName ?? preselected?.name

  // Serialize entity context
  const entityContext = serializeContext(context)
  const contextLabel = context.title

  /** Open with a specific specialist (from picker or direct click) */
  const openSpecialist = useCallback((id: string) => {
    if (isDesktop) {
      advisorPanel.openPanel(id, {
        handoffContext: entityContext,
        contextLabel,
      })
    } else {
      const spec = getSpecialistById(id)
      if (spec) {
        setMobileHandoff({ context: null, referredBy: null })
        setMobileActiveSpecialist(spec)
        setMobileDialogOpen(true)
      }
    }
  }, [isDesktop, advisorPanel, entityContext, contextLabel])

  /** Handle direct click when specialist is pre-selected */
  const handleDirectClick = useCallback(() => {
    if (preselected) {
      openSpecialist(preselected.id)
    }
  }, [preselected, openSpecialist])

  /** Handle specialist switch from within the mobile dialog */
  const handleMobileSwitchSpecialist = useCallback((newId: string, handoffCtx?: string) => {
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
  }, [mobileActiveSpecialist?.name])

  // Mobile dialog element (only rendered on mobile)
  const mobileDialog = mobileActiveSpecialist && !isDesktop ? (
    <BriefSpecialistDialog
      specialist={mobileActiveSpecialist}
      open={mobileDialogOpen}
      onOpenChange={setMobileDialogOpen}
      onSwitchSpecialist={handleMobileSwitchSpecialist}
      handoffContext={mobileHandoff.context ?? entityContext}
      referredBy={mobileHandoff.referredBy}
      contextLabel={contextLabel}
    />
  ) : null

  // ── Render: Chip variant ──
  if (variant === "chip") {
    const chipContent = (
      <button
        type="button"
        onClick={preselected ? handleDirectClick : undefined}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
          "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground",
          "transition-colors cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {preselected?.avatarImage ? (
          <div className="relative h-4 w-4 rounded-full overflow-hidden flex-shrink-0">
            <Image
              src={preselected.avatarImage}
              alt={preselected.name}
              fill
              className="object-cover"
              sizes="16px"
            />
          </div>
        ) : (
          <MessageSquare className="h-3 w-3 flex-shrink-0" />
        )}
        <span>{label ?? (displayName ? `Ask ${displayName}` : "Ask a Specialist")}</span>
      </button>
    )

    return (
      <>
        {preselected ? (
          chipContent
        ) : (
          <SpecialistPicker onSelect={openSpecialist}>
            {chipContent}
          </SpecialistPicker>
        )}
        {mobileDialog}
      </>
    )
  }

  // ── Render: Icon variant ──
  if (variant === "icon") {
    const iconButton = (
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", className)}
        onClick={preselected ? handleDirectClick : undefined}
        aria-label={label ?? (displayName ? `Ask ${displayName}` : "Ask a specialist")}
      >
        {preselected?.avatarImage ? (
          <div className="relative h-5 w-5 rounded-full overflow-hidden">
            <Image
              src={preselected.avatarImage}
              alt={preselected.name}
              fill
              className="object-cover"
              sizes="20px"
            />
          </div>
        ) : (
          <MessageSquare className="h-4 w-4" />
        )}
      </Button>
    )

    return (
      <>
        {preselected ? (
          iconButton
        ) : (
          <SpecialistPicker onSelect={openSpecialist}>
            {iconButton}
          </SpecialistPicker>
        )}
        {mobileDialog}
      </>
    )
  }

  // ── Render: Button variant (default) ──
  const hasPreselect = !!preselected
  const buttonContent = (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "gap-2 text-xs",
        className,
      )}
      onClick={hasPreselect ? handleDirectClick : undefined}
    >
      {preselected?.avatarImage ? (
        <div className="relative h-5 w-5 rounded-full overflow-hidden flex-shrink-0">
          <Image
            src={preselected.avatarImage}
            alt={preselected.name}
            fill
            className="object-cover"
            sizes="20px"
          />
        </div>
      ) : (
        <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
      )}
      <span>{label ?? (displayName ? `Ask ${displayName}` : "Ask a Specialist")}</span>
      {!hasPreselect && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
    </Button>
  )

  return (
    <>
      {hasPreselect ? (
        buttonContent
      ) : (
        <SpecialistPicker onSelect={openSpecialist} recommendedId={specialistId}>
          {buttonContent}
        </SpecialistPicker>
      )}
      {mobileDialog}
    </>
  )
}
