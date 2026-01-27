"use client";

import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export function HeroSection() {
    return (
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
            {/* BACKGROUND SPLIT */}
            <div className="absolute inset-0 flex z-0">
                {/* LEFT: MARBLE (ATOMS) */}
                <div className="w-1/2 h-full bg-[#FAFAF9] relative overflow-hidden">
                    {/* Subtle Marble Vein simulation via CSS radial gradients could go here, 
                 or a placeholder image. Using noise for now. */}
                    <div className="absolute inset-0 opacity-10 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-multiply"></div>
                    <div className="absolute inset-0 bg-gradient-to-br from-transparent to-stone-200/50"></div>
                </div>

                {/* RIGHT: WIREFRAME (BITS) */}
                <div className="w-1/2 h-full bg-slate-50 relative overflow-hidden">
                    {/* Technical Blueprint Grid */}
                    <div className="absolute inset-0 opacity-[0.03]"
                        style={{
                            backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`,
                            backgroundSize: '40px 40px'
                        }}>
                    </div>
                    {/* Diagonal lines to suggest CNC path */}
                    <div className="absolute inset-0 opacity-[0.05] bg-[repeating-linear-gradient(45deg,#000_0,#000_1px,transparent_0,transparent_50%_,#000_1px)] bg-[length:10px_10px]"></div>
                </div>
            </div>

            {/* CONTENT */}
            <div className="container mx-auto px-6 relative z-10 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="max-w-5xl mx-auto space-y-8"
                >
                    <div className="inline-flex items-center space-x-2 bg-white/50 backdrop-blur-sm border border-slate-200 rounded-full px-4 py-1.5 mb-6">
                        <span className="w-2 h-2 rounded-full bg-international-orange animate-pulse"></span>
                        <span className="text-xs font-mono uppercase tracking-widest text-slate-600">Fractional Industrial Units Online</span>
                    </div>

                    <h1 className="text-6xl md:text-8xl font-display font-medium text-slate-900 leading-tight tracking-tight">
                        THE RENAISSANCE <br />
                        <span className="text-slate-400 font-light italic text-5xl md:text-7xl">of</span> INDUSTRY
                    </h1>

                    <p className="text-xl md:text-2xl font-sans font-light text-slate-600 max-w-2xl mx-auto leading-relaxed">
                        Industrial Scale. Startup Speed. <br />
                        We deploy fractional engineering units powered by AI to build atoms at the speed of bits.
                    </p>

                    <div className="flex flex-col md:flex-row items-center justify-center space-y-4 md:space-y-0 md:space-x-6 pt-8">
                        <Link href="/objectives">
                            <Button
                                size="lg"
                                className="bg-international-orange hover:bg-[#e03e00] text-white rounded-none px-8 py-6 text-lg tracking-widest font-mono shadow-xl shadow-orange-500/20 transition-all hover:scale-105"
                            >
                                DEPLOY A TEAM
                            </Button>
                        </Link>

                        <Link href="/guild" className="group flex items-center space-x-2 text-slate-900 hover:text-electric-blue transition-colors text-lg tracking-wider font-display font-medium">
                            <span>ENTER THE GUILD</span>
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>
                </motion.div>
            </div>

            {/* DECORATIVE OVERLAY ELEMENTS */}
            <div className="absolute bottom-10 left-10 font-mono text-xs text-slate-400 opacity-50 hidden md:block">
                COORD: 34.0522° N, 118.2437° W <br />
                STATUS: OPERATIONAL
            </div>
            <div className="absolute bottom-10 right-10 font-mono text-xs text-slate-400 opacity-50 hidden md:block text-right">
                CENTAUR DYNAMICS © 2026 <br />
                SYSTEM VER: 4.2.0
            </div>
        </section>
    );
}
