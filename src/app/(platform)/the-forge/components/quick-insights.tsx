/**
 * @file quick-insights.tsx — Three key findings at a glance
 *
 * @description Displays the most interesting findings from a scan: the gating
 * module, highest-risk module, and longest lead time module. Shown between
 * the SystemBlueprint and ExecutiveDashboard on the Concept page. Uses
 * stagger animation on first reveal to build excitement.
 *
 * @related
 * - concept-view.tsx (parent)
 * - xray-schema.ts (XRaySpec, ModuleSpec)
 */

"use client"

import React, { useMemo, useRef, useEffect } from "react"

import { motion, type Variants } from "framer-motion"

import { Card, CardContent } from "@/components/ui/card"
import {
  ShieldAlert,
  Clock,
  Target,
} from "lucide-react"
import { cn } from "@/lib/utils"

import { ForgeInfoTip, FORGE_EXPLANATIONS } from "./forge-hover-explanations"
import type { XRaySpec, ModuleSpec } from "../services/xray-schema"

// ─── Animation Variants ──────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.3,
    },
  },
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24,
    },
  },
}

// ─── Types ───────────────────────────────────────────────────────────

interface InsightCard {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  detail: string
  accentColor: string
}

// ─── Props ───────────────────────────────────────────────────────────

interface QuickInsightsProps {
  /** The full X-Ray spec */
  spec: XRaySpec
  /** Whether to animate the cards on first appearance */
  justScanned?: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Finds the module with the most failure modes (highest risk).
 *
 * @param modules - Array of modules to evaluate
 * @returns The module with the most failure modes, or undefined
 */
function findHighestRiskModule(modules: ModuleSpec[]): ModuleSpec | undefined {
  if (modules.length === 0) return undefined
  return modules.reduce((max, m) =>
    m.detail.commonFailureModes.length > max.detail.commonFailureModes.length ? m : max,
  )
}

/**
 * Finds the module with the longest lead time.
 *
 * @param modules - Array of modules to evaluate
 * @returns The module with the longest lead time, or undefined
 */
function findLongestLeadModule(modules: ModuleSpec[]): ModuleSpec | undefined {
  if (modules.length === 0) return undefined
  return modules.reduce((max, m) =>
    m.requirements.leadWeeks > max.requirements.leadWeeks ? m : max,
  )
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * QuickInsights — Three highlight cards showing key scan findings.
 *
 * @description Surfaces the gating module, highest-risk module, and
 * longest lead time module as animated insight cards. Gives users
 * immediate actionable information without navigating to the Dossier.
 *
 * @param props.spec - The X-Ray spec with module data
 * @param props.justScanned - Whether to play stagger animation
 */
export function QuickInsights({
  spec,
  justScanned = false,
}: QuickInsightsProps): React.ReactNode {
  const hasAnimatedRef = useRef(false)
  const shouldAnimate = justScanned && !hasAnimatedRef.current

  useEffect(() => {
    if (justScanned && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true
    }
  }, [justScanned])

  const modules = spec.modules

  const insights = useMemo((): InsightCard[] => {
    const gatingModule = modules.find((m) => m.isGatingModule)
    const highestRisk = findHighestRiskModule(modules)
    const longestLead = findLongestLeadModule(modules)

    const cards: InsightCard[] = []

    if (gatingModule) {
      cards.push({
        icon: Target,
        label: "Gating Module",
        value: gatingModule.name,
        detail: "This module defines your entire design — specify it first.",
        accentColor: "bg-international-orange/10 text-international-orange",
      })
    }

    if (highestRisk) {
      cards.push({
        icon: ShieldAlert,
        label: "Highest Risk",
        value: highestRisk.name,
        detail: `${highestRisk.detail.commonFailureModes.length} failure modes identified — review early.`,
        accentColor: "bg-status-warning-light text-status-warning-dark",
      })
    }

    if (longestLead) {
      cards.push({
        icon: Clock,
        label: "Longest Lead Time",
        value: longestLead.name,
        detail: `${longestLead.requirements.leadWeeks} weeks — order components early.`,
        accentColor: "bg-status-info-light text-status-info-dark",
      })
    }

    return cards
  }, [modules])

  if (insights.length === 0) return null

  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="pt-6 pb-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-1 h-7 bg-international-orange rounded-full" />
          <div>
            <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">
              Key Findings
            </h3>
            <p className="text-xs text-muted-foreground">
              The most important things to know about your product — hover any card to learn more
            </p>
          </div>
        </div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
          variants={shouldAnimate ? containerVariants : undefined}
          initial={shouldAnimate ? "hidden" : undefined}
          animate={shouldAnimate ? "visible" : undefined}
        >
          {insights.map((insight) => {
            const Icon = insight.icon
            return (
              <motion.div
                key={insight.label}
                variants={shouldAnimate ? cardVariants : undefined}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border p-4",
                  "bg-background",
                )}
              >
                <div className="flex items-center gap-2">
                  <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", insight.accentColor)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {insight.label}
                  </span>
                  <ForgeInfoTip
                    text={
                      insight.label === "Gating Module"
                        ? FORGE_EXPLANATIONS.gatingModule.description
                        : insight.label === "Highest Risk"
                          ? FORGE_EXPLANATIONS.riskIndicators.description
                          : FORGE_EXPLANATIONS.leadTime.description
                    }
                  />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {insight.value}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {insight.detail}
                </p>
              </motion.div>
            )
          })}
        </motion.div>
      </CardContent>
    </Card>
  )
}
