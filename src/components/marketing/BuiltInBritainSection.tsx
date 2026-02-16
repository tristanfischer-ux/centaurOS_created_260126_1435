"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Crown, Wrench, GraduationCap, Factory } from "lucide-react"
import { motion } from "framer-motion"
import {
  AnimatedSection,
  AnimatedCard,
  StaggerContainer,
  buttonHover,
  buttonTap,
} from "@/components/marketing/animations"

/**
 * British identity pillars — the four aspects of the British focus.
 *
 * @description Each pillar represents a specific commitment to British
 * manufacturing, talent, and ambition.
 */
const BRITISH_PILLARS = [
  {
    icon: Factory,
    title: "British Factories",
    description:
      "Our manufacturing network starts in the UK. British factories with real capacity, real capabilities, and real people behind the machines.",
  },
  {
    icon: Crown,
    title: "British Executives",
    description:
      "Seasoned professionals who've built careers in British engineering and manufacturing. Their expertise stays in Britain and grows the ecosystem.",
  },
  {
    icon: GraduationCap,
    title: "British Apprentices",
    description:
      "The next generation of British engineers, designers, and entrepreneurs. Trained on real projects, mentored by real experts, building real products.",
  },
  {
    icon: Wrench,
    title: "British Engineering Heritage",
    description:
      "From Brunel to Rolls-Royce, Britain has always built things that matter. Fractional Forge exists to make sure that tradition thrives in the 21st century.",
  },
] as const

/**
 * BuiltInBritainSection — The unapologetically British identity.
 *
 * @description This section makes a bold, proud statement about British
 * manufacturing and engineering. It's not apologetic or hedging — it's
 * a declaration that Fractional Forge is British-focused by design.
 *
 * @component
 */
export function BuiltInBritainSection() {
  return (
    <section
      id="british"
      className="py-12 sm:py-16 md:py-28 bg-background border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 md:gap-16 items-center">
          {/* Left: Content */}
          <AnimatedSection>
            <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
              Proudly British
            </span>
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
              Unapologetically{" "}
              <span className="text-international-orange">British.</span>
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base md:text-lg leading-relaxed mb-4 sm:mb-6">
              We believe in British manufacturing, British engineering talent,
              and British apprentices. Fractional Forge exists to make it easier
              to build physical products in Britain &mdash; with British executives,
              British factories, and the next generation of British engineers.
            </p>
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed mb-6 sm:mb-8">
              Globally ambitious, locally rooted. Our manufacturing network starts
              in the UK because that&apos;s where we believe the renaissance begins.
              Britain has always been a nation of builders, makers, and engineers.
              We&apos;re here to make sure that never stops.
            </p>

            {/* Pillar cards */}
            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              {BRITISH_PILLARS.map((pillar) => {
                const Icon = pillar.icon
                return (
                  <AnimatedCard
                    key={pillar.title}
                    className="flex items-start gap-3 p-3 sm:p-4 rounded-lg border bg-card"
                  >
                    <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-international-orange/10 flex items-center justify-center mt-0.5">
                      <Icon className="h-4 w-4 text-international-orange" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground mb-1">
                        {pillar.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                        {pillar.description}
                      </p>
                    </div>
                  </AnimatedCard>
                )
              })}
            </StaggerContainer>

            {/* CTA */}
            <div className="mt-6 sm:mt-8">
              <motion.div
                whileHover={buttonHover}
                whileTap={buttonTap}
                className="inline-block"
              >
                <Link
                  href="/join/founder"
                  className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-3.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px]"
                >
                  Join the British Manufacturing Renaissance
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.div>
            </div>
          </AnimatedSection>

          {/* Right: Image */}
          <AnimatedSection delay={0.15}>
            <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border shadow-lg">
              <Image
                src="/images/marketing/built-in-britain.png"
                alt="British engineering heritage meets modern manufacturing — from Brunel to CNC, Britain builds things that matter"
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 600px"
                loading="lazy"
              />
              {/* Overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-foreground/80 to-transparent p-4 sm:p-6">
                <p className="text-background/90 text-sm sm:text-base font-bold">
                  Forged in Britain. Built for the World.
                </p>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </div>
    </section>
  )
}
