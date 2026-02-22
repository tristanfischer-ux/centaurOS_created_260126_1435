"use client"

import Image from "next/image"
import Link from "next/link"
import { useState, useEffect } from "react"
import {
  motion,
  useScroll,
  useTransform,
  AnimatePresence,
} from "framer-motion"
import {
  fadeInUp,
  fadeInScale,
  heroHeadline,
  heroTagline,
  buttonHover,
  buttonTap,
  AnimatedHeader,
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
 * Hybrid marketing page combining the old structure's personality with
 * the current version's conversion polish.
 *
 * INTENT: The old page treated all audiences equally and had a distinctive
 * brand voice. The current page had better conversion infrastructure but
 * alienated non-founder audiences with a "Primary Audience" badge.
 * This hybrid takes the best of both.
 */
export default function PreviewLandingPage() {
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
      {/* Preview Banner */}
      <div className="bg-muted border-b text-center py-2 px-4 text-xs text-muted-foreground font-mono tracking-wider">
        Preview mode —{" "}
        <Link href="/" className="text-international-orange hover:underline">
          View current page &rarr;
        </Link>
      </div>

      {/* Skip Navigation */}
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
            href="/preview-landing"
            className="text-base sm:text-lg md:text-xl font-bold tracking-tight"
          >
            FRACTIONAL FORGE
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#the-gap"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              The Problem
            </a>
            <a
              href="#people"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              The People
            </a>
            <a
              href="#network"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              The Network
            </a>
            <a
              href="#os"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              The OS
            </a>
            <a
              href="#faq"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              FAQ
            </a>
            <a
              href={`${APP_DOMAIN}/login`}
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              Login
            </a>
            <motion.div whileHover={buttonHover} whileTap={buttonTap}>
              <Link
                href="/join"
                className="inline-flex items-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-5 py-2.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md"
              >
                Join the Forge
              </Link>
            </motion.div>
          </div>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Animated Mobile Menu */}
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
                <div className="px-4 sm:px-6 py-4 flex flex-col gap-1">
                  <Link
                    href="/join"
                    className="mb-3 bg-international-orange hover:bg-international-orange-hover text-white py-3.5 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] flex items-center justify-center"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Join the Forge
                  </Link>
                  {[
                    { href: "#the-gap", label: "The Problem" },
                    { href: "#people", label: "The People" },
                    { href: "#network", label: "The Network" },
                    { href: "#os", label: "The OS" },
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

      {/* Main Content */}
      <main id="main-content">
        <HeroSection />
        <SoftwareVsHardwareSection />
        <CloudFactorySection />
        <PeopleSection />
        <NetworkSection />
        <OSSection />
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
            className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-sm border-t border-muted px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
          >
            <Link
              href="/join"
              className="flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white py-3 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] w-full"
            >
              Join the Forge
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="py-10 sm:py-12 md:py-16 border-t border-muted bg-muted pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-12 md:pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-8">
            <div className="col-span-2">
              <p className="text-base sm:text-lg font-bold tracking-tight mb-2 sm:mb-3">
                FRACTIONAL FORGE
              </p>
              <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                Access expert teams, AI-enabled execution, and manufacturing
                capacity — without owning a factory.
              </p>
            </div>

            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2 sm:mb-3">
                Platform
              </p>
              <div className="flex flex-col gap-1 sm:gap-2">
                <Link
                  href="/pricing"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center"
                >
                  Pricing
                </Link>
                <a
                  href={`${APP_DOMAIN}/login`}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center"
                >
                  Login
                </a>
                <Link
                  href="/join"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center"
                >
                  Join the Forge
                </Link>
              </div>
            </div>

            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2 sm:mb-3">
                Join As
              </p>
              <div className="flex flex-col gap-1 sm:gap-2">
                <Link
                  href="/join?role=founder"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center"
                >
                  Founder
                </Link>
                <Link
                  href="/join?role=executive"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center"
                >
                  Expert / Factory
                </Link>
                <Link
                  href="/join?role=apprentice"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center"
                >
                  Apprentice
                </Link>
              </div>
            </div>
          </div>

          <div className="border-t border-muted pt-6 sm:pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <p className="text-xs sm:text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Fractional Forge Ltd. All rights
              reserved.
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <Link
                href="/terms"
                className="hover:text-foreground transition-colors min-h-[44px] flex items-center"
              >
                Terms
              </Link>
              <Link
                href="/privacy"
                className="hover:text-foreground transition-colors min-h-[44px] flex items-center"
              >
                Privacy
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * HERO — Old headline + rotating manufacturing images + current CTAs
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
      {/* Rotating background images with parallax */}
      <motion.div
        style={{ y: parallaxY }}
        className="absolute inset-0 will-change-transform"
      >
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

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
        {/* Early Access Badge */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInScale}
          className="inline-flex items-center gap-2 mb-5 sm:mb-6 md:mb-8 px-3 sm:px-4 py-2 border bg-card rounded-full"
        >
          <span className="w-2 h-2 rounded-full bg-international-orange animate-pulse" />
          <span className="text-international-orange text-xs font-mono uppercase tracking-widest">
            Early Access &mdash; Founding Members Only
          </span>
        </motion.div>

        {/* Founding member counter */}
        {memberCount !== null ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mb-6 md:mb-8"
          >
            <div className="inline-flex flex-col items-center gap-2">
              {memberCount > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground font-mono">
                    <span className="text-2xl font-black text-international-orange">
                      {memberCount}
                    </span>{" "}
                    of 100 founding spots claimed
                  </p>
                  <div className="w-36 sm:w-48 h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.min((memberCount / 100) * 100, 100)}%`,
                      }}
                      transition={{ delay: 0.6, duration: 1.2, ease: "easeOut" }}
                      className="h-full bg-international-orange rounded-full"
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground font-mono">
                  <span className="text-2xl font-black text-international-orange">
                    Be the first
                  </span>{" "}
                  founding member
                </p>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mb-6 md:mb-8"
          >
            <p className="text-sm text-muted-foreground font-mono">
              <span className="text-2xl font-black text-international-orange">
                Be the first
              </span>{" "}
              to join
            </p>
          </motion.div>
        )}

        {/* Main Headline — from the old version */}
        <motion.h1
          initial="hidden"
          animate="visible"
          variants={heroHeadline}
          className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black leading-tight mb-6 md:mb-8"
        >
          We build atoms at the{" "}
          <motion.span
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
            className="text-international-orange"
          >
            speed of bits.
          </motion.span>
        </motion.h1>

        {/* Tagline */}
        <motion.p
          initial="hidden"
          animate="visible"
          variants={heroTagline}
          className="text-foreground text-base sm:text-lg md:text-xl max-w-3xl mx-auto leading-relaxed mb-6 sm:mb-8 md:mb-10"
        >
          Access fractional experts, AI-enabled execution, and on-demand
          manufacturing capacity — all through one platform.
          No factory required.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="flex flex-col items-center gap-4 w-full sm:w-auto"
        >
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto">
            <motion.div
              whileHover={buttonHover}
              whileTap={buttonTap}
              className="w-full sm:w-auto"
            >
              <Link
                href="/join"
                className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-4 text-sm font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] w-full sm:w-auto"
              >
                Join the Forge
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
            <a
              href="#the-gap"
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm font-mono tracking-wider uppercase transition-colors min-h-[48px]"
            >
              See the Problem
              <ChevronDown className="h-4 w-4" />
            </a>
          </div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 0.6 }}
        className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
      >
        <span className="text-xs text-muted-foreground font-mono uppercase tracking-widest hidden sm:block">
          Scroll
        </span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
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
  {
    icon: Clock,
    stat: "12–18 months",
    label: "To first prototype",
    detail: "Leases, equipment, hiring — all before a single part is made",
  },
  {
    icon: Banknote,
    stat: "£50–100k",
    label: "Monthly burn rate",
    detail: "Salaries for staff you hired in advance, waiting for work",
  },
  {
    icon: TrendingDown,
    stat: "30–40%",
    label: "Equity given away",
    detail: "Raising millions just to fund infrastructure, not innovation",
  },
] as const

