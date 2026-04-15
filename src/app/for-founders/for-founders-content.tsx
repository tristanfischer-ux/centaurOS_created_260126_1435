"use client"

/**
 * @file ForFoundersContent — client component for the /for-founders landing page.
 *
 * @description Full marketing page targeting hardware startup founders.
 * Uses shared MarketingNav/Footer and the existing animation system.
 * All colors use semantic tokens per the design system.
 */

import Link from "next/link"
import {
  ArrowRight,
  Clock,
  Banknote,
  Users,
  Beaker,
  Factory,
  CheckCircle2,
  X,
  Flame,
  Cpu,
} from "lucide-react"
import { MarketingNav } from "@/components/marketing/marketing-nav"
import { MarketingFooter } from "@/components/marketing/marketing-footer"
import {
  AnimatedSection,
  AnimatedCard,
  StaggerContainer,
  heroHeadline,
  heroTagline,
  fadeInScale,
  buttonHover,
  buttonTap,
} from "@/components/marketing/animations"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// ─── Hero ────────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-background">
      {/* Subtle gradient accent */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(var(--international-orange) / 0.06), transparent)",
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-24 sm:px-6 sm:pb-28 sm:pt-32 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeInScale}
          >
            <Badge variant="brand" size="lg" className="mb-6">
              For Hardware Founders
            </Badge>
          </motion.div>

          <motion.h1
            initial="hidden"
            animate="visible"
            variants={heroHeadline}
            className="font-playfair text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
          >
            Stop Hiring Engineers.
            <br />
            <span className="text-international-orange">
              Start Building Products.
            </span>
          </motion.h1>

          <motion.p
            initial="hidden"
            animate="visible"
            variants={heroTagline}
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
          >
            ForgeOS turns your product idea into a complete engineering package
            — STEP files, BOM, DFM analysis, matched UK suppliers — in hours,
            not months.
          </motion.p>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeInScale}
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          >
            <Link href="/join?role=founder">
              <motion.div whileHover={buttonHover} whileTap={buttonTap}>
                <Button size="lg" className="gap-2 text-base">
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.div>
            </Link>
            <Link href="/pricing">
              <Button variant="ghost" size="lg" className="text-base">
                See Pricing
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ─── Problem ─────────────────────────────────────────────────────────────────

function ProblemSection() {
  const stats = [
    {
      icon: Clock,
      value: "12-18 months",
      label: "Before first revenue",
    },
    {
      icon: Banknote,
      value: "~70%",
      label: "Of seed funding on infrastructure",
    },
    {
      icon: Users,
      value: "$120K+",
      label: "Annual cost for one mechanical engineer",
    },
  ]

  return (
    <section className="bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="mx-auto max-w-3xl text-center">
          <Badge variant="outline" size="lg" className="mb-4">
            The Problem
          </Badge>
          <h2 className="font-playfair text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            The Eighteen-Month Trap
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Hardware startups spend 12-18 months hiring engineers, finding
            suppliers, and iterating on prototypes before generating a single
            pound of revenue. Most of that seed round? Gone before you ship.
          </p>
        </AnimatedSection>

        <StaggerContainer className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {stats.map((stat) => (
            <AnimatedCard key={stat.label}>
              <Card className="text-center">
                <CardContent className="pt-8 pb-8">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-international-orange/10">
                    <stat.icon className="h-6 w-6 text-international-orange" />
                  </div>
                  <p className="text-3xl font-bold text-foreground">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {stat.label}
                  </p>
                </CardContent>
              </Card>
            </AnimatedCard>
          ))}
        </StaggerContainer>
      </div>
    </section>
  )
}

// ─── Solution ────────────────────────────────────────────────────────────────

