"use client"

import Image from "next/image"
import { Building2, Monitor, Users } from "lucide-react"
import {
  AnimatedSection,
  AnimatedCard,
  StaggerContainer,
} from "@/components/marketing/animations"

/**
 * The three pillars of the Fractional Forge ecosystem.
 *
 * @description The trinity that makes fractional hardware development work:
 * 1. The Firm — legal entity, contracts, liability
 * 2. The Operating System — ForgeOS coordinates everything
 * 3. The Guild — human community, mentoring, knowledge
 */
const PILLARS = [
  {
    icon: Building2,
    label: "The Entity",
    title: "The Firm.",
    description:
      "Fractional Forge Ltd is the real-world entity that holds contracts, manages liability, and provides the legal fortress for the work to happen. You build; we handle the rest.",
    image: "/images/marketing/ecosystem-firm.png",
  },
  {
    icon: Monitor,
    label: "The System",
    title: "The Operating System.",
    description:
      "ForgeOS coordinates founders, executives, and apprentices. It manages strategy, objectives, tasks, suppliers, and deliverables — the glue that makes fractional work.",
    image: "/images/marketing/ecosystem-os.png",
  },
  {
    icon: Users,
    label: "The Community",
    title: "The Guild.",
    description:
      "Virtual connectivity, physical reality. The Guild is a network of collaborative workshops and digital spaces where knowledge scales as fast as the work.",
    image: "/images/marketing/ecosystem-guild.png",
  },
] as const

/**
 * EcosystemSection — The three pillars of Fractional Forge.
 *
 * @description Explains HOW fractional hardware development works at scale:
 * a legal entity to hold contracts, an operating system to coordinate,
 * and a human community to connect everyone.
 *
 * Modernized to use light-first design with semantic color tokens.
 *
 * @component
 */
export function EcosystemSection() {
  return (
    <section className="py-12 sm:py-16 md:py-28 bg-background border-t border-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <AnimatedSection className="mb-10 sm:mb-12 md:mb-20">
          <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            The Infrastructure
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Three Pillars.
            <br className="hidden sm:block" />{" "}
            <span className="text-electric-blue">One System.</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl leading-relaxed">
            Making hardware as fast as software requires more than tools. It
            requires an entity to hold the contracts, a system to coordinate the
            work, and a community to connect the people.
          </p>
        </AnimatedSection>

        {/* Pillar Cards */}
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon
            return (
              <AnimatedCard
                key={pillar.title}
                className="border bg-card rounded-xl overflow-hidden flex flex-col"
              >
                {/* Image */}
                <div className="relative h-44 sm:h-52 bg-muted">
                  <Image
                    src={pillar.image}
                    alt={pillar.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 400px"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
                  {/* Label overlay */}
                  <div className="absolute bottom-3 left-4 flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-electric-blue-light flex items-center justify-center">
                      <Icon className="h-4 w-4 text-electric-blue" />
                    </div>
                    <span className="text-xs font-mono font-bold uppercase tracking-widest text-electric-blue">
                      {pillar.label}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 sm:p-6 md:p-8 flex-1 flex flex-col">
                  <h3 className="text-lg sm:text-xl font-black mb-2 sm:mb-3 text-foreground">
                    {pillar.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                    {pillar.description}
                  </p>
                </div>
              </AnimatedCard>
            )
          })}
        </StaggerContainer>
      </div>
    </section>
  )
}
