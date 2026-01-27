"use client";

import Link from "next/link";

export function MarketingFooter() {
    return (
        <footer className="bg-white border-t border-slate-100 py-12">
            <div className="container mx-auto px-6 grid md:grid-cols-4 gap-8">
                <div className="col-span-1 md:col-span-2 space-y-4">
                    <div className="font-display text-xl font-bold tracking-widest">CENTAUR DYNAMICS</div>
                    <p className="font-sans text-slate-500 max-w-xs">
                        Build Faster. Burn Less. <br />
                        The first Operating Company for the AI Era.
                    </p>
                    <div className="text-xs font-mono text-slate-400 pt-8">
                        © 2026 Centaur Dynamics Ltd.
                    </div>
                </div>

                <div className="space-y-4">
                    <h4 className="font-mono text-xs uppercase text-slate-900 tracking-widest">Company</h4>
                    <div className="flex flex-col space-y-2 text-sm text-slate-600 font-sans">
                        <Link href="/about" className="hover:text-international-orange transition-colors">About</Link>
                        <Link href="/careers" className="hover:text-international-orange transition-colors">Manifesto</Link>
                        <Link href="/legal" className="hover:text-international-orange transition-colors">Legal</Link>
                    </div>
                </div>

                <div className="space-y-4">
                    <h4 className="font-mono text-xs uppercase text-slate-900 tracking-widest">Connect</h4>
                    <div className="flex flex-col space-y-2 text-sm text-slate-600 font-sans">
                        <Link href="mailto:hello@centaur.dynamics" className="hover:text-international-orange transition-colors">Contact</Link>
                        <Link href="https://twitter.com" className="hover:text-international-orange transition-colors">The Nexus</Link>
                        <Link href="/login" className="hover:text-international-orange transition-colors">Client Portal</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