function SolutionSection() {
  const features = [
    {
      icon: Beaker,
      title: "CAD Lab",
      subtitle: "Idea to Engineering Package",
      description:
        "Describe your product in plain English. Get back STEP files, a complete bill of materials, DFM analysis, and manufacturing-ready documentation — all generated in hours.",
      highlights: [
        "STEP / CAD file generation",
        "Bill of Materials with costings",
        "Design for Manufacturing analysis",
        "Material selection guidance",
      ],
    },
    {
      icon: Cpu,
      title: "13 AI Specialists",
      subtitle: "Your Virtual C-Suite",
      description:
        "Access a full leadership team on day one. A virtual CTO, VP of Manufacturing, VP of Supply Chain, Finance Lead, and more — each trained on hardware startup best practices.",
      highlights: [
        "Virtual CTO & VP Engineering",
        "VP Manufacturing & Supply Chain",
        "Product, Finance & Legal leads",
        "Strategy & Fundraising advisors",
      ],
    },
    {
      icon: Factory,
      title: "Supplier Marketplace",
      subtitle: "13,700+ UK Suppliers",
      description:
        "Stop cold-emailing factories. Instantly match with verified UK manufacturers, get RFQ-ready documentation, and compare quotes — all from inside the platform.",
      highlights: [
        "13,700+ verified UK suppliers",
        "Instant RFQ generation",
        "Capability-matched results",
        "Direct communication channel",
      ],
    },
  ]

  return (
    <section className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="mx-auto max-w-3xl text-center">
          <Badge variant="brand" size="lg" className="mb-4">
            The Solution
          </Badge>
          <h2 className="font-playfair text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Everything You Need to Ship Hardware
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Three capabilities that replace months of hiring and hundreds of
            thousands in engineering costs.
          </p>
        </AnimatedSection>

        <StaggerContainer className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {features.map((feature) => (
            <AnimatedCard key={feature.title}>
              <Card className="flex h-full flex-col">
                <CardHeader>
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-international-orange/10">
                    <feature.icon className="h-6 w-6 text-international-orange" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                  <p className="text-sm font-medium text-international-orange">
                    {feature.subtitle}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                  <ul className="mt-6 space-y-2">
                    {feature.highlights.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-sm text-foreground"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-international-orange" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </AnimatedCard>
          ))}
        </StaggerContainer>
      </div>
    </section>
  )
}

// ─── Social Proof ────────────────────────────────────────────────────────────

function SocialProofSection() {
  return (
    <section className="bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="mx-auto max-w-4xl">
          <div className="text-center">
            <Badge variant="outline" size="lg" className="mb-4">
              Case Study
            </Badge>
            <h2 className="font-playfair text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              From Idea to Engineering Package in 3 Hours
            </h2>
          </div>

          <Card className="mt-12">
            <CardContent className="p-8 sm:p-10">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                {/* Left: the story */}
                <div className="space-y-6">
                  <div>
                    <Badge variant="brand" size="sm">
                      Agricultural IoT
                    </Badge>
                    <h3 className="mt-3 text-lg font-semibold text-foreground">
                      Smart Soil Monitoring System
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      A pre-seed founder needed a weatherproof enclosure for a
                      soil-monitoring PCB, complete with manufacturing specs and
                      supplier quotes. Traditional route: 4-8 weeks with a
                      contract engineer.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-foreground">
                      With ForgeOS:
                    </p>
                    <ul className="space-y-2">
                      {[
                        "Full STEP file for IP67-rated enclosure",
                        "Complete BOM with 23 components",
                        "DFM analysis for injection moulding",
                        "3 matched UK suppliers with RFQ packs",
                      ].map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-international-orange" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Right: comparison */}
                <div className="flex flex-col justify-center space-y-6">
                  <div className="rounded-xl border border-border bg-background p-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Traditional Approach
                    </p>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        4-8 weeks
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Banknote className="h-4 w-4" />
                        $5,000 - $15,000
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border-2 border-international-orange bg-international-orange/5 p-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-international-orange">
                      With ForgeOS
                    </p>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Clock className="h-4 w-4 text-international-orange" />
                        3 hours
                      </div>
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Banknote className="h-4 w-4 text-international-orange" />
                        From £19.99/month
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </AnimatedSection>
      </div>
    </section>
  )
}

// ─── Pricing Comparison ──────────────────────────────────────────────────────

function PricingComparisonSection() {
  const traditional = [
    "Contract mechanical engineer: $5K-$15K",
    "Supplier sourcing: 4-8 weeks of outreach",
    "BOM & DFM review: additional $2K-$5K",
    "Timeline: 2-4 months minimum",
  ]

  const forgeos = [
    "Full engineering package generation",
    "13 AI specialists on demand",
    "13,700+ UK suppliers, instant matching",
    "Timeline: hours, not months",
  ]

  return (
    <section className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="mx-auto max-w-3xl text-center">
          <Badge variant="outline" size="lg" className="mb-4">
            Pricing
          </Badge>
          <h2 className="font-playfair text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            The Maths Speaks for Itself
          </h2>
        </AnimatedSection>

        <StaggerContainer className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Traditional */}
          <AnimatedCard>
            <Card className="h-full">
              <CardHeader>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Traditional Route
                </p>
                <CardTitle className="text-2xl">
                  $5K - $15K
                  <span className="ml-2 text-base font-normal text-muted-foreground">
                    + 4-8 weeks
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {traditional.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-sm text-muted-foreground"
                    >
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </AnimatedCard>

          {/* ForgeOS */}
          <AnimatedCard>
            <Card className="relative h-full border-2 border-international-orange">
              <div className="absolute -top-3 left-6">
                <Badge variant="brand" size="lg">
                  Recommended
                </Badge>
              </div>
              <CardHeader className="pt-8">
                <p className="text-xs font-semibold uppercase tracking-wider text-international-orange">
                  ForgeOS
                </p>
                <CardTitle className="text-2xl">
                  From £19.99
                  <span className="ml-1 text-base font-normal text-muted-foreground">
                    /month
                  </span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Free tier available — 50 tasks, all 13 specialists
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {forgeos.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-sm text-foreground"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-international-orange" />
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <Link href="/join?role=founder">
                    <motion.div whileHover={buttonHover} whileTap={buttonTap}>
                      <Button className="w-full gap-2">
                        Get Started Free
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </AnimatedCard>
        </StaggerContainer>
      </div>
    </section>
  )
}

// ─── Final CTA ───────────────────────────────────────────────────────────────

function FinalCTASection() {
  return (
    <section className="bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="mx-auto max-w-2xl text-center">
          <div className="mb-6 flex items-center justify-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-international-orange">
              <Flame className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
          <h2 className="font-playfair text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Join 32 of 100 Founding Members
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            We are onboarding our first 100 hardware founders. Founding members
            get priority support, direct input on the product roadmap, and
            locked-in pricing for life.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/join?role=founder&utm_source=for-founders">
              <motion.div whileHover={buttonHover} whileTap={buttonTap}>
                <Button size="lg" className="gap-2 text-base">
                  Claim Your Founding Spot
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.div>
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Free to start. No credit card required.
          </p>
        </AnimatedSection>
      </div>
    </section>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function ForFoundersContent() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <main>
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <SocialProofSection />
        <PricingComparisonSection />
        <FinalCTASection />
      </main>
      <MarketingFooter />
    </div>
  )
}
