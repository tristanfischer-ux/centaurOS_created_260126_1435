"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ArrowRight, ArrowLeft } from "lucide-react";
import { signup, submitApplication } from "@/actions/signup";
import { MarketplacePreviewSection, PreviewSkeleton } from "@/components/marketing/MarketplacePreviewSection";

interface RoleConfig {
    title: string;
    headline: string;
    subheadline: string;
    description: string;
    benefits: string[];
    heroImage: string;
    ctaText: string;
    isApplication: boolean; // true for network partners
    additionalFields?: { id: string; label: string; placeholder: string; type?: string }[];
}

const roleConfigs: Record<string, RoleConfig> = {
    founder: {
        title: "FOUNDER",
        headline: "YOUR VISION. OUR OPERATING SYSTEM.",
        subheadline: "Start with an idea. Launch with an army. Keep your equity.",
        description: "Don't burn seed capital on a standing army. Your fractional team—Executives who've built before and Apprentices with 10x AI-amplified output—activates in hours, not months.",
        benefits: [
            "Fractional Execs + AI-amplified Apprentices",
            "Your team scales up and down on demand",
            "Global manufacturing at your fingertips",
            "Legal and IP fortress included"
        ],
        heroImage: "/images/founder-hologram.png",
        ctaText: "Begin Induction",
        isApplication: false
    },
    executive: {
        title: "EXECUTIVE",
        headline: "YOUR EXPERTISE IS UNDERPRICED.",
        subheadline: "Deploy your skills where they matter. Build a portfolio of ventures.",
        description: "Politics steals 60% of your output. We give it back. Work with multiple startups, not one bureaucracy. No admin. Pure strategy. Real upside potential.",
        benefits: [
            "Work with multiple ventures simultaneously",
            "Equity opportunities as relationships develop",
            "No politics, no bureaucracy",
            "Choose your engagement level"
        ],
        heroImage: "/images/executive-pilot.png",
        ctaText: "Join the Cadre",
        isApplication: false
    },
    apprentice: {
        title: "APPRENTICE",
        headline: "YOU'RE NOT JUNIOR.",
        subheadline: "You're Founder-in-Training. Your Digital Body awaits.",
        description: "The Centaur OS gives you Your Digital Body—a 10x multiplier on your output. Ship real hardware in your first month. Learn from executives who've done it.",
        benefits: [
            "10x your output with Your Digital Body",
            "Ship real hardware in month one",
            "Direct mentorship from fractional execs",
            "Fast-track to the Founder track"
        ],
        heroImage: "/images/apprentice-engineer.png",
        ctaText: "Enter the Guild",
        isApplication: false
    },
    vc: {
        title: "VENTURE CAPITAL",
        headline: "12 MONTHS → 12 WEEKS.",
        subheadline: "Hardware at software speed. More bets. Better returns.",
        description: "Hardware typically has long validation cycles. We're building infrastructure to compress that timeline—helping founders validate faster and VCs deploy capital more efficiently.",
        benefits: [
            "Access to hardware startups moving faster",
            "Transparent milestone tracking system",
            "Infrastructure to reduce validation time",
            "Network of fractional executives and makers"
        ],
        heroImage: "/images/vc-dashboard.png",
        ctaText: "Apply for Access",
        isApplication: true,
        additionalFields: [
            { id: "firm", label: "Firm Name", placeholder: "Acme Ventures" },
            { id: "aum", label: "AUM Range", placeholder: "$10M - $50M" }
        ]
    },
    factory: {
        title: "MANUFACTURING",
        headline: "CAPACITY IS CURRENCY.",
        subheadline: "Pre-funded orders. Guaranteed payment. Zero invoicing friction.",
        description: "Connect to hardware startups with money already in escrow. Every order is pre-funded—you get paid automatically when you ship. No quotes. No invoicing. No payment risk.",
        benefits: [
            "Every order is pre-funded in escrow",
            "Automatic payment on delivery confirmation",
            "Zero payment risk - money held before you start",
            "No invoicing, no chasing payments"
        ],
        heroImage: "/images/3d-printed-part.png",
        ctaText: "Connect Facility",
        isApplication: true,
        additionalFields: [
            { id: "facility", label: "Facility Name", placeholder: "Precision Manufacturing Co." },
            { id: "capabilities", label: "Capabilities", placeholder: "CNC, 3D Printing, Sheet Metal..." }
        ]
    },
    university: {
        title: "ACADEMIA",
        headline: "FROM PAPER TO PRODUCT.",
        subheadline: "Professors become founders. Students become Apprentices. Research becomes revenue.",
        description: "We provide the commercialization pathway for academic research. Professors can lead their own ventures. Students gain real startup experience or launch companies. Your institution gets the infrastructure to turn IP into thriving businesses.",
        benefits: [
            "Professors lead their own venture-backed companies",
            "Students become Apprentices or post-grad founders",
            "Turn research IP into commercial products",
            "Infrastructure for university venture units"
        ],
        heroImage: "/images/university-lab.png",
        ctaText: "Partner With Us",
        isApplication: true,
        additionalFields: [
            { id: "institution", label: "Institution", placeholder: "MIT, Stanford..." },
            { id: "department", label: "Department/School", placeholder: "Engineering, Business..." }
        ]
    },
    network: {
        title: "NETWORK PARTNER",
        headline: "JOIN THE GRID.",
        subheadline: "Connect your resources to the Centaur OS.",
        description: "Manufacturing, logistics, communications—connect your physical or digital infrastructure to the network. Consistent deal flow. Automated everything.",
        benefits: [
            "Consistent deal flow",
            "Automated contracting",
            "Global reach",
            "Standardized integration"
        ],
        heroImage: "/images/centaur-os-core.png",
        ctaText: "Apply to Network",
        isApplication: true
    },
    general: {
        title: "CENTAUR OS",
        headline: "BUILD ATOMS AT THE SPEED OF BITS.",
        subheadline: "The operating system for physical creation.",
        description: "Hardware at software speed. A fraction of the cost. A fraction of the time. A fraction of the headcount.",
        benefits: [
            "AI-native workflow",
            "Global manufacturing network",
            "Distributed industrial complex",
            "Scale from Day 1"
        ],
        heroImage: "/images/hero-centaur-main.png",
        ctaText: "Get Started",
        isApplication: false
    }
};

