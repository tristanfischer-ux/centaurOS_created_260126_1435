"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

// Domain configuration
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'https://centauros.io';

export default function MarketingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="bg-background">
        <div className="max-w-7xl mx-auto px-6 py-4 md:py-6 flex items-center justify-between">
          <Link href="/" className="text-lg md:text-xl font-bold tracking-tight">
            CENTAUR DYNAMICS
          </Link>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#centaurs" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider">
              The Centaurs
            </a>
            <a href="#network" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider">
              The Network
            </a>
            <a href="#os" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider">
              The OS
            </a>
            <a href={`${APP_DOMAIN}/login`} className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider">
              Login
            </a>
          </div>

          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-muted-foreground hover:text-foreground"
            aria-label="Toggle menu"
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
          <div className="md:hidden border-t border bg-background">
            <div className="px-6 py-4 flex flex-col gap-4">
              <a 
                href="#centaurs" 
                className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                The Centaurs
              </a>
              <a 
                href="#network" 
                className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                The Network
              </a>
              <a 
                href="#os" 
                className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                The OS
              </a>
              <a 
                href={`${APP_DOMAIN}/login`}
                className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wider py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Login
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative md:min-h-screen flex flex-col md:flex-row items-center justify-center overflow-hidden bg-background">
        {/* Content */}
        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center pt-8 md:pt-0">
          {/* System Online Badge */}
          <div className="inline-flex items-center gap-2 mb-6 md:mb-8 px-4 py-2 border border-slate-200 bg-background/80 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-electric-blue" />
            <span className="text-electric-blue text-xs font-mono uppercase tracking-widest">
              System Online
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black leading-tight mb-6 md:mb-8">
            We build atoms at the{" "}
            <span className="text-electric-blue">speed of bits.</span>
          </h1>

          {/* Tagline */}
          <p className="text-foreground text-base md:text-xl max-w-3xl mx-auto leading-relaxed">
            &ldquo;Build hardware at software speed. A fraction of the cost. A fraction of the time. A fraction of the headcount.&rdquo;
          </p>
        </div>

        {/* Centaur Image - Inline on mobile, absolute on desktop */}
        <div className="relative w-full h-[50vh] md:absolute md:inset-0 md:h-auto">
          <Image
            src="/images/hero-centaur-main.png"
            alt="Centaur"
            fill
            className="object-contain object-center opacity-40"
            priority
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 100vw, 100vw"
          />
          {/* Gradient overlay to fade edges */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-background via-transparent to-background/80" />
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-background via-transparent to-background" />
        </div>
      </section>

      {/* THE CENTAURS Section */}
      <section id="centaurs" className="py-12 md:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-8 md:mb-16">THE CENTAURS.</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
            {/* Founders */}
            <div className="border border-slate-200 bg-background p-4 sm:p-6 md:p-8 flex flex-col">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border border-slate-200 relative overflow-hidden">
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
                <a
                  href={`${APP_DOMAIN}/login`}
                  className="flex-1 bg-muted hover:bg-secondary text-foreground py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors"
                >
                  Login
                </a>
                <Link
                  href="/join/founder"
                  className="flex-1 bg-foreground hover:bg-international-orange text-background py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors"
                >
                  Begin Induction
                </Link>
              </div>
            </div>

            {/* Executives */}
            <div className="border border-slate-200 bg-background p-4 sm:p-6 md:p-8 flex flex-col">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border border-slate-200 relative overflow-hidden">
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
                <a
                  href={`${APP_DOMAIN}/login`}
                  className="flex-1 bg-muted hover:bg-secondary text-foreground py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors"
                >
                  Login
                </a>
                <Link
                  href="/join/executive"
                  className="flex-1 bg-foreground hover:bg-international-orange text-background py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors"
                >
                  Join Cadre
                </Link>
              </div>
            </div>

            {/* Apprentices */}
            <div className="border border-slate-200 bg-background p-4 sm:p-6 md:p-8 flex flex-col sm:col-span-2 lg:col-span-1">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border border-slate-200 relative overflow-hidden">
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
              <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">THE DIGITAL BODY.</h3>
              <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                &ldquo;We equip you with the Centaur OS—a &apos;Digital Body&apos; multiplying your output tenfold. You aren&apos;t a junior. You are a Founder-in-Training.&rdquo;
              </p>
              {/* Action Buttons */}
              <div className="pt-4 md:pt-6 mt-4 border-t border-muted flex gap-2 md:gap-3">
                <a
                  href={`${APP_DOMAIN}/login`}
                  className="flex-1 bg-muted hover:bg-secondary text-foreground py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors"
                >
                  Login
                </a>
                <Link
                  href="/join/apprentice"
                  className="flex-1 bg-foreground hover:bg-international-orange text-background py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors"
                >
                  Enter Guild
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* THE NETWORK Section */}
      <section id="network" className="py-12 md:py-24 bg-background border-t border-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-8 md:mb-16">THE NETWORK.</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
            {/* VCs */}
            <div className="border border-slate-200 bg-background p-4 sm:p-6 md:p-8 flex flex-col">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border border-slate-200 relative overflow-hidden">
                <Image
                  src="/images/vc-dashboard.png"
                  alt="VCs"
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
              {/* Action Buttons */}
              <div className="pt-4 md:pt-6 mt-4 border-t border-muted flex gap-2 md:gap-3">
                <a
                  href={`${APP_DOMAIN}/login`}
                  className="flex-1 bg-muted hover:bg-secondary text-foreground py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors"
                >
                  Login
                </a>
                <Link
                  href="/join/vc"
                  className="flex-1 bg-foreground hover:bg-international-orange text-background py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors"
                >
                  Apply
                </Link>
              </div>
            </div>

            {/* Factories */}
            <div className="border border-slate-200 bg-background p-4 sm:p-6 md:p-8 flex flex-col">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border border-slate-200 relative overflow-hidden">
                <Image
                  src="/images/3d-printed-part.png"
                  alt="Factories"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">
                Manufacturing
              </span>
              <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">THE VIRTUAL FACTORY.</h3>
              <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                &ldquo;Monetize latent capacity. Connect your machines to Centaur OS. Receive pre-vetted, production-ready files: no sales friction, just print, ship, and bank.&rdquo;
              </p>
              {/* Action Buttons */}
              <div className="pt-4 md:pt-6 mt-4 border-t border-muted flex gap-2 md:gap-3">
                <a
                  href={`${APP_DOMAIN}/login`}
                  className="flex-1 bg-muted hover:bg-secondary text-foreground py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors"
                >
                  Login
                </a>
                <Link
                  href="/join/factory"
                  className="flex-1 bg-foreground hover:bg-international-orange text-background py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors"
                >
                  Connect
                </Link>
              </div>
            </div>

            {/* Universities */}
            <div className="border border-slate-200 bg-background p-4 sm:p-6 md:p-8 flex flex-col sm:col-span-2 lg:col-span-1">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border border-slate-200 relative overflow-hidden">
                <Image
                  src="/images/university-lab.png"
                  alt="Universities"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">
                Academia
              </span>
              <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">THE FOUNDER PIPELINE.</h3>
              <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                &ldquo;Universities are IP-rich but execution-constrained. We provide the commercialization engine to transform research into venture-backed startups and students into Centaur Apprentices.&rdquo;
              </p>
              {/* Action Buttons */}
              <div className="pt-4 md:pt-6 mt-4 border-t border-muted flex gap-2 md:gap-3">
                <a
                  href={`${APP_DOMAIN}/login`}
                  className="flex-1 bg-muted hover:bg-secondary text-foreground py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors"
                >
                  Login
                </a>
                <Link
                  href="/join/university"
                  className="flex-1 bg-foreground hover:bg-international-orange text-background py-2.5 md:py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors"
                >
                  Partner
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* THE OPERATING SYSTEM Section */}
      <section id="os" className="py-12 md:py-24 bg-background border-t border-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-8 md:mb-16">THE OPERATING SYSTEM.</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
            {/* The Entity */}
            <div className="border border-slate-200 bg-background p-4 sm:p-6 md:p-8 flex flex-col">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border border-slate-200 relative overflow-hidden">
                <Image
                  src="/images/hero-centaur-alt.png"
                  alt="The Entity"
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
            </div>

            {/* The System */}
            <div className="border border-slate-200 bg-background p-4 sm:p-6 md:p-8 flex flex-col">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border border-slate-200 relative overflow-hidden">
                <Image
                  src="/images/centaur-os-core.png"
                  alt="The System"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xs text-electric-blue font-mono uppercase tracking-widest mb-2">
                The System
              </span>
              <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">THE OPERATING SYSTEM.</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                &ldquo;The Hive Mind. Centaur OS coordinates Founders, Execs, and Apprentices. It grants the &apos;Digital Body&apos; instant access to AI Agents, global manufacturing, and Guild intelligence.&rdquo;
              </p>
            </div>

            {/* The Community */}
            <div className="border border-slate-200 bg-background p-4 sm:p-6 md:p-8 flex flex-col sm:col-span-2 lg:col-span-1">
              <div className="h-48 md:h-64 mb-4 md:mb-6 bg-muted border border-slate-200 relative overflow-hidden">
                <Image
                  src="/images/guild-workshop-new.png"
                  alt="The Community"
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
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 md:py-12 border-t border bg-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Centaur Dynamics Ltd. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
