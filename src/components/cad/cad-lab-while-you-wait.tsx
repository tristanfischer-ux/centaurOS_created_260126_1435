"use client"

/**
 * @file cad-lab-while-you-wait.tsx — Productive activities panel during batch generation.
 *
 * @description Turns dead wait time into preparation by suggesting context-aware
 * activities: reviewing failure modes, reviewing module blueprints,
 * refining the research report, checking tasks, and preparing review checklists.
 *
 * Shown on the Build page while batch generation is running.
 *
 * @component
 */

import { useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ClipboardCheck,
  FileText,
  ListChecks,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  HelpCircle,
  Coffee,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Types ───────────────────────────────────────────────────────────

interface WhileYouWaitProps {
  /** Current module list with failure modes and unknowns */
  modules: CadLabModule[]
  /** Number of diagnostic questionnaires completed */
  diagCompletedCount: number
  /** Whether the user has research to review */
  hasResearch: boolean
}

// ─── Activity Card ───────────────────────────────────────────────────

interface ActivityProps {
  icon: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
  /** Priority: higher = shown first */
  priority: number
  /** Whether this activity is already completed */
  completed?: boolean
}

function Activity({ icon, title, description, action, completed }: ActivityProps): React.ReactNode {
  if (completed) return null
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex-shrink-0 mt-0.5 text-international-orange">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  )
}

// ─── Risk Summary Expandable ─────────────────────────────────────────

function RiskSummary({ modules }: { modules: CadLabModule[] }): React.ReactNode {
  const [expanded, setExpanded] = useState(false)

  const allFailureModes = modules.flatMap((m) =>
    m.failureModes.map((f) => ({ module: m.name, risk: f })),
  )
  const allUnknowns = modules.flatMap((m) =>
    m.unknowns.map((u) => ({ module: m.name, unknown: u })),
  )

  if (allFailureModes.length === 0 && allUnknowns.length === 0) return null

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full p-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-status-warning" />
          <span className="text-sm font-medium">
            {allFailureModes.length} failure modes, {allUnknowns.length} unknowns across modules
          </span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {allFailureModes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-1">
                Failure Modes
              </p>
              <ul className="space-y-1">
                {allFailureModes.map((f, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0 mt-0.5" />
                    <span>
                      <span className="font-medium text-foreground">{f.module}:</span> {f.risk}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {allUnknowns.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-status-warning uppercase tracking-wider mb-1">
                Unknowns
              </p>
              <ul className="space-y-1">
                {allUnknowns.map((u, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <HelpCircle className="h-3 w-3 text-status-warning flex-shrink-0 mt-0.5" />
                    <span>
                      <span className="font-medium text-foreground">{u.module}:</span> {u.unknown}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────

/**
 * CadLabWhileYouWait — Productive activities panel during batch generation.
 *
 * @description Shows context-aware suggestions for what the user can do
 * while modules are being generated. Activities are prioritized based on
 * what's most useful given the current state (e.g., if diagnostics aren't
 * done, that's suggested first).
 */
export function CadLabWhileYouWait({
  modules,
  diagCompletedCount,
  hasResearch,
}: WhileYouWaitProps): React.ReactNode {
  const totalModules = modules.length
  const riskCount = modules.reduce(
    (sum, m) => sum + m.failureModes.length + m.unknowns.length,
    0,
  )
  const diagsRemaining = totalModules - diagCompletedCount

  const activities: ActivityProps[] = [
    // Review risks — always useful if there are any
    {
      icon: <ShieldAlert className="h-4 w-4" />,
      title: "Review failure modes & unknowns",
      description: `Your modules have ${riskCount} identified risks. Review them now so you can prioritise mitigations when CAD results arrive.`,
      priority: riskCount > 0 ? 100 : 0,
      completed: riskCount === 0,
    },
    // Review module blueprints — useful context while waiting
    {
      icon: <ClipboardCheck className="h-4 w-4" />,
      title: "Review module blueprints from Concept stage",
      description: "Scroll through the blueprint illustrations generated during the Concept stage. Annotate any design concerns before CAD results arrive.",
      priority: 70,
      completed: false,
    },
    // Review research — always available
    {
      icon: <FileText className="h-4 w-4" />,
      title: "Refine the research report",
      description: "Your research report is editable. Add missing dimensions, correct assumptions, or add notes from your own expertise. Changes will improve future generations.",
      priority: hasResearch ? 60 : 0,
      completed: !hasResearch,
    },
    // Check tasks — always useful
    {
      icon: <ListChecks className="h-4 w-4" />,
      title: "Check today's tasks",
      description: "You'll be notified when generation completes. Use this time to review your task list, clear blockers, or respond to messages.",
      action: (
        <Link href="/today">
          <Button variant="outline" size="sm" className="h-8 text-xs">
            Go to Today
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      ),
      priority: 40,
    },
    // Prepare review checklist
    {
      icon: <Coffee className="h-4 w-4" />,
      title: "Prepare your review checklist",
      description: "Think about what you want to verify: tolerances, material choices, interface fits, thermal management. Having a checklist ready speeds up the Review stage.",
      priority: 20,
    },
  ]

  // Sort by priority (highest first), filter out completed
  const activeActivities = activities
    .filter((a) => !a.completed)
    .sort((a, b) => b.priority - a.priority)

  if (activeActivities.length === 0) return null

  return (
    <Card className="border-international-orange/20 bg-gradient-to-b from-international-orange-light/10 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 text-foreground">
          <Coffee className="h-4 w-4 text-international-orange" />
          While you wait
          <span className="text-xs font-normal text-muted-foreground">
            — generation is running on the server, you can safely navigate away
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Risk summary (expandable) */}
        {riskCount > 0 && <RiskSummary modules={modules} />}

        {/* Activity suggestions */}
        {activeActivities.map((activity, i) => (
          <Activity key={i} {...activity} />
        ))}
      </CardContent>
    </Card>
  )
}
