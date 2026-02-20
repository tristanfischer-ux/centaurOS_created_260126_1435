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
  ChevronDown,
  ArrowRight,
  Briefcase,
  Lightbulb,
  Hammer,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SoftwareVsHardwareSection } from "@/components/marketing/SoftwareVsHardwareSection";
import { CloudFactorySection } from "@/components/marketing/CloudFactorySection";
import { AudienceSection } from "@/components/marketing/AudienceSection";
import { BuiltInBritainSection } from "@/components/marketing/BuiltInBritainSection";

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
 * Marketing landing page — restructured around the "Cloud Factory" narrative.
 *
 * INTENT: The page follows a conversion-optimized arc:
 * Hero (hook) → Problem (mismatch) → Solution (Cloud Factory ecosystem) →
 * Who It's For (audience cards) → How It Works (3 steps) →
 * Trust Strip → FAQ + Final CTA → Footer
 *
 * DECISION: Cut from 9 sections to 7 to tighten the narrative. Removed
 * standalone Guild, Pricing Preview, and detailed Roles sections. The core
 * "Cloud Factory" / "AWS for Atoms" metaphor is now the throughline.
 */
export default function MarketingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setNavScrolled(window.scrollY > 20);
      if (mobileMenuOpen) setMobileMenuOpen(false);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [mobileMenuOpen]);

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

  const [showFloatingCTA, setShowFloatingCTA] = useState(false);
  useEffect(() => {
    const handleFloatingCTA = () => {
      setShowFloatingCTA(window.scrollY > window.innerHeight * 0.8);
    };
    window.addEventListener("scroll", handleFloatingCTA, { passive: true });
    return () => window.removeEventListener("scroll", handleFloatingCTA);
  }, []);

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
              The Problem
            </Link>
            <Link
              href="/#ecosystem"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              How We Solve It
            </Link>
            <Link
              href="/#who-its-for"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              Who It&apos;s For
            </Link>
            <Link
              href="/#how-it-works"
              className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
            >
              Getting Started
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
                    { href: "/#the-gap", label: "The Problem" },
                    { href: "/#ecosystem", label: "How We Solve It" },
                    { href: "/#who-its-for", label: "Who It's For" },
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
        <CloudFactorySection />
        <AudienceSection />
        <HowItWorksSection />
        <BuiltInBritainSection />
        <FinalCTASection />
        <FAQSection />
      </main>

      {/* ── Floating Mobile CTA ── */}
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

      {/* ── Footer ── */}
      <footer className="py-10 sm:py-12 md:py-16 border-t border-muted bg-muted pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-12 md:pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-8">
            <div className="col-span-2">
              <p className="text-base sm:text-lg font-bold tracking-tight mb-2 sm:mb-3">
                FRACTIONAL FORGE
              </p>
              <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-2">
                The Cloud Factory platform. Access expert teams, AI-enabled
                execution, and manufacturing capacity — without owning a factory.
              </p>
              <p className="text-xs font-mono uppercase tracking-widest text-international-orange">
                Forged in Britain. Built for the World.
              </p>
            </div>

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
                  href="/join"
                  className="text-sm text-muted-foreground hover:text-foreground active:text-foreground transition-colors min-h-[44px] flex items-center"
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
                  className="text-sm text-muted-foreground hover:text-foreground active:text-foreground transition-colors min-h-[44px] flex items-center"
                >
                  Founder
                </Link>
                <Link
                  href="/join?role=executive"
                  className="text-sm text-muted-foreground hover:text-foreground active:text-foreground transition-colors min-h-[44px] flex items-center"
                >
                  Expert / Factory
                </Link>
                <Link
                  href="/join?role=apprentice"
                  className="text-sm text-muted-foreground hover:text-foreground active:text-foreground transition-colors min-h-[44px] flex items-center"
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
 * "Hardware at Software Speed" — the Cloud Factory hook.
 * ════════════════════════════════════════════════════════════════════════ */

