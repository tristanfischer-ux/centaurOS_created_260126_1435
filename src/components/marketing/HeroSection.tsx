"use client";

import Image from "next/image";
import Link from "next/link";

export function HeroSection() {
    return (
        <section className="relative min-h-screen flex items-center justify-center bg-white overflow-hidden blueprint-grid">

            {/* Centaur Hero Visual - Original Asset */}
            <div className="absolute inset-0 z-0 flex items-center justify-center opacity-100 pointer-events-none mt-20">
                <Image
                    src="/images/centaur_no_stump.png"
                    alt="Centaur Diagram"
                    width={1100}
                    height={1100}
                    className="object-contain"
                    priority
                />
            </div>

            {/* Content */}
            <div className="relative z-10 max-w-5xl mx-auto px-6 text-center transform -translate-y-12">
                {/* Status Badge */}
                <div className="inline-flex items-center gap-2 mb-8 px-4 py-2 bg-white tech-border rounded-full shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-international-orange animate-pulse" />
                    <span className="text-blueprint/80 text-xs font-mono tracking-[0.2em] uppercase">
                        System Online
                    </span>
                </div>

                {/* Main Headline */}
                <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-slate-900 leading-[0.9] tracking-tight mb-8 font-sans">
                    We build atoms at the
                    <br />
                    <span className="text-blueprint">speed of bits.</span>
                </h1>

                {/* Tagline */}
                <p className="text-slate-600 text-lg md:text-xl font-light max-w-3xl mx-auto leading-relaxed mb-12 font-sans">
                    &ldquo;Build hardware at software speed. A fraction of the cost. A fraction of the time. A fraction of the headcount.&rdquo;
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Link
                        href="/login"
                        className="min-w-[160px] bg-slate-900 text-white px-8 py-4 text-xs font-mono tracking-widest uppercase hover:bg-slate-800 transition-all duration-300 shadow-lg border border-slate-900"
                    >
                        [ Login ]
                    </Link>
                    <Link
                        href="/join/general"
                        className="min-w-[160px] bg-white tech-border text-slate-900 px-8 py-4 text-xs font-mono tracking-widest uppercase hover:border-international-orange hover:text-international-orange transition-all duration-300"
                    >
                        Join Up
                    </Link>
                </div>
            </div>
        </section>
    );
}
