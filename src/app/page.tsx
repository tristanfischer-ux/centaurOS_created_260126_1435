"use client"

import Image from "next/image"
import Link from "next/link"
import { ProductShowcase } from "@/components/marketing/product-showcase"
import { MeetingFlowSection } from "@/components/marketing/meeting-flow"
import { useState, useEffect } from "react"
import {
  motion,
  useScroll,
  useTransform,
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
  Clock,
  Banknote,
  TrendingDown,
  Zap,
  Check,
  Briefcase,
  Brain,
  Factory,
  Workflow,
  Shield,
  UserCheck,
  DollarSign,
  CheckCircle2,
  Rocket,
  GraduationCap,
  LineChart,
  Building2,
  Beaker,
  Lock,
  Scale,
} from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

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

/**
 * Marketing landing page — unified narrative arc.
 *
 * INTENT: Tells one story: Problem -> Solution (with photos and personality
 * woven in) -> Who It's For (compact, equal) -> Trust -> FAQ -> CTA.
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-accent-foreground focus:rounded-md"
      >
        Skip to main content
      </a>

      {/* Sticky Navigation */}
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
            <a href="#solution" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors">
              The Solution
            </a>
            <a href="#the-gap" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors">
              The Problem
            </a>
            <a href="#for-you" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors">
              Who It&apos;s For
            </a>
            <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors">
              Pricing
            </Link>
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
                Get Started Free
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
                    Get Started Free
                  </Link>
                  {[
                    { href: "#solution", label: "The Solution" },
                    { href: "#the-gap", label: "The Problem" },
                    { href: "#for-you", label: "Who It's For" },
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
        <HeroSection />
        <HowItWorksStrip />
        <ProductShowcase />
        <MeetingFlowSection />
        <SolutionSection />
        <WhyNowStrip />
        <ProblemSection />
        <WhoItsForSection />
        <TrustStrip />
        <FinalCTASection />
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
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="py-10 sm:py-12 md:py-16 border-t border-muted bg-muted pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-12 md:pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-8">
            <div className="col-span-2">
              <p className="text-base sm:text-lg font-bold tracking-tight mb-2 sm:mb-3">
                FRACTIONAL FORGE
              </p>
              <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                Expert teams, AI-enabled execution, and manufacturing capacity — without owning a factory.
              </p>
            </div>
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2 sm:mb-3">Platform</p>
              <div className="flex flex-col gap-1 sm:gap-2">
                <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center">Pricing</Link>
                <a href={`${APP_DOMAIN}/login`} className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center">Login</a>
                <Link href="/join" className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center">Get Started Free</Link>
              </div>
            </div>
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2 sm:mb-3">Join As</p>
              <div className="flex flex-col gap-1 sm:gap-2">
                <Link href="/join?role=founder" className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center">Founder</Link>
                <Link href="/join?role=executive" className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center">Expert / Factory</Link>
                <Link href="/join?role=apprentice" className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center">Apprentice</Link>
              </div>
            </div>
          </div>
          <div className="border-t border-muted pt-6 sm:pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <p className="text-xs sm:text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Fractional Forge Ltd. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <Link href="/terms" className="hover:text-foreground transition-colors min-h-[44px] flex items-center">Terms</Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors min-h-[44px] flex items-center">Privacy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * HERO
 * ═══════════════════════════════════════════════════════════════════════ */

function HeroSection() {
  const isMobile = useIsMobile()
  const { scrollY } = useScroll()
  const parallaxY = useTransform(scrollY, [0, 500], [0, isMobile ? 0 : 150])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [memberCount, setMemberCount] = useState<number | null>(null)

  const heroImages = [
    { src: "/images/hero-robotic-steel.png", alt: "Robotic arm 3D printing steel structure" },
    { src: "/images/hero-titanium-printing.png", alt: "Titanium 3D printing system" },
    { src: "/images/hero-plastic-printing.png", alt: "Advanced polymer 3D printing farm" },
    { src: "/images/hero-injection-moulding.png", alt: "Clean injection moulding manufacturing" },
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % heroImages.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [heroImages.length])

  useEffect(() => {
    async function fetchStats(): Promise<void> {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)
        const res = await fetch("/api/marketing/stats", { signal: controller.signal })
        clearTimeout(timeoutId)
        if (res.ok) {
          const data = await res.json()
          setMemberCount(data.foundingMembers ?? null)
        }
      } catch {
        // Graceful fallback
      }
    }
    fetchStats()
  }, [])

  return (
    <section className="relative min-h-[85vh] sm:min-h-[90vh] md:min-h-screen flex items-center justify-center overflow-hidden bg-background">
      <motion.div style={{ y: parallaxY }} className="absolute inset-0 will-change-transform">
        <AnimatePresence>
          <motion.div
            key={currentImageIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="absolute inset-0"
          >
            <Image
              src={heroImages[currentImageIndex].src}
              alt={heroImages[currentImageIndex].alt}
              fill
              className="object-cover object-center"
              priority
              sizes="100vw"
            />
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-background via-background/60 to-background/80" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-background/50 via-transparent to-background/50" />
      </motion.div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <motion.div initial="hidden" animate="visible" variants={fadeInScale} className="inline-flex items-center gap-2 mb-5 sm:mb-6 md:mb-8 px-3 sm:px-4 py-2 border bg-card rounded-full">
          <span className="w-2 h-2 rounded-full bg-international-orange animate-pulse" />
          <span className="text-international-orange text-xs font-mono uppercase tracking-widest">
            The Operating System for Hardware Companies
          </span>
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15, duration: 0.4 }} className="text-xs sm:text-sm font-mono uppercase tracking-widest text-muted-foreground mb-4 sm:mb-5">
          Plan. Engineer. Source. Manufacture. All in one workspace.
        </motion.p>

        {memberCount !== null && memberCount > 0 ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }} className="mb-6 md:mb-8">
            <div className="inline-flex flex-col items-center gap-2">
              <p className="text-sm text-muted-foreground font-mono">
                <span className="text-2xl font-black text-international-orange">{memberCount}</span>{" "}
                of 100 founding spots claimed
              </p>
              <div className="w-36 sm:w-48 h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((memberCount / 100) * 100, 100)}%` }}
                  transition={{ delay: 0.6, duration: 1.2, ease: "easeOut" }}
                  className="h-full bg-international-orange rounded-full"
                />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }} className="mb-6 md:mb-8">
            <p className="text-sm text-muted-foreground font-mono">
              <span className="text-2xl font-black text-international-orange">Be the first</span>{" "}founding member
            </p>
          </motion.div>
        )}

        <motion.h1 initial="hidden" animate="visible" variants={heroHeadline} className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black leading-tight mb-6 md:mb-8">
          We build atoms at the{" "}
          <motion.span initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }} className="text-international-orange">
            speed of bits.
          </motion.span>
        </motion.h1>

        {/* INTENT: Vision-first, not problem-first (Adrian's feedback + Patrick Winston's
            "empowerment promise"). Lead with what the world looks like WITH Fractional Forge.
            Activates Positive Emotional Attractor (PEA) — openness and willingness to act.
            Problem-first activates Task Positive Network (TPN) → narrowed attention, risk aversion. */}
        <motion.p initial="hidden" animate="visible" variants={heroTagline} className="text-foreground text-base sm:text-lg md:text-xl max-w-3xl mx-auto leading-relaxed mb-3 sm:mb-4">
          Imagine describing your product and receiving a complete engineering package — 3D CAD files, engineering drawings, material specs, and matched suppliers — in hours, not months.
        </motion.p>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.6 }} className="text-muted-foreground text-sm sm:text-base max-w-2xl mx-auto leading-relaxed mb-6 sm:mb-8 md:mb-10">
          Stop stitching together 7 tools. ForgeOS combines project management, AI engineering, team coordination, and supplier matching — so you can ship hardware at software speed.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.6 }} className="flex flex-col items-center gap-4 w-full sm:w-auto">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto">
            <motion.div whileHover={buttonHover} whileTap={buttonTap} className="w-full sm:w-auto">
              <Link href="/join" className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-4 text-sm font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] w-full sm:w-auto">
                Get Started Free <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
            <a href="#solution" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm font-mono tracking-wider uppercase transition-colors min-h-[48px]">
              See How It Works <ChevronDown className="h-4 w-4" />
            </a>
          </div>
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
 * THE PROBLEM — Software vs Hardware mismatch
 * ═══════════════════════════════════════════════════════════════════════ */

