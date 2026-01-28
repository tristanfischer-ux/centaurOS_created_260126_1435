"use client";

import Link from "next/link";

export function HeroSection() {
    return (
        <section className="relative min-h-screen flex items-center justify-center bg-[#0a0a0a] overflow-hidden">
            {/* Background Grid Pattern */}
            <div 
                className="absolute inset-0 opacity-[0.15]"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
                    `,
                    backgroundSize: '100px 100px'
                }}
            />
            
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0a0a0a]" />

            {/* Content */}
            <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
                {/* Status Badge */}
                <div className="inline-flex items-center gap-2 mb-12">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-white/60 text-xs font-mono tracking-[0.2em] uppercase">
                        System Online
                    </span>
                </div>

                {/* Main Headline */}
                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-light text-white leading-[1.1] tracking-tight mb-8">
                    We build atoms at the
                    <br />
                    <span className="text-white">speed of bits.</span>
                </h1>

                {/* Tagline */}
                <p className="text-white/50 text-lg md:text-xl font-light max-w-3xl mx-auto leading-relaxed mb-12">
                    &ldquo;Build hardware at software speed. A fraction of the cost. A fraction of the time. A fraction of the headcount.&rdquo;
                </p>

                {/* CTA Button */}
                <Link 
                    href="/login"
                    className="inline-block border border-white/30 text-white px-8 py-4 text-sm tracking-[0.15em] uppercase hover:bg-white hover:text-black transition-all duration-300"
                >
                    [ Client Portal ]
                </Link>
            </div>
        </section>
    );
}
