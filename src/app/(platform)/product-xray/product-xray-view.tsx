"use client"

import {
  ScanSearch,
  Lightbulb,
  Store,
  Users,
  Bot,
  Waypoints,
  Target,
  CheckSquare,
} from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"

/**
 * Connection points that Product X-Ray wires into.
 * Each represents a platform area this page will integrate with.
 */
const CONNECTION_POINTS = [
  {
    name: "Strategy",
    description: "Strategic flow and visual mapping of goals",
    icon: Waypoints,
    href: "/canvas",
  },
  {
    name: "Objectives",
    description: "High-level strategic goals and OKRs",
    icon: Target,
    href: "/new-objectives",
  },
  {
    name: "Tasks",
    description: "Actionable items and execution tracking",
    icon: CheckSquare,
    href: "/new-tasks",
  },
  {
    name: "Team",
    description: "Team members, roles, and capacity",
    icon: Users,
    href: "/team",
  },
  {
    name: "Agents",
    description: "Prompt workflows and AI-assisted analysis",
    icon: Bot,
    href: "/agents",
  },
  {
    name: "Inspiration",
    description: "Ideas, packs, and opportunity discovery",
    icon: Lightbulb,
    href: "/inspiration",
  },
  {
    name: "Marketplace",
    description: "Experts, suppliers, products, and services",
    icon: Store,
    href: "/marketplace",
  },
] as const

/**
 * ProductXRayView — Main client component for the Product X-Ray page.
 *
 * @description Provides deep product analysis by connecting insights across
 * strategy, objectives, tasks, team, agents, inspiration, and marketplace.
 * This is a placeholder shell — content and integrations will be added incrementally.
 */
export function ProductXRayView() {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="pb-4 border-b border-muted">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>Product X-Ray</h1>
        </div>
        <p className={cn(typography.pageSubtitle, "mt-1")}>
          Deep product analysis connecting strategy, team, marketplace, and
          execution — all in one view.
        </p>
      </div>

      {/* Connection Points Grid */}
      <div>
        <h2 className={cn(typography.h3, "mb-4")}>Connected Areas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {CONNECTION_POINTS.map((point) => {
            const Icon = point.icon
            return (
              <Card
                key={point.name}
                className="group border rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted group-hover:bg-orange-50 transition-colors">
                      <Icon className="h-5 w-5 text-muted-foreground group-hover:text-international-orange transition-colors" />
                    </div>
                    <CardTitle className="text-base font-semibold">
                      {point.name}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {point.description}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Placeholder for future content */}
      <Card className="border rounded-xl shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-muted/30 mb-6">
            <ScanSearch className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className={cn(typography.h3, "mb-2")}>
            Analysis workspace coming soon
          </h3>
          <p className="text-sm text-muted-foreground max-w-md">
            This is where your product analysis will live — pulling insights
            from across your entire workspace into a unified view.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