const PAIN_STATS = [
  { icon: Clock, stat: "12–18 months", label: "To first prototype", detail: "Leases, equipment, hiring — all before a single part is made" },
  { icon: Banknote, stat: "£50–100k", label: "Monthly burn rate", detail: "Salaries for staff you hired in advance, waiting for work" },
  { icon: TrendingDown, stat: "30–40%", label: "Equity given away", detail: "Raising millions just to fund infrastructure, not innovation" },
] as const

const BRIDGE_ITEMS = [
  { pain: "Lease a factory, buy equipment", solution: "Use cloud factories with spare capacity" },
  { pain: "Hire full-time teams in advance", solution: "Fractional experts on demand" },
  { pain: "18-month timelines", solution: "Start building from day one" },
  { pain: "Raise millions before building", solution: "Start lean. Keep your equity." },
] as const

function ProblemSection() {
  return (
    <section id="the-gap" className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-16">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">The Old Way</span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            This Is What We&apos;re <span className="text-international-orange">Replacing.</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-3xl mx-auto leading-relaxed">
            Hardware companies have always had to lease premises, buy equipment, and hire full teams before building the first prototype. By the time your physical infrastructure catches up, your ideas have moved on.
          </p>
        </AnimatedSection>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 mb-10 sm:mb-12 md:mb-16">
          {PAIN_STATS.map((item) => {
            const Icon = item.icon
            return (
              <AnimatedCard key={item.label} className="text-center p-4 sm:p-6 rounded-xl border bg-card">
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-destructive/10 mb-3">
                  <Icon className="h-5 w-5 text-destructive" />
                </div>
                <p className="text-lg sm:text-2xl md:text-3xl font-black text-destructive mb-1">{item.stat}</p>
                <p className="text-xs sm:text-sm font-mono uppercase tracking-wider text-muted-foreground mb-1">{item.label}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.detail}</p>
              </AnimatedCard>
            )
          })}
        </StaggerContainer>

        <AnimatedSection>
          <div className="relative border-2 border-international-orange rounded-xl overflow-hidden bg-card">
            <div className="bg-international-orange/5 px-5 sm:px-8 py-5 sm:py-6 text-center border-b border-international-orange/20">
              <div className="inline-flex items-center gap-2 mb-2">
                <Zap className="h-5 w-5 text-international-orange" />
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-international-orange">The Fractional Forge Way</span>
              </div>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-foreground leading-tight">
                Move as Fast as <span className="text-international-orange">Your Ideas.</span>
              </h3>
            </div>
            <div className="p-5 sm:p-8">
              <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 mb-6 sm:mb-8">
                {BRIDGE_ITEMS.map((item) => (
                  <AnimatedCard key={item.pain} className="rounded-lg border bg-muted/30 p-4 flex flex-col">
                    <p className="text-xs text-destructive line-through mb-2">{item.pain}</p>
                    <p className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Check className="h-4 w-4 text-status-success flex-shrink-0" />
                      {item.solution}
                    </p>
                  </AnimatedCard>
                ))}
              </StaggerContainer>
              <div className="text-center">
                <motion.div whileHover={buttonHover} whileTap={buttonTap} className="inline-block">
                  <a href="#solution" className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-3.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px]">
                    See How We Solve It <ArrowRight className="h-4 w-4" />
                  </a>
                </motion.div>
              </div>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * WHY NOW — Evidence strip backing the supply-side thesis
 * ═══════════════════════════════════════════════════════════════════════ */

