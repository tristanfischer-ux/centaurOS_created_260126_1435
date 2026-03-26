"use client"

/**
 * @file advisor-panel.tsx
 *
 * @description Persistent right-side advisor panel that lives in the
 * platform layout. Renders BriefSpecialistDialog in "panel" mode so
 * users can interact with both the main content and the advisor
 * simultaneously.
 *
 * DECISION: A SINGLE BriefSpecialistDialog instance is rendered and
 * its container switches between sidebar/fullscreen layout. This
 * preserves React component state (messages, threadId, streaming)
 * across expand/collapse transitions. The previous approach had two
 * separate instances causing conversation loss on toggle.
 *
 * @related
 * - AdvisorPanelProvider: src/contexts/advisor-panel-context.tsx
 * - BriefSpecialistDialog: src/app/(platform)/agents/brief-specialist-dialog.tsx
 * - Platform layout: src/app/(platform)/layout.tsx
 */

import { useCallback } from "react"
import { cn } from "@/lib/utils"
import { useAdvisorPanel } from "@/contexts/advisor-panel-context"
import { BriefSpecialistDialog } from "@/app/(platform)/agents/brief-specialist-dialog"

/**
 * AdvisorPanel -- Persistent sidebar for specialist conversations.
 *
 * @description Renders as a fixed-width column sidebar or fullscreen overlay.
 * Uses a SINGLE BriefSpecialistDialog instance to preserve conversation state
 * across layout transitions.
 */
export function AdvisorPanel(): React.ReactElement {
  const {
    isOpen,
    isFullscreen,
    activeSpecialist,
    handoffContext,
    referredBy,
    contextLabel,
    handoffTrail,
    handoffSourceThreadId,
    handoffSourceSpecialistId,
    closePanel,
    switchSpecialist,
    setFullscreen,
  } = useAdvisorPanel()

  const handleSwitchSpecialist = useCallback(
    (specialistId: string, handoffCtx?: string, sourceThreadId?: string, sourceSpecialistId?: string) => {
      switchSpecialist(specialistId, handoffCtx, sourceThreadId, sourceSpecialistId)
    },
    [switchSpecialist],
  )

  const showPanel = isOpen && !!activeSpecialist

  // The single dialog instance — rendered once, container changes around it
  const dialogContent = activeSpecialist ? (
    <BriefSpecialistDialog
      specialist={activeSpecialist}
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closePanel()
      }}
      onSwitchSpecialist={handleSwitchSpecialist}
      handoffContext={handoffContext}
      referredBy={referredBy}
      contextLabel={contextLabel}
      renderMode="panel"
      handoffTrail={handoffTrail}
      handoffSourceThreadId={handoffSourceThreadId}
      handoffSourceSpecialistId={handoffSourceSpecialistId}
    />
  ) : null

  return (
    <>
      {/* Fullscreen backdrop */}
      {isFullscreen && showPanel && (
        <div
          className="fixed inset-0 z-[99] bg-black/40 transition-opacity duration-300"
          onClick={() => setFullscreen(false)}
          aria-label="Close fullscreen panel"
        />
      )}

      {/* Container — switches between sidebar and fullscreen layout */}
      <div
        className={cn(
          isFullscreen && showPanel
            ? "fixed inset-0 z-[100] flex flex-col bg-background transition-all duration-300"
            : "hidden lg:flex flex-col h-full border-l bg-background transition-[width,border] duration-200 ease-out overflow-hidden",
          !isFullscreen && (showPanel
            ? "w-[380px] xl:w-[420px] flex-shrink-0"
            : "w-0 border-l-0"),
        )}
        role="complementary"
        aria-label={isFullscreen ? "Fullscreen advisor panel" : "Advisor panel"}
      >
        {dialogContent}
      </div>
    </>
  )
}
