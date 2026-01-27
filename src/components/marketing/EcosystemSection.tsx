"use client";

export function EcosystemSection() {
    return (
        <section className="py-24 bg-white text-slate-900 border-t border-slate-200">
            <div className="container mx-auto px-6">
                <div className="grid md:grid-cols-3 gap-12 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                    {/* PILLAR 1 */}
                    <div className="px-4 text-center space-y-4 pt-8 md:pt-0">
                        <div className="font-mono text-xs text-international-orange tracking-widest uppercase mb-2">The Firm</div>
                        <h3 className="text-2xl font-display font-medium">CENTAUR DYNAMICS</h3>
                        <p className="text-slate-600 font-light leading-relaxed text-sm max-w-xs mx-auto">
                            We hold the contracts, liability, and equity. You interface with a single legal entity that guarantees delivery.
                        </p>
                    </div>

                    {/* PILLAR 2 */}
                    <div className="px-4 text-center space-y-4 pt-8 md:pt-0">
                        <div className="font-mono text-xs text-electric-blue tracking-widest uppercase mb-2">The Engine</div>
                        <h3 className="text-2xl font-display font-medium">CENTAUR OS</h3>
                        <p className="text-slate-600 font-light leading-relaxed text-sm max-w-xs mx-auto">
                            Our proprietary AI operating system that automates the 'Do' layer. Where bits become atoms.
                        </p>
                    </div>

                    {/* PILLAR 3 */}
                    <div className="px-4 text-center space-y-4 pt-8 md:pt-0">
                        <div className="font-mono text-xs text-slate-500 tracking-widest uppercase mb-2">The Union</div>
                        <h3 className="text-2xl font-display font-medium">THE CENTAUR GUILD</h3>
                        <p className="text-slate-600 font-light leading-relaxed text-sm max-w-xs mx-auto">
                            A private network of elite apprentices backed by veteran executives. The human soul in the machine.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
