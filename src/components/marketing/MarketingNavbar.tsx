"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export function MarketingNavbar() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 10);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <nav
            className={cn(
                "fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b",
                scrolled
                    ? "bg-white/80 backdrop-blur-md border-white/20 shadow-sm"
                    : "bg-transparent border-transparent"
            )}
        >
            <div className="container mx-auto px-6 h-20 flex items-center justify-between">
                {/* LOGO */}
                <Link href="/" className="group">
                    <span className="font-display text-xl font-bold tracking-[0.2em] text-slate-900 group-hover:text-international-orange transition-colors">
                        CENTAUR DYNAMICS
                    </span>
                </Link>

                {/* DESKTOP NAV */}
                <div className="hidden md:flex items-center space-x-8">
                    <NavLink href="#methodology">Methodology</NavLink>
                    <NavLink href="/guild">The Guild</NavLink>
                    <NavLink href="/objectives">CentaurOS</NavLink>

                    <Link href="/objectives">
                        <Button
                            variant="outline"
                            className="rounded-none border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white transition-all font-mono text-xs uppercase tracking-wider"
                        >
                            Client Login
                        </Button>
                    </Link>
                </div>
            </div>
        </nav>
    );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className="text-sm font-medium text-slate-600 hover:text-international-orange transition-colors uppercase tracking-widest font-sans"
        >
            {children}
        </Link>
    );
}
