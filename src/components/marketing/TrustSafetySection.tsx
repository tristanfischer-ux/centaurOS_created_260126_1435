"use client";

import { BadgeCheck } from "lucide-react";

export function TrustSafetySection() {
    return (
        <section className="py-24 bg-foreground text-background relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>

            <div className="container mx-auto px-6 text-center relative z-10">
                <div className="inline-flex items-center justify-center p-4 bg-white/10 rounded-full mb-8 backdrop-blur-md border border-white/10">
                    <BadgeCheck className="w-8 h-8 text-international-orange" />
                </div>

                <h2 className="text-4xl md:text-5xl font-display mb-6 tracking-tight">VERIFIED EXECUTION.</h2>

                <p className="text-xl md:text-2xl font-light text-muted-foreground max-w-3xl mx-auto mb-12">
                    Speed without safety is negligence. Every critical output is verified by a Senior Fractional Executive before it reaches you.
                    The 'Centaur Stamp' is our guarantee of quality.
                </p>

                <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto font-mono text-sm text-muted-foreground">
                    <div className="border border-white/10 p-4 pt-12 relative text-left">
                        <span className="absolute top-4 left-4 text-international-orange">01</span>
                        Code Audited by Senior Staff Engineers
                    </div>
                    <div className="border border-white/10 p-4 pt-12 relative text-left">
                        <span className="absolute top-4 left-4 text-international-orange">02</span>
                        Design Reviewed by Creative Directors
                    </div>
                    <div className="border border-white/10 p-4 pt-12 relative text-left">
                        <span className="absolute top-4 left-4 text-international-orange">03</span>
                        Strategy Approved by Ex-FAANG Product Leads
                    </div>
                </div>
            </div>
        </section>
    );
}
