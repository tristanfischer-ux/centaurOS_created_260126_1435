"use client"

import { ArrowRight, Clock, Banknote, TrendingDown, Zap, Check } from "lucide-react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  AnimatedSection,
  AnimatedCard,
  StaggerContainer,
  buttonHover,
  buttonTap,
} from "@/components/marketing/animations"

/**
 * The core pain stats from traditional hardware development.
 *
 * INTENT: These numbers make the problem viscerally concrete. Pulled from
 * the founder's voice notes and industry benchmarks.
 */
const PAIN_STATS = [
  {
    icon: Clock,
    stat: "12–18 months",
    label: "To first prototype",
    detail: "Leases, equipment, hiring — all before a single part is made",
  },
  {
    icon: Banknote,
    stat: "£50–100k",
    label: "Monthly burn rate",
    detail: "Salaries for staff you hired in advance, waiting for work",
  },
  {
    icon: TrendingDown,
    stat: "30–40%",
    label: "Equity given away",
    detail: "Raising millions just to fund infrastructure, not innovation",
  },
] as const

/**
 * The Fractional Forge bridge — how we close the gap.
 *
 * INTENT: Maps each pain point to its Cloud Factory equivalent, showing
 * that hardware development can be as lightweight as software.
 */
const BRIDGE_ITEMS = [
  {
    pain: "Lease a factory, buy equipment",
    solution: "Use cloud factories with spare capacity",
  },
  {
    pain: "Hire full-time teams in advance",
    solution: "Fractional experts on demand",
  },
  {
    pain: "18-month timelines",
    solution: "12-week sprints",
  },
  {
    pain: "Raise millions before building",
    solution: "Start for £0. Keep 100% equity.",
  },
] as const

/**
 * SoftwareVsHardwareSection — Reframed as "The Mismatch."
 *
 * INTENT: The founder's core insight is that CAD designs move at software
 * speed while physical infrastructure moves at physical speed. This creates
 * a constant mismatch where ideas outrun execution. By the time your factory
 * is ready, your designs have moved on — forcing you to either ship an
 * outdated product or delay further.
 *
 * DECISION: Tightened from a 6-row comparison table to a focused 3-point
 * narrative with the AWS analogy. The old version was thorough but too long
 * for a first-time visitor to absorb.
 */
export function SoftwareVsHardwareSection() {
  return (
    <section
      id="the-gap"
      className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header — The Mismatch */}
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-16">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            The Problem
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Your Designs Move at{" "}
            <span className="text-status-success">Software Speed.</span>
            <br />
            Your Factory Moves at{" "}
            <span className="text-destructive">Physical Speed.</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-3xl mx-auto leading-relaxed">
            CAD designs iterate in hours. But leasing premises, buying equipment,
            and hiring engineers takes months. By the time your physical infrastructure
            catches up, your ideas have moved on — forcing you to ship an outdated
            product or delay again. This mismatch between thinking speed and building
            speed is why hardware companies burn through cash, time, and equity before
            they ever ship.
          </p>
        </AnimatedSection>

        {/* Pain Stats */}
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 mb-10 sm:mb-12 md:mb-16">
          {PAIN_STATS.map((item) => {
            const Icon = item.icon
            return (
              <AnimatedCard
                key={item.label}
                className="text-center p-4 sm:p-6 rounded-xl border bg-card"
              >
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-destructive/10 mb-3">
                  <Icon className="h-5 w-5 text-destructive" />
                </div>
                <p className="text-lg sm:text-2xl md:text-3xl font-black text-destructive mb-1">
                  {item.stat}
                </p>
                <p className="text-xs sm:text-sm font-mono uppercase tracking-wider text-muted-foreground mb-1">
                  {item.label}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.detail}
                </p>
              </AnimatedCard>
            )
          })}
        </StaggerContainer>

        {/* The Bridge — Fractional Forge Way */}
        <AnimatedSection>
          <div className="relative border-2 border-international-orange rounded-xl overflow-hidden bg-card">
            <div className="bg-international-orange/5 px-5 sm:px-8 py-5 sm:py-6 text-center border-b border-international-orange/20">
              <div className="inline-flex items-center gap-2 mb-2">
                <Zap className="h-5 w-5 text-international-orange" />
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-international-orange">
                  The Fractional Forge Way
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-foreground leading-tight">
                Move as Fast as{" "}
                <span className="text-international-orange">Your Ideas.</span>
              </h3>
            </div>

            <div className="p-5 sm:p-8">
              <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 mb-6 sm:mb-8">
                {BRIDGE_ITEMS.map((item) => (
                  <AnimatedCard
                    key={item.pain}
                    className="rounded-lg border bg-muted/30 p-4 flex flex-col"
                  >
                    <p className="text-xs text-destructive line-through mb-2">
                      {item.pain}
                    </p>
                    <p className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Check className="h-4 w-4 text-status-success flex-shrink-0" />
                      {item.solution}
                    </p>
                  </AnimatedCard>
                ))}
              </StaggerContainer>

              <div className="text-center">
                <motion.div
                  whileHover={buttonHover}
                  whileTap={buttonTap}
                  className="inline-block"
                >
                  <Link
                    href="#ecosystem"
                    className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-3.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px]"
                  >
                    See How It Works
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </motion.div>
              </div>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  )
}
