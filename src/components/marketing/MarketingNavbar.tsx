"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export function MarketingNavbar() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <nav
            className={cn(
                "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
                scrolled
                    ? "bg-white/90 backdrop-blur-md py-4 border-b border shadow-sm"
                    : "bg-transparent py-6"
            )}
        >
            <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
                {/* Logo */}
                <Link href="/" className="group flex items-center gap-2">
                    <div className="w-8 h-8 bg-foreground rounded-full flex items-center justify-center group-hover:bg-international-orange transition-colors">
                        <span className="text-background text-xs font-mono font-bold">C</span>
                    </div>
                    <span className="text-foreground text-sm font-bold tracking-[0.3em] uppercase group-hover:text-international-orange transition-colors">
                        CENTAUR DYNAMICS
                    </span>
                </Link>

                {/* Navigation Links */}
                <div className="hidden md:flex items-center gap-12">
                    <Link
                        href="#centaurs"
                        className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase hover:text-foreground transition-colors"
                    >
                        THE CENTAURS
                    </Link>
                    <Link
                        href="#network"
                        className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase hover:text-foreground transition-colors"
                    >
                        THE NETWORK
                    </Link>
                    <Link
                        href="#os"
                        className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase hover:text-foreground transition-colors"
                    >
                        THE OS
                    </Link>
                    <Link
                        href="/login"
                        className="bg-foreground text-background px-6 py-2 text-xs font-bold tracking-[0.2em] uppercase hover:bg-international-orange transition-colors"
                    >
                        LOGIN
                    </Link>
                </div>
            </div>
        </nav>
    );
}
