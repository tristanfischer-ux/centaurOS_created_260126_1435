/**
 * @file Executives Landing Page Content
 *
 * @description Client component for the /for-executives page.
 * Uses framer-motion animations consistent with the main marketing page.
 * All copy is tailored for experienced fractional executives.
 *
 * DECISION: Client component (not server) to enable scroll-triggered
 * animations via framer-motion, matching the homepage pattern.
 */

"use client"

import Link from "next/link"
import {
  ArrowRight,
  Shield,
  UserCheck,
  Banknote,
  Briefcase,
  ClipboardList,
  TrendingUp,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { MarketingNav } from "@/components/marketing/marketing-nav"
import { MarketingFooter } from "@/components/marketing/marketing-footer"
import {
  AnimatedSection,
  AnimatedCard,
  StaggerContainer,
} from "@/components/marketing/animations"

/* ───────────────────── Data ───────────────────── */

const VALUE_PROPS = [
  {
    icon: UserCheck,
    title: "Qualified Clients",
    description:
      "Every client on ForgeOS is a funded hardware startup building a real product. No tyre-kickers, no speculative projects, no unpaid trials.",
  },
  {
    icon: Banknote,
    title: "Fair Compensation",
    description:
      "You set your rate. No reverse auctions, no race to the bottom. Startups come to you because you are the right fit, not the cheapest option.",
  },
  {
    icon: ClipboardList,
    title: "Simple Process",
    description:
      "ForgeOS handles matching, payments, and administration. You focus on what you do best — leading teams and delivering results.",
  },
] as const

const HOW_IT_WORKS = [
  {
    step: 1,
    title: "Create Your Profile",
    description:
      "Tell us your expertise, experience, and availability. Highlight your industry focus — manufacturing, product, engineering, commercial, or finance. Takes 5 minutes.",
    icon: Briefcase,
  },
  {
    step: 2,
    title: "Get Discovered",
    description:
      "Funded hardware startups browse executive profiles and reach out when they need your skills. Our matching engine surfaces you to the right clients based on domain, stage, and sector.",
    icon: TrendingUp,
  },
  {
    step: 3,
    title: "Deliver & Get Paid",
    description:
      "Agree scope and rate with the client, deliver the work, and get paid automatically via Stripe once the client confirms delivery. No chasing invoices.",
    icon: Banknote,
  },
] as const

const FAQ_ITEMS = [
  {
    question: "What does it cost to join?",
    answer:
      "Listing your profile is completely free. ForgeOS charges a 10% commission on completed engagements only. You never pay to be listed or to receive enquiries.",
  },
  {
    question: "How do I get paid?",
    answer:
      "Payments are processed via Stripe. Once the client confirms delivery of the engagement, funds are released to your account automatically. No invoicing, no chasing payments.",
  },
  {
    question: "What types of work come through ForgeOS?",
    answer:
      "Fractional CTO, CFO, COO, VP Engineering, VP Product, and other senior leadership roles. Typical engagements range from strategic advisory (a few hours per week) to hands-on interim leadership (2-3 days per week). Most clients are seed to Series A hardware startups.",
  },
  {
    question: "Do I need to be available full-time?",
    answer:
      "No. The whole point of fractional work is flexibility. You set your own availability — whether that is 4 hours a week or 3 days a week. Clients see your availability upfront and engage accordingly.",
  },
  {
    question: "How are clients qualified?",
    answer:
      "Every startup on ForgeOS goes through onboarding that verifies their company, funding status, and project. Many are venture-backed with real engineering teams. We filter out speculative and non-serious enquiries before they reach you.",
  },
] as const

/* ───────────────────── Component ───────────────────── */

export function ExecutivesContent() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <MarketingNav />

      <main className="flex-1">
        {/* ─── Hero ─── */}
        <section className="relative overflow-hidden border-b bg-muted/30">
          <div className="absolute inset-0 bg-gradient-to-br from-international-orange/5 via-transparent to-transparent" />
          <div className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
            <AnimatedSection>
              <Badge variant="brand" size="lg" className="mb-6">
                For Executives
              </Badge>
            </AnimatedSection>

            <AnimatedSection delay={0.1}>
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Turn Your Expertise{" "}
                <span className="text-international-orange">
                  Into Revenue
                </span>
              </h1>
            </AnimatedSection>

            <AnimatedSection delay={0.2}>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Join 200+ fractional executives helping hardware startups build,
                scale, and ship. Set your own rate, work on your terms, and get
                paid on delivery.
              </p>
            </AnimatedSection>

            <AnimatedSection delay={0.3}>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link href="/join?role=executive">
                  <Button size="lg" className="gap-2">
                    Join as a Fractional Executive
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <span className="text-sm text-muted-foreground">
                  Free to join. 10% commission on completed work only.
                </span>
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* ─── Why ForgeOS ─── */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <AnimatedSection>
            <div className="space-y-2 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Why Executives Choose ForgeOS
              </h2>
              <p className="mx-auto max-w-2xl text-muted-foreground">
                We built ForgeOS to connect experienced leaders with the
                hardware startups that need them most.
              </p>
            </div>
          </AnimatedSection>

          <StaggerContainer className="mt-12 grid gap-6 sm:grid-cols-3">
            {VALUE_PROPS.map((prop) => (
              <AnimatedCard key={prop.title}>
                <Card className="h-full">
                  <CardHeader className="space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-international-orange/10">
                      <prop.icon className="h-6 w-6 text-international-orange" />
                    </div>
                    <CardTitle className="text-lg">{prop.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {prop.description}
                    </p>
                  </CardContent>
                </Card>
              </AnimatedCard>
            ))}
          </StaggerContainer>
        </section>

        {/* ─── How It Works ─── */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <AnimatedSection>
            <div className="space-y-2 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                How It Works
              </h2>
              <p className="mx-auto max-w-2xl text-muted-foreground">
                Three steps from sign-up to your first engagement.
              </p>
            </div>
          </AnimatedSection>

          <StaggerContainer className="mt-12 grid gap-8 sm:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <AnimatedCard key={item.step}>
                <div className="relative flex flex-col items-center text-center">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-international-orange text-sm font-bold text-primary-foreground">
                    {item.step}
                  </div>
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                    <item.icon className="h-6 w-6 text-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </AnimatedCard>
            ))}
          </StaggerContainer>
        </section>

        {/* ─── Social Proof Callout ─── */}
        <section className="border-y bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <AnimatedSection>
              <Card className="overflow-hidden">
                <CardContent className="flex flex-col items-center gap-6 py-10 text-center sm:py-12">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-international-orange/10">
                    <Shield className="h-7 w-7 text-international-orange" />
                  </div>
                  <div className="max-w-2xl space-y-3">
                    <h3 className="text-2xl font-bold text-foreground sm:text-3xl">
                      Built for UK Hardware Executives
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      ForgeOS is purpose-built for the UK hardware ecosystem.
                      Every client is a verified startup building a physical
                      product. Every executive brings real industry experience.
                      We understand fractional work — flexible engagements,
                      clear scope, and reliable payments.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </AnimatedSection>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <AnimatedSection>
            <div className="space-y-2 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Common Questions
              </h2>
              <p className="text-muted-foreground">
                Everything you need to know about joining ForgeOS as a
                fractional executive.
              </p>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={0.1}>
            <Accordion
              type="single"
              collapsible
              className="mt-10 w-full"
            >
              {FAQ_ITEMS.map((faq, index) => (
                <AccordionItem key={index} value={`faq-${index}`}>
                  <AccordionTrigger className="text-left text-base font-medium">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </AnimatedSection>
        </section>

        {/* ─── Final CTA ─── */}
        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
            <AnimatedSection>
              <div className="flex flex-col items-center gap-6 text-center">
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Join as a Fractional Executive
                </h2>
                <p className="max-w-xl text-muted-foreground leading-relaxed">
                  Set your rate, get matched with funded hardware startups, and
                  get paid on delivery. Free to join — we only charge a 10%
                  commission on completed work.
                </p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <Link href="/join?role=executive">
                    <Button size="lg" className="gap-2">
                      Join as a Fractional Executive
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/contact">
                    <Button variant="outline" size="lg">
                      Talk to Our Team
                    </Button>
                  </Link>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  )
}
