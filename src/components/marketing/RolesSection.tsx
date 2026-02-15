"use client"

import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Rocket, Briefcase, GraduationCap, Check } from "lucide-react"
import { motion } from "framer-motion"
import {
  AnimatedSection,
  AnimatedCard,
  StaggerContainer,
  buttonHover,
  buttonTap,
} from "@/components/marketing/animations"

/**
 * Role configuration for the three paths into Fractional Forge.
 *
 * @description Each role has distinct messaging, benefits, and visual identity
 * that maps to the in-app role hierarchy (Founder > Executive > Apprentice).
 * The orange color hierarchy mirrors the UserAvatar role-based color system.
 */
const ROLES = [
  {
    id: "founder",
    icon: Rocket,
    label: "Founder",
    headline: "Your Vision. Our Army.",
    tagline:
      "Start with an idea. Launch with a fractional team. Keep your equity.",
    benefits: [
      "Fractional CTO + engineering team on demand",
      "Global manufacturing network at your fingertips",
      "Strategy, objectives, and task management built in",
      "Full IP ownership — no equity given up",
    ],
    cta: "Start as Founder",
    href: "/join/founder",
    image: "/images/marketing/role-founder.png",
    accentBg: "bg-orange-100",
    accentText: "text-international-orange",
    accentBorder: "border-international-orange",
    accentIcon: "bg-international-orange/10",
  },
  {
    id: "executive",
    icon: Briefcase,
    label: "Executive",
    headline: "Your Expertise. Amplified.",
    tagline:
      "Deploy your skills across multiple ventures. Build a portfolio of companies you believe in.",
    benefits: [
      "Work with multiple startups simultaneously",
      "Set your own rates and availability",
      "Mentor apprentices and shape the next generation",
      "Equity opportunities as relationships develop",
    ],
    cta: "Join as Executive",
    href: "/join/executive",
    image: "/images/marketing/role-executive.png",
    accentBg: "bg-orange-50",
    accentText: "text-international-orange",
    accentBorder: "border-international-orange/60",
    accentIcon: "bg-international-orange/5",
  },
  {
    id: "apprentice",
    icon: GraduationCap,
    label: "Apprentice",
    headline: "You're Not Junior. You're a Founder-in-Training.",
    tagline:
      "Ship real hardware in your first month. Learn from executives who've done it before.",
    benefits: [
      "Direct mentorship from fractional executives",
      "Structured apprenticeship with real projects",
      "Join the Guild — events, workshops, community",
      "Fast-track to the Founder track",
    ],
    cta: "Enter the Guild",
    href: "/join/apprentice",
    image: "/images/marketing/role-apprentice.png",
    accentBg: "bg-muted",
    accentText: "text-international-orange",
    accentBorder: "border-muted-foreground/30",
    accentIcon: "bg-muted",
  },
] as const

/**
 * RolesSection — The three paths into Fractional Forge.
 *
 * @description The single most important section on the landing page.
 * Presents Founder, Executive, and Apprentice as distinct paths with
 * unique value propositions, benefits, and signup CTAs.
 *
 * Visual hierarchy uses the orange color system:
 * - Founder: Bold orange (most prominent)
 * - Executive: Light orange (secondary)
 * - Apprentice: Neutral with orange accents
 *
 * @component
 */
export function RolesSection() {
  return (
    <section
      id="roles"
      className="py-12 sm:py-16 md:py-28 bg-background border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-20">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            Choose Your Path
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Three Ways to Build
            <br className="hidden sm:block" />{" "}
            <span className="text-international-orange">the Future of Manufacturing.</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Whether you&apos;re launching a hardware company, deploying your expertise, or
            starting your career — there&apos;s a seat at the forge for you.
          </p>
        </AnimatedSection>

        {/* Role Cards */}
        <StaggerContainer className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
          {ROLES.map((role) => {
            const Icon = role.icon
            return (
              <AnimatedCard
                key={role.id}
                className={`border bg-card rounded-xl overflow-hidden flex flex-col ${
                  role.id === "founder" ? "border-international-orange border-2 relative" : ""
                }`}
              >
                {/* Most Popular badge for Founder */}
                {role.id === "founder" && (
                  <span className="absolute top-0 left-0 right-0 bg-international-orange text-white text-[10px] sm:text-xs font-mono font-bold tracking-widest uppercase px-4 py-1.5 text-center z-10">
                    Most Popular
                  </span>
                )}

                {/* Image */}
                <div className={`relative h-44 sm:h-52 ${role.accentBg} ${role.id === "founder" ? "mt-7" : ""}`}>
                  <Image
                    src={role.image}
                    alt={`${role.label} — ${role.tagline}`}
                    fill
                    className="object-contain object-center p-4"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
                    loading="lazy"
                  />
                </div>

                {/* Content */}
                <div className="p-5 sm:p-6 md:p-8 flex flex-col flex-1">
                  {/* Role badge */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`h-8 w-8 rounded-lg ${role.accentIcon} flex items-center justify-center`}>
                      <Icon className={`h-4 w-4 ${role.accentText}`} />
                    </div>
                    <span className={`text-xs font-mono font-bold uppercase tracking-widest ${role.accentText}`}>
                      {role.label}
                    </span>
                  </div>

                  {/* Headline */}
                  <h3 className="text-lg sm:text-xl font-black mb-2 text-foreground leading-tight">
                    {role.headline}
                  </h3>

                  {/* Tagline */}
                  <p className="text-muted-foreground text-sm leading-relaxed mb-4 sm:mb-6">
                    {role.tagline}
                  </p>

                  {/* Benefits */}
                  <ul className="space-y-2.5 mb-6 sm:mb-8 flex-1">
                    {role.benefits.map((benefit) => (
                      <li
                        key={benefit}
                        className="flex items-start gap-2.5 text-sm text-muted-foreground"
                      >
                        <div className="mt-0.5 flex-shrink-0">
                          <Check className={`h-4 w-4 ${role.accentText}`} />
                        </div>
                        {benefit}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <motion.div whileHover={buttonHover} whileTap={buttonTap}>
                    <Link
                      href={role.href}
                      className={`flex items-center justify-center gap-2 py-3 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] ${
                        role.id === "founder"
                          ? "bg-international-orange hover:bg-international-orange-hover text-white"
                          : "bg-muted hover:bg-secondary text-foreground"
                      }`}
                    >
                      {role.cta}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </motion.div>
                </div>
              </AnimatedCard>
            )
          })}
        </StaggerContainer>

        {/* Supporting context */}
        <AnimatedSection className="mt-8 sm:mt-12 text-center" delay={0.2}>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Not sure which path is right? Founders bring vision and capital.
            Executives bring deep expertise. Apprentices bring energy and ambition.{" "}
            <span className="text-foreground font-medium">Together, they build hardware at software speed.</span>
          </p>
        </AnimatedSection>
      </div>
    </section>
  )
}
