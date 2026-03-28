/**
 * @file forge-cto-banner.tsx — Max (CTO) presence on The Forge landing page
 *
 * @description Uses the shared SpecialistBriefingHero component with dynamic
 * greeting logic based on project state (stalled, no projects, in-progress, complete).
 */

"use client"

import { useMemo } from "react"
import { usePageBriefing } from "@/hooks/use-page-briefing"
import { generatePageBriefing } from "@/actions/specialist-page-insights"
import { SpecialistBriefingHero, type BriefingSeverity } from "@/components/specialists/specialist-briefing-hero"
import type { CadLabProjectSummary } from "@/actions/cad-lab-projects"

// ─── Constants ───────────────────────────────────────────────────────

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

function getBannerContent(projects: CadLabProjectSummary[]): {
  message: string
  severity: BriefingSeverity
} {
  const timeGreeting = getTimeOfDayGreeting()
  const inProgress = projects.filter(
    (p) => p.status !== "complete" && p.status !== "rfq_created",
  )

  const stalled = getStalledProject(projects)
  if (stalled) {
    const name = stalled.subject || stalled.name
    return {
      message: `${timeGreeting}. Your ${name} design hasn\u2019t moved in a few days \u2014 stuck on something? Let\u2019s talk through what\u2019s blocking you.`,
      severity: 'warning',
    }
  }

  if (projects.length === 0) {
    return {
      message: `${timeGreeting}. Ready to build something? Tell me what you\u2019re working on and I\u2019ll guide you through design, specification, and sourcing.`,
      severity: 'success',
    }
  }

  if (inProgress.length > 0) {
    const latest = inProgress[0]
    const name = latest.subject || latest.name
    const stage = STAGE_LABELS[latest.stage] ?? latest.stage
    return {
      message: `${timeGreeting}. Your ${name} is in ${stage} \u2014 want to talk through next steps?`,
      severity: 'success',
    }
  }

  return {
    message: "Welcome back. All your designs are wrapped up. What are we building next?",
    severity: 'success',
  }
}

// ─── Component ───────────────────────────────────────────────────────

interface ForgeCtoBannerProps {
  projects: CadLabProjectSummary[]
}

export function ForgeCtoBanner({ projects }: ForgeCtoBannerProps) {
  const { message, severity } = useMemo(() => getBannerContent(projects), [projects])

  // Live AI briefing
  const draftCount = projects.filter(p => p.status === 'draft').length
  const inProgressCount = projects.filter(p => p.status !== 'draft' && p.status !== 'complete' && p.status !== 'rfq_created').length
  const completedCount = projects.filter(p => p.status === 'complete' || p.status === 'rfq_created').length
  const briefingContext = `Projects: ${projects.length} (${draftCount} draft, ${inProgressCount} in progress, ${completedCount} completed)`
  const briefing = usePageBriefing(
    () => generatePageBriefing('cto', briefingContext, 'success'),
    'success',
    projects.length > 0,
    'briefing-forge',
  )

  const context = useMemo(() => {
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

    return {
      type: 'general' as const,
      title: 'The Forge',
      description: contextParts.join(" "),
      metadata: {},
    }
  }, [projects])

  return (
    <SpecialistBriefingHero
      specialistId="cto"
      specialistName="Max"
      specialistTitle="CTO"
      narrative={briefing.narrative}
      fallbackMessage={message}
      isLoading={briefing.isLoading}
      severity={briefing.severity}
      context={context}
      storageKey="forge-cto"
    />
  )
}
