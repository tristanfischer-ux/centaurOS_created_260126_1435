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
const CTO_AVATAR = "/images/specialists/cto.png"

const STAGE_LABELS: Record<string, string> = {
  draft: "Draft",
  researched: "Research",
  interface_ready: "Build",
  generated: "Generation",
  complete: "Complete",
}

// ─── Greeting Logic ──────────────────────────────────────────────────

function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Morning"
  if (hour < 17) return "Afternoon"
  return "Evening"
}

function getStalledProject(
  projects: CadLabProjectSummary[],
): CadLabProjectSummary | null {
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000
  return (
    projects.find(
      (p) =>
        p.status !== "complete" &&
        p.status !== "rfq_created" &&
        new Date(p.updatedAt).getTime() < threeDaysAgo,
    ) ?? null
  )
}

interface BannerContent {
  greeting: string
  message: string
}

function getBannerContent(projects: CadLabProjectSummary[]): BannerContent {
  const timeGreeting = getTimeOfDayGreeting()
  const inProgress = projects.filter(
    (p) => p.status !== "complete" && p.status !== "rfq_created",
  )

  // Proactive nudge: stalled project (3+ days idle)
  const stalled = getStalledProject(projects)
  if (stalled) {
    const name = stalled.subject || stalled.name
    return {
      greeting: `${timeGreeting}.`,
      message: `Your ${name} design hasn\u2019t moved in a few days \u2014 stuck on something?`,
    }
  }

  // New user: no projects at all
  if (projects.length === 0) {
    return {
      greeting: `${timeGreeting}.`,
      message: "Ready to build something? Tell me what you\u2019re working on.",
    }
  }

  // Has active in-progress project
  if (inProgress.length > 0) {
    const latest = inProgress[0] // pre-sorted by updatedAt DESC from server
    const name = latest.subject || latest.name
    const stage = STAGE_LABELS[latest.stage] ?? latest.stage
    return {
      greeting: `${timeGreeting}.`,
      message: `Your ${name} is in ${stage} \u2014 want to talk through next steps?`,
    }
  }

  // All projects complete — returning builder
  return {
    greeting: `Welcome back.`,
    message: "All your designs are wrapped up. What are we building next?",
  }
}

// ─── Component ───────────────────────────────────────────────────────

interface ForgeCtoBannerProps {
  projects: CadLabProjectSummary[]
}

export function ForgeCtoBanner({ projects }: ForgeCtoBannerProps) {
  const { openPanel } = useAdvisorPanel()
  const { greeting, message } = getBannerContent(projects)

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
    const stalled = getStalledProject(projects)
    if (stalled) {
      contextParts.push(
        `Their "${stalled.subject || stalled.name}" project has been idle for several days and may be stalled.`,
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
          {CTO_NAME} <span className="font-normal text-muted-foreground">\u00b7 {greeting}</span>
        </p>
        <p className="hidden text-xs text-muted-foreground line-clamp-1 sm:block">
          {message}
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
