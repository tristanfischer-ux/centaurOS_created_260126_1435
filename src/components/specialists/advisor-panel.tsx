"use client"

/**
 * @file advisor-panel.tsx
 *
 * @description Persistent right-side advisor panel that lives in the
 * platform layout. Renders BriefSpecialistDialog in "panel" mode so
 * users can interact with both the main content and the advisor
 * simultaneously. Persists across page navigations.
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
 * @description Renders as a fixed-width column on the right side of the
 * platform layout. Uses BriefSpecialistDialog in "panel" renderMode to
 * reuse all chat logic (streaming, memory, TTS, proposed actions, etc.)
 * without duplicating the 1800-line component.
 *
 * The panel slides in/out with a CSS transition and persists across
 * page navigations because it lives in the layout, not in any page.
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
        "hidden lg:flex flex-col h-full border-l bg-background transition-[width,border] duration-200 ease-out overflow-hidden flex-shrink-0",
        isOpen && activeSpecialist ? "w-[380px] xl:w-[420px]" : "w-0 border-l-0",
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
