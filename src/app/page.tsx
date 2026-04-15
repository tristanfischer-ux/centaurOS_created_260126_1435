"use client"

import Image from "next/image"
import Link from "next/link"
import { ProductShowcase } from "@/components/marketing/product-showcase"
import { useState, useEffect } from "react"
import {
  motion,
  AnimatePresence,
} from "framer-motion"
import {
  fadeInScale,
  heroHeadline,
  heroTagline,
  buttonHover,
  buttonTap,
  AnimatedSection,
  AnimatedCard,
  StaggerContainer,
} from "@/components/marketing/animations"
import {
  ChevronDown,
  ArrowRight,
  ExternalLink,
  Check,
} from "lucide-react"
import { InvestorPreviewSection } from "@/components/marketing/investor-preview"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { MarketingFooter } from "@/components/marketing/marketing-footer"
import {
  Card,
  CardContent,
} from "@/components/ui/card"

const APP_DOMAIN =
  process.env.NEXT_PUBLIC_APP_DOMAIN || "https://fractionalforge.app"

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)")
    setIsMobile(mql.matches)
    const handler = (e: MediaQueryListEvent): void => setIsMobile(e.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [])

  return isMobile
}

/* ═══════════════════════════════════════════════════════════════════════════
 * DATA — Articles, Pricing, FAQs
 * ═══════════════════════════════════════════════════════════════════════ */

const ARTICLES = [
  {
    title: "The Eighteen-Month Trap",
    summary: "Why hardware startups take 12\u201318 months before first revenue",
    url: "https://www.historyfuturenow.com/articles/the-eighteen-month-trap-why-hardware-startups-are-structurally-slow",
  },
  {
    title: "Hardware Needs Its AWS Moment",
    summary: "What software learned that hardware hasn\u2019t",
    url: "https://www.historyfuturenow.com/articles/from-basement-servers-to-billion-users-what-software-learned-that-hardware-hasnt",
  },
  {
    title: "The Platform Phase of Manufacturing",
    summary: "How shared infrastructure always wins",
    url: "https://www.historyfuturenow.com/articles/the-arsenal-and-the-container-how-shared-infrastructure-always-wins",
  },
  {
    title: "The 20x Iteration Gap",
    summary: "Why Shenzhen teams iterate 20x faster",
    url: "https://www.historyfuturenow.com/articles/the-fifteen-minute-factory-why-proximity-still-wins",
  },
] as const

const PRICING_TIERS = [
  { name: "Explorer", price: "Free", detail: "50 AI assists, all 13 specialists" },
  { name: "Seed", price: "\u00a319.99/mo", detail: "250 assists, verified emails" },
  { name: "Startup Team", price: "\u00a349/mo", detail: "750 assists, supplier matching" },
  { name: "Professional", price: "\u00a3149/mo", detail: "2,500 assists, priority support" },
] as const

const FAQS = [
  {
    question: "Who owns the IP I create?",
    answer: "You do. 100%. Fractional Forge provides the team and infrastructure, but all intellectual property, designs, prototypes, and products belong entirely to you. This is baked into our contracts.",
  },
  {
    question: "How is my data protected?",
    answer: "Designs are visible only to team members you choose. Factory partners see only what\u2019s needed to quote and manufacture. All parties sign confidentiality agreements before accessing any of your data. We use row-level security and encryption at rest to ensure your information stays private.",
  },
  {
    question: "What if something goes wrong?",
    answer: "Responsibility is clearly allocated in writing. Factory partners are responsible for manufacturing defects and spec conformance. You are responsible for your design specifications. Fractional Forge facilitates the relationship but does not guarantee manufacturing outcomes. Written terms govern every engagement.",
  },
  {
    question: "How does the fractional model actually work?",
    answer: "Instead of hiring a full-time engineering team, you work with experienced executives and engineers on a fractional (part-time) basis. They direct AI-enabled apprentices who execute at speed, then verify the output based on decades of real-world experience. You only pay for the hours and outcomes you need.",
  },
  {
    question: "How quickly can I go from idea to prototype?",
    answer: "It depends on complexity, but the key advantage is eliminating the months of hiring, onboarding, and infrastructure setup that typically precede any actual engineering work. Because you\u2019re plugging into existing experts and factory capacity from day one, you can start building immediately.",
  },
  {
    question: "How much does it cost?",
    answer: "ForgeOS is free to start \u2014 50 AI tasks per month with all 13 specialists. Paid plans start at \u00a319.99/month for more capacity. All new accounts get 0% marketplace fees on their first 3 orders. No equity required \u2014 check our pricing page for full details.",
  },
] as const