function HeroSection() {
  const isMobile = useIsMobile();
  const { scrollY } = useScroll();
  const parallaxY = useTransform(scrollY, [0, 500], [0, isMobile ? 0 : 150]);
  const [memberCount, setMemberCount] = useState<number | null>(null);

  useEffect(() => {
    async function fetchStats(): Promise<void> {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const res = await fetch("/api/marketing/stats", {
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (res.ok) {
          const data = await res.json();
          setMemberCount(data.foundingMembers ?? null);
        }
      } catch {
        // Graceful fallback — counter shows "Be the first" when null
      }
    }
    fetchStats();
  }, []);

  return (
    <section className="relative min-h-[85vh] sm:min-h-[90vh] md:min-h-screen flex items-center justify-center overflow-hidden bg-background pt-20 sm:pt-16">
      {/* Background image with parallax */}
      <motion.div
        style={{ y: parallaxY }}
        className="absolute inset-0 will-change-transform"
      >
        <Image
          src="/images/hero-cloud-factory.png"
          alt="Digital CAD designs transforming into manufactured hardware parts — the Cloud Factory concept"
          fill
          className="object-cover object-center opacity-20"
          priority
          sizes="100vw"
        />
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
          Hardware at{" "}
          <motion.span
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
            className="text-international-orange"
          >
            Software Speed.
          </motion.span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial="hidden"
          animate="visible"
          variants={heroTagline}
          className="text-foreground text-base sm:text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-6 sm:mb-8 md:mb-10"
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
            <motion.div whileHover={buttonHover} whileTap={buttonTap} className="w-full sm:w-auto">
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

        {/* Metrics strip */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.6 }}
          className="mt-8 sm:mt-10 md:mt-14 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 max-w-3xl mx-auto"
        >
          {[
            { value: "78+", label: "Manufacturing Techniques" },
            { value: "100", label: "Founding Member Spots" },
            { value: "12 wk", label: "Idea to Prototype" },
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
          The Cloud Factory Platform. Shipping weekly. Shaped by founding members.
        </motion.p>
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
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 5 — HOW IT WORKS
 * Three streamlined steps from signup to shipping.
 * ════════════════════════════════════════════════════════════════════════ */

function HowItWorksSection() {
  interface HowItWorksStep {
    number: string;
    icon: typeof Briefcase;
    title: string;
    description: string;
  }

  const STEPS: HowItWorksStep[] = [
    {
      number: "01",
      icon: Lightbulb,
      title: "Tell Us What You Need",
      description:
        "Describe your product, your expertise, or your capacity. Whether you're a founder with an idea, an expert with skills to deploy, or a factory with spare machines — start by telling us what you bring.",
    },
    {
      number: "02",
      icon: Briefcase,
      title: "We Assemble Your Team",
      description:
        "ForgeOS matches you with the right fractional experts, AI-enabled apprentices, and manufacturing partners. Your team is assembled in days, not months.",
    },
    {
      number: "03",
      icon: Hammer,
      title: "Build and Ship",
      description:
        "12-week sprints from idea to validated prototype. ForgeOS coordinates objectives, tasks, and RFQs across your entire team — so you move as fast as your ideas.",
    },
  ];

  return (
    <section
      id="how-it-works"
      className="py-12 sm:py-16 md:py-28 bg-background border-t border-muted scroll-mt-20"
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
            From signup to shipping — here&apos;s the path.
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
              </AnimatedCard>
            );
          })}
        </StaggerContainer>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * FINAL CTA — Move as Fast as Your Ideas
 * ════════════════════════════════════════════════════════════════════════ */

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
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 7 — FAQ
 * Handles objections and builds confidence.
 * ════════════════════════════════════════════════════════════════════════ */

function FAQSection() {
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
        "Our structured sprints target 12 weeks from kick-off to validated prototype. Some simpler projects ship faster. The key is eliminating the months of hiring, onboarding, and infrastructure setup that typically precede any actual engineering work.",
    },
    {
      question: "How much does it cost?",
      answer:
        "The platform starts free for early exploration. Paid plans are structured around your usage — team size, manufacturing orders, and AI-assisted execution. There's a transparent platform fee on marketplace transactions. No hidden fees, no equity required, cancel anytime. Full pricing details are on our pricing page.",
    },
  ] as const;

  return (
    <section id="faq" className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20">
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
  );
}