const WHY_NOW_STATS = [
  { value: "72%", label: "Average UK manufacturing capacity utilisation", source: "ONS, 2024" },
  { value: "140,000+", label: "SME manufacturers in the UK alone", source: "Make UK" },
  { value: "28%", label: "Of UK factory capacity sits idle on average", source: "ONS capacity utilisation survey" },
] as const

function WhyNowStrip() {
  return (
    <section className="py-8 sm:py-12 bg-international-orange/5 border-y border-international-orange/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-6 sm:mb-8">
          <h2 className="text-xs text-international-orange font-mono uppercase tracking-widest mb-2">Why Now</h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
            Factories already have the capacity. They just need the work. We connect companies who need manufacturing with suppliers who have machines sitting idle.
          </p>
        </AnimatedSection>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {WHY_NOW_STATS.map((stat) => (
            <AnimatedCard key={stat.label} className="text-center p-4 sm:p-5 rounded-xl border bg-card">
              <p className="text-2xl sm:text-3xl font-black text-international-orange mb-1">{stat.value}</p>
              <p className="text-xs sm:text-sm text-foreground font-medium mb-1">{stat.label}</p>
              <p className="text-[10px] text-muted-foreground font-mono">{stat.source}</p>
            </AnimatedCard>
          ))}
        </StaggerContainer>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * HOW IT WORKS — 3-step process walkthrough
 * ═══════════════════════════════════════════════════════════════════════ */

function HowItWorksStrip() {
  const steps = [
    { number: "1", title: "Describe Your Product", detail: "Tell us what you want to build. Upload CAD files, sketches, or just describe your idea in plain English." },
    { number: "2", title: "Get Your Engineering Package", detail: "Receive STEP files, 7 engineering drawings, material specs, a bill of materials, DFM analysis, and cost estimates — grounded in 220+ ISO/DIN/BS standards and real supplier data." },
    { number: "3", title: "Match With Manufacturers", detail: "Our 6-factor matching algorithm scores UK suppliers on capability, process, material, quality, and relevance — then generates RFQ packs ready to send." },
  ]

  return (
    <section className="py-12 sm:py-16 md:py-24 border-t border-muted scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12">
          <h2 className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4">How It Works</h2>
          <p className="text-2xl sm:text-3xl md:text-4xl font-black mb-4 leading-tight">
            Three Steps to <span className="text-international-orange">Manufactured Parts.</span>
          </p>
        </AnimatedSection>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          {steps.map((step) => (
            <AnimatedCard key={step.number} className="text-center">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-international-orange text-white text-xl font-black mb-4">
                {step.number}
              </div>
              <h3 className="text-base sm:text-lg font-black text-foreground mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.detail}</p>
            </AnimatedCard>
          ))}
        </StaggerContainer>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE SOLUTION — Unified pillars with photos and founder voice
 *
 * DECISION: Each pillar has an image, a headline, and a founder-voice quote —
 * telling the story once with personality rather than abstract cards.
 * ═══════════════════════════════════════════════════════════════════════ */

const SOLUTION_PILLARS = [
  {
    icon: Briefcase,
    label: "Fractional Experts",
    headline: "Senior Expertise, On Demand",
    image: "/images/marketing/role-executive.png",
    imageAlt: "Experienced engineering executive",
    quote: "Don't burn seed capital on a standing army. Launch with a fractional team — seasoned engineers, marketers, and operators with decades of experience. No full-time hires, no six-figure salaries before your first prototype.",
    highlights: [
      "Manufacturing, design, supply chain, and commercial specialists",
      "Downloadable engineering reports in PPTX, Word, and PDF",
      "Cost estimation with parts-level breakdown and buy/make classification",
    ],
  },
  {
    icon: Brain,
    label: "AI-Enabled Execution",
    headline: "AI Speed. Human Judgement.",
    image: "/images/marketing/role-apprentice.png",
    imageAlt: "Young engineers working with AI tools",
    quote: "Ambitious apprentices — digital natives fresh from university — execute tasks using AI tools at remarkable speed. Senior experts review and verify every output. You aren't hiring juniors. You're deploying Founders-in-Training.",
    highlights: [
      "13 AI specialists with engineering calculation tools",
      "4-stage design review: manufacturability, engineering, integration, supply chain",
      "Every output grounded in 220+ design standards and real supplier data",
    ],
  },
  {
    icon: Factory,
    label: "Cloud Manufacturing",
    headline: "Factories Without the Factory",
    image: "/images/marketing/factory-partner.png",
    imageAlt: "Factory floor with manufacturing equipment",
    quote: "Across the UK, factories have spare capacity waiting to be filled. We identify the right facilities, generate automated RFQ packs, and get your products built — without you leasing a single square metre.",
    highlights: [
      "9,900+ UK manufacturers and suppliers on the marketplace",
      "Automated RFQ packs with engineering specs, materials, and tolerances",
      "6-factor supplier matching: capability, process, material, quality, and more",
    ],
  },
] as const

function SolutionSection() {
  return (
    <section id="solution" className="py-12 sm:py-16 md:py-28 bg-background border-t border-muted scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-20">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            The Cloud Factory Ecosystem
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            You Wouldn&apos;t Build Server Racks
            <br className="hidden sm:block" />{" "}to Launch an App.{" "}
            <br className="hidden sm:block" />
            <span className="text-international-orange">So Why Build a Factory?</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Modern software companies use AWS instead of buying servers.
            Fractional Forge gives hardware companies the same model —
            expert teams, AI-enabled execution, and manufacturing capacity, all on demand.
          </p>
        </AnimatedSection>

        <StaggerContainer className="space-y-6 sm:space-y-8 md:space-y-12 mb-10 sm:mb-12 md:mb-16">
          {SOLUTION_PILLARS.map((pillar, index) => {
            const Icon = pillar.icon
            const isEven = index % 2 === 1
            return (
              <AnimatedCard
                key={pillar.label}
                className="border bg-card rounded-xl overflow-hidden"
              >
                <div className={`grid grid-cols-1 lg:grid-cols-2 ${isEven ? "lg:direction-rtl" : ""}`}>
                  {/* Image */}
                  <div className={`relative h-64 sm:h-72 lg:h-auto lg:min-h-[360px] ${isEven ? "lg:order-2" : ""}`}>
                    <Image
                      src={pillar.image}
                      alt={pillar.imageAlt}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                  </div>

                  {/* Content */}
                  <div className={`p-6 sm:p-8 md:p-10 flex flex-col justify-center ${isEven ? "lg:order-1" : ""}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-international-orange/10 flex items-center justify-center">
                        <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-international-orange" />
                      </div>
                      <span className="text-xs font-mono font-bold uppercase tracking-widest text-international-orange">
                        {pillar.label}
                      </span>
                    </div>

                    <h3 className="text-xl sm:text-2xl md:text-3xl font-black mb-4 text-foreground leading-tight">
                      {pillar.headline}
                    </h3>

                    <p className="text-muted-foreground text-sm sm:text-base leading-relaxed mb-6 italic">
                      &ldquo;{pillar.quote}&rdquo;
                    </p>

                    <ul className="space-y-2.5">
                      {pillar.highlights.map((highlight) => (
                        <li key={highlight} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                          <div className="mt-1 h-1.5 w-1.5 rounded-full bg-international-orange flex-shrink-0" />
                          {highlight}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </AnimatedCard>
            )
          })}
        </StaggerContainer>

        {/* ForgeOS coordinator strip */}
        <AnimatedSection>
          <div className="relative border-2 border-international-orange rounded-xl overflow-hidden bg-card">
            <div className="bg-international-orange/5 px-5 sm:px-8 py-5 sm:py-6 text-center border-b border-international-orange/20">
              <div className="inline-flex items-center gap-2 mb-2">
                <Workflow className="h-5 w-5 text-international-orange" />
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-international-orange">
                  Powered by ForgeOS
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-foreground leading-tight">
                One Operating System. <span className="text-international-orange">Everything Coordinated.</span>
              </h3>
            </div>
            <div className="p-5 sm:p-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-center">
                {[
                  { stat: "Objectives & Tasks", description: "Everyone knows what they're doing and where the blockages are" },
                  { stat: "Guided Manufacturing", description: "Understand the systems required to make your product before you commit" },
                  { stat: "Automated RFQs", description: "Full request-for-quote packs sent to factories that match your needs" },
                ].map((item) => (
                  <div key={item.stat} className="p-3 sm:p-4">
                    <p className="text-sm sm:text-base font-bold text-foreground mb-1">{item.stat}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 sm:mt-8 text-center">
                <motion.div whileHover={buttonHover} whileTap={buttonTap} className="inline-block">
                  <Link href="/join" className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-3.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px]">
                    Get Started Free <ArrowRight className="h-4 w-4" />
                  </Link>
                </motion.div>
              </div>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * WHO IT'S FOR — Compact grid, all audiences equal
 * ═══════════════════════════════════════════════════════════════════════ */

const AUDIENCES = [
  {
    icon: Rocket,
    role: "I need to get a product manufactured",
    value: "Startups & product companies",
    description: "Go from CAD to manufactured product without leasing a factory or hiring a full engineering team. AI handles the engineering package; vetted suppliers handle production.",
    cta: "Start Building",
    href: "/join?role=founder",
  },
  {
    icon: Building2,
    role: "I have spare factory capacity",
    value: "Manufacturers & job shops",
    description: "List your available capacity on the marketplace. We send you qualified RFQs from startups ready to manufacture — with complete engineering packages and material specs.",
    cta: "List Your Capacity",
    href: "/join?role=executive",
  },
  {
    icon: Briefcase,
    role: "I have engineering expertise to offer",
    value: "Fractional executives & specialists",
    description: "Join as a fractional expert to accelerate deep-tech startups. Share your manufacturing, design, or supply chain knowledge — on your schedule.",
    cta: "Join as Expert",
    href: "/join?role=executive",
  },
  {
    icon: LineChart,
    role: "I invest in hardware startups",
    value: "VCs & accelerators",
    description: "Compressed validation cycles mean portfolio companies can validate cheaper, kill failures faster, and get to market with less capital.",
    cta: "Partner With Us",
    href: "/join",
  },
  {
    icon: GraduationCap,
    role: "I want to learn hardware",
    value: "Apprentices & graduates",
    description: "Pair with a seasoned executive, learn AI-powered engineering workflows, and build real products — not just prototypes.",
    cta: "Start Apprenticeship",
    href: "/join?role=apprentice",
  },
  {
    icon: Beaker,
    role: "I want to commercialise research",
    value: "Universities & research labs",
    description: "Turn IP-rich research into venture-backed products. Your researchers get access to manufacturing infrastructure without leaving the lab.",
    cta: "Partner",
    href: "/join",
  },
] as const

function WhoItsForSection() {
  return (
    <section id="for-you" className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-16">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            Find Your Role
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            What Do You <span className="text-international-orange">Need?</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Startups needing manufacturing. Factories with spare capacity. Experts wanting to help. Each side of the marketplace makes the other stronger.
          </p>
        </AnimatedSection>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {AUDIENCES.map((audience) => {
            const Icon = audience.icon
            return (
              <AnimatedCard key={audience.role} className="border bg-card rounded-xl p-5 sm:p-6 flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-lg bg-international-orange/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5 text-international-orange" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-foreground uppercase tracking-wide">{audience.role}</h3>
                    <p className="text-xs text-international-orange font-mono">{audience.value}</p>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">
                  {audience.description}
                </p>

                <Link
                  href={audience.href}
                  className="text-xs font-mono font-bold uppercase tracking-widest text-international-orange hover:text-international-orange-hover transition-colors inline-flex items-center gap-1.5"
                >
                  {audience.cta} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </AnimatedCard>
            )
          })}
        </StaggerContainer>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * TRUST STRIP
 * ═══════════════════════════════════════════════════════════════════════ */

const TRUST_CARDS = [
  {
    icon: Shield,
    title: "Your IP Stays Yours",
    description:
      "Every design, prototype, and product you create belongs entirely to you. Contractually guaranteed.",
    link: { href: "/terms#ip", label: "Learn more" },
  },
  {
    icon: Lock,
    title: "Confidentiality Built In",
    description:
      "Designs visible only to team members you choose. Factory partners see only what\u2019s needed to quote and manufacture. All parties sign confidentiality agreements.",
    link: null,
  },
  {
    icon: Scale,
    title: "Clear Risk Allocation",
    description:
      "Manufacturing defects are the factory\u2019s responsibility. Design intent is yours. Written terms for every engagement.",
    link: { href: "/terms#risk", label: "Learn more" },
  },
] as const

function TrustStrip() {
  return (
    <section className="py-12 sm:py-16 md:py-24 bg-background border-t border-muted">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12">
          <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-3 block">
            Protection &amp; Trust
          </span>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black">
            How We Protect You
          </h2>
        </AnimatedSection>

        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TRUST_CARDS.map((card) => {
            const Icon = card.icon
            return (
              <AnimatedCard key={card.title}>
                <div className="bg-card border rounded-xl p-6 sm:p-8 h-full flex flex-col">
                  <div className="w-12 h-12 rounded-full bg-international-orange/10 flex items-center justify-center mb-5">
                    <Icon className="h-6 w-6 text-international-orange" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {card.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                    {card.description}
                  </p>
                  {card.link && (
                    <Link
                      href={card.link.href}
                      className="text-sm text-international-orange hover:underline mt-4 inline-flex items-center gap-1"
                    >
                      {card.link.label}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </AnimatedCard>
            )
          })}
        </StaggerContainer>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * FINAL CTA
 * ═══════════════════════════════════════════════════════════════════════ */

function FinalCTASection() {
  return (
    <section className="py-12 sm:py-16 md:py-24 bg-muted/30 border-t border-muted">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <AnimatedSection>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Move as Fast as <span className="text-international-orange">Your Ideas.</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-xl mx-auto leading-relaxed mb-6 sm:mb-8">
            Stop burning cash on infrastructure you don&apos;t need. Join the founders, experts, and factories building hardware at software speed.
          </p>
          <motion.div whileHover={buttonHover} whileTap={buttonTap} className="inline-block">
            <Link href="/join" className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-10 py-4 text-sm font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px]">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </AnimatedSection>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * FAQ
 * ═══════════════════════════════════════════════════════════════════════ */

const FAQS = [
  {
    question: "What is a Cloud Factory?",
    answer: "Think of it like AWS for manufacturing. Just as modern software companies use cloud compute instead of building their own server racks, Fractional Forge lets you build hardware products using existing factory capacity, expert teams, and AI-enabled execution — without owning any of it. You get the same results, at a fraction of the cost and time.",
  },
  {
    question: "Who owns the IP I create on the platform?",
    answer: "You do. 100%. Fractional Forge provides the team and infrastructure, but all intellectual property, designs, prototypes, and products belong entirely to you. This is baked into our contracts.",
  },
  {
    question: "How does the fractional model actually work?",
    answer: "Instead of hiring a full-time engineering team, you work with experienced executives and engineers on a fractional (part-time) basis. They direct AI-enabled apprentices who execute at speed, then verify the output based on decades of real-world experience. You only pay for the hours and outcomes you need.",
  },
  {
    question: "How quickly can I go from idea to prototype?",
    answer: "It depends on complexity, but the key advantage is eliminating the months of hiring, onboarding, and infrastructure setup that typically precede any actual engineering work. Because you're plugging into existing experts and factory capacity from day one, you can start building immediately instead of spending months assembling the team first.",
  },
  {
    question: "How much does it cost?",
    answer: "ForgeOS is free to start with a 14-day full-access trial. After that, plans start at £49/month for startups. All new accounts get 0% marketplace fees on their first 3 orders. No equity required — check our pricing page for full details.",
  },
  {
    question: "Can factory partners steal my idea?",
    answer: "No. All factory partners are bound by confidentiality agreements before they see any of your data. They only receive the manufacturing specifications needed to quote and produce — never your full designs, strategy, or broader project context. You control exactly what each collaborator sees.",
  },
  {
    question: "Who is liable if something goes wrong?",
    answer: "Responsibility is clearly allocated in writing. Factory partners are responsible for manufacturing defects and spec conformance. You are responsible for your design specifications. Fractional Forge facilitates the relationship but does not guarantee manufacturing outcomes. Written terms govern every engagement.",
  },
] as const

function FAQSection() {
  return (
    <section id="faq" className="py-12 sm:py-16 md:py-28 bg-background border-t border-muted scroll-mt-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-16">
          <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            Questions &amp; Answers
          </span>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black mb-4 sm:mb-6">
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
                <AccordionTrigger className="text-left text-sm sm:text-base font-semibold py-4 sm:py-5 hover:no-underline">
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
