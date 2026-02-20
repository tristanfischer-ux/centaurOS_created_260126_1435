"use client"

import Link from "next/link"
import {
  ArrowRight,
  Briefcase,
  Brain,
  Factory,
  Workflow,
} from "lucide-react"
import { motion } from "framer-motion"
import {
  AnimatedSection,
  AnimatedCard,
  StaggerContainer,
  buttonHover,
  buttonTap,
} from "@/components/marketing/animations"

/**
 * The three pillars of the Cloud Factory ecosystem.
 *
 * INTENT: Each pillar maps to one of the three components described in the
 * founder's strategic vision: fractional experts, human-in-the-loop AI
 * execution, and spare factory capacity. ForgeOS ties them together.
 */
const PILLARS = [
  {
    icon: Briefcase,
    label: "Expert Marketplace",
    headline: "Senior Expertise, On Demand",
    description:
      "Access fractional executives — seasoned engineers, marketers, and operators with decades of experience — through a curated marketplace. No full-time hires. No six-figure salaries before your first prototype.",
    highlights: [
      "Vetted professionals with 20+ years of experience",
      "Engage by the hour, sprint, or retainer",
      "Specialists in mechanical, electrical, manufacturing, and more",
    ],
  },
  {
    icon: Brain,
    label: "Human-Verified AI Execution",
    headline: "AI Speed. Human Judgement.",
    description:
      "Ambitious apprentices — digital natives fresh from university — execute tasks using AI tools at remarkable speed. Senior experts review and verify every output. The result: speed without shortcuts.",
    highlights: [
      "Senior directs. Junior executes with AI. Senior verifies.",
      "Every output grounded in real-world experience",
      "10x throughput at a fraction of the cost",
    ],
  },
  {
    icon: Factory,
    label: "Cloud Manufacturing",
    headline: "Factories Without the Factory",
    description:
      "Across the UK and Europe, factories have spare capacity waiting to be filled. ForgeOS identifies the right facilities, generates automated RFQ packs, and gets your products built — without you leasing a single square metre.",
    highlights: [
      "78+ manufacturing techniques on one platform",
      "Automated RFQ generation from your designs",
      "Real factories, real equipment, zero overhead",
    ],
  },
] as const

/**
 * CloudFactorySection — The unified solution presentation.
 *
 * INTENT: Replaces the scattered Roles + Guild + parts of How It Works
 * with a single, clear three-pillar frame. ForgeOS is positioned as the
 * operating system that coordinates all three pillars.
 *
 * DECISION: Using a unified section rather than separate ones because the
 * founder's voice notes describe these as an integrated ecosystem, not
 * independent features. Visitors need to see how they connect.
 */
export function CloudFactorySection() {
  return (
    <section
      id="ecosystem"
      className="py-12 sm:py-16 md:py-28 bg-background border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-20">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            The Cloud Factory Ecosystem
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            You Wouldn&apos;t Build Server Racks
            <br className="hidden sm:block" />{" "}
            to Launch an App.{" "}
            <br className="hidden sm:block" />
            <span className="text-international-orange">
              So Why Build a Factory?
            </span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Modern software companies use AWS instead of buying servers.
            Fractional Forge gives hardware companies the same model —
            expert teams, AI-enabled execution, and manufacturing capacity,
            all on demand.
          </p>
        </AnimatedSection>

        {/* Three Pillars */}
        <StaggerContainer className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8 mb-10 sm:mb-12 md:mb-16">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon
            return (
              <AnimatedCard
                key={pillar.label}
                className="border bg-card rounded-xl p-5 sm:p-6 md:p-8 flex flex-col"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-international-orange/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-international-orange" />
                  </div>
                  <span className="text-xs font-mono font-bold uppercase tracking-widest text-international-orange">
                    {pillar.label}
                  </span>
                </div>

                <h3 className="text-lg sm:text-xl font-black mb-2 sm:mb-3 text-foreground leading-tight">
                  {pillar.headline}
                </h3>

                <p className="text-muted-foreground text-sm leading-relaxed mb-4 sm:mb-6">
                  {pillar.description}
                </p>

                <ul className="space-y-2.5 flex-1">
                  {pillar.highlights.map((highlight) => (
                    <li
                      key={highlight}
                      className="flex items-start gap-2.5 text-sm text-muted-foreground"
                    >
                      <div className="mt-1 h-1.5 w-1.5 rounded-full bg-international-orange flex-shrink-0" />
                      {highlight}
                    </li>
                  ))}
                </ul>
              </AnimatedCard>
            )
          })}
        </StaggerContainer>

        {/* ForgeOS as the coordinator */}
        <AnimatedSection>
          <div className="relative border-2 border-international-orange rounded-xl overflow-hidden bg-card">
            <div className="bg-international-orange/5 px-5 sm:px-8 py-5 sm:py-6 text-center border-b border-international-orange/20">
              <div className="inline-flex items-center gap-2 mb-2">
                <Workflow className="h-5 w-5 text-international-orange" />
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-international-orange">
                  Powered by ForgeOS
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-foreground leading-tight">
                One Operating System.{" "}
                <span className="text-international-orange">
                  Everything Coordinated.
                </span>
              </h3>
            </div>
            <div className="p-5 sm:p-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-center">
                {[
                  {
                    stat: "Objectives & Tasks",
                    description:
                      "Everyone knows what they're doing and where the blockages are",
                  },
                  {
                    stat: "Guided Manufacturing",
                    description:
                      "Understand the systems required to make your product before you commit",
                  },
                  {
                    stat: "Automated RFQs",
                    description:
                      "Full request-for-quote packs sent to factories that match your needs",
                  },
                ].map((item) => (
                  <div key={item.stat} className="p-3 sm:p-4">
                    <p className="text-sm sm:text-base font-bold text-foreground mb-1">
                      {item.stat}
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 sm:mt-8 text-center">
                <motion.div
                  whileHover={buttonHover}
                  whileTap={buttonTap}
                  className="inline-block"
                >
                  <Link
                    href="/join"
                    className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-3.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px]"
                  >
                    Join the Forge
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
