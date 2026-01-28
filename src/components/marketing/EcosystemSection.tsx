"use client";

const osComponents = [
    {
        label: "THE ENTITY",
        title: "THE FIRM.",
        description: "The real-world manifestation of the system. We are the Operating Company (OpCo) that holds the contracts, manages the liability, and provides the legal fortress for the work to happen.",
        gradient: "from-slate-700/30 to-transparent",
    },
    {
        label: "THE SYSTEM",
        title: "THE OPERATING SYSTEM.",
        description: "The Hive Mind. Centaur OS coordinates Founders, Execs, and Apprentices. It grants the 'Digital Body' instant access to AI Agents, global manufacturing, and Guild intelligence.",
        gradient: "from-orange-900/20 to-transparent",
    },
    {
        label: "THE COMMUNITY",
        title: "THE GUILD.",
        description: "Virtual connectivity, physical reality. The Guild is a network of collaborative workshops and digital spaces. It is the connective tissue that ensures knowledge scales as fast as the code.",
        gradient: "from-amber-900/20 to-transparent",
    },
];

export function EcosystemSection() {
    return (
        <section id="os" className="py-32 bg-white">
            <div className="max-w-7xl mx-auto px-6">
                {/* Section Title */}
                <h2 className="text-4xl md:text-5xl font-light text-black tracking-tight mb-20">
                    THE OPERATING SYSTEM.
                </h2>

                {/* Cards Grid */}
                <div className="grid md:grid-cols-3 gap-8">
                    {osComponents.map((item, index) => (
                        <div 
                            key={index}
                            className="group relative bg-slate-50 rounded-lg overflow-hidden hover:shadow-xl transition-all duration-500"
                        >
                            {/* Image Placeholder with Gradient */}
                            <div className={`h-64 bg-gradient-to-b ${item.gradient} bg-slate-200 relative`}>
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-50 to-transparent" />
                            </div>
                            
                            {/* Content */}
                            <div className="p-8 -mt-16 relative">
                                <span className="text-xs font-medium tracking-[0.2em] text-slate-500 uppercase block mb-3">
                                    {item.label}
                                </span>
                                <h3 className="text-2xl font-semibold text-black tracking-tight mb-4">
                                    {item.title}
                                </h3>
                                <p className="text-slate-600 leading-relaxed">
                                    &ldquo;{item.description}&rdquo;
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
