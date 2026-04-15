/**
 * @file Case Study Page
 *
 * @description Full case study: Agricultural IoT Irrigation System.
 * Shows how a founder went from product idea to engineering package
 * in 3 hours using the CAD Lab. Server component with SEO metadata.
 */

import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, ArrowLeft, CheckCircle2, Clock, Banknote, Users } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MarketingNav } from "@/components/marketing/marketing-nav"
import { MarketingFooter } from "@/components/marketing/marketing-footer"

export const metadata: Metadata = {
  title: "Case Study: Agricultural IoT Irrigation System",
  description:
    "How a solar-powered IoT irrigation system went from concept to full engineering package in 3 hours using ForgeOS CAD Lab. Traditional approach: 4-8 weeks and $5K-$15K.",
  openGraph: {
    title: "Case Study: Agricultural IoT Irrigation System | ForgeOS",
    description: "From concept to full engineering package in 3 hours. See what ForgeOS CAD Lab produces.",
    type: "website",
    url: "https://fractionalforge.app/case-study",
    siteName: "ForgeOS by Fractional Forge",
  },
  alternates: {
    canonical: "https://fractionalforge.app/case-study",
  },
}

const DELIVERABLES = [
  {
    number: "1",
    title: "Product Architecture",
    items: [
      "Modular design with main control unit (300mm x 200mm x 100mm) plus wireless sensor nodes",
      "UV-resistant polycarbonate housings using standard enclosures to minimise custom tooling",
      "Stainless steel and brass for all water-contact components",
      "Under 50 parts for manufacturing simplicity",
    ],
  },
  {
    number: "2",
    title: "Bill of Materials with Cost Modelling",
    items: [
      "Full BOM with costs at three volumes: 1,000 / 10,000 / 100,000 units",
      "Identified that standard automotive-grade connectors reduce costs by 30% vs custom",
      "Flagged 2G/GSM phase-out risk — recommended dual 2G/NB-IoT capability",
    ],
  },
  {
    number: "3",
    title: "DFM Analysis",
    items: [
      "Recommended design-for-assembly in Kenya or Uganda to reduce import duties",
      "Identified 3 components requiring custom injection moulding and suggested standard alternatives",
      "Designed for field repair with basic tools available in rural hardware shops",
    ],
  },
  {
    number: "4",
    title: "Competitive Benchmarking",
    items: [
      "Compared against SunCulture RainMaker2 ($450), iSense ($250), and basic drip kits ($80)",
      "Positioned the product at $95-100, undercutting smart competitors by 60% with IoT connectivity",
    ],
  },
  {
    number: "5",
    title: "Certification Roadmap",
    items: [
      "CE marking requirements for electronic components",
      "IP65 ingress protection testing plan",
      "FCC/local telecom approval pathway for 2G modules",
      "Solar panel efficiency certification requirements",
    ],
  },
  {
    number: "6",
    title: "Matched UK Suppliers",
    items: [
      "47 UK-based manufacturers matched from the marketplace",
      "Filtered by: injection moulding capability, electronics assembly, IP-rated enclosures",
      "Direct RFQ capability to request quotes from multiple suppliers simultaneously",
    ],
  },
] as const

const REQUIREMENTS = [
  "Solar-powered with 7-day battery backup",
  "SMS/2G connectivity for remote monitoring",
  "Soil moisture sensors with 50m wireless range",
  "IP65 weather-resistant housing",
  "Target cost: under $100 at 10,000 units",
] as const

