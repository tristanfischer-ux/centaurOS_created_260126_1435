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
  Flame,
} from "lucide-react"
import { ExampleInvestorMatch } from "@/components/marketing/example-investor-match"
import { PricingComparisonTable } from "@/components/marketing/pricing-comparison-table"
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
    title: "The Fifteen-Minute Factory",
    summary: "Why proximity still wins in manufacturing",
    url: "https://www.historyfuturenow.com/articles/the-fifteen-minute-factory-why-proximity-still-wins",
  },
] as const

// 2026-04-25 pricing restructure: Free / Starter \u00a320 / Add-on / Pro.
// Killed the \u00a32 Explorer entry tier (loss-making). Hid Seed \u00a319 and the
// Startup Team \u00a349 from the public catalogue (legacy \u2014 existing subscribers
// stay until they upgrade or churn). Added the \u00a310 / 100-leads Investor
// Search Add-On as the cash-cow upsell.
const PRICING_TIERS = [
  { name: "Free", price: "Free", detail: "1 brainstorm/mo, 5 saved searches lifetime" },
  { name: "Starter", price: "\u00a320/mo", detail: "100 investor leads with full why-fit + drafted email, 10 brainstorms" },
  { name: "Add-on", price: "\u00a310 / 100", detail: "Extra investor leads, one click from inside Investors" },
  { name: "Pro", price: "\u00a3149/mo", detail: "Unlimited leads, Deep Council, dual-side data" },
] as const

