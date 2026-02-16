"use client"

import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  Factory,
  Users,
  TrendingUp,
  Network,
  Briefcase,
  Handshake,
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
 * Value propositions for factory owners and manufacturing partners.
 *
 * @description Each benefit speaks directly to what factory owners care about:
 * filling capacity, winning new customers, leveraging their network, and
 * getting their employees more exposure.
 */
const FACTORY_BENEFITS = [
  {
    icon: TrendingUp,
    title: "Fill Spare Capacity",
    description:
      "List your available manufacturing capacity on the marketplace. Startups and hardware companies are actively looking for British factories that can deliver. Turn idle machines into revenue.",
  },
  {
    icon: Briefcase,
    title: "Your Employees Become Fractional Executives",
    description:
      "Let your best people work part-time as fractional executives on the platform. They'll be exposed to companies who need manufacturing expertise — and naturally guide that work back to your factory.",
  },
  {
    icon: Network,
    title: "Recommend Your Supply Chain",
    description:
      "You've worked with trusted suppliers for years. Recommend them as fractional executives in other parts of the supply chain. They help companies succeed — and you strengthen the network you already know works.",
  },
  {
    icon: Handshake,
    title: "The Network Effect",
    description:
      "Every company your people help is a potential customer. Every project they advise on is a potential manufacturing order. The more you engage, the more business flows back to you.",
  },
] as const

/**
 * FactoryPartnerSection — Speaking directly to factory owners.
 *
 * @description This section addresses a completely different audience from the
 * rest of the page: existing manufacturing facilities with spare capacity.
 * The pitch is simple — engage with the platform and business flows to you.
 *
 * @component
 */
export function FactoryPartnerSection() {
  return (
    <section
      id="factories"
      className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 md:gap-16 items-center">
          {/* Left: Image */}
          <AnimatedSection>
            <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border shadow-lg">
              <Image
                src="/images/marketing/factory-partner.png"
                alt="A modern British factory floor with CNC machines — ready to partner with hardware startups through Fractional Forge"
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 600px"
                loading="lazy"
              />
              {/* Overlay with stat */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-foreground/80 to-transparent p-4 sm:p-6">
                <p className="text-background/90 text-sm font-medium">
                  78+ manufacturing techniques. One platform. Your factory.
                </p>
              </div>
            </div>
          </AnimatedSection>

          {/* Right: Content */}
          <AnimatedSection delay={0.15}>
            <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
              For Factories &amp; Manufacturers
            </span>
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
              Got Spare Capacity?
              <br className="hidden sm:block" />{" "}
              <span className="text-international-orange">Fill It.</span>
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base md:text-lg leading-relaxed mb-6 sm:mb-8">
              If you have existing manufacturing capacity and are looking for
              companies to use it, this is the place for you. Join the marketplace,
              put your expertise to work, and let the network bring business
              to your door.
            </p>

            {/* Benefits */}
            <StaggerContainer className="space-y-4 sm:space-y-5">
              {FACTORY_BENEFITS.map((benefit) => {
                const Icon = benefit.icon
                return (
                  <AnimatedCard
                    key={benefit.title}
                    className="flex items-start gap-3 p-3 sm:p-4 rounded-lg border bg-card"
                  >
                    <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-international-orange/10 flex items-center justify-center mt-0.5">
                      <Icon className="h-4 w-4 text-international-orange" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground mb-1">
                        {benefit.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                        {benefit.description}
                      </p>
                    </div>
                  </AnimatedCard>
                )
              })}
            </StaggerContainer>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 mt-6 sm:mt-8">
              <motion.div whileHover={buttonHover} whileTap={buttonTap}>
                <Link
                  href="/join/executive"
                  className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-6 py-3 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px]"
                >
                  Partner With Us
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.div>
              <Link
                href="/#roles"
                className="inline-flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground text-xs font-mono tracking-wider uppercase transition-colors min-h-[48px]"
              >
                Explore All Roles
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </AnimatedSection>
        </div>
      </div>
    </section>
  )
}