export default function CaseStudyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <MarketingNav />

      <main className="flex-1">
        {/* Hero */}
        <section className="py-12 sm:py-16 md:py-24 border-b border-muted">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
            <Badge variant="secondary" className="mb-6">
              Case Study
            </Badge>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black mb-6 leading-tight">
              From Product Idea to Engineering Package{" "}
              <span className="text-international-orange">in 3 Hours</span>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              How a solar-powered IoT irrigation system for smallholder farms in
              East Africa went from concept to manufacturing-ready specs using
              the CAD Lab.
            </p>
          </div>
        </section>

        {/* Stat comparison */}
        <section className="py-8 sm:py-12 bg-international-orange/5 border-b border-international-orange/10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                {
                  icon: Clock,
                  label: "Time",
                  traditional: "4-8 weeks",
                  forgeos: "3 hours",
                },
                {
                  icon: Banknote,
                  label: "Cost",
                  traditional: "$5,000-$15,000",
                  forgeos: "$49/month",
                },
                {
                  icon: Users,
                  label: "Coordination",
                  traditional: "Multiple freelancers",
                  forgeos: "Single platform",
                },
              ].map((stat) => (
                <Card key={stat.label} className="text-center">
                  <CardContent className="p-5 sm:p-6">
                    <stat.icon className="h-5 w-5 text-international-orange mx-auto mb-3" />
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
                      {stat.label}
                    </p>
                    <p className="text-xs text-muted-foreground line-through mb-1">
                      {stat.traditional}
                    </p>
                    <p className="text-xl sm:text-2xl font-black text-international-orange">
                      {stat.forgeos}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* The Challenge */}
        <section className="py-12 sm:py-16 md:py-20">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="space-y-4">
              <h2 className="text-xs text-international-orange font-mono uppercase tracking-widest">
                The Challenge
              </h2>
              <p className="text-base sm:text-lg text-foreground leading-relaxed">
                A hardware founder was designing a solar-powered IoT irrigation
                system for smallholder farms in East Africa. The product needed
                to be affordable (under $100 per unit at scale), durable enough
                for outdoor use in equatorial conditions, and simple enough to
                install without electrical expertise.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Traditionally, getting from a product concept to a full
                engineering package — CAD models, bill of materials,
                manufacturing cost estimates, DFM analysis, and matched
                suppliers — takes 4-8 weeks and costs $5,000-$15,000 in
                freelance engineering fees.
              </p>
            </div>

            {/* Requirements */}
            <div className="space-y-4">
              <h2 className="text-xs text-international-orange font-mono uppercase tracking-widest">
                Product Requirements
              </h2>
              <Card>
                <CardContent className="p-5 sm:p-6 space-y-3">
                  {REQUIREMENTS.map((req) => (
                    <div key={req} className="flex items-start gap-2.5">
                      <CheckCircle2 className="h-4 w-4 text-international-orange mt-0.5 shrink-0" />
                      <p className="text-sm text-foreground">{req}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <p className="text-sm text-muted-foreground">
                The founder described these requirements in plain English in the
                CAD Lab. No CAD files, no engineering drawings — just a clear
                description of what the product needed to do.
              </p>
            </div>
          </div>
        </section>

        {/* What ForgeOS Produced */}
        <section className="py-12 sm:py-16 md:py-20 border-t border-muted">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="text-center space-y-3">
              <h2 className="text-xs text-international-orange font-mono uppercase tracking-widest">
                What ForgeOS Produced in 3 Hours
              </h2>
              <p className="text-2xl sm:text-3xl font-black">
                A Complete Engineering Package
              </p>
            </div>

            <div className="space-y-6">
              {DELIVERABLES.map((deliverable) => (
                <Card
                  key={deliverable.number}
                  className="hover:-translate-y-0.5 active:scale-[0.99] duration-200 transition-all"
                >
                  <CardContent className="p-5 sm:p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-international-orange text-white text-sm font-black shrink-0">
                        {deliverable.number}
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-foreground">
                        {deliverable.title}
                      </h3>
                    </div>
                    <div className="space-y-2 pl-11">
                      {deliverable.items.map((item) => (
                        <div
                          key={item}
                          className="flex items-start gap-2.5"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-international-orange mt-0.5 shrink-0" />
                          <p className="text-sm text-muted-foreground leading-snug">
                            {item}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* The Result */}
        <section className="py-12 sm:py-16 md:py-20 bg-international-orange/5 border-t border-international-orange/10">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center space-y-6">
            <h2 className="text-xs text-international-orange font-mono uppercase tracking-widest">
              The Result
            </h2>
            <p className="text-2xl sm:text-3xl font-black leading-tight">
              $150,000 Grant Secured
            </p>
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              The founder used the engineering package to secure a $150,000 grant
              from Innovate UK&apos;s Smart Grant programme, citing the detailed
              DFM analysis and cost modelling as key factors in the
              application&apos;s success.
            </p>

            <Card className="max-w-md mx-auto">
              <CardContent className="p-6 text-left space-y-2">
                <p className="text-sm text-muted-foreground italic leading-relaxed">
                  &ldquo;ForgeOS doesn&apos;t replace engineers — it gives
                  founders a 10x head start. Instead of spending weeks getting to
                  a first engineering package, founders start with a
                  comprehensive baseline and spend their engineering budget
                  refining, not starting from scratch.&rdquo;
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* CTA */}
        <section className="py-12 sm:py-16 md:py-24 border-t border-muted">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center space-y-6">
            <h2 className="text-2xl sm:text-3xl font-black">
              Ready to Build{" "}
              <span className="text-international-orange">Your</span> Product?
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto">
              Start with a free account. Describe your product in plain English
              and get your first engineering package today.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/join"
                className="inline-flex items-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-6 py-3 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to homepage
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  )
}
