"use client"

/**
 * @file ask-specialist-button.tsx
 *
 * @description The primary entry point for contextual specialist consultation.
 * Renders in three visual modes (button, chip, icon). Opens the
 * BriefSpecialistDialog as a centered modal on every viewport — the
 * desktop right-hand sidebar was removed in Phase E.
 *
 * Used across Strategy, Objectives, Tasks, and other surfaces to give
 * users one-click access to specialist input.
 */

import { useState, useCallback } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { MessageSquare, ChevronDown } from "lucide-react"
import { BriefSpecialistDialog } from "@/app/(platform)/agents/brief-specialist-dialog"
import { getSpecialistById } from "@/lib/agents/specialists-config"
import { SpecialistPicker } from "./specialist-picker"
import { serializeContext } from "./types"
import type { SpecialistContext, SpecialistButtonVariant } from "./types"
import type { Specialist } from "@/lib/agents/specialists-config"

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

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * AskSpecialistButton -- Contextual specialist consultation entry point.
 *
 * @description Renders as a button, chip, or icon. When clicked, opens
 * BriefSpecialistDialog as a centered modal. If no specialist is
 * pre-selected, shows a SpecialistPicker first.
 */
export function AskSpecialistButton({
  context,
  specialistId,
  specialistName,
  variant = "button",
  className,
  label,
}: AskSpecialistButtonProps) {
  // Single dialog state — used on every viewport now that the desktop sidebar is gone
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeSpecialist, setActiveSpecialist] = useState<Specialist | null>(null)
  const [handoff, setHandoff] = useState<HandoffState>({ context: null, referredBy: null })

  // Resolve pre-selected specialist
  const preselected = specialistId ? getSpecialistById(specialistId) : null
  const displayName = specialistName ?? preselected?.name

  // Serialize entity context
  const entityContext = serializeContext(context)
  const contextLabel = context.title

  /** Open with a specific specialist (from picker or direct click) */
  const openSpecialist = useCallback((id: string) => {
    const spec = getSpecialistById(id)
    if (spec) {
      setHandoff({ context: null, referredBy: null })
      setActiveSpecialist(spec)
      setDialogOpen(true)
    }
  }, [])

  /** Handle direct click when specialist is pre-selected */
  const handleDirectClick = useCallback(() => {
    if (preselected) {
      openSpecialist(preselected.id)
    }
  }, [preselected, openSpecialist])

  /** Handle specialist switch from within the dialog */
  const handleSwitchSpecialist = useCallback((newId: string, handoffCtx?: string) => {
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
  }, [activeSpecialist?.name])

  // Dialog element (rendered on every viewport)
  const specialistDialog = activeSpecialist ? (
    <BriefSpecialistDialog
      specialist={activeSpecialist}
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      onSwitchSpecialist={handleSwitchSpecialist}
      handoffContext={handoff.context ?? entityContext}
      referredBy={handoff.referredBy}
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
              unoptimized
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
        {specialistDialog}
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
              unoptimized
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
        {specialistDialog}
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
      {specialistDialog}
    </>
  )
}
