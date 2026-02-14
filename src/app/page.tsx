"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  motion,
  useScroll,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import {
  fadeInUp,
  fadeInScale,
  heroHeadline,
  heroTagline,
  buttonHover,
  buttonTap,
  AnimatedHeader,
  StaggerContainer,
  AnimatedCard,
  AnimatedSection,
} from "@/components/marketing/animations";
import {
  Clock,
  DollarSign,
  TrendingDown,
  Users,
  Wrench,
  Shield,
  Rocket,
  UserCheck,
  Hammer,
  ChevronDown,
  ArrowRight,
  CheckCircle2,
  Zap,
  Factory,
  Share2,
  Check,
  Timer,
  TrendingUp,
  ExternalLink,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Domain configuration
const APP_DOMAIN =
  process.env.NEXT_PUBLIC_APP_DOMAIN || "https://fractionalforge.app";

/**
 * Custom hook to detect mobile viewport for performance optimizations.
 *
 * @description Used to disable heavy animations (parallax, hover effects)
 * on mobile devices where they cause jank.
 *
 * @returns Whether the viewport is mobile-sized (< 768px)
 */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isMobile;
}

/**
 * Marketing landing page — conversion-optimized structure.
 *
 * @description Follows the proven landing page framework:
 * Hero → Problem → Solution → Social Proof → How It Works →
 * Pricing Preview → FAQ → Final CTA → Footer
 */
