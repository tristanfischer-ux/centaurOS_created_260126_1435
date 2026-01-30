"use client";

const network = [
    {
        label: "VCs",
        title: "MORE BETS. SAME FUND.",
        description: "Hardware usually kills returns with 12-month cycles. We shorten that to 12 weeks. Validate cheaper, kill failures faster, and place more winning bets.",
        gradient: "from-emerald-900/20 to-transparent",
    },
    {
        label: "FACTORIES",
        title: "THE VIRTUAL FACTORY.",
        description: "Monetize latent capacity. Connect your machines to Centaur OS. Receive pre-vetted, production-ready files: no sales friction, just print, ship, and bank.",
        gradient: "from-purple-900/20 to-transparent",
    },
    {
        label: "UNIVERSITIES",
        title: "THE FOUNDER PIPELINE.",
        description: "Universities are IP-rich but execution-constrained. We provide the commercialization engine to transform research into venture-backed startups and students into Centaur Apprentices.",
        gradient: "from-blue-900/20 to-transparent",
    },
];

export function ProductizationSection() {
    return (
        <section id="network" className="py-32 bg-muted">
            <div className="max-w-7xl mx-auto px-6">
                {/* Section Title */}
                <h2 className="text-4xl md:text-5xl font-light text-black tracking-tight mb-20">
                    THE NETWORK.
                </h2>

                {/* Cards Grid */}
                <div className="grid md:grid-cols-3 gap-8">
                    {network.map((item, index) => (
                        <div 
                            key={item.title}
                            className="group relative bg-background rounded-lg overflow-hidden hover:shadow-xl transition-all duration-500"
                        >
                            {/* Image Placeholder with Gradient */}
                            <div className={`h-64 bg-gradient-to-b ${item.gradient} bg-slate-200 relative`}>
                                <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent" />
                            </div>
                            
                            {/* Content */}
                            <div className="p-8 -mt-16 relative">
                                <span className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase block mb-3">
                                    {item.label}
                                </span>
                                <h3 className="text-2xl font-semibold text-black tracking-tight mb-4">
                                    {item.title}
                                </h3>
                                <p className="text-muted-foreground leading-relaxed">
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
