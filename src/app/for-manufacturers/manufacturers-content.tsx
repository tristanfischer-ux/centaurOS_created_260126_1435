/**
 * @file Manufacturers Landing Page Content
 *
 * @description Client component for the /for-manufacturers page.
 * Uses framer-motion animations consistent with the main marketing page.
 * All copy is tailored for UK SME manufacturers/suppliers.
 *
 * DECISION: Client component (not server) to enable scroll-triggered
 * animations via framer-motion, matching the homepage pattern.
 */

"use client"

import Link from "next/link"
import {
  ArrowRight,
  Factory,
  Shield,
  UserCheck,
  Banknote,
  Send,
  FileText,
  Award,
  TrendingUp,
  PoundSterling,
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
    title: "Qualified Buyers",
    description:
      "Every buyer on ForgeOS is a funded hardware startup building real products. No students, no tyre-kickers, no speculative enquiries.",
  },
  {
    icon: Banknote,
    title: "Fair Pricing",
    description:
      "You set your prices. No reverse auctions, no bidding wars, no race to the bottom. Buyers come to you because you are the right fit, not the cheapest.",
  },
  {
    icon: FileText,
    title: "Simple Process",
    description:
      "Receive targeted RFQs matched to your capabilities. Quote when it suits you. Win work that fits your machines and your schedule.",
  },
] as const

const STATS = [
  {
    value: "13,700+",
    label: "UK suppliers already listed",
    icon: Factory,
  },
  {
    value: "120+",
    label: "RFQs sent this month",
    icon: Send,
  },
  {
    value: "£4,200",
    label: "Average order value",
    icon: PoundSterling,
  },
] as const

const HOW_IT_WORKS = [
  {
    step: 1,
    title: "Get Listed",
    description:
      "Tell us what you make, your processes, materials, and capacity. Takes 5 minutes. We verify your details and add you to the marketplace.",
    icon: Award,
  },
  {
    step: 2,
    title: "Receive Targeted RFQs",
    description:
      "Our matching engine sends you enquiries that fit your capabilities. CNC? Injection moulding? Sheet metal? You only see work you can actually do.",
    icon: Send,
  },
  {
    step: 3,
    title: "Quote and Win Work",
    description:
      "Review the brief, submit your quote, and deliver. No bidding wars. The buyer picks based on fit, quality, and lead time — not just price.",
    icon: TrendingUp,
  },
] as const

const FAQ_ITEMS = [
  {
    question: "What does it cost to be listed?",
    answer:
      "Listing is free. We charge a small transaction fee only when you win and complete an order. You never pay to receive RFQs or submit quotes.",
  },
  {
    question: "How do I get listed?",
    answer:
      "Click \"List Your Capacity\" and fill in your company details, processes, materials, and location. Our team verifies your listing within 48 hours. If you are already in our database of 13,700+ suppliers, we may have a profile ready for you to claim.",
  },
  {
    question: "What types of work come through ForgeOS?",
    answer:
      "Mostly prototyping and small-batch production for hardware startups — CNC machining, injection moulding, sheet metal fabrication, 3D printing, PCB assembly, and more. Order sizes typically range from 1-off prototypes to batches of a few hundred.",
  },
  {
    question: "Do I have to accept every RFQ?",
    answer:
      "No. You choose which enquiries to quote on. If the job does not fit your schedule, capacity, or capabilities, simply skip it. There is no obligation.",
  },
  {
    question: "How are buyers qualified?",
    answer:
      "Every buyer on ForgeOS goes through onboarding that verifies their company and project. Many are venture-backed startups with engineering teams. We filter out speculative and non-serious enquiries before they reach you.",
  },
  {
    question: "I am already busy. Why would I join?",
    answer:
      "Capacity fluctuates. Having a pipeline of qualified buyers means you can fill gaps when they appear, rather than scrambling. Many of our best suppliers run at 70-80% utilisation and use ForgeOS to top up the remaining capacity with good-margin work.",
  },
] as const

/* ───────────────────── Component ───────────────────── */

export function ManufacturersContent() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <MarketingNav />

      <main className="flex-1">
        {/* ─── Hero ─── */}
        <section className="relative overflow-hidden border-b bg-muted/30">
          {/* DECISION: Subtle gradient accent rather than full background
              to keep the light/airy feel while adding visual interest */}
          <div className="absolute inset-0 bg-gradient-to-br from-international-orange/5 via-transparent to-transparent" />
          <div className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
            <AnimatedSection>
              <Badge variant="brand" size="lg" className="mb-6">
                For Manufacturers
              </Badge>
            </AnimatedSection>

            <AnimatedSection delay={0.1}>
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Fill Your Empty Machines{" "}
                <span className="text-international-orange">
                  With Funded Buyers
                </span>
              </h1>
            </AnimatedSection>

            <AnimatedSection delay={0.2}>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                ForgeOS connects UK manufacturers with hardware startups who need
                parts made. Qualified buyers. No bidding wars. You set your
                prices.
              </p>
            </AnimatedSection>

            <AnimatedSection delay={0.3}>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link href="/join?role=supplier">
                  <Button size="lg" className="gap-2">
                    List Your Capacity
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <span className="text-sm text-muted-foreground">
                  Free to list. No commitment.
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
                Why Manufacturers Choose ForgeOS
              </h2>
              <p className="mx-auto max-w-2xl text-muted-foreground">
                We built ForgeOS for manufacturers who are tired of marketplaces
                that drive prices down. Here, quality and capability win.
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

        {/* ─── Stats ─── */}
        <section className="border-y bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <StaggerContainer className="grid gap-8 sm:grid-cols-3">
              {STATS.map((stat) => (
                <AnimatedCard key={stat.label}>
                  <div className="flex flex-col items-center text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-international-orange/10">
                      <stat.icon className="h-7 w-7 text-international-orange" />
                    </div>
                    <span className="text-4xl font-bold tracking-tight text-foreground">
                      {stat.value}
                    </span>
                    <span className="mt-1 text-sm text-muted-foreground">
                      {stat.label}
                    </span>
                  </div>
                </AnimatedCard>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ─── How It Works ─── */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <AnimatedSection>
            <div className="space-y-2 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                How It Works
              </h2>
              <p className="mx-auto max-w-2xl text-muted-foreground">
                Three steps to start receiving qualified work.
              </p>
            </div>
          </AnimatedSection>

          <StaggerContainer className="mt-12 grid gap-8 sm:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <AnimatedCard key={item.step}>
                <div className="relative flex flex-col items-center text-center">
                  {/* Step number */}
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
                      Built for UK Manufacturing
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      ForgeOS is purpose-built for the UK manufacturing sector.
                      Every supplier in our marketplace is a verified UK business.
                      Every buyer is building a real product. We understand the
                      realities of running a shop floor — lead times, MOQs,
                      tolerances, and the importance of getting paid on time.
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
                Everything you need to know about joining the ForgeOS marketplace.
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
                  Ready to Fill Your Capacity?
                </h2>
                <p className="max-w-xl text-muted-foreground leading-relaxed">
                  Join 13,700+ UK suppliers on ForgeOS. Get matched with funded
                  hardware startups who need your capabilities. Free to list, no
                  commitment.
                </p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <Link href="/join?role=supplier">
                    <Button size="lg" className="gap-2">
                      Join the Marketplace
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
