"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { motion } from "framer-motion";

export function HeroSection() {
    return (
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 bg-slate-900">
            {/* BACKGROUND - Dark with digital grid */}
            <div className="absolute inset-0 z-0">
                {/* Digital Grid Overlay */}
                <div className="absolute inset-0 opacity-[0.08]"
                    style={{
                        backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
                        backgroundSize: '60px 60px'
                    }}>
                </div>
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"></div>
            </div>

            {/* CONTENT */}
            <div className="container mx-auto px-6 relative z-10 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="max-w-5xl mx-auto space-y-8"
                >
                    {/* Status Badge */}
                    <div className="inline-flex items-center space-x-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 mb-6">
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                        <span className="text-xs font-mono uppercase tracking-widest text-white/80">System Online</span>
                    </div>

                    {/* Main Headline */}
                    <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-medium text-white leading-tight tracking-tight">
                        We build atoms at the <br />
                        <span className="text-international-orange">speed of bits.</span>
                    </h1>

                    {/* Subheadline */}
                    <p className="text-lg md:text-xl font-sans font-light text-slate-300 max-w-3xl mx-auto leading-relaxed">
                        &ldquo;Build hardware at software speed. A fraction of the cost. A fraction of the time. A fraction of the headcount.&rdquo;
                    </p>

                    {/* CTA Button */}
                    <div className="pt-8">
                        <Link href="/login">
                            <Button
                                size="lg"
                                className="bg-international-orange hover:bg-[#e03e00] text-white rounded-none px-10 py-6 text-lg tracking-widest font-mono shadow-xl shadow-orange-500/20 transition-all hover:scale-105"
                            >
                                [ Client Portal ]
                            </Button>
                        </Link>
                    </div>
                </motion.div>
            </div>

            {/* DECORATIVE OVERLAY ELEMENTS */}
            <div className="absolute bottom-10 left-10 font-mono text-xs text-slate-500 opacity-50 hidden md:block">
                CENTAUR DYNAMICS <br />
                THE MARBLE FOUNDRY
            </div>
            <div className="absolute bottom-10 right-10 font-mono text-xs text-slate-500 opacity-50 hidden md:block text-right">
                © 2026 Centaur Dynamics Ltd.
            </div>
        </section>
    );
}