/* ═══════════════════════════════════════════════════════════════════════════
 * PAGE COMPONENT
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Marketing landing page — 6-section blueprint.
 *
 * INTENT: Tells one story: Hero -> How it works ->
 * Investor intelligence -> Pricing -> Thought leadership -> FAQ.
 */
export default function MarketingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [navScrolled, setNavScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = (): void => {
      setNavScrolled(window.scrollY > 20)
      if (mobileMenuOpen) setMobileMenuOpen(false)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [mobileMenuOpen])

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [mobileMenuOpen])

  const [showFloatingCTA, setShowFloatingCTA] = useState(false)
  useEffect(() => {
    const handleFloatingCTA = (): void => {
      setShowFloatingCTA(window.scrollY > window.innerHeight * 0.8)
    }
    window.addEventListener("scroll", handleFloatingCTA, { passive: true })
    return () => window.removeEventListener("scroll", handleFloatingCTA)
  }, [])

  useEffect(() => {
    const scrollToHash = (): void => {
      const hash =
        typeof window !== "undefined" ? window.location.hash.slice(1) : ""
      if (!hash) return
      const el = document.getElementById(hash)
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
    const timeoutId = setTimeout(scrollToHash, 100)
    window.addEventListener("hashchange", scrollToHash)
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener("hashchange", scrollToHash)
    }
  }, [])

  // SEO structured data — FAQPage + Organization (JSON-LD)
  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  }

  const organizationStructuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Fractional Forge Ltd",
    url: "https://fractionalforge.app",
    logo: "https://fractionalforge.app/icons/icon-192x192.png",
    description:
      "The Operating System for Hardware Startups. Expert knowledge, smart tools, investor intelligence, and manufacturing connections — everything a hardware startup needs, in one platform.",
    sameAs: [
      "https://www.linkedin.com/company/fractional-forge",
    ],
  }

  const softwareApplicationStructuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ForgeOS",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: "https://fractionalforge.app",
    description:
      "The operating system for hardware startups. Expert knowledge, smart tools, investor intelligence, and manufacturing connections.",
    offers: [
      {
        "@type": "Offer",
        price: "0",
        priceCurrency: "GBP",
        name: "Explorer (Free)",
      },
      {
        "@type": "Offer",
        price: "49",
        priceCurrency: "GBP",
        name: "Startup Team",
      },
      {
        "@type": "Offer",
        price: "149",
        priceCurrency: "GBP",
        name: "Professional",
      },
    ],
    provider: {
      "@type": "Organization",
      name: "Fractional Forge Ltd",
    },
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* SEO: Structured data for rich results */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqStructuredData),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationStructuredData),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationStructuredData),
        }}
      />

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-accent-foreground focus:rounded-md"
      >
        Skip to main content
      </a>

      {/* ═══ Sticky Navigation ═══ */}
      <nav
        className={`sticky top-0 left-0 right-0 z-40 transition-all duration-300 ${
          navScrolled
            ? "bg-background/95 backdrop-blur-sm shadow-sm border-b border-muted"
            : "bg-background"
        }`}
        aria-label="Main navigation"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <Link
            href="/"
            className="text-base sm:text-lg md:text-xl font-bold tracking-tight"
          >
            FRACTIONAL FORGE
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors">
              How It Works
            </a>
            <a href="#investors" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors">
              Investors
            </a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors">
              Pricing
            </a>
            <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors">
              FAQ
            </a>
            <a href={`${APP_DOMAIN}/login`} className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors">
              Login
            </a>
            <motion.div whileHover={buttonHover} whileTap={buttonTap}>
              <Link
                href="/join?role=founder"
                className="inline-flex items-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-5 py-2.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md"
              >
                Start Free
              </Link>
            </motion.div>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="md:hidden fixed inset-0 bg-foreground/20 backdrop-blur-[2px]"
                style={{ zIndex: -1 }}
                onClick={() => setMobileMenuOpen(false)}
                aria-hidden="true"
              />
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="md:hidden border-t border-muted bg-background overflow-hidden shadow-lg"
              >
                <div className="px-4 sm:px-6 py-4 pb-safe flex flex-col gap-1">
                  <Link
                    href="/join?role=founder"
                    className="mb-3 bg-international-orange hover:bg-international-orange-hover text-white py-3.5 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] flex items-center justify-center"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Start Free
                  </Link>
                  {[
                    { href: "#how-it-works", label: "How It Works" },
                    { href: "#investors", label: "Investors" },
                    { href: "#pricing", label: "Pricing" },
                    { href: "#faq", label: "FAQ" },
                  ].map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="text-sm text-muted-foreground hover:text-foreground active:text-foreground uppercase tracking-wider py-3.5 min-h-[48px] flex items-center transition-colors border-b border-muted/50 last:border-b-0"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.label}
                    </a>
                  ))}
                  <a
                    href={`${APP_DOMAIN}/login`}
                    className="text-sm text-muted-foreground hover:text-foreground active:text-foreground uppercase tracking-wider py-3.5 min-h-[48px] flex items-center transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Login
                  </a>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </nav>

      <main id="main-content">
        {/* ═══ Section 1: Hero ═══ */}
        <HeroSection />

        {/* ═══ Section 2: How It Works (3 Pillars) ═══ */}
        <HowItWorksSection />

        {/* ═══ Section 3: Investor Intelligence ═══ */}
        <InvestorIntelligenceSection />

        {/* ═══ Section 4: Pricing Teaser ═══ */}
        <PricingTeaserSection />

        {/* ═══ Section 5: From the Founder ═══ */}
        <FounderArticlesSection />

        {/* ═══ Section 6: FAQ ═══ */}
        <FAQSection />
      </main>

      {/* Floating Mobile CTA */}
      <AnimatePresence>
        {showFloatingCTA && !mobileMenuOpen && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-t border-muted px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
          >
            <Link
              href="/join?role=founder"
              className="flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white py-3 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] w-full"
            >
              Start Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      <MarketingFooter />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION 1: HERO
 * ═══════════════════════════════════════════════════════════════════════ */

function HeroSection() {
  return (
    <section className="relative min-h-[85vh] sm:min-h-[90vh] md:min-h-screen flex items-center justify-center overflow-hidden bg-background">
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <motion.div initial="hidden" animate="visible" variants={fadeInScale} className="inline-flex items-center gap-2 mb-5 sm:mb-6 md:mb-8 px-3 sm:px-4 py-2 border bg-card rounded-full">
          <span className="w-2 h-2 rounded-full bg-international-orange animate-pulse" />
          <span className="text-international-orange text-xs font-mono uppercase tracking-widest">
            Everything You Need to Build Hardware.
          </span>
        </motion.div>

        <motion.h1 initial="hidden" animate="visible" variants={heroHeadline} className="font-playfair text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black leading-tight mb-6 md:mb-8">
          The Operating System for{" "}
          <motion.span initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }} className="text-international-orange">
            Hardware Startups.
          </motion.span>
        </motion.h1>

        <motion.p initial="hidden" animate="visible" variants={heroTagline} className="text-foreground text-base sm:text-lg md:text-xl max-w-3xl mx-auto leading-relaxed mb-6 sm:mb-8 md:mb-10">
          Expert knowledge, smart tools, investor intelligence, and manufacturing connections — everything a hardware startup needs, in one platform.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.6 }} className="flex flex-col items-center gap-6 w-full sm:w-auto">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto">
            <motion.div whileHover={buttonHover} whileTap={buttonTap} className="w-full sm:w-auto">
              <Link href="/join?role=founder" className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-4 text-sm font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] w-full sm:w-auto">
                Start Free <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
            <a href="#how-it-works" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm font-mono tracking-wider uppercase transition-colors min-h-[48px]">
              See How It Works <ChevronDown className="h-4 w-4" />
            </a>
          </div>

          {/* Product showcase — rotating screenshots of key features */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.8, ease: "easeOut" }}
            className="w-full max-w-5xl mt-4"
          >
            <ProductShowcase />
          </motion.div>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2, duration: 0.6 }} className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
        <span className="text-xs text-muted-foreground font-mono uppercase tracking-widest hidden sm:block">Scroll</span>
        <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </motion.div>
      </motion.div>
    </section>
  )
}


