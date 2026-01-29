"use client";

import Image from "next/image";

const osComponents = [
    {
        label: "THE ENTITY",
        title: "THE FIRM.",
        description: "The real-world manifestation of the system. We are the Operating Company (OpCo) that holds the contracts, manages the liability, and provides the legal fortress for the work to happen.",
        image: "/images/ecosystem-firm.png",
    },
    {
        label: "THE SYSTEM",
        title: "THE OPERATING SYSTEM.",
        description: "The Hive Mind. Centaur OS coordinates Founders, Execs, and Apprentices. It grants the 'Digital Body' instant access to AI Agents, global manufacturing, and Guild intelligence.",
        image: "/images/ecosystem-os.png",
    },
    {
        label: "THE COMMUNITY",
        title: "THE GUILD.",
        description: "Virtual connectivity, physical reality. The Guild is a network of collaborative workshops and digital spaces. It is the connective tissue that ensures knowledge scales as fast as the code.",
        image: "/images/ecosystem-guild.png",
    },
];

export function EcosystemSection() {
    return (
        <section id="os" className="py-32 bg-white">
            <div className="max-w-7xl mx-auto px-6">
                {/* Section Header */}
                <div className="mb-20 max-w-2xl">
                    <span className="text-xs font-bold tracking-[0.3em] text-international-orange uppercase block mb-6">
                        The Infrastructure
                    </span>
                    <h2 className="text-4xl md:text-5xl font-playfair font-medium text-slate-900 leading-tight mb-6">
                        THE OPERATING SYSTEM.
                    </h2>
                    <p className="text-lg text-slate-600 leading-relaxed font-light">
                        A unified stack for physical creation. From legal entities to neural networks.
                    </p>
                </div>

                {/* Cards Grid */}
                <div className="grid md:grid-cols-3 gap-8">
                    {osComponents.map((item, index) => (
                        <div
                            key={item.title}
                            className="group relative h-[600px] w-full bg-slate-900 overflow-hidden"
                        >
                            {/* Background Image */}
                            <Image
                                src={item.image}
                                alt={item.title}
                                fill
                                className="object-cover transition-transform duration-700 group-hover:scale-105 opacity-60 group-hover:opacity-80"
                            />

                            {/* Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/60 to-slate-900 opacity-90" />

                            {/* Content */}
                            <div className="absolute inset-0 p-10 flex flex-col justify-end">
                                <span className="text-xs font-bold tracking-[0.3em] text-international-orange uppercase block mb-4 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                                    {item.label}
                                </span>
                                <h3 className="text-3xl font-playfair font-medium text-white tracking-tight mb-4">
                                    {item.title}
                                </h3>
                                <p className="text-slate-300 leading-relaxed text-sm mb-6 max-w-sm">
                                    &ldquo;{item.description}&rdquo;
                                </p>

                                <div className="h-[1px] w-full bg-slate-700 mt-6 mb-6 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-700 origin-left" />

                                <div className="flex items-center gap-2 text-xs font-mono text-slate-500 uppercase tracking-widest">
                                    <span className="w-2 h-2 bg-international-orange rounded-full" />
                                    System Online
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
