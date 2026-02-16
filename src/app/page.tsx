"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  motion,
  useScroll,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import {
  fadeInScale,
  heroHeadline,
  heroTagline,
  buttonHover,
  buttonTap,
  StaggerContainer,
  AnimatedCard,
  AnimatedSection,
} from "@/components/marketing/animations";
import {
  DollarSign,
  Users,
  Shield,
  UserCheck,
  Hammer,
  ChevronDown,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { RolesSection } from "@/components/marketing/RolesSection";
import { GuildSection } from "@/components/marketing/GuildSection";
import { SoftwareVsHardwareSection } from "@/components/marketing/SoftwareVsHardwareSection";
import { FactoryPartnerSection } from "@/components/marketing/FactoryPartnerSection";
import { BuiltInBritainSection } from "@/components/marketing/BuiltInBritainSection";

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

  // Show floating CTA on mobile after scrolling past hero
  const [showFloatingCTA, setShowFloatingCTA] = useState(false);
  useEffect(() => {
    const handleFloatingCTA = () => {
      // Show after scrolling ~80% of viewport height (past hero)
      setShowFloatingCTA(window.scrollY > window.innerHeight * 0.8);
    };
    window.addEventListener("scroll", handleFloatingCTA, { passive: true });
    return () => window.removeEventListener("scroll", handleFloatingCTA);
  }, []);

  // Scroll to hash on initial load and when hash changes (e.g. Link to /#guild)
  useEffect(() => {
    const scrollToHash = (): void => {
      const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
      if (!hash) return;
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const timeoutId = setTimeout(scrollToHash, 100);
    window.addEventListener("hashchange", scrollToHash);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("hashchange", scrollToHash);
    };
  }, []);

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
            <Link
              href="/#the-gap"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              Why Us
            </Link>
            <Link
              href="/#roles"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              Roles
            </Link>
            <Link
              href="/#guild"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              Guild
            </Link>
            <Link
              href="/#how-it-works"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              Getting Started
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/#faq"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              FAQ
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
                  {/* CTA first — always visible without scrolling */}
                  <Link
                    href="/join/founder"
                    className="mb-3 bg-international-orange hover:bg-international-orange-hover text-white py-3.5 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] flex items-center justify-center"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Get Started Free
                  </Link>
                  {[
                    { href: "/#the-gap", label: "Why Us" },
                    { href: "/#roles", label: "Roles" },
                    { href: "/#guild", label: "Guild" },
                    { href: "/#how-it-works", label: "Getting Started" },
                    { href: "/#faq", label: "FAQ" },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="text-sm text-muted-foreground hover:text-foreground active:text-foreground uppercase tracking-wider py-3.5 min-h-[48px] flex items-center transition-colors border-b border-muted/50 last:border-b-0"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
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
        <SoftwareVsHardwareSection />
        <RolesSection />
        <GuildSection />
        <HowItWorksSection />
        <FactoryPartnerSection />
        <BuiltInBritainSection />
        <PricingPreviewSection />
        <FAQSection />
      </main>

      {/* ── Floating Mobile CTA — appears after scrolling past hero ── */}
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
              href="/#roles"
              className="flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white py-3 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] w-full"
            >
              Choose Your Path
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Footer ── */}
      {/* Extra bottom padding on mobile for floating CTA bar */}
      <footer className="py-10 sm:py-12 md:py-16 border-t border-muted bg-muted pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-12 md:pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-8">
            {/* Brand */}
            <div className="col-span-2">
              <p className="text-base sm:text-lg font-bold tracking-tight mb-2 sm:mb-3">
                FRACTIONAL FORGE
              </p>
              <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-2">
                Build hardware at software speed. A fraction of the cost. A
                fraction of the time. A fraction of the headcount.
              </p>
              <p className="text-xs font-mono uppercase tracking-widest text-international-orange">
                Proudly British. Globally Ambitious.
              </p>
            </div>

            {/* Links */}
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2 sm:mb-3">
                Platform
              </p>
              <div className="flex flex-col gap-1 sm:gap-2">
                <Link
                  href="/pricing"
                  className="text-sm text-muted-foreground hover:text-foreground active:text-foreground transition-colors min-h-[44px] flex items-center"
                >
                  Pricing
                </Link>
                <a
                  href={`${APP_DOMAIN}/login`}
                  className="text-sm text-muted-foreground hover:text-foreground active:text-foreground transition-colors min-h-[44px] flex items-center"
                >
                  Login
                </a>
                <Link
                  href="/join/founder"
                  className="text-sm text-muted-foreground hover:text-foreground active:text-foreground transition-colors min-h-[44px] flex items-center"
                >
                  Get Started Free
                </Link>
              </div>
            </div>

            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2 sm:mb-3">
                Roles
              </p>
              <div className="flex flex-col gap-1 sm:gap-2">
                <Link
                  href="/join/founder"
                  className="text-sm text-muted-foreground hover:text-foreground active:text-foreground transition-colors min-h-[44px] flex items-center"
                >
                  Founders
                </Link>
                <Link
                  href="/join/executive"
                  className="text-sm text-muted-foreground hover:text-foreground active:text-foreground transition-colors min-h-[44px] flex items-center"
                >
                  Executives
                </Link>
                <Link
                  href="/join/apprentice"
                  className="text-sm text-muted-foreground hover:text-foreground active:text-foreground transition-colors min-h-[44px] flex items-center"
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
              <span className="font-mono tracking-wider">
                Forged in Britain. Built for the World.
              </span>
            </div>
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
          <span className="text-international-orange text-xs font-mono uppercase tracking-widest">
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
          className="flex flex-col items-center gap-4 w-full sm:w-auto"
        >
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto">
            <motion.div whileHover={buttonHover} whileTap={buttonTap} className="w-full sm:w-auto">
              <Link
                href="/join/founder"
                className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-4 text-sm font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] w-full sm:w-auto"
              >
                Start as Founder
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
            <a
              href="#roles"
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm font-mono tracking-wider uppercase transition-colors min-h-[48px]"
            >
              Choose Your Path
              <ChevronDown className="h-4 w-4" />
            </a>
          </div>
        </motion.div>

        {/* Metrics strip — verifiable platform stats */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.6 }}
          className="mt-8 sm:mt-10 md:mt-14 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 max-w-3xl mx-auto"
        >
          {[
            { value: "78+", label: "Manufacturing Techniques" },
            { value: "100", label: "Founding Member Spots" },
            { value: "12", label: "Week Sprints" },
            { value: "£0", label: "Equity Given Up" },
          ].map((metric) => (
            <div key={metric.label} className="text-center">
              <p className="text-lg sm:text-2xl font-black text-international-orange">
                {metric.value}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-mono uppercase tracking-wider">
                {metric.label}
              </p>
            </div>
          ))}
        </motion.div>

        {/* Version line */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="mt-4 sm:mt-6 text-xs text-muted-foreground font-mono tracking-wider"
        >
          Forged in Britain. Shipping weekly. Shaped by founding members.
        </motion.p>
      </div>

      {/* Scroll indicator — visible on mobile, fades on scroll */}
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
      title: "Choose Your Role",
      description:
        "Are you a Founder launching a hardware company? An Executive with expertise to deploy? An Apprentice ready to learn? Pick your path and create your free account in under a minute.",
      cta: { label: "Choose Your Path", href: "#roles" },
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
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-international-orange text-white text-xs font-mono font-bold tracking-widest uppercase px-3 sm:px-4 py-1 rounded-full whitespace-nowrap">
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

        {/* Trust strip — compact confidence signals */}
        <div className="flex flex-wrap justify-center gap-x-6 sm:gap-x-8 gap-y-3 mb-8 sm:mb-10 text-sm text-muted-foreground">
          {[
            { icon: Shield, text: "Your IP, 100%" },
            { icon: UserCheck, text: "Verified Experts" },
            { icon: DollarSign, text: "No Equity Required" },
            { icon: CheckCircle2, text: "Cancel Anytime" },
          ].map((signal) => {
            const Icon = signal.icon;
            return (
              <div key={signal.text} className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-international-orange flex-shrink-0" />
                <span className="font-medium text-foreground">{signal.text}</span>
              </div>
            );
          })}
        </div>

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
      question: "How much does it actually cost?",
      answer:
        "The platform starts free. Paid plans start at £49/month for growing ventures. On top of the subscription, there's a 10% platform fee on marketplace transactions (manufacturing orders, retainer payments). No hidden fees. Cancel anytime.",
    },
    {
      question: "What's the difference between Founder, Executive, and Apprentice?",
      answer:
        "Founders bring vision and capital — they need hardware built. Executives are senior professionals who deploy their expertise fractionally across multiple ventures. Apprentices are ambitious early-career people who get paired with executives for structured mentorship while shipping real projects. Each role has its own signup path and experience inside the platform.",
    },
    {
      question: "How quickly can I go from idea to prototype?",
      answer:
        "Our structured sprints target 12 weeks from kick-off to validated prototype. Some simpler projects ship faster. The key is eliminating the months of hiring, onboarding, and team-building that typically precede any actual engineering work.",
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