/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION 2: HOW IT WORKS (3 Pillars)
 * ═══════════════════════════════════════════════════════════════════════ */

const HOW_IT_WORKS_PILLARS = [
  {
    label: "Fractional Expertise",
    title: "Expert Knowledge, On Demand",
    image: "/images/marketing/role-executive.png",
    imageAlt: "Experienced executive reviewing engineering plans",
    body: "Don\u2019t burn seed capital on a standing army. Launch with a fractional team \u2014 seasoned engineers, marketers, and operators with decades of experience. No full-time hires, no six-figure salaries before your first prototype.",
    highlights: [
      "Manufacturing, design, supply chain, and commercial specialists",
      "Downloadable engineering reports in PPTX, Word, and PDF",
      "Cost estimation with parts-level breakdown",
    ],
  },
  {
    label: "Smart Tools",
    title: "Smart Tools. Human Judgement.",
    image: "/images/marketing/role-apprentice.png",
    imageAlt: "Young engineers collaborating on product design",
    body: "13 domain specialists help you think through every decision \u2014 from product architecture to fundraising strategy. They draw on 220+ engineering standards and real supplier data. You make the calls.",
    highlights: [
      "Strategy, engineering, finance, legal, and 9 more domains",
      "Every recommendation grounded in real data and standards",
      "Your context, your decisions \u2014 amplified",
    ],
  },
  {
    label: "Cloud Factory",
    title: "Factories Without the Factory",
    image: "/images/marketing/factory-partner.png",
    imageAlt: "Factory floor with manufacturing equipment",
    body: "Across the UK, factories have spare capacity waiting to be filled. We connect you with the right facilities, generate RFQ packs, and help get your products built \u2014 without leasing a single square metre.",
    highlights: [
      "13,700+ UK manufacturers and suppliers indexed",
      "Automated RFQ packs with engineering specs and tolerances",
      "6-factor supplier matching: capability, quality, location, and more",
    ],
  },
] as const

