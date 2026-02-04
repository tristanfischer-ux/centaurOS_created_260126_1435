"use client";

import { use, useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ArrowRight, ArrowLeft, TestTube2 } from "lucide-react";
import { signup, submitApplication } from "@/actions/signup";
import { getDemoAccountData, type DemoAccountData } from "@/actions/demo-accounts";

interface RoleConfig {
    title: string;
    headline: string;
    subheadline: string;
    description: string;
    benefits: string[];
    heroImage: string;
    ctaText: string;
    isApplication: boolean;
    additionalFields?: { id: string; label: string; placeholder: string; type?: string; required?: boolean }[];
}

const roleConfigs: Record<string, RoleConfig> = {
    founder: {
        title: "FOUNDER",
        headline: "YOUR VISION. OUR OPERATING SYSTEM.",
        subheadline: "Start with an idea. Launch with an army. Keep your equity.",
        description: "Don't burn seed capital on a standing army. Your fractional team—Executives who've built before and Apprentices with 10x output—activates in hours, not months.",
        benefits: [
            "Fractional Execs + high-output Apprentices",
            "Your team scales up and down on demand",
            "Global manufacturing at your fingertips",
            "Legal and IP fortress included"
        ],
        heroImage: "/images/founder-hologram.png",
        ctaText: "Begin Induction",
        isApplication: false,
        additionalFields: [
            { id: "company_name", label: "Company Name", placeholder: "Your startup name", required: true },
            { id: "industry", label: "Industry", placeholder: "Hardware, SaaS, DeepTech...", required: false },
            { id: "stage", label: "Stage", placeholder: "Pre-seed, Seed, Series A...", required: false }
        ]
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
        subheadline: "You're Founder-in-Training. Your 10x toolkit awaits.",
        description: "ForgeOS multiplies your output 10x. Ship real hardware in your first month. Learn from executives who've done it.",
        benefits: [
            "10x your output from day one",
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
    supplier: {
        title: "SUPPLIER",
        headline: "SELL ON THE MARKETPLACE.",
        subheadline: "List your products. Get discovered. Grow your business.",
        description: "Join our marketplace to reach hardware startups and builders. List your products, services, or capacity. Respond to RFQs, manage orders, and get paid—all from your dedicated Supplier Portal.",
        benefits: [
            "List unlimited products and services",
            "Respond to qualified RFQ opportunities",
            "Manage orders from one dashboard",
            "Get paid through secure escrow"
        ],
        heroImage: "/images/3d-printed-part.png",
        ctaText: "Start Selling",
        isApplication: false,
        additionalFields: [
            { id: "business_name", label: "Business Name", placeholder: "Your Company Ltd.", required: true },
            { id: "business_type", label: "What do you sell?", placeholder: "Products, Services, Manufacturing...", required: false }
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
        subheadline: "Connect your resources to ForgeOS.",
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
        title: "FORGE OS",
        headline: "BUILD ATOMS AT THE SPEED OF BITS.",
        subheadline: "The operating system for physical creation.",
        description: "Hardware at software speed. A fraction of the cost. A fraction of the time. A fraction of the headcount.",
        benefits: [
            "High-velocity workflows",
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
    const searchParams = useSearchParams();
    const [stage, setStage] = useState<"hook" | "transitioning" | "form">("hook");
    const [fadeToBlack, setFadeToBlack] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    
    // Demo mode state
    const isDemoMode = searchParams.get('demo') === 'true';
    const [demoData, setDemoData] = useState<DemoAccountData | null>(null);

    // Check if this role has a video (currently only founder)
    const hasVideo = roleKey === "founder";

    // Handle the cinematic transition
    const handleBeginInduction = () => {
        if (hasVideo) {
            setStage("transitioning");
            
            // After video expands (1s), fade to black
            setTimeout(() => {
                setFadeToBlack(true);
            }, 1000);
            
            // After fade to black completes (1s more), show form
            setTimeout(() => {
                setStage("form");
                setFadeToBlack(false);
            }, 2000);
        } else {
            setStage("form");
        }
    };

    // Fetch demo data if in demo mode
    useEffect(() => {
        if (isDemoMode) {
            getDemoAccountData(roleKey).then(data => {
                setDemoData(data);
            });
        }
    }, [isDemoMode, roleKey]);

    // Ensure video plays on mount
    useEffect(() => {
        if (videoRef.current && hasVideo) {
            videoRef.current.play().catch(() => {
                // Autoplay might be blocked, that's okay
            });
        }
    }, [hasVideo]);

    return (
        <div className="min-h-screen bg-slate-900 text-white overflow-hidden">
            {/* Video Transition Overlay - Shows during transition */}
            {hasVideo && stage === "transitioning" && (
                <div className="fixed inset-0 z-[100]">
                    <video
                        className="absolute inset-0 w-full h-full object-cover"
                        autoPlay
                        loop
                        muted
                        playsInline
                    >
                        <source src="/videos/founder-intro.mp4" type="video/mp4" />
                    </video>
                    {/* Fade to black overlay */}
                    <div 
                        className={`absolute inset-0 bg-black transition-opacity duration-1000 ${
                            fadeToBlack ? "opacity-100" : "opacity-0"
                        }`}
                    />
                </div>
            )}

            {/* Navigation - hide during transition */}
            <nav className={`absolute top-0 left-0 right-0 z-50 px-4 sm:px-6 py-4 sm:py-6 transition-opacity duration-500 ${
                stage === "transitioning" ? "opacity-0" : "opacity-100"
            }`}>
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <Link href="/" className="text-white/80 hover:text-white text-sm font-mono uppercase tracking-widest flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </Link>
                    <Link href="/login" className="text-white/60 hover:text-white text-sm font-mono uppercase tracking-widest">
                        Already a member? Login
                    </Link>
                </div>
            </nav>

            {stage === "hook" || stage === "transitioning" ? (
                /* Stage 1: The Hook */
                <div className={`min-h-screen flex flex-col justify-center transition-opacity duration-500 ${
                    stage === "transitioning" ? "opacity-0" : "opacity-100"
                }`}>
                    {/* Hero Video/Image Background */}
                    <div className="absolute inset-0 z-0">
                        {hasVideo ? (
                            <video
                                ref={videoRef}
                                className="absolute inset-0 w-full h-full object-cover opacity-40"
                                autoPlay
                                loop
                                muted
                                playsInline
                            >
                                <source src="/videos/founder-intro.mp4" type="video/mp4" />
                            </video>
                        ) : (
                            <Image
                                src={config.heroImage}
                                alt={config.title}
                                fill
                                className="object-cover opacity-20"
                                priority
                            />
                        )}
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
                            onClick={handleBeginInduction}
                            disabled={stage === "transitioning"}
                            className="group bg-white text-slate-900 px-8 sm:px-12 py-4 sm:py-5 text-sm sm:text-base font-bold tracking-widest uppercase hover:bg-international-orange hover:text-white transition-all duration-300 flex items-center gap-3 mb-8 sm:mb-10 disabled:opacity-50"
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
                    </div>
                </div>
            ) : (
                /* Stage 2: The Form */
                <div className="min-h-screen flex flex-col md:flex-row animate-in fade-in duration-1000">
                    {/* Left: Context with Video Background */}
                    <div className="w-full md:w-1/2 relative overflow-hidden bg-slate-900">
                        {hasVideo ? (
                            <video
                                className="absolute inset-0 w-full h-full object-cover opacity-50"
                                autoPlay
                                loop
                                muted
                                playsInline
                            >
                                <source src="/videos/founder-intro.mp4" type="video/mp4" />
                            </video>
                        ) : (
                            <Image
                                src={config.heroImage}
                                alt={config.title}
                                fill
                                className="object-cover opacity-30"
                            />
                        )}
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
                            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 sm:mb-6 leading-tight text-white">
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
                            {/* Demo Mode Banner */}
                            {isDemoMode && demoData && (
                                <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 flex items-start gap-3">
                                    <TestTube2 className="h-5 w-5 text-violet-600 mt-0.5 shrink-0" />
                                    <div>
                                        <h3 className="text-sm font-semibold text-violet-900 mb-1">Demo Mode Active</h3>
                                        <p className="text-xs text-violet-700">
                                            All fields are pre-populated with demo data. Just click "{config.ctaText}" to test the flow!
                                        </p>
                                    </div>
                                </div>
                            )}
                            
                            <div>
                                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                                    {config.isApplication ? "Apply for consideration" : "Create your account"}
                                </h2>
                                <p className="text-slate-600 mt-2 text-sm">
                                    {config.isApplication 
                                        ? "We review every application personally." 
                                        : "Enter your details to begin the induction."}
                                </p>
                            </div>

                            <form action={config.isApplication ? submitApplication : signup} className="space-y-4 sm:space-y-5">
                                <input type="hidden" name="role" value={roleKey} />
                                
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="text-sm font-medium text-slate-900">Full Name</Label>
                                    <Input
                                        id="name"
                                        name="name"
                                        placeholder="John Doe"
                                        defaultValue={demoData?.fullName || ""}
                                        className="bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-sm font-medium text-slate-900">Email</Label>
                                    <Input
                                        id="email"
                                        name="email"
                                        type="email"
                                        placeholder="you@example.com"
                                        defaultValue={demoData?.email || ""}
                                        className="bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                                        required
                                    />
                                </div>

                                {/* Additional fields for applications and founder details */}
                                {config.additionalFields?.map((field) => {
                                    // Map demo data to field IDs
                                    const demoValue = demoData ? (() => {
                                        switch(field.id) {
                                            case 'company_name': return demoData.companyName;
                                            case 'industry': return demoData.industry;
                                            case 'stage': return demoData.stage;
                                            case 'firm': return demoData.firm;
                                            case 'aum': return demoData.aum;
                                            case 'capabilities': return demoData.capabilities;
                                            case 'location': return demoData.location;
                                            case 'institution': return demoData.institution;
                                            case 'department': return demoData.department;
                                            default: return '';
                                        }
                                    })() : '';
                                    
                                    return (
                                        <div key={field.id} className="space-y-2">
                                            <Label htmlFor={field.id} className="text-sm font-medium text-slate-900">
                                                {field.label}
                                                {field.required && <span className="text-red-500 ml-1">*</span>}
                                            </Label>
                                            <Input
                                                id={field.id}
                                                name={field.id}
                                                type={field.type || "text"}
                                                placeholder={field.placeholder}
                                                defaultValue={demoValue}
                                                className="bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                                                required={field.required}
                                            />
                                        </div>
                                    );
                                })}

                                {!config.isApplication && (
                                    <div className="space-y-2">
                                        <Label htmlFor="password" className="text-sm font-medium text-slate-900">Password</Label>
                                        <Input
                                            id="password"
                                            name="password"
                                            type="password"
                                            placeholder="Create a strong password"
                                            defaultValue={demoData?.password || ""}
                                            className="bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                                            required
                                        />
                                    </div>
                                )}

                                <Button 
                                    type="submit"
                                    className="w-full bg-international-orange hover:bg-international-orange-hover text-white font-bold tracking-widest uppercase py-5 sm:py-6 h-auto text-sm transition-colors"
                                >
                                    {config.ctaText}
                                </Button>
                            </form>

                            <p className="text-xs text-center text-slate-500">
                                By {config.isApplication ? "applying" : "joining"}, you agree to our{" "}
                                <Link href="#" className="underline hover:text-slate-700">Terms of Service</Link>{" "}
                                and{" "}
                                <Link href="#" className="underline hover:text-slate-700">Privacy Policy</Link>.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
