"use client";

import Link from "next/link";
import Image from "next/image";

const networkPartners = [
    {
        title: "VCS",
        subtitle: "MORE BETS. SAME FUND.",
        description: "\"Hardware usually kills returns with 12-month cycles. We shorten that to 12 weeks. Validate cheaper, kill failures faster, and place more winning bets.\"",
        image: "/images/network_more_bets.jpg",
        joinLink: "/join/network"
    },
    {
        title: "FACTORIES",
        subtitle: "THE VIRTUAL FACTORY.",
        description: "\"Monetize latent capacity. Connect your machines to Centaur OS. Receive pre-vetted, production-ready files: no sales friction, just print, ship, and bank.\"",
        image: "/images/lattice_structure.jpg",
        joinLink: "/join/network"
    },
    {
        title: "UNIVERSITIES",
        subtitle: "THE FOUNDER PIPELINE.",
        description: "\"Universities are IP-rich but execution-constrained. We provide the commercialization engine to transform research into venture-backed startups and students into Centaur Apprentices.\"",
        image: "/images/network_pipeline.jpg",
        joinLink: "/join/network"
    }
];

export function NetworkSection() {
    return (
        <section className="py-24 bg-white border-t border-slate-100" id="network">
            <div className="max-w-7xl mx-auto px-6">
                <div className="mb-16">
                    <span className="text-xs font-bold tracking-[0.3em] text-international-orange uppercase block mb-6 font-centaur-mono">
                        The Infrastructure
                    </span>
                    <h2 className="text-4xl md:text-5xl font-centaur font-medium text-slate-900 leading-tight mb-6">
                        THE GUILD NETWORK.
                    </h2>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {networkPartners.map((partner) => (
                        <div key={partner.title} className="group relative bg-white p-8 tech-border tech-border-b min-h-[500px] flex flex-col hover:shadow-lg transition-shadow duration-300">
                            {/* Image Container */}
                            <div className="h-48 mb-8 overflow-hidden bg-slate-50 tech-border relative p-4">
                                <Image
                                    src={partner.image}
                                    alt={partner.title}
                                    fill
                                    className="object-cover opacity-90 transition-transform duration-700 group-hover:scale-105"
                                />
                            </div>

                            {/* Content */}
                            <div className="flex-1">
                                <span className="text-xs font-centaur-mono font-bold text-international-orange tracking-widest mb-2 block">
                                    {partner.title}
                                </span>
                                <h3 className="text-2xl font-centaur font-semibold text-slate-900 mb-4">
                                    {partner.subtitle}
                                </h3>
                                <p className="text-slate-600 leading-relaxed text-sm mb-8 font-sans">
                                    {partner.description}
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="pt-8 border-t border-slate-100 flex gap-3 mt-auto">
                                <Link
                                    href="/login"
                                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-900 py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors"
                                >
                                    Login
                                </Link>
                                <Link
                                    href={partner.joinLink}
                                    className="flex-1 border border-slate-900 text-slate-900 py-3 text-center text-xs font-mono font-bold tracking-widest uppercase hover:bg-slate-900 hover:text-white transition-all"
                                >
                                    Join Up
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