export default function MarketingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setNavScrolled(window.scrollY > 20);
      // Close mobile menu on scroll for better UX
      if (mobileMenuOpen) setMobileMenuOpen(false);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [mobileMenuOpen]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Skip Navigation - Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-accent-foreground focus:rounded-md"
      >
        Skip to main content
      </a>

      {/* ── Sticky Navigation ── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 pt-[env(safe-area-inset-top)] ${
          navScrolled
            ? "bg-background/95 backdrop-blur-sm shadow-sm border-b border-muted"
            : "bg-transparent"
        }`}
        aria-label="Main navigation"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <Link href="/" className="text-base sm:text-lg md:text-xl font-bold tracking-tight">
            FRACTIONAL FORGE
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#problem"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              Why Us
            </a>
            <a
              href="#solution"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              Solution
            </a>
            <a
              href="#how-it-works"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              Getting Started
            </a>
            <Link
              href="/pricing"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              Pricing
            </Link>
            <a
              href="#faq"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              FAQ
            </a>
            <Link
              href="/techniques"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              Techniques
            </Link>
            <a
              href={`${APP_DOMAIN}/login`}
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              Login
            </a>
            <motion.div whileHover={buttonHover} whileTap={buttonTap}>
              <Link
                href="/join/founder"
                className="inline-flex items-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-5 py-2.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md"
              >
                Get Started
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

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              {/* Backdrop overlay — tap to close */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="md:hidden fixed inset-0 top-[calc(env(safe-area-inset-top)+56px)] bg-foreground/20 backdrop-blur-[2px] z-[-1]"
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
                  {/* CTA first — always visible without scrolling */}
                  <Link
                    href="/join/founder"
                    className="mb-3 bg-international-orange hover:bg-international-orange-hover text-white py-3.5 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] flex items-center justify-center"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Get Started Free
                  </Link>
                  {[
                    { href: "#problem", label: "Why Us" },
                    { href: "#solution", label: "Solution" },
                    { href: "#how-it-works", label: "Getting Started" },
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
                  <Link
                    href="/techniques"
                    className="text-sm text-muted-foreground hover:text-foreground active:text-foreground uppercase tracking-wider py-3.5 min-h-[48px] flex items-center transition-colors border-b border-muted/50"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Techniques
                  </Link>
                  <Link
                    href="/pricing"
                    className="text-sm text-muted-foreground hover:text-foreground active:text-foreground uppercase tracking-wider py-3.5 min-h-[48px] flex items-center transition-colors border-b border-muted/50"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Pricing
                  </Link>
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

      {/* ── Main Content ── */}
      <main id="main-content">
        <HeroSection />
        <ProblemSection />
        <Suspense fallback={
          <div className="py-16 px-4">
            <div className="max-w-4xl mx-auto">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-muted rounded w-1/3 mx-auto"></div>
                <div className="h-64 bg-muted rounded-xl"></div>
              </div>
            </div>
          </div>
        }>
          <SavingsCalculatorSection />
        </Suspense>
        <SolutionSection />
        <HowItWorksSection />
        <HowAProjectWorksSection />
        <PlatformCapabilitiesSection />
        <PricingPreviewSection />
        <FAQSection />
        <FinalCTASection />
      </main>

      {/* ── Footer ── */}
      <footer className="py-10 sm:py-12 md:py-16 border-t border-muted bg-muted pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:pb-12 md:pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-8">
            {/* Brand */}
            <div className="col-span-2">
              <p className="text-base sm:text-lg font-bold tracking-tight mb-2 sm:mb-3">
                FRACTIONAL FORGE
              </p>
              <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                Build hardware at software speed. A fraction of the cost. A
                fraction of the time. A fraction of the headcount.
              </p>
            </div>

            {/* Links */}
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2 sm:mb-3">
                Platform
              </p>
              <div className="flex flex-col gap-2.5 sm:gap-2">
                <Link
                  href="/pricing"
                  className="text-sm text-muted-foreground hover:text-foreground active:text-foreground transition-colors"
                >
                  Pricing
                </Link>
                <a
                  href={`${APP_DOMAIN}/login`}
                  className="text-sm text-muted-foreground hover:text-foreground active:text-foreground transition-colors"
                >
                  Login
                </a>
                <Link
                  href="/join/founder"
                  className="text-sm text-muted-foreground hover:text-foreground active:text-foreground transition-colors"
                >
                  Get Started Free
                </Link>
              </div>
            </div>

            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2 sm:mb-3">
                Roles
              </p>
              <div className="flex flex-col gap-2.5 sm:gap-2">
                <Link
                  href="/join/founder"
                  className="text-sm text-muted-foreground hover:text-foreground active:text-foreground transition-colors"
                >
                  Founders
                </Link>
                <Link
                  href="/join/executive"
                  className="text-sm text-muted-foreground hover:text-foreground active:text-foreground transition-colors"
                >
                  Executives
                </Link>
                <Link
                  href="/join/apprentice"
                  className="text-sm text-muted-foreground hover:text-foreground active:text-foreground transition-colors"
                >
                  Apprentices
                </Link>
              </div>
            </div>
          </div>

          <div className="border-t border-muted pt-6 sm:pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <p className="text-xs sm:text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Fractional Forge Ltd. All rights
              reserved.
            </p>
            <p className="text-xs text-muted-foreground font-mono tracking-wider">
              Build Faster. Burn Less.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 1 — HERO
 * Catches attention, states the value prop, and provides a clear CTA.
 * ════════════════════════════════════════════════════════════════════════ */

function HeroSection() {
  const isMobile = useIsMobile();
  const { scrollY } = useScroll();
  // Disable parallax on mobile — causes janky scrolling on low-end devices
  const parallaxY = useTransform(scrollY, [0, 500], [0, isMobile ? 0 : 150]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [memberCount, setMemberCount] = useState<number | null>(null);

  // Fetch live founding member count
  useEffect(() => {
    async function fetchStats(): Promise<void> {
      try {
        // Add timeout to prevent hanging on slow/cold API
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // 5s timeout

        const res = await fetch("/api/marketing/stats", {
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (res.ok) {
          const data = await res.json();
          // Show counter for any count (including 0) to create urgency
          // If API fails/times out, memberCount stays null and we show "Be the first"
          setMemberCount(data.foundingMembers ?? null);
        }
      } catch {
        // Graceful fallback — hide counter if fetch fails
        // Counter will show "Be the first to join" when memberCount is null
      }
    }
    fetchStats();
  }, []);

  const heroImages = [
    {
      src: "/images/hero-team-workshop.png",
      alt: "Engineering team collaborating on hardware prototypes in a modern workshop",
    },
    {
      src: "/images/hero-prototype-evolution.png",
      alt: "Rapid prototype iterations from 3D print to machined metal part",
    },
    {
      src: "/images/hero-robotic-steel.png",
      alt: "Robotic arm 3D printing steel structure",
    },
    {
      src: "/images/hero-titanium-printing.png",
      alt: "Titanium 3D printing system",
    },
  ];

  // Slower image cycling on mobile to reduce battery drain and visual noise
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % heroImages.length);
    }, isMobile ? 8000 : 5000);
    return () => clearInterval(interval);
  }, [heroImages.length, isMobile]);

  return (
    <section className="relative min-h-[85vh] sm:min-h-[90vh] md:min-h-screen flex items-center justify-center overflow-hidden bg-background pt-20 sm:pt-16">
      {/* Background images with parallax */}
      <motion.div
        style={{ y: parallaxY }}
        className="absolute inset-0 will-change-transform"
      >
        <AnimatePresence>
          <motion.div
            key={currentImageIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.25 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
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
        {/* Gradient overlays */}
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
          <span className="text-international-orange text-[10px] sm:text-xs font-mono uppercase tracking-widest">
            Early Access &mdash; Founding Members Only
          </span>
        </motion.div>

        {/* Live founding member counter */}
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
                      animate={{ width: `${Math.min((memberCount / 100) * 100, 100)}%` }}
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
          // API failed or still loading - show placeholder to create urgency
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mb-6 md:mb-8"
          >
            <div className="inline-flex flex-col items-center gap-2">
              <p className="text-sm text-muted-foreground font-mono">
                <span className="text-2xl font-black text-international-orange">
                  Be the first
                </span>{" "}
                to join
              </p>
            </div>
          </motion.div>
        )}

        {/* Main Headline */}
        <motion.h1
          initial="hidden"
          animate="visible"
          variants={heroHeadline}
          className="text-[2rem] sm:text-5xl md:text-6xl lg:text-7xl font-black leading-[1.08] mb-5 sm:mb-6 md:mb-8"
        >
          Stop Burning Runway
          <br className="sm:hidden" />
          {" "}on{" "}
          <br className="hidden sm:block" />
          Hardware That Takes{" "}
          <motion.span
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
            className="text-international-orange"
          >
            Forever.
          </motion.span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial="hidden"
          animate="visible"
          variants={heroTagline}
          className="text-foreground text-base sm:text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-6 sm:mb-8 md:mb-10"
        >
          Launch physical products in weeks, not years. Fractional teams.
          Fractional cost. Full ownership.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto"
        >
          <motion.div whileHover={buttonHover} whileTap={buttonTap} className="w-full sm:w-auto">
            <Link
              href="/join/founder"
              className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-4 text-sm font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] w-full sm:w-auto"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm font-mono tracking-wider uppercase transition-colors min-h-[48px]"
          >
            See How It Works
            <ChevronDown className="h-4 w-4" />
          </a>
        </motion.div>

        {/* Version line */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="mt-6 sm:mt-8 md:mt-12 text-xs text-muted-foreground font-mono tracking-wider"
        >
          Shipping weekly. Shaped by founding members.
        </motion.p>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 2 — PROBLEM
 * Makes the hardware development pain painfully clear.
 * ════════════════════════════════════════════════════════════════════════ */

function ProblemSection() {
  const PAIN_POINTS = [
    {
      icon: Clock,
      title: "18-Month Timelines",
      stat: "12–18 months",
      description:
        "Traditional hardware development takes 12–18 months from concept to first prototype. By the time you ship, the market has moved on.",
    },
    {
      icon: DollarSign,
      title: "Astronomical Burn Rate",
      stat: "£50–100k/month",
      description:
        "A full-time engineering team costs £50k–£100k per month in salaries alone. That's before you factor in tooling, materials, and manufacturing.",
    },
    {
      icon: TrendingDown,
      title: "Unnecessary Equity Dilution",
      stat: "30–40% given away",
      description:
        "Raising a £2M seed round to build a team you only need for 6 months means giving away equity you'll never get back — for capability you don't permanently need.",
    },
  ] as const;

  return (
    <section id="problem" className="py-12 sm:py-16 md:py-28 bg-background scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section header */}
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-20">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            The Hardware Trap
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Building Hardware Shouldn&apos;t
            <br className="hidden sm:block" /> Mean Burning Everything.
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Most hardware startups fail not because of bad ideas — but because
            the traditional development model is broken. Here&apos;s what
            founders are up against:
          </p>
        </AnimatedSection>

        {/* Pain point cards */}
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
          {PAIN_POINTS.map((point) => {
            const Icon = point.icon;
            return (
              <AnimatedCard
                key={point.title}
                className="border bg-card rounded-xl p-5 sm:p-6 md:p-8 flex flex-col text-center"
              >
                <div className="mx-auto mb-3 sm:mb-4 h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-status-error-light flex items-center justify-center">
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-destructive" />
                </div>
                <p className="text-2xl sm:text-2xl md:text-3xl font-black text-foreground mb-1 sm:mb-2">
                  {point.stat}
                </p>
                <h3 className="text-base sm:text-lg font-bold mb-2 sm:mb-3">{point.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {point.description}
                </p>
              </AnimatedCard>
            );
          })}
        </StaggerContainer>

        {/* Comparison image — taller aspect ratio on mobile for readability */}
        <AnimatedSection className="mt-10 sm:mt-12 md:mt-20" delay={0.2}>
          <div className="relative w-full aspect-[3/2] sm:aspect-[2.2/1] rounded-lg sm:rounded-xl overflow-hidden border">
            <Image
              src="/images/problem-comparison.png"
              alt="Comparison: 18 months of traditional hardware development versus 6 weeks with Fractional Forge"
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 768px) 100vw, 1200px"
              loading="lazy"
            />
          </div>
          <p className="text-center text-xs text-muted-foreground mt-3 sm:mt-4 font-mono tracking-wider">
            Traditional Development vs. The Fractional Model
          </p>
        </AnimatedSection>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 2b — SAVINGS CALCULATOR
 * Interactive tool that makes the savings tangible and shareable.
 * ════════════════════════════════════════════════════════════════════════ */

function SavingsCalculatorSection() {
  const searchParams = useSearchParams();
  const [copied, setCopied] = useState(false);

  // Initialize from URL params or defaults
  const calcParam = searchParams.get("calc");
  const initialValues = useMemo(() => {
    if (calcParam) {
      const parts = calcParam.split(",").map(Number);
      if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
        return {
          teamSize: Math.max(2, Math.min(15, parts[0])),
          monthlyCost: Math.max(4000, Math.min(15000, parts[1])),
          duration: Math.max(3, Math.min(24, parts[2])),
        };
      }
    }
    return { teamSize: 5, monthlyCost: 8000, duration: 12 };
  }, [calcParam]);

  const [teamSize, setTeamSize] = useState(initialValues.teamSize);
  const [monthlyCost, setMonthlyCost] = useState(initialValues.monthlyCost);
  const [duration, setDuration] = useState(initialValues.duration);

  // Calculations
  const traditionalCost = teamSize * monthlyCost * duration;
  const fractionalMultiplier = duration <= 6 ? 0.35 : duration <= 12 ? 0.3 : 0.25;
  const fractionalCost = Math.round(traditionalCost * fractionalMultiplier);
  const savings = traditionalCost - fractionalCost;
  const savingsPercent = Math.round((1 - fractionalMultiplier) * 100);
  const traditionalWeeks = duration * 4;
  const fractionalWeeks = Math.max(6, Math.round(duration * 2.5));
  const weeksSaved = traditionalWeeks - fractionalWeeks;

  const formatCurrency = (value: number): string => {
    if (value >= 1000000) return `£${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `£${(value / 1000).toFixed(0)}k`;
    return `£${value}`;
  };

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}?calc=${teamSize},${monthlyCost},${duration}#calculator`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [teamSize, monthlyCost, duration]);

  return (
    <section
      id="calculator"
      className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-16">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            See Your Savings
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            How Much Is Your Full-Time Team
            <br className="hidden sm:block" />{" "}
            <span className="text-international-orange">Really Costing You?</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Drag the sliders to match your situation. Watch the savings add up.
          </p>
        </AnimatedSection>

        {/* On mobile, show results first (order-2 on sliders, order-1 on results) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 md:gap-12">
          {/* Left: Sliders — appears second on mobile (results first) */}
          <AnimatedSection className="space-y-6 sm:space-y-8 order-2 lg:order-1">
            <div className="border bg-card rounded-xl p-5 sm:p-6 md:p-8 space-y-6 sm:space-y-8">
              {/* Team Size */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="team-size"
                    className="text-sm font-semibold text-foreground"
                  >
                    Engineering Team Size
                  </label>
                  <span className="text-lg font-black text-international-orange font-mono">
                    {teamSize}
                  </span>
                </div>
                <input
                  id="team-size"
                  type="range"
                  min={2}
                  max={15}
                  value={teamSize}
                  onChange={(e) => setTeamSize(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-international-orange [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-international-orange [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-international-orange [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:shadow-md"
                  aria-label={`Team size: ${teamSize} engineers`}
                />
                <div className="flex justify-between text-xs text-muted-foreground font-mono">
                  <span>2</span>
                  <span>15 engineers</span>
                </div>
              </div>

              {/* Monthly Cost */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="monthly-cost"
                    className="text-sm font-semibold text-foreground"
                  >
                    Avg. Monthly Cost / Engineer
                  </label>
                  <span className="text-lg font-black text-international-orange font-mono">
                    £{monthlyCost.toLocaleString()}
                  </span>
                </div>
                <input
                  id="monthly-cost"
                  type="range"
                  min={4000}
                  max={15000}
                  step={500}
                  value={monthlyCost}
                  onChange={(e) => setMonthlyCost(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-international-orange [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-international-orange [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-international-orange [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:shadow-md"
                  aria-label={`Monthly cost per engineer: £${monthlyCost.toLocaleString()}`}
                />
                <div className="flex justify-between text-xs text-muted-foreground font-mono">
                  <span>£4,000</span>
                  <span>£15,000/mo</span>
                </div>
              </div>

              {/* Duration */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="duration"
                    className="text-sm font-semibold text-foreground"
                  >
                    Project Timeline
                  </label>
                  <span className="text-lg font-black text-international-orange font-mono">
                    {duration} months
                  </span>
                </div>
                <input
                  id="duration"
                  type="range"
                  min={3}
                  max={24}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-international-orange [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-international-orange [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-international-orange [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:shadow-md"
                  aria-label={`Project duration: ${duration} months`}
                />
                <div className="flex justify-between text-xs text-muted-foreground font-mono">
                  <span>3</span>
                  <span>24 months</span>
                </div>
              </div>
            </div>

            {/* Decorative image */}
            <div className="hidden lg:block relative w-full aspect-[2/1] rounded-xl overflow-hidden">
              <Image
                src="/images/calculator-paths.png"
                alt="Two paths: the long traditional route versus the fast fractional route"
                fill
                className="object-cover"
                sizes="600px"
              />
            </div>
          </AnimatedSection>

          {/* Right: Results — appears first on mobile for instant impact */}
          <AnimatedSection delay={0.15} className="order-1 lg:order-2">
            <div className="border bg-card rounded-xl p-5 sm:p-6 md:p-8 space-y-5 sm:space-y-6 lg:sticky lg:top-24">
              {/* Traditional vs Fractional comparison */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="rounded-xl bg-status-error-light p-4 sm:p-5 text-center">
                  <p className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-destructive mb-1.5 sm:mb-2">
                    Traditional
                  </p>
                  <p className="text-xl sm:text-2xl md:text-3xl font-black text-destructive">
                    {formatCurrency(traditionalCost)}
                  </p>
                  <p className="text-[10px] sm:text-xs text-destructive/70 mt-1">
                    {traditionalWeeks} weeks
                  </p>
                </div>
                <div className="rounded-xl bg-status-success-light p-4 sm:p-5 text-center">
                  <p className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-status-success mb-1.5 sm:mb-2">
                    Fractional
                  </p>
                  <p className="text-xl sm:text-2xl md:text-3xl font-black text-status-success">
                    {formatCurrency(fractionalCost)}
                  </p>
                  <p className="text-[10px] sm:text-xs text-status-success/70 mt-1">
                    ~{fractionalWeeks} weeks
                  </p>
                </div>
              </div>

              {/* Savings highlight */}
              <div className="rounded-xl border-2 border-international-orange bg-international-orange/5 p-5 sm:p-6 text-center">
                <p className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-international-orange mb-1.5 sm:mb-2">
                  You Save
                </p>
                <p className="text-3xl sm:text-4xl md:text-5xl font-black text-international-orange">
                  {formatCurrency(savings)}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-2">
                  {savingsPercent}% cost reduction &middot; {weeksSaved} weeks
                  faster
                </p>
              </div>

              {/* Breakdown */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Money saved
                  </span>
                  <span className="font-bold text-foreground">
                    {formatCurrency(savings)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Timer className="h-4 w-4" />
                    Time saved
                  </span>
                  <span className="font-bold text-foreground">
                    {weeksSaved} weeks
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Equity preserved
                  </span>
                  <span className="font-bold text-foreground">100%</span>
                </div>
              </div>

              {/* Share + CTA */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <motion.div
                  whileHover={buttonHover}
                  whileTap={buttonTap}
                  className="flex-1"
                >
                  <Link
                    href="/join/founder"
                    className="flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-6 py-3 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] w-full"
                  >
                    Get Started
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </motion.div>
                <button
                  onClick={handleShare}
                  className="flex items-center justify-center gap-2 border rounded-md px-4 py-3 text-xs font-mono font-bold tracking-widest uppercase text-muted-foreground hover:text-foreground active:text-foreground hover:bg-muted active:bg-muted transition-colors min-h-[48px]"
                  aria-label="Share your savings calculation"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-status-success" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Share2 className="h-4 w-4" />
                      Share
                    </>
                  )}
                </button>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 3 — SOLUTION
 * Presents Fractional Forge as the answer to the pain.
 * ════════════════════════════════════════════════════════════════════════ */

function SolutionSection() {
  const BENEFITS = [
    {
      icon: Users,
      title: "Fractional Teams",
      description:
        "On-demand executives and engineers who have built and shipped hardware before. No long-term commitments — scale up or down as your project needs change.",
    },
    {
      icon: DollarSign,
      title: "Fractional Cost",
      description:
        "Pay only for the expertise you need, when you need it. A fractional CTO costs a fraction of a full-time one — and often delivers more, faster.",
    },
    {
      icon: Shield,
      title: "Full Ownership",
      description:
        "Your IP. Your equity. Your company. We provide the team and the infrastructure — you keep everything you build.",
    },
    {
      icon: Rocket,
      title: "12-Week Sprints",
      description:
        "Go from concept to validated prototype in a single sprint. Our structured process eliminates the guesswork and compresses timelines dramatically.",
    },
    {
      icon: Factory,
      title: "Manufacturing Network",
      description:
        "Access 78+ manufacturing techniques through our vetted supplier network. From 3D printing to injection moulding — one platform, every process.",
    },
    {
      icon: Wrench,
      title: "Operating System",
      description:
        "ForgeOS coordinates your fractional team, tracks objectives, manages suppliers, and keeps everyone aligned. The glue that makes fractional work.",
    },
  ] as const;

  return (
    <section
      id="solution"
      className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-20">
          <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            The Fractional Model
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            What If You Could Build Hardware
            <br className="hidden sm:block" />{" "}
            <span className="text-electric-blue">Like Software?</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Fractional Forge gives you on-demand access to the people,
            processes, and manufacturing network you need — without the
            overhead of building it all yourself.
          </p>
        </AnimatedSection>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {BENEFITS.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <AnimatedCard
                key={benefit.title}
                className="border bg-card rounded-xl p-5 sm:p-6 md:p-8 flex flex-col"
              >
                <div className="mb-3 sm:mb-4 h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-electric-blue-light flex items-center justify-center">
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-electric-blue" />
                </div>
                <h3 className="text-base sm:text-lg font-bold mb-2">{benefit.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                  {benefit.description}
                </p>
              </AnimatedCard>
            );
          })}
        </StaggerContainer>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 3b — CASE STUDY
 * A specific, detailed story with real numbers that builds credibility.
 * ════════════════════════════════════════════════════════════════════════ */

function HowAProjectWorksSection() {
  const PHASES = [
    { week: "Week 1–2", label: "Scope definition & expert matching", done: true },
    { week: "Week 3–5", label: "Concept design & engineering simulation", done: true },
    { week: "Week 6–8", label: "Rapid prototyping (3D print, CNC, etc.)", done: true },
    { week: "Week 9–10", label: "Functional testing & iteration", done: true },
    { week: "Week 11–12", label: "Production-ready deliverable", done: true },
  ];

  return (
    <section className="py-12 sm:py-16 md:py-28 bg-background border-t border-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-16">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            A Typical Sprint
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            From Concept to Prototype.
            <br className="hidden sm:block" />{" "}
            <span className="text-international-orange">Weeks, Not Months.</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Here is a typical project timeline when you work with fractional
            experts instead of building a full-time team.
          </p>
        </AnimatedSection>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 md:gap-12 items-center">
          {/* Left: Image */}
          <AnimatedSection>
            <div className="relative w-full aspect-[4/3] rounded-lg sm:rounded-xl overflow-hidden border shadow-lg">
              <Image
                src="/images/case-study-drone.png"
                alt="Example: an inspection drone prototype — the kind of project fractional teams can tackle"
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 600px"
                loading="lazy"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-foreground/80 to-transparent p-4 sm:p-6">
                <p className="text-background/80 text-sm">
                  Inspection Drone Prototype
                </p>
              </div>
            </div>
          </AnimatedSection>

          {/* Right: Explanation + Timeline */}
          <AnimatedSection delay={0.15} className="space-y-6 sm:space-y-8">
            {/* The traditional problem */}
            <div>
              <h3 className="text-base sm:text-lg font-bold mb-2 sm:mb-3">The Traditional Way</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                A hardware startup building something like an inspection drone
                would typically need to hire 4–6 full-time engineers, spend
                months recruiting, and commit to 12–18 months of runway burn
                before seeing a working prototype.
              </p>
            </div>

            {/* The fractional approach */}
            <div>
              <h3 className="text-base sm:text-lg font-bold mb-2 sm:mb-3">The Fractional Approach</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                With Fractional Forge, you assemble a team of senior specialists
                in days, not months. You pay only for the expertise you need,
                keep your equity, and move at sprint pace. Here is what a
                typical timeline looks like:
              </p>
            </div>

            {/* Timeline */}
            <div>
              <h3 className="text-base sm:text-lg font-bold mb-3 sm:mb-4">Typical Sprint Timeline</h3>
              <div className="space-y-2.5 sm:space-y-3">
                {PHASES.map((phase, i) => (
                  <motion.div
                    key={phase.week}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08, duration: 0.4 }}
                    className="flex items-start sm:items-center gap-3"
                  >
                    <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-international-orange flex items-center justify-center mt-0.5 sm:mt-0">
                      <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
                    </div>
                    <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-muted pb-2.5 sm:pb-3 gap-0.5 sm:gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {phase.label}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                        {phase.week}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Honest framing */}
            <div className="border-l-4 border-international-orange pl-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Timelines vary by project complexity. The fractional model works
                because you get senior specialists from day one — no recruiting,
                no ramp-up, no long-term commitments.
              </p>
            </div>
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 4 — PLATFORM CAPABILITIES
 * Shows real, verifiable platform metrics. No fabricated testimonials.
 * ════════════════════════════════════════════════════════════════════════ */

function PlatformCapabilitiesSection() {
  const METRICS = [
    { value: "78+", label: "Manufacturing Techniques" },
    { value: "100", label: "Founding Member Spots" },
    { value: "12", label: "Week Sprints" },
    { value: "£0", label: "Equity Given Up" },
  ] as const;

  const VALUE_PROPS = [
    {
      icon: UserCheck,
      title: "Senior Specialists Only",
      description:
        "Every expert on the platform is vetted. No juniors, no generalists — only people who have shipped real hardware products.",
    },
    {
      icon: Shield,
      title: "No Equity, No Lock-In",
      description:
        "Pay for expertise by the day or project. No equity stakes, no long-term contracts, no golden handcuffs.",
    },
    {
      icon: Factory,
      title: "Full Manufacturing Stack",
      description:
        "From 3D printing to CNC to injection moulding — access 78+ manufacturing techniques through one platform.",
    },
  ] as const;

  return (
    <section className="py-12 sm:py-16 md:py-28 bg-background border-t border-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Metrics bar — all verifiable */}
        <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 md:gap-8 mb-12 sm:mb-16 md:mb-24">
          {METRICS.map((metric) => (
            <AnimatedCard
              key={metric.label}
              className="text-center p-4 sm:p-6 rounded-xl border bg-card"
            >
              <p className="text-2xl sm:text-3xl md:text-4xl font-black text-international-orange mb-1">
                {metric.value}
              </p>
              <p className="text-[10px] sm:text-xs md:text-sm text-muted-foreground font-mono uppercase tracking-wider">
                {metric.label}
              </p>
            </AnimatedCard>
          ))}
        </StaggerContainer>

        {/* Value propositions — not testimonials */}
        <AnimatedSection className="text-center mb-8 sm:mb-10">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            The Founding Member Advantage
          </span>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black">
            What You Get on Day One.
          </h2>
        </AnimatedSection>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
          {VALUE_PROPS.map((prop) => {
            const Icon = prop.icon;
            return (
              <AnimatedCard
                key={prop.title}
                className="border bg-card rounded-xl p-5 sm:p-6 md:p-8 flex flex-col"
              >
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-international-orange/10 flex items-center justify-center mb-3 sm:mb-4">
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-international-orange" />
                </div>
                <h3 className="text-foreground text-base font-bold mb-2">
                  {prop.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                  {prop.description}
                </p>
              </AnimatedCard>
            );
          })}
        </StaggerContainer>

        {/* Manufacturing capabilities — merged from former CapabilitiesHighlight */}
        <AnimatedSection className="text-center mt-12 sm:mt-16 md:mt-24">
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-5 sm:mb-6">
            {[
              "Additive Manufacturing",
              "CNC Machining",
              "Sheet Metal",
              "Injection Moulding",
              "Casting",
              "Composites",
              "PCB Assembly",
              "Surface Treatment",
            ].map((cap) => (
              <span
                key={cap}
                className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border bg-card text-xs sm:text-sm font-medium text-foreground"
              >
                <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-status-success flex-shrink-0" />
                {cap}
              </span>
            ))}
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground font-mono tracking-wider mb-5 sm:mb-6">
            + Welding, Brazing, Carbon Fibre, Nano-Imprint, Bio-Printing, and
            dozens more.
          </p>
          <Link
            href="/techniques"
            className="inline-flex items-center justify-center gap-2 text-electric-blue hover:text-electric-blue-hover text-xs sm:text-sm font-mono uppercase tracking-wider transition-colors min-h-[44px] sm:min-h-0"
          >
            Explore All 78+ Techniques
            <ExternalLink className="h-4 w-4" />
          </Link>
        </AnimatedSection>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 5 — HOW IT WORKS
 * Simple 3-step process for primary audience (Founders).
 * ════════════════════════════════════════════════════════════════════════ */

function HowItWorksSection() {
  interface HowItWorksStep {
    number: string;
    icon: typeof UserCheck;
    title: string;
    description: string;
    cta?: { label: string; href: string };
  }

  const STEPS: HowItWorksStep[] = [
    {
      number: "01",
      icon: UserCheck,
      title: "Sign Up",
      description:
        "Create your free account in under a minute. No application, no waitlist — just pick your role and you're in. Founding members get early access pricing locked in forever.",
      cta: { label: "Get Started Free", href: "/join/founder" },
    },
    {
      number: "02",
      icon: Users,
      title: "Set Up Your Forge",
      description:
        "Define your company purpose, set your first objectives, and invite your team. Browse the marketplace for fractional executives, engineers, and manufacturing partners.",
    },
    {
      number: "03",
      icon: Hammer,
      title: "Start Building",
      description:
        "Use The Forge to turn ideas into engineering dossiers, The Forge for parametric design, and the supplier marketplace to source manufacturing. ForgeOS keeps everything coordinated — objectives, tasks, team, and suppliers.",
    },
  ];

  return (
    <section
      id="how-it-works"
      className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-20">
          <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            Getting Started
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6">
            Three Steps to Your First Build
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            From signup to shipping product — here&apos;s the path.
          </p>
        </AnimatedSection>

        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <AnimatedCard
                key={step.number}
                className="border bg-card rounded-xl p-5 sm:p-6 md:p-8 flex flex-col relative overflow-hidden"
              >
                {/* Step number — smaller on mobile to prevent overlap */}
                <span className="text-5xl sm:text-6xl md:text-7xl font-black text-muted/50 absolute top-3 right-4 sm:top-4 sm:right-6 select-none pointer-events-none">
                  {step.number}
                </span>
                <div className="mb-3 sm:mb-4 h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-electric-blue-light flex items-center justify-center">
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-electric-blue" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold mb-2 sm:mb-3">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                  {step.description}
                </p>
                {step.cta && (
                  <div className="mt-4 sm:mt-6">
                    <Link
                      href={step.cta.href}
                      className="inline-flex items-center gap-2 text-international-orange hover:text-international-orange-hover text-sm font-mono font-bold uppercase tracking-wider transition-colors min-h-[44px]"
                    >
                      {step.cta.label}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                )}
              </AnimatedCard>
            );
          })}
        </StaggerContainer>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 7 — PRICING PREVIEW
 * Shows tiers at a glance with link to full pricing page.
 * ════════════════════════════════════════════════════════════════════════ */

function PricingPreviewSection() {
  const TIERS = [
    {
      name: "Free",
      price: "£0",
      period: "forever",
      description: "Get started and explore the platform",
      features: ["5 orders/month", "20 smart assists/month", "Basic marketplace"],
      cta: "Start Free",
      href: "/join/founder",
      highlight: false,
    },
    {
      name: "Starter",
      price: "£49",
      period: "/month",
      description: "For growing hardware ventures",
      features: [
        "25 orders/month",
        "100 smart assists/month",
        "3 team members",
        "1 active retainer",
      ],
      cta: "Get Started",
      href: "/join/founder",
      highlight: false,
    },
    {
      name: "Professional",
      price: "£149",
      period: "/month",
      description: "For serious hardware companies",
      features: [
        "Unlimited orders",
        "500 smart assists/month",
        "10 team members",
        "Unlimited retainers",
        "API access",
      ],
      cta: "Get Started",
      href: "/join/founder",
      highlight: true,
    },
  ] as const;

  return (
    <section
      id="pricing"
      className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-16">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            Simple Pricing
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6">
            Transparent. No Surprises.
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Start free. Upgrade when you&apos;re ready. All plans include a 10%
            platform fee on marketplace transactions.
          </p>
        </AnimatedSection>

        {/* On mobile, highlighted (recommended) tier appears first via CSS order */}
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8 mb-8 sm:mb-10">
          {TIERS.map((tier) => (
            <AnimatedCard
              key={tier.name}
              className={`border rounded-xl p-5 sm:p-6 md:p-8 flex flex-col bg-card overflow-visible ${
                tier.highlight
                  ? "border-international-orange border-2 relative order-first md:order-none"
                  : ""
              }`}
            >
              {tier.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-international-orange text-white text-[10px] sm:text-xs font-mono font-bold tracking-widest uppercase px-3 sm:px-4 py-1 rounded-full whitespace-nowrap">
                  Recommended
                </span>
              )}
              <h3 className="text-lg sm:text-xl font-bold mb-1">{tier.name}</h3>
              <p className="text-xs text-muted-foreground mb-3 sm:mb-4">
                {tier.description}
              </p>
              <div className="mb-4 sm:mb-6">
                <span className="text-3xl sm:text-4xl font-black">{tier.price}</span>
                <span className="text-muted-foreground text-sm">
                  {tier.period}
                </span>
              </div>
              <ul className="space-y-2 mb-6 sm:mb-8 flex-1">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <CheckCircle2 className="h-4 w-4 text-status-success shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <motion.div whileHover={buttonHover} whileTap={buttonTap}>
                <Link
                  href={tier.href}
                  className={`flex items-center justify-center py-3 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] ${
                    tier.highlight
                      ? "bg-international-orange hover:bg-international-orange-hover text-white"
                      : "bg-muted hover:bg-secondary active:bg-secondary text-foreground"
                  }`}
                >
                  {tier.cta}
                </Link>
              </motion.div>
            </AnimatedCard>
          ))}
        </StaggerContainer>

        <div className="text-center">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 text-electric-blue hover:text-electric-blue-hover text-xs sm:text-sm font-mono uppercase tracking-wider transition-colors min-h-[44px]"
          >
            View Full Pricing &amp; Feature Comparison
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 8 — FAQ
 * Handles objections and builds confidence.
 * ════════════════════════════════════════════════════════════════════════ */

function FAQSection() {
  const FAQS = [
    {
      question: "Who owns the IP I create on the platform?",
      answer:
        "You do. 100%. Fractional Forge provides the team and infrastructure, but all intellectual property, designs, prototypes, and products belong entirely to you. This is baked into our contracts.",
    },
    {
      question: "How does the fractional model actually work?",
      answer:
        "Instead of hiring a full-time engineering team, you work with experienced executives and engineers on a fractional (part-time) basis. They bring deep expertise across multiple domains, and you only pay for the hours and outcomes you need. Think of it as the same model that gave the world fractional CFOs — applied to hardware.",
    },
    {
      question: "What kind of hardware can I build with Fractional Forge?",
      answer:
        "Anything physical. Our founding members are building consumer electronics, robotics, medical devices, aerospace components, IoT hardware, and industrial equipment. If it can be designed, prototyped, and manufactured, we can help.",
    },
    {
      question: "What does \"Early Access\" mean? Is the platform ready?",
      answer:
        "Early Access means the platform is live and functional, but we're actively iterating based on founding member feedback. You get direct input into the product roadmap, priority support, and early-access pricing that won't increase for founding members.",
    },
    {
      question: "How much does it actually cost?",
      answer:
        "The platform starts free. Paid plans start at £49/month for growing ventures. On top of the subscription, there's a 10% platform fee on marketplace transactions (manufacturing orders, retainer payments). No hidden fees. Cancel anytime.",
    },
    {
      question: "What if I'm not a founder? Can I still join?",
      answer:
        "Absolutely. We have three roles: Founders (who need things built), Executives (senior engineers who provide fractional expertise), and Apprentices (emerging talent paired with executives for accelerated learning). Each role has its own signup path.",
    },
    {
      question: "How quickly can I go from idea to prototype?",
      answer:
        "Our structured sprints target 12 weeks from kick-off to validated prototype. Some simpler projects ship faster. The key is eliminating the months of hiring, onboarding, and team-building that typically precede any actual engineering work.",
    },
    {
      question: "Is there a refund policy?",
      answer:
        "Yes. If you're not satisfied within the first 30 days of a paid plan, we'll refund you in full — no questions asked. We want founding members who genuinely benefit from the platform.",
    },
  ] as const;

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
          <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            Everything you need to know before getting started.
          </p>
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
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 9 — FINAL CTA
 * Last chance to convert. Urgency + value reminder.
 * ════════════════════════════════════════════════════════════════════════ */

function FinalCTASection() {
  return (
    <section className="py-12 sm:py-16 md:py-28 bg-foreground text-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <AnimatedSection>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInScale}
            className="inline-flex items-center gap-2 mb-5 sm:mb-6 px-3 sm:px-4 py-2 border border-background/20 rounded-full"
          >
            <Zap className="h-4 w-4 text-international-orange" />
            <span className="text-international-orange text-[10px] sm:text-xs font-mono uppercase tracking-widest">
              Limited Founding Member Spots
            </span>
          </motion.div>

          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Ready to Build Hardware
            <br className="hidden sm:block" /> at Software Speed?
          </h2>
          <p className="text-background/70 text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed mb-8 sm:mb-10">
            Founding members get early access pricing locked in forever,
            direct product influence, and priority matching with our best
            executives. Don&apos;t wait for the waitlist.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto">
            <motion.div whileHover={buttonHover} whileTap={buttonTap} className="w-full sm:w-auto">
              <Link
                href="/join/founder"
                className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-4 text-sm font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] w-full sm:w-auto"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
            <a
              href={`${APP_DOMAIN}/login`}
              className="inline-flex items-center gap-2 text-background/60 hover:text-background text-sm font-mono tracking-wider uppercase transition-colors min-h-[48px]"
            >
              Already a member? Login
            </a>
          </div>

          <p className="mt-6 sm:mt-8 text-xs text-background/60 font-mono tracking-wider">
            No credit card required. Start free. Cancel anytime.
          </p>
        </AnimatedSection>
      </div>
    </section>
  );
}
