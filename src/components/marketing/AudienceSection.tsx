"use client"

import Link from "next/link"
import {
  Rocket,
  TrendingUp,
  GraduationCap,
  Factory,
  Briefcase,
  Lightbulb,
  ArrowRight,
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
 * Target audience segments for the multi-sided marketplace.
 *
 * INTENT: The founder's voice notes identify five distinct audiences, each
 * with different motivations. The current site only speaks to three (Founder,
 * Executive, Apprentice) and buries the Factory pitch at position 6/9.
 * This section puts all audiences on equal footing with tailored value props.
 */
const AUDIENCES = [
  // ── Top row: the three hands-on roles ──
  {
    id: "founders",
    icon: Rocket,
    title: "Founders & Startups",
    hook: "Stop burning cash. Start shipping.",
    description:
      "Move from idea to validated prototype in 12 weeks. Access expert teams, AI-enabled execution, and manufacturing capacity without the overhead of full-time hires or factory leases.",
    cta: "Start Building",
    href: "/join?role=founder",
    highlight: true,
  },
  {
    id: "executives",
    icon: Briefcase,
    title: "Fractional Executives",
    hook: "Monetize decades of expertise.",
    description:
      "Whether you're looking for a change from corporate life or want to have a more interesting career than any single company could offer — deploy your skills across multiple ventures and mentor the next generation.",
    cta: "Join as Expert",
    href: "/join?role=executive",
    highlight: false,
  },
  {
    id: "apprentices",
    icon: Lightbulb,
    title: "Apprentices",
    hook: "Learn by doing. Build real products.",
    description:
      "Skip the unpaid internship loop. Work alongside experienced executives on live hardware projects, build a portfolio that matters, and get paid while you learn the skills that actually get you hired.",
    cta: "Start Apprenticeship",
    href: "/join?role=apprentice",
    highlight: false,
  },
  // ── Bottom row: the ecosystem enablers ──
  {
    id: "vcs",
    icon: TrendingUp,
    title: "Venture Capitalists",
    hook: "Deploy capital further. Get results faster.",
    description:
      "Your portfolio companies can spread capital across more experiments with faster feedback loops. Lower burn rates mean longer runways and more shots on goal — without sacrificing execution quality.",
    cta: "Partner With Us",
    href: "/join",
    highlight: false,
  },
  {
    id: "universities",
    icon: GraduationCap,
    title: "Universities",
    hook: "Turn research into products without the overhead.",
    description:
      "Empower professors and student spin-outs to bring ideas to life. No need for full-scale commercial infrastructure — ForgeOS provides the team, the tools, and the factory access.",
    cta: "Explore for Universities",
    href: "/join",
    highlight: false,
  },
  {
    id: "factories",
    icon: Factory,
    title: "Factory Owners",
    hook: "Fill spare capacity. Generate new revenue.",
    description:
      "List your available capacity on the marketplace. Put your in-house experts on the platform as fractional executives. Every company they advise is a potential manufacturing order for your factory.",
    cta: "List Your Factory",
    href: "/join?role=executive",
    highlight: false,
  },
] as const

/**
 * AudienceSection — Who the platform is built for.
 *
 * DECISION: Using compact cards in a grid rather than full-page sections
 * per audience. The current site dedicates a full section to Roles and another
 * to Factory Partners, which buries key audiences and makes the page too long.
 * This approach gives each audience equal visibility in a scannable format.
 */
export function AudienceSection() {
  return (
    <section
      id="who-its-for"
      className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-16">
          <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            Built for the Entire Hardware Ecosystem
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Everyone Has a Seat{" "}
            <span className="text-international-orange">at the Forge.</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Whether you&apos;re launching a product, funding one, researching one,
            manufacturing one, or advising one — Fractional Forge is built for you.
          </p>
        </AnimatedSection>

        {/* Audience Cards */}
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {AUDIENCES.map((audience) => {
            const Icon = audience.icon
            return (
              <AnimatedCard
                key={audience.id}
                className={`border bg-card rounded-xl p-5 sm:p-6 flex flex-col ${
                  audience.highlight
                    ? "border-international-orange border-2 relative sm:col-span-2 lg:col-span-1"
                    : ""
                }`}
              >
                {audience.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-international-orange text-white text-xs font-mono font-bold tracking-widest uppercase px-3 py-1 rounded-full whitespace-nowrap">
                    Primary Audience
                  </span>
                )}

                <div className="flex items-center gap-2.5 mb-3">
                  <div className="h-9 w-9 rounded-lg bg-international-orange/10 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-international-orange" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-foreground">
                    {audience.title}
                  </h3>
                </div>

                <p className="text-base sm:text-lg font-black text-foreground mb-2 leading-tight">
                  {audience.hook}
                </p>

                <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">
                  {audience.description}
                </p>

                <motion.div whileHover={buttonHover} whileTap={buttonTap}>
                  <Link
                    href={audience.href}
                    className={`flex items-center justify-center gap-2 py-2.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[44px] ${
                      audience.highlight
                        ? "bg-international-orange hover:bg-international-orange-hover text-white"
                        : "bg-muted hover:bg-secondary text-foreground"
                    }`}
                  >
                    {audience.cta}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </motion.div>
              </AnimatedCard>
            )
          })}
        </StaggerContainer>
      </div>
    </section>
  )
}