export default function JoinPage({ params }: { params: Promise<{ role: string }> }) {
    const resolvedParams = use(params);
    const roleKey = resolvedParams.role.toLowerCase();
    const config = roleConfigs[roleKey] || roleConfigs["general"];
    const [stage, setStage] = useState<"hook" | "form">("hook");
    const [marketplaceListings, setMarketplaceListings] = useState<any[]>([]);
    const [isLoadingListings, setIsLoadingListings] = useState(true);
    const [bookingIntent, setBookingIntent] = useState<{ intent: string; listing_id?: string } | null>(null);

    // Fetch marketplace preview listings
    useEffect(() => {
        async function fetchPreview() {
            try {
                setIsLoadingListings(true);
                const response = await fetch(`/api/marketplace/preview?role=${roleKey}`);
                const data = await response.json();
                setMarketplaceListings(data.listings || []);
            } catch (error) {
                console.error('Failed to fetch marketplace preview:', error);
            } finally {
                setIsLoadingListings(false);
            }
        }

        fetchPreview();
    }, [roleKey]);

    const handleBookClick = (listingId: string) => {
        setBookingIntent({ intent: 'book_listing', listing_id: listingId });
        setStage("form");
    };

    return (
        <div className="min-h-screen bg-slate-900 text-white">
            {/* Navigation */}
            <nav className="absolute top-0 left-0 right-0 z-50 px-4 sm:px-6 py-4 sm:py-6">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <Link href="/" className="text-white/80 hover:text-white text-sm font-mono uppercase tracking-widest flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </Link>
                    <Link href="/login" className="text-white/60 hover:text-white text-sm font-mono uppercase tracking-widest">
                        Already a Centaur? Login
                    </Link>
                </div>
            </nav>

            {stage === "hook" ? (
                /* Stage 1: The Hook */
                <div className="min-h-screen flex flex-col justify-center">
                    {/* Hero Image Background */}
                    <div className="absolute inset-0 z-0">
                        <Image
                            src={config.heroImage}
                            alt={config.title}
                            fill
                            className="object-cover opacity-20"
                            priority
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-slate-900/60" />
                    </div>

                    {/* Content */}
                    <div className="relative z-10 flex flex-col items-center px-4 sm:px-6 text-center pt-20 pb-8">
                        {/* Protocol Badge */}
                        <div className="inline-flex items-center gap-2 mb-4 sm:mb-6 px-3 sm:px-4 py-2 border border-blue-500/30 bg-blue-500/10 backdrop-blur-sm">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            <span className="text-blue-400 text-xs font-mono uppercase tracking-widest">
                                Induction Protocol: {config.title}
                            </span>
                        </div>

                        {/* Main Headline */}
                        <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-black leading-tight mb-3 sm:mb-4 max-w-4xl">
                            {config.headline}
                        </h1>

                        {/* Subheadline */}
                        <p className="text-lg sm:text-xl md:text-2xl text-white/70 mb-6 sm:mb-8 max-w-2xl leading-relaxed">
                            {config.subheadline}
                        </p>

                        {/* CTA Button */}
                        <button
                            onClick={() => setStage("form")}
                            className="group bg-white text-slate-900 px-8 sm:px-12 py-4 sm:py-5 text-sm sm:text-base font-bold tracking-widest uppercase hover:bg-blue-500 hover:text-white transition-all duration-300 flex items-center gap-3 mb-8 sm:mb-10"
                        >
                            {config.ctaText}
                            <ArrowRight className="w-4 sm:w-5 h-4 sm:h-5 group-hover:translate-x-1 transition-transform" />
                        </button>

                        {/* What You Become - Inline */}
                        <div className="w-full max-w-4xl border-t border-white/10 pt-6 sm:pt-8">
                            <h2 className="text-xs font-mono uppercase tracking-widest text-white/40 mb-4 text-center">What You Become</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 md:gap-12 max-w-3xl mx-auto">
                                {config.benefits.map((benefit, index) => (
                                    <div key={index} className="flex items-start gap-3 justify-center sm:justify-start">
                                        <div className="mt-0.5 w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                                            <Check className="w-3 h-3 text-blue-400" />
                                        </div>
                                        <span className="text-white/80 text-sm">{benefit}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Marketplace Preview Section */}
                        {isLoadingListings ? (
                            <PreviewSkeleton />
                        ) : (
                            <MarketplacePreviewSection 
                                listings={marketplaceListings} 
                                onBookClick={handleBookClick}
                            />
                        )}
                    </div>
                </div>
            ) : (
                /* Stage 2: The Form */
                <div className="min-h-screen flex flex-col md:flex-row">
                    {/* Left: Context */}
                    <div className="w-full md:w-1/2 relative overflow-hidden">
                        <Image
                            src={config.heroImage}
                            alt={config.title}
                            fill
                            className="object-cover opacity-30"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-900/70" />
                        <div className="relative z-10 p-6 sm:p-8 md:p-12 lg:p-16 flex flex-col justify-center min-h-[40vh] md:min-h-screen">
                            <button
                                onClick={() => setStage("hook")}
                                className="text-white/60 hover:text-white text-sm font-mono uppercase tracking-widest flex items-center gap-2 mb-6 sm:mb-8"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back
                            </button>
                            <span className="text-xs font-mono text-blue-400 tracking-widest mb-3 sm:mb-4 block uppercase">
                                {config.isApplication ? "Application" : "Induction"}: {config.title}
                            </span>
                            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 sm:mb-6 leading-tight">
                                {config.headline}
                            </h2>
                            <p className="text-white/60 text-sm sm:text-base leading-relaxed max-w-md">
                                {config.description}
                            </p>
                        </div>
                    </div>

                    {/* Right: Form */}
                    <div className="w-full md:w-1/2 bg-white text-slate-900 p-6 sm:p-8 md:p-12 lg:p-16 flex flex-col justify-center">
                        <div className="w-full max-w-md mx-auto space-y-6 sm:space-y-8">
                            <div>
                                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                                    {config.isApplication ? "Apply for consideration" : "Create your account"}
                                </h2>
                                <p className="text-slate-500 mt-2 text-sm">
                                    {config.isApplication 
                                        ? "We review every application personally." 
                                        : "Enter your details to begin the induction."}
                                </p>
                            </div>

                            <form action={config.isApplication ? submitApplication : signup} className="space-y-4 sm:space-y-5">
                                <input type="hidden" name="role" value={roleKey} />
                                {bookingIntent && (
                                    <>
                                        <input type="hidden" name="intent" value={bookingIntent.intent} />
                                        {bookingIntent.listing_id && (
                                            <input type="hidden" name="listing_id" value={bookingIntent.listing_id} />
                                        )}
                                    </>
                                )}
                                
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="text-sm font-medium text-slate-700">Full Name</Label>
                                    <Input
                                        id="name"
                                        name="name"
                                        placeholder="John Doe"
                                        className="bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500 h-11 sm:h-12"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-sm font-medium text-slate-700">Email</Label>
                                    <Input
                                        id="email"
                                        name="email"
                                        type="email"
                                        placeholder="you@example.com"
                                        className="bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500 h-11 sm:h-12"
                                        required
                                    />
                                </div>

                                {/* Additional fields for applications */}
                                {config.additionalFields?.map((field) => (
                                    <div key={field.id} className="space-y-2">
                                        <Label htmlFor={field.id} className="text-sm font-medium text-slate-700">{field.label}</Label>
                                        <Input
                                            id={field.id}
                                            name={field.id}
                                            type={field.type || "text"}
                                            placeholder={field.placeholder}
                                            className="bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500 h-11 sm:h-12"
                                        />
                                    </div>
                                ))}

                                {!config.isApplication && (
                                    <div className="space-y-2">
                                        <Label htmlFor="password" className="text-sm font-medium text-slate-700">Password</Label>
                                        <Input
                                            id="password"
                                            name="password"
                                            type="password"
                                            placeholder="Create a strong password"
                                            className="bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500 h-11 sm:h-12"
                                            required
                                        />
                                    </div>
                                )}

                                <Button 
                                    type="submit"
                                    className="w-full bg-slate-900 hover:bg-blue-600 text-white font-bold tracking-widest uppercase py-5 sm:py-6 h-auto text-sm transition-colors"
                                >
                                    {config.ctaText}
                                </Button>
                            </form>

                            <p className="text-xs text-center text-slate-400">
                                By {config.isApplication ? "applying" : "joining"}, you agree to our{" "}
                                <Link href="#" className="underline hover:text-slate-900">Terms of Service</Link>{" "}
                                and{" "}
                                <Link href="#" className="underline hover:text-slate-900">Privacy Policy</Link>.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