const FAQS = [
  {
    question: "Who owns the IP I create?",
    answer: "You do. 100%. Fractional Forge provides the team and infrastructure, but all intellectual property, designs, prototypes, and products belong entirely to you. This is baked into our contracts.",
  },
  {
    question: "How is my data protected?",
    answer: "Designs are visible only to team members you choose. Manufacturing partners on the network see only what is needed to quote and manufacture. All parties sign confidentiality agreements before accessing any of your data. We use row-level security and encryption at rest to ensure your information stays private.",
  },
  {
    question: "What if something goes wrong?",
    answer: "Responsibility is clearly allocated in writing. Manufacturing partners are responsible for manufacturing defects and spec conformance. You are responsible for your design specifications. Fractional Forge facilitates the relationship but does not guarantee manufacturing outcomes. Written terms govern every engagement.",
  },
  {
    question: "How does the fractional model actually work?",
    answer: "ForgeOS combines two things. First, specialist support across thirteen disciplines, strategy, chief technology, engineering, manufacturing, supply chain, finance, legal, sales, marketing, product, hiring, fundraising, and chief of staff, providing structured analysis across every part of a hardware company. Second, a marketplace of experienced professionals with decades of domain expertise who set their own day rates and work project-based with startups. You engage them directly. The specialists provide the breadth; the professionals bring the depth.",
  },
  {
    question: "How quickly can I go from idea to prototype?",
    answer: "The aim of ForgeOS is to let you get a product designed and built before you have spent a year finding a factory, negotiating a lease, and installing equipment. The Forge helps you understand what materials, equipment, and suppliers your product will need. Specialists work through the technical, commercial, and operational questions in parallel, thirteen disciplines covered. 13,700+ UK and European manufacturers are indexed and searchable, so rather than building your own factory, you can find partners who already have the building, the machinery, and the expertise to make what you are designing.",
  },
  {
    question: "How much does it cost?",
    answer: "ForgeOS is free to try \u2014 1 brainstorming session a month plus 5 saved investor searches over the life of the account, no credit card required. Starter is \u00a320/month and gives you 100 investor leads with full why-fit, how-to-pitch, and drafted email. Need more leads? \u00a310 per 100 extra, one click from inside Investors. All new accounts get 0% marketplace fees on their first 3 orders. No equity required \u2014 check our pricing page for full details.",
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
      "Everyday objects are becoming sensors and software, kettles, drills, air-quality monitors. ForgeOS helps hardware founders ship the smart version, find the spec, the suppliers, and the investors who fund it.",
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
      "ForgeOS helps hardware founders ship the smart version of everyday products, kettles, drills, air-quality monitors, find the spec, the suppliers, and the investors who fund it.",
    offers: [
      {
        "@type": "Offer",
        price: "0",
        priceCurrency: "GBP",
        name: "Free",
      },
      {
        "@type": "Offer",
        price: "20",
        priceCurrency: "GBP",
        name: "Starter",
      },
      {
        "@type": "Offer",
        price: "149",
        priceCurrency: "GBP",
        name: "Pro",
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
            className="flex items-center gap-2 text-base sm:text-lg md:text-xl font-bold tracking-tight"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-international-orange">
              <Flame className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
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
                href="/join"
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
                    href="/join"
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

        {/* ═══ Section 1b: Personal intro from Tristan ═══ */}
        <TristanIntroSection />

        {/* ═══ Section 2: How It Works (4 Pillars) ═══ */}
        <HowItWorksSection />

        {/* ═══ Section 3: Investor example match card (killer feature) ═══ */}
        <ExampleInvestorMatch />

        {/* ═══ Section 4: Manufacturer / Product Showcase ═══ */}
        <ProductShowcaseSection />

        {/* ═══ Section 5: Pricing + Comparison Table ═══ */}
        <PricingTeaserSection />

        {/* ═══ Section 6: Compressed Founder Letter ═══ */}
        <FounderArticlesSection />

        {/* ═══ Section 7: FAQ ═══ */}
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
              href="/join"
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
            Built for the intelligence-embedded hardware wave
          </span>
        </motion.div>

        <motion.h1 initial="hidden" animate="visible" variants={heroHeadline} className="font-playfair text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black leading-tight mb-6 md:mb-8">
          Make every product{" "}
          <motion.span initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }} className="text-international-orange">
            smart.
          </motion.span>
        </motion.h1>

        <motion.p initial="hidden" animate="visible" variants={heroTagline} className="text-foreground text-base sm:text-lg md:text-xl max-w-3xl mx-auto leading-relaxed mb-6 sm:mb-8 md:mb-10">
          Everyday objects are becoming sensors and software, kettles, drills, air-quality monitors. Compute and connectivity dropped under £5 a unit, so the wave is hardware-side now. Type a paragraph. The Forge breaks it into modules, suggests a bill of materials, and matches every part to UK and European manufacturers. Twenty-minute first pass, hours of detail after.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.6 }} className="flex flex-col items-center gap-6 w-full sm:w-auto">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto">
            <motion.div whileHover={buttonHover} whileTap={buttonTap} className="w-full sm:w-auto">
              <Link href="/join" className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-4 text-sm font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] w-full sm:w-auto">
                Start Free <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
            <a href="#why-i-built" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm font-mono tracking-wider uppercase transition-colors min-h-[48px]">
              Read the Story <ChevronDown className="h-4 w-4" />
            </a>
          </div>

          {/* Product showcase moved to its own section below pricing */}
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2, duration: 0.6 }} className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 pointer-events-none">
        <span className="text-xs text-muted-foreground font-mono uppercase tracking-widest hidden sm:block">Scroll</span>
        <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </motion.div>
      </motion.div>
    </section>
  )
}


/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION 1B: PERSONAL INTRO FROM TRISTAN
 * A short personal opener below the hero so visitors encounter a human
 * voice within seconds of landing. Teases the full letter further down.
 * ═══════════════════════════════════════════════════════════════════════ */

