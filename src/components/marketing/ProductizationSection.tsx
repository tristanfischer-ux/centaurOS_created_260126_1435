"use client";

import { Package, Truck, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";

const packs = [
    {
        icon: Package,
        title: "Startup Foundation",
        desc: "Pre-loaded modules for Incorporation, IP Assignment, and Equity management. Day 0 legal readiness.",
        color: "bg-blue-500",
    },
    {
        icon: Truck,
        title: "Supply Chain Alpha",
        desc: "Autonomous Sourcing agents, RFQ generation, and Logistics tracking. Global reach instantly.",
        color: "bg-orange-500",
    },
    {
        icon: ShieldCheck,
        title: "Regulatory Clearance",
        desc: "Compliance automations for OSHA, GDPR, and ISO standards. Safety as code.",
        color: "bg-green-500",
    },
];

export function ProductizationSection() {
    return (
        <section className="py-24 bg-slate-50 relative border-t border-slate-200" id="productization">
            <div className="container mx-auto px-6">
                <div className="max-w-4xl mx-auto mb-16 text-center space-y-4">
                    <h2 className="text-gold font-mono text-international-orange uppercase tracking-widest text-sm">Plug & Play</h2>
                    <h3 className="text-4xl md:text-5xl font-display text-slate-900">PRE-CONFIGURED VELOCITY.</h3>
                    <p className="text-xl text-slate-600 font-light max-w-2xl mx-auto">
                        We don't start from zero. Our Centaurs arrive with Agent Packs—pre-loaded AI modules for instant capability.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {packs.map((pack) => (
                        <div key={pack.title} className="group relative bg-white border border-slate-200 p-8 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                            {/* Cartridge Visual Top Bar */}
                            <div className={`absolute top-0 left-0 right-0 h-1.5 ${pack.color}`}></div>

                            <div className="mb-6 inline-flex p-3 bg-slate-50 rounded-lg group-hover:scale-110 transition-transform duration-300">
                                <pack.icon className="w-8 h-8 text-slate-900" strokeWidth={1.5} />
                            </div>

                            <h4 className="text-xl font-display font-bold text-slate-900 mb-3">{pack.title}</h4>
                            <p className="text-slate-600 font-sans leading-relaxed text-sm">
                                {pack.desc}
                            </p>

                            {/* Technical Markers */}
                            <div className="mt-8 pt-4 border-t border-slate-100 flex justify-between text-[10px] font-mono text-slate-400 uppercase">
                                <span>Ver 2.1.0</span>
                                <span>Ready</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
