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
                    ? "bg-black/90 backdrop-blur-md py-4"
                    : "bg-transparent py-6"
            )}
        >
            <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
                {/* Logo */}
                <Link href="/" className="group">
                    <span className="text-white text-sm font-bold tracking-[0.3em] uppercase">
                        CENTAUR DYNAMICS
                    </span>
                </Link>

                {/* Navigation Links */}
                <div className="hidden md:flex items-center gap-12">
                    <Link 
                        href="#centaurs" 
                        className="text-white/70 text-xs font-medium tracking-[0.2em] uppercase hover:text-white transition-colors"
                    >
                        THE CENTAURS
                    </Link>
                    <Link 
                        href="#network" 
                        className="text-white/70 text-xs font-medium tracking-[0.2em] uppercase hover:text-white transition-colors"
                    >
                        THE NETWORK
                    </Link>
                    <Link 
                        href="#os" 
                        className="text-white/70 text-xs font-medium tracking-[0.2em] uppercase hover:text-white transition-colors"
                    >
                        THE OS
                    </Link>
                    <Link 
                        href="/login"
                        className="text-white text-xs font-medium tracking-[0.2em] uppercase hover:text-white/70 transition-colors"
                    >
                        LOGIN
                    </Link>
                </div>
            </div>
        </nav>
    );
}
