"use client"

import {
  Waypoints,
  Target,
  Flame,
  Store,
  Users,
  CalendarDays,
} from "lucide-react"
import {
  AnimatedSection,
  AnimatedCard,
  StaggerContainer,
} from "@/components/marketing/animations"

/**
 * Platform features — what users actually get inside ForgeOS.
 *
 * @description Focuses on human-centric capabilities, NOT AI tools.
 * Each feature maps to a real, functional part of the platform.
 * The emphasis is on coordination, execution, and human collaboration.
 */
const PLATFORM_FEATURES = [
  {
    icon: Waypoints,
    title: "Strategy & Direction",
    description:
      "Define your company purpose, set strategic pillars, and cascade them into measurable objectives. Everyone sees the north star.",
    forRole: "Founders",
  },
  {
    icon: Target,
    title: "Objectives & Tasks",
    description:
      "Break strategy into milestones and daily tasks. Track progress, assign work, and keep your fractional team aligned — without the overhead.",
    forRole: "Everyone",
  },
  {
    icon: Flame,
    title: "The Forge",
    description:
      "Turn product ideas into buildable engineering dossiers. From concept sketches to manufacturing-ready specifications — all in one place.",
    forRole: "Founders",
  },
  {
    icon: Store,
    title: "Marketplace",
    description:
      "Find fractional executives, manufacturing partners, and specialist suppliers. Browse talent, services, and products — all vetted and ready.",
    forRole: "Everyone",
  },
  {
    icon: Users,
    title: "Team Coordination",
    description:
      "Manage your fractional team, retainer agreements, and deliverables. The operating system that makes fractional work actually work.",
    forRole: "Founders",
  },
  {
    icon: CalendarDays,
    title: "Daily Focus",
    description:
      "Start each day knowing what matters. Your personalized view surfaces priorities, at-risk objectives, and yesterday's wins.",
    forRole: "Everyone",
  },
] as const

/**
 * PlatformShowcaseSection — What you actually get inside ForgeOS.
 *
 * @description Visual tour of the platform's real capabilities.
 * No screenshots — clean icons + descriptions to stay aspirational.
 * Deliberately avoids AI messaging per product direction.
 *
 * @component
 */
export function PlatformShowcaseSection() {
  return (
    <section className="py-12 sm:py-16 md:py-28 bg-background border-t border-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-20">
          <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            The Operating System
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Everything You Need to
            <br className="hidden sm:block" />{" "}
            <span className="text-electric-blue">Ship Hardware. Fast.</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            ForgeOS is the operating system that coordinates your fractional team,
            tracks your strategy, manages your suppliers, and keeps everyone
            building in the same direction.
          </p>
        </AnimatedSection>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {PLATFORM_FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <AnimatedCard
                key={feature.title}
                className="border bg-card rounded-xl p-5 sm:p-6 md:p-8 flex flex-col"
              >
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-electric-blue-light flex items-center justify-center">
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-electric-blue" />
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    {feature.forRole}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold mb-2 text-foreground">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                  {feature.description}
                </p>
              </AnimatedCard>
            )
          })}
        </StaggerContainer>
      </div>
    </section>
  )
}
