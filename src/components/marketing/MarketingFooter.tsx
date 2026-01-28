"use client";

import Link from "next/link";

export function MarketingFooter() {
    return (
        <footer className="bg-slate-900 py-16">
            <div className="container mx-auto px-6">
                <div className="flex flex-col items-center text-center space-y-6">
                    <div className="font-display text-xl font-bold tracking-widest text-white">CENTAUR DYNAMICS</div>
                    <p className="font-sans text-slate-400 max-w-xs">
                        Build Faster. Burn Less.
                    </p>
                    <div className="flex items-center space-x-6 text-sm text-slate-500 font-sans">
                        <Link href="#centaurs" className="hover:text-international-orange transition-colors">The Centaurs</Link>
                        <Link href="#network" className="hover:text-international-orange transition-colors">The Network</Link>
                        <Link href="#os" className="hover:text-international-orange transition-colors">The OS</Link>
                        <Link href="/login" className="hover:text-international-orange transition-colors">Login</Link>
                    </div>
                    <div className="text-xs font-mono text-slate-600 pt-8">
                        © 2026 Centaur Dynamics Ltd.
                    </div>
                </div>
            </div>
        </footer>
    );
}
