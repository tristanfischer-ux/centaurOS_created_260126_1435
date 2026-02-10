"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
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
} from "@/components/marketing/animations";
import {
  CATEGORY_LABELS,
  TECHNIQUE_CATEGORIES,
  countByCategory,
  ALL_TECHNIQUES,
} from "@/lib/manufacturing-techniques";

// Domain configuration
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'https://centauros.io';

export default function MarketingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Skip Navigation - Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-accent-foreground focus:rounded-md"
      >
        Skip to main content
      </a>

      {/* Navigation */}
      <nav className="bg-background" aria-label="Main navigation">
        <div className="max-w-7xl mx-auto px-6 py-4 md:py-6 flex items-center justify-between">
          <Link href="/" className="text-lg md:text-xl font-bold tracking-tight">
            FRACTIONAL FORGE
          </Link>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#people" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors">
              The People
            </a>
            <a href="#network" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors">
              The Network
            </a>
            <a href="#capabilities" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors">
              Capabilities
            </a>
            <a href="#os" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors">
              The OS
            </a>
            <a href={`${APP_DOMAIN}/login`} className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors">
              Login
            </a>
          </div>

          {/* Mobile Hamburger Button */}
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
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-muted bg-background">
            <div className="px-6 py-4 flex flex-col gap-2">
              <a 
                href="#people" 
                className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider py-3 min-h-[44px] flex items-center transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                The People
              </a>
              <a 
                href="#network" 
                className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider py-3 min-h-[44px] flex items-center transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                The Network
              </a>
              <a 
                href="#capabilities" 
                className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider py-3 min-h-[44px] flex items-center transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Capabilities
              </a>
              <a 
                href="#os" 
                className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider py-3 min-h-[44px] flex items-center transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                The OS
              </a>
              <a 
                href={`${APP_DOMAIN}/login`}
                className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider py-3 min-h-[44px] flex items-center transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Login
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main id="main-content">
      {/* Hero Section */}
      <HeroSection />

      {/* People Section */}
      <section id="people" className="py-12 md:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <AnimatedHeader className="text-3xl sm:text-4xl md:text-5xl font-black mb-8 md:mb-16">
            THE PEOPLE.
          </AnimatedHeader>

          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
            {/* Founders */}
            <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden">
                <Image
                  src="/images/founder-hologram.png"
                  alt="Founders Decide"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">
                Founders Decide
              </span>
              <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">RETAIN YOUR EQUITY.</h3>
              <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                &ldquo;Don&apos;t burn seed capital on a standing army. Launch with a fractional team. Validate fast, risk less, and retain maximum equity at Series A.&rdquo;
              </p>
              {/* Action Buttons */}
              <div className="pt-4 md:pt-6 mt-4 border-t border-muted flex gap-2 md:gap-3">
                <motion.a
                  href={`${APP_DOMAIN}/login`}
                  whileHover={buttonHover}
                  whileTap={buttonTap}
                  className="flex-1 bg-muted hover:bg-secondary text-foreground py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Login
                </motion.a>
                <motion.div whileHover={buttonHover} whileTap={buttonTap} className="flex-1">
                  <Link
                    href="/join/founder"
                    className="block bg-foreground hover:bg-international-orange text-background py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Begin Induction
                  </Link>
                </motion.div>
              </div>
            </AnimatedCard>

            {/* Executives */}
            <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden">
                <Image
                  src="/images/executive-pilot.png"
                  alt="Executives Evaluate"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">
                Executives Evaluate
              </span>
              <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">TRY BEFORE YOU FLY.</h3>
              <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                &ldquo;Monetize elite expertise without the burnout. Join as a Fractional Executive to accelerate deep-tech startups. Then, invest in them or launch your own.&rdquo;
              </p>
              {/* Action Buttons */}
              <div className="pt-4 md:pt-6 mt-4 border-t border-muted flex gap-2 md:gap-3">
                <motion.a
                  href={`${APP_DOMAIN}/login`}
                  whileHover={buttonHover}
                  whileTap={buttonTap}
                  className="flex-1 bg-muted hover:bg-secondary text-foreground py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Login
                </motion.a>
                <motion.div whileHover={buttonHover} whileTap={buttonTap} className="flex-1">
                  <Link
                    href="/join/executive"
                    className="block bg-foreground hover:bg-international-orange text-background py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Join Cadre
                  </Link>
                </motion.div>
              </div>
            </AnimatedCard>

            {/* Apprentices */}
            <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col sm:col-span-2 lg:col-span-1">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden">
                <Image
                  src="/images/apprentice-engineer.png"
                  alt="Apprentices Do"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">
                Apprentices Do
              </span>
              <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">10X YOUR OUTPUT.</h3>
              <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                &ldquo;We pair you with a seasoned executive and teach you cutting-edge workflows, multiplying your output tenfold. You aren&apos;t a junior. You are a Founder-in-Training.&rdquo;
              </p>
              {/* Action Buttons */}
              <div className="pt-4 md:pt-6 mt-4 border-t border-muted flex gap-2 md:gap-3">
                <motion.a
                  href={`${APP_DOMAIN}/login`}
                  whileHover={buttonHover}
                  whileTap={buttonTap}
                  className="flex-1 bg-muted hover:bg-secondary text-foreground py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Login
                </motion.a>
                <motion.div whileHover={buttonHover} whileTap={buttonTap} className="flex-1">
                  <Link
                    href="/join/apprentice"
                    className="block bg-foreground hover:bg-international-orange text-background py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Enter Guild
                  </Link>
                </motion.div>
              </div>
            </AnimatedCard>
          </StaggerContainer>
        </div>
      </section>

      {/* THE NETWORK Section */}
      <section id="network" className="py-12 md:py-24 bg-background border-t border-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <AnimatedHeader className="text-3xl sm:text-4xl md:text-5xl font-black mb-8 md:mb-16">
            THE NETWORK.
          </AnimatedHeader>

          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
            {/* VCs */}
            <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden">
                <Image
                  src="/images/vc-dashboard.png"
                  alt="Venture capital portfolio dashboard showing startup metrics"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">
                Venture Capital
              </span>
              <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">MORE BETS. SAME FUND.</h3>
              <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                &ldquo;Hardware usually kills returns with 12-month cycles. We shorten that to 12 weeks. Validate cheaper, kill failures faster, and place more winning bets.&rdquo;
              </p>
              {/* Coming Soon */}
              <div className="pt-4 md:pt-6 mt-4 border-t border-muted flex justify-center">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-bold tracking-widest uppercase bg-muted text-muted-foreground">
                  Coming Soon
                </span>
              </div>
            </AnimatedCard>

            {/* Suppliers / Factories */}
            <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden">
                <Image
                  src="/images/3d-printed-part.png"
                  alt="Marketplace Suppliers"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">
                Marketplace Suppliers
              </span>
              <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">SELL YOUR PRODUCTS.</h3>
              <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                &ldquo;List products, services, or manufacturing capacity on our marketplace. Receive qualified orders, respond to RFQs, and grow your business. Zero sales overhead.&rdquo;
              </p>
              {/* Coming Soon */}
              <div className="pt-4 md:pt-6 mt-4 border-t border-muted flex justify-center">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-bold tracking-widest uppercase bg-muted text-muted-foreground">
                  Coming Soon
                </span>
              </div>
            </AnimatedCard>

            {/* Universities */}
            <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col sm:col-span-2 lg:col-span-1">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden">
                <Image
                  src="/images/university-lab.png"
                  alt="University research lab with advanced prototyping equipment"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">
                Academia
              </span>
              <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">THE FOUNDER PIPELINE.</h3>
              <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                &ldquo;Universities are IP-rich but execution-constrained. We provide the commercialization engine to transform research into venture-backed startups and students into Apprentices.&rdquo;
              </p>
              {/* Coming Soon */}
              <div className="pt-4 md:pt-6 mt-4 border-t border-muted flex justify-center">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-bold tracking-widest uppercase bg-muted text-muted-foreground">
                  Coming Soon
                </span>
              </div>
            </AnimatedCard>
          </StaggerContainer>
        </div>
      </section>

      {/* MANUFACTURING CAPABILITIES Section */}
      <ManufacturingCapabilitiesSection />

      {/* THE OPERATING SYSTEM Section */}
      <section id="os" className="py-12 md:py-24 bg-background border-t border-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <AnimatedHeader className="text-3xl sm:text-4xl md:text-5xl font-black mb-8 md:mb-16">
            THE OPERATING SYSTEM.
          </AnimatedHeader>

          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
            {/* The Entity */}
            <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden">
                <Image
                  src="/images/hero-centaur-alt.png"
                  alt="Fractional Forge operating company providing the legal and operational framework"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">
                The Entity
              </span>
              <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">THE FIRM.</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                &ldquo;The real-world manifestation of the system. We are the Operating Company (OpCo) that holds the contracts, manages the liability, and provides the legal fortress for the work to happen.&rdquo;
              </p>
            </AnimatedCard>

            {/* The System */}
            <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden">
                <Image
                  src="/images/centaur-os-core.png"
                  alt="ForgeOS platform interface coordinating teams and resources"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">
                The System
              </span>
              <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">THE OPERATING SYSTEM.</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                &ldquo;Our operating system coordinates Founders, Executives and Apprentices. It gives them access to a rich marketplace of additional experts and outsourced manufacturing capability.&rdquo;
              </p>
            </AnimatedCard>

            {/* The Community */}
            <AnimatedCard className="border bg-background p-4 sm:p-6 md:p-8 flex flex-col sm:col-span-2 lg:col-span-1">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border relative overflow-hidden">
                <Image
                  src="/images/guild-workshop-new.png"
                  alt="Guild workshop space where teams collaborate and build"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">
                The Community
              </span>
              <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">THE GUILD.</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                &ldquo;Virtual connectivity, physical reality. The Guild is a network of collaborative workshops and digital spaces. It is the connective tissue that ensures knowledge scales as fast as the code.&rdquo;
              </p>
            </AnimatedCard>
          </StaggerContainer>
        </div>
      </section>

      </main>

      {/* Footer */}
      <footer className="py-8 md:py-12 border-t border-muted bg-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Fractional Forge Ltd. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

