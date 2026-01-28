"use client";

import { TrendingUp, Factory, GraduationCap } from "lucide-react";

const network = [
    {
        icon: TrendingUp,
        role: "VCs",
        title: "MORE BETS. SAME FUND.",
        description: "Hardware usually kills returns with 12-month cycles. We shorten that to 12 weeks. Validate cheaper, kill failures faster, and place more winning bets.",
        color: "bg-emerald-500",
    },
    {
        icon: Factory,
        role: "FACTORIES",
        title: "THE VIRTUAL FACTORY.",
        description: "Monetize latent capacity. Connect your machines to Centaur OS. Receive pre-vetted, production-ready files: no sales friction, just print, ship, and bank.",
        color: "bg-purple-500",
    },
    {
        icon: GraduationCap,
        role: "UNIVERSITIES",
        title: "THE FOUNDER PIPELINE.",
        description: "Universities are IP-rich but execution-constrained. We provide the commercialization engine to transform research into venture-backed startups and students into Centaur Apprentices.",
        color: "bg-blue-500",
    },
];

export function ProductizationSection() {
    return (
        <section className="py-24 bg-slate-50 relative" id="network">
            <div className="container mx-auto px-6">
                <div className="max-w-4xl mx-auto mb-16 text-center space-y-4">
                    <h2 className="text-4xl md:text-5xl font-display text-slate-900">THE NETWORK.</h2>
                </div>

                <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    {network.map((item) => (
                        <div key={item.title} className="group relative bg-white shadow-md p-8 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                            {/* Color accent bar */}
                            <div className={`absolute top-0 left-0 right-0 h-1.5 ${item.color}`}></div>

                            {/* Icon */}
                            <div className="mb-6 inline-flex p-3 bg-slate-50 rounded-lg group-hover:scale-110 transition-transform duration-300">
                                <item.icon className="w-8 h-8 text-slate-900" strokeWidth={1.5} />
                            </div>

                            {/* Role Label */}
                            <div className="font-mono text-xs text-international-orange tracking-widest uppercase mb-2">
                                {item.role}
                            </div>

                            {/* Title */}
                            <h4 className="text-2xl font-display font-bold text-slate-900 mb-4">{item.title}</h4>

                            {/* Description */}
                            <p className="text-slate-600 font-sans leading-relaxed text-sm">
                                &ldquo;{item.description}&rdquo;
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
