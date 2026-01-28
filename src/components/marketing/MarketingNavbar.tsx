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
                    ? "bg-white/95 backdrop-blur-md border-slate-200 shadow-sm"
                    : "bg-transparent border-transparent"
            )}
        >
            <div className="container mx-auto px-6 h-20 flex items-center justify-between">
                {/* LOGO */}
                <Link href="/" className="group">
                    <span className={cn(
                        "font-display text-xl font-bold tracking-[0.2em] transition-colors",
                        scrolled 
                            ? "text-slate-900 group-hover:text-international-orange" 
                            : "text-white group-hover:text-international-orange"
                    )}>
                        CENTAUR DYNAMICS
                    </span>
                </Link>

                {/* DESKTOP NAV */}
                <div className="hidden md:flex items-center space-x-8">
                    <NavLink href="#centaurs" scrolled={scrolled}>THE CENTAURS</NavLink>
                    <NavLink href="#network" scrolled={scrolled}>THE NETWORK</NavLink>
                    <NavLink href="#os" scrolled={scrolled}>THE OS</NavLink>

                    <Link href="/login">
                        <Button
                            variant="outline"
                            className={cn(
                                "rounded-none transition-all font-mono text-xs uppercase tracking-wider",
                                scrolled
                                    ? "bg-slate-900 text-white hover:bg-slate-800 border-transparent"
                                    : "bg-white/10 text-white hover:bg-white hover:text-slate-900 border-transparent"
                            )}
                        >
                            LOGIN
                        </Button>
                    </Link>
                </div>
            </div>
        </nav>
    );
}

function NavLink({ href, children, scrolled }: { href: string; children: React.ReactNode; scrolled: boolean }) {
    return (
        <Link
            href={href}
            className={cn(
                "text-sm font-medium hover:text-international-orange transition-colors uppercase tracking-widest font-sans",
                scrolled ? "text-slate-600" : "text-white/80"
            )}
        >
            {children}
        </Link>
    );
}