/**
 * Hero Section with animated elements and parallax background.
 * 
 * @description Displays the main hero with badge, headline, tagline animations
 * and a parallax hero image background.
 */
function HeroSection() {
  const { scrollY } = useScroll();
  const parallaxY = useTransform(scrollY, [0, 500], [0, 150]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const heroImages = [
    {
      src: "/images/hero-robotic-steel.png",
      alt: "Robotic arm 3D printing steel structure"
    },
    {
      src: "/images/hero-titanium-printing.png",
      alt: "Titanium 3D printing system"
    },
    {
      src: "/images/hero-plastic-printing.png",
      alt: "Advanced polymer 3D printing farm"
    },
    {
      src: "/images/hero-injection-moulding.png",
      alt: "Clean injection moulding manufacturing"
    }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % heroImages.length);
    }, 5000); // Change image every 5 seconds

    return () => clearInterval(interval);
  }, [heroImages.length]);

  return (
    <section className="relative md:min-h-screen flex flex-col md:flex-row items-center justify-center overflow-hidden bg-background">
      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center pt-8 md:pt-0">
        {/* Early Access Badge - Animated */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInScale}
          className="inline-flex items-center gap-2 mb-6 md:mb-8 px-4 py-2 border bg-card"
        >
          <span className="w-2 h-2 rounded-full bg-international-orange animate-pulse" />
          <span className="text-international-orange text-xs font-mono uppercase tracking-widest">
            Early Access
          </span>
        </motion.div>

        {/* Main Headline - Animated */}
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
            className="text-electric-blue"
          >
            speed of bits.
          </motion.span>
        </motion.h1>

        {/* Tagline - Animated */}
        <motion.p
          initial="hidden"
          animate="visible"
          variants={heroTagline}
          className="text-foreground text-base md:text-xl max-w-3xl mx-auto leading-relaxed"
        >
          &ldquo;Build hardware at software speed. A fraction of the cost. A fraction of the time. A fraction of the headcount.&rdquo;
        </motion.p>

        {/* Version line */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="mt-4 md:mt-6 text-xs text-muted-foreground font-mono tracking-wider"
        >
          v0.9 &mdash; Shipping weekly. Shaped by founding members.
        </motion.p>
      </div>

      {/* Hero Image - Parallax effect on desktop */}
      <motion.div
        style={{ y: parallaxY }}
        className="relative w-full h-[50vh] md:absolute md:inset-0 md:h-auto will-change-transform"
      >
        <AnimatePresence>
          <motion.div
            key={currentImageIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
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
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 100vw, 100vw"
            />
          </motion.div>
        </AnimatePresence>
        
        {/* Gradient overlay to fade edges */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-background via-transparent to-background/80" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-background via-transparent to-background" />
      </motion.div>
    </section>
  );
}

/**
 * Manufacturing Capabilities section for the marketing landing page.
 *
 * @description Shows the breadth of manufacturing techniques accessible
 * through the platform, grouped by category with technique counts.
 * Includes a CTA to explore the full Techniques library.
 */
function ManufacturingCapabilitiesSection() {
  const categoryCounts = countByCategory()

  /** Subset of categories highlighted on the landing page */
  const HIGHLIGHT_CATEGORIES = [
    'additive',
    'subtractive',
    'forming',
    'casting',
    'joining',
    'composite',
    'electronics',
    'advanced',
  ] as const

  /** Short marketing blurbs per category */
  const CATEGORY_BLURBS: Record<string, string> = {
    additive: 'From FDM prototypes to metal-sintered flight parts — print what was once impossible.',
    subtractive: 'CNC milling, laser cutting, EDM wire — precision removal at any scale.',
    forming: 'Sheet metal, stamping, hydroforming — shape raw stock into production parts.',
    casting: 'Sand, investment, die-cast — pour metal into any geometry.',
    joining: 'Welding, brazing, adhesive bonding — assemble complex structures reliably.',
    composite: 'Carbon fibre, fibreglass, kevlar layups — lightweight strength where it matters.',
    electronics: 'PCB fab, SMT assembly, semiconductor packaging — from chip to board.',
    advanced: 'Nano-imprint, bio-printing, 4D printing — the frontier of making.',
  }

  return (
    <section
      id="capabilities"
      className="py-12 md:py-24 bg-background border-t border-muted"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedHeader className="text-3xl sm:text-4xl md:text-5xl font-black mb-4 md:mb-6">
          THE CAPABILITIES.
        </AnimatedHeader>

        <motion.p
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeInUp}
          className="text-muted-foreground text-sm md:text-base max-w-3xl mb-8 md:mb-16 leading-relaxed"
        >
          Access {ALL_TECHNIQUES.length}+ manufacturing techniques through
          our network. From rapid prototyping to full-scale production — every
          process, material, and finish you need to ship hardware.
        </motion.p>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {HIGHLIGHT_CATEGORIES.map((cat) => {
            const count = categoryCounts[cat] ?? 0
            return (
              <AnimatedCard
                key={cat}
                className="border bg-background p-4 sm:p-6 flex flex-col"
              >
                <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">
                  {CATEGORY_LABELS[cat]}
                </span>
                <h3 className="text-lg md:text-xl font-bold mb-2">
                  {count} Techniques
                </h3>
                <p className="text-muted-foreground text-xs leading-relaxed flex-1">
                  {CATEGORY_BLURBS[cat]}
                </p>
              </AnimatedCard>
            )
          })}
        </StaggerContainer>

        {/* CTA - Removed as requested */}

      </div>
    </section>
  )
}