const BRIDGE_ITEMS = [
  { pain: "Lease a factory, buy equipment", solution: "Use cloud factories with spare capacity" },
  { pain: "Hire full-time teams in advance", solution: "Fractional experts on demand" },
  { pain: "18-month timelines", solution: "Start building from day one" },
  { pain: "Raise millions before building", solution: "Start lean. Keep your equity." },
] as const

function SoftwareVsHardwareSection() {
  return (
    <section
      id="the-gap"
      className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-16">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            The Problem
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Your Designs Move at{" "}
            <span className="text-status-success">Software Speed.</span>
            <br />
            Your Factory Moves at{" "}
            <span className="text-destructive">Physical Speed.</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-3xl mx-auto leading-relaxed">
            CAD designs iterate in hours. But leasing premises, buying equipment,
            and hiring engineers takes months. By the time your physical
            infrastructure catches up, your ideas have moved on — forcing you to
            ship an outdated product or delay again.
          </p>
        </AnimatedSection>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 mb-10 sm:mb-12 md:mb-16">
          {PAIN_STATS.map((item) => {
            const Icon = item.icon
            return (
              <AnimatedCard
                key={item.label}
                className="text-center p-4 sm:p-6 rounded-xl border bg-card"
              >
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-destructive/10 mb-3">
                  <Icon className="h-5 w-5 text-destructive" />
                </div>
                <p className="text-lg sm:text-2xl md:text-3xl font-black text-destructive mb-1">
                  {item.stat}
                </p>
                <p className="text-xs sm:text-sm font-mono uppercase tracking-wider text-muted-foreground mb-1">
                  {item.label}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.detail}
                </p>
              </AnimatedCard>
            )
          })}
        </StaggerContainer>

        <AnimatedSection>
          <div className="relative border-2 border-international-orange rounded-xl overflow-hidden bg-card">
            <div className="bg-international-orange/5 px-5 sm:px-8 py-5 sm:py-6 text-center border-b border-international-orange/20">
              <div className="inline-flex items-center gap-2 mb-2">
                <Zap className="h-5 w-5 text-international-orange" />
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-international-orange">
                  The Fractional Forge Way
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-foreground leading-tight">
                Move as Fast as{" "}
                <span className="text-international-orange">Your Ideas.</span>
              </h3>
            </div>

            <div className="p-5 sm:p-8">
              <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 mb-6 sm:mb-8">
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

              <div className="text-center">
                <motion.div
                  whileHover={buttonHover}
                  whileTap={buttonTap}
                  className="inline-block"
                >
                  <a
                    href="#ecosystem"
                    className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-3.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px]"
                  >
                    See How We Solve It
                    <ArrowRight className="h-4 w-4" />
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
 * CLOUD FACTORY — The three-pillar solution
 * ═══════════════════════════════════════════════════════════════════════ */

