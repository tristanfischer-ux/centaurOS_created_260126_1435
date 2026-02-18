"use client"

/**
 * @file advisor-panel.tsx
 *
 * @description Persistent right-side advisor panel that lives in the
 * platform layout. Renders BriefSpecialistDialog in "panel" mode so
 * users can interact with both the main content and the advisor
 * simultaneously. Can expand to full width with a split view (chat + workspace).
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
import { PanelExpandToggle } from "@/components/specialists/panel-expand-toggle"
import { AgentWorkspace } from "@/components/specialists/workspace/agent-workspace"

/**
 * AdvisorPanel -- Persistent sidebar for specialist conversations.
 *
 * @description Renders as a fixed-width column (sidebar) or full-width split
 * view (chat + workspace). Uses BriefSpecialistDialog in "panel" renderMode.
 * When expanded, main content area is hidden and the panel shows workspace (left)
 * and chat (right), keeping the chat in its familiar right-hand position.
 */
export function AdvisorPanel(): React.ReactElement {
  const {
    isOpen,
    activeSpecialist,
    handoffContext,
    referredBy,
    contextLabel,
    panelViewMode,
    closePanel,
    switchSpecialist,
  } = useAdvisorPanel()

  const handleSwitchSpecialist = useCallback(
    (specialistId: string, handoffCtx?: string) => {
      switchSpecialist(specialistId, handoffCtx)
    },
    [switchSpecialist],
  )

  const isExpanded = panelViewMode === "expanded"

  return (
    <div
      className={cn(
        "hidden lg:flex flex-col h-full border-l bg-background transition-[width,border] duration-200 ease-out overflow-hidden",
        isOpen && activeSpecialist
          ? isExpanded
            ? "flex-1 min-w-0"
            : "w-[380px] xl:w-[420px] flex-shrink-0"
          : "w-0 border-l-0",
      )}
      role="complementary"
      aria-label="Advisor panel"
    >
      {activeSpecialist && (
        isExpanded ? (
          <div className="flex flex-1 min-h-0 min-w-0">
            <div className="flex-1 min-w-0 flex flex-col border-r">
              <AgentWorkspace />
            </div>
            <div className="flex flex-col w-[40%] min-w-0 shrink-0">
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
                panelHeaderActions={<PanelExpandToggle />}
              />
            </div>
          </div>
        ) : (
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
            panelHeaderActions={<PanelExpandToggle />}
          />
        )
      )}
    </div>
  )
}
