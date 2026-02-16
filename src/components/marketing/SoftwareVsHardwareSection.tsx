"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Laptop, Factory, Check, X, Zap } from "lucide-react"
import { motion } from "framer-motion"
import {
  AnimatedSection,
  AnimatedCard,
  StaggerContainer,
  buttonHover,
  buttonTap,
} from "@/components/marketing/animations"

/**
 * Side-by-side items comparing starting a software vs hardware company.
 *
 * @description Each item contrasts how trivially easy the software path is
 * versus the painful hardware path, making the gap viscerally clear.
 */
const COMPARISON_ITEMS = [
  {
    category: "Getting Started",
    software: "Open a laptop. Deploy to the cloud. You're live.",
    hardware: "Lease a workshop. Source tooling. Wait 6 months.",
  },
  {
    category: "Your First Team",
    software: "Hire freelancers on Upwork. Start this afternoon.",
    hardware: "Recruit 4-6 full-time engineers. Burn 3 months hiring.",
  },
  {
    category: "Infrastructure Cost",
    software: "£0 to £50/month for hosting and tools.",
    hardware: "£50k-£100k/month in salaries before a single prototype.",
  },
  {
    category: "Time to First Product",
    software: "Ship an MVP in a weekend. Iterate daily.",
    hardware: "12-18 months to first prototype. Iterate quarterly.",
  },
  {
    category: "Scaling Up",
    software: "Add a server. Copy-paste infrastructure.",
    hardware: "New tooling, new factory relationships, new capital.",
  },
  {
    category: "Raising Capital",
    software: "Bootstrap with revenue. Raise when you choose.",
    hardware: "Raise £2M+ before you can build anything. Give away 30-40% equity.",
  },
] as const

/**
 * The Fractional Forge bridge — how we close the gap.
 *
 * @description Maps each hardware pain point to its Fractional Forge equivalent,
 * showing how hardware development can feel as lightweight as software.
 */
const BRIDGE_ITEMS = [
  {
    pain: "Full-time engineering team",
    solution: "Fractional experts on demand",
  },
  {
    pain: "6-figure monthly burn",
    solution: "Pay only for what you use",
  },
  {
    pain: "18-month timelines",
    solution: "12-week sprints",
  },
  {
    pain: "Equity dilution to fund hiring",
    solution: "Keep 100% of your company",
  },
  {
    pain: "Building everything from scratch",
    solution: "Plug into a ready-made network",
  },
] as const

/**
 * SoftwareVsHardwareSection — The dramatic comparison that sets up the problem.
 *
 * @description Makes the visitor viscerally feel the gap between starting a
 * software company (trivially easy) and a hardware company (painfully hard).
 * Then reveals Fractional Forge as the bridge that closes that gap.
 *
 * @component
 */
export function SoftwareVsHardwareSection() {
  return (
    <section
      id="the-gap"
      className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-20">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            The Gap
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Starting a Software Company Is
            <br className="hidden sm:block" />{" "}
            <span className="text-international-orange">Absurdly Easy.</span>
            <br />
            Starting a Hardware Company{" "}
            <span className="text-destructive">Isn&apos;t.</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Anyone can spin up a SaaS from a coffee shop. Building a physical
            product still requires factories, engineers, and mountains of capital.
            Until now.
          </p>
        </AnimatedSection>

        {/* Side-by-Side Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 md:gap-8 mb-10 sm:mb-12 md:mb-20">
          {/* Software Column */}
          <AnimatedSection>
            <div className="border bg-card rounded-xl overflow-hidden">
              <div className="bg-status-success-light px-5 sm:px-6 py-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-status-success/10 flex items-center justify-center">
                  <Laptop className="h-5 w-5 text-status-success" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-foreground">
                    Starting a Software Company
                  </h3>
                  <p className="text-xs font-mono uppercase tracking-widest text-status-success">
                    Easy Mode
                  </p>
                </div>
              </div>
              <div className="p-5 sm:p-6 space-y-4">
                {COMPARISON_ITEMS.map((item) => (
                  <div key={item.category} className="flex items-start gap-3">
                    <div className="mt-0.5 flex-shrink-0">
                      <Check className="h-4 w-4 text-status-success" />
                    </div>
                    <div>
                      <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-0.5">
                        {item.category}
                      </p>
                      <p className="text-sm text-foreground leading-relaxed">
                        {item.software}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </AnimatedSection>

          {/* Hardware Column */}
          <AnimatedSection delay={0.15}>
            <div className="border bg-card rounded-xl overflow-hidden">
              <div className="bg-status-error-light px-5 sm:px-6 py-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <Factory className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-foreground">
                    Starting a Hardware Company
                  </h3>
                  <p className="text-xs font-mono uppercase tracking-widest text-destructive">
                    Hard Mode
                  </p>
                </div>
              </div>
              <div className="p-5 sm:p-6 space-y-4">
                {COMPARISON_ITEMS.map((item) => (
                  <div key={item.category} className="flex items-start gap-3">
                    <div className="mt-0.5 flex-shrink-0">
                      <X className="h-4 w-4 text-destructive" />
                    </div>
                    <div>
                      <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-0.5">
                        {item.category}
                      </p>
                      <p className="text-sm text-foreground leading-relaxed">
                        {item.hardware}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </AnimatedSection>
        </div>

        {/* The Bridge — Fractional Forge */}
        <AnimatedSection>
          <div className="relative border-2 border-international-orange rounded-xl overflow-hidden bg-card">
            {/* Header */}
            <div className="bg-international-orange/5 px-5 sm:px-8 py-5 sm:py-6 text-center border-b border-international-orange/20">
              <div className="inline-flex items-center gap-2 mb-3">
                <Zap className="h-5 w-5 text-international-orange" />
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-international-orange">
                  The Fractional Forge Way
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-foreground leading-tight">
                What If Hardware Was{" "}
                <span className="text-international-orange">This Easy Too?</span>
              </h3>
            </div>

            {/* Bridge Items */}
            <div className="p-5 sm:p-8">
              <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
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

              {/* CTA */}
              <div className="mt-6 sm:mt-8 text-center">
                <motion.div
                  whileHover={buttonHover}
                  whileTap={buttonTap}
                  className="inline-block"
                >
                  <Link
                    href="/join/founder"
                    className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-3.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px]"
                  >
                    Build Hardware at Software Speed
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </motion.div>
              </div>
            </div>
          </div>
        </AnimatedSection>

        {/* Image */}
        <AnimatedSection className="mt-10 sm:mt-12 md:mt-16" delay={0.2}>
          <div className="relative w-full aspect-[3/2] sm:aspect-[2.5/1] rounded-xl overflow-hidden border shadow-lg">
            <Image
              src="/images/marketing/software-vs-hardware.png"
              alt="The gap between starting a software company and a hardware company — and how Fractional Forge bridges it"
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 1200px"
              loading="lazy"
            />
          </div>
        </AnimatedSection>
      </div>
    </section>
  )
}
