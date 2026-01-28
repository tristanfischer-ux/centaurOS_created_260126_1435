"use client";

import { Crown, Briefcase, Wrench } from "lucide-react";

const centaurs = [
    {
        icon: Crown,
        role: "FOUNDERS DECIDE",
        title: "RETAIN YOUR EQUITY.",
        description: "Don't burn seed capital on a standing army. Launch with a fractional team. Validate fast, risk less, and retain maximum equity at Series A.",
        color: "bg-amber-500",
    },
    {
        icon: Briefcase,
        role: "EXECUTIVES EVALUATE",
        title: "TRY BEFORE YOU FLY.",
        description: "Monetize elite expertise without the burnout. Join as a Fractional Executive to accelerate deep-tech startups. Then, invest in them or launch your own.",
        color: "bg-blue-500",
    },
    {
        icon: Wrench,
        role: "APPRENTICES DO",
        title: "THE DIGITAL BODY.",
        description: "We equip you with the Centaur OS—a 'Digital Body' multiplying your output tenfold. You aren't a junior. You are a Founder-in-Training.",
        color: "bg-green-500",
    },
];

export function BusinessModelSection() {
    return (
        <section className="py-24 bg-white relative overflow-hidden" id="centaurs">
            <div className="container mx-auto px-6">
                <div className="max-w-4xl mx-auto mb-16 text-center space-y-4">
                    <h2 className="text-4xl md:text-5xl font-display text-slate-900">THE CENTAURS.</h2>
                </div>

                <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    {centaurs.map((centaur) => (
                        <div key={centaur.title} className="group relative bg-slate-50 shadow-md p-8 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                            {/* Color accent bar */}
                            <div className={`absolute top-0 left-0 right-0 h-1.5 ${centaur.color}`}></div>

                            {/* Icon */}
                            <div className="mb-6 inline-flex p-3 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform duration-300">
                                <centaur.icon className="w-8 h-8 text-slate-900" strokeWidth={1.5} />
                            </div>

                            {/* Role Label */}
                            <div className="font-mono text-xs text-international-orange tracking-widest uppercase mb-2">
                                {centaur.role}
                            </div>

                            {/* Title */}
                            <h4 className="text-2xl font-display font-bold text-slate-900 mb-4">{centaur.title}</h4>

                            {/* Description */}
                            <p className="text-slate-600 font-sans leading-relaxed text-sm">
                                &ldquo;{centaur.description}&rdquo;
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
