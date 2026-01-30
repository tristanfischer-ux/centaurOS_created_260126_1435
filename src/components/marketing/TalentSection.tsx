"use client";

import { GraduationCap } from "lucide-react";

export function TalentSection() {
    return (
        <section className="py-24 bg-[#FAFAF9] relative" id="guild">
            <div className="container mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
                <div>
                    <h2 className="text-gold font-mono text-international-orange uppercase tracking-widest text-sm mb-4">The Apprentice</h2>
                    <h3 className="text-4xl md:text-5xl font-display text-foreground mb-8 leading-tight">
                        THE NEW <br /> ACADEMICS.
                    </h3>
                    <div className="prose prose-lg text-muted-foreground font-sans font-light">
                        <p>
                            A Centaur is not a junior. A Centaur is a pilot.
                            We recruit the brightest young minds—top 1% of engineering talent—and train them to command AI tools that replace entire departments.
                        </p>
                        <p>
                            They don't write code; they architect systems. They don't push pixels; they design experiences.
                            Backed by our AI stack, a single Centaur delivers the output of a 5-person senior engineering pod.
                        </p>
                    </div>

                    <div className="mt-8 flex items-center space-x-4">
                        <div className="p-3 bg-background rounded-full shadow-sm">
                            <GraduationCap className="w-6 h-6 text-foreground" />
                        </div>
                        <div className="font-mono text-xs uppercase text-muted-foreground">
                            <div className="text-foreground font-bold">Centaur Academy Verified</div>
                            <div>Acceptance Rate: 0.8%</div>
                        </div>
                    </div>
                </div>

                {/* Visual / Image Placeholder */}
                <div className="aspect-square bg-muted relative overflow-hidden grayscale hover:grayscale-0 transition-all duration-700">
                    {/* Abstract visual of a bust or sleek "scholar" */}
                    <div className="absolute inset-0 bg-muted animate-pulse"></div>
                    <div className="absolute bottom-4 left-4 font-mono text-white text-xs z-10">
                        FIGURE: 04<br />CLASS: ARCHITECT
                    </div>
                </div>
            </div>
        </section>
    );
}
