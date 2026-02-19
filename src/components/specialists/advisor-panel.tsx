"use client"

/**
 * @file advisor-panel.tsx
 *
 * @description Persistent right-side advisor panel that lives in the
 * platform layout. Renders BriefSpecialistDialog in "panel" mode so
 * users can interact with both the main content and the advisor
 * simultaneously.
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
 * @description Renders as a fixed-width column sidebar. Uses
 * BriefSpecialistDialog in "panel" renderMode so users can interact
 * with both the main content and the specialist simultaneously.
 */
export function AdvisorPanel(): React.ReactElement {
  const {
    isOpen,
    activeSpecialist,
    handoffContext,
    referredBy,
    contextLabel,
    closePanel,
    switchSpecialist,
  } = useAdvisorPanel()

  const handleSwitchSpecialist = useCallback(
    (specialistId: string, handoffCtx?: string) => {
      switchSpecialist(specialistId, handoffCtx)
    },
    [switchSpecialist],
  )

  return (
    <div
      className={cn(
        "hidden lg:flex flex-col h-full border-l bg-background transition-[width,border] duration-200 ease-out overflow-hidden",
        isOpen && activeSpecialist
          ? "w-[380px] xl:w-[420px] flex-shrink-0"
          : "w-0 border-l-0",
      )}
      role="complementary"
      aria-label="Advisor panel"
    >
      {activeSpecialist && (
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
        />
      )}
    </div>
  )
}