function TristanIntroSection() {
  return (
    <section className="py-10 sm:py-14 md:py-16 bg-background border-t border-muted">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <AnimatedSection>
          <p className="text-international-orange text-xs font-mono uppercase tracking-widest mb-4">
            From Tristan
          </p>
          <p className="text-foreground text-lg sm:text-xl md:text-2xl font-playfair leading-snug mb-4">
            I have spent 26 years building hardware startups. Fractional Forge is the wish list of everything I could have had along the way.
          </p>
          <a
            href="#why-i-built"
            className="inline-flex items-center gap-1.5 text-sm text-international-orange hover:text-international-orange-hover font-semibold transition-colors"
          >
            Read the full story <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </AnimatedSection>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION 2: HOW IT WORKS (3 Pillars)
 * ═══════════════════════════════════════════════════════════════════════ */

const HOW_IT_WORKS_PILLARS = [
  {
    label: "The Smart-Product Wave",
    title: "Designed for what hardware is becoming.",
    image: "/images/marketing/ecosystem-os.png",
    imageAlt: "Connected sensors and intelligent product concepts",
    body: "Everyday objects are becoming sensors and software, kettles, drills, air-quality monitors. Compute and connectivity dropped under \u00a35 a unit, and that is what makes the smart version commercially viable. ForgeOS coordinates the design, supply, and capital cycle for the smart version of whatever you are building, so you skip the eighteen months of reinventing wheels.",
    highlights: [
      "Tools tuned for sensor, edge-compute, and connected-product builds",
      "From a paragraph of intent to a bill of materials, fast",
      "Move from idea to manufacturer conversation in a single afternoon",
    ],
  },
  {
    label: "Fractional Expertise",
    title: "Experienced Professionals, On Your Terms",
    image: "/images/marketing/role-executive.png",
    imageAlt: "Experienced executive reviewing engineering plans",
    body: "Access a marketplace of experienced professionals \u2014 people with decades of domain expertise in manufacturing, engineering, finance, supply chain, and operations. They set their own day rates, work project-based, and are available for defined engagements with your company.",
    highlights: [
      "Experienced manufacturing, engineering, finance, and operations specialists",
      "Flexible engagements \u2014 short projects or multi-month retainers",
      "Rates set by the professionals themselves, transparent to you",
    ],
  },
  {
    label: "Specialists",
    title: "Specialist support, your judgement.",
    image: "/images/marketing/role-apprentice.png",
    imageAlt: "Young engineers collaborating on product design",
    body: "Specialist support across thirteen disciplines, strategy, engineering, finance, legal, manufacturing, supply chain, sales, marketing, product, hiring, fundraising, and operations. A finance specialist runs your model. A legal specialist drafts your founder agreements. A manufacturing specialist sanity-checks your supplier shortlist. The decisions remain yours.",
    highlights: [
      "Strategy, engineering, finance, legal, and nine more disciplines",
      "Grounded in real supplier, investor, and industry data",
      "Your context, your decisions, supported at every step",
    ],
  },
  {
    label: "Manufacturing Network",
    title: "A Connected Manufacturing Network",
    image: "/images/marketing/factory-partner.png",
    imageAlt: "Factory floor with manufacturing equipment",
    body: "13,700+ manufacturers across the UK and Europe indexed with capability data. From early prototype design through to production, understand what materials and equipment you need, and find the right partners to make it real — including suppliers experienced in sensor and edge-compute integration for smart products.",
    highlights: [
      "13,700+ UK and European manufacturers and suppliers indexed",
      "Find suppliers experienced in sensor, electronics, and edge-compute integration",
      "Search by capability, location, and specialism to find the right match",
    ],
  },
  {
    label: "Founder Stories",
    title: "Built for hardware founders shipping their second or third product.",
    image: "/images/marketing/ecosystem-os.png",
    imageAlt: "Hardware founder reviewing a sensor-instrumented prototype",
    body: "The founder we built this for is a UK pre-seed engineer turning a commodity product into a sensor-instrumented version, kettle, drill, air-quality monitor, the kind of thing that used to cost £20 in a hardware shop and now needs a microcontroller, firmware, and a connectivity stack. That founder is the test bench for everything in the platform: how fast they can get from a paragraph to a manufacturer conversation, and how cheaply they can hold a fundraise together while they do it.",
    highlights: [
      "Indicative outcome on the test path: twenty-minute first BOM, twelve manufacturer leads in week one",
      "Built around the founder profile, not generic startup advice",
      "First named case study going live before the next traffic push",
    ],
  },
] as const

function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="py-12 sm:py-16 md:py-20 lg:py-24 bg-muted/30 border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-14">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            The Platform
          </span>
          <h2 className="font-playfair text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            How It <span className="text-international-orange">Works</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Cheap intelligence is making every commodity hardware product re-imaginable. Fractional Forge pulls the design, supply, and capital cycle for the smart version into one place — so you stop reinventing wheels.
          </p>
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
 * SECTION 3: FRACTIONAL EXECUTIVES
 * ═══════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION 6: COMPRESSED FOUNDER LETTER + ARTICLES
 * Four paragraphs only on the homepage. The remaining five paragraphs of
 * the original letter live at /story.
 * ═══════════════════════════════════════════════════════════════════════ */

function FounderArticlesSection() {
  return (
    <section id="why-i-built" className="py-12 sm:py-16 md:py-20 lg:py-24 bg-background border-t border-muted scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Personal letter from Tristan */}
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-14">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            A Note from Tristan
          </span>
          <h2 className="font-playfair text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Why I built{" "}
            <span className="text-international-orange">Fractional Forge.</span>
          </h2>
        </AnimatedSection>

        <AnimatedSection delay={0.1}>
          <div className="max-w-3xl mx-auto space-y-5 text-foreground text-base sm:text-lg leading-relaxed mb-10 sm:mb-12 md:mb-14">
            <p>
              Fractional Forge is essentially my wish list of all the things I could have had as a hardware startup founder over the last 26 years.
            </p>
            <p>
              The factory itself is the biggest time sink. Finding a location takes months. Then come the lease negotiations, and as a startup you can easily be asked to pay one, two, or three years of rent up front, which raises the obvious question of where that money is meant to come from. After that comes procuring the equipment, installing it, and hiring the people to run it. You can easily be twelve or eighteen months in before you have built anything at all.
            </p>
            <p>
              Hardware has never had an AWS equivalent. Every founder ends up reinventing the same wheels, finding engineers, finding investors, sorting out intellectual property, building a finance team, all pre-revenue, all without the budget for any of it. Fractional Forge is my attempt at that equivalent: 13,700 UK and European manufacturers who already have the building and the machinery, an investor database of 7,800 firms, specialists across thirteen disciplines, and a marketplace of experienced fractional executives, all in one place.
            </p>
            <p>
              Have a look and let me know how you get on.
            </p>
            <p className="text-muted-foreground font-semibold pt-2">
              — Tristan Fischer, Founder
            </p>
            <div className="pt-4">
              <Link
                href="/story"
                className="inline-flex items-center gap-1.5 text-sm text-international-orange hover:text-international-orange-hover font-semibold transition-colors"
              >
                Read the full story <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </AnimatedSection>

        {/* Further reading — articles */}
        <AnimatedSection className="text-center mb-8 sm:mb-10 md:mb-12">
          <h3 className="font-playfair text-xl sm:text-2xl md:text-3xl font-black mb-2 leading-tight">
            Further reading
          </h3>
          <p className="text-muted-foreground text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Longer essays on the eighteen-month trap, the AWS-for-hardware question, and why shared infrastructure always wins.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.1}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
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
    <section id="pricing" className="py-12 sm:py-16 md:py-20 lg:py-24 bg-muted/30 border-t border-muted scroll-mt-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-14">
          <h2 className="font-playfair text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Start free. Scale <span className="text-international-orange">when ready.</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            Start free with 50 AI assists and specialist support across thirteen disciplines. Upgrade when you need more.
          </p>
        </AnimatedSection>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 mb-10 sm:mb-12">
          {PRICING_TIERS.map((tier) => {
            const isRecommended = tier.name === "Starter"
            return (
              <AnimatedCard key={tier.name}>
                <Card
                  className={`hover:-translate-y-0.5 active:scale-[0.99] duration-200 transition-all h-full ${
                    isRecommended
                      ? "border-international-orange bg-international-orange/[0.05] shadow-md"
                      : ""
                  }`}
                >
                  <CardContent className="p-6 sm:p-8 text-center flex flex-col gap-3">
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <p className="text-xs font-mono uppercase tracking-widest text-international-orange">
                        {tier.name}
                      </p>
                      {isRecommended && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-international-orange text-white text-[9px] font-mono uppercase tracking-widest">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-2xl sm:text-3xl font-black text-foreground">{tier.price}</p>
                    <p className="text-sm text-muted-foreground">{tier.detail}</p>
                  </CardContent>
                </Card>
              </AnimatedCard>
            )
          })}
        </StaggerContainer>

        <PricingComparisonTable />

        <AnimatedSection className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-10 sm:mt-12">
          <motion.div whileHover={buttonHover} whileTap={buttonTap}>
            <Link href="/join" className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-3.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px]">
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

function ProductShowcaseSection() {
  return (
    <section className="py-12 sm:py-16 md:py-20 lg:py-24 bg-background border-t border-muted">
      <ProductShowcase />
    </section>
  )
}

function FAQSection() {
  return (
    <section id="faq" className="py-12 sm:py-16 md:py-20 lg:py-24 bg-background border-t border-muted scroll-mt-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-14">
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
