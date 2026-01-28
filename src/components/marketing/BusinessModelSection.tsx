"use client";

const centaurs = [
    {
        label: "FOUNDERS DECIDE",
        title: "RETAIN YOUR EQUITY.",
        description: "Don't burn seed capital on a standing army. Launch with a fractional team. Validate fast, risk less, and retain maximum equity at Series A.",
        gradient: "from-amber-900/20 to-transparent",
    },
    {
        label: "EXECUTIVES EVALUATE", 
        title: "TRY BEFORE YOU FLY.",
        description: "Monetize elite expertise without the burnout. Join as a Fractional Executive to accelerate deep-tech startups. Then, invest in them or launch your own.",
        gradient: "from-blue-900/20 to-transparent",
    },
    {
        label: "APPRENTICES DO",
        title: "THE DIGITAL BODY.",
        description: "We equip you with the Centaur OS—a 'Digital Body' multiplying your output tenfold. You aren't a junior. You are a Founder-in-Training.",
        gradient: "from-emerald-900/20 to-transparent",
    },
];

export function BusinessModelSection() {
    return (
        <section id="centaurs" className="py-32 bg-white">
            <div className="max-w-7xl mx-auto px-6">
                {/* Section Title */}
                <h2 className="text-4xl md:text-5xl font-light text-black tracking-tight mb-20">
                    THE CENTAURS.
                </h2>

                {/* Cards Grid */}
                <div className="grid md:grid-cols-3 gap-8">
                    {centaurs.map((item, index) => (
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