function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-16">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            The Platform
          </span>
          <h2 className="font-playfair text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            How It <span className="text-international-orange">Works</span>
          </h2>
        </AnimatedSection>

        <div className="flex flex-col gap-6 sm:gap-8">
          {HOW_IT_WORKS_PILLARS.map((pillar, index) => {
            const imageFirst = index % 2 === 0
            return (
              <AnimatedCard key={pillar.title}>
                <Card className="hover:-translate-y-0.5 active:scale-[0.99] duration-200 transition-all overflow-hidden">
                  <div
                    className={`grid grid-cols-1 lg:grid-cols-2 ${
                      imageFirst ? "" : "lg:direction-rtl"
                    }`}
                  >
                    {/* Image side */}
                    <div
                      className={`relative min-h-[280px] sm:min-h-[320px] lg:min-h-[360px] bg-muted ${
                        imageFirst ? "" : "lg:order-2"
                      }`}
                    >
                      <Image
                        src={pillar.image}
                        alt={pillar.imageAlt}
                        fill
                        className="object-cover"
                        sizes="(max-width: 1024px) 100vw, 50vw"
                      />
                    </div>

                    {/* Text side */}
                    <CardContent
                      className={`p-6 sm:p-8 lg:p-10 flex flex-col justify-center gap-4 sm:gap-5 ${
                        imageFirst ? "" : "lg:order-1"
                      }`}
                      style={{ direction: "ltr" }}
                    >
                      <span className="inline-flex self-start px-3 py-1 text-xs font-mono uppercase tracking-widest text-international-orange bg-international-orange/10 rounded-full">
                        {pillar.label}
                      </span>
                      <h3 className="font-playfair text-xl sm:text-2xl lg:text-3xl font-black text-foreground leading-tight">
                        {pillar.title}
                      </h3>
                      <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                        {pillar.body}
                      </p>
                      <ul className="flex flex-col gap-2.5 mt-1">
                        {pillar.highlights.map((highlight) => (
                          <li
                            key={highlight}
                            className="flex items-start gap-2.5 text-sm text-foreground"
                          >
                            <Check className="h-4 w-4 mt-0.5 shrink-0 text-international-orange" />
                            <span>{highlight}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </div>
                </Card>
              </AnimatedCard>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION 4: INVESTOR INTELLIGENCE
 * ═══════════════════════════════════════════════════════════════════════ */

function InvestorIntelligenceSection() {
  return <InvestorPreviewSection />
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION 5: FROM THE FOUNDER (Blog / Thought Leadership)
 * ═══════════════════════════════════════════════════════════════════════ */

function FounderArticlesSection() {
  return (
    <section className="py-12 sm:py-16 md:py-28 bg-background border-t border-muted scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-16">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            Thought Leadership
          </span>
          <h2 className="font-playfair text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            From the <span className="text-international-orange">Founder</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Understanding why hardware is hard — and what to do about it.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.1}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {ARTICLES.map((article) => (
              <Card key={article.title} className="hover:-translate-y-0.5 active:scale-[0.99] duration-200 transition-all h-full">
                <CardContent className="p-5 sm:p-6 flex flex-col gap-3 h-full">
                  <h3 className="text-base sm:text-lg font-bold text-foreground leading-snug">{article.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">{article.summary}</p>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-international-orange hover:text-international-orange-hover font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    Read on History Future Now <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </AnimatedSection>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION 6: PRICING TEASER
 * ═══════════════════════════════════════════════════════════════════════ */

function PricingTeaserSection() {
  return (
    <section id="pricing" className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-16">
          <h2 className="font-playfair text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Start free. Scale <span className="text-international-orange">when ready.</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            Free forever with 50 AI tasks. No credit card required.
          </p>
        </AnimatedSection>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-10 sm:mb-12">
          {PRICING_TIERS.map((tier) => (
            <AnimatedCard key={tier.name}>
              <Card className="hover:-translate-y-0.5 active:scale-[0.99] duration-200 transition-all h-full">
                <CardContent className="p-6 sm:p-8 text-center flex flex-col gap-3">
                  <p className="text-xs font-mono uppercase tracking-widest text-international-orange">{tier.name}</p>
                  <p className="text-2xl sm:text-3xl font-black text-foreground">{tier.price}</p>
                  <p className="text-sm text-muted-foreground">{tier.detail}</p>
                </CardContent>
              </Card>
            </AnimatedCard>
          ))}
        </StaggerContainer>

        <AnimatedSection className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <motion.div whileHover={buttonHover} whileTap={buttonTap}>
            <Link href="/join?role=founder" className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-3.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px]">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm font-mono tracking-wider uppercase transition-colors min-h-[48px]"
          >
            See Full Pricing <ArrowRight className="h-4 w-4" />
          </Link>
        </AnimatedSection>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION 7: FAQ
 * ═══════════════════════════════════════════════════════════════════════ */

function FAQSection() {
  return (
    <section id="faq" className="py-12 sm:py-16 md:py-28 bg-background border-t border-muted scroll-mt-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-16">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            Questions &amp; Answers
          </span>
          <h2 className="font-playfair text-2xl sm:text-3xl md:text-4xl font-black mb-4 sm:mb-6">
            Frequently Asked Questions
          </h2>
        </AnimatedSection>

        <AnimatedSection delay={0.1}>
          <Accordion type="single" collapsible className="space-y-3 sm:space-y-4">
            {FAQS.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="border rounded-xl bg-card px-4 sm:px-6 data-[state=open]:shadow-sm transition-shadow"
              >
                <AccordionTrigger className="text-left text-sm sm:text-base font-semibold text-foreground py-4 sm:py-5 hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4 sm:pb-5">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </AnimatedSection>
      </div>
    </section>
  )
}