const PILLARS = [
  {
    icon: Briefcase,
    label: "Expert Marketplace",
    headline: "Senior Expertise, On Demand",
    description:
      "Access fractional executives — seasoned engineers, marketers, and operators with decades of experience — through a curated marketplace. No full-time hires. No six-figure salaries before your first prototype.",
    highlights: [
      "Experienced professionals across engineering disciplines",
      "Flexible engagement — matched to your needs",
      "Specialists in mechanical, electrical, manufacturing, and more",
    ],
  },
  {
    icon: Brain,
    label: "Human-Verified AI Execution",
    headline: "AI Speed. Human Judgement.",
    description:
      "Ambitious apprentices — digital natives fresh from university — execute tasks using AI tools at remarkable speed. Senior experts review and verify every output. The result: speed without shortcuts.",
    highlights: [
      "Senior directs. Junior executes with AI. Senior verifies.",
      "Every output grounded in real-world experience",
      "More output, lower cost than traditional hiring",
    ],
  },
  {
    icon: Factory,
    label: "Cloud Manufacturing",
    headline: "Factories Without the Factory",
    description:
      "Across the UK and Europe, factories have spare capacity waiting to be filled. ForgeOS identifies the right facilities, generates automated RFQ packs, and gets your products built — without you leasing a single square metre.",
    highlights: [
      "Access a growing network of manufacturing partners",
      "Automated RFQ generation from your designs",
      "Real factories, real equipment, zero overhead",
    ],
  },
] as const

