"use client";

import { Building, Cpu, Users } from "lucide-react";

const osComponents = [
    {
        icon: Building,
        role: "THE ENTITY",
        title: "THE FIRM.",
        description: "The real-world manifestation of the system. We are the Operating Company (OpCo) that holds the contracts, manages the liability, and provides the legal fortress for the work to happen.",
        color: "bg-slate-700",
    },
    {
        icon: Cpu,
        role: "THE SYSTEM",
        title: "THE OPERATING SYSTEM.",
        description: "The Hive Mind. Centaur OS coordinates Founders, Execs, and Apprentices. It grants the 'Digital Body' instant access to AI Agents, global manufacturing, and Guild intelligence.",
        color: "bg-international-orange",
    },
    {
        icon: Users,
        role: "THE COMMUNITY",
        title: "THE GUILD.",
        description: "Virtual connectivity, physical reality. The Guild is a network of collaborative workshops and digital spaces. It is the connective tissue that ensures knowledge scales as fast as the code.",
        color: "bg-amber-500",
    },
];

export function EcosystemSection() {
    return (
        <section className="py-24 bg-white text-slate-900" id="os">
            <div className="container mx-auto px-6">
                <div className="max-w-4xl mx-auto mb-16 text-center space-y-4">
                    <h2 className="text-4xl md:text-5xl font-display text-slate-900">THE OPERATING SYSTEM.</h2>
                </div>

                <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    {osComponents.map((item) => (
                        <div key={item.title} className="group relative bg-slate-50 shadow-md p-8 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                            {/* Color accent bar */}
                            <div className={`absolute top-0 left-0 right-0 h-1.5 ${item.color}`}></div>

                            {/* Icon */}
                            <div className="mb-6 inline-flex p-3 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform duration-300">
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
