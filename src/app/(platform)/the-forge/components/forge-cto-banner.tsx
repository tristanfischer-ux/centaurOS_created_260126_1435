/**
 * @file forge-cto-banner.tsx — CTO presence banner on The Forge landing page
 *
 * @description Compact horizontal banner showing Max (CTO) as an always-visible
 * presence at the top of The Forge. Opens the advisor panel pre-loaded with
 * Max and context about the user's current projects.
 *
 * @related
 * - AdvisorPanel: src/contexts/advisor-panel-context.tsx
 * - Specialists config: src/lib/agents/specialists-config.ts
 * - Forge page: src/app/(platform)/the-forge/components/forge-project-list.tsx
 */

"use client"

import Image from "next/image"
import { MessageSquare } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAdvisorPanel } from "@/contexts/advisor-panel-context"

import type { CadLabProjectSummary } from "@/actions/cad-lab-projects"

// ─── Constants ───────────────────────────────────────────────────────

const CTO_SPECIALIST_ID = "cto"
const CTO_NAME = "Max"
const CTO_TITLE = "Chief Technology Officer"
const CTO_TAGLINE = "First principles. Delete before you optimize. The best part is no part."
const CTO_AVATAR = "/images/specialists/cto.png"

// ─── Component ───────────────────────────────────────────────────────

interface ForgeCtoBannerProps {
  projects: CadLabProjectSummary[]
}

export function ForgeCtoBanner({ projects }: ForgeCtoBannerProps) {
  const { openPanel } = useAdvisorPanel()

  const handleTalk = () => {
    const inProgress = projects.filter(
      (p) => p.status !== "complete" && p.status !== "rfq_created",
    ).length
    const total = projects.length

    const contextParts: string[] = [
      "The user is on The Forge landing page.",
    ]
    if (total === 0) {
      contextParts.push("They have no projects yet — this may be their first time here.")
    } else {
      contextParts.push(
        `They have ${total} project${total !== 1 ? "s" : ""}${inProgress > 0 ? ` (${inProgress} in progress)` : ""}.`,
      )
    }
    contextParts.push(
      "They may want to discuss a new design, review architecture, get technology advice, or explore what The Forge can do.",
    )

    openPanel(CTO_SPECIALIST_ID, {
      handoffContext: contextParts.join(" "),
      contextLabel: "The Forge",
    })
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border-l-2 border-l-international-orange/40 bg-muted/30 px-4 py-3">
      {/* Avatar */}
      <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-muted">
        <Image
          src={CTO_AVATAR}
          alt={CTO_NAME}
          fill
          className="object-cover"
          sizes="40px"
        />
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {CTO_NAME}, {CTO_TITLE}
        </p>
        <p className="hidden text-xs text-muted-foreground line-clamp-1 sm:block">
          {CTO_TAGLINE}
        </p>
      </div>

      {/* CTA */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleTalk}
        className="flex-shrink-0"
      >
        <MessageSquare className="h-4 w-4 sm:mr-1.5" />
        <span className="hidden sm:inline">Talk to Max</span>
      </Button>
    </div>
  )
}