function CloudFactorySection() {
  return (
    <section
      id="ecosystem"
      className="py-12 sm:py-16 md:py-28 bg-background border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-20">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            The Cloud Factory Ecosystem
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            You Wouldn&apos;t Build Server Racks
            <br className="hidden sm:block" />{" "}
            to Launch an App.{" "}
            <br className="hidden sm:block" />
            <span className="text-international-orange">
              So Why Build a Factory?
            </span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Modern software companies use AWS instead of buying servers.
            Fractional Forge gives hardware companies the same model —
            expert teams, AI-enabled execution, and manufacturing capacity,
            all on demand.
          </p>
        </AnimatedSection>

        <StaggerContainer className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8 mb-10 sm:mb-12 md:mb-16">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon
            return (
              <AnimatedCard
                key={pillar.label}
                className="border bg-card rounded-xl p-5 sm:p-6 md:p-8 flex flex-col"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-international-orange/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-international-orange" />
                  </div>
                  <span className="text-xs font-mono font-bold uppercase tracking-widest text-international-orange">
                    {pillar.label}
                  </span>
                </div>

                <h3 className="text-lg sm:text-xl font-black mb-2 sm:mb-3 text-foreground leading-tight">
                  {pillar.headline}
                </h3>

                <p className="text-muted-foreground text-sm leading-relaxed mb-4 sm:mb-6">
                  {pillar.description}
                </p>

                <ul className="space-y-2.5 flex-1">
                  {pillar.highlights.map((highlight) => (
                    <li
                      key={highlight}
                      className="flex items-start gap-2.5 text-sm text-muted-foreground"
                    >
                      <div className="mt-1 h-1.5 w-1.5 rounded-full bg-international-orange flex-shrink-0" />
                      {highlight}
                    </li>
                  ))}
                </ul>
              </AnimatedCard>
            )
          })}
        </StaggerContainer>

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
                One Operating System.{" "}
                <span className="text-international-orange">
                  Everything Coordinated.
                </span>
              </h3>
            </div>
            <div className="p-5 sm:p-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-center">
                {[
                  {
                    stat: "Objectives & Tasks",
                    description:
                      "Everyone knows what they're doing and where the blockages are",
                  },
                  {
                    stat: "Guided Manufacturing",
                    description:
                      "Understand the systems required to make your product before you commit",
                  },
                  {
                    stat: "Automated RFQs",
                    description:
                      "Full request-for-quote packs sent to factories that match your needs",
                  },
                ].map((item) => (
                  <div key={item.stat} className="p-3 sm:p-4">
                    <p className="text-sm sm:text-base font-bold text-foreground mb-1">
                      {item.stat}
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 sm:mt-8 text-center">
                <motion.div
                  whileHover={buttonHover}
                  whileTap={buttonTap}
                  className="inline-block"
                >
                  <Link
                    href="/join"
                    className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-3.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px]"
                  >
                    Join the Forge
                    <ArrowRight className="h-4 w-4" />
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
 * THE PEOPLE — 3 equal cards, no hierarchy (from old version)
 * ═══════════════════════════════════════════════════════════════════════ */

function PeopleSection() {
  return (
    <section id="people" className="py-12 md:py-24 bg-background border-t border-muted scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedHeader className="text-3xl sm:text-4xl md:text-5xl font-black mb-8 md:mb-16">
          THE PEOPLE.
        </AnimatedHeader>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
          {/* Founders */}
          <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col">
            <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden rounded-lg">
              <Image src="/images/marketing/role-founder.png" alt="Founders Decide" fill className="object-cover" />
            </div>
            <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">Founders Decide</span>
            <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">RETAIN YOUR EQUITY.</h3>
            <p className="text-muted-foreground text-sm leading-relaxed flex-1">
              &ldquo;Don&apos;t burn seed capital on a standing army. Launch with a fractional team. Validate fast, risk less, and retain maximum equity at Series A.&rdquo;
            </p>
            <div className="pt-4 md:pt-6 mt-4 border-t border-muted flex gap-2 md:gap-3">
              <motion.a href={`${APP_DOMAIN}/login`} whileHover={buttonHover} whileTap={buttonTap} className="flex-1 bg-muted hover:bg-secondary text-foreground py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md">
                Login
              </motion.a>
              <motion.div whileHover={buttonHover} whileTap={buttonTap} className="flex-1">
                <Link href="/join?role=founder" className="block bg-foreground hover:bg-international-orange text-background py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md">
                  Start Building
                </Link>
              </motion.div>
            </div>
          </AnimatedCard>

          {/* Executives */}
          <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col">
            <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden rounded-lg">
              <Image src="/images/marketing/role-executive.png" alt="Executives Evaluate" fill className="object-cover" />
            </div>
            <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">Executives Evaluate</span>
            <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">TRY BEFORE YOU FLY.</h3>
            <p className="text-muted-foreground text-sm leading-relaxed flex-1">
              &ldquo;Monetize elite expertise without the burnout. Join as a Fractional Executive to accelerate deep-tech startups. Then, invest in them or launch your own.&rdquo;
            </p>
            <div className="pt-4 md:pt-6 mt-4 border-t border-muted flex gap-2 md:gap-3">
              <motion.a href={`${APP_DOMAIN}/login`} whileHover={buttonHover} whileTap={buttonTap} className="flex-1 bg-muted hover:bg-secondary text-foreground py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md">
                Login
              </motion.a>
              <motion.div whileHover={buttonHover} whileTap={buttonTap} className="flex-1">
                <Link href="/join?role=executive" className="block bg-foreground hover:bg-international-orange text-background py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md">
                  Join as Expert
                </Link>
              </motion.div>
            </div>
          </AnimatedCard>

          {/* Apprentices */}
          <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col sm:col-span-2 lg:col-span-1">
            <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden rounded-lg">
              <Image src="/images/marketing/role-apprentice.png" alt="Apprentices Do" fill className="object-cover" />
            </div>
            <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">Apprentices Do</span>
            <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">10X YOUR OUTPUT.</h3>
            <p className="text-muted-foreground text-sm leading-relaxed flex-1">
              &ldquo;We pair you with a seasoned executive and teach you cutting-edge workflows, multiplying your output tenfold. You aren&apos;t a junior. You are a Founder-in-Training.&rdquo;
            </p>
            <div className="pt-4 md:pt-6 mt-4 border-t border-muted flex gap-2 md:gap-3">
              <motion.a href={`${APP_DOMAIN}/login`} whileHover={buttonHover} whileTap={buttonTap} className="flex-1 bg-muted hover:bg-secondary text-foreground py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md">
                Login
              </motion.a>
              <motion.div whileHover={buttonHover} whileTap={buttonTap} className="flex-1">
                <Link href="/join?role=apprentice" className="block bg-foreground hover:bg-international-orange text-background py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md">
                  Start Apprenticeship
                </Link>
              </motion.div>
            </div>
          </AnimatedCard>
        </StaggerContainer>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE NETWORK — 3 equal cards with photorealistic images (from old)
 * ═══════════════════════════════════════════════════════════════════════ */

function NetworkSection() {
  return (
    <section id="network" className="py-12 md:py-24 bg-background border-t border-muted scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedHeader className="text-3xl sm:text-4xl md:text-5xl font-black mb-8 md:mb-16">
          THE NETWORK.
        </AnimatedHeader>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
          {/* VCs */}
          <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col">
            <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden rounded-lg">
              <Image src="/images/marketing/vc-boardroom.png" alt="Venture capital partners reviewing portfolio" fill className="object-cover" />
            </div>
            <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">Venture Capital</span>
            <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">MORE BETS. SAME FUND.</h3>
            <p className="text-muted-foreground text-sm leading-relaxed flex-1">
              &ldquo;Hardware usually kills returns with long validation cycles. We compress timelines dramatically. Validate cheaper, kill failures faster, and place more winning bets with the same fund.&rdquo;
            </p>
            <div className="pt-4 md:pt-6 mt-4 border-t border-muted flex gap-2 md:gap-3">
              <motion.a href={`${APP_DOMAIN}/login`} whileHover={buttonHover} whileTap={buttonTap} className="flex-1 bg-muted hover:bg-secondary text-foreground py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md">
                Login
              </motion.a>
              <motion.div whileHover={buttonHover} whileTap={buttonTap} className="flex-1">
                <Link href="/join" className="block bg-foreground hover:bg-international-orange text-background py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md">
                  Partner With Us
                </Link>
              </motion.div>
            </div>
          </AnimatedCard>

          {/* Factories */}
          <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col">
            <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden rounded-lg">
              <Image src="/images/marketing/factory-partner.png" alt="Factory floor with manufacturing equipment" fill className="object-cover" />
            </div>
            <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">Factory Partners</span>
            <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">FILL SPARE CAPACITY.</h3>
            <p className="text-muted-foreground text-sm leading-relaxed flex-1">
              &ldquo;List your available capacity on the marketplace. Put your in-house experts on the platform as fractional executives. Every company they advise is a potential manufacturing order for your factory.&rdquo;
            </p>
            <div className="pt-4 md:pt-6 mt-4 border-t border-muted flex gap-2 md:gap-3">
              <motion.a href={`${APP_DOMAIN}/login`} whileHover={buttonHover} whileTap={buttonTap} className="flex-1 bg-muted hover:bg-secondary text-foreground py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md">
                Login
              </motion.a>
              <motion.div whileHover={buttonHover} whileTap={buttonTap} className="flex-1">
                <Link href="/join?role=executive" className="block bg-foreground hover:bg-international-orange text-background py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md">
                  List Your Factory
                </Link>
              </motion.div>
            </div>
          </AnimatedCard>

          {/* Universities */}
          <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col sm:col-span-2 lg:col-span-1">
            <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden rounded-lg">
              <Image src="/images/network_universities.jpg" alt="University research lab" fill className="object-cover" />
            </div>
            <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">Academia</span>
            <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">THE FOUNDER PIPELINE.</h3>
            <p className="text-muted-foreground text-sm leading-relaxed flex-1">
              &ldquo;Universities are IP-rich but execution-constrained. We provide the commercialization engine to transform research into venture-backed startups and students into Apprentices.&rdquo;
            </p>
            <div className="pt-4 md:pt-6 mt-4 border-t border-muted flex gap-2 md:gap-3">
              <motion.a href={`${APP_DOMAIN}/login`} whileHover={buttonHover} whileTap={buttonTap} className="flex-1 bg-muted hover:bg-secondary text-foreground py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md">
                Login
              </motion.a>
              <motion.div whileHover={buttonHover} whileTap={buttonTap} className="flex-1">
                <Link href="/join" className="block bg-foreground hover:bg-international-orange text-background py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md">
                  Partner
                </Link>
              </motion.div>
            </div>
          </AnimatedCard>
        </StaggerContainer>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE OS — The Firm / The OS / The Guild (from old version)
 * ═══════════════════════════════════════════════════════════════════════ */

function OSSection() {
  return (
    <section id="os" className="py-12 md:py-24 bg-background border-t border-muted scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedHeader className="text-3xl sm:text-4xl md:text-5xl font-black mb-8 md:mb-16">
          THE OPERATING SYSTEM.
        </AnimatedHeader>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
          <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col">
            <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden rounded-lg">
              <Image src="/images/marketing/ecosystem-firm.png" alt="Converted Victorian UK office building — Fractional Forge HQ" fill className="object-cover" />
            </div>
            <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">The Entity</span>
            <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">THE FIRM.</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              &ldquo;The real-world manifestation of the system. We are the Operating Company (OpCo) that holds the contracts, manages the liability, and provides the legal fortress for the work to happen.&rdquo;
            </p>
          </AnimatedCard>

          <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col">
            <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden rounded-lg">
              <Image src="/images/marketing/ecosystem-os.png" alt="Modern dashboard on ultrawide monitor — ForgeOS platform" fill className="object-cover" />
            </div>
            <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">The System</span>
            <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">THE OPERATING SYSTEM.</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              &ldquo;Our operating system coordinates Founders, Executives and Apprentices. It gives them access to a rich marketplace of additional experts and outsourced manufacturing capability.&rdquo;
            </p>
          </AnimatedCard>

          <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col sm:col-span-2 lg:col-span-1">
            <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden rounded-lg">
              <Image src="/images/marketing/ecosystem-guild.png" alt="Community workshop event with people collaborating" fill className="object-cover" />
            </div>
            <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">The Community</span>
            <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">THE GUILD.</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              &ldquo;Virtual connectivity, physical reality. The Guild is a network of collaborative workshops and digital spaces. It is the connective tissue that ensures knowledge scales as fast as the code.&rdquo;
            </p>
          </AnimatedCard>
        </StaggerContainer>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * TRUST STRIP — Platform guarantees (no Built in Britain)
 * ═══════════════════════════════════════════════════════════════════════ */

const TRUST_SIGNALS = [
  { icon: Shield, label: "Your IP, 100%" },
  { icon: UserCheck, label: "Verified Experts" },
  { icon: DollarSign, label: "No Equity Required" },
  { icon: CheckCircle2, label: "Cancel Anytime" },
] as const

function TrustStrip() {
  return (
    <section className="py-8 sm:py-12 bg-muted/30 border-t border-muted">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <AnimatedSection>
          <div className="flex flex-wrap justify-center gap-x-4 sm:gap-x-8 gap-y-3 text-sm text-muted-foreground">
            {TRUST_SIGNALS.map((signal) => {
              const Icon = signal.icon
              return (
                <div key={signal.label} className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-international-orange flex-shrink-0" />
                  <span className="font-medium text-foreground text-xs sm:text-sm">
                    {signal.label}
                  </span>
                </div>
              )
            })}
          </div>
        </AnimatedSection>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * FINAL CTA
 * ═══════════════════════════════════════════════════════════════════════ */

function FinalCTASection() {
  return (
    <section className="py-12 sm:py-16 md:py-24 bg-background border-t border-muted">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <AnimatedSection>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Move as Fast as{" "}
            <span className="text-international-orange">Your Ideas.</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-xl mx-auto leading-relaxed mb-6 sm:mb-8">
            Stop burning cash on infrastructure you don&apos;t need.
            Join the founders, experts, and factories building
            hardware at software speed.
          </p>
          <motion.div
            whileHover={buttonHover}
            whileTap={buttonTap}
            className="inline-block"
          >
            <Link
              href="/join"
              className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-10 py-4 text-sm font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px]"
            >
              Join the Forge
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </AnimatedSection>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * FAQ — Handles objections (from current version)
 * ═══════════════════════════════════════════════════════════════════════ */

const FAQS = [
  {
    question: "What is a Cloud Factory?",
    answer:
      "Think of it like AWS for manufacturing. Just as modern software companies use cloud compute instead of building their own server racks, Fractional Forge lets you build hardware products using existing factory capacity, expert teams, and AI-enabled execution — without owning any of it. You get the same results, at a fraction of the cost and time.",
  },
  {
    question: "Who owns the IP I create on the platform?",
    answer:
      "You do. 100%. Fractional Forge provides the team and infrastructure, but all intellectual property, designs, prototypes, and products belong entirely to you. This is baked into our contracts.",
  },
  {
    question: "How does the fractional model actually work?",
    answer:
      "Instead of hiring a full-time engineering team, you work with experienced executives and engineers on a fractional (part-time) basis. They direct AI-enabled apprentices who execute at speed, then verify the output based on decades of real-world experience. You only pay for the hours and outcomes you need.",
  },
  {
    question: "How quickly can I go from idea to prototype?",
    answer:
      "It depends on complexity, but the key advantage is eliminating the months of hiring, onboarding, and infrastructure setup that typically precede any actual engineering work. Because you're plugging into existing experts and factory capacity from day one, you can start building immediately instead of spending months assembling the team first.",
  },
  {
    question: "How much does it cost?",
    answer:
      "We're in early access and working directly with founding members to define pricing. No equity is required. Reach out and we'll walk you through what engagement looks like for your situation.",
  },
] as const

function FAQSection() {
  return (
    <section
      id="faq"
      className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20"
    >
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
          <Accordion
            type="single"
            collapsible
            className="space-y-3 sm:space-y-4"
          >
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
